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
  if (!req.file) { // 파일이 없는 경우 처리
    return res.status(400).json({ message: "업로드된 파일이 없습니다." });
  }
  const filename = req.file.originalname;
  broadcastProgressUpdate({ step: 0, message: "업로드 완료, 처리 대기 중...", done: false, percent: 0 });
  res.json({ message: "업로드 완료", filename });
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const mode = req.query.mode || "story"; // 기본값을 'story'로 설정
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl"); // 경로 확인 필요
  const outputDir = path.resolve(__dirname, "..", "..", "clips");
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py"); // 경로 확인 필요

  let currentPhase = null;
  // let currentStep = 0; // progressState.step으로 대체 가능
  let processedFrames_initial = 0;
  let totalFrames_initial = 0;
  let processedFrames_transnet = 0;
  let totalFrames_transnet = 0;

  if (!fs.existsSync(inputPath)) {
    const errorState = { step: 0, message: "❌ 원본 영상을 찾을 수 없습니다.", done: true, percent: 0, error: true };
    broadcastProgressUpdate(errorState);
    return res.status(404).json({ message: "원본 영상을 찾을 수 없습니다.", path: inputPath });
  }

  // 각 요청에 대한 고유한 progressState를 사용 (동시 요청 처리 시 중요)
  // 여기서는 단순화를 위해 전역 sseClients를 사용하지만, 실제 프로덕션에서는 작업별 상태 관리 필요
  const progressState = { step: 0, message: "파이프라인 시작 중...", done: false, percent: 0, filename: filename }; // 작업 식별을 위해 filename 추가
  broadcastProgressUpdate(progressState);

  const pipelineArgs = [
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu", // 필요시 'cuda' 등으로 변경
  ];

  if (mode === "highlight") {
    pipelineArgs.push("--importance_weight", "0.8");
  } else { // story 모드 또는 기타
    pipelineArgs.push("--importance_weight", "0.1");
  }

  console.log("Spawning pipeline with args:", pipelineArgs);
  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u", // -u: unbuffered output
    ...pipelineArgs
  ], { env: { ...process.env } });

  let stdoutBuffer = ""; // stdout 데이터를 버퍼링하여 한 줄씩 처리

  pipeline.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.substring(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);

      if (!line) continue; // 빈 줄은 무시

      console.log("PYTHON STDOUT:", line);
      let updated = false; // 상태 업데이트 여부 플래그

      // 파이프라인 단계별 진행률 업데이트 로직 (이전과 유사)
      if (line.includes("프레임 특징") || line.includes("[1/6]")) {
        currentPhase = 'feature_extract';
        progressState.step = 1;
        progressState.message = "🎬 특징 추출 중...";
        // percent는 상세 로그에서 업데이트
        updated = true;
      } else if (line.includes("TransNetV2") || line.includes("장면 분할")) { // [1/6] 내의 TransNetV2
        currentPhase = 'scene_split';
        progressState.step = 2; // UI에서는 특징 추출 다음 단계로 표시될 수 있음
        progressState.message = "🎬 장면 분할 중...";
        // percent는 상세 로그에서 업데이트
        updated = true;
      } else if (line.includes("[2/6]")) { // 오디오 추출
        currentPhase = 'audio_extract';
        progressState.step = 3;
        progressState.message = "🔊 오디오 추출 중...";
        progressState.percent = Math.max(progressState.percent, 60); // 이전 단계보다 높게 설정
        updated = true;
      } else if (line.includes("[3/6]")) { // Whisper
        currentPhase = 'sentence_segment';
        progressState.step = 4;
        progressState.message = "🧠 문장 추출 중...";
        progressState.percent = Math.max(progressState.percent, 65);
        updated = true;
      } else if (line.includes("[4/6]")) { // PGL-SUM
        currentPhase = 'ai_score';
        progressState.step = 5;
        progressState.message = "🎯 AI 분석 중...";
        progressState.percent = Math.max(progressState.percent, 80);
        updated = true;
      } else if (line.includes("[6/6]") && !line.includes("기존 파일 발견")) { // 영상 생성 시작
        currentPhase = 'video_generate';
        progressState.step = 6;
        progressState.message = "🎞️ 요약 영상 생성 중...";
        progressState.percent = Math.max(progressState.percent, 85);
        updated = true;
        // 영상 생성 중 느린 진행률 업데이트는 파이프라인 완료 후 또는 별도 로직으로
      } else if (line.includes("✅ 파이프라인 완료!")) {
        progressState.percent = 100;
        progressState.message = "✅ 요약 영상 생성 완료!";
        progressState.done = true;
        updated = true;
      }

      // 상세 진행률 (프레임 기반)
      if (currentPhase === 'feature_extract') {
        const frameMatch = line.match(/📸 처리 중\.\.\.\s*(\d+)\/(\d+) 프레임/);
        if (frameMatch) {
          processedFrames_initial = parseInt(frameMatch[1], 10);
          totalFrames_initial = parseInt(frameMatch[2], 10);
          if (totalFrames_initial > 0) {
            const percent = Math.floor(25 * (processedFrames_initial / totalFrames_initial));
            progressState.percent = Math.max(0, Math.min(percent, 25)); // 0 ~ 25% 범위
            progressState.message = `🎬 특징 추출 중... (${processedFrames_initial}/${totalFrames_initial} 프레임)`;
            updated = true;
          }
        }
      } else if (currentPhase === 'scene_split') {
        const frameMatch = line.match(/\[TransNetV2\] Processing video frames (\d+)\/(\d+)/);
        if (frameMatch) {
          processedFrames_transnet = parseInt(frameMatch[1], 10);
          totalFrames_transnet = parseInt(frameMatch[2], 10);
          if (totalFrames_transnet > 0) {
            const percent = 25 + Math.floor(35 * (processedFrames_transnet / totalFrames_transnet)); // 25 ~ 60% 범위
            progressState.percent = Math.max(25, Math.min(percent, 60));
            progressState.message = `🎬 장면 분할 중... (${processedFrames_transnet}/${totalFrames_transnet} 프레임)`;
            updated = true;
          }
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
    // 필요시 stderr 내용을 SSE로 보내 에러 상황 알림
    // progressState.message = `❌ 처리 중 오류: ${errorText.substring(0, 100)}`; // 너무 길지 않게
    // progressState.error = true;
    // broadcastProgressUpdate(progressState);
  });

  pipeline.on("close", code => {
    console.log(`파이프라인 종료 코드: ${code}`);
    // stdoutBuffer에 남은 데이터 처리
    if (stdoutBuffer.trim()) {
      console.log("PYTHON STDOUT (남은 버퍼):", stdoutBuffer.trim());
      // 필요시 마지막 로그 처리 로직 추가
    }

    if (code !== 0) {
      progressState.done = true;
      progressState.error = true;
      progressState.message = `❌ 처리 실패 (종료 코드: ${code})`;
      broadcastProgressUpdate(progressState);
      // sseClients는 여기서 비우지 않고, 각 클라이언트의 req.on("close")에서 처리
      if (!res.headersSent) { // 응답이 이미 전송되지 않았을 경우에만 전송
        return res.status(500).json({ message: "파이프라인 처리 실패", code: code });
      }
    } else {
      // 성공적으로 완료되었지만, done 플래그가 아직 true가 아닐 경우
      if (!progressState.done) {
        progressState.percent = 100;
        progressState.message = "✅ 요약 영상 생성 완료!";
        progressState.done = true;
        broadcastProgressUpdate(progressState);
      }
      if (!res.headersSent) {
        // 성공 시, 클라이언트에게 필요한 추가 데이터를 전달할 수 있음
        // 예: 생성된 파일명, 리포트 데이터 경로 등
        res.json({ message: "요약 완료", filename: filename /* 필요한 데이터 추가 */ });
      }
    }
    // sseClients.forEach(client => client.end()); // 모든 클라이언트 연결 종료 (선택적)
    // sseClients = [];
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
    // sseClients.forEach(client => client.end());
    // sseClients = [];
  });
});

// ===== 하이라이트 업데이트 라우트 (신규 추가) =====
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

    // 비디오 재생성 시작 전 SSE로 상태 알림 (옵션)
    broadcastProgressUpdate({ step: 6, message: "🎬 영상 재생성 중...", done: false, percent: 0 });

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
      // 비디오 모듈의 진행률 로그가 있다면 여기서 SSE 업데이트 로직 추가 가능
      // 예: text.match(/Processing frame (\d+)\/(\d+)/)
    });

    regenerate.stderr.on("data", (data) => {
      error += data.toString();
      console.error("VIDEO MODULE ERR:", data.toString());
      // 에러 발생 시 SSE로 알림 가능 (선택적)
      // broadcastProgressUpdate({ message: `❌ 재생성 오류: ${data.toString()}`, done: false, percent: progressState.percent });
    });

    regenerate.on("close", (code) => {
      // 비디오 재생성 완료/실패 후 SSE 상태 업데이트 (선택적)
      if (code !== 0) {
        console.error("비디오 재생성 실패 코드:", code);
        // broadcastProgressUpdate({ message: `❌ 재생성 실패 (코드: ${code})`, done: true, percent: progressState.percent });
      } else {
        console.log("비디오 재생성 완료");
        // broadcastProgressUpdate({ message: "✅ 영상 재생성 완료!", done: true, percent: 100 }); // 100% 완료는 메인 파이프라인에서만 표시하는 게 자연스러울 수도 있음
      }


      if (code !== 0) {
        console.error("비디오 재생성 실패:", error);
        // 에러 발생 시 SSE로 최종 에러 상태 알림 (선택적)
        // broadcastProgressUpdate({ step: 4, message: `❌ 하이라이트 재생성 실패`, done: true, percent: progressState.percent }); // 예시
        return res.status(500).json({
          message: "하이라이트 재생성 실패",
          error: error
        });
      }

      // 생성된 영상 파일 확인
      const outputVideoPath = path.join(clipsDir, `highlight_${baseName}.mp4`);
      if (!fs.existsSync(outputVideoPath)) {
        // 파일이 없으면 SSE로 에러 상태 알림 (선택적)
        // broadcastProgressUpdate({ step: 4, message: `❌ 재생성 실패: 파일 없음`, done: true, percent: progressState.percent }); // 예시
        return res.status(500).json({
          message: "하이라이트 영상 생성 실패: 파일이 존재하지 않음",
          output: output
        });
      }

      // 성공 시 SSE로 성공 알림 (선택적)
      // broadcastProgressUpdate({ step: 4, message: "✅ 하이라이트 업데이트 완료", done: true, percent: 100 }); // 예시


      // 클라이언트에게 성공 응답 전송
      return res.json({
        message: "하이라이트 업데이트 성공",
        video_path: `/clips/highlight_${baseName}.mp4?t=${Date.now()}`, // 캐시 방지용 타임스탬프
        segments_count: segments.length
      });
    });

    // 비디오 재생성 실행 중 에러 핸들링
    regenerate.on('error', (err) => {
      console.error('비디오 재생성 실행 에러:', err);
      // 에러 발생 시 SSE로 알림 (선택적)
      // broadcastProgressUpdate({ step: 4, message: `❌ 재생성 실행 오류: ${err.message}`, done: true, percent: progressState.percent }); // 예시
      if (!res.headersSent) {
        res.status(500).json({ message: "비디오 재생성 실행 오류", error: err.message });
      }
    });
  });
});
// ==================================================

module.exports = router;