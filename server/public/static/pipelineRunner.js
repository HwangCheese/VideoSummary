// public/static/pipelineRunner.js
import { uploadedFileName } from './uploadHandler.js';
import { showToast, resetProgressSteps, updateProgressStep, resetUI, formatTime } from './uiUtils.js';

// 전역 변수로 SSE 연결 관리
let sseSource;

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

  // SSE 연결 시작 함수
  function startSSE() {
    if (sseSource) {
      sseSource.close();
    }
    sseSource = new EventSource("/upload/progress-sse");
    sseSource.addEventListener("message", (event) => {
      const progressState = JSON.parse(event.data);
      updateProgressUI(progressState);
    });
    sseSource.addEventListener("error", (err) => {
      console.error("SSE Error:", err);
    });
  }

  // 진행률 UI 업데이트 함수
  function updateProgressUI(progressState) {
    progressBarInner.style.width = `${progressState.percent}%`;
    statusDiv.textContent = `${progressState.percent}% - ${progressState.message || ''}`;
    if (progressState.step) {
      updateProgressStep(progressState.step);
    }
    if (progressState.done && sseSource) {
      sseSource.close();
    }
  }

  // 시작 버튼 클릭 시 파이프라인 실행
  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) return;

    startBtn.disabled = true;

    // UI 초기화: 진행률 카드 표시, 결과 카드 숨김
    progressCard.style.display = "block";
    resultCard.style.display = "none";
    statusDiv.textContent = "🧠 생성 시작 중...";
    progressBarInner.style.width = "0%";

    resetProgressSteps();
    updateProgressStep(1);

    // SSE 연결 시작 (진행 상황 수신)
    startSSE();

    try {
      const res = await fetch(`/upload/process?filename=${uploadedFileName}`);
      const data = await res.json();

      if (res.ok) {
        progressCard.style.display = "none";
        resultCard.style.display = "block";
        showToast("🎉 숏폼 영상이 성공적으로 생성되었습니다!", "success");

        originalVideo.src = `/uploads/${uploadedFileName}?` + Date.now();

        finalVideo.src = `/clips/highlight_${uploadedFileName}?` + Date.now();
        finalVideo.addEventListener("loadedmetadata", showHighlightBar, { once: true });

        downloadBtn.addEventListener("click", () => {
          const link = document.createElement("a");
          link.href = finalVideo.src;
          link.download = `highlight_${uploadedFileName}`;
          link.click();
        });
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

  // 새 영상 만들기 버튼 클릭 시 UI 및 SSE 재설정
  newBtn.addEventListener("click", () => {
    // 결과 카드와 진행률 카드 숨기기
    resultCard.style.display = "none";
    progressCard.style.display = "none";

    // 진행률 바와 상태 메시지 초기화
    progressBarInner.style.width = "0%";
    statusDiv.textContent = "";

    // 단계(active 클래스) 초기화
    const steps = document.querySelectorAll("#progressSteps .step");
    steps.forEach(step => step.classList.remove("active"));
    if (steps.length > 0) {
      steps[0].classList.add("active");
    }

    // 업로드 영역 다시 표시 (첫 번째 카드라고 가정)
    document.querySelector(".card").style.display = "block";

    // 기타 UI 상태 리셋
    resetUI();

    // 새 SSE 연결 시작
    startSSE();
  });

  // 하이라이트 바 표시 함수
  async function showHighlightBar() {
    const baseName = uploadedFileName.split('.').slice(0, -1).join('.');
    const jsonName = `highlight_${baseName}.json`;
    try {
      const res = await fetch(`/clips/${jsonName}`);
      const data = await res.json();
      const segments = data.segments || [];
      const originalDuration = data.original_duration || 60;

      highlightBarContainer.innerHTML = `
        <div class="time-markers">
          ${[0, 0.25, 0.5, 0.75, 1]
            .map(r => `<span class="time-marker" style="left: ${r * 100}%">${formatTime(originalDuration * r)}</span>`)
            .join('')}
        </div>
      `;

      segments.forEach(seg => {
        const start = seg.start_time;
        const end = seg.end_time;
        const width = ((end - start) / originalDuration) * 100;
        const left = (start / originalDuration) * 100;

        const block = document.createElement("div");
        Object.assign(block.style, {
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          height: "100%",
          backgroundColor: "#f72585",
          borderRadius: "8px",
          boxShadow: "0 0 4px rgba(0,0,0,0.3)",
          zIndex: "2"
        });

        const tooltip = document.createElement("div");
        tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
        Object.assign(tooltip.style, {
          position: "absolute",
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "rgba(0,0,0,0.8)",
          color: "white",
          padding: "4px 8px",
          borderRadius: "6px",
          fontSize: "0.8rem",
          whiteSpace: "nowrap",
          display: "none",
          pointerEvents: "none",
          zIndex: "10"
        });

        block.appendChild(tooltip);
        block.addEventListener("mouseenter", () => (tooltip.style.display = "block"));
        block.addEventListener("mouseleave", () => (tooltip.style.display = "none"));

        highlightBarContainer.appendChild(block);
      });
    } catch (err) {
      console.error("하이라이트 정보를 가져오는 중 오류:", err);
    }
  }
}
