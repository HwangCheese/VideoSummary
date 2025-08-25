// server/routes/upload.js
const express = require("express");
const multer = require("multer");
const path = require("path");

const { initializeSse, broadcastProgressUpdate } = require("../services/sseService");
const { getVideoMetadata, regenerateHighlights } = require("../services/videoUtils");
const { runPipeline } = require("../services/pipelineService");

const router = express.Router();

// 1. Multer 설정 
const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "uploads"),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// 2. SSE 엔드포인트 초기화
initializeSse(router);

// 3. 라우트 핸들러 정의
// POST /upload : 비디오 파일 업로드 및 메타데이터 분석
router.post("/", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "업로드된 파일이 없습니다." });
  }

  broadcastProgressUpdate({ message: "업로드 완료, 파일 정보 분석 중...", percent: 0 });

  try {
    const metadata = await getVideoMetadata(req.file.path);
    // 메타데이터에서 필요한 정보 추출
    const videoStream = metadata.streams.find(s => s.codec_type === "video") || {};
    const audioStream = metadata.streams.find(s => s.codec_type === "audio") || {};
    const format = metadata.format || {};

    const videoInfo = {
      filename: req.file.originalname,
      duration: parseFloat(format.duration),
      video_codec: videoStream.codec_long_name || videoStream.codec_name,
      audio_codec: audioStream.codec_long_name || audioStream.codec_name,
      width: videoStream.width,
      height: videoStream.height,
      bit_rate: parseInt(format.bit_rate, 10),
    };

    broadcastProgressUpdate({ message: "업로드 완료, 처리 대기 중...", percent: 0 });
    res.json({ message: "업로드 완료", filename: req.file.originalname, videoInfo });
  } catch (error) {
    console.error("메타데이터 분석 실패:", error);
    broadcastProgressUpdate({ message: "업로드 완료 (메타데이터 분석 실패)", error: true });
    // 분석에 실패해도 업로드는 성공했으므로 200 OK와 파일명 반환
    res.json({ message: "업로드 완료 (메타데이터 분석 실패)", filename: req.file.originalname, videoInfo: {} });
  }
});

// GET /upload/process : 파이썬 요약 파이프라인 실행
router.get("/process", (req, res) => {
  const { filename, importanceWeight: weightStr, topRatio: ratioStr } = req.query;

  // 파라미터 유효성 검사 및 변환
  const parsedWeight = parseFloat(weightStr);
  const importanceWeight = !isNaN(parsedWeight) ? parseFloat((1 - parsedWeight).toFixed(2)) : 0.5;

  const parsedRatio = parseFloat(ratioStr);
  const topRatio = !isNaN(parsedRatio) && parsedRatio > 0 && parsedRatio <= 1.0 ? parsedRatio : 0.2;

  // 파이프라인 실행은 오래 걸리므로, 요청에 대한 응답을 즉시 보냄
  res.json({ message: "요약 프로세스를 시작했습니다." });

  // 실제 파이프라인은 백그라운드에서 실행
  runPipeline({ filename, importanceWeight, topRatio });
});

// POST /upload/update-highlights : 편집된 영상 재생성
router.post("/update-highlights", async (req, res) => {
  const { filename, segments } = req.body;
  if (!filename || !segments) {
    return res.status(400).json({ message: "파일명 또는 segments 누락" });
  }

  try {
    const newVideoPath = await regenerateHighlights(filename, segments);
    res.json({
      message: "하이라이트 업데이트 성공",
      video_path: newVideoPath,
      segments_count: segments.length,
    });
  } catch (error) {
    console.error("하이라이트 재생성 중 오류:", error);
    res.status(500).json({ message: error.message || "하이라이트 재생성 실패" });
  }
});

module.exports = router;