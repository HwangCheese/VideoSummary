// server/services/pipelineService.js

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { broadcastProgressUpdate } = require("./sseService");

/**
 * 파이썬 요약 파이프라인을 실행
 * @param {object} options - 실행 옵션
 * @param {string} options.filename - 처리할 영상 파일명
 * @param {number} options.importanceWeight - 중요도 가중치
 * @param {number} options.topRatio - 요약 비율
 */
function runPipeline({ filename, importanceWeight, topRatio }) {
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "vasnet1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips");
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");

  if (!fs.existsSync(inputPath)) {
    broadcastProgressUpdate({ message: "❌ 원본 영상을 찾을 수 없습니다.", done: true, error: true });
    console.error("원본 영상을 찾을 수 없습니다:", inputPath);
    return;
  }

  const progressState = { step: 0, message: "파이프라인 시작 중...", done: false, percent: 0, filename };
  broadcastProgressUpdate(progressState);

  const pipelineArgs = [
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cpu",
    "--importance_weight", importanceWeight.toString(),
    "--top_ratio", topRatio.toString()
  ];

  console.log("파이프라인 실행:", ["python", ...pipelineArgs].join(" "));
  const pipeline = spawn("conda", ["run", "-n", "vidsum", "--live-stream", "python", "-u", ...pipelineArgs]);

  let stdoutBuffer = "";
  pipeline.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.substring(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
      if (line) {
        parseLogAndUpdateProgress(line, progressState);
      }
    }
  });

  pipeline.stderr.on("data", data => console.error("PYTHON STDERR:", data.toString().trim()));

  pipeline.on("close", code => {
    console.log(`파이프라인 종료 코드: ${code}`);
    if (code !== 0) {
      progressState.done = true;
      progressState.error = true;
      progressState.message = `❌ 처리 실패 (종료 코드: ${code})`;
      broadcastProgressUpdate(progressState);
    } else if (!progressState.done) {
      progressState.percent = 100;
      progressState.message = "✅ 요약 영상 생성 완료!";
      progressState.done = true;
      broadcastProgressUpdate(progressState);
    }
  });

  pipeline.on("error", (err) => {
    console.error('파이프라인 실행 에러:', err);
    progressState.done = true;
    progressState.error = true;
    progressState.message = `❌ 실행 오류: ${err.message}`;
    broadcastProgressUpdate(progressState);
  });
}

/**
 * 파이썬 스크립트의 로그 한 줄을 파싱하여 진행 상태를 업데이트하고, 브로드캐스트
 * @param {string} line - 파싱할 로그 라인
 * @param {object} progressState - 현재 진행 상태 객체
 */
function parseLogAndUpdateProgress(line, progressState) {
  let updated = false;
  // 파이썬 출력 로그를 파싱하여 단계별 진행 상황 업데이트
  if (line.includes("[1/6]")) {
    progressState.step = 1;
    progressState.message = "🔍 특징 추출 중...";
    progressState.percent = Math.max(progressState.percent, 8);
    updated = true;
  } else if (line.includes("[2/6]")) {
    progressState.step = 2;
    progressState.message = "📊 프레임 중요도 산출 중...";
    // Step 1이 완료된 25%로 설정
    progressState.percent = Math.max(progressState.percent, 25);
    updated = true;
  } else if (line.includes("[3/6]")) {
    progressState.step = 3;
    progressState.message = "✂️ 장면 분할 중...";
    progressState.percent = Math.max(progressState.percent, 42);
    updated = true;
  } else if (line.includes("[4/6]")) {
    progressState.step = 4;
    progressState.message = "🎯 장면 선택 중...";
    progressState.percent = Math.max(progressState.percent, 60);
    updated = true;
  } else if (line.includes("[5/6]")) {
    progressState.step = 5;
    progressState.message = "🛠️ 장면 경계 보정 중...";
    progressState.percent = Math.max(progressState.percent, 75);
    updated = true;
  } else if (line.includes("[6/6]")) {
    progressState.step = 6;
    progressState.message = "🎬 요약 영상 생성 중...";
    progressState.percent = Math.max(progressState.percent, 92);
    updated = true;
  } else if (line.includes("✅ 파이프라인 완료!")) {
    progressState.percent = 100;
    progressState.message = "✅ 요약 영상 생성 완료!";
    progressState.done = true;
    updated = true;
  }

  // 정규식을 사용하여 특징 추출 진행률 파싱
  const frameMatch1 = line.match(/📸 처리 중\.\.\.\s*(\d+)\/(\d+) 프레임/);
  if (progressState.step === 1 && frameMatch1) {
    processedFrames_initial = parseInt(frameMatch1[1], 10);
    totalFrames_initial = parseInt(frameMatch1[2], 10);
    if (totalFrames_initial > 0) {
      const percent = 8 + Math.floor(17 * (processedFrames_initial / totalFrames_initial));
      progressState.percent = Math.max(8, Math.min(percent, 25));
      progressState.message = `🎬 특징 추출 중... (${processedFrames_initial}/${totalFrames_initial} 프레임)`;
      updated = true;
    }
  }

  // 정규식을 사용하여 장면 분할 진행률 파싱 - 제대로 동작하지 않음
  const frameMatch2 = line.match(/\[TransNetV2\] Processing video frames (\d+)\/(\d+)/);
  if (progressState.step === 3 && frameMatch2) {
    processedFrames_transnet = parseInt(frameMatch2[1], 10);
    totalFrames_transnet = parseInt(frameMatch2[2], 10);
    if (totalFrames_transnet > 0) {
      const percent = 45 + Math.floor(15 * (processedFrames_transnet / totalFrames_transnet));
      progressState.percent = Math.max(45, Math.min(percent, 60));
      progressState.message = `🎬 장면 분할 중... (${processedFrames_transnet}/${totalFrames_transnet} 프레임)`;
      updated = true;
    }
  }

  // 변경 사항이 있을 경우에만 클라이언트에 업데이트 전송
  if (updated) {
    broadcastProgressUpdate(progressState);
  }
}

module.exports = { runPipeline };