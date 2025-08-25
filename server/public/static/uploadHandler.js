// public/static/uploadHandler.js
import { showToast, formatFileSize, formatTime, formatTimeHMS } from "./uiUtils.js";
import { scrollToSectionExternally } from "./scrollHandler.js";

// --- 모듈 스코프 변수 ---
export let uploadedFileName = ""; // 다른 모듈에서 참조할 수 있도록 export
let originalVideoDurationSeconds = 0; // 원본 영상 길이(초)
let durationPercentageInputEl = null; // 요약 비율 입력 요소
let calculatedDurationOutputEl = null; // 계산된 요약 결과 시간 표시 요소

// --- DOM 요소 변수 ---
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
let increaseBtnEl = null;
let decreaseBtnEl = null;

/**
 * '요약 시작' 버튼의 활성화 상태 업데이트
 * 파일이 업로드되어 있고, 요약 비율이 유효한 경우에만 활성화
 */
function updateStartButtonState() {
  if (!startBtnEl || !uploadedFileName) {
    if (startBtnEl) startBtnEl.disabled = true;
    return;
  }

  // 요약 퍼센트 값 검증
  const isValidPercentage = validateDurationPercentage();
  startBtnEl.disabled = !isValidPercentage;
}

/**
 * 요약 비율(%) 입력 값이 유효한지(1~80) 검증
 * @returns {boolean} 유효성 여부
 */
function validateDurationPercentage() {
  if (!durationPercentageInputEl) return false;

  const percentage = parseFloat(durationPercentageInputEl.value);
  return !isNaN(percentage) && percentage >= 1 && percentage <= 80;
}

/**
 * 요약 비율 스피너(증가/감소) 버튼의 비활성화 상태 업데이트
 */
function updateSpinnerButtonStates() {
  if (!increaseBtnEl || !decreaseBtnEl || !durationPercentageInputEl) return;

  const value = parseInt(durationPercentageInputEl.value) || 0;
  decreaseBtnEl.disabled = value <= 1;
  increaseBtnEl.disabled = value >= 80;
}

/**
 * 요약 비율 값을 주어진 만큼 변경
 * @param {number} delta - 변경할 값 (예: 1 또는 -1)
 */
function changePercentageValue(delta) {
  if (!durationPercentageInputEl) return;

  const currentValue = parseInt(durationPercentageInputEl.value) || 20;
  const newValue = Math.max(1, Math.min(80, currentValue + delta));
  durationPercentageInputEl.value = newValue;

  // input 이벤트 트리거 (기존 로직 실행)
  durationPercentageInputEl.dispatchEvent(new Event('input', { bubbles: true }));
  updateSpinnerButtonStates();
}

/**
 * 업로드된 파일의 정보를 설정하고 관련 UI 업데이트
 * 파일이 제거된 경우(newFileName이 null) UI를 초기 상태로 리셋
 * @param {string|null} newFileName - 새로 업로드된 파일의 이름 또는 null
 * @param {number} [fileSizeMB] - 파일 크기(MB)
 * @param {object|null} [videoInfo] - 서버에서 받은 비디오 메타데이터
 */
export function setUploadedFileName(newFileName, fileSizeMB, videoInfo = null) {
  uploadedFileName = newFileName;

  // DOM 요소 가져오기
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
      calculateAndUpdateDuration(); // 예상 결과 시간 계산
    }

    // 해상도, 코덱 등 기타 정보 표시
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

    // UI 상태 변경: 드롭존 숨기고, 파일 정보/액션 컨테이너 표시
    updateStartButtonState();
    if (removeFileBtnEl) removeFileBtnEl.style.display = 'flex';
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
      fileActionsContainerEl.classList.add("visible"); 
    }

  } else {
    // --- 파일이 없는 경우: UI를 초기 상태로 리셋 ---
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = "선택된 파일 없음";
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = "N/A";
    if (fileDurationDisplayEl) fileDurationDisplayEl.textContent = "N/A";
    if (fileTypeDisplayEl) fileTypeDisplayEl.textContent = "N/A";
    if (fileResolutionDisplayEl) fileResolutionDisplayEl.textContent = "N/A";
    if (fileBitrateDisplayEl) fileBitrateDisplayEl.textContent = "N/A";

    // UI 상태 변경: 드롭존 표시, 버튼 비활성화 등
    if (fileInputEl) fileInputEl.value = "";
    if (startBtnEl) startBtnEl.disabled = true;
    if (removeFileBtnEl) removeFileBtnEl.style.display = 'none';
    if (dropZoneEl) { 
      dropZoneEl.style.display = "flex"; 
      void dropZoneEl.offsetWidth; // 리플로우 강제
      dropZoneEl.style.opacity = "1";
    }

    // 옵션 초기화
    const importanceSliderEl = document.getElementById('importanceSlider');
    if (importanceSliderEl) importanceSliderEl.value = "0.5";
    if (durationPercentageInputEl) durationPercentageInputEl.value = "20";
    if (calculatedDurationOutputEl) calculatedDurationOutputEl.value = "00분 00초";
    originalVideoDurationSeconds = 0;
  }
}

/**
 * 현재 설정된 요약 비율에 따라 예상 결과 영상 길이를 계산하고 UI에 표시
 */
function calculateAndUpdateDuration() {
  if (!durationPercentageInputEl || !calculatedDurationOutputEl) {
    return;
  }
  if (originalVideoDurationSeconds <= 0) {
    calculatedDurationOutputEl.value = "00분 00초";
    return;
  }
  const percentage = parseFloat(durationPercentageInputEl.value);
  if (isNaN(percentage) || percentage < 1 || percentage > 80) {
    calculatedDurationOutputEl.value = "00분 00초";
    return;
  }
  const calculatedSeconds = (originalVideoDurationSeconds * percentage) / 100;
  calculatedDurationOutputEl.value = formatTimeHMS(calculatedSeconds);
}

/**
 * 업로드 핸들러를 초기화하고, 드래그 앤 드롭 등 모든 관련 이벤트 리스너를 설정
 */
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
  increaseBtnEl = document.getElementById("increaseBtn");
  decreaseBtnEl = document.getElementById("decreaseBtn");

  // --- 초기 UI 상태 설정 ---
  if (dropZoneEl) {
    dropZoneEl.style.display = "flex"; // 파일 없을 때 보이도록 설정 
    dropZoneEl.style.opacity = "1";
  }
  if (fileActionsContainerEl) {
    fileActionsContainerEl.style.display = "block"; // 항상 보이도록 설정
    fileActionsContainerEl.style.opacity = "1";
    fileActionsContainerEl.classList.add("visible");
  }
  setUploadedFileName(null); // 초기 UI는 파일 없는 상태로 설정

  // 요약 비율 입력(input) 이벤트 리스너
  if (durationPercentageInputEl) {
    durationPercentageInputEl.addEventListener('input', () => {
      calculateAndUpdateDuration();
      updateStartButtonState(); // 퍼센트 값 변경 시 시작 버튼 상태 업데이트
      updateSpinnerButtonStates(); // 스피너 버튼 상태 업데이트
    });

    // 키보드 단축키 지원
    durationPercentageInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        changePercentageValue(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changePercentageValue(-1);
      }
    });
  }

  // 스피너 버튼 이벤트 리스너
  if (increaseBtnEl) {
    increaseBtnEl.addEventListener('click', () => changePercentageValue(1));
  }

  if (decreaseBtnEl) {
    decreaseBtnEl.addEventListener('click', () => changePercentageValue(-1));
  }

  // 초기 스피너 버튼 상태 설정
  updateSpinnerButtonStates();

  // 드래그 앤 드롭 이벤트 리스너 설정
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

  // 파일 입력(input type="file") 변경 이벤트 리스너
  if (fileInputEl) {
    fileInputEl.addEventListener("change", () => {
      if (fileInputEl.files.length > 0) handleFile(fileInputEl.files[0]);
    });
  }

  /**
   * 선택되거나 드롭된 파일 처리
   * @param {File} file - 처리할 파일 객체
   */
  async function handleFile(file) {
    if (!file.type.startsWith("video/")) {
      showToast("비디오 파일만 업로드 가능합니다.", "warning");
      if (fileInputEl) fileInputEl.value = "";
      return;
    }
    uploadFileAndGetInfo(file);
  }

  /**
   * 파일을 서버로 업로드하고, 서버로부터 비디오 메타데이터를 받아오는 함수
   * @param {File} file - 업로드할 파일 객체
   */
  async function uploadFileAndGetInfo(file) {
    if (startBtnEl) startBtnEl.disabled = true;

    const formData = new FormData();
    formData.append("video", file);

    try {
      // '/upload' 엔드포인트로 파일 전송
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();

      // 성공 시 UI 업데이트
      if (res.ok && data.filename) {
        setUploadedFileName(data.filename, file.size / (1024 * 1024), data.videoInfo);
      } 
      // 실패 시 오류 메시지 표시 및 UI 초기화
      else {
        showToast(`업로드 또는 파일 정보 분석 실패: ${data.message || '알 수 없는 오류'}`, "error");
        setUploadedFileName(null); // 실패 시 UI 초기화 (드롭존 다시 보이도록)
      }
    } catch (error) {
      console.error("Upload error or info request error:", error);
      showToast("업로드 또는 파일 정보 분석 중 오류가 발생했습니다.", "error");
      setUploadedFileName(null); // 오류 시 UI 초기화 (드롭존 다시 보이도록)
    }
  }

  // '파일 제거' 버튼 이벤트 리스너
  if (removeFileBtnEl) {
    removeFileBtnEl.addEventListener("click", () => {
      setUploadedFileName(null);
    });
  }
}