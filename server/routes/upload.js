// server/routes/upload.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "uploads"),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

let sseClients = [];

router.get("/progress-sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

function broadcastProgressUpdate(progressState) {
  const data = JSON.stringify(progressState);
  sseClients.forEach(client => client.write(`data: ${data}\n\n`));
}

router.post("/", upload.single("video"), async (req, res) => {

  if (!req.file) {
    console.log("[SERVER ERROR] No file uploaded or multer failed.");
    return res.status(400).json({ message: "업로드된 파일이 없습니다." });
  }
  const filename = req.file.originalname;
  const filePath = req.file.path;

  broadcastProgressUpdate({ step: 0, message: "업로드 완료, 파일 정보 분석 중...", done: false, percent: 0 });

  let videoInfo = { // 기본 구조 초기화
    filename: filename,
    duration: null,
    video_codec: null,
    audio_codec: null,
    width: null,
    height: null,
    bit_rate: null
  };

  try {
    const metadata = await getVideoMetadata(filePath);
    let videoStream = null;
    let audioStream = null;

    if (metadata && metadata.streams && Array.isArray(metadata.streams)) {
      videoStream = metadata.streams.find(s => s.codec_type === "video");
      audioStream = metadata.streams.find(s => s.codec_type === "audio");
    }

    // 각 필드 추출 및 로깅
    if (metadata && metadata.format && metadata.format.duration) {
      videoInfo.duration = parseFloat(metadata.format.duration);
    } else {
      console.log(`[VIDEO_INFO_PARSED] Duration: Not found in metadata.format.duration`);
    }

    if (videoStream) {
      videoInfo.video_codec = videoStream.codec_long_name || videoStream.codec_name || null;
      videoInfo.width = videoStream.width || null;
      videoInfo.height = videoStream.height || null;
    } else {
      console.log(`[VIDEO_INFO_PARSED] Video Stream: Not found or missing codec/resolution info.`);
    }

    if (audioStream) {
      videoInfo.audio_codec = audioStream.codec_long_name || audioStream.codec_name || null;
    } else {
      console.log(`[VIDEO_INFO_PARSED] Audio Stream: Not found or missing codec info.`);
    }

    if (metadata && metadata.format && metadata.format.bit_rate) {
      videoInfo.bit_rate = parseInt(metadata.format.bit_rate, 10);
    } else {
      console.log(`[VIDEO_INFO_PARSED] Bit Rate: Not found in metadata.format.bit_rate`);
    }

    broadcastProgressUpdate({ step: 0, message: "업로드 완료, 처리 대기 중...", done: false, percent: 0 });
    res.json({ message: "업로드 완료", filename: filename, videoInfo: videoInfo });

  } catch (error) {
    broadcastProgressUpdate({ step: 0, message: "업로드 완료 (메타데이터 분석 실패), 처리 대기 중...", done: false, percent: 0, error: true });
    // 오류 시에도 videoInfo 객체는 (대부분 null 값으로 채워진) 기본 구조로 전달됨
    res.json({ message: "업로드 완료 (메타데이터 분석 실패)", filename: filename, videoInfo: videoInfo });
  }
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const importanceWeightFromSlider = req.query.importanceWeight;
  const topRatioFromClient = req.query.topRatio; // <-- New parameter

  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips");
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");

  let processedFrames_initial = 0;
  let totalFrames_initial = 0;
  let processedFrames_transnet = 0;
  let totalFrames_transnet = 0;

  if (!fs.existsSync(inputPath)) {
    const errorState = { step: 0, message: "❌ 원본 영상을 찾을 수 없습니다.", done: true, percent: 0, error: true };
    broadcastProgressUpdate(errorState);
    return res.status(404).json({ message: "원본 영상을 찾을 수 없습니다.", path: inputPath });
  }

  const progressState = { step: 0, message: "파이프라인 시작 중...", done: false, percent: 0, filename: filename };
  broadcastProgressUpdate(progressState);

  // Importance Weight (for highlight vs story focus)
  let pythonImportanceWeight;
  if (importanceWeightFromSlider !== undefined) {
    const parsedWeight = parseFloat(importanceWeightFromSlider);
    if (!isNaN(parsedWeight) && parsedWeight >= 0 && parsedWeight <= 1) {
      // Python script's importance_weight: 0 for general/story, 1 for highlight
      // JS slider: 0 for highlight, 1 for story
      // So, pythonImportanceWeight = 1 - parsedWeight
      pythonImportanceWeight = parseFloat((1 - parsedWeight).toFixed(2)); // Invert and fix decimals
    } else {
      pythonImportanceWeight = 0.5; // Default if parse fails (Python script might have its own default like 0.8)
      console.warn(`잘못된 importanceWeight 값 수신: ${importanceWeightFromSlider}. 기본값 ${pythonImportanceWeight}(Python) 사용.`);
    }
  } else {
    pythonImportanceWeight = 0.5; // Default if not provided
    console.warn(`importanceWeight 값이 전달되지 않았습니다. 기본값 ${pythonImportanceWeight}(Python) 사용.`);
  }

  let pythonTopRatio = 0.2;
  if (topRatioFromClient !== undefined) {
    const parsedRatio = parseFloat(topRatioFromClient);
    if (!isNaN(parsedRatio) && parsedRatio > 0 && parsedRatio <= 1.0) {
      pythonTopRatio = parsedRatio;
    } else {
      console.warn(`잘못된 topRatio 값 수신: ${topRatioFromClient}. 기본값 ${pythonTopRatio}(Python) 사용.`);
    }
  } else {
    console.warn(`topRatio 값이 전달되지 않았습니다. 기본값 ${pythonTopRatio}(Python) 사용.`);
  }

  const pipelineArgs = [
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu",
    "--importance_weight", pythonImportanceWeight.toString(),
    "--top_ratio", pythonTopRatio.toString()
  ];

  console.log("Spawning pipeline with args:", ["conda", "run", "-n", "mrhisum", "--live-stream", "python", "-u", ...pipelineArgs].join(" "));
  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u",
    ...pipelineArgs
  ], { env: { ...process.env } });

  let stdoutBuffer = "";

  pipeline.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.substring(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);

      if (!line) continue;
      let updated = false;

      if (line.includes("프레임 특징") || line.includes("[1/6]")) {
        progressState.step = 1;
        progressState.message = "🎬 특징 추출 중...";
        updated = true;
      } else if (line.includes("TransNetV2") || line.includes("장면 분할")) {
        progressState.step = 2;
        progressState.message = "🎬 장면 분할 중...";
        updated = true;
      } else if (line.includes("[2/6]")) { // Note: Python script step 2 is Audio
        progressState.step = 3;
        progressState.message = "🔊 오디오 추출 중...";
        progressState.percent = Math.max(progressState.percent, 60);
        updated = true;
      } else if (line.includes("[3/6]")) { // Python script step 3 is Whisper
        progressState.step = 4;
        progressState.message = "🧠 문장 추출 중...";
        progressState.percent = Math.max(progressState.percent, 65);
        updated = true;
      } else if (line.includes("[4/6]")) { // Python script step 4 is PGL-SUM (AI Analysis)
        progressState.step = 5;
        progressState.message = "🎯 AI 분석 중...";
        progressState.percent = Math.max(progressState.percent, 80);
        updated = true;
      } else if (line.includes("[6/6]") && !line.includes("기존 파일 발견")) { // Python script step 6 is Video Gen
        progressState.step = 6;
        progressState.message = "🎞️ 요약 영상 생성 중...";
        progressState.percent = Math.max(progressState.percent, 85);
        updated = true;
      } else if (line.includes("✅ 파이프라인 완료!")) {
        progressState.percent = 100;
        progressState.message = "✅ 요약 영상 생성 완료!";
        progressState.done = true;
        updated = true;
      }

      const frameMatch1 = line.match(/📸 처리 중\.\.\.\s*(\d+)\/(\d+) 프레임/);
      if (progressState.step === 1 && frameMatch1) {
        processedFrames_initial = parseInt(frameMatch1[1], 10);
        totalFrames_initial = parseInt(frameMatch1[2], 10);
        if (totalFrames_initial > 0) {
          const percent = Math.floor(25 * (processedFrames_initial / totalFrames_initial));
          progressState.percent = Math.max(0, Math.min(percent, 25));
          progressState.message = `🎬 특징 추출 중... (${processedFrames_initial}/${totalFrames_initial} 프레임)`;
          updated = true;
        }
      }

      const frameMatch2 = line.match(/\[TransNetV2\] Processing video frames (\d+)\/(\d+)/);
      if (progressState.step === 2 && frameMatch2) {
        processedFrames_transnet = parseInt(frameMatch2[1], 10);
        totalFrames_transnet = parseInt(frameMatch2[2], 10);
        if (totalFrames_transnet > 0) {
          const percent = 25 + Math.floor(35 * (processedFrames_transnet / totalFrames_transnet));
          progressState.percent = Math.max(25, Math.min(percent, 60));
          progressState.message = `🎬 장면 분할 중... (${processedFrames_transnet}/${totalFrames_transnet} 프레임)`;
          updated = true;
        }
      }

      if (updated) {
        broadcastProgressUpdate(progressState);
      }
    }
  });

  pipeline.stderr.on("data", data => {
    const errorText = data.toString().trim();
    console.error("PYTHON STDERR:", errorText);
  });

  pipeline.on("close", code => {
    console.log(`파이프라인 종료 코드: ${code}`);
    if (stdoutBuffer.trim()) {
      console.log("PYTHON STDOUT (남은 버퍼):", stdoutBuffer.trim());
    }

    if (code !== 0) {
      progressState.done = true;
      progressState.error = true;
      progressState.message = `❌ 처리 실패 (종료 코드: ${code})`;
      broadcastProgressUpdate(progressState);
      if (!res.headersSent) {
        return res.status(500).json({ message: "파이프라인 처리 실패", code: code });
      }
    } else {
      if (!progressState.done) { // If "✅ 파이프라인 완료!" was missed
        progressState.percent = 100;
        progressState.message = "✅ 요약 영상 생성 완료!";
        progressState.done = true;
        broadcastProgressUpdate(progressState);
      }
      if (!res.headersSent) {
        res.json({ message: "요약 완료", filename: filename });
      }
    }
  });

  pipeline.on("error", (err) => {
    console.error('파이프라인 실행 에러:', err);
    progressState.done = true;
    progressState.error = true;
    progressState.message = `❌ 실행 오류: ${err.message}`;
    broadcastProgressUpdate(progressState);
    if (!res.headersSent) {
      res.status(500).json({ message: "파이프라인 실행 오류", error: err.message });
    }
  });
});

function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobeArgs = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath
    ];

    execFile("ffprobe", ffprobeArgs, (error, stdout, stderr) => {
      if (error) {
        console.error("-------------------- FFPROBE ERROR --------------------");
        console.error("[FFPROBE] Error object:", error);
        console.error("[FFPROBE] Stderr:", stderr);
        console.error("-----------------------------------------------------");
        return reject(new Error(`ffprobe execution failed: ${stderr || error.message}`));
      }
      try {
        const parsedOutput = JSON.parse(stdout);
        resolve(parsedOutput);
      } catch (parseError) {
        console.error("----------------- FFPROBE JSON PARSE ERROR -----------------");
        console.error("[FFPROBE] JSON parse error:", parseError);
        console.error("[FFPROBE] Failed to parse stdout (first 1000 chars):", stdout.substring(0, 1000));
        console.error("----------------------------------------------------------");
        reject(new Error(`Failed to parse ffprobe output: ${parseError.message}`));
      }
    });
  });
}

router.post("/update-highlights", (req, res) => {

  const { filename, segments } = req.body;

  if (!filename || !segments) {
    return res.status(400).json({ message: "파일명 또는 segments 누락" });
  }

  const baseName = filename.split('.').slice(0, -1).join('.');
  const jsonPath = path.join(__dirname, "..", "..", "clips", `highlight_${baseName}.json`);

  // JSON 저장
  fs.writeFile(jsonPath, JSON.stringify({
    segments,
    updated_at: new Date().toISOString()
  }, null, 2), async (err) => {
    if (err) {
      console.error("숏폼 JSON 저장 실패:", err);
      return res.status(500).json({ message: "파일 저장 실패" });
    }

    // 영상 재생성 - Python 모듈 호출
    const videoModulePath = path.resolve(__dirname, "..", "..", "src", "video_module.py");
    const uploadsDir = path.resolve(__dirname, "..", "uploads");
    const clipsDir = path.resolve(__dirname, "..", "..", "clips");
    const videoPath = path.join(uploadsDir, filename);

    // 원본 영상 파일 존재 확인
    if (!fs.existsSync(videoPath)) {
      console.error("원본 영상이 존재하지 않습니다:", videoPath);
      return res.status(404).json({ message: "원본 영상 파일 없음" });
    }

    const regenerate = spawn("conda", [
      "run", "-n", "mrhisum", "--live-stream", "python", "-u",
      videoModulePath,
      videoPath,
      jsonPath
    ]);

    let error = '';
    let output = '';

    regenerate.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
    });

    regenerate.stderr.on("data", (data) => {
      error += data.toString();
      console.error("VIDEO MODULE ERR:", data.toString());
    });

    regenerate.on("close", (code) => {
      if (code !== 0) {
        console.error("비디오 재생성 실패:", error);
        return res.status(500).json({
          message: "하이라이트 재생성 실패",
          error: error
        });
      }

      // 생성된 영상 파일 확인
      const outputVideoPath = path.join(clipsDir, `highlight_${baseName}.mp4`);
      if (!fs.existsSync(outputVideoPath)) {
        return res.status(500).json({
          message: "하이라이트 영상 생성 실패: 파일이 존재하지 않음",
          output: output
        });
      }

      return res.json({
        message: "하이라이트 업데이트 성공",
        video_path: `/clips/highlight_${baseName}.mp4?${Date.now()}`, // 캐시 방지용 타임스탬프
        segments_count: segments.length
      });
    });
  });
});

module.exports = router;