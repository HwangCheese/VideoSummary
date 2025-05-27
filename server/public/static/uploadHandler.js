// public/static/uploadHandler.js
import { showToast, formatFileSize, formatTime, formatTimeHMS } from "./uiUtils.js";
import { scrollToSectionExternally } from "./scrollHandler.js";

export let uploadedFileName = "";
let originalVideoDurationSeconds = 0;
let durationPercentageInputEl = null;
let calculatedDurationOutputEl = null;

// DOM 요소 변수 선언
let dropZoneEl = null;
let fileInputEl = null;
let fileNameDisplayEl = null;
let fileSizeDisplayEl = null;
let fileDurationDisplayEl = null;
let fileTypeDisplayEl = null;
let fileResolutionDisplayEl = null;
let fileBitrateDisplayEl = null;
let removeFileBtnEl = null;
let startBtnEl = null;
let fileActionsContainerEl = null; // 파일 정보 및 옵션을 포함하는 컨테이너

export function setUploadedFileName(newFileName, fileSizeMB, videoInfo = null) {
  uploadedFileName = newFileName;

  // DOM 요소 가져오기 (init에서 이미 할당되었지만, 안전하게 다시 확인)
  if (!fileNameDisplayEl) fileNameDisplayEl = document.getElementById("fileName");
  if (!fileSizeDisplayEl) fileSizeDisplayEl = document.getElementById("fileSize");
  if (!fileDurationDisplayEl) fileDurationDisplayEl = document.getElementById("fileDuration");
  if (!fileTypeDisplayEl) fileTypeDisplayEl = document.getElementById("fileType");
  if (!fileResolutionDisplayEl) fileResolutionDisplayEl = document.getElementById("fileResolution");
  if (!fileBitrateDisplayEl) fileBitrateDisplayEl = document.getElementById("fileBitrate");
  if (!startBtnEl) startBtnEl = document.getElementById("startBtn");
  if (!fileInputEl) fileInputEl = document.getElementById("fileInput");
  if (!removeFileBtnEl) removeFileBtnEl = document.getElementById("removeFileBtn");
  if (!dropZoneEl) dropZoneEl = document.getElementById("dropZone"); // 드롭존 참조 추가
  if (!fileActionsContainerEl) fileActionsContainerEl = document.getElementById("fileActionsContainer");


  if (newFileName) {
    // 파일 정보 업데이트
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = newFileName;
    if (fileSizeDisplayEl) {
      fileSizeDisplayEl.textContent = fileSizeMB !== undefined ? `${fileSizeMB.toFixed(2)} MB` : "N/A";
    }
    if (fileDurationDisplayEl) {
      fileDurationDisplayEl.textContent = videoInfo && videoInfo.duration ? formatTimeHMS(videoInfo.duration) : "N/A";
      originalVideoDurationSeconds = (videoInfo && videoInfo.duration && !isNaN(parseFloat(videoInfo.duration))) ? parseFloat(videoInfo.duration) : 0;
      calculateAndUpdateDuration();
    }
    if (fileTypeDisplayEl) {
      const serverCodec = videoInfo && (videoInfo.video_codec || videoInfo.codec_name);
      fileTypeDisplayEl.textContent = serverCodec ? serverCodec.split('/')[0].trim() : "N/A";
    }
    if (fileResolutionDisplayEl) {
      fileResolutionDisplayEl.textContent = videoInfo && videoInfo.width && videoInfo.height ? `${videoInfo.width}x${videoInfo.height}` : "N/A";
    }
    if (fileBitrateDisplayEl) {
      fileBitrateDisplayEl.textContent = videoInfo && videoInfo.bit_rate && !isNaN(parseInt(videoInfo.bit_rate)) ? `${(parseInt(videoInfo.bit_rate) / 1000000).toFixed(2)} Mbps` : "N/A";
    }

    // UI 상태 변경
    if (startBtnEl) startBtnEl.disabled = false;
    if (removeFileBtnEl) removeFileBtnEl.style.display = 'flex';
    if (dropZoneEl) { // 파일 선택 시 드롭존 숨김
      dropZoneEl.style.opacity = "0";
      setTimeout(() => {
        if (dropZoneEl.style.opacity === "0") { // 애니메이션 중 상태 변경 방지
          dropZoneEl.style.display = "none";
        }
      }, 300); // CSS transition 시간과 일치 또는 약간 길게
    }
    if (fileActionsContainerEl) { // 파일 정보 컨테이너는 항상 보이도록 유지 (이미 init에서 설정)
      fileActionsContainerEl.style.display = "block";
      fileActionsContainerEl.classList.add("visible"); // 애니메이션 클래스
    }

  } else { // 파일이 없는 초기 상태 또는 파일 제거 시
    // 파일 정보 초기화
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = "선택된 파일 없음";
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = "N/A";
    if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "N/A";
    if (fileTypeDisplayEl) fileTypeDisplayEl.textContent = "N/A";
    if (fileResolutionDisplayEl) fileResolutionDisplayEl.textContent = "N/A";
    if (fileBitrateDisplayEl) fileBitrateDisplayEl.textContent = "N/A";

    // UI 상태 변경
    if (fileInputEl) fileInputEl.value = "";
    if (startBtnEl) startBtnEl.disabled = true;
    if (removeFileBtnEl) removeFileBtnEl.style.display = 'none';
    if (dropZoneEl) { // 파일 제거 시 드롭존 다시 보이기
      dropZoneEl.style.display = "flex"; // 또는 원래 display 속성
      void dropZoneEl.offsetWidth; // 리플로우 강제
      dropZoneEl.style.opacity = "1";
    }
    // fileActionsContainerEl은 계속 보이도록 유지 (내용만 초기화됨)

    // 옵션 초기화
    const importanceSliderEl = document.getElementById('importanceSlider');
    if (importanceSliderEl) importanceSliderEl.value = "0.5";
    if (durationPercentageInputEl) durationPercentageInputEl.value = "20";
    if (calculatedDurationOutputEl) calculatedDurationOutputEl.value = "00분 00초";
    originalVideoDurationSeconds = 0;
  }
}

function calculateAndUpdateDuration() {
  if (!durationPercentageInputEl || !calculatedDurationOutputEl) {
    return;
  }
  if (originalVideoDurationSeconds <= 0) {
    calculatedDurationOutputEl.value = "00분 00초";
    return;
  }
  const percentage = parseFloat(durationPercentageInputEl.value);
  if (isNaN(percentage) || percentage < 1 || percentage > 100) {
    calculatedDurationOutputEl.value = "00분 00초";
    return;
  }
  const calculatedSeconds = (originalVideoDurationSeconds * percentage) / 100;
  calculatedDurationOutputEl.value = formatTimeHMS(calculatedSeconds);
}

export function initUploadHandler() {
  dropZoneEl = document.getElementById("dropZone");
  fileInputEl = document.getElementById("fileInput");
  fileNameDisplayEl = document.getElementById("fileName");
  fileSizeDisplayEl = document.getElementById("fileSize");
  fileDurationDisplayEl = document.getElementById("fileDuration");
  fileTypeDisplayEl = document.getElementById("fileType");
  fileResolutionDisplayEl = document.getElementById("fileResolution");
  fileBitrateDisplayEl = document.getElementById("fileBitrate");
  removeFileBtnEl = document.getElementById("removeFileBtn");
  startBtnEl = document.getElementById("startBtn");
  fileActionsContainerEl = document.getElementById("fileActionsContainer");
  durationPercentageInputEl = document.getElementById("durationPercentageInput");
  calculatedDurationOutputEl = document.getElementById("calculatedDurationOutput");

  // --- 초기 UI 상태 설정 ---
  // dropZoneEl은 처음에 보이도록 하고, fileActionsContainerEl도 처음부터 보이도록 설정
  if (dropZoneEl) {
    dropZoneEl.style.display = "flex"; // 항상 보이도록 설정 (파일 없을 때)
    dropZoneEl.style.opacity = "1";
  }
  if (fileActionsContainerEl) {
    fileActionsContainerEl.style.display = "block"; // 항상 보이도록 설정
    fileActionsContainerEl.style.opacity = "1";
    fileActionsContainerEl.classList.add("visible");
  }
  setUploadedFileName(null); // 초기 UI는 파일 없는 상태로 설정

  if (durationPercentageInputEl) {
    durationPercentageInputEl.addEventListener('input', calculateAndUpdateDuration);
  }

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

  if (fileInputEl) {
    fileInputEl.addEventListener("change", () => {
      if (fileInputEl.files.length > 0) handleFile(fileInputEl.files[0]);
    });
  }

  async function handleFile(file) {
    if (!file.type.startsWith("video/")) {
      showToast("비디오 파일만 업로드 가능합니다.", "warning");
      if (fileInputEl) fileInputEl.value = "";
      return;
    }
    uploadFileAndGetInfo(file);
  }

  function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = function () {
        window.URL.revokeObjectURL(video.src);
        reject("비디오 메타데이터 로드 오류");
      };
      video.src = URL.createObjectURL(file);
    });
  }

  async function uploadFileAndGetInfo(file) {
    if (startBtnEl) startBtnEl.disabled = true;

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok && data.filename) {
        setUploadedFileName(data.filename, file.size / (1024 * 1024), data.videoInfo);
        if (startBtnEl) startBtnEl.disabled = false;
      } else {
        showToast(`업로드 또는 파일 정보 분석 실패: ${data.message || '알 수 없는 오류'}`, "error");
        setUploadedFileName(null); // 실패 시 UI 초기화 (드롭존 다시 보이도록)
      }
    } catch (error) {
      console.error("Upload error or info request error:", error);
      showToast("업로드 또는 파일 정보 분석 중 오류가 발생했습니다.", "error");
      setUploadedFileName(null); // 오류 시 UI 초기화 (드롭존 다시 보이도록)
    }
  }

  if (removeFileBtnEl) {
    removeFileBtnEl.addEventListener("click", () => {
      setUploadedFileName(null);
    });
  }
}