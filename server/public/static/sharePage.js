// public/static/sharePage.js
import { loadThumbnails, loadTranscript, loadReportAndScore } from './pipelineRunner.js';

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

  await loadReportAndScore(baseName);
  await loadTranscript(baseName);
  await loadThumbnails(baseName);
});
