// public/static/sharePage.js
import { loadThumbnails, loadTranscript, loadReportAndScore } from './pipelineRunner.js';
import { initHighlightEditor } from './highlightEditor.js';

document.addEventListener('DOMContentLoaded', async () => {
  const section = document.getElementById('result-section');

  // 1) 우선 data-filename에서 시도
  let filename = section?.dataset.filename || '';

  // 2) 없으면 원본 비디오 src에서 추출 (예: /uploads/peach_cut_test.mp4)
  if (!filename) {
    const ov = document.getElementById('originalVideo');
    const src = ov?.getAttribute('src') || ov?.src || '';
    const m = src.match(/\/uploads\/([^/?#]+)/i);
    if (m && m[1]) filename = decodeURIComponent(m[1]);
  }

  if (!filename) {
    console.warn('[sharePage] filename을 찾지 못했습니다. 데이터 로드를 중단합니다.');
    return;
  }

  const baseName = filename.replace(/\.mp4$/i, '');

  const importanceOverlay = document.getElementById('importanceOverlay');
  if (importanceOverlay) {
    importanceOverlay.src = `../images/frameScore/${baseName}_frameScoreGraph.png?t=${Date.now()}`;
  }

  const originalVideo = document.getElementById('originalVideo');
  const highlightBarContainer = document.getElementById('highlightBarContainer');
  const resultCard = document.getElementById('resultCard');

  if (originalVideo && highlightBarContainer && resultCard) {
    // highlightEditor 초기화
    const editor = initHighlightEditor(highlightBarContainer, originalVideo, filename, resultCard);

    // 비디오 메타데이터가 있어야 duration을 알 수 있으므로, 메타데이터 로드 후 세그먼트 반영
    const ensureReady = () =>
      new Promise(resolve => {
        if (originalVideo.readyState >= 1) return resolve();
        originalVideo.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });

    await ensureReady();

    try {
      const segRes = await fetch(`/results/segments/${encodeURIComponent(filename)}?t=${Date.now()}`);
      if (segRes.ok) {
        const segData = await segRes.json();
        const segments = segData?.segments || [];
        const originalDuration = segData?.original_duration || originalVideo.duration || 0;
        editor.loadHighlightData(segments, originalDuration);
      } else if (segRes.status === 404) {
        console.warn(`[sharePage] 세그먼트 JSON 없음: /results/segments/${filename}`);
        editor.loadHighlightData([], originalVideo.duration || 0);
      } else {
        console.warn(`[sharePage] 세그먼트 로드 실패 (${segRes.status})`);
        editor.loadHighlightData([], originalVideo.duration || 0);
      }
    } catch (e) {
      console.error('[sharePage] 세그먼트 요청 오류:', e);
      editor.loadHighlightData([], originalVideo.duration || 0);
    }
  }

  await loadReportAndScore(baseName);
  await loadTranscript(baseName);
  await loadThumbnails(baseName);
});
