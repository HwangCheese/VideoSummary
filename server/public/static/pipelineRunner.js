// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI } from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";
import { getSummaryType } from "./summaryOptions.js";

let sseSource;
let highlightEditor = null;

export function initPipelineRunner() {
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
  const elapsedTimeDisplay = document.getElementById("elapsedTime");

  function startSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource("/upload/progress-sse");

    sseSource.addEventListener("message", (e) => {
      try {
        updateProgressUI(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    });

    sseSource.addEventListener("error", () => {
      if (sseSource) sseSource.close();
      sseSource = null;
      stopElapsedTime();
      statusDiv.textContent = "❌ 연결 오류 발생";
      showToast("진행률 업데이트 중 오류가 발생했습니다.", "error");
    });
  }

  function updateProgressUI(state) {
    progressBarInner.style.width = `${state.percent}%`;
    const icon = state.done
      ? '<i class="fas fa-check-circle"></i>'
      : '<i class="fas fa-sync fa-spin"></i>';
    statusDiv.innerHTML = `${icon} ${state.percent}% - ${state.message || "처리 중..."}`;

    if (state.step) updateProgressStep(state.step);

    const msg = state.message || "";
    if (msg.includes("TransNetV2") || msg.includes("장면 분할")) updateProgressStep(2);
    else if (msg.includes("오디오 추출")) updateProgressStep(3);
    else if (msg.includes("Whisper 자막") || msg.includes("문장 세그먼트")) updateProgressStep(4);
    else if (msg.includes("상위 세그먼트") || msg.includes("PGL-SUM") || msg.includes("중요도") || msg.includes("경계 보정")) updateProgressStep(5);
    else if (msg.includes("하이라이트 영상 생성") || msg.includes("숏폼 영상")) updateProgressStep(6);

    if (state.done && sseSource) {
      sseSource.close();
      sseSource = null;
      stopElapsedTime();
    }
  }

  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) {
      showToast("먼저 파일을 업로드해주세요.", "warning");
      return;
    }

    const mode = getSummaryType();

    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
    if (highlightEditor) {
      highlightEditor.destroy();
      highlightEditor = null;
    }
    progressCard.style.display = "block";
    resultCard.style.display = "none";
    statusDiv.innerHTML = '<i class="fas fa-hourglass-start"></i> 0% - 생성 시작 중...';
    progressBarInner.style.width = "0%";
    startElapsedTime();
    resetProgressSteps();
    updateProgressStep(1);
    setTimeout(() => {
      document.getElementById("progress-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    startSSE();

    try {
      const res = await fetch(`/upload/process?filename=${uploadedFileName}&mode=${mode}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
      finalVideo.src = `/clips/highlight_${uploadedFileName}?t=${Date.now()}`;

      finalVideo.addEventListener("loadedmetadata", async () => {
        highlightEditor = initHighlightEditor(
          highlightBarContainer,
          finalVideo,
          uploadedFileName,
          resultCard
        );
        if (highlightEditor) await loadHighlightDataFromServer();

        progressCard.style.display = "none";
        resultCard.style.display = "block";
        setTimeout(() => resultCard.scrollIntoView({
          behavior: "smooth",
          block: "center"
        }), 400);
      }, { once: true });

      downloadBtn.onclick = () => {
        const link = document.createElement("a");
        link.href = finalVideo.src;
        link.download = `${mode}_${uploadedFileName}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

    } catch (err) {
      console.error(err);
      statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
      showToast(`오류: ${err.message}`, "error");
      stopElapsedTime();
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-magic"></i> 숏폼 생성하기';
    }
  });

  newBtn.addEventListener("click", () => {
    resultCard.style.display = "none";
    progressCard.style.display = "none";
    progressBarInner.style.width = "0%";
    statusDiv.textContent = "";
    if (elapsedTimeDisplay) elapsedTimeDisplay.textContent = "00:00";
    stopElapsedTime();
    resetProgressSteps();
    if (highlightEditor) {
      highlightEditor.destroy();
      highlightEditor = null;
    }
    resetUI();
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  async function loadHighlightDataFromServer() {
    if (!highlightEditor) return;
    const base = uploadedFileName.split(".").slice(0, -1).join(".");
    const jsonName = `highlight_${base}.json`;

    try {
      const res = await fetch(`/clips/${jsonName}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`Fetch 실패: ${res.statusText}`);
      const data = await res.json();
      const segments = data.segments || [];
      const originalDuration = data.original_duration || finalVideo.duration || 60;
      highlightEditor.loadHighlightData(segments, originalDuration);
      showToast("숏폼 구간 정보 로드 완료", "info");
    } catch (err) {
      console.error("숏폼 JSON 로드 오류:", err);
      highlightEditor.loadHighlightData([], finalVideo.duration || 60);
    }
  }

  let elapsedInterval = null;
  let startTime = null;

  function startElapsedTime() {
    if (elapsedInterval) return;
    startTime = Date.now();
    if (!elapsedTimeDisplay) return;

    elapsedInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const mins = String(Math.floor(elapsed / 60000)).padStart(2, "0");
      const secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
      elapsedTimeDisplay.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopElapsedTime() {
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
  }
}
