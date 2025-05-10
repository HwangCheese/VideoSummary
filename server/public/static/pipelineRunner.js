// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI } from "./uiUtils.js";
import { getSummaryType } from "./summaryOptions.js";

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
  const elapsedTimeDisplay = document.getElementById("elapsedTime");

  // 뷰 전환용 요소 (index.html 에 맞춤)
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
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
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

    // 단계 자동 업데이트
    const msg = state.message || "";
    if (msg.includes("TransNetV2") || msg.includes("장면 분할")) updateProgressStep(2);
    else if (msg.includes("오디오 추출")) updateProgressStep(3);
    else if (msg.includes("Whisper 자막") || msg.includes("문장 세그먼트")) updateProgressStep(4);
    else if (msg.includes("상위 세그먼트") || msg.includes("PGL-SUM") || msg.includes("중요도") || msg.includes("경계 보정")) updateProgressStep(5);
    else if (msg.includes("하이라이트 영상 생성") || msg.includes("요약 영상")) updateProgressStep(6);

    if (state.done && sseSource) {
      sseSource.close();
      sseSource = null;
      stopElapsedTime();

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
          document.querySelector(".summary-metrics").innerHTML = `
      <li><i class="fas fa-scissors"></i> 원본 대비 <strong>${data.compression_ratio}%</strong> 압축</li>
      <li><i class="fas fa-star"></i> 핵심 장면 <strong>${data.segment_count}개</strong> 추출됨</li>
      <li><i class="fas fa-stopwatch"></i> 시청 시간 <strong>${formatSeconds(data.full_duration)} → ${formatSeconds(data.summary_duration)}</strong></li>
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
    }
  }

  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) {
      showToast("먼저 파일을 업로드해주세요.", "warning");
      return;
    }

    const mode = getSummaryType();

    // 버튼 및 UI 초기화
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
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

      // 비디오 소스 설정
      originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
      finalVideo.src = `/clips/highlight_${uploadedFileName}?t=${Date.now()}`;

      // 로드 완료 시 결과 뷰로 전환
      finalVideo.addEventListener("loadedmetadata", () => {
        progressCard.style.display = "none";
        resultCard.style.display = "block";

        // 요약 뷰 활성화 & 액션 버튼 보이기
        shortformView.classList.add("active");
        originalEditView.classList.remove("active");
        shortformViewActions.style.display = "flex";

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
      console.error(err);
      statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
      showToast(`오류: ${err.message}`, "error");
      stopElapsedTime();
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 생성하기';
    }
  });

  newBtn.addEventListener("click", () => {
    // 전체 초기화
    resultCard.style.display = "none";
    progressCard.style.display = "none";
    progressBarInner.style.width = "0%";
    statusDiv.textContent = "";
    if (elapsedTimeDisplay) elapsedTimeDisplay.textContent = "00:00";
    stopElapsedTime();
    resetProgressSteps();
    resetUI();
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 경과 시간 표시 로직
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