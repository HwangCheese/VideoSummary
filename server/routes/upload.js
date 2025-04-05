// routes/upload.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

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

router.post("/", upload.single("video"), (req, res) => {
  const filename = req.file.originalname;
  res.json({ message: "업로드 완료", filename });
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips");

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ message: "파일 없음", path: inputPath });
  }

  const progressState = { step: 0, message: "시작 중...", done: false, percent: 0 };
  broadcastProgressUpdate(progressState);

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u",
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu"
  ], { env: { ...process.env, PYTHONUNBUFFERED: "1" } });

  let currentStep = 0;
  let totalFrames = 0, processedFrames = 0;
  let totalSegments = 0, madeSegments = 0;
  let scenePercent = 60; // 장면 분할 진행률 초기값
  let sceneInterval = null;

  pipeline.stdout.on("data", (data) => {
    const text = data.toString();
    console.log("PYTHON STDOUT:", text);

    if (text.includes("[1/3]")) {
      currentStep = 1;
      progressState.step = 1;
      progressState.message = "🔍 특징 추출 중...";
      progressState.percent = 1;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("프레임 특징 추출 완료")) {
      currentStep = 1.5; // 장면 분할 중간단계
      progressState.message = "🎬 장면 분할 중...";
      progressState.percent = scenePercent;
      broadcastProgressUpdate(progressState);

      // 장면 분할 진행률 자연스럽게 증가 (1초마다 1%)
      sceneInterval = setInterval(() => {
        if (scenePercent < 69) {
          scenePercent += 1;
          progressState.percent = scenePercent;
          broadcastProgressUpdate(progressState);
        }
      }, 1000);
    } else if (text.includes("[2/3]")) {
      currentStep = 2;
      if (sceneInterval) clearInterval(sceneInterval);
      progressState.step = 2;
      progressState.message = "🧠 하이라이트 점수 예측 중...";
      progressState.percent = 70;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("[3/3]")) {
      currentStep = 3;
      progressState.step = 3;
      progressState.message = "🎞️ 숏폼 영상 생성 중...";
      progressState.percent = 75;
      broadcastProgressUpdate(progressState);
    }

    if (currentStep === 1) {
      const frameMatch = text.match(/📸 처리 중\.\.\.\s+(\d+)\/(\d+) 프레임/);
      if (frameMatch) {
        processedFrames = parseInt(frameMatch[1], 10);
        totalFrames = parseInt(frameMatch[2], 10);
        const percent = 1 + Math.floor(59 * (processedFrames / totalFrames));
        progressState.percent = percent;
        progressState.message = `🔍 특징 추출 중... (${processedFrames}/${totalFrames} 프레임)`;
        broadcastProgressUpdate(progressState);
      }
    }

    const sceneMatch = text.match(/✅ (\d+)개의 장면 구간 탐지 완료/);
    if (sceneMatch) {
      totalSegments = parseInt(sceneMatch[1], 10);
      if (sceneInterval) clearInterval(sceneInterval);
      progressState.percent = 70;
      progressState.message = `🎬 장면 분할 완료 (${totalSegments}개 구간)`;
      broadcastProgressUpdate(progressState);
    }

    if (currentStep === 3) {
      const segMatch = text.match(/▶️ 세그먼트 ID (\d+):/);
      if (segMatch) {
        madeSegments++;
        if (totalSegments > 0) {
          const fraction = madeSegments / totalSegments;
          progressState.percent = 75 + Math.floor(25 * fraction);
          progressState.message = `🎞️ 숏폼 영상 생성 중... (${madeSegments}/${totalSegments})`;
          broadcastProgressUpdate(progressState);
        }
      }
    }

    if (text.includes("✅ 파이프라인 완료!")) {
      progressState.percent = 100;
      progressState.message = "✅ 숏폼 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }
  });

  pipeline.stderr.on("data", data => console.error("PYTHON ERR:", data.toString()));

  pipeline.on("close", code => {
    if (sceneInterval) clearInterval(sceneInterval);
    if (code !== 0) {
      progressState.done = true;
      progressState.message = "❌ 파이프라인 실패";
      broadcastProgressUpdate(progressState);
      return res.status(500).json({ message: "파이프라인 실패" });
    }
    progressState.percent = 100;
    progressState.done = true;
    progressState.step = 3;
    progressState.message = "✅ 숏폼 영상 생성 완료!";
    broadcastProgressUpdate(progressState);
    res.json({ message: "요약 완료" });
  });
});

router.post("/update-highlights", (req, res) => {
  console.log("REQ BODY:", req.body);

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
      console.error("하이라이트 JSON 저장 실패:", err);
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
      console.log("VIDEO MODULE OUT:", text);
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