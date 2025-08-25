// public/static/pipelineRunner.js
import {
  uploadedFileName as currentUploadedFileNameFromHandler,
  setUploadedFileName as setGlobalUploadedFileName
} from "./uploadHandler.js";
import {
  showToast,
  resetProgressSteps,
  updateProgressStep,
  resetUI as resetUploadFormUI,
  formatTime
} from "./uiUtils.js";
import { initHighlightEditor } from "./highlightEditor.js";
import { scrollToSectionExternally } from "./scrollHandler.js";

// 모듈 스코프 변수 및 DOM 요소
let sseSource; // Server-Sent Events 소스 객체
let highlightEditor = null; // 하이라이트 편집기 인스턴스

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

// 요약 통계 관련 DOM 요소
const summaryScoreValueEl = document.getElementById("summaryScoreValue");
const compressionRateValueEl = document.getElementById("compressionRateValue");
const keyScenesCountValueEl = document.getElementById("keyScenesCountValue");
const viewingTimeValueEl = document.getElementById("viewingTimeValue");
const summaryMethodValueEl = document.getElementById("summaryMethodValue");

let viewResultsBtn = null; // 결과 보기 버튼 (동적으로 생성)
const progressActionsContainer = document.getElementById("progressActions");

// 타이머 로직
let elapsedInterval = null;
let startTime = null;

/**
 * 경과 시간 타이머 시작
 */
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

/**
 * 경과 시간 타이머 중지
 */
function stopElapsedTime() {
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
}

// SSE(Server-Sent Events) 로직
/**
 * 서버로부터 진행률 업데이트를 받기 위해 SSE 연결 시작
 */
function startSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource("/upload/progress-sse");

  sseSource.addEventListener("message", (e) => {
    try {
      const state = JSON.parse(e.data);
      updateProgressUI(state); // 받은 데이터로 UI 업데이트
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
    if (statusDiv) statusDiv.textContent = "연결 오류 발생";
    showToast("진행률 업데이트 중 오류가 발생했습니다.", "error");
  });
}

/**
 * SSE를 통해 받은 상태 정보로 진행률 관련 UI 업데이트
 * @param {object} state - 서버에서 받은 상태 객체 { percent, message, step, done, error, reportData }
 */
function updateProgressUI(state) {
  if (progressBarInner) progressBarInner.style.width = `${state.percent}%`;
  const icon = state.done
    ? '<i class="fas fa-check-circle"></i>'
    : '<i class="fas fa-sync fa-spin"></i>';
  if (statusDiv) statusDiv.innerHTML = `${icon} ${state.percent}% - ${state.message || "처리 중..."}`;

  if (state.step) updateProgressStep(state.step);

  // 메시지 내용에 따라 진행 단계(step) 아이콘을 활성화
  const msg = state.message || "";
  if (msg.includes("특징 추출")) updateProgressStep(1);
  else if (msg.includes("장면 분할") || msg.includes("TransNetV2")) updateProgressStep(2);
  else if (msg.includes("오디오 추출")) updateProgressStep(3);
  else if (msg.includes("문장 추출") || msg.includes("Whisper") || msg.includes("자막") || msg.includes("세그먼트")) updateProgressStep(4);
  else if (msg.includes("AI 분석") || msg.includes("PGL-SUM") || msg.includes("중요도") || msg.includes("경계 보정")) updateProgressStep(5);
  else if (msg.includes("영상 생성") || msg.includes("요약 영상") || msg.includes("편집")) updateProgressStep(6);

  // 작업 완료 시
  if (state.done) {
    if (sseSource) {
      sseSource.close();
      sseSource = null;
    }
    stopElapsedTime();
    if (!state.error) {
      updateProgressStep(7);  // '완료' 단계 활성화

      const baseName = currentUploadedFileNameFromHandler.replace(/\.mp4$/i, "");
      
      // 원본 영상과 결과 영상을 불러옵니다.
      if (originalVideo) originalVideo.src = `/uploads/${currentUploadedFileNameFromHandler}?t=${Date.now()}`;
      if (finalVideo) finalVideo.src = `/clips/${baseName}/highlight_${baseName}.mp4?t=${Date.now()}`;
      if (importanceOverlay) importanceOverlay.src = `/images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;

      // 비디오 메타데이터가 로드된 후 후속 작업을 처리하는 로직
      let originalVideoReady = false;
      let finalVideoReady = false;
      let errorOccurred = false;

      const checkAndProceed = async () => {
        if (originalVideoReady && finalVideoReady && !errorOccurred) {
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
        // ... (기존 onVideoError 함수의 내용과 동일) ...
        const videoType = e.target.id === "originalVideo" ? "원본" : "요약";
        console.error(`Error loading ${videoType} video after processing:`, e.target.error);
        showToast(`${videoType} 영상 로드 실패 (처리 후): ${e.target.error?.message || '알 수 없는 오류'}`, "error");
        if (statusDiv && !sseSource) statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${videoType} 영상 로드 실패`;
      };

      if (originalVideo) {
        originalVideo.addEventListener("loadedmetadata", onOriginalVideoMetadataLoaded);
        originalVideo.addEventListener("error", onVideoError);
        if (originalVideo.readyState >= 2) onOriginalVideoMetadataLoaded();
      } else { originalVideoReady = true; }
      
      if (finalVideo) {
        finalVideo.addEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
        finalVideo.addEventListener("error", onVideoError);
        if (finalVideo.readyState >= 2) onFinalVideoMetadataLoaded();
      } else { finalVideoReady = true; }
    }
    
    if (statusDiv) statusDiv.innerHTML = `<i class="fas fa-check-circle"></i> 100% - 요약 완료!`;

    // 최종 리포트 데이터가 있으면 통계 UI 업데이트
    if (state.reportData) {
      updateSummaryMetricsFromServerData(state.reportData);
    }

    // '결과 보기' 버튼 표시
    if (viewResultsBtn) {
      viewResultsBtn.style.display = "inline-block";
    } else {
      console.warn("viewResultsBtn이 아직 초기화되지 않았습니다. 다음 UI 업데이트를 기다립니다.");
    }

  } else {
     // 진행 중일 때는 '결과 보기' 버튼 숨김
    if (viewResultsBtn && viewResultsBtn.style.display !== 'none') {
      viewResultsBtn.style.display = 'none';
    }
  }
}

// 내부 데이터 로딩 함수들
/**
 * 서버에서 하이라이트 구간(segment) 데이터를 가져와 편집기에 로드
 * @param {string} baseNameForJson - JSON 파일명을 위한 기본 이름
 * @param {HTMLVideoElement} originalVideoElRef - 원본 비디오 요소 참조
 */
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

/**
 * 서버에서 썸네일 데이터를 가져와 슬라이더에 렌더링
 * @param {string} baseFilename - 파일 기본 이름
 */
async function loadAndRenderThumbnailsInternal(baseFilename) {
  const slider = document.getElementById("thumbnailSlider");
  if (!slider) return;
  slider.innerHTML = '<div class="loading">썸네일 로딩…</div>';
  try {
    const res = await fetch(`/clips/${baseFilename}/${baseFilename}_thumbs.json?t=${Date.now()}`);
    if (!res.ok) {
      if (res.status === 404) slider.innerHTML = "<p>주요 장면 썸네일 정보가 없습니다.</p>";
      else slider.innerHTML = "<p>썸네일을 불러오지 못했습니다.</p>";
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

/**
 * 서버에서 리포트 및 점수 데이터를 가져와 통계 UI 업데이트
 * @param {string} baseFilenameForReport - 리포트 파일명을 위한 기본 이름
 */
async function fetchReportAndScoreForUIInternal(baseFilenameForReport) {
  const originalFileForEndpoints = baseFilenameForReport + ".mp4";
  console.log(`[${baseFilenameForReport}] Report 및 score 데이터 요청 시작 (file: ${originalFileForEndpoints})`);

  resetSummaryMetrics(true);

  try {
    const reportRes = await fetch(`/results/report/${originalFileForEndpoints}?t=${Date.now()}`);
    if (reportRes.ok) {
      const reportData = await reportRes.json();
      updateSummaryMetricsFromServerData(reportData);
    } else {
      console.warn(`[${baseFilenameForReport}] Report 데이터 로드 실패: ${reportRes.status}`);
    }
  } catch (err) {
    console.warn(`[${baseFilenameForReport}] Report 데이터 요청 오류:`, err);
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
  if (document.getElementById('result-section')?.classList.contains('active-scroll-section')) {
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

/**
 * 요약 영상의 자막(transcript) 데이터를 로드하여 표시
 * @param {string} baseFilenameForTranscript - 자막 파일명을 위한 기본 이름
 */
async function loadAndDisplayShortformTranscriptInternal(baseFilenameForTranscript) {
  if (!transcriptListEl || !finalVideo) return;
  transcriptListEl.innerHTML = '<li><i class="fas fa-spinner fa-spin"></i> 자막 로딩 중...</li>';
  try {
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
      finalVideo.removeEventListener('timeupdate', highlightCurrentTranscript);
      finalVideo.addEventListener('timeupdate', highlightCurrentTranscript);
    }
  } catch (err) {
    console.error(`요약 영상 자막(${baseFilenameForTranscript}) 처리 중 오류:`, err);
    if (transcriptListEl) transcriptListEl.innerHTML = '<li>자막을 불러오는 중 오류가 발생했습니다.</li>';
  }
}

/**
 * 요약 통계 메트릭 UI 초기화
 * @param {boolean} excludeScore - 점수 필드를 제외하고 초기화할지 여부
 */
export function resetSummaryMetrics(excludeScore = false) {
  if (!excludeScore && summaryScoreValueEl) summaryScoreValueEl.textContent = 'N/A';
  if (compressionRateValueEl) compressionRateValueEl.innerHTML = 'N/A <span class="metric-unit">요약</span>';
  if (keyScenesCountValueEl) keyScenesCountValueEl.innerHTML = 'N/A <span class="metric-unit">추출됨</span>';
  if (viewingTimeValueEl) viewingTimeValueEl.innerHTML = `<span class="time-original">N/A</span> → <span class="time-summary">N/A</span>`;
  if (summaryMethodValueEl) summaryMethodValueEl.innerHTML = 'N/A';
}

/**
 * 서버에서 받은 데이터로 요약 통계 UI 업데이트
 * @param {object} data - 서버의 리포트 데이터
 */
function updateSummaryMetricsFromServerData(data) {
  if (!data) {
    resetSummaryMetrics();
    return;
  }

  let summaryHtmlContent = "맞춤형 요약"; // 기본값

  const sliderElement = document.getElementById('importanceSlider');
  if (sliderElement) {
    const sliderVal = parseFloat(sliderElement.value); // 0 (하이라이트) ~ 1 (스토리)
    if (!isNaN(sliderVal)) {
      const highlightRatioForText = Math.round((1 - sliderVal) * 100);
      const storyRatioForText = Math.round(sliderVal * 100);

      console.log("Slider Value:", sliderVal);
      console.log("Highlight Ratio:", highlightRatioForText, "Display:", `하이라이트 ${highlightRatioForText}%`);
      console.log("Story Ratio:", storyRatioForText, "Display:", `스토리 ${storyRatioForText}%`);

      const highlightTextDisplay = `하이라이트 ${highlightRatioForText}%`;
      const storyTextDisplay = `스토리 ${storyRatioForText}%`;
      const primaryStyle = "color: var(--accent-color); font-weight: bold;";
      const secondaryStyle = "color: var(--dark-color); font-weight: normal;";

      if (sliderVal === 0) {
        summaryHtmlContent = `<span style="${primaryStyle}">${highlightTextDisplay}</span>`;
      } else if (sliderVal === 1) {
        summaryHtmlContent = `<span style="${primaryStyle}">${storyTextDisplay}</span>`;
      } else if (sliderVal === 0.5) {
        summaryHtmlContent = `<span style="${secondaryStyle}"><b>${highlightTextDisplay}</b></span><br><span style="${secondaryStyle}"><b>${storyTextDisplay}</b></span>`;
      } else {
        if (highlightRatioForText > storyRatioForText) {
          summaryHtmlContent = `<span style="${primaryStyle}">${highlightTextDisplay}</span><br><span style="${secondaryStyle}">${storyTextDisplay}</span>`;
        } else {
          summaryHtmlContent = `<span style="${primaryStyle}">${storyTextDisplay}</span><br><span style="${secondaryStyle}">${highlightTextDisplay}</span>`;
        }
      }
    }
  } else {
    if (data && data.summary_type_text) {
      summaryHtmlContent = data.summary_type_text; // 서버 제공 텍스트 사용
    } else {
      summaryHtmlContent = "요약 방식 정보 없음"; // 또는 다른 적절한 기본값
    }
  }

  if (summaryScoreValueEl) {
    summaryScoreValueEl.textContent = data.summary_score !== undefined ? parseFloat(data.summary_score).toFixed(1) : 'N/A';
  }

  if (compressionRateValueEl) {
    if (data.summarization_ratio_percentage !== undefined) {
      compressionRateValueEl.innerHTML = `${parseFloat(data.summarization_ratio_percentage).toFixed(1)}% <span class="metric-unit">요약</span>`;
    } else if (data.summary_duration !== undefined && data.full_duration !== undefined && data.full_duration > 0) {
      const ratio = (data.summary_duration / data.full_duration) * 100;
      compressionRateValueEl.innerHTML = `${parseFloat(ratio).toFixed(1)}% <span class="metric-unit">요약</span>`;
    } else {
      compressionRateValueEl.innerHTML = 'N/A <span class="metric-unit">요약</span>';
    }
  }

  if (keyScenesCountValueEl) {
    const selectedCount = data.selected_segment_count;
    const totalCount = data.total_scene_count;
    if (selectedCount !== undefined && totalCount !== undefined && totalCount > 0) {
      keyScenesCountValueEl.innerHTML =
        `${totalCount}개 중 <strong class="highlight-value">${selectedCount}개</strong> <span class="metric-unit">추출</span>`;
    } else if (selectedCount !== undefined) {
      keyScenesCountValueEl.innerHTML =
        `<strong class="highlight-value">${selectedCount}개</strong> <span class="metric-unit">추출됨</span>`;
    } else {
      keyScenesCountValueEl.innerHTML = 'N/A <span class="metric-unit">추출됨</span>';
    }
  }

  if (viewingTimeValueEl) {
    const originalTimeFormatted = data.full_duration !== undefined ? formatTime(data.full_duration) : 'N/A';
    const summaryTimeFormatted = data.summary_duration !== undefined ? formatTime(data.summary_duration) : 'N/A';
    viewingTimeValueEl.innerHTML = `<span class="time-original">${originalTimeFormatted}</span> → <span class="time-summary">${summaryTimeFormatted}</span>`;
  }
  if (summaryMethodValueEl) {
    summaryMethodValueEl.innerHTML = summaryHtmlContent;
    console.log("Applied HTML to summaryMethodValueEl:", summaryHtmlContent);
  } else {
    console.warn("summaryMethodValueEl is not found in the DOM.");
  }
}


function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }

/**
 * 숫자가 부드럽게 증가하는 카운터 애니메이션 적용
 * @param {HTMLElement} element - 애니메이션을 적용할 요소
 * @param {number} start - 시작 값
 * @param {number} end - 종료 값
 */
function animateCounter(element, start, end, decimalPlaces = 0, suffix = '', isComplexSuffix = false) {
  if (!element) return;
  const duration = 1500;
  const animStartTimeCounter = performance.now();
  const initialText = start.toFixed(decimalPlaces) + (isComplexSuffix && suffix ? ` ${suffix}` : suffix);
  if (isComplexSuffix && element.querySelector('.metric-unit') && suffix.includes('<span')) {
    const numberPart = start.toFixed(decimalPlaces);
    element.innerHTML = `${numberPart} ${suffix}`;
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

/**
 * 요약 점수 표시부에 카운터 애니메이션을 적용
 */
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

/**
 * '기존 요약 영상'을 클릭했을 때, 해당 영상의 모든 결과 데이터를 로드하고 화면에 표시
 * @param {string} originalFile - 원본 영상 파일명
 * @param {string} baseName - 파일 기본 이름 (확장자 제외)
 * @param {string} summaryVideoPath - 요약 영상의 서버 경로
 * @returns {Promise<void>} 모든 데이터 로딩이 완료되면 resolve되는 Promise
 */
export async function loadResultDataForExistingSummary(originalFile, baseName, summaryVideoPath) {
  setGlobalUploadedFileName(originalFile);

  // 이전 상태 초기화
  resetProgressSteps();
  stopElapsedTime();
  if (highlightEditor) {
    highlightEditor.destroy();
    highlightEditor = null;
  }
  resetSummaryMetrics();

  // 비디오 소스 설정
  if (originalVideo) originalVideo.src = `/uploads/${originalFile}?t=${Date.now()}`;
  if (finalVideo) finalVideo.src = `${summaryVideoPath}?t=${Date.now()}`;
  if (importanceOverlay) importanceOverlay.src = `/images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;

  // 비디오 메타데이터가 모두 로드된 후에 후속 작업을 처리하기 위해 Promise 사용
  return new Promise((resolve, reject) => {
    let originalVideoReady = false;
    let finalVideoReady = false;
    let errorOccurred = false;

    const checkAndProceed = async () => {
      if (originalVideoReady && finalVideoReady && !errorOccurred) {
        try {
          // UI 상태 전환
          if (progressCard) progressCard.style.display = "none";
          if (resultCard) resultCard.style.display = "block";

          // 하이라이트 편집기 초기화 및 데이터 로드
          if (highlightBarContainer && originalVideo && currentUploadedFileNameFromHandler && resultCard) {
            if (highlightEditor) highlightEditor.destroy();
            highlightEditor = initHighlightEditor(highlightBarContainer, originalVideo, currentUploadedFileNameFromHandler, resultCard);
            if (highlightEditor) {
              await loadHighlightDataFromServerInternal(baseName, originalVideo);
              await loadAndRenderThumbnailsInternal(baseName);
            }
          }
          // 기타 데이터 로드
          await fetchReportAndScoreForUIInternal(baseName);
          if (transcriptListEl) await loadAndDisplayShortformTranscriptInternal(baseName);

          const currentImportanceWeight = importanceSlider ? importanceSlider.value : "0.5";
          
          // 다운로드 버튼 기능 설정
          if (downloadBtn) {
            downloadBtn.onclick = () => {
              const link = document.createElement("a");
              link.href = finalVideo.src;
              const summaryPrefix = "summary";
              const weightSuffix = `_w${parseFloat(currentImportanceWeight).toFixed(1).replace('.', '')}`;
              link.download = `${summaryPrefix}${weightSuffix}_${originalFile}`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            };
          }
          resolve(); // 모든 작업 완료
        } catch (err) {
          console.error("Error processing metadata for existing summary:", err);
          showToast("기존 요약 데이터 처리 중 오류", "error");
          reject(err);
        }
      }
    };

    // 각 비디오의 loadedmetadata 및 error 이벤트에 대한 핸들러 설정
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
      if (originalVideo.readyState >= 2) onOriginalVideoMetadataLoaded();
      else if (originalVideo.error) onVideoError({ target: originalVideo });
    } else { originalVideoReady = true; }

    if (finalVideo) {
      finalVideo.addEventListener("loadedmetadata", onFinalVideoMetadataLoaded);
      finalVideo.addEventListener("error", onVideoError);
      if (finalVideo.readyState >= 2) onFinalVideoMetadataLoaded();
      else if (finalVideo.error) onVideoError({ target: finalVideo });
    } else { finalVideoReady = true; }

    if (!originalVideo && !finalVideo) checkAndProceed();
  });
}

/**
 * 파이프라인 실행과 관련된 모든 UI 요소와 이벤트 핸들러를 초기화
 */
export function initPipelineRunner() {
  const highlightRatioValueEl = document.getElementById('highlightRatioValue');
  const storyRatioValueEl = document.getElementById('storyRatioValue');
  const importanceSlider = document.getElementById('importanceSlider');
  const quickDownloadBtn = document.getElementById("quickDownloadBtn");

  // '하이라이트/스토리' 슬라이더 값 표시 업데이트 로직
  function updateSliderRatioDisplay() {
    if (!importanceSlider || !highlightRatioValueEl || !storyRatioValueEl) {
      return;
    }
    const sliderVal = parseFloat(importanceSlider.value); // 0.0 ~ 1.0

    const highlightRatio = Math.round((1 - sliderVal) * 10);
    const storyRatio = Math.round(sliderVal * 10);

    highlightRatioValueEl.textContent = highlightRatio;
    storyRatioValueEl.textContent = storyRatio;
  }

  if (importanceSlider) {
    updateSliderRatioDisplay();
    importanceSlider.addEventListener('input', updateSliderRatioDisplay);
  } else {
    console.warn("Importance slider element not found in initPipelineRunner.");
  }

  // '결과 보기' 버튼 동적 생성 및 이벤트 핸들러 추가
  if (progressActionsContainer) {
    const existingBtn = document.getElementById('viewResultsBtn');
    if (existingBtn) {
      existingBtn.remove();
    }

    viewResultsBtn = document.createElement("button");
    viewResultsBtn.id = "viewResultsBtn";
    viewResultsBtn.innerHTML = '<i class="fas fa-poll"></i> 결과 보기';
    viewResultsBtn.style.display = "none";
    viewResultsBtn.addEventListener("click", () => {
      scrollToSectionExternally(2, true); // 결과 섹션(인덱스 2)으로 스크롤
      viewResultsBtn.style.display = "none";
    });
    progressActionsContainer.appendChild(viewResultsBtn);
  } else {
    console.warn("progressActionsContainer 요소를 찾을 수 없습니다.");
  }

  // 다운로드 버튼 기능 설정
  function triggerDownload() {
    if (!finalVideo || !finalVideo.src || finalVideo.src.startsWith('blob:')) { // finalVideo.src가 유효한지 확인
      showToast("다운로드할 요약 영상이 없습니다.", "warning");
      return;
    }
    if (!currentUploadedFileNameFromHandler) {
      showToast("원본 파일명이 없어 다운로드 파일명을 생성할 수 없습니다.", "warning");
      return;
    }

    const link = document.createElement("a");
    link.href = finalVideo.src;
    const currentImportanceWeight = importanceSlider ? importanceSlider.value : "0.5";
    const summaryPrefix = "summary";
    const weightSuffix = `_w${parseFloat(currentImportanceWeight).toFixed(1).replace('.', '')}`;
    link.download = `${summaryPrefix}${weightSuffix}_${currentUploadedFileNameFromHandler}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (downloadBtn) { // 기존 하단 다운로드 버튼
    downloadBtn.onclick = triggerDownload;
  }

  if (quickDownloadBtn) { // "요약 영상" 제목 옆 새 다운로드 아이콘
    quickDownloadBtn.addEventListener("click", (event) => {
      event.stopPropagation(); // 이벤트 버블링 방지
      triggerDownload();
    });
  }

  // '요약 시작' 버튼 클릭 이벤트 핸들러
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      if (!currentUploadedFileNameFromHandler) {
        showToast("먼저 파일을 업로드해주세요.", "warning");
        return;
      }

      // UI를 '진행 중' 상태로 변경
      startBtn.disabled = true;
      if (viewResultsBtn) {
        viewResultsBtn.style.display = "none";
      }
      startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 요약 중...';
      if (highlightEditor) {
        highlightEditor.destroy();
        highlightEditor = null;
      }

      resetSummaryMetrics();
      if (progressCard) progressCard.style.display = "block";
      if (resultCard) resultCard.style.display = "none";
      if (statusDiv) statusDiv.innerHTML = '<i class="fas fa-hourglass-start"></i> 0% - 요약 시작 중...';
      if (progressBarInner) progressBarInner.style.width = "0%";

      // 타이머 및 SSE 시작
      startElapsedTime();
      resetProgressSteps();
      updateProgressStep(1);

      // 진행률 섹션으로 스크롤
      scrollToSectionExternally(1, true);

      startSSE();

      let processResponseData;
      try {
        // 서버에 요약 처리 요청
        const currentImportanceWeight = importanceSlider ? importanceSlider.value : "0.5";
        const durationPercentageInput = document.getElementById('durationPercentageInput');
        let topRatioForPython = 0.2; 

        if (durationPercentageInput && durationPercentageInput.value) {
          const percentage = parseFloat(durationPercentageInput.value);
          if (!isNaN(percentage) && percentage >= 1 && percentage <= 100) {
            topRatioForPython = (percentage / 100.0);
          } else {
            console.warn(`Invalid duration percentage: ${durationPercentageInput.value}. Using default top_ratio: ${topRatioForPython}`);
            showToast(`요약 비율 입력 값(${durationPercentageInput.value}%)이 잘못되어 기본값(20%)으로 처리합니다.`, "warning");
          }
        } else {
          console.warn(`Duration percentage input not found or empty. Using default top_ratio: ${topRatioForPython}`);
          showToast(`요약 비율이 설정되지 않아 기본값(20%)으로 처리합니다.`, "warning");
        }

        const processUrl = `/upload/process?filename=${encodeURIComponent(currentUploadedFileNameFromHandler)}&importanceWeight=${currentImportanceWeight}&topRatio=${topRatioForPython}`;

        console.log("Requesting pipeline process with URL:", processUrl);

        const processRes = await fetch(processUrl);
        processResponseData = await processRes.json();

        if (!processRes.ok) {
          const errorMessage = processResponseData?.message || processResponseData?.error || `요청 처리 실패 (${processRes.status})`;
          throw new Error(errorMessage);
        }
      } catch (err) {
        console.error("요약 처리 시작 중 오류:", err);
        if (statusDiv) statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> 오류: ${err.message}`;
        showToast(`오류: ${err.message}`, "error");
        stopElapsedTime();
        if (sseSource) { sseSource.close(); sseSource = null; }
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fas fa-magic"></i> 요약 시작';
      }
    });
  }

  // '새로 시작' 버튼 이벤트 핸들러
  const newBtn = document.getElementById("newBtn");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      scrollToSectionExternally(0, false);
      window.location.reload(true);
    });
  }

  // 결과 섹션이 보일 때 점수 애니메이션을 트리거하기 위한 IntersectionObserver 설정
  document.addEventListener('DOMContentLoaded', () => {
    const resultSection = document.getElementById('result-section');
    if (!resultSection) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active-scroll-section');
          animateScoreCounter();
        } else {
          entry.target.classList.remove('active-scroll-section');
        }
      });
    }, { threshold: 0.3 });
    observer.observe(resultSection);
  });
}