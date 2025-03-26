// server/result.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

router.get("/clips", (req, res) => {
  const clipsDir = path.join(__dirname, "../clips");
  if (!fs.existsSync(clipsDir)) return res.json({ clips: [] });

  const files = fs.readdirSync(clipsDir)
    .filter(f => f.startsWith("final_highlight") && f.endsWith(".mp4"))
    .map(f => `/clips/${f}`);

  res.json({ clips: files });
});

module.exports = router;
