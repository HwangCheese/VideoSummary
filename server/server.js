const express = require("express");
const path = require("path");

const app = express();
const uploadRouter = require("./routes/upload");
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use("/results", express.static(path.join(__dirname, ".."))); 

app.use("/upload", uploadRouter);

app.listen(PORT, () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT}`);
});
