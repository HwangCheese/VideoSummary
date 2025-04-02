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

let sseClients = []; // 연결된 클라이언트 목록

// SSE 라우트 (index.html에서 EventSource로 연결)
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

// 진행상황을 연결된 모든 클라이언트에 전송하는 함수
function broadcastProgressUpdate(progressState) {
  const data = JSON.stringify(progressState);
  sseClients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
}

// =================== POST /upload ===================
router.post("/", upload.single("video"), (req, res) => {
  const filename = req.file.originalname;
  res.json({ message: "업로드 완료", filename });
});

// =================== GET /upload/process ===================
router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips");

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ message: "파일 없음", path: inputPath });
  }

  const progressState = {
    step: 0,
    message: "시작 중...",
    done: false
  };

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u",
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cuda"
  ], { env: { ...process.env, PYTHONUNBUFFERED: "1" } });

  pipeline.stdout.on("data", (data) => {
    const text = data.toString();
    console.log("PYTHON STDOUT:", text);

    if (text.includes("[1/3]")) {
      progressState.step = 1;
      progressState.message = "🔍 특징 추출 중...";
    } else if (text.includes("[2/3]")) {
      progressState.step = 2;
      progressState.message = "🧠 하이라이트 점수 예측 중...";
    } else if (text.includes("[3/3]")) {
      progressState.step = 3;
      progressState.message = "🎞️ 하이라이트 영상 생성 중...";
    }

    broadcastProgressUpdate(progressState);
  });

  pipeline.stderr.on("data", (data) => {
    console.error("PYTHON ERR:", data.toString());
  });

  pipeline.on("close", (code) => {
    if (code !== 0) {
      progressState.done = true;
      progressState.message = "❌ 파이프라인 실패";
      broadcastProgressUpdate(progressState);
      return res.status(500).json({ message: "파이프라인 실패" });
    }

    progressState.done = true;
    progressState.step = 3;
    progressState.message = "✅ 하이라이트 영상 생성 완료!";
    broadcastProgressUpdate(progressState);

    res.json({ message: "요약 완료" });
  });
});

module.exports = router;
