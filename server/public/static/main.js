// public/static/main.js
import { initUploadHandler } from './uploadHandler.js';
import { initPipelineRunner } from './pipelineRunner.js';

// DOMContentLoaded 후 각 기능 초기화
window.addEventListener("DOMContentLoaded", () => {
  initUploadHandler();
  initPipelineRunner();
});