// server.js
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({limit: "5mb"}));

const uploadRouter = require("./routes/upload");
const resultRouter = require("./routes/result");
const shareRouter = require("./routes/share");

const PORT = 3000;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "intro.html"));
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/clips", express.static(path.join(__dirname, "..", "clips")));

app.use("/upload", uploadRouter);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/results", resultRouter);

app.use("/", shareRouter);

app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
