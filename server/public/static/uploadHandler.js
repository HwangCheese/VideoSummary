// public/static/uploadHandler.js
import { showToast, formatFileSize, formatTime } from "./uiUtils.js";

export let uploadedFileName = "";
let originalVideoDurationSeconds = 0;
let durationPercentageInputEl = null;
let calculatedDurationOutputEl = null;

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
let statusDivEl = null;
let progressBarInnerEl = null;
let importanceSliderEl = null;
let durationInputEl = null;
let fileActionsContainerEl = null;
let existingSummariesContainerEl = null;

export function setUploadedFileName(newFileName, fileSizeMB, videoInfo = null) {
  uploadedFileName = newFileName;

  if (!dropZoneEl) dropZoneEl = document.getElementById("dropZone");
  if (!fileNameDisplayEl) fileNameDisplayEl = document.getElementById("fileName");
  if (!fileSizeDisplayEl) fileSizeDisplayEl = document.getElementById("fileSize");
  if (!fileDurationDisplayEl) fileDurationDisplayEl = document.getElementById("fileDuration");
  if (!fileTypeDisplayEl) fileTypeDisplayEl = document.getElementById("fileType");
  if (!fileResolutionDisplayEl) fileResolutionDisplayEl = document.getElementById("fileResolution");
  if (!fileBitrateDisplayEl) fileBitrateDisplayEl = document.getElementById("fileBitrate");
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

    if (fileDurationDisplayEl) {
      fileDurationDisplayEl.textContent = videoInfo && videoInfo.duration ? formatTime(videoInfo.duration) : "N/A";
    }
    if (fileTypeDisplayEl) {
      fileTypeDisplayEl.textContent = videoInfo && videoInfo.codec_name ? videoInfo.codec_name.split('/')[0].trim() : "N/A";
    }
    if (fileResolutionDisplayEl) {
      fileResolutionDisplayEl.textContent = videoInfo && videoInfo.width && videoInfo.height ? `${videoInfo.width}x${videoInfo.height}` : "N/A";
    }
    if (fileBitrateDisplayEl) {
      fileBitrateDisplayEl.textContent = videoInfo && videoInfo.bit_rate ? `${(videoInfo.bit_rate / 1000000).toFixed(2)} Mbps` : "N/A";
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
    if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "";
    if (fileTypeDisplayEl) fileTypeDisplayEl.textContent = "";
    if (fileResolutionDisplayEl) fileResolutionDisplayEl.textContent = "";
    if (fileBitrateDisplayEl) fileBitrateDisplayEl.textContent = "";

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
  fileDurationDisplayEl = document.getElementById("fileDuration");
  fileTypeDisplayEl = document.getElementById("fileType");
  fileResolutionDisplayEl = document.getElementById("fileResolution");
  fileBitrateDisplayEl = document.getElementById("fileBitrate");
  removeFileBtnEl = document.getElementById("removeFileBtn");
  startBtnEl = document.getElementById("startBtn");
  statusDivEl = document.getElementById("status");
  progressBarInnerEl = document.getElementById("progressBarInner");
  importanceSliderEl = document.getElementById('importanceSlider');
  durationInputEl = document.getElementById('durationInput');
  fileActionsContainerEl = document.getElementById("fileActionsContainer");
  existingSummariesContainerEl = document.querySelector(".existing-summaries-container");
  durationPercentageInputEl = document.getElementById("durationPercentageInput");
  calculatedDurationOutputEl = document.getElementById("calculatedDurationOutput");

  if (fileActionsContainerEl) fileActionsContainerEl.style.display = "none";
  if (existingSummariesContainerEl) existingSummariesContainerEl.style.display = "block";

  function calculateAndUpdateDuration() {
    if (!durationPercentageInputEl || !calculatedDurationOutputEl || originalVideoDurationSeconds <= 0) {
      if (calculatedDurationOutputEl) calculatedDurationOutputEl.value = "00:00";
      return;
    }

    const percentage = parseFloat(durationPercentageInputEl.value);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      calculatedDurationOutputEl.value = "00:00";
      return;
    }

    const calculatedSeconds = (originalVideoDurationSeconds * percentage) / 100;
    calculatedDurationOutputEl.value = formatTime(calculatedSeconds);
  }

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
      setUploadedFileName(null);
      return;
    }

    if (fileNameDisplayEl) fileNameDisplayEl.textContent = file.name;
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = formatFileSize(file.size);
    if (durationPercentageInputEl) {
      durationPercentageInputEl.value = "20"; // 기본값 20%
    }
    if (calculatedDurationOutputEl) calculatedDurationOutputEl.value = "00:00";

    if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "길이 분석중...";
    originalVideoDurationSeconds = 0;

    try {
      const duration = await getVideoDuration(file);
      originalVideoDurationSeconds = duration;
      if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = formatTime(duration);
      calculateAndUpdateDuration();
    } catch (error) {
      console.error("원본 영상 길이 가져오기 실패:", error);
      if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "N/A";
      calculateAndUpdateDuration();
    }

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
    uploadedFileName = file.name;

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
    if (statusDivEl) statusDivEl.textContent = "⏳ 업로드 중...";
    if (startBtnEl) startBtnEl.disabled = true;

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();
      console.log("[DEBUG] Server response from /upload:", JSON.parse(JSON.stringify(data)));

      if (res.ok && data.filename) {
        uploadedFileName = data.filename;
        if (fileNameDisplayEl) fileNameDisplayEl.textContent = uploadedFileName;

        if (data.videoInfo && typeof data.videoInfo === 'object') {
          console.log("[DEBUG] Received videoInfo from server:", JSON.parse(JSON.stringify(data.videoInfo)));

          if (fileDurationDisplayEl) {
            fileDurationDisplayEl.textContent = data.videoInfo.duration && !isNaN(parseFloat(data.videoInfo.duration))
              ? formatTime(parseFloat(data.videoInfo.duration))
              : "N/A";
          }
          if (fileTypeDisplayEl) {
            const serverCodec = data.videoInfo.video_codec || data.videoInfo.codec_name;
            fileTypeDisplayEl.textContent = serverCodec ? serverCodec.split('/')[0].trim() : (file.type || 'N/A');
          }
          if (fileResolutionDisplayEl) {
            fileResolutionDisplayEl.textContent = data.videoInfo.width && data.videoInfo.height
              ? `${data.videoInfo.width}x${data.videoInfo.height}`
              : "N/A";
          }
          if (fileBitrateDisplayEl) {
            fileBitrateDisplayEl.textContent = data.videoInfo.bit_rate && !isNaN(parseInt(data.videoInfo.bit_rate))
              ? `${(parseInt(data.videoInfo.bit_rate) / 1000000).toFixed(2)} Mbps`
              : "N/A";
          }
        } else {
          console.warn("서버에서 videoInfo를 받지 못했거나 유효하지 않습니다. 클라이언트에서 일부 정보만 다시 시도합니다.");
          if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "길이 계산 중...";
          getVideoDuration(file)
            .then(duration => {
              if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = formatTime(duration);
            })
            .catch(() => {
              if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "길이 N/A";
            });
          if (fileTypeDisplayEl) fileTypeDisplayEl.textContent = file.type || 'N/A'; // MIME 타입이라도 표시
          if (fileResolutionDisplayEl) fileResolutionDisplayEl.textContent = "N/A";
          if (fileBitrateDisplayEl) fileBitrateDisplayEl.textContent = "N/A";
        }
        if (statusDivEl) statusDivEl.textContent = `✅ 업로드 성공: ${uploadedFileName}`;
        if (startBtnEl) startBtnEl.disabled = false;
      } else {
        if (statusDivEl) statusDivEl.textContent = `❌ 업로드 실패: ${data.message || '알 수 없는 오류'}`;
        showToast(`업로드에 실패했습니다: ${data.message || '다시 시도해주세요.'}`, "error");
        resetInternalUIOnFileActionFailure();
      }
    } catch (error) {
      console.error("Upload error or info request error:", error);
      if (statusDivEl) statusDivEl.textContent = "❌ 업로드/정보 요청 중 오류 발생";
      showToast("업로드 또는 파일 정보 분석 중 오류가 발생했습니다.", "error");
      resetInternalUIOnFileActionFailure();
    }
  }

  function resetInternalUIOnFileActionFailure() {
    setUploadedFileName(null); // 모든 UI 초기화는 setUploadedFileName(null)에 위임
    if (statusDivEl) statusDivEl.textContent = "";
    if (progressBarInnerEl) progressBarInnerEl.style.width = "0%";
  }

  function resetUploadUIInternally() {
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
    resetInternalUIOnFileActionFailure();
  }

  if (removeFileBtnEl) {
    removeFileBtnEl.addEventListener("click", resetUploadUIInternally);
  }
}