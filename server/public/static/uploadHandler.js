// public/static/uploadHandler.js
import { showToast, formatFileSize } from "./uiUtils.js";

export let uploadedFileName = "";

// DOM 요소들을 모듈 스코프에 선언
let dropZoneEl = null;
let fileInputEl = null;
let fileNameDisplayEl = null;
let fileSizeDisplayEl = null;
let removeFileBtnEl = null;
let startBtnEl = null;
let statusDivEl = null; // 파일 업로드 상태 메시지용
let progressBarInnerEl = null; // 파일 업로드 진행률 바 용
let importanceSliderEl = null;
let durationInputEl = null;
let fileActionsContainerEl = null; // 파일 정보 및 옵션 전체 컨테이너
let existingSummariesContainerEl = null; // "기존 요약 영상 보기" 버튼 및 목록 컨테이너

// setUploadedFileName: 주로 외부 모듈(existingSummariesHandler)에서 호출되어 UI 상태를 설정
export function setUploadedFileName(newFileName, fileSizeMB) {
  uploadedFileName = newFileName;

  // DOM 요소들이 초기화되지 않았을 경우를 대비해 참조 (방어적 코딩)
  if (!dropZoneEl) dropZoneEl = document.getElementById("dropZone");
  if (!fileNameDisplayEl) fileNameDisplayEl = document.getElementById("fileName");
  if (!fileSizeDisplayEl) fileSizeDisplayEl = document.getElementById("fileSize");
  if (!fileActionsContainerEl) fileActionsContainerEl = document.getElementById("fileActionsContainer");
  if (!startBtnEl) startBtnEl = document.getElementById("startBtn");
  if (!importanceSliderEl) importanceSliderEl = document.getElementById('importanceSlider');
  if (!durationInputEl) durationInputEl = document.getElementById('durationInput');
  if (!fileInputEl) fileInputEl = document.getElementById("fileInput");
  if (!existingSummariesContainerEl) existingSummariesContainerEl = document.querySelector(".existing-summaries-container");


  if (newFileName) { // 파일이 설정된 경우 (새 파일 업로드 또는 기존 요약 선택)
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = newFileName;
    if (fileSizeDisplayEl) {
      if (fileSizeMB !== undefined) {
        fileSizeDisplayEl.textContent = `${fileSizeMB.toFixed(2)} MB`;
      } else {
        fileSizeDisplayEl.textContent = ""; // 크기 정보 없으면 비움
      }
    }

    // 드롭존 숨기기 (애니메이션 포함)
    if (dropZoneEl) {
      dropZoneEl.style.opacity = "0";
      setTimeout(() => {
        // opacity가 여전히 0일 때만 (즉, 다시 보이도록 하는 명령이 중간에 없었을 때만) display:none 처리
        if (dropZoneEl.style.opacity === "0") {
          dropZoneEl.style.display = "none";
        }
      }, 300); // CSS transition 시간과 일치
    }

    // 파일 정보 및 옵션 컨테이너 보이기 (애니메이션 포함)
    if (fileActionsContainerEl) {
      fileActionsContainerEl.style.display = "block"; // 먼저 공간을 차지하도록 block
      void fileActionsContainerEl.offsetWidth; // 브라우저 리플로우 강제 (트랜지션 시작점 인식)
      fileActionsContainerEl.classList.add("visible"); // visible 클래스로 opacity 1로 변경 (CSS 트랜지션 발동)
    }

    // "기존 요약 영상 보기" 컨테이너 숨기기 (애니메이션 포함)
    if (existingSummariesContainerEl) {
      existingSummariesContainerEl.style.opacity = "0";
      setTimeout(() => {
        if (existingSummariesContainerEl.style.opacity === "0") {
          existingSummariesContainerEl.style.display = "none";
        }
      }, 300);
    }

    if (startBtnEl) startBtnEl.disabled = false; // 요약 시작 버튼 활성화

  } else { // 파일이 제거된 경우 (UI 초기화)
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = "";
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = "";

    // 드롭존 다시 보이기 (애니메이션 포함)
    if (dropZoneEl) {
      dropZoneEl.style.display = "flex"; // 먼저 공간을 차지하도록 flex (또는 초기 display 값)
      void dropZoneEl.offsetWidth;
      dropZoneEl.style.opacity = "1";
    }

    // 파일 정보 및 옵션 컨테이너 숨기기 (애니메이션 포함)
    if (fileActionsContainerEl) {
      fileActionsContainerEl.classList.remove("visible"); // opacity 0으로 변경 (CSS 트랜지션 발동)
      setTimeout(() => {
        // visible 클래스가 여전히 없을 때만 (즉, 다시 보이도록 하는 명령이 중간에 없었을 때만) display:none 처리
        if (!fileActionsContainerEl.classList.contains("visible")) {
          fileActionsContainerEl.style.display = "none";
        }
      }, 300); // CSS transition 시간과 일치
    }

    // "기존 요약 영상 보기" 컨테이너 다시 보이기 (애니메이션 포함)
    if (existingSummariesContainerEl) {
      existingSummariesContainerEl.style.display = "block"; // 또는 초기 display 값 (예: flex)
      void existingSummariesContainerEl.offsetWidth;
      existingSummariesContainerEl.style.opacity = "1";
    }

    if (fileInputEl) fileInputEl.value = ""; // 실제 파일 입력 값 초기화
    if (startBtnEl) startBtnEl.disabled = true; // 요약 시작 버튼 비활성화

    // 옵션 값들도 초기화
    if (importanceSliderEl) importanceSliderEl.value = "0.5";
    if (durationInputEl) durationInputEl.value = "";
  }
}

export function initUploadHandler() {
  // DOM 요소 참조 초기화
  dropZoneEl = document.getElementById("dropZone");
  fileInputEl = document.getElementById("fileInput");
  fileNameDisplayEl = document.getElementById("fileName");
  fileSizeDisplayEl = document.getElementById("fileSize");
  removeFileBtnEl = document.getElementById("removeFileBtn");
  startBtnEl = document.getElementById("startBtn");
  statusDivEl = document.getElementById("status"); // HTML에 해당 ID 요소 필요
  progressBarInnerEl = document.getElementById("progressBarInner"); // HTML에 해당 ID 요소 필요
  importanceSliderEl = document.getElementById('importanceSlider');
  durationInputEl = document.getElementById('durationInput');
  fileActionsContainerEl = document.getElementById("fileActionsContainer");
  existingSummariesContainerEl = document.querySelector(".existing-summaries-container");

  // 초기 UI 상태 설정: 파일이 없으므로 파일 정보/옵션 숨기고, 기존 요약 보기는 보이도록
  if (fileActionsContainerEl) fileActionsContainerEl.style.display = "none";
  if (existingSummariesContainerEl) existingSummariesContainerEl.style.display = "block"; // 또는 초기 display값


  /* Drag & Drop 이벤트 핸들러 */
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
      // 유효하지 않은 파일 선택 시 UI 초기화
      setUploadedFileName(null); // null을 전달하여 초기화 로직 실행
      return;
    }

    // 유효한 파일이면 setUploadedFileName 호출하여 UI 업데이트 및 전역 변수 설정
    // (이 함수는 내부적으로 uploadFile을 호출하지 않음, UI 업데이트만 담당)
    // setUploadedFileName(file.name, file.size / (1024*1024)); // 파일 크기를 MB로 전달

    // UI 업데이트 후 실제 백엔드 업로드 진행
    // 파일 이름/크기 표시는 setUploadedFileName에서 처리하므로 여기서는 중복 X
    if (fileNameDisplayEl) fileNameDisplayEl.textContent = file.name; // 직접 설정
    if (fileSizeDisplayEl) fileSizeDisplayEl.textContent = formatFileSize(file.size); // 직접 설정

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
    uploadedFileName = file.name; // 전역 변수 직접 업데이트

    uploadFile(file); // 백엔드 업로드
  }

  /* 실제 파일 업로드 (백엔드 통신) 함수 */
  async function uploadFile(file) {
    if (statusDivEl) statusDivEl.textContent = "⏳ 업로드 중...";
    // progressBarInnerEl 업데이트 로직 추가 가능
    if (startBtnEl) startBtnEl.disabled = true; // 업로드 중에는 시작 버튼 비활성화

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        // uploadedFileName = data.filename; // 서버에서 반환된 파일명으로 최종 확정 (필요시)
        if (statusDivEl) statusDivEl.textContent = `✅ 업로드 성공: ${uploadedFileName}`; // 이미 설정된 파일명 사용
        showToast("업로드가 완료되었습니다!", "success");
        if (startBtnEl) startBtnEl.disabled = false; // 업로드 성공 후 시작 버튼 다시 활성화
      } else {
        if (statusDivEl) statusDivEl.textContent = `❌ 업로드 실패: ${data.message || '알 수 없는 오류'}`;
        showToast(`업로드에 실패했습니다: ${data.message || '다시 시도해주세요.'}`, "error");
        resetInternalUIOnFileActionFailure(); // 업로드 실패 시 UI 초기화
      }
    } catch (error) {
      console.error("Upload error:", error);
      if (statusDivEl) statusDivEl.textContent = "❌ 업로드 중 오류 발생";
      showToast("업로드 중 오류가 발생했습니다.", "error");
      resetInternalUIOnFileActionFailure(); // 통신 오류 시 UI 초기화
    }
  }

  /* 파일 관련 작업 실패 또는 명시적 리셋 시 UI 초기화 함수 */
  function resetInternalUIOnFileActionFailure() {
    // setUploadedFileName(null) 호출로 모든 UI 초기화 로직 통합
    setUploadedFileName(null);
    // 추가적으로 statusDivEl, progressBarInnerEl 초기화
    if (statusDivEl) statusDivEl.textContent = "";
    if (progressBarInnerEl) progressBarInnerEl.style.width = "0%";
  }

  /* 전체 UI 리셋 (removeFileBtn 클릭 시) */
  function resetUploadUIInternally() {
    console.log("Executing resetUploadUIInternally to clear all selections and options.");

    // 파일 입력(input type="file")을 새로 만들어서 교체 (선택된 파일 완전 제거)
    const oldInput = document.getElementById("fileInput");
    if (oldInput && oldInput.parentNode) {
      const newInput = oldInput.cloneNode(true);
      oldInput.parentNode.replaceChild(newInput, oldInput);
      fileInputEl = newInput; // 모듈 스코프 변수 업데이트
      // 새 입력 요소에 이벤트 리스너 다시 연결
      newInput.addEventListener("change", () => {
        if (newInput.files.length > 0) {
          handleFile(newInput.files[0]);
        }
      });
    } else if (fileInputEl) { // fallback
      fileInputEl.value = "";
    }

    resetInternalUIOnFileActionFailure(); // 공통 UI 초기화
  }

  // "파일 제거" 버튼 이벤트 리스너
  if (removeFileBtnEl) {
    removeFileBtnEl.addEventListener("click", resetUploadUIInternally);
  }
}