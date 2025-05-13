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
  broadcastProgressUpdate({ step: 0, message: "업로드 완료, 처리 대기 중...", done: false, percent: 0 });
  res.json({ message: "업로드 완료", filename });
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const mode = req.query.mode || "story";
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips");
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");

  let currentPhase = null;
  let currentStep = 0;
  let processedFrames_initial = 0;
  let totalFrames_initial = 0;
  let processedFrames_transnet = 0;
  let totalFrames_transnet = 0;

  if (!fs.existsSync(inputPath)) {
    broadcastProgressUpdate({ step: 0, message: "❌ 파일 없음", done: true, percent: 0 });
    return res.status(404).json({ message: "파일 없음", path: inputPath });
  }

  const progressState = { step: 0, message: "파이프라인 시작 중...", done: false, percent: 0 };
  broadcastProgressUpdate(progressState);

  const pipelineArgs = [
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu",
  ];

  if (mode === "highlight") {
    pipelineArgs.push("--importance_weight", "0.8");
  } else {
    pipelineArgs.push("--importance_weight", "0.1");
  }

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u",
    ...pipelineArgs
  ], { env: { ...process.env } });

  pipeline.stdout.on("data", (data) => {
    const text = data.toString().trim();
    console.log("PYTHON STDOUT:", text);

    if (text.includes("프레임 특징")) {
      currentPhase = 'feature_extract';
      currentStep = 1;
      progressState.step = 1;
      progressState.message = "🎬 특징 추출 중...";
      progressState.percent = 0;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("TransNetV2")) {
      currentPhase = 'scene_split';
      currentStep = 2;
      progressState.step = 2;
      progressState.message = "🎬 장면 분할 중...";
      progressState.percent = 25;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("[2/6]")) {
      currentPhase = 'audio_extract';
      currentStep = 3;
      progressState.step = 3;
      progressState.message = "🔊 오디오 추출 중...";
      progressState.percent = 60;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("[3/6]")) {
      currentPhase = 'sentence_segment';
      currentStep = 4;
      progressState.step = 4;
      progressState.message = "🧠 문장 추출 중...";
      progressState.percent = 65;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("[4/6]")) {
      currentPhase = 'ai_score';
      currentStep = 5;
      progressState.step = 5;
      progressState.message = "🎯 AI 분석 중...";
      progressState.percent = 80;
      broadcastProgressUpdate(progressState);
    } else if (text.includes("[6/6]")) {
      currentPhase = 'video_generate';
      currentStep = 6;
      progressState.step = 6;
      progressState.message = "🎞️ 요약 영상 생성 중...";
      progressState.percent = 85;
      broadcastProgressUpdate(progressState);

      // ⏳ 영상 생성 중일 때 천천히 percent 증가 (max 99까지)
      const slowInterval = setInterval(() => {
        if (progressState.percent < 99) {
          progressState.percent += 1;
          broadcastProgressUpdate(progressState);
        } else {
          clearInterval(slowInterval);
        }
      }, 2000); // 2초마다 1% 증가
    } else if (text.includes("✅ 파이프라인 완료!")) {
      progressState.percent = 100;
      progressState.message = "✅ 요약 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }

    if (currentPhase === 'feature_extract') {
      const frameMatch = text.match(/📸 처리 중\.\.\.\s+(\d+)\/(\d+) 프레임/);
      if (frameMatch) {
        processedFrames_initial = parseInt(frameMatch[1], 10);
        totalFrames_initial = parseInt(frameMatch[2], 10);
        if (totalFrames_initial > 0) {
          const percent = Math.floor(25 * (processedFrames_initial / totalFrames_initial));
          progressState.percent = Math.max(progressState.percent, percent);
          progressState.message = `🎬 특징 추출 중... (${processedFrames_initial}/${totalFrames_initial} 프레임)`;
          broadcastProgressUpdate(progressState);
        }
      }
    } else if (currentPhase === 'scene_split') {
      const frameMatch = text.match(/\[TransNetV2\] Processing video frames (\d+)\/(\d+)/);
      if (frameMatch) {
        processedFrames_transnet = parseInt(frameMatch[1], 10);
        totalFrames_transnet = parseInt(frameMatch[2], 10);
        if (totalFrames_transnet > 0) {
          const percent = 25 + Math.floor(35 * (processedFrames_transnet / totalFrames_transnet));
          progressState.percent = Math.max(progressState.percent, percent);
          progressState.message = `🎬 장면 분할 중... (${processedFrames_transnet}/${totalFrames_transnet} 프레임)`;
          broadcastProgressUpdate(progressState);
        }
      }
    }
  });

  pipeline.stderr.on("data", data => console.error("PYTHON ERR:", data.toString()));

  pipeline.on("close", code => {
    if (code !== 0) {
      console.error(`파이프라인 비정상 종료 코드: ${code}`);
      progressState.done = true;
      progressState.message = `❌ 처리 실패 (코드: ${code})`;
      broadcastProgressUpdate(progressState);
      sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
      sseClients = [];
      return res.status(500).json({ message: "파이프라인 실패", code: code });
    }

    if (!progressState.done) {
      progressState.percent = 100;
      progressState.message = "✅ 요약 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }

    sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
    sseClients = [];
    res.json({ message: "요약 완료" });
  });

  pipeline.on("error", (err) => {
    console.error('파이프라인 실행 에러:', err);
    progressState.done = true;
    progressState.message = `❌ 실행 오류: ${err.message}`;
    broadcastProgressUpdate(progressState);
    sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
    sseClients = [];
    if (!res.headersSent) {
      res.status(500).json({ message: "파이프라인 실행 오류", error: err.message });
    }
  });
});

module.exports = router; 
