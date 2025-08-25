// server/services/videoUtils.js

const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * ffprobe를 사용하여 비디오의 메타데이터를 추출
 * @param {string} filePath - 비디오 파일의 경로
 * @returns {Promise<object>} 파싱된 메타데이터 객체
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobeArgs = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath
    ];

    execFile("ffprobe", ffprobeArgs, (error, stdout, stderr) => {
      if (error) {
        console.error("[FFPROBE] Stderr:", stderr);
        return reject(new Error(`ffprobe 실행 실패: ${stderr || error.message}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        console.error("[FFPROBE] JSON 파싱 오류:", parseError);
        reject(new Error(`ffprobe 출력 파싱 실패: ${parseError.message}`));
      }
    });
  });
}

/**
 * 편집된 세그먼트 정보로 하이라이트 영상을 재생성
 * @param {string} filename - 원본 비디오 파일명
 * @param {Array<object>} segments - 편집된 하이라이트 세그먼트 배열
 * @returns {Promise<string>} 생성된 비디오의 웹 경로
 */
function regenerateHighlights(filename, segments) {
  return new Promise((resolve, reject) => {
    const baseName = filename.split('.').slice(0, -1).join('.');
    const clipsDir = path.resolve(__dirname, "..", "..", "clips");
    const jsonPath = path.join(clipsDir, `highlight_${baseName}.json`);

    // 1. 편집된 세그먼트 정보를 JSON 파일로 저장
    fs.writeFile(jsonPath, JSON.stringify({ segments, updated_at: new Date().toISOString() }, null, 2), (err) => {
      if (err) {
        console.error("숏폼 JSON 저장 실패:", err);
        return reject(new Error("파일 저장 실패"));
      }

      // 2. 파이썬 영상 생성 모듈 호출
      const videoModulePath = path.resolve(__dirname, "..", "..", "src", "video_module.py");
      const videoPath = path.resolve(__dirname, "..", "uploads", filename);

      if (!fs.existsSync(videoPath)) {
        return reject(new Error("원본 영상 파일 없음"));
      }

      const regenerate = spawn("conda", ["run", "-n", "mrhisum", "--live-stream", "python", "-u", videoModulePath, videoPath, jsonPath]);

      let errorOutput = '';
      regenerate.stderr.on("data", data => { errorOutput += data.toString(); });
      regenerate.on("close", code => {
        if (code !== 0) {
          console.error("비디오 재생성 실패:", errorOutput);
          return reject(new Error(`하이라이트 재생성 실패: ${errorOutput}`));
        }
        
        const newVideoWebPath = `/clips/highlight_${baseName}.mp4?t=${Date.now()}`;
        resolve(newVideoWebPath);
      });
    });
  });
}

module.exports = {
  getVideoMetadata,
  regenerateHighlights,
};