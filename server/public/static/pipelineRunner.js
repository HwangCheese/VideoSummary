// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI } from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";

// SSE 관리
let sseSource;

// highlightEditor 인스턴스 (파일 스코프 유지)
let highlightEditor = null;

// pipelineRunner.js
export function initPipelineRunner() {
  // highlightEditor 변수는 여기서 재선언하지 않고, 파일 스코프의 변수를 사용합니다.
  // let highlightEditor = null; // 이 줄은 제거하거나 주석 처리

  // DOM 요소
  const startBtn = document.getElementById("startBtn");
  const statusDiv = document.getElementById("status");
  const progressBarInner = document.getElementById("progressBarInner");
  const progressCard = document.getElementById("progressCard");
  const resultCard = document.getElementById("resultCard"); // <<< resultCard 요소 가져오기
  const originalVideo = document.getElementById("originalVideo");
  const finalVideo = document.getElementById("finalVideo");
  const downloadBtn = document.getElementById("downloadBtn");
  const newBtn = document.getElementById("newBtn");
  const highlightBarContainer = document.getElementById("highlightBarContainer");
  const elapsedTimeDisplay = document.getElementById("elapsedTime"); // 타이머 요소 추가 (원본 코드에 없었다면 추가)

  // SSE 연결 세팅
  function startSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource("/upload/progress-sse");
    sseSource.addEventListener("message", (event) => {
      try { // JSON 파싱 오류 방지
        const progressState = JSON.parse(event.data);
        updateProgressUI(progressState);
      } catch (e) {
        console.error("Error parsing SSE message:", event.data, e);
      }
    });
    sseSource.addEventListener("error", (err) => {
      console.error("SSE Error:", err);
      // 에러 발생 시 연결 종료 및 사용자 알림 등 추가 가능
      if (sseSource) sseSource.close();
      sseSource = null; // 참조 제거
      stopElapsedTime(); // 오류 시 타이머 중지
      statusDiv.textContent = "❌ 연결 오류 발생"; // 사용자에게 상태 알림
      showToast("진행률 업데이트 중 오류가 발생했습니다.", "error");
    });
  }

  function updateProgressUI(progressState) {
    progressBarInner.style.width = `${progressState.percent}%`;
    // 진행률 메시지에 아이콘 추가 (옵션)
    const icon = progressState.done ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-sync fa-spin"></i>';
    statusDiv.innerHTML = `${icon} ${progressState.percent}% - ${progressState.message || "처리 중..."}`;

    if (progressState.step) {
      updateProgressStep(progressState.step);
    }
    if (progressState.done) {
      if (sseSource) {
        sseSource.close(); // 완료 시 SSE 연결 종료
        sseSource = null;
      }
      stopElapsedTime(); // 완료 시 타이머 중지
      statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> 100% - 완료!'; // 최종 완료 메시지
    }
  }

  // "숏폼 생성하기" 버튼
  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) {
      showToast("먼저 파일을 업로드해주세요.", "warning");
      return;
    }
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...'; // 로딩 상태 표시

    // 기존 에디터가 있다면 파괴 (재실행 시)
    if (highlightEditor) {
      highlightEditor.destroy();
      highlightEditor = null;
    }

    progressCard.style.display = "block";
    resultCard.style.display = "none";
    statusDiv.innerHTML = '<i class="fas fa-hourglass-start"></i> 0% - 생성 시작 중...'; // 초기 상태 메시지
    progressBarInner.style.width = "0%";

    // 타이머 시작
    startElapsedTime();

    resetProgressSteps();
    updateProgressStep(1);

    // 진행률 섹션으로 스크롤 (약간의 딜레이 후)
    setTimeout(() => {
      const progressSection = document.getElementById("progress-section");
      if (progressSection) {
        progressSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);

    // SSE 구독 시작
    startSSE();

    try {
      // 파이프라인 실행 요청 (원본 방식 유지 - GET 파라미터)
      const res = await fetch(`/upload/process?filename=${uploadedFileName}`);
      const data = await res.json(); // 서버 응답은 JSON 형식이라고 가정

      if (res.ok) {
        // 1) 결과 카드 표시 준비 (아직 숨김 상태)
        // progressCard.style.display = "none"; // 에디터 로드 후 숨김
        // resultCard.style.display = "block"; // 에디터 로드 후 표시

        showToast("🎉 숏폼 영상이 성공적으로 생성되었습니다!", "success");

        // 2) 원본 영상 & 숏폼 영상 src 갱신 (캐시 방지)
        originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
        finalVideo.src = `/clips/highlight_${uploadedFileName}?t=${Date.now()}`;

        // 3) 숏폼 영상 메타데이터 로드 완료 후 에디터 초기화
        finalVideo.addEventListener("loadedmetadata", async () => {
          console.log("Final video metadata loaded. Initializing highlight editor...");

          // --- 여기서 initHighlightEditor 호출 시 resultCard 전달 ---
          highlightEditor = initHighlightEditor(
            highlightBarContainer,
            finalVideo,
            uploadedFileName, // 원본 파일명 전달
            resultCard         // <<< resultCard 전달
          );

          if (highlightEditor) {
            // 서버에서 JSON 받아서 세그먼트 로드 (원본 로직 사용)
            await loadHighlightDataFromServer();

            // 에디터 초기화 및 데이터 로드 후 결과 표시
            progressCard.style.display = "none"; // 진행률 카드 숨김
            resultCard.style.display = "block";  // 결과 카드 표시

            // 결과 섹션으로 스크롤 (에디터 로드 후)
            setTimeout(() => {
              resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 500); // 약간의 딜레이

          } else {
            console.error("Highlight Editor 초기화 실패");
            showToast("편집기 초기화에 실패했습니다.", "error");
            // 에디터 초기화 실패 시 처리 (예: 결과 카드만 보여주기)
            progressCard.style.display = "none";
            resultCard.style.display = "block";
          }

        }, { once: true }); // 이벤트 리스너는 한 번만 실행

        // 4) 다운로드 버튼 설정 (클릭 시 최신 src 사용)
        downloadBtn.onclick = () => { // 기존 리스너 덮어쓰기 방식
          const link = document.createElement("a");
          link.href = finalVideo.src; // 현재 비디오 소스
          link.download = `highlight_${uploadedFileName}`;
          document.body.appendChild(link); // Firefox 등 호환성
          link.click();
          document.body.removeChild(link);
          showToast("다운로드를 시작합니다.", "info");
        };

        // 5) 완료 후 result-section으로 스크롤 (옵션 - 위에서 처리함)
        // setTimeout(() => { ... }, 1000); // 제거 또는 주석 처리

      } else {
        // 서버 응답 실패 시
        statusDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 숏폼 생성 실패: ${data.error || res.statusText}`;
        showToast(`숏폼 생성 실패: ${data.error || '서버 오류'}`, "error");
        // 실패 시 진행률 카드는 유지
        progressCard.style.display = "block";
        resultCard.style.display = "none";
        stopElapsedTime(); // 실패 시 타이머 중지
      }
    } catch (error) {
      // 네트워크 오류 또는 기타 예외 발생 시
      console.error("숏폼 생성 중 오류 발생:", error);
      statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> 처리 중 오류 발생';
      showToast(`처리 중 오류가 발생했습니다: ${error.message}`, "error");
      // 오류 시 진행률 카드는 유지
      progressCard.style.display = "block";
      resultCard.style.display = "none";
      stopElapsedTime(); // 오류 시 타이머 중지
      if (sseSource) { // 오류 시 SSE 연결 종료
        sseSource.close();
        sseSource = null;
      }
    } finally {
      // 성공/실패/오류에 관계없이 버튼 상태 복원
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-magic"></i> 숏폼 생성하기';
      // 타이머 정지는 각 분기(성공, 실패, 오류)에서 처리됨
    }
  });

  // "새 영상 만들기" 버튼
  newBtn.addEventListener("click", () => {
    // 기존 UI 초기화 로직 (원본 코드 유지)
    resultCard.style.display = "none";
    progressCard.style.display = "none";
    progressBarInner.style.width = "0%";
    statusDiv.textContent = ""; // 원본에는 innerHTML 대신 textContent 사용했다면 유지
    if (elapsedTimeDisplay) elapsedTimeDisplay.textContent = "00:00"; // 타이머 표시 초기화
    stopElapsedTime(); // 타이머 정지

    resetProgressSteps(); // 스텝 아이콘 초기화

    // 에디터 인스턴스 파괴
    if (highlightEditor) {
      highlightEditor.destroy();
      highlightEditor = null; // 참조 제거
    }

    // 업로드 섹션의 카드 표시 (원본 코드에 있었다면 유지)
    // document.querySelector(".card").style.display = "block";

    // uiUtils의 resetUI 호출 (파일 정보 초기화 등)
    resetUI();

    // SSE 연결 종료 (원본에 있었다면 유지, 없었다면 추가)
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }

    // 새 영상 만들기 누르면 업로드 섹션으로 자동 스크롤
    const uploadSection = document.getElementById("upload-section");
    if (uploadSection) {
      uploadSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /**
   * 서버에서 highlight JSON 불러와서 highlightEditor에 로드 (원본 코드 유지)
   */
  async function loadHighlightDataFromServer() {
    if (!highlightEditor) { // 에디터가 초기화되지 않았으면 실행 중단
      console.warn("Highlight editor is not initialized.");
      return;
    }
    // 파일명에서 확장자 제거
    const baseName = uploadedFileName.split(".").slice(0, -1).join(".");
    // JSON 파일명 생성
    const jsonName = `highlight_${baseName}.json`;

    try {
      // 캐시 방지를 위해 타임스탬프 추가
      const res = await fetch(`/clips/${jsonName}?t=${Date.now()}`);
      if (!res.ok) { // fetch 실패 시 에러 처리
        throw new Error(`Failed to fetch highlight data: ${res.statusText}`);
      }
      const data = await res.json();
      const segments = data.segments || [];
      // original_duration: 서버 데이터 우선, 없으면 비디오 메타데이터, 그것도 없으면 기본값(예: 60)
      const original_duration = data.original_duration || finalVideo.duration || 60;

      if (original_duration <= 0) {
        console.warn("Invalid original duration, using default 60s");
        highlightEditor.loadHighlightData(segments, 60);
      } else {
        highlightEditor.loadHighlightData(segments, original_duration);
      }
      console.log("Highlight data loaded successfully.");
      showToast("숏폼 구간 정보 로드 완료.", "info");

    } catch (err) {
      console.error("숏폼 정보를 가져오는 중 오류:", err);
      showToast(`숏폼 구간 정보 로드 실패: ${err.message}`, "error");
      // 오류 발생 시, 비디오 길이 기반으로 빈 데이터라도 로드 시도 (선택적)
      const duration = finalVideo.duration || 60;
      highlightEditor.loadHighlightData([], duration);
    }
  }

  // 타이머 관련 코드 (원본 코드 유지)
  let elapsedInterval = null;
  let startTime = null;

  function startElapsedTime() {
    // 이미 실행 중이면 중복 방지
    if (elapsedInterval) return;
    startTime = Date.now();
    // const display = document.getElementById("elapsedTime"); // 이미 위에서 가져옴 (elapsedTimeDisplay)
    if (!elapsedTimeDisplay) return;
    elapsedTimeDisplay.textContent = "00:00"; // 시작 시 00:00 표시

    elapsedInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const mins = String(Math.floor(elapsed / 60000)).padStart(2, '0');
      const secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
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