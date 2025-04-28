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
  res.flushHeaders(); // 헤더 전송

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
  // 업로드 완료 시점에 바로 진행률 초기화 및 1단계 시작 메시지 전송
  broadcastProgressUpdate({ step: 0, message: "업로드 완료, 처리 대기 중...", done: false, percent: 0 });
  res.json({ message: "업로드 완료", filename });
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  // 파이썬 스크립트의 --fine_ckpt 경로가 정확한지 확인 필요
  // 예시 경로: const ckptPath = path.resolve(__dirname, "..", "src", "models", "pgl_sum1_best_f1.pkl");
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "pgl_sum1_best_f1.pkl"); // 사용자 경로 확인

  const outputDir = path.resolve(__dirname, "..", "..", "clips");

  if (!fs.existsSync(inputPath)) {
    // 파일이 존재하지 않으면 404 에러 응답
    broadcastProgressUpdate({ step: 0, message: "❌ 파일 없음", done: true, percent: 0 });
    return res.status(404).json({ message: "파일 없음", path: inputPath });
  }

  // 파이프라인 상태 추적 변수 초기화
  const progressState = { step: 0, message: "파이프라인 시작 중...", done: false, percent: 0 };
  broadcastProgressUpdate(progressState); // 시작 상태 전송

  let currentStep = 0; // 파이썬 스크립트의 [1/3], [2/3], [3/3]에 대응
  let currentPhase = 'initial_extract'; // 'initial_extract', 'transnet_process', 'score_predict', 'video_generate'

  // 초기 특징 추출 단계 진행률 추적
  let totalFrames_initial = 0;
  let processedFrames_initial = 0;

  // TransNetV2 처리 단계 진행률 추적
  let totalFrames_transnet = 0;
  let processedFrames_transnet = 0;
  let transnetTotalDetected = false; // TransNetV2 전체 프레임 수를 한 번만 감지하기 위한 플래그

  // 최종 영상 생성 단계 진행률 추적
  let totalSegments_final = 0;
  let madeSegments_final = 0;

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "--live-stream", "python", "-u", // PYTHONUNBUFFERED 대신 --live-stream 사용
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu" // 실제 배포 환경에서는 'cuda' 사용 고려
  ], { env: { ...process.env } }); // PYTHONUNBUFFERED 환경변수는 --live-stream으로 대체

  pipeline.stdout.on("data", (data) => {
    const text = data.toString().trim(); // 앞뒤 공백 제거
    console.log("PYTHON STDOUT:", text);

    // 단계 시작/종료 감지 및 상태 업데이트
    if (text.includes("[1/3]")) {
      currentStep = 1;
      currentPhase = 'initial_extract';
      progressState.step = 1;
      progressState.message = "🔍 특징 추출 중...";
      // percent는 첫 프레임 로그에서 업데이트 시작
      broadcastProgressUpdate(progressState);
    } else if (text.includes("프레임 특징 추출 완료")) {
      // 초기 특징 추출 완료, TransNetV2 시작 전
      currentPhase = 'transnet_process_start'; // TransNetV2 시작을 알리는 중간 상태
      progressState.percent = 40; // 초기 특징 추출 완료 시 40%
      progressState.message = "🎬 장면 분할 준비 중...";
      broadcastProgressUpdate(progressState);

    } else if (text.includes("[TransNetV2] Extracting frames from")) {
      // 이 로그는 TransNetV2 처리 시작을 알림
      currentPhase = 'transnet_process';
      progressState.message = "🎬 TransNetV2 장면 분할 중...";
      // percent는 다음 TransNetV2 processing 로그에서 업데이트 시작
      broadcastProgressUpdate(progressState);

    } else if (text.includes("✅") && text.includes("개의 장면 구간 탐지 완료")) {
      // TransNetV2 완료 및 장면 구간 탐지 완료
      const sceneMatch = text.match(/✅ (\d+)개의 장면 구간 탐지 완료/);
      if (sceneMatch) {
        totalSegments_final = parseInt(sceneMatch[1], 10);
      }
      currentPhase = 'score_predict'; // 이제 점수 예측 단계로 넘어갈 준비
      progressState.percent = 70; // TransNetV2 처리 완료 시 70%
      progressState.message = `🎬 장면 분할 완료 (${totalSegments_final}개 구간)`;
      broadcastProgressUpdate(progressState);

    } else if (text.includes("🧠 [2/3]")) {
      currentStep = 2;
      currentPhase = 'score_predict';
      progressState.step = 2;
      progressState.percent = 70; // 점수 예측 시작 시 70% 유지
      progressState.message = "🧠 하이라이트 점수 예측 중...";
      broadcastProgressUpdate(progressState);

    } else if (text.includes("🎞️ [3/3]")) {
      currentStep = 3;
      currentPhase = 'video_generate';
      progressState.step = 3;
      progressState.percent = 75; // 영상 생성 시작 시 75%
      progressState.message = "🎞️ 숏폼 영상 생성 중...";
      // percent는 세그먼트 로그에서 업데이트 시작
      broadcastProgressUpdate(progressState);

    } else if (text.includes("✅ 파이프라인 완료!")) {
      // 최종 완료 로그 감지
      progressState.percent = 100;
      progressState.message = "✅ 숏폼 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);

    }

    // 세부 진행률 업데이트
    if (currentPhase === 'initial_extract') {
      // 초기 특징 추출 진행률 (0% ~ 40%)
      const frameMatch = text.match(/📸 처리 중\.\.\.\s+(\d+)\/(\d+) 프레임/);
      if (frameMatch) {
        processedFrames_initial = parseInt(frameMatch[1], 10);
        totalFrames_initial = parseInt(frameMatch[2], 10);
        if (totalFrames_initial > 0) {
          // 0%에서 시작하여 40%까지 진행
          const percent = Math.floor(40 * (processedFrames_initial / totalFrames_initial));
          progressState.percent = Math.max(progressState.percent, percent); // 퍼센트가 감소하지 않도록 보장
          progressState.message = `🔍 특징 추출 중... (${processedFrames_initial}/${totalFrames_initial} 프레임)`;
          broadcastProgressUpdate(progressState);
        }
      }
    } else if (currentPhase === 'transnet_process') {
      // TransNetV2 처리 진행률 (40% ~ 70%)
      const transnetFrameMatch = text.match(/\[TransNetV2\] Processing video frames (\d+)\/(\d+)/);
      if (transnetFrameMatch) {
        processedFrames_transnet = parseInt(transnetFrameMatch[1], 10);
        totalFrames_transnet = parseInt(transnetFrameMatch[2], 10);
        if (totalFrames_transnet > 0) {
          // 40%에서 시작하여 70%까지 진행 (30% 구간)
          const percent = 40 + Math.floor(30 * (processedFrames_transnet / totalFrames_transnet));
          progressState.percent = Math.max(progressState.percent, percent); // 퍼센트가 감소하지 않도록 보장
          progressState.message = `🎬 장면 분할 중... (${processedFrames_transnet}/${totalFrames_transnet} 프레임)`;
          broadcastProgressUpdate(progressState);
        }
      }

    } else if (currentPhase === 'video_generate') {
      // 최종 영상 생성 진행률 (75% ~ 100%)
      const segMatch = text.match(/▶️ 세그먼트 ID (\d+):/);
      if (segMatch) {
        madeSegments_final++; // 각 세그먼트 처리 로그마다 카운트 증가
        if (totalSegments_final > 0) {
          // 75%에서 시작하여 100%까지 진행 (25% 구간)
          const percent = 75 + Math.floor(25 * (madeSegments_final / totalSegments_final));
          progressState.percent = Math.max(progressState.percent, percent); // 퍼센트가 감소하지 않도록 보장
          progressState.message = `🎞️ 숏폼 영상 생성 중... (${madeSegments_final}/${totalSegments_final}개 구간)`;
          broadcastProgressUpdate(progressState);
        }
      }
    }
  });

  pipeline.stderr.on("data", data => console.error("PYTHON ERR:", data.toString()));

  pipeline.on("close", code => {
    // 파이프라인 프로세스 종료 시 처리
    if (code !== 0) {
      // 에러 발생으로 프로세스 종료
      console.error(`파이프라인 비정상 종료 코드: ${code}`);
      progressState.done = true;
      progressState.message = `❌ 처리 실패 (코드: ${code})`;
      broadcastProgressUpdate(progressState);
      // 모든 SSE 클라이언트에게 에러 메시지 전송 후 연결 닫기 (선택적)
      sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
      sseClients = []; // 클라이언트 목록 초기화
      return res.status(500).json({ message: "파이프라인 실패", code: code });
    }

    // 정상 종료 (이미 stdout에서 100% 완료 로그를 감지했을 가능성이 높음)
    // 혹시 마지막 100% 로그가 누락되었을 경우를 대비하여 최종 상태 한 번 더 전송
    if (!progressState.done) {
      progressState.percent = 100;
      progressState.message = "✅ 숏폼 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }

    // 모든 SSE 클라이언트에게 완료 메시지 전송 후 연결 닫기
    sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
    sseClients = []; // 클라이언트 목록 초기화

    // 클라이언트에게 HTTP 응답 전송
    res.json({ message: "요약 완료" });
  });

  // 파이프라인 실행 중 에러 핸들링
  pipeline.on('error', (err) => {
    console.error('파이프라인 실행 에러:', err);
    progressState.done = true;
    progressState.message = `❌ 실행 오류: ${err.message}`;
    broadcastProgressUpdate(progressState);
    // 모든 SSE 클라이언트에게 에러 메시지 전송 후 연결 닫기
    sseClients.forEach(client => client.write(`data: ${JSON.stringify(progressState)}\n\n`));
    sseClients = []; // 클라이언트 목록 초기화
    // 이미 HTTP 응답을 보냈을 수도 있으므로, 헤더가 전송되지 않았을 경우에만 응답
    if (!res.headersSent) {
      res.status(500).json({ message: "파이프라인 실행 오류", error: err.message });
    }
  });

});


// 하이라이트 업데이트 라우트 (기존 코드 유지)
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
    broadcastProgressUpdate({ step: 4, message: "🎬 영상 재생성 중...", done: false, percent: 0 }); // 예시: 4단계로 구분

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

module.exports = router;