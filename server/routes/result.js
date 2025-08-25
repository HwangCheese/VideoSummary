// server/routes/result.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// 완성된 요약 영상 목록 조회
router.get("/clips", (req, res) => {
  const clipsDir = path.join(__dirname, "../../clips");
  if (!fs.existsSync(clipsDir)) return res.json({ clips: [] });

  const files = fs.readdirSync(clipsDir, { withFileTypes: true });
  const videoFiles = [];

  files.forEach((dirent) => {
    if (dirent.isDirectory()) {
      const dirPath = path.join(clipsDir, dirent.name);
      const dirFiles = fs.readdirSync(dirPath);
      dirFiles.forEach(file => {
        if (file.endsWith(".mp4")) {
          videoFiles.push(`/clips/${dirent.name}/${file}`);
        }
      });
    }
  });

  res.json({ clips: videoFiles });
});

// 특정 영상의 세그먼트 정보 조회
router.get("/segments/:filename", (req, res) => {
  const filename = req.params.filename;
  const baseName = filename.replace(/\..+$/, "").replace(/^highlight_/, "");
  const jsonPath = path.join(__dirname, "../../clips", baseName, `highlight_${baseName}.json`);

  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ message: "세그먼트 정보를 찾을 수 없습니다.", path: jsonPath });
  }

  try {
    const segmentData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return res.json(segmentData);
  } catch (error) {
    return res.status(500).json({ message: "세그먼트 정보 파싱 오류", error: error.message });
  }
});

// 원본 영상 정보 조회
router.get("/original/:filename", (req, res) => {
  const filename = req.params.filename;
  const uploadPath = path.join(__dirname, "../uploads", filename);

  if (!fs.existsSync(uploadPath)) {
    return res.status(404).json({ message: "원본 영상을 찾을 수 없습니다." });
  }

  const stats = fs.statSync(uploadPath);
  return res.json({
    filename,
    path: `/uploads/${filename}`,
    size: stats.size,
    created: stats.birthtime
  });
});

// 점수 파일 조회
router.get("/score/:filename", (req, res) => {
  const baseName = req.params.filename.replace(/\.mp4$/i, "");
  const scorePath = path.join(__dirname, "../../clips", baseName, `${baseName}_score.json`);
  console.log("[SCORE PATH]", scorePath);

  if (!fs.existsSync(scorePath)) {
    console.warn("[SCORE NOT FOUND]", scorePath);
    return res.status(404).json({ message: "점수 파일 없음" });
  }

  try {
    const scoreData = JSON.parse(fs.readFileSync(scorePath, "utf8"));
    return res.json(scoreData);
  } catch (error) {
    console.error("[SCORE PARSE ERROR]", error);
    return res.status(500).json({ message: "점수 파싱 오류", error: error.message });
  }
});

// 요약 리포트 정보 조회
router.get("/report/:filename", (req, res) => {
  const baseName = req.params.filename.replace(/\.mp4$/i, "");
  const reportPath = path.join(__dirname, "../../clips", baseName, `${baseName}_report.json`);

  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ message: "요약 리포트 없음" });
  }

  try {
    const reportData = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return res.json(reportData);
  } catch (err) {
    return res.status(500).json({ message: "리포트 파싱 오류", error: err.message });
  }
});

module.exports = router;
