// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI, formatTime } from "./uiUtils.js"; // formatTime 추가 (현재 코드에 이미 있음)
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

  // --- 점수/메트릭 표시용 DOM 요소들 (현재 코드 기준) ---
  const summaryScoreValueEl = document.getElementById("summaryScoreValue");
  const compressionRateValueEl = document.getElementById("compressionRateValue"); // index.html의 ID와 일치
  const keyScenesCountValueEl = document.getElementById("keyScenesCountValue");   // index.html의 ID와 일치
  const viewingTimeValueEl = document.getElementById("viewingTimeValue");       // index.html의 ID와 일치
  const summaryMethodValueEl = document.getElementById("summaryMethodValue");     // index.html의 ID와 일치
  const transcriptListEl = document.getElementById("transcriptList");


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
        updateSummaryMetricsFromServerData(state.reportData); // 이전 코드 로직 통합
        // 만약 state.reportData에 summary_score가 없다면, 별도 fetch (이전 코드에는 이 부분이 없었음, 현재 코드 로직 유지)
        if (uploadedFileName && state.reportData.summary_score === undefined) {
          const cleanFileNameForScore = uploadedFileName.replace(/\.mp4$/i, "");
          fetchSummaryScore(cleanFileNameForScore);
        }
      } else if (uploadedFileName) {
        // SSE에 reportData가 없다면, 이 시점에 명시적으로 fetch 할 수도 있음.
        // 하지만 보통은 finalVideo.loadedmetadata 이후에 하는 것이 일반적.
        console.log("SSE 완료 응답에 reportData가 없으므로, 필요시 별도 로드.");
        // 여기서 이전 코드처럼 report와 score를 fetch 할 수 있음.
        // const cleanFileName = uploadedFileName.replace(/\.mp4$/i, "");
        // fetchReportAndScoreForUI(cleanFileName); // 새로운 헬퍼 함수 (아래 정의)
      }
    }
  }

  // 이전 코드의 SSE 완료 시 report/score fetch 로직을 통합한 함수
  async function fetchReportAndScoreForUI(baseFilename) {
    console.log(`[${baseFilename}] SSE 완료 후 report 및 score 데이터 요청 시작`);
    try {
      const reportRes = await fetch(`/results/report/${baseFilename}?t=${Date.now()}`);
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        console.log(`[${baseFilename}] Report 데이터 수신:`, reportData);
        updateSummaryMetricsFromServerData(reportData); // 이전 코드의 업데이트 방식 적용
      } else {
        console.warn(`[${baseFilename}] Report 데이터 로드 실패: ${reportRes.status}`);
        resetSummaryMetrics(true); // 점수 제외하고 리셋
      }
    } catch (err) {
      console.warn(`[${baseFilename}] Report 데이터 요청 오류:`, err);
      resetSummaryMetrics(true);
    }

    try {
      const scoreRes = await fetch(`/results/score/${baseFilename}?t=${Date.now()}`);
      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        console.log(`[${baseFilename}] Score 데이터 수신:`, scoreData);
        if (summaryScoreValueEl && scoreData.summary_score !== undefined) {
          summaryScoreValueEl.textContent = parseFloat(scoreData.summary_score).toFixed(1);
        } else if (summaryScoreValueEl) {
          summaryScoreValueEl.textContent = 'N/A';
        }
      } else {
        console.warn(`[${baseFilename}] Score 데이터 로드 실패: ${scoreRes.status}`);
        if (summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
      }
    } catch (err) {
      console.warn(`[${baseFilename}] Score 데이터 요청 오류:`, err);
      if (summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
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
    resetSummaryMetrics(); // 점수/메트릭 표시 초기화 (현재 코드 방식)

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
              const base = uploadedFileName.replace(/\.mp4$/i, "");
              loadAndRenderThumbnails(base);

            }
          }
        }

        const cleanFileName = uploadedFileName.replace(/\.mp4$/i, "");
        if (processData.reportData) { // /upload/process 응답에 reportData가 있는 경우
          console.log("processData로부터 reportData 수신:", processData.reportData);
          updateSummaryMetricsFromServerData(processData.reportData); // 이전 코드 방식 적용
          // processData.reportData에 summary_score가 없다면 별도 요청 (현재 코드 로직 유지)
          if (processData.reportData.summary_score === undefined) {
            fetchSummaryScore(cleanFileName);
          }
        } else { // /upload/process 응답에 reportData가 없는 경우, 별도 fetch (이전 코드 방식과 유사)
          console.log("processData에 reportData 없음, 별도 fetch 시도.");
          fetchReportAndScoreForUI(cleanFileName);
        }

        if (transcriptListEl) { // transcriptListEl이 존재하는지 다시 한번 확인
          console.log(`[${cleanFileName}] 요약 영상 자막 로드 시도...`); // 호출 전 로그 추가
          await loadAndDisplayShortformTranscript(cleanFileName);
        } else {
          console.warn("transcriptListEl 요소를 찾을 수 없어 자막을 로드할 수 없습니다.");
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
    resetSummaryMetrics(); // 현재 코드 방식 UI 초기화
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
      // showToast("요약 구간 정보 로드 완료", "info");
    } catch (err) {
      console.error("숏폼 JSON 로드 오류:", err);
      if (highlightEditor) {
        highlightEditor.loadHighlightData([], originalVideo.duration || 0);
      }
      // showToast("요약 구간 정보 로드 중 오류 발생", "error");
    }
  }

  // ------------- 점수만 별도로 가져오는 함수 (현재 코드 유지) ---------------
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
        summaryScoreValueEl.textContent = parseFloat(data.summary_score).toFixed(1);
      } else {
        summaryScoreValueEl.textContent = 'N/A';
      }
    } catch (err) {
      console.warn("요약 품질 점수 로딩 실패:", err);
      summaryScoreValueEl.textContent = 'N/A';
    }
  }

  async function loadAndRenderThumbnails(baseFilename) {
    const slider = document.getElementById("thumbnailSlider");
    if (!slider) return;

    slider.innerHTML = '<div class="loading">썸네일 로딩…</div>';

    try {
      const res = await fetch(`/clips/${baseFilename}_thumbs.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`thumbs.json (${res.status})`);

      const thumbs = await res.json();      // [{start_time, score}, …]
      slider.innerHTML = "";

      thumbs.forEach((t, idx) => {
        const start = t.start_time;
        const thumbUrl = `/clips/thumb_${start}.jpg?t=${Date.now()}`;
        const stamp = formatTime(start);
        const sceneNumber = idx + 1; // 👉 1부터 시작

        const div = document.createElement("div");
        div.className = "thumbnail";
        div.innerHTML = `
        <img src="${thumbUrl}" alt="thumb${sceneNumber}">
        <div class="thumb-time">#${sceneNumber} · ${stamp}</div>
      `;

        div.addEventListener("click", () => {
          const original = document.getElementById("originalVideo");
          if (original) original.currentTime = start;
        });

        slider.appendChild(div);
      });


    } catch (err) {
      console.error("📸 썸네일 로드 실패:", err);
      slider.innerHTML = "<p>썸네일을 불러오지 못했습니다.</p>";
    }
  }


  // ------------- 이전 코드의 리포트 데이터 처리 방식에 맞춘 UI 업데이트 함수 ---------------
  // 이 함수는 HTML의 ID (compressionRateValue 등)가 이전 코드의 사이드바 항목들과 일치한다고 가정합니다.
  function updateSummaryMetricsFromServerData(data) {
    if (!data) {
      resetSummaryMetrics(); // 현재 코드의 리셋 함수 사용
      return;
    }
    const summaryType = getSummaryType();
    const summaryText = summaryType === "story" ? "스토리 요약" : "하이라이트 요약";

    // 점수 (별도 fetch 또는 data.summary_score 사용)
    if (summaryScoreValueEl) {
      summaryScoreValueEl.textContent = data.summary_score !== undefined ? parseFloat(data.summary_score).toFixed(1) : 'N/A';
    }

    // 압축률
    if (compressionRateValueEl) {
      compressionRateValueEl.innerHTML = data.compression_ratio !== undefined ? `${parseFloat(data.compression_ratio).toFixed(1)}% <span class="metric-unit">압축</span>` : 'N/A';
    }

    // 핵심 장면
    if (keyScenesCountValueEl) {
      keyScenesCountValueEl.innerHTML = data.segment_count !== undefined ? `${data.segment_count}개 <span class="metric-unit">추출됨</span>` : 'N/A';
    }

    // 시청 시간
    if (viewingTimeValueEl) {
      const originalTimeFormatted = data.full_duration !== undefined ? formatTime(data.full_duration) : 'N/A';
      const summaryTimeFormatted = data.summary_duration !== undefined ? formatTime(data.summary_duration) : 'N/A';
      viewingTimeValueEl.innerHTML = `<span class="time-original">${originalTimeFormatted}</span> → <span class="time-summary">${summaryTimeFormatted}</span>`;
    }

    // 요약 방식
    if (summaryMethodValueEl) {
      summaryMethodValueEl.textContent = data.summary_type_text || summaryText;
    }
    // showToast("요약 정보 로드 완료 (이전 방식 통합)", "info");
    // 애니메이션 호출은 IntersectionObserver에서 하도록 유지
  }


  // ------------- 점수 및 메트릭 UI 초기화 함수 (현재 코드 유지) ---------------
  function resetSummaryMetrics(excludeScore = false) {
    if (!excludeScore && summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
    if (compressionRateValueEl) compressionRateValueEl.textContent = 'N/A';
    if (keyScenesCountValueEl) keyScenesCountValueEl.textContent = 'N/A';
    if (viewingTimeValueEl) viewingTimeValueEl.innerHTML = `<span class="time-original">N/A</span> → <span class="time-summary">N/A</span>`;
    if (summaryMethodValueEl) summaryMethodValueEl.textContent = 'N/A';
  }

  // ------------- 경과 시간 표시 로직 (현재 코드 유지) ---------------
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

  // ------------- 애니메이션 관련 로직 (현재 코드 유지) ---------------
  document.addEventListener('DOMContentLoaded', () => {
    const resultSection = document.getElementById('result-section');
    if (!resultSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetrics(); // 현재 코드의 애니메이션 함수
          animateScoreCounter(); // 현재 코드의 애니메이션 함수
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(resultSection);
  });

  function animateScoreCounter() {
    if (!summaryScoreValueEl) return;

    const endValueText = summaryScoreValueEl.textContent;
    if (endValueText === 'N/A' || endValueText === null || endValueText === undefined) {
      summaryScoreValueEl.textContent = '0.0';
      return;
    }
    const endValue = parseFloat(endValueText);
    if (isNaN(endValue)) {
      summaryScoreValueEl.textContent = '0.0';
      return;
    }

    summaryScoreValueEl.textContent = '0.0';
    const duration = 1500;
    const startTime = performance.now();

    function updateScoreCounter(timestamp) {
      const elapsedTime = timestamp - startTime;
      let progress = elapsedTime / duration;
      if (progress > 1) progress = 1;

      const easedProgress = easeOutQuart(progress);
      const currentValue = (endValue * easedProgress).toFixed(1);
      summaryScoreValueEl.textContent = currentValue;

      if (progress < 1) {
        requestAnimationFrame(updateScoreCounter);
      }
    }
    requestAnimationFrame(updateScoreCounter);
  }

  function animateMetrics() {
    // 현재 코드에서는 #resultCard .summary-metrics li 를 사용하고 있지 않음.
    // 대신, 사이드바의 각 .metric-item을 대상으로 해야 함.
    // const metricsItems = document.querySelectorAll('#resultCard .shortform-details-sidebar .metric-item');
    const metricsItems = document.querySelectorAll('.shortform-details-sidebar .metric-item'); // 더 간단한 선택자
    if (metricsItems.length === 0) {
      console.warn("AnimateMetrics: .metric-item 요소를 찾을 수 없습니다.");
      return;
    }


    metricsItems.forEach((item, index) => {
      setTimeout(() => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        item.classList.add('animate__animated', 'animate__fadeInUp');
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';

        // 각 metric-item 내부의 .metric-value에 카운팅 애니메이션 적용
        const valueElement = item.querySelector('.metric-value');
        if (valueElement) {
          const textContent = valueElement.textContent; // 예: "69.5% 압축" 또는 "31개 추출됨"
          if (textContent === 'N/A' || !textContent) return;

          if (valueElement.id === 'viewingTimeValue') {
            // 시청 시간은 형식이 다르므로 별도 처리하거나, 숫자 부분만 애니메이션.
            // 현재는 viewingTimeValueEl.innerHTML 로 직접 설정하므로, 개별 숫자 애니메이션은 복잡.
            // 여기서는 일단 텍스트 값만 표시된 것으로 가정.
          } else {
            // 숫자와 단위를 분리
            const match = textContent.match(/([0-9.]+)(.*)/);
            if (match && match[1]) {
              const finalValue = parseFloat(match[1]);
              const suffix = match[2] ? match[2].trim() : ''; // 예: "% 압축", "개 추출됨"
              if (!isNaN(finalValue)) {
                animateCounter(valueElement, 0, finalValue, textContent.includes('.') ? 1 : 0, suffix, true); // isComplexSuffix = true
              }
            }
          }
        }
      }, index * 150);
    });
  }

  // 숫자 카운팅 애니메이션 (복잡한 단위 포함 가능하도록 수정)
  function animateCounter(element, start, end, decimalPlaces = 0, suffix = '', isComplexSuffix = false) {
    if (!element) return;
    const duration = 1500;
    const startTime = performance.now();

    // isComplexSuffix가 true이면, suffix는 "단위1 단위2" 형태일 수 있음.
    // 이 경우, innerHTML을 사용하여 span 태그 등을 유지해야 할 수 있음.
    // 여기서는 textContent를 사용하되, suffix를 그대로 붙이는 방식으로 단순화.
    // 더 복잡한 HTML 구조 유지가 필요하면, value 부분만 span으로 감싸고 해당 span만 업데이트.

    const initialText = start.toFixed(decimalPlaces) + (isComplexSuffix ? ` ${suffix}` : suffix);
    if (isComplexSuffix && element.querySelector('.metric-unit')) {
      // .metric-value의 숫자 부분만 업데이트하고, .metric-unit은 그대로 두는 방식 고려
      // 예: element.childNodes[0].nodeValue = start.toFixed(decimalPlaces);
      // 여기서는 단순화를 위해 전체 textContent 업데이트
      element.textContent = initialText;
    } else {
      element.textContent = initialText;
    }


    function updateCounter(timestamp) {
      const elapsedTime = timestamp - startTime;
      let progress = elapsedTime / duration;
      if (progress > 1) progress = 1;

      const easedProgress = easeOutQuart(progress);
      let currentValue = start + (end - start) * easedProgress;
      const currentText = currentValue.toFixed(decimalPlaces) + (isComplexSuffix ? ` ${suffix}` : suffix);

      if (isComplexSuffix && element.querySelector('.metric-unit')) {
        // .metric-value의 숫자 부분만 업데이트 (예시)
        // <span>숫자</span><span class="metric-unit">단위</span> 구조라면
        // element.childNodes[0].nodeValue = currentValue.toFixed(decimalPlaces);
        // 여기서는 단순화를 위해 전체 textContent 업데이트
        element.textContent = currentText;
      } else {
        element.textContent = currentText;
      }


      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    }
    requestAnimationFrame(updateCounter);
  }


  function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
  }

  // ===== 요약 영상 자막 로드 및 표시 함수 (신규 추가) =====
  async function loadAndDisplayShortformTranscript(baseFilename) {
    if (!transcriptListEl || !finalVideo) return;
    transcriptListEl.innerHTML = '<li><i class="fas fa-spinner fa-spin"></i> 자막 로딩 중...</li>'; // 로딩 표시

    try {
      // highlight_{baseFilename}_transcript.json 파일을 요청
      const transcriptRes = await fetch(`/clips/${baseFilename}_reScript.json?t=${Date.now()}`);
      if (!transcriptRes.ok) {
        if (transcriptRes.status === 404) {
          console.warn(`요약 영상 자막 파일(${baseFilename}_reScript.json) 없음 (404)`);
          transcriptListEl.innerHTML = '<li>자막 정보를 찾을 수 없습니다.</li>';
        } else {
          throw new Error(`요약 영상 자막 로드 실패 (${transcriptRes.status})`);
        }
        return;
      }
      const transcriptData = await transcriptRes.json(); // [{start, end, text}, ...]

      transcriptListEl.innerHTML = ''; // 로딩 표시 제거 및 목록 초기화

      if (!transcriptData || transcriptData.length === 0) {
        transcriptListEl.innerHTML = '<li>표시할 자막이 없습니다.</li>';
        return;
      }

      transcriptData.forEach(segment => {
        const listItem = document.createElement('li');
        listItem.dataset.startTime = segment.start; // 클릭 시 이동을 위한 시작 시간 저장

        const timeSpan = document.createElement('span');
        timeSpan.className = 'transcript-time';
        // formatTime 함수는 초를 MM:SS 형식으로 변환하는 함수여야 함
        timeSpan.textContent = `${formatTime(segment.start)} ~ ${formatTime(segment.end)}`;

        const textP = document.createElement('p');
        textP.className = 'transcript-text';
        textP.textContent = segment.text;

        listItem.appendChild(timeSpan);
        listItem.appendChild(textP);

        listItem.addEventListener('click', () => {
          finalVideo.currentTime = parseFloat(segment.start);
          finalVideo.play(); // 클릭 시 바로 재생 (선택 사항)
        });

        transcriptListEl.appendChild(listItem);
      });

      // 요약 영상 재생 시간에 따라 현재 자막 하이라이트
      finalVideo.addEventListener('timeupdate', highlightCurrentTranscript);

    } catch (err) {
      console.error("요약 영상 자막 처리 중 오류:", err);
      transcriptListEl.innerHTML = '<li>자막을 불러오는 중 오류가 발생했습니다.</li>';
      showToast("요약 영상 자막 로드 중 오류 발생", "error");
    }
  }

  function highlightCurrentTranscript() {
    if (!transcriptListEl || !finalVideo) return;
    const currentTime = finalVideo.currentTime;
    const items = transcriptListEl.querySelectorAll('li');

    items.forEach(item => {
      const startTime = parseFloat(item.dataset.startTime);
      // 해당 아이템의 끝 시간도 필요 (json 데이터의 end 값을 data-end-time 등으로 저장)
      // 여기서는 간단히 시작 시간만으로 다음 아이템 시작 전까지를 현재 구간으로 가정
      // 더 정확하려면 각 li에 data-end-time도 저장하고 비교해야 함.
      // 예: const endTime = parseFloat(item.dataset.endTime);
      // if (currentTime >= startTime && currentTime < endTime) { ... }

      // 임시: 현재 자막의 시작 시간과 다음 자막의 시작 시간 사이로 판단
      let isActive = false;
      const nextItem = item.nextElementSibling;
      if (nextItem) {
        const nextStartTime = parseFloat(nextItem.dataset.startTime);
        if (currentTime >= startTime && currentTime < nextStartTime) {
          isActive = true;
        }
      } else { // 마지막 자막인 경우
        if (currentTime >= startTime) {
          isActive = true;
        }
      }

      if (isActive) {
        item.classList.add('active-transcript');
        // (선택 사항) 활성 자막으로 스크롤
        // item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active-transcript');
      }
    });
  }

}