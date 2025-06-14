// public/static/main.js
import { initUploadHandler } from './uploadHandler.js';
import { initPipelineRunner } from './pipelineRunner.js';
import { initScrollerHandler } from './scrollHandler.js';
import { initExistingSummariesHandler } from './existingSummariesHandler.js';

// DOMContentLoaded 후 각 기능 초기화
window.addEventListener("DOMContentLoaded", () => {
  initUploadHandler();
  initPipelineRunner();
  initScrollerHandler();
  initExistingSummariesHandler();
});