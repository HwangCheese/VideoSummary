// public/static/pipelineRunner.js
import { uploadedFileName } from "./uploadHandler.js";
import { showToast, resetProgressSteps, updateProgressStep, resetUI, formatTime } from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";

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
  const elapsedTimeDisplay = document.getElementById("elapsedTime");
  const highlightBarContainer = document.getElementById("highlightBarContainer");
  const importanceSlider = document.getElementById('importanceSlider');
  const summaryScoreValueEl = document.getElementById("summaryScoreValue");
  const compressionRateValueEl = document.getElementById("compressionRateValue");
  const keyScenesCountValueEl = document.getElementById("keyScenesCountValue");
  const viewingTimeValueEl = document.getElementById("viewingTimeValue");
  const summaryMethodValueEl = document.getElementById("summaryMethodValue");
  const transcriptListEl = document.getElementById("transcriptList");

  // SSE 연결
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

  // 진행률 UI 업데이트
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
        highlightEditor.loadHighlightData(state.highlightData.segments || [], state.highlightData.original_duration || (originalVideo && originalVideo.duration) || 0);
      }
      if (state.reportData) {
        console.log("SSE로부터 reportData 수신 (완료 시):", state.reportData);
        updateSummaryMetricsFromServerData(state.reportData);
        if (uploadedFileName && state.reportData.summary_score === undefined) {
          const cleanFileNameForScore = uploadedFileName.replace(/\.mp4$/i, "");
          fetchSummaryScore(cleanFileNameForScore);
        }
      } else if (uploadedFileName) {
        console.log("SSE 완료 응답에 reportData가 없으므로, 필요시 별도 로드.");
      }
    }
  }

  async function fetchReportAndScoreForUI(baseFilename) {
    console.log(`[${baseFilename}] SSE 완료 후 report 및 score 데이터 요청 시작`);
    try {
      const reportRes = await fetch(`/results/report/${baseFilename}?t=${Date.now()}`);
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        console.log(`[${baseFilename}] Report 데이터 수신:`, reportData);
        updateSummaryMetricsFromServerData(reportData);
      } else {
        console.warn(`[${baseFilename}] Report 데이터 로드 실패: ${reportRes.status}`);
        resetSummaryMetrics(true);
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

  startBtn.addEventListener("click", async () => {
    if (!uploadedFileName) {
      showToast("먼저 파일을 업로드해주세요.", "warning");
      return;
    }
    const currentImportanceWeight = importanceSlider.value;
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
    if (highlightEditor) {
      highlightEditor.destroy();
      highlightEditor = null;
    }
    resetSummaryMetrics();
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
    let processData; // processData 변수 선언
    try {
      const processUrl = `/upload/process?filename=${encodeURIComponent(uploadedFileName)}&importanceWeight=${currentImportanceWeight}`;
      const processRes = await fetch(processUrl);
      processData = await processRes.json(); // 응답을 processData에 할당

      if (!processRes.ok) {
        const errorMessage = processData?.message || processData?.error || processRes.statusText;
        throw new Error(errorMessage);
      }

      originalVideo.src = `/uploads/${uploadedFileName}?t=${Date.now()}`;
      const baseName = uploadedFileName.replace(/\.mp4$/i, "");
      finalVideo.src = `/clips/${baseName}/highlight_${baseName}.mp4?t=${Date.now()}`;


      const overlay = document.getElementById("importanceOverlay");
      overlay.src = `/images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;

      finalVideo.addEventListener("loadedmetadata", async () => {
        progressCard.style.display = "none";
        resultCard.style.display = "block";

        if (highlightBarContainer && originalVideo && uploadedFileName && resultCard) {
          if (highlightEditor) {
            highlightEditor.destroy();
          }
          highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, uploadedFileName, resultCard);

          if (highlightEditor) {
            if (processData && processData.highlightData) {
              highlightEditor.loadHighlightData(processData.highlightData.segments || [], processData.highlightData.original_duration || (originalVideo && originalVideo.duration) || 0);
            } else {
              await loadHighlightDataFromServer(); // originalVideo.duration을 내부적으로 사용
            }
            const base = uploadedFileName.replace(/\.mp4$/i, "");
            loadAndRenderThumbnails(base);
          }
        }

        const cleanFileName = uploadedFileName.replace(/\.mp4$/i, "");
        // processData가 존재하고, 그 안에 reportData가 있을 경우 사용
        if (processData && processData.reportData) {
          console.log("processData로부터 reportData 수신:", processData.reportData);
          updateSummaryMetricsFromServerData(processData.reportData);
          if (processData.reportData.summary_score === undefined) {
            fetchSummaryScore(cleanFileName);
          }
        } else {
          console.log("processData에 reportData 없음, 별도 fetch 시도.");
          fetchReportAndScoreForUI(cleanFileName);
        }

        if (transcriptListEl) {
          console.log(`[${cleanFileName}] 요약 영상 자막 로드 시도...`);
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
        const summaryPrefix = "summary";
        const weightSuffix = `_w${parseFloat(currentImportanceWeight).toFixed(1).replace('.', '')}`;
        link.download = `${summaryPrefix}${weightSuffix}_${uploadedFileName}`;
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

  // 새 영상 만들기 버튼 클릭 
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
    resetSummaryMetrics();
    resetUI();
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // highlight JSON 로드 함수 
  async function loadHighlightDataFromServer() {
    if (!highlightEditor) return;
    if (!uploadedFileName) return;

    const baseName = uploadedFileName.split('.').slice(0, -1).join('.');

    try {
      const res = await fetch(`/clips/${baseName}/highlight_${baseName}.json?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) {
          highlightEditor.loadHighlightData([], (originalVideo && originalVideo.duration) || 0);
          return;
        }
        throw new Error(`Fetch 실패 (${res.status}): ${res.statusText}`);
      }
      const data = await res.json();
      const segments = data.segments || [];
      const originalDuration = data.original_duration || (originalVideo && originalVideo.duration) || 0;
      highlightEditor.loadHighlightData(segments, originalDuration);
    } catch (err) {
      console.error("숏폼 JSON 로드 오류:", err);
      if (highlightEditor) {
        highlightEditor.loadHighlightData([], (originalVideo && originalVideo.duration) || 0);
      }
    }
  }

  // 점수만 별도로 가져오는 함수
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

  // 썸네일 로드 함수
  async function loadAndRenderThumbnails(baseFilename) {
    const slider = document.getElementById("thumbnailSlider");
    if (!slider) return;
    slider.innerHTML = '<div class="loading">썸네일 로딩…</div>';
    try {
      const res = await fetch(`/clips/${baseFilename}/${baseFilename}_thumbs.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`thumbs.json (${res.status})`);
      const thumbs = await res.json();
      slider.innerHTML = "";
      thumbs.forEach((t, idx) => {
        const start = t.start_time;
        const thumbUrl = `/clips/${baseFilename}/${baseFilename}_thumb_${start}.jpg?t=${Date.now()}`;
        const stamp = formatTime(start);
        const sceneNumber = idx + 1;
        const div = document.createElement("div");
        div.className = "thumbnail";
        div.innerHTML = `
        <img src="${thumbUrl}" alt="thumb${sceneNumber}">
        <div class="thumb-time">#${sceneNumber} · ${stamp}</div>`;
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

  // 리포트 데이터 UI 업데이트 함수 
  function updateSummaryMetricsFromServerData(data) {
    if (!data) {
      resetSummaryMetrics();
      return;
    }
    let summaryText = "맞춤형 요약";  // 슬라이더 밸류 0.5 일 때.
    const sliderValue = parseFloat(importanceSlider.value);
    if (!isNaN(sliderValue)) {
      if (sliderValue <= 0.4) {
        summaryText = "하이라이트 요약";
      } else if (sliderValue >= 0.6) {
        summaryText = "스토리 요약";
      } else {
        summaryText = "균형 요약";
      }
    }
    if (summaryScoreValueEl) {
      summaryScoreValueEl.textContent = data.summary_score !== undefined ? parseFloat(data.summary_score).toFixed(1) : 'N/A';
    }
    if (compressionRateValueEl) {
      compressionRateValueEl.innerHTML = data.compression_ratio !== undefined ? `${parseFloat(data.compression_ratio).toFixed(1)}% <span class="metric-unit">압축</span>` : 'N/A';
    }
    if (keyScenesCountValueEl) {
      keyScenesCountValueEl.innerHTML = data.segment_count !== undefined ? `${data.segment_count}개 <span class="metric-unit">추출됨</span>` : 'N/A';
    }
    if (viewingTimeValueEl) {
      const originalTimeFormatted = data.full_duration !== undefined ? formatTime(data.full_duration) : 'N/A';
      const summaryTimeFormatted = data.summary_duration !== undefined ? formatTime(data.summary_duration) : 'N/A';
      viewingTimeValueEl.innerHTML = `<span class="time-original">${originalTimeFormatted}</span> → <span class="time-summary">${summaryTimeFormatted}</span>`;
    }
    if (summaryMethodValueEl) {
      summaryMethodValueEl.textContent = data.summary_type_text || summaryText;
    }
  }

  // 점수 및 메트릭 UI 초기화 함수
  function resetSummaryMetrics(excludeScore = false) {
    if (!excludeScore && summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
    if (compressionRateValueEl) compressionRateValueEl.textContent = 'N/A';
    if (keyScenesCountValueEl) keyScenesCountValueEl.textContent = 'N/A';
    if (viewingTimeValueEl) viewingTimeValueEl.innerHTML = `<span class="time-original">N/A</span> → <span class="time-summary">N/A</span>`;
    if (summaryMethodValueEl) summaryMethodValueEl.textContent = 'N/A';
  }

  // 경과 시간 표시 로직
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

  // 애니메이션 관련 로직
  document.addEventListener('DOMContentLoaded', () => {
    const resultSection = document.getElementById('result-section');
    if (!resultSection) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetrics();
          animateScoreCounter();
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
      summaryScoreValueEl.textContent = '0.0'; return;
    }
    const endValue = parseFloat(endValueText);
    if (isNaN(endValue)) {
      summaryScoreValueEl.textContent = '0.0'; return;
    }
    summaryScoreValueEl.textContent = '0.0';
    const duration = 1500;
    const animStartTime = performance.now();
    function updateScoreCounter(timestamp) {
      const elapsedTime = timestamp - animStartTime;
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
    const metricsItems = document.querySelectorAll('.shortform-details-sidebar .metric-item');
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
        const valueElement = item.querySelector('.metric-value');
        if (valueElement) {
          const textContent = valueElement.textContent;
          if (textContent === 'N/A' || !textContent) return;
          if (valueElement.id === 'viewingTimeValue') { /* No specific animation */ }
          else {
            const match = textContent.match(/([0-9.]+)(.*)/);
            if (match && match[1]) {
              const finalValue = parseFloat(match[1]);
              const suffix = match[2] ? match[2].trim() : '';
              if (!isNaN(finalValue)) {
                animateCounter(valueElement, 0, finalValue, textContent.includes('.') ? 1 : 0, suffix, true);
              }
            }
          }
        }
      }, index * 150);
    });
  }

  function animateCounter(element, start, end, decimalPlaces = 0, suffix = '', isComplexSuffix = false) {
    if (!element) return;
    const duration = 1500;
    const animStartTimeCounter = performance.now(); // 변수명 충돌 피하기
    const initialText = start.toFixed(decimalPlaces) + (isComplexSuffix ? ` ${suffix}` : suffix);
    element.textContent = initialText;
    function updateCounter(timestamp) {
      const elapsedTime = timestamp - animStartTimeCounter;
      let progress = elapsedTime / duration;
      if (progress > 1) progress = 1;
      const easedProgress = easeOutQuart(progress);
      let currentValue = start + (end - start) * easedProgress;
      const currentText = currentValue.toFixed(decimalPlaces) + (isComplexSuffix ? ` ${suffix}` : suffix);
      if (isComplexSuffix && element.querySelector('.metric-unit')) {
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

  // 요약 영상 자막 로드 및 표시 함수
  async function loadAndDisplayShortformTranscript(baseFilename) {
    if (!transcriptListEl || !finalVideo) return;
    transcriptListEl.innerHTML = '<li><i class="fas fa-spinner fa-spin"></i> 자막 로딩 중...</li>';
    try {
      const transcriptRes = await fetch(`/clips/${baseFilename}/${baseFilename}_reScript.json?t=${Date.now()}`);
      if (!transcriptRes.ok) {
        if (transcriptRes.status === 404) {
          console.warn(`요약 영상 자막 파일(${baseFilename}_reScript.json) 없음 (404)`);
          transcriptListEl.innerHTML = '<li>자막 정보를 찾을 수 없습니다.</li>';
        } else {
          throw new Error(`요약 영상 자막 로드 실패 (${transcriptRes.status})`);
        }
        return;
      }
      const transcriptData = await transcriptRes.json();
      transcriptListEl.innerHTML = '';
      if (!transcriptData || transcriptData.length === 0) {
        transcriptListEl.innerHTML = '<li>표시할 자막이 없습니다.</li>';
        return;
      }
      transcriptData.forEach(segment => {
        const listItem = document.createElement('li');
        listItem.dataset.startTime = segment.start;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'transcript-time';
        timeSpan.textContent = `${formatTime(segment.start)} ~ ${formatTime(segment.end)}`;
        const textP = document.createElement('p');
        textP.className = 'transcript-text';
        textP.textContent = segment.text;
        listItem.appendChild(timeSpan);
        listItem.appendChild(textP);
        listItem.addEventListener('click', () => {
          if (finalVideo) { // finalVideo 존재 확인
            finalVideo.currentTime = parseFloat(segment.start);
            finalVideo.play();
          }
        });
        transcriptListEl.appendChild(listItem);
      });
      if (finalVideo) { // finalVideo 존재 확인
        finalVideo.addEventListener('timeupdate', highlightCurrentTranscript);
      }
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
      let isActive = false;
      const nextItem = item.nextElementSibling;
      if (nextItem) {
        const nextStartTime = parseFloat(nextItem.dataset.startTime);
        if (currentTime >= startTime && currentTime < nextStartTime) {
          isActive = true;
        }
      } else {
        if (currentTime >= startTime) {
          isActive = true;
        }
      }
      if (isActive) {
        item.classList.add('active-transcript');
      } else {
        item.classList.remove('active-transcript');
      }
    });
  }
}