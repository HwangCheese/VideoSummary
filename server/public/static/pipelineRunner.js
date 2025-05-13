// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI } from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js"; // highlightEditor import 추가
import { getSummaryType } from "./summaryOptions.js";

let sseSource;
let highlightEditor = null; // highlightEditor 인스턴스를 저장할 변수

export function initPipelineRunner() {
  // ---------------- DOM 요소 ----------------
  const startBtn = document.getElementById("startBtn");
  const statusDiv = document.getElementById("status");
  const progressBarInner = document.getElementById("progressBarInner");
  const progressCard = document.getElementById("progressCard");
  const resultCard = document.getElementById("resultCard");
  const originalVideo = document.getElementById("originalVideo");
  const finalVideo = document.getElementById("finalVideo");
  const downloadBtn = document.getElementById("downloadBtn");
  const newBtn = document.getElementById("newBtn");
  const elapsedTimeDisplay = document.getElementById("elapsedTime");
  const highlightBarContainer = document.getElementById("highlightBarContainer"); // highlightBarContainer 가져오기

  // 뷰 전환용 요소 (index.html 에 맞춤) - THESE ELEMENTS ARE NOT IN THE CURRENT index.html
  /*
  const shortformView = document.getElementById("shortformView");
  const shortformViewActions = document.getElementById("shortformViewActions");
  const originalEditView = document.getElementById("originalEditView");
  const switchToOriginalViewBtn = document.getElementById("switchToOriginalViewBtn");
  const switchToShortformViewBtn = document.getElementById("switchToShortformViewBtn");

  // “원본 영상 보기 및 구간 편집” 클릭
  switchToOriginalViewBtn.addEventListener("click", () => {
    shortformView.classList.remove("active");
    shortformViewActions.style.display = "none";
    originalEditView.classList.add("active");
  });

  // “요약 영상 보기” 클릭
  switchToShortformViewBtn.addEventListener("click", () => {
    originalEditView.classList.remove("active");
    shortformView.classList.add("active");
    shortformViewActions.style.display = "flex";
  });
  */

  // ------------- SSE 연결 ---------------
  function startSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource("/upload/progress-sse");

    sseSource.addEventListener("message", (e) => {
      try {
        updateProgressUI(JSON.parse(e.data));
      } catch (err) {
        console.error("SSE 메시지 처리 오류:", err, "원본 데이터:", e.data);
      }
    });

    sseSource.addEventListener("error", () => {
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      stopElapsedTime();
      statusDiv.textContent = "❌ 연결 오류 발생";
      showToast("진행률 업데이트 중 오류가 발생했습니다.", "error");
    });
  }

  // ------------- 진행률 UI 업데이트 ---------------
  function updateProgressUI(state) {
    progressBarInner.style.width = `${state.percent}%`;
    const icon = state.done
      ? '<i class="fas fa-check-circle"></i>'
      : '<i class="fas fa-sync fa-spin"></i>';
    statusDiv.innerHTML = `${icon} ${state.percent}% - ${state.message || "처리 중..."}`;

    if (state.step) updateProgressStep(state.step);

    // 단계 자동 업데이트 (Python 스크립트 로그 기반)
    const msg = state.message || "";
    // 주석처리된 이전 자동 업데이트 로직
    // if (msg.includes("TransNetV2") || msg.includes("장면 분할")) updateProgressStep(2);
    // else if (msg.includes("오디오 추출")) updateProgressStep(3);
    // else if (msg.includes("Whisper 자막") || msg.includes("문장 세그먼트")) updateProgressStep(4);
    // else if (msg.includes("상위 세그먼트") || msg.includes("PGL-SUM") || msg.includes("중요도") || msg.includes("경계 보정")) updateProgressStep(5);
    // else if (msg.includes("하이라이트 영상 생성") || msg.includes("요약 영상")) updateProgressStep(6);
    // 새 자동 업데이트 로직
    if (msg.includes("특징 추출")) updateProgressStep(1);
    else if (msg.includes("장면 분할") || msg.includes("TransNetV2")) updateProgressStep(2);
    else if (msg.includes("오디오 추출")) updateProgressStep(3);
    else if (msg.includes("문장 추출") || msg.includes("Whisper") || msg.includes("자막") || msg.includes("세그먼트")) updateProgressStep(4);
    else if (msg.includes("AI 분석") || msg.includes("PGL-SUM") || msg.includes("중요도") || msg.includes("경계 보정")) updateProgressStep(5);
    else if (msg.includes("영상 생성") || msg.includes("요약 영상") || msg.includes("편집")) updateProgressStep(6);


    if (state.done && sseSource) {
      sseSource.close();
      sseSource = null;
      stopElapsedTime();

      // ⭐ 파이프라인 완료 시, highlightData가 있으면 highlightEditor에 로드
      if (state.highlightData && highlightEditor) {
        console.log("SSE로부터 highlightData 수신 (완료 시):", state.highlightData);
        // originalVideo의 duration을 기준으로 로드
        highlightEditor.loadHighlightData(state.highlightData.segments || [], state.highlightData.original_duration || originalVideo.duration || 0);
      } else if (state.highlightData && !highlightEditor) {
        console.warn("highlightData는 수신했으나, highlightEditor가 초기화되지 않았습니다.");
      }

      // The following section for summary score and metrics is commented out
      // as the corresponding HTML elements are not in the current index.html
      /*
      const cleanFileName = uploadedFileName.replace(".mp4", "");
      console.log("[📡 점수 요청]", `/results/score/${cleanFileName}`);
      fetch(`/results/score/${cleanFileName}`)
        .then(res => {
          if (!res.ok) throw new Error("요약 점수 파일 없음");
          return res.json();
        })
        .then(data => {
          console.log("[✅ 점수 응답]", data);
          document.getElementById("summaryScoreValue").textContent = data.summary_score;
        })
        .catch(err => {
          console.warn("요약 품질 점수 로딩 실패", err);
        });
      fetch(`/results/report/${cleanFileName}`)
        .then(res => res.json())
        .then(data => {
          const summaryType = getSummaryType();
          const summaryText = summaryType === "story" ? " 스토리 요약" : " 하이라이트 요약";

          document.querySelector(".summary-metrics").innerHTML = `
          <li><i class="fas fa-scissors"></i> 원본 대비 <strong>${data.compression_ratio}%</strong> 압축</li>
          <li><i class="fas fa-star"></i> 핵심 장면 <strong>${data.segment_count}개</strong> 추출됨</li>
          <li>
            <i class="fas fa-stopwatch"></i> 시청 시간
            <strong>${formatSeconds(data.full_duration)}</strong>
            <span class="time-arrow">→</span>
            <strong>${formatSeconds(data.summary_duration)}</strong>
          </li>
          <li>
            <i class="fas fa-filter"></i> 요약 방식:${summaryText}</strong>
          </li>
        `;
        })
        .catch(err => {
          console.warn("요약 리포트 로딩 실패", err);
        });


      function formatSeconds(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        return m > 0 ? `${m}분 ${s}초` : `${s}초`;
      }
      */
    }
  }

  // ------------- 요약 시작 버튼 클릭 ---------------
  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) {
      showToast("먼저 파일을 업로드해주세요.", "warning");
      return;
    }

    const mode = getSummaryType(); // "story" 또는 "highlight"

    // 버튼 및 UI 초기화
    startBtn.disabled = true;
    // startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 업로드 중...'; // 이전 코드 주석
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...'; // "생성 중..."으로 변경
    if (highlightEditor) { // 기존 에디터가 있다면 파괴
      highlightEditor.destroy();
      highlightEditor = null;
    }
    progressCard.style.display = "block";
    resultCard.style.display = "none";
    statusDiv.innerHTML = '<i class="fas fa-hourglass-start"></i> 0% - 생성 시작 중...';
    progressBarInner.style.width = "0%";
    startElapsedTime();
    resetProgressSteps();
    updateProgressStep(1); // 첫 번째 단계 활성화
    setTimeout(() => {
      document.getElementById("progress-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    startSSE(); // SSE 연결 시작

    try {
      const res = await fetch(`/upload/process?filename=${uploadedFileName}&mode=${mode}`);
      const serverResponse = await res.json(); // 서버 응답 받기
      if (!res.ok) throw new Error(serverResponse.message || serverResponse.error || res.statusText);

      console.log("서버 처리 요청 성공:", serverResponse);

      // 비디오 소스 설정
      originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
      finalVideo.src = `/clips/highlight_${uploadedFileName}?t=${Date.now()}`;

      // finalVideo 메타데이터 로드 완료 시
      finalVideo.addEventListener("loadedmetadata", async () => {
        progressCard.style.display = "none";
        resultCard.style.display = "block";

        // ⭐ mode에 관계없이 highlightEditor 초기화 시도
        if (highlightBarContainer && originalVideo && uploadedFileName && resultCard) {
          if (highlightEditor) { // 중복 초기화 방지
            highlightEditor.destroy();
          }
          // initHighlightEditor 호출 시 originalVideo 전달
          highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, uploadedFileName, resultCard);
          console.log("Highlight Editor 초기화됨.");

          // highlight 데이터 로드 시도
          if (highlightEditor) {
            await loadHighlightDataFromServer();
          }
        } else {
          console.error("Highlight Editor 초기화에 필요한 요소가 부족합니다.");
        }

        // 요약 뷰 활성화 & 액션 버튼 보이기 - These elements are not in the current index.html
        /*
        shortformView.classList.add("active");
        originalEditView.classList.remove("active");
        shortformViewActions.style.display = "flex";
        */

        // 스크롤 이동
        setTimeout(() => {
          resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 400);
      }, { once: true });

      // 다운로드 버튼 설정
      downloadBtn.onclick = () => {
        const link = document.createElement("a");
        link.href = finalVideo.src;
        link.download = `${mode}_${uploadedFileName}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

    } catch (err) {
      console.error("요약 처리 중 오류:", err);
      statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
      showToast(`오류: ${err.message}`, "error");
      stopElapsedTime();
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 시작'; // Reverted button text to match HTML
    }
  });

  // ------------- 새 영상 만들기 버튼 클릭 ---------------
  newBtn.addEventListener("click", () => {
    // 전체 UI 초기화
    resultCard.style.display = "none";
    progressCard.style.display = "none";
    progressBarInner.style.width = "0%";
    statusDiv.textContent = "";
    if (elapsedTimeDisplay) elapsedTimeDisplay.textContent = "00:00";
    stopElapsedTime();
    resetProgressSteps();
    if (highlightEditor) { // 에디터가 있다면 파괴
      highlightEditor.destroy();
      highlightEditor = null;
    }
    resetUI(); // 파일 입력 등 공통 UI 초기화
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ------------- highlight JSON 로드 함수 (명시적 호출용) ---------------
  async function loadHighlightDataFromServer() {
    if (!highlightEditor) {
      console.warn("loadHighlightDataFromServer: highlightEditor가 초기화되지 않았습니다.");
      return;
    }
    if (!uploadedFileName) {
      console.warn("loadHighlightDataFromServer: uploadedFileName이 없습니다.");
      return;
    }

    const baseName = uploadedFileName.split('.').slice(0, -1).join('.');
    const jsonName = `highlight_${baseName}.json`;

    try {
      console.log(`서버로부터 ${jsonName} 파일 로드 시도...`);
      const res = await fetch(`/clips/${jsonName}?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) {
          console.log(`${jsonName} 파일을 찾을 수 없습니다.`);
          highlightEditor.loadHighlightData([], originalVideo.duration || 0);
          return;
        }
        throw new Error(`Fetch 실패 (${res.status}): ${res.statusText}`);
      }
      const data = await res.json();
      console.log("서버로부터 highlight JSON 데이터 수신:", data);

      const segments = data.segments || [];
      const originalDuration = data.original_duration || originalVideo.duration || 0;

      if (originalDuration === 0 && originalVideo.readyState < 1) {
        console.warn("원본 비디오의 duration을 아직 알 수 없습니다.");
      }

      highlightEditor.loadHighlightData(segments, originalDuration);
      showToast("요약 구간 정보 로드 완료", "info");

    } catch (err) {
      console.error("숏폼 JSON 로드 오류:", err);
      if (highlightEditor) {
        highlightEditor.loadHighlightData([], originalVideo.duration || 0);
      }
      showToast("요약 구간 정보 로드 중 오류 발생", "error");
    }
  }

  // ------------- 경과 시간 표시 로직 ---------------
  let elapsedInterval = null;
  let startTime = null;
  function startElapsedTime() {
    if (elapsedInterval) return;
    startTime = Date.now();
    if (!elapsedTimeDisplay) return;
    elapsedTimeDisplay.textContent = "00:00";
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

// The following animation logic is commented out as the target elements
// (summaryScoreValue, .summary-metrics) are not present in the current index.html
/*
document.addEventListener('DOMContentLoaded', () => {
  // 결과 섹션이 화면에 표시될 때 애니메이션 시작
  const resultSection = document.getElementById('result-section');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // 결과 섹션이 보이면 메트릭스 애니메이션 시작
        animateMetrics();
        // 점수 애니메이션 시작
        animateScoreCounter();
        // 한 번만 실행하도록 관찰 중단
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 }); // 30% 이상 보일 때 시작

  if (resultSection) {
    observer.observe(resultSection);
  }
});

// 점수 카운터 애니메이션
function animateScoreCounter() {
  const scoreElement = document.getElementById('summaryScoreValue');
  if (!scoreElement) return;

  const endValue = parseFloat(scoreElement.textContent);
  // 초기값을 0으로 설정
  scoreElement.textContent = '0.00';

  const duration = 2000; // 2초 동안 카운팅
  const startTime = performance.now();

  function updateScoreCounter(timestamp) {
    const elapsedTime = timestamp - startTime;
    const progress = Math.min(elapsedTime / duration, 1);

    // 이징 함수로 자연스러운 느낌 추가
    const easedProgress = easeOutQuart(progress);
    const currentValue = (endValue * easedProgress).toFixed(2);

    scoreElement.textContent = currentValue;

    if (progress < 1) {
      requestAnimationFrame(updateScoreCounter);
    }
  }

  requestAnimationFrame(updateScoreCounter);
}

function animateMetrics() {
  // 메트릭스 항목들 애니메이션 적용
  const metricsItems = document.querySelectorAll('.summary-metrics li');

  metricsItems.forEach((item, index) => {
    // 각 항목에 지연 시간을 다르게 적용
    setTimeout(() => {
      item.classList.add('animate');

      // 강조 숫자에 카운팅 애니메이션 적용
      const strongElements = item.querySelectorAll('strong');
      strongElements.forEach(strongElement => {
        const timePattern = /(\d+)분\s*(\d+)초/;
        const matches = strongElement.textContent.match(timePattern);

        // 시간 형식(X분 X초)인지 확인
        if (matches) {
          animateTimeCounter(strongElement);
        } else {
          const finalValue = strongElement.textContent.replace(/[^0-9.]/g, '');
          animateCounter(strongElement, 0, parseFloat(finalValue));
        }
      });
    }, index * 200);
  });
}

function animateCounter(element, start, end) {
  // 숫자 카운팅 애니메이션
  const duration = 1500; // 1.5초 동안 카운팅
  const startTime = performance.now();

  const originalContent = element.textContent;
  const suffix = originalContent.replace(/[0-9.]+/g, '').trim();

  function updateCounter(timestamp) {
    const elapsedTime = timestamp - startTime;
    const progress = Math.min(elapsedTime / duration, 1);

    // 이징 함수로 자연스러운 느낌 추가
    const easedProgress = easeOutQuart(progress);
    const currentValue = Math.floor(start + (end - start) * easedProgress);

    // 원래 텍스트에서 숫자만 변경
    element.textContent = currentValue + suffix;

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }

  requestAnimationFrame(updateCounter);
}

// 시간 카운터 애니메이션 (X분 X초 형식)
function animateTimeCounter(element) {
  const timePattern = /(\d+)분\s*(\d+)초/;
  const matches = element.textContent.match(timePattern);

  if (!matches) return;

  const minutes = parseInt(matches[1], 10);
  const seconds = parseInt(matches[2], 10);
  const totalSeconds = minutes * 60 + seconds;

  const duration = 1500; // 1.5초 동안 카운팅
  const startTime = performance.now();
  let startSeconds = 0;

  // 첫 번째 요소는 내려가는 카운트, 두 번째는 올라가는 카운트
  const isCountDown = element.parentNode.querySelector('strong:first-of-type') === element;

  if (isCountDown) {
    startSeconds = totalSeconds * 1.5; // 더 큰 수에서 시작
  }

  function updateTimeCounter(timestamp) {
    const elapsedTime = timestamp - startTime;
    const progress = Math.min(elapsedTime / duration, 1);

    // 이징 함수로 자연스러운 느낌 추가
    const easedProgress = easeOutQuart(progress);

    let currentSeconds;
    if (isCountDown) {
      // 카운트다운: 큰 숫자에서 목표로
      currentSeconds = Math.floor(startSeconds - (startSeconds - totalSeconds) * easedProgress);
    } else {
      // 카운트업: 0에서 목표로
      currentSeconds = Math.floor(totalSeconds * easedProgress);
    }

    // 분:초 형식으로 변환
    const currentMinutes = Math.floor(currentSeconds / 60);
    const remainingSeconds = currentSeconds % 60;

    // 한국어 형식 (X분 X초)으로 표시
    if (currentMinutes > 0) {
      element.textContent = `${currentMinutes}분 ${remainingSeconds}초`;
    } else {
      element.textContent = `${remainingSeconds}초`;
    }

    if (progress < 1) {
      requestAnimationFrame(updateTimeCounter);
    }
  }

  requestAnimationFrame(updateTimeCounter);
}

// 부드러운 이징 함수
function easeOutQuart(x) {
  return 1 - Math.pow(1 - x, 4);
}
*/