// public/static/uploadHandler.js
import { showToast, formatFileSize } from "./uiUtils.js";

export let uploadedFileName = "";

let dropZoneEl = null;
let fileInputEl = null;
let fileNameDisplayEl = null;
let fileSizeDisplayEl = null;
let removeFileBtnEl = null;
let startBtnEl = null;
let statusDivEl = null;
let progressBarInnerEl = null;
let importanceSliderEl = null;
let durationInputEl = null;
let fileActionsContainerEl = null;
let existingSummariesContainerEl = null;

export function setUploadedFileName(newFileName, fileSizeMB) {
  uploadedFileName = newFileName;
  if (!dropZoneEl) dropZoneEl = document.getElementById("dropZone");
  if (!fileNameDisplayEl) fileNameDisplayEl = document.getElementById("fileName");
  if (!fileSizeDisplayEl) fileSizeDisplayEl = document.getElementById("fileSize");
  if (!fileActionsContainerEl) fileActionsContainerEl = document.getElementById("fileActionsContainer");
  if (!startBtnEl) startBtnEl = document.getElementById("startBtn");
  if (!importanceSliderEl) importanceSliderEl = document.getElementById('importanceSlider');
  if (!durationInputEl) durationInputEl = document.getElementById('durationInput');
  if (!fileInputEl) fileInputEl = document.getElementById("fileInput");
  if (!existingSummariesContainerEl) existingSummariesContainerEl = document.querySelector(".existing-summaries-container");


  if (newFileName) {
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = newFileName;
    if (fileSizeDisplayEl) {
      if (fileSizeMB !== undefined) {
        fileSizeDisplayEl.textContent = `${fileSizeMB.toFixed(2)} MB`;
      } else {
        fileSizeDisplayEl.textContent = "";
      }
    }

    if (dropZoneEl) {
      dropZoneEl.style.opacity = "0";
      setTimeout(() => {
        if (dropZoneEl.style.opacity === "0") {
          dropZoneEl.style.display = "none";
        }
      }, 300);
    }

    if (fileActionsContainerEl) {
      fileActionsContainerEl.style.display = "block";
      void fileActionsContainerEl.offsetWidth;
      fileActionsContainerEl.classList.add("visible");
    }

    if (existingSummariesContainerEl) {
      existingSummariesContainerEl.style.opacity = "0";
      setTimeout(() => {
        if (existingSummariesContainerEl.style.opacity === "0") {
          existingSummariesContainerEl.style.display = "none";
        }
      }, 300);
    }

    if (startBtnEl) startBtnEl.disabled = false;

  } else {
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = "";
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = "";

    if (dropZoneEl) {
      dropZoneEl.style.display = "flex";
      void dropZoneEl.offsetWidth;
      dropZoneEl.style.opacity = "1";
    }
    if (fileActionsContainerEl) {
      fileActionsContainerEl.classList.remove("visible");
      setTimeout(() => {
        if (!fileActionsContainerEl.classList.contains("visible")) {
          fileActionsContainerEl.style.display = "none";
        }
      }, 300);
    }

    if (existingSummariesContainerEl) {
      existingSummariesContainerEl.style.display = "block";
      void existingSummariesContainerEl.offsetWidth;
      existingSummariesContainerEl.style.opacity = "1";
    }
    if (fileInputEl) fileInputEl.value = "";
    if (startBtnEl) startBtnEl.disabled = true;
    if (importanceSliderEl) importanceSliderEl.value = "0.5";
    if (durationInputEl) durationInputEl.value = "";
  }
}

export function initUploadHandler() {
  dropZoneEl = document.getElementById("dropZone");
  fileInputEl = document.getElementById("fileInput");
  fileNameDisplayEl = document.getElementById("fileName");
  fileSizeDisplayEl = document.getElementById("fileSize");
  removeFileBtnEl = document.getElementById("removeFileBtn");
  startBtnEl = document.getElementById("startBtn");
  statusDivEl = document.getElementById("status");
  progressBarInnerEl = document.getElementById("progressBarInner");
  importanceSliderEl = document.getElementById('importanceSlider');
  durationInputEl = document.getElementById('durationInput');
  fileActionsContainerEl = document.getElementById("fileActionsContainer");
  existingSummariesContainerEl = document.querySelector(".existing-summaries-container");

  if (fileActionsContainerEl) fileActionsContainerEl.style.display = "none";
  if (existingSummariesContainerEl) existingSummariesContainerEl.style.display = "block";

  if (dropZoneEl) {
    ["dragenter", "dragover"].forEach((eventName) =>
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZoneEl.classList.add("hover");
      })
    );
    ["dragleave", "drop"].forEach((eventName) =>
      dropZoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZoneEl.classList.remove("hover");
      })
    );
    dropZoneEl.addEventListener("click", () => { if (fileInputEl) fileInputEl.click(); });
    dropZoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZoneEl.classList.remove("hover");
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  /* 파일 입력 변경 이벤트 핸들러 */
  if (fileInputEl) {
    fileInputEl.addEventListener("change", () => {
      if (fileInputEl.files.length > 0) handleFile(fileInputEl.files[0]);
    });
  }

  /* 선택된 파일 처리 함수 */
  function handleFile(file) {
    if (!file.type.startsWith("video/")) {
      showToast("비디오 파일만 업로드 가능합니다.", "warning");
      if (fileInputEl) fileInputEl.value = "";
      setUploadedFileName(null);
      return;
    }

    if (fileNameDisplayEl) fileNameDisplayEl.textContent = file.name;
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = formatFileSize(file.size);

    if (dropZoneEl) {
      dropZoneEl.style.opacity = "0";
      setTimeout(() => { if (dropZoneEl.style.opacity === "0") dropZoneEl.style.display = "none"; }, 300);
    }
    if (fileActionsContainerEl) {
      fileActionsContainerEl.style.display = "block";
      void fileActionsContainerEl.offsetWidth;
      fileActionsContainerEl.classList.add("visible");
    }
    if (existingSummariesContainerEl) {
      existingSummariesContainerEl.style.opacity = "0";
      setTimeout(() => { if (existingSummariesContainerEl.style.opacity === "0") existingSummariesContainerEl.style.display = "none"; }, 300);
    }
    if (startBtnEl) startBtnEl.disabled = false;
    uploadedFileName = file.name;

    uploadFile(file);
  }

  /* 실제 파일 업로드 (백엔드 통신) 함수 */
  async function uploadFile(file) {
    if (statusDivEl) statusDivEl.textContent = "⏳ 업로드 중...";
    if (startBtnEl) startBtnEl.disabled = true;

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        if (statusDivEl) statusDivEl.textContent = `✅ 업로드 성공: ${uploadedFileName}`;
        showToast("업로드가 완료되었습니다!", "success");
        if (startBtnEl) startBtnEl.disabled = false;
      } else {
        if (statusDivEl) statusDivEl.textContent = `❌ 업로드 실패: ${data.message || '알 수 없는 오류'}`;
        showToast(`업로드에 실패했습니다: ${data.message || '다시 시도해주세요.'}`, "error");
        resetInternalUIOnFileActionFailure();
      }
    } catch (error) {
      console.error("Upload error:", error);
      if (statusDivEl) statusDivEl.textContent = "❌ 업로드 중 오류 발생";
      showToast("업로드 중 오류가 발생했습니다.", "error");
      resetInternalUIOnFileActionFailure();
    }
  }

  /* 파일 관련 작업 실패 또는 명시적 리셋 시 UI 초기화 함수 */
  function resetInternalUIOnFileActionFailure() {
    setUploadedFileName(null);
    if (statusDivEl) statusDivEl.textContent = "";
    if (progressBarInnerEl) progressBarInnerEl.style.width = "0%";
  }

  /* 전체 UI 리셋 (removeFileBtn 클릭 시) */
  function resetUploadUIInternally() {
    console.log("Executing resetUploadUIInternally to clear all selections and options.");
    const oldInput = document.getElementById("fileInput");
    if (oldInput && oldInput.parentNode) {
      const newInput = oldInput.cloneNode(true);
      oldInput.parentNode.replaceChild(newInput, oldInput);
      fileInputEl = newInput;
      newInput.addEventListener("change", () => {
        if (newInput.files.length > 0) {
          handleFile(newInput.files[0]);
        }
      });
    } else if (fileInputEl) {
      fileInputEl.value = "";
    }

    resetInternalUIOnFileActionFailure(); // 공통 UI 초기화
  }

  if (removeFileBtnEl) {
    removeFileBtnEl.addEventListener("click", resetUploadUIInternally);
  }
}