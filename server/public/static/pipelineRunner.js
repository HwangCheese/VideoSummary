// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI } from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";

// SSE 관리
let sseSource;

// highlightEditor 인스턴스
let highlightEditor = null;

// pipelineRunner.js
export function initPipelineRunner() {
  let highlightEditor = null;  // 상단에서만 선언 (initHighlightEditor는 파이프라인 끝날 때만 호출)

  // DOM 요소
  const startBtn = document.getElementById("startBtn");
  const statusDiv = document.getElementById("status");
  const progressBarInner = document.getElementById("progressBarInner");
  const progressCard = document.getElementById("progressCard");
  const resultCard = document.getElementById("resultCard");
  const originalVideo = document.getElementById("originalVideo");
  const finalVideo = document.getElementById("finalVideo");
  const downloadBtn = document.getElementById("downloadBtn");
  const newBtn = document.getElementById("newBtn");
  const highlightBarContainer = document.getElementById("highlightBarContainer");

  // SSE 연결 세팅
  function startSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource("/upload/progress-sse");
    sseSource.addEventListener("message", (event) => {
      const progressState = JSON.parse(event.data);
      updateProgressUI(progressState);
    });
    sseSource.addEventListener("error", (err) => {
      console.error("SSE Error:", err);
    });
  }

  function updateProgressUI(progressState) {
    progressBarInner.style.width = `${progressState.percent}%`;
    statusDiv.textContent = `${progressState.percent}% - ${progressState.message || ""}`;
    if (progressState.step) {
      updateProgressStep(progressState.step);
    }
    if (progressState.done && sseSource) {
      sseSource.close();
    }
  }

  // "숏폼 생성하기" 버튼
  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) return;
    startBtn.disabled = true;

    progressCard.style.display = "block";
    resultCard.style.display = "none";
    statusDiv.textContent = "🧠 생성 시작 중...";
    progressBarInner.style.width = "0%";

    resetProgressSteps();
    updateProgressStep(1);

    setTimeout(() => {
      const progressSection = document.getElementById("progress-section");
      if (progressSection) {
        progressSection.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);

    // SSE 구독 시작
    startSSE();

    try {
      // 파이프라인 실행 요청
      const res = await fetch(`/upload/process?filename=${uploadedFileName}`);
      const data = await res.json();

      if (res.ok) {
        // 1) 진행률 카드 숨김, 결과 카드 표시
        progressCard.style.display = "none";
        resultCard.style.display = "block";
        showToast("🎉 숏폼 영상이 성공적으로 생성되었습니다!", "success");

        // 2) 원본 영상 & 숏폼 영상 src 갱신
        originalVideo.src = `/uploads/${uploadedFileName}?${Date.now()}`;
        finalVideo.src = `/clips/highlight_${uploadedFileName}?${Date.now()}`;

        // 3) **숏폼 편집기**는 파이프라인 끝난 뒤에 초기화
        finalVideo.addEventListener("loadedmetadata", async () => {
          // 여기서 editor 초기화
          highlightEditor = initHighlightEditor(highlightBarContainer, finalVideo, uploadedFileName);

          // 그리고 서버에서 JSON 받아서 세그먼트 로드
          await loadHighlightDataFromServer();
        }, { once: true });

        // 4) 다운로드 버튼
        downloadBtn.addEventListener("click", () => {
          const link = document.createElement("a");
          link.href = finalVideo.src;
          link.download = `highlight_${uploadedFileName}`;
          link.click();
        });

        // 5) 완료 후 result-section으로 스크롤 (옵션)
        setTimeout(() => {
          const resultSection = document.getElementById("result-section");
          if (resultSection) {
            resultSection.scrollIntoView({ behavior: "smooth" });
          }
        }, 1000);

      } else {
        statusDiv.textContent = "❌ 숏폼 생성 실패";
        showToast("숏폼 생성에 실패했습니다. 다시 시도해주세요.", "error");
      }
    } catch (error) {
      console.error(error);
      statusDiv.textContent = "❌ 숏폼 생성 중 오류 발생";
      showToast("처리 중 오류가 발생했습니다.", "error");
    } finally {
      startBtn.disabled = false;
    }
  });

  // "새 영상 만들기" 버튼
  newBtn.addEventListener("click", () => {
    // 기존 UI 초기화 로직
    resultCard.style.display = "none";
    progressCard.style.display = "none";
    progressBarInner.style.width = "0%";
    statusDiv.textContent = "";

    const steps = document.querySelectorAll("#progressSteps .step");
    steps.forEach(step => step.classList.remove("active"));
    if (steps.length > 0) steps[0].classList.add("active");

    document.querySelector(".card").style.display = "block";
    resetUI();
    startSSE();

    const uploadSection = document.getElementById("upload-section");
    if (uploadSection) {
      uploadSection.scrollIntoView({ behavior: "smooth" });
    }
  });

  /**
   * 서버에서 highlight JSON 불러와서 highlightEditor에 로드
   */
  async function loadHighlightDataFromServer() {
    const baseName = uploadedFileName.split(".").slice(0, -1).join(".");
    const jsonName = `highlight_${baseName}.json`;

    try {
      const res = await fetch(`/clips/${jsonName}`);
      const data = await res.json();
      const segments = data.segments || [];
      const original_duration = data.original_duration || finalVideo.duration || 60;

      highlightEditor.loadHighlightData(segments, original_duration);
    } catch (err) {
      console.error("숏폼 정보를 가져오는 중 오류:", err);
    }
  }
}
