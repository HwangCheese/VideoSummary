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

router.post("/", upload.single("video"), (req, res) => {
  const filename = req.file.originalname;
  res.json({ message: "업로드 완료", filename });
});

router.get("/process", (req, res) => {
  const filename = req.query.filename;
  const pipelinePath = path.resolve(__dirname, "..", "..", "src", "pipeline.py");
  const inputPath = path.resolve(__dirname, "..", "uploads", filename);
  const ckptPath = path.resolve(__dirname, "..", "..", "dataset", "sl_module1_best_f1.pkl");
  const outputDir = path.resolve(__dirname, "..", "..", "clips"); // final_highlight.mp4 저장 위치

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ message: "파일 없음", path: inputPath });
  }

  const pipeline = spawn("conda", [
    "run", "-n", "mrhisum", "python",
    pipelinePath,
    "--video_path", inputPath,
    "--fine_ckpt", ckptPath,
    "--output_dir", outputDir,
    "--device", "cuda",  // cuda가 안된다면 cpu로 실행
  ], {
    env: { ...process.env }
  });
  

  pipeline.stdout.on("data", d => console.log("PYTHON STDOUT:", d.toString()));
  pipeline.stderr.on("data", d => console.error("PYTHON ERR:", d.toString()));

  pipeline.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ message: "파이프라인 실패" });
    res.json({ message: "요약 완료" });
  });
});

module.exports = router;
