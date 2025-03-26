// server/routes/result.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

router.get("/clips", (req, res) => {
  const clipsDir = path.join(__dirname, "../../clips");  // ✅ 정확한 위치

  if (!fs.existsSync(clipsDir)) return res.json({ clips: [] });

  const files = fs.readdirSync(clipsDir)
    .filter(f => f.endsWith(".mp4")) 
    .map(f => `/clips/${f}`);      

  res.json({ clips: files });
});

module.exports = router;