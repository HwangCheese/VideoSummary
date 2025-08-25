// public/static/main.js
import { initUploadHandler } from './uploadHandler.js';
import { initPipelineRunner } from './pipelineRunner.js';
import { initScrollerHandler } from './scrollHandler.js';
import { initExistingSummariesHandler } from './existingSummariesHandler.js';

// DOM 콘텐츠가 모두 로드된 후 각 기능 모듈 초기화
window.addEventListener("DOMContentLoaded", () => {
  initUploadHandler(); // 파일 업로드 관련 UI 및 로직 초기화
  initPipelineRunner(); // 요약 프로세스 실행 및 결과 표시 관련 로직 초기화
  initScrollerHandler(); // 전체 페이지 스크롤 기능 초기화
  initExistingSummariesHandler(); // 기존 요약 목록 사이드바 기능 초기화
});