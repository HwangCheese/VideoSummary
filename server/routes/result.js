// server/routes/result.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// 완성된 하이라이트 영상 목록 조회
router.get("/clips", (req, res) => {
  const clipsDir = path.join(__dirname, "../../clips");  // ✅ 정확한 위치

  if (!fs.existsSync(clipsDir)) return res.json({ clips: [] });

  const files = fs.readdirSync(clipsDir)
    .filter(f => f.endsWith(".mp4"))
    .map(f => `/clips/${f}`);

  res.json({ clips: files });
});

// 특정 영상의 세그먼트 정보 조회
router.get("/segments/:filename", (req, res) => {
  const filename = req.params.filename;
  const baseName = filename.split('.')[0].replace('highlight_', '');
  const jsonPath = path.join(__dirname, "../../clips", `highlight_${baseName}.json`);

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({
      message: "세그먼트 정보를 찾을 수 없습니다.",
      path: jsonPath
    });
  }

  try {
    const segmentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return res.json(segmentData);
  } catch (error) {
    return res.status(500).json({
      message: "세그먼트 정보 파싱 오류",
      error: error.message
    });
  }
});

// 원본 영상 정보 조회
router.get("/original/:filename", (req, res) => {
  const filename = req.params.filename;
  const uploadPath = path.join(__dirname, "../uploads", filename);

  if (!fs.existsSync(uploadPath)) {
    return res.status(404).json({
      message: "원본 영상을 찾을 수 없습니다."
    });
  }

  // 파일 정보 반환
  const stats = fs.statSync(uploadPath);
  return res.json({
    filename,
    path: `/uploads/${filename}`,
    size: stats.size,
    created: stats.birthtime
  });
});

module.exports = router;