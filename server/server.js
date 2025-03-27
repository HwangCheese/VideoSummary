// server/server.js
const express = require("express");
const path = require("path");

const app = express();
const uploadRouter = require("./routes/upload");
const resultRouter = require("./routes/result");
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

app.use('/clips', express.static(path.join(__dirname, '..', 'clips')));

app.use("/upload", uploadRouter);
app.use("/results", resultRouter);

app.listen(PORT, () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT}`);
});
