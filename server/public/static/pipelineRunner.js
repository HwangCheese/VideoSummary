// public/static/pipelineRunner.js
import {
  uploadedFileName as currentUploadedFileNameFromHandler,
  setUploadedFileName as setGlobalUploadedFileName
} from "./uploadHandler.js";
import {
  showToast,
  resetProgressSteps,
  updateProgressStep,
  resetUI as resetUploadFormUI, // Renamed for clarity
  formatTime
} from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";

let sseSource;
let highlightEditor = null;

// Global DOM element references
const originalVideo = document.getElementById("originalVideo");
const finalVideo = document.getElementById("finalVideo");
const resultCard = document.getElementById("resultCard");
const progressCard = document.getElementById("progressCard");
const downloadBtn = document.getElementById("downloadBtn");
const importanceOverlay = document.getElementById("importanceOverlay");
const transcriptListEl = document.getElementById("transcriptList");
const startBtn = document.getElementById("startBtn");
const statusDiv = document.getElementById("status");
const progressBarInner = document.getElementById("progressBarInner");
const elapsedTimeDisplay = document.getElementById("elapsedTime");
const highlightBarContainer = document.getElementById("highlightBarContainer");
const importanceSlider = document.getElementById('importanceSlider');

const summaryScoreValueEl = document.getElementById("summaryScoreValue");
const compressionRateValueEl = document.getElementById("compressionRateValue");
const keyScenesCountValueEl = document.getElementById("keyScenesCountValue");
const viewingTimeValueEl = document.getElementById("viewingTimeValue");
const summaryMethodValueEl = document.getElementById("summaryMethodValue");

// --- Timer Logic ---
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

// --- SSE Logic ---
function startSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource("/upload/progress-sse");

  sseSource.addEventListener("message", (e) => {
    try {
      const state = JSON.parse(e.data);
      updateProgressUI(state); // Defined below
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
    if (statusDiv) statusDiv.textContent = "❌ 연결 오류 발생";
    showToast("진행률 업데이트 중 오류가 발생했습니다.", "error");
  });
}

function updateProgressUI(state) {
  if (progressBarInner) progressBarInner.style.width = `${state.percent}%`;
  const icon = state.done
    ? '<i class="fas fa-check-circle"></i>'
    : '<i class="fas fa-sync fa-spin"></i>';
  if (statusDiv) statusDiv.innerHTML = `${icon} ${state.percent}% - ${state.message || "처리 중..."}`;

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
    // If processing new video, result loading is handled by finalVideo.loadedmetadata
    // If this SSE 'done' message includes all necessary data, we could use it too.
    // For now, keep result loading tied to video metadata event for consistency.
    // However, if reportData is reliably sent here, use it.
    if (state.reportData) {
      updateSummaryMetricsFromServerData(state.reportData);
      const currentFile = currentUploadedFileNameFromHandler;
      if (currentFile && state.reportData.summary_score === undefined) {
        const cleanFileNameForScore = currentFile.replace(/\.mp4$/i, "");
        // fetchSummaryScoreInternal might be better called by the main flow after video loads
      }
    }
  }
}

// --- Internal Helper Functions for Data Loading ---

async function loadHighlightDataFromServerInternal(baseNameForJson, originalVideoElRef) {
  if (!highlightEditor) return;
  const originalFileForSegmentEndpoint = baseNameForJson + ".mp4";

  try {
    const res = await fetch(`/results/segments/${originalFileForSegmentEndpoint}?t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`Segment JSON for ${originalFileForSegmentEndpoint} not found. Path: /results/segments/${originalFileForSegmentEndpoint}`);
        highlightEditor.loadHighlightData([], (originalVideoElRef && originalVideoElRef.duration) || 0);
        return;
      }
      throw new Error(`Fetch 실패 (${res.status}): ${res.statusText}`);
    }
    const data = await res.json();
    const segments = data.segments || [];
    const originalDuration = data.original_duration || (originalVideoElRef && originalVideoElRef.duration) || 0;
    highlightEditor.loadHighlightData(segments, originalDuration);
  } catch (err) {
    console.error(`숏폼 JSON (${baseNameForJson}) 로드 오류:`, err);
    if (highlightEditor) {
      highlightEditor.loadHighlightData([], (originalVideoElRef && originalVideoElRef.duration) || 0);
    }
  }
}

async function loadAndRenderThumbnailsInternal(baseFilename) {
  const slider = document.getElementById("thumbnailSlider");
  if (!slider) return;
  slider.innerHTML = '<div class="loading">썸네일 로딩…</div>';
  try {
    const res = await fetch(`/clips/${baseFilename}/${baseFilename}_thumbs.json?t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) slider.innerHTML = "<p>주요 장면 썸네일 정보가 없습니다.</p>";
      else slider.innerHTML = "<p>썸네일을 불러오지 못했습니다.</p>";
      // No need to throw error here if we're just updating UI
      console.warn(`thumbs.json for ${baseFilename} not found or failed to load (${res.status})`);
      return;
    }
    const thumbs = await res.json();
    slider.innerHTML = "";
    if (!thumbs || thumbs.length === 0) {
      slider.innerHTML = "<p>추출된 주요 장면 썸네일이 없습니다.</p>";
      return;
    }
    thumbs.forEach((t, idx) => {
      const start = t.start_time;
      const thumbUrl = `/clips/${baseFilename}/${baseFilename}_thumb_${start}.jpg?t=${Date.now()}`;
      const stamp = formatTime(start);
      const sceneNumber = idx + 1;
      const div = document.createElement("div");
      div.className = "thumbnail";
      div.innerHTML = `
        <img src="${thumbUrl}" alt="thumb${sceneNumber}" onerror="this.style.display='none'; this.parentElement.innerHTML += '<p class=\\'thumb-error\\'>이미지 로드 실패</p>';">
        <div class="thumb-time">#${sceneNumber} · ${stamp}</div>`;
      div.addEventListener("click", () => {
        if (originalVideo) originalVideo.currentTime = start;
      });
      slider.appendChild(div);
    });
  } catch (err) {
    console.error(`📸 썸네일(${baseFilename}) 로드 실패:`, err);
    if (slider) slider.innerHTML = "<p>썸네일을 불러오는 중 오류가 발생했습니다.</p>";
  }
}

async function fetchReportAndScoreForUIInternal(baseFilenameForReport) {
  const originalFileForEndpoints = baseFilenameForReport + ".mp4";
  console.log(`[${baseFilenameForReport}] Report 및 score 데이터 요청 시작 (file: ${originalFileForEndpoints})`);

  resetSummaryMetrics(true); // Reset metrics before fetching, keep score if already there

  try {
    const reportRes = await fetch(`/results/report/${originalFileForEndpoints}?t=${Date.now()}`);
    if (reportRes.ok) {
      const reportData = await reportRes.json();
      updateSummaryMetricsFromServerData(reportData);
    } else {
      console.warn(`[${baseFilenameForReport}] Report 데이터 로드 실패: ${reportRes.status}`);
      // updateSummaryMetricsFromServerData(null); // or let resetSummaryMetrics handle it
    }
  } catch (err) {
    console.warn(`[${baseFilenameForReport}] Report 데이터 요청 오류:`, err);
    // updateSummaryMetricsFromServerData(null);
  }

  try {
    const scoreRes = await fetch(`/results/score/${originalFileForEndpoints}?t=${Date.now()}`);
    if (scoreRes.ok) {
      const scoreData = await scoreRes.json();
      if (summaryScoreValueEl && scoreData.summary_score !== undefined) {
        summaryScoreValueEl.textContent = parseFloat(scoreData.summary_score).toFixed(1);
      } else if (summaryScoreValueEl) {
        summaryScoreValueEl.textContent = 'N/A';
      }
    } else {
      console.warn(`[${baseFilenameForReport}] Score 데이터 로드 실패: ${scoreRes.status}`);
      if (summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
    }
  } catch (err) {
    console.warn(`[${baseFilenameForReport}] Score 데이터 요청 오류:`, err);
    if (summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
  }
  // Trigger animations after data is potentially set
  if (document.getElementById('result-section')?.classList.contains('active-scroll-section')) {
    animateMetrics();
    animateScoreCounter();
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

async function loadAndDisplayShortformTranscriptInternal(baseFilenameForTranscript) {
  if (!transcriptListEl || !finalVideo) return;
  transcriptListEl.innerHTML = '<li><i class="fas fa-spinner fa-spin"></i> 자막 로딩 중...</li>';
  try {
    // The reScript.json is in /clips/BASE_FILENAME/BASE_FILENAME_reScript.json
    const transcriptRes = await fetch(`/clips/${baseFilenameForTranscript}/${baseFilenameForTranscript}_reScript.json?t=${Date.now()}`);
    if (!transcriptRes.ok) {
      if (transcriptRes.status === 404) {
        transcriptListEl.innerHTML = '<li>요약 영상 자막 정보를 찾을 수 없습니다.</li>';
      } else {
        transcriptListEl.innerHTML = '<li>자막 로드 중 오류가 발생했습니다.</li>';
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
        if (finalVideo) {
          finalVideo.currentTime = parseFloat(segment.start);
          finalVideo.play();
        }
      });
      transcriptListEl.appendChild(listItem);
    });
    if (finalVideo) {
      finalVideo.removeEventListener('timeupdate', highlightCurrentTranscript); // Remove previous if any
      finalVideo.addEventListener('timeupdate', highlightCurrentTranscript);
    }
  } catch (err) {
    console.error(`요약 영상 자막(${baseFilenameForTranscript}) 처리 중 오류:`, err);
    if (transcriptListEl) transcriptListEl.innerHTML = '<li>자막을 불러오는 중 오류가 발생했습니다.</li>';
  }
}

// --- UI Update Functions (resetSummaryMetrics, updateSummaryMetricsFromServerData, animations) ---
export function resetSummaryMetrics(excludeScore = false) {
  if (!excludeScore && summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
  if (compressionRateValueEl) compressionRateValueEl.innerHTML = 'N/A <span class="metric-unit">압축</span>';
  if (keyScenesCountValueEl) keyScenesCountValueEl.innerHTML = 'N/A <span class="metric-unit">추출됨</span>';
  if (viewingTimeValueEl) viewingTimeValueEl.innerHTML = `<span class="time-original">N/A</span> → <span class="time-summary">N/A</span>`;
  if (summaryMethodValueEl) summaryMethodValueEl.textContent = 'N/A';
}

function updateSummaryMetricsFromServerData(data) {
  if (!data) {
    resetSummaryMetrics();
    return;
  }
  let summaryText = "균형 요약"; // Default for slider value 0.5
  const sliderVal = importanceSlider ? parseFloat(importanceSlider.value) : 0.5;
  if (!isNaN(sliderVal)) {
    if (sliderVal <= 0.4) summaryText = "하이라이트 요약";
    else if (sliderVal >= 0.6) summaryText = "스토리 요약";
  }

  if (summaryScoreValueEl) {
    summaryScoreValueEl.textContent = data.summary_score !== undefined ? parseFloat(data.summary_score).toFixed(1) : 'N/A';
  }
  if (compressionRateValueEl) {
    compressionRateValueEl.innerHTML = data.compression_ratio !== undefined ? `${parseFloat(data.compression_ratio).toFixed(1)}% <span class="metric-unit">압축</span>` : 'N/A <span class="metric-unit">압축</span>';
  }
  if (keyScenesCountValueEl) {
    keyScenesCountValueEl.innerHTML = data.segment_count !== undefined ? `${data.segment_count}개 <span class="metric-unit">추출됨</span>` : 'N/A <span class="metric-unit">추출됨</span>';
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

// --- Animation Logic (largely as is) ---
function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }

function animateCounter(element, start, end, decimalPlaces = 0, suffix = '', isComplexSuffix = false) {
  if (!element) return;
  const duration = 1500;
  const animStartTimeCounter = performance.now();
  const initialText = start.toFixed(decimalPlaces) + (isComplexSuffix && suffix ? ` ${suffix}` : suffix);

  // If complex suffix (contains span), handle carefully
  if (isComplexSuffix && element.querySelector('.metric-unit') && suffix.includes('<span')) {
    const numberPart = start.toFixed(decimalPlaces);
    element.innerHTML = `${numberPart} ${suffix}`; // Suffix already contains the span
  } else {
    element.textContent = initialText;
  }

  function updateCounter(timestamp) {
    const elapsedTime = timestamp - animStartTimeCounter;
    let progress = elapsedTime / duration;
    if (progress > 1) progress = 1;
    const easedProgress = easeOutQuart(progress);
    let currentValue = start + (end - start) * easedProgress;
    const currentTextValue = currentValue.toFixed(decimalPlaces);

    if (isComplexSuffix && element.querySelector('.metric-unit') && suffix.includes('<span')) {
      element.innerHTML = `${currentTextValue} ${suffix}`;
    } else {
      element.textContent = currentTextValue + (isComplexSuffix && suffix ? ` ${suffix}` : suffix);
    }

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  requestAnimationFrame(updateCounter);
}

function animateScoreCounter() {
  if (!summaryScoreValueEl) return;
  const endValueText = summaryScoreValueEl.textContent;
  if (endValueText === 'N/A' || endValueText === null || endValueText === undefined || endValueText === 'n') {
    summaryScoreValueEl.textContent = '0.0'; return;
  }
  const endValue = parseFloat(endValueText);
  if (isNaN(endValue)) {
    summaryScoreValueEl.textContent = '0.0'; return;
  }
  summaryScoreValueEl.textContent = '0.0'; // Start from 0.0
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
  if (metricsItems.length === 0) return;
  metricsItems.forEach((item, index) => {
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      item.classList.add('animate__animated', 'animate__fadeInUp');
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';

      const valueElement = item.querySelector('.metric-value');
      if (valueElement) {
        const originalHTML = valueElement.innerHTML; // Use innerHTML for complex content
        const textContentForParsing = valueElement.textContent; // Use textContent for parsing numbers

        if (textContentForParsing === 'N/A' || !textContentForParsing || textContentForParsing.includes('n')) return;

        if (valueElement.id === 'viewingTimeValue') { /* No specific counter animation */ }
        else {
          const match = textContentForParsing.match(/([0-9.]+)(.*)/);
          if (match && match[1]) {
            const finalValue = parseFloat(match[1]);
            // For complex suffixes like '% <span class="metric-unit">압축</span>'
            // We need to pass the HTML suffix part.
            let suffix = '';
            let isComplex = false;
            if (originalHTML.includes('<span class="metric-unit">')) {
              suffix = originalHTML.substring(originalHTML.indexOf('%') + 1).trim(); // Example
              if (valueElement.id === 'keyScenesCountValue') {
                suffix = originalHTML.substring(originalHTML.indexOf('개') + 1).trim();
              }
              isComplex = true;
            } else {
              suffix = match[2] ? match[2].trim() : '';
            }

            if (!isNaN(finalValue)) {
              animateCounter(valueElement, 0, finalValue, textContentForParsing.includes('.') ? 1 : 0, suffix, isComplex);
            }
          }
        }
      }
    }, index * 150);
  });
}


// --- NEW EXPORTED function for loading existing summary data ---
export async function loadResultDataForExistingSummary(originalFile, baseName, summaryVideoPath) {
  setGlobalUploadedFileName(originalFile); // Set the globally accessible filename

  resetProgressSteps();
  stopElapsedTime();
  if (highlightEditor) {
    highlightEditor.destroy();
    highlightEditor = null;
  }
  resetSummaryMetrics(); // Clear out old metrics

  // Set video sources
  if (originalVideo) originalVideo.src = `/uploads/${originalFile}?t=${Date.now()}`;
  if (finalVideo) finalVideo.src = `${summaryVideoPath}?t=${Date.now()}`; // summaryVideoPath is like /clips/base/highlight_base.mp4
  if (importanceOverlay) importanceOverlay.src = `/images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;

  return new Promise((resolve, reject) => {
    let originalVideoReady = false;
    let finalVideoReady = false;
    let errorOccurred = false;

    const checkAndProceed = async () => {
      if (originalVideoReady && finalVideoReady && !errorOccurred) {
        try {
          if (progressCard) progressCard.style.display = "none";
          if (resultCard) resultCard.style.display = "block";

          if (highlightBarContainer && originalVideo && currentUploadedFileNameFromHandler && resultCard) {
            if (highlightEditor) highlightEditor.destroy();
            highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, currentUploadedFileNameFromHandler, resultCard);
            if (highlightEditor) {
              // baseName is filename without extension
              await loadHighlightDataFromServerInternal(baseName, originalVideo);
              await loadAndRenderThumbnailsInternal(baseName);
            }
          }
          // baseName is filename without extension
          await fetchReportAndScoreForUIInternal(baseName);
          if (transcriptListEl) await loadAndDisplayShortformTranscriptInternal(baseName);

          const currentImportanceWeight = importanceSlider ? importanceSlider.value : "0.5";
          if (downloadBtn) {
            downloadBtn.onclick = () => {
              const link = document.createElement("a");
              link.href = finalVideo.src;
              const summaryPrefix = "summary";
              const weightSuffix = `_w${parseFloat(currentImportanceWeight).toFixed(1).replace('.', '')}`;
              link.download = `${summaryPrefix}${weightSuffix}_${originalFile}`; // originalFile has extension
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            };
          }
          resolve();
        } catch (err) {
          console.error("Error processing metadata for existing summary:", err);
          showToast("기존 요약 데이터 처리 중 오류", "error");
          reject(err);
        }
      }
    };

    const onOriginalVideoMetadataLoaded = () => {
      originalVideo.removeEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
      originalVideo.removeEventListener("error", onVideoError);
      originalVideoReady = true;
      checkAndProceed();
    };
    const onFinalVideoMetadataLoaded = () => {
      finalVideo.removeEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
      finalVideo.removeEventListener("error", onVideoError);
      finalVideoReady = true;
      checkAndProceed();
    };
    const onVideoError = (e) => {
      if (errorOccurred) return;
      errorOccurred = true;
      originalVideo.removeEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
      finalVideo.removeEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
      originalVideo.removeEventListener("error", onVideoError);
      finalVideo.removeEventListener("error", onVideoError);

      const videoType = e.target.id === "originalVideo" ? "원본" : "요약";
      console.error(`Error loading ${videoType} video for existing summary:`, e.target.error);
      showToast(`${videoType} 영상 로드 실패: ${e.target.error?.message || '알 수 없는 오류'}`, "error");
      reject(new Error(`${videoType} video load error`));
    };

    if (originalVideo) {
      originalVideo.addEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
      originalVideo.addEventListener("error", onVideoError);
      if (originalVideo.readyState >= 2) onOriginalVideoMetadataLoaded(); // Already loaded
      else if (originalVideo.error) onVideoError({ target: originalVideo });
    } else { originalVideoReady = true; /* No original video element, proceed without it */ }

    if (finalVideo) {
      finalVideo.addEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
      finalVideo.addEventListener("error", onVideoError);
      if (finalVideo.readyState >= 2) onFinalVideoMetadataLoaded(); // Already loaded
      else if (finalVideo.error) onVideoError({ target: finalVideo });
    } else { finalVideoReady = true; /* No final video element */ }

    // If no video elements, proceed (though unlikely for this app)
    if (!originalVideo && !finalVideo) checkAndProceed();
  });
}


// --- Main initPipelineRunner (handles new processing) ---
export function initPipelineRunner() {
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      if (!currentUploadedFileNameFromHandler) {
        showToast("먼저 파일을 업로드해주세요.", "warning");
        return;
      }
      const currentImportanceWeight = importanceSlider ? importanceSlider.value : "0.5";
      startBtn.disabled = true;
      startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...';
      if (highlightEditor) {
        highlightEditor.destroy();
        highlightEditor = null;
      }
      resetSummaryMetrics();
      if (progressCard) progressCard.style.display = "block";
      if (resultCard) resultCard.style.display = "none";
      if (statusDiv) statusDiv.innerHTML = '<i class="fas fa-hourglass-start"></i> 0% - 생성 시작 중...';
      if (progressBarInner) progressBarInner.style.width = "0%";

      startElapsedTime();
      resetProgressSteps();
      updateProgressStep(1); // Initial step

      setTimeout(() => {
        document.getElementById("progress-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);

      startSSE(); // Start SSE for live progress updates

      let processResponseData;
      try {
        const processUrl = `/upload/process?filename=${encodeURIComponent(currentUploadedFileNameFromHandler)}&importanceWeight=${currentImportanceWeight}`;
        const processRes = await fetch(processUrl);
        processResponseData = await processRes.json();

        if (!processRes.ok) {
          const errorMessage = processResponseData?.message || processResponseData?.error || `요청 처리 실패 (${processRes.status})`;
          throw new Error(errorMessage);
        }
        // /upload/process acknowledged. SSE will give detailed progress.
        // Result display will be triggered by finalVideo.loadedmetadata after SSE indicates completion.

        // Set sources for videos - this will happen once Python script is done and files are available
        // SSE 'done' should ideally be the trigger for this, or this assumes Python completes before timeout
        if (originalVideo) originalVideo.src = `/uploads/${currentUploadedFileNameFromHandler}?t=${Date.now()}`;
        const baseName = currentUploadedFileNameFromHandler.replace(/\.mp4$/i, "");
        if (finalVideo) finalVideo.src = `/clips/${baseName}/highlight_${baseName}.mp4?t=${Date.now()}`;
        if (importanceOverlay) importanceOverlay.src = `/images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;

        let originalVideoReady = false;
        let finalVideoReady = false;
        let errorOccurred = false;

        const checkAndProceed = async () => {
          if (originalVideoReady && finalVideoReady && !errorOccurred) {
            if (progressCard) progressCard.style.display = "none";
            if (resultCard) resultCard.style.display = "block";

            if (highlightBarContainer && originalVideo && currentUploadedFileNameFromHandler && resultCard) {
              if (highlightEditor) highlightEditor.destroy();
              highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, currentUploadedFileNameFromHandler, resultCard);
              if (highlightEditor) {
                await loadHighlightDataFromServerInternal(baseName, originalVideo);
                await loadAndRenderThumbnailsInternal(baseName);
              }
            }

            await fetchReportAndScoreForUIInternal(baseName);
            if (transcriptListEl) await loadAndDisplayShortformTranscriptInternal(baseName);

            setTimeout(() => {
              if (resultCard) resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 400);
          }
        };
        const onOriginalVideoMetadataLoaded = () => {
          originalVideo.removeEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
          originalVideo.removeEventListener("error", onVideoError);
          originalVideoReady = true; checkAndProceed();
        };
        const onFinalVideoMetadataLoaded = () => {
          finalVideo.removeEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
          finalVideo.removeEventListener("error", onVideoError);
          finalVideoReady = true; checkAndProceed();
        };
        const onVideoError = (e) => {
          if (errorOccurred) return; errorOccurred = true;
          originalVideo.removeEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
          finalVideo.removeEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
          originalVideo.removeEventListener("error", onVideoError);
          finalVideo.removeEventListener("error", onVideoError);
          const videoType = e.target.id === "originalVideo" ? "원본" : "요약";
          console.error(`Error loading ${videoType} video after processing:`, e.target.error);
          showToast(`${videoType} 영상 로드 실패 (처리 후): ${e.target.error?.message || '알 수 없는 오류'}`, "error");
          // UI should show error in statusDiv or progressCard
          if (statusDiv && !sseSource) statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${videoType} 영상 로드 실패`;
        };

        if (originalVideo) {
          originalVideo.addEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
          originalVideo.addEventListener("error", onVideoError);
          if (originalVideo.readyState >= 2) onOriginalVideoMetadataLoaded();
          else if (originalVideo.error) onVideoError({ target: originalVideo });
        } else { originalVideoReady = true; }

        if (finalVideo) {
          finalVideo.addEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
          finalVideo.addEventListener("error", onVideoError);
          if (finalVideo.readyState >= 2) onFinalVideoMetadataLoaded();
          else if (finalVideo.error) onVideoError({ target: finalVideo });
        } else { finalVideoReady = true; }


        if (downloadBtn) {
          downloadBtn.onclick = () => {
            const link = document.createElement("a");
            if (finalVideo) link.href = finalVideo.src; else return;
            const summaryPrefix = "summary";
            const weightSuffix = `_w${parseFloat(currentImportanceWeight).toFixed(1).replace('.', '')}`;
            link.download = `${summaryPrefix}${weightSuffix}_${currentUploadedFileNameFromHandler}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };
        }

      } catch (err) { // Catch for fetch /upload/process or setup errors
        console.error("요약 처리 시작 중 오류:", err);
        if (statusDiv) statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
        showToast(`오류: ${err.message}`, "error");
        stopElapsedTime();
        if (sseSource) { sseSource.close(); sseSource = null; } // Close SSE on initial error
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 시작';
      }
      // `finally` removed for startBtn re-enable, as it should happen on SSE 'done' or error.
      // If SSE 'error' occurs, or 'done' with error, it should re-enable.
      // If initial fetch to /upload/process fails, it's re-enabled in catch.
    });
  }

  const newBtn = document.getElementById("newBtn");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      if (resultCard) resultCard.style.display = "none";
      if (progressCard) progressCard.style.display = "none";
      if (progressBarInner) progressBarInner.style.width = "0%";
      if (statusDiv) statusDiv.textContent = "";
      if (elapsedTimeDisplay) elapsedTimeDisplay.textContent = "00:00";
      stopElapsedTime();
      resetProgressSteps();
      if (highlightEditor) {
        highlightEditor.destroy();
        highlightEditor = null;
      }
      resetSummaryMetrics();
      resetUploadFormUI(); // This should call setUploadedFileName(null) internally or handle UI reset
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      if (startBtn) { // Re-enable start button if it was disabled by a completed/failed process
        startBtn.disabled = true; // Should be disabled until a new file is uploaded
        startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 시작';
      }
      // Reset video players
      if (originalVideo) { originalVideo.src = ""; originalVideo.load(); }
      if (finalVideo) { finalVideo.src = ""; finalVideo.load(); }
      if (importanceOverlay) importanceOverlay.src = "";


      document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Intersection observer for animations
  document.addEventListener('DOMContentLoaded', () => {
    const resultSection = document.getElementById('result-section');
    if (!resultSection) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active-scroll-section'); // Mark as active
          animateMetrics();
          animateScoreCounter();
          // observer.unobserve(entry.target); // Keep observing if needed, or unobserve if one-time
        } else {
          entry.target.classList.remove('active-scroll-section');
        }
      });
    }, { threshold: 0.3 }); // Trigger when 30% visible
    observer.observe(resultSection);
  });
}
