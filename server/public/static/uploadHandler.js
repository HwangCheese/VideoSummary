// public/static/uploadHandler.js
import { showToast, formatFileSize } from './uiUtils.js';

export let uploadedFileName = "";

export function initUploadHandler() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileName = document.getElementById("fileName");
  const fileSize = document.getElementById("fileSize");
  const uploadInfo = document.getElementById("uploadInfo");
  const startBtn = document.getElementById("startBtn");
  const statusDiv = document.getElementById("status");
  const progressBarInner = document.getElementById("progressBarInner");

  // 드래그 & 드롭 UI
  ["dragenter", "dragover"].forEach(eventName =>
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      dropZone.classList.add("hover");
    })
  );

  ["dragleave", "drop"].forEach(eventName =>
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      dropZone.classList.remove("hover");
    })
  );

  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  dropZone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!file.name.endsWith(".mp4")) {
      showToast("⚠️ mp4 파일만 업로드 가능합니다.", "warning");
      return;
    }

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    uploadInfo.style.display = "block";

    uploadFile(file);
  }

  async function uploadFile(file) {
    statusDiv.textContent = "⏳ 업로드 중...";
    progressBarInner.style.width = "0%";
    startBtn.disabled = true;

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        uploadedFileName = data.filename;
        statusDiv.textContent = `✅ 업로드 성공: ${uploadedFileName}`;
        startBtn.disabled = false;
        showToast("업로드가 완료되었습니다!", "success");
      } else {
        statusDiv.textContent = "❌ 업로드 실패";
        showToast("업로드에 실패했습니다. 다시 시도해주세요.", "error");
      }
    } catch (error) {
      console.error(error);
      statusDiv.textContent = "❌ 업로드 중 오류 발생";
      showToast("업로드 중 오류가 발생했습니다.", "error");
    }
  }
}
