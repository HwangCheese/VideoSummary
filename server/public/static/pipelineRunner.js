// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI, formatTime } from "./uiUtils.js"; // formatTime 추가
import { initHighlightEditor } from "./highlightEditor.js";
import { getSummaryType } from "./summaryOptions.js";

let sseSource;
let highlightEditor = null;

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
  const highlightBarContainer = document.getElementById("highlightBarContainer");

  // --- 점수/메트릭 표시용 DOM 요소들 ---
  const summaryScoreValueEl = document.getElementById("summaryScoreValue");
  const compressionRatioValueEl = document.getElementById("compressionRatioValue");
  const segmentCountValueEl = document.getElementById("segmentCountValue");
  const originalDurationTextEl = document.getElementById("originalDurationText");
  const summaryDurationTextEl = document.getElementById("summaryDurationText");
  const summaryTypeTextEl = document.getElementById("summaryTypeText");

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

    const msg = state.message || "";
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

      if (state.highlightData && highlightEditor) {
        highlightEditor.loadHighlightData(state.highlightData.segments || [], state.highlightData.original_duration || originalVideo.duration || 0);
      }

      // SSE 응답에 리포트 데이터가 포함되어 있다면 사용 (선택적)
      if (state.reportData) {
        console.log("SSE로부터 reportData 수신 (완료 시):", state.reportData);
        updateSummaryMetrics(state.reportData);
        // 만약 state.reportData에 summary_score가 없다면, 별도 fetch
        if (uploadedFileName && state.reportData.summary_score === undefined) {
          const cleanFileNameForScore = uploadedFileName.replace(/\.mp4$/i, "");
          fetchSummaryScore(cleanFileNameForScore);
        }
      } else if (uploadedFileName) {
        // SSE에 reportData가 없다면, 이 시점에 명시적으로 fetch 할 수도 있음.
        // 하지만 보통은 finalVideo.loadedmetadata 이후에 하는 것이 일반적.
        console.log("SSE 완료 응답에 reportData가 없으므로, 필요시 별도 로드.");
      }
    }
  }

  // ------------- 요약 시작 버튼 클릭 ---------------
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
    resetSummaryMetrics(); // 점수/메트릭 표시 초기화

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
      const processRes = await fetch(`/upload/process?filename=${uploadedFileName}&mode=${mode}`);
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.message || processData.error || processRes.statusText);

      originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
      finalVideo.src = `/clips/highlight_${uploadedFileName}?t=${Date.now()}`;

      finalVideo.addEventListener("loadedmetadata", async () => {
        progressCard.style.display = "none";
        resultCard.style.display = "block"; // resultCard를 먼저 보이게 해야 IntersectionObserver가 작동

        if (highlightBarContainer && originalVideo && uploadedFileName && resultCard) {
          if (highlightEditor) {
            highlightEditor.destroy();
          }
          highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, uploadedFileName, resultCard);

          if (highlightEditor) {
            if (processData.highlightData) {
              highlightEditor.loadHighlightData(processData.highlightData.segments || [], processData.highlightData.original_duration || originalVideo.duration || 0);
            } else {
              await loadHighlightDataFromServer();
            }
          }
        }

        const cleanFileName = uploadedFileName.replace(/\.mp4$/i, "");
        if (processData.reportData) {
          updateSummaryMetrics(processData.reportData);
          // processData.reportData에 summary_score가 없다면 별도 요청
          if (processData.reportData.summary_score === undefined) {
            fetchSummaryScore(cleanFileName);
          }
        } else {
          fetchAndDisplayReport(cleanFileName);
          fetchSummaryScore(cleanFileName);
        }

        setTimeout(() => {
          resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 400);
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
      console.error("요약 처리 중 오류:", err);
      statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
      showToast(`오류: ${err.message}`, "error");
      stopElapsedTime();
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 시작';
    }
  });

  // ------------- 새 영상 만들기 버튼 클릭 ---------------
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
    resetSummaryMetrics(); // 점수/메트릭 표시 초기화
    resetUI();
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ------------- highlight JSON 로드 함수 ---------------
  async function loadHighlightDataFromServer() {
    if (!highlightEditor) return;
    if (!uploadedFileName) return;

    const baseName = uploadedFileName.split('.').slice(0, -1).join('.');
    const jsonName = `highlight_${baseName}.json`;

    try {
      const res = await fetch(`/clips/${jsonName}?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) {
          highlightEditor.loadHighlightData([], originalVideo.duration || 0);
          return;
        }
        throw new Error(`Fetch 실패 (${res.status}): ${res.statusText}`);
      }
      const data = await res.json();
      const segments = data.segments || [];
      const originalDuration = data.original_duration || originalVideo.duration || 0;
      highlightEditor.loadHighlightData(segments, originalDuration);
      // showToast("요약 구간 정보 로드 완료", "info"); // 이미 fetchAndDisplayReport에서 유사 메시지 표시 가능성
    } catch (err) {
      console.error("숏폼 JSON 로드 오류:", err);
      if (highlightEditor) {
        highlightEditor.loadHighlightData([], originalVideo.duration || 0);
      }
      // showToast("요약 구간 정보 로드 중 오류 발생", "error");
    }
  }

  // ------------- 점수만 별도로 가져오는 함수 ---------------
  async function fetchSummaryScore(baseFilename) {
    if (!summaryScoreValueEl) return;
    try {
      const res = await fetch(`/results/score/${baseFilename}?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) console.warn(`점수 파일 /results/score/${baseFilename} 없음 (404)`);
        else console.warn(`점수 파일 로드 실패: ${res.status}`);
        summaryScoreValueEl.textContent = 'N/A';
        return;
      }
      const data = await res.json();
      if (data && data.summary_score !== undefined) {
        summaryScoreValueEl.textContent = parseFloat(data.summary_score).toFixed(1); // 애니메이션 위해 임시 저장
      } else {
        summaryScoreValueEl.textContent = 'N/A';
      }
    } catch (err) {
      console.warn("요약 품질 점수 로딩 실패:", err);
      summaryScoreValueEl.textContent = 'N/A';
    }
  }

  // ------------- 리포트 데이터 로드 및 표시 함수 ---------------
  async function fetchAndDisplayReport(baseFilename) {
    try {
      const reportRes = await fetch(`/results/report/${baseFilename}?t=${Date.now()}`);
      if (!reportRes.ok) {
        if (reportRes.status === 404) {
          console.warn(`리포트 파일 (/results/report/${baseFilename}) 없음 (404)`);
          resetSummaryMetrics(true); // 점수 제외 리셋
          return;
        }
        throw new Error(`리포트 로드 실패 (${reportRes.status}): ${reportRes.statusText}`);
      }
      const reportData = await reportRes.json();
      updateSummaryMetrics(reportData, true); // 점수 제외 업데이트
      // 애니메이션 함수를 직접 호출할 수도 있음
      // animateMetrics(); // 데이터 로드 후 바로 애니메이션 시작
      showToast("요약 정보 로드 완료", "info");
    } catch (err) {
      console.error("리포트 데이터 로드 중 오류:", err);
      showToast("요약 정보 로드 중 오류 발생", "error");
      resetSummaryMetrics(true); // 점수 제외 리셋
    }
  }

  // ------------- 점수 및 메트릭 UI 업데이트 함수 ---------------
  function updateSummaryMetrics(data, excludeScore = false) {
    if (!data) {
      resetSummaryMetrics();
      return;
    }

    if (!excludeScore && summaryScoreValueEl) {
      const score = data.summary_score !== undefined ? parseFloat(data.summary_score).toFixed(1) : 'N/A';
      summaryScoreValueEl.textContent = score; // 애니메이션 위해 임시 저장 또는 최종값
      // animateScoreCounter(); // 데이터 업데이트 후 애니메이션 호출
    }
    if (compressionRatioValueEl) {
      compressionRatioValueEl.textContent = data.compression_ratio !== undefined ? `${parseFloat(data.compression_ratio).toFixed(1)}%` : 'N/A';
    }
    if (segmentCountValueEl) {
      segmentCountValueEl.textContent = data.segment_count !== undefined ? `${data.segment_count}개` : 'N/A';
    }
    if (originalDurationTextEl && data.full_duration !== undefined) {
      originalDurationTextEl.textContent = formatTime(data.full_duration);
    } else if (originalDurationTextEl) {
      originalDurationTextEl.textContent = 'N/A';
    }
    if (summaryDurationTextEl && data.summary_duration !== undefined) {
      summaryDurationTextEl.textContent = formatTime(data.summary_duration);
    } else if (summaryDurationTextEl) {
      summaryDurationTextEl.textContent = 'N/A';
    }
    if (summaryTypeTextEl) {
      summaryTypeTextEl.textContent = data.summary_type_text || (getSummaryType() === 'story' ? '스토리 요약' : '하이라이트 요약');
    }
    // 모든 데이터가 설정된 후, 메트릭 애니메이션 호출
    // animateMetrics();
  }

  // ------------- 점수 및 메트릭 UI 초기화 함수 ---------------
  function resetSummaryMetrics(excludeScore = false) {
    if (!excludeScore && summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A'; // 또는 '0'
    if (compressionRatioValueEl) compressionRatioValueEl.textContent = 'N/A';
    if (segmentCountValueEl) segmentCountValueEl.textContent = 'N/A';
    if (originalDurationTextEl) originalDurationTextEl.textContent = 'N/A';
    if (summaryDurationTextEl) summaryDurationTextEl.textContent = 'N/A';
    if (summaryTypeTextEl) summaryTypeTextEl.textContent = 'N/A';
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


  // ------------- 애니메이션 관련 로직 ---------------
  // 이 로직들은 해당 ID와 클래스를 가진 HTML 요소가 존재해야 정상 작동합니다.
  document.addEventListener('DOMContentLoaded', () => {
    const resultSection = document.getElementById('result-section');
    if (!resultSection) return; // result-section이 없으면 실행 안 함

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetrics();
          animateScoreCounter();
          observer.unobserve(entry.target); // 한 번만 실행
        }
      });
    }, { threshold: 0.3 }); // 30% 이상 보일 때 시작

    observer.observe(resultSection);
  });

  // 점수 카운터 애니메이션
  function animateScoreCounter() {
    if (!summaryScoreValueEl) return; // 요소 없으면 중단

    const endValueText = summaryScoreValueEl.textContent;
    if (endValueText === 'N/A' || endValueText === null || endValueText === undefined) {
      summaryScoreValueEl.textContent = '0.0'; // 애니메이션 시작 전 기본값
      return; // 유효한 숫자가 아니면 애니메이션 실행 안 함
    }
    const endValue = parseFloat(endValueText);
    if (isNaN(endValue)) {
      summaryScoreValueEl.textContent = '0.0';
      return; // 숫자로 변환 실패 시
    }


    summaryScoreValueEl.textContent = '0.0'; // 애니메이션 시작 값
    const duration = 1500; // 1.5초
    const startTime = performance.now();

    function updateScoreCounter(timestamp) {
      const elapsedTime = timestamp - startTime;
      let progress = elapsedTime / duration;
      if (progress > 1) progress = 1;

      const easedProgress = easeOutQuart(progress);
      const currentValue = (endValue * easedProgress).toFixed(1); // 소수점 첫째자리

      summaryScoreValueEl.textContent = currentValue;

      if (progress < 1) {
        requestAnimationFrame(updateScoreCounter);
      }
    }
    requestAnimationFrame(updateScoreCounter);
  }

  // 메트릭 항목 애니메이션 (숫자 카운팅 포함)
  function animateMetrics() {
    const metricsItems = document.querySelectorAll('#resultCard .summary-metrics li'); // 더 구체적인 선택자
    if (metricsItems.length === 0) return;

    metricsItems.forEach((item, index) => {
      setTimeout(() => {
        item.style.opacity = '0'; // 초기 상태 (CSS에서 처리하는 것이 더 좋을 수 있음)
        item.style.transform = 'translateY(20px)';
        item.classList.add('animate__animated', 'animate__fadeInUp'); // Animate.css 사용
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';


        // 강조 숫자에 카운팅 애니메이션 적용 (strong 태그 대상)
        const strongElements = item.querySelectorAll('strong');
        strongElements.forEach(strongElement => {
          // ID를 통해 각 요소에 맞는 값을 가져와서 애니메이션해야 함
          // 여기서는 간단히 현재 텍스트를 기준으로 함
          const textContent = strongElement.textContent;
          if (textContent === 'N/A') return;

          if (strongElement.id === 'originalDurationText' || strongElement.id === 'summaryDurationText') {
            // 시간 형식 (예: "1분 30초" 또는 "50초")
            // animateTimeCounter(strongElement); // animateTimeCounter는 아래에 정의
          } else if (textContent.includes('%') || textContent.includes('개')) {
            // 숫자 + 단위 (예: "75.0%", "5개")
            const finalValue = parseFloat(textContent.replace(/[^0-9.]/g, ''));
            if (!isNaN(finalValue)) {
              animateCounter(strongElement, 0, finalValue, textContent.includes('%') ? 1 : 0, textContent.replace(/[0-9.]+/g, '').trim());
            }
          }
        });
      }, index * 150); // 각 항목별 지연
    });
  }

  // 숫자 카운팅 애니메이션 (소수점 및 단위 지원)
  function animateCounter(element, start, end, decimalPlaces = 0, suffix = '') {
    if (!element) return;
    const duration = 1500;
    const startTime = performance.now();

    element.textContent = start.toFixed(decimalPlaces) + suffix; // 시작 값 설정

    function updateCounter(timestamp) {
      const elapsedTime = timestamp - startTime;
      let progress = elapsedTime / duration;
      if (progress > 1) progress = 1;

      const easedProgress = easeOutQuart(progress);
      let currentValue = start + (end - start) * easedProgress;

      element.textContent = currentValue.toFixed(decimalPlaces) + suffix;

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    }
    requestAnimationFrame(updateCounter);
  }

  // 부드러운 이징 함수
  function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
  }

} 