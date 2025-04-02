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
    done: false,
    percent: 0
  };
  
  broadcastProgressUpdate(progressState);

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u",
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu"
  ], { env: { ...process.env, PYTHONUNBUFFERED: "1" } });

  // 단계별 진행도 값 정의
  const STEP1_START = 0;
  const STEP1_END   = 70;
  const STEP2_START = 70;
  const STEP2_END   = 80;
  const STEP3_START = 80;
  const STEP3_END   = 100;

  let currentStep = 0;
  let totalFrames = 0;
  let processedFrames = 0;
  let totalSegments = 0;
  let madeSegments = 0;
  let lastUpdateTime = Date.now();
  let updateInterval = null;

  // 일정 시간마다 진행상황 업데이트를 위한 함수
  const sendProgressHeartbeat = () => {
    // 현재 단계가 2나 3이고 30초 이상 업데이트가 없었다면 1% 증가
    if ((currentStep === 2 || currentStep === 3) && Date.now() - lastUpdateTime > 30000) {
      const currentPercent = progressState.percent || 
                           (currentStep === 2 ? STEP2_START : STEP3_START);
      const maxPercent = currentStep === 2 ? STEP2_END - 1 : STEP3_END - 5;
      
      if (currentPercent < maxPercent) {
        progressState.percent = currentPercent + 1;
        broadcastProgressUpdate(progressState);
        lastUpdateTime = Date.now();
      }
    }
  };

  // 10초마다 진행 상황을 확인하고 필요시 업데이트
  updateInterval = setInterval(sendProgressHeartbeat, 10000);

  pipeline.stdout.on("data", (data) => {
    const text = data.toString();
    console.log("PYTHON STDOUT:", text);
    lastUpdateTime = Date.now();

    // 1) 단계 구분 로그
    if (text.includes("[1/3]")) {
      currentStep = 1;
      progressState.step = 1;
      progressState.message = "🔍 특징 추출 중...";
      progressState.percent = STEP1_START;
      broadcastProgressUpdate(progressState);
    } 
    else if (text.includes("[2/3]")) {
      currentStep = 2;
      progressState.step = 2;
      progressState.message = "🧠 하이라이트 점수 예측 중...";
      progressState.percent = STEP2_START;
      broadcastProgressUpdate(progressState);
    } 
    else if (text.includes("[3/3]")) {
      currentStep = 3;
      progressState.step = 3;
      progressState.message = "🎞️ 하이라이트 영상 생성 중...";
      progressState.percent = STEP3_START;
      broadcastProgressUpdate(progressState);
    }

    // 2) [1단계] 프레임 추출 진행률 파싱
    if (currentStep === 1) {
      const frameMatch = text.match(/📸 처리 중\.\.\.\s+(\d+)\/(\d+) 프레임/);
      if (frameMatch) {
        processedFrames = parseInt(frameMatch[1], 10);
        totalFrames = parseInt(frameMatch[2], 10);
        if (totalFrames > 0) {
          const fraction = processedFrames / totalFrames;
          const percent = STEP1_START + (STEP1_END - STEP1_START) * fraction;

          progressState.percent = Math.floor(percent);
          progressState.message = `🔍 특징 추출 중... (${processedFrames}/${totalFrames} 프레임)`;
          broadcastProgressUpdate(progressState);
        }
      }
    }

    // 3) [씬 디텍션] 로그 파싱
    const sceneMatch = text.match(/✅ (\d+)개의 장면 구간 탐지 완료/);
    if (sceneMatch) {
      totalSegments = parseInt(sceneMatch[1], 10);
      console.log("총 장면 개수:", totalSegments);
      
      // 2단계가 끝나가고 있음을 표시
      if (currentStep === 2) {
        progressState.percent = STEP2_END - 1;
        progressState.message = `🧠 장면 분석 완료 (${totalSegments}개 구간)`;
        broadcastProgressUpdate(progressState);
      }
    }

    // 4) [3단계] 세그먼트 추출 로그 파싱
    if (currentStep === 3) {
      const segMatch = text.match(/▶️ 세그먼트 ID (\d+):/);
      if (segMatch) {
        madeSegments++;
        
        if (totalSegments > 0) {
          const fraction = madeSegments / totalSegments;
          const percent = STEP3_START + (STEP3_END - STEP3_START) * fraction;
          progressState.percent = Math.floor(percent);
          progressState.message = `🎞️ 세그먼트 추출 중... (${madeSegments}/${totalSegments})`;
          broadcastProgressUpdate(progressState);
        } else {
          // totalSegments를 모를 경우
          const currentPercent = progressState.percent || STEP3_START;
          const increment = (STEP3_END - STEP3_START) / 10; // 대략 10개 정도 있다고 가정
          progressState.percent = Math.min(STEP3_END - 1, currentPercent + increment);
          broadcastProgressUpdate(progressState);
        }
      }
    }
    
    // 5) 파이프라인 완료 메시지
    if (text.includes("✅ 파이프라인 완료!")) {
      progressState.percent = 100;
      progressState.message = "✅ 하이라이트 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }
  });

  pipeline.stderr.on("data", (data) => {
    console.error("PYTHON ERR:", data.toString());
    lastUpdateTime = Date.now();
  });

  pipeline.on("close", (code) => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    
    if (code !== 0) {
      progressState.done = true;
      progressState.message = "❌ 파이프라인 실패";
      broadcastProgressUpdate(progressState);
      return res.status(500).json({ message: "파이프라인 실패" });
    }

    // 이미 100%가 전송되었을 수 있으므로 마지막에 다시 한번 100% 전송
    progressState.percent = 100;
    progressState.done = true;
    progressState.step = 3;
    progressState.message = "✅ 하이라이트 영상 생성 완료!";
    broadcastProgressUpdate(progressState);

    res.json({ message: "요약 완료" });
  });
});

module.exports = router;