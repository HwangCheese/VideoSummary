/*
summaryOptions.js – 요약 모드 선택 UI
------------------------------------
• highlight / story 두 옵션을 토글하며, 현재 선택값을 다른 모듈이 가져갈 수 있도록
  `currentSummaryType` 과 `getSummaryType()` 을 export.
*/

export let currentSummaryType = "highlight"; // 기본값

export function getSummaryType() {
    return currentSummaryType;
}

export function initSummaryOptions() {
    const highlightBtn = document.getElementById("highlightBtn");
    const storyBtn = document.getElementById("storyBtn");
    const durationInput = document.getElementById("durationInput");
    const startBtn = document.getElementById("startBtn");

    // --- 버튼 토글 ---
    highlightBtn.addEventListener("click", () => {
        currentSummaryType = "highlight";
        highlightBtn.classList.add("active");
        storyBtn.classList.remove("active");
    });

    storyBtn.addEventListener("click", () => {
        currentSummaryType = "story";
        storyBtn.classList.add("active");
        highlightBtn.classList.remove("active");
    });

    // --- 길이 입력 유효성 ---
    durationInput.addEventListener("input", () => {
        startBtn.disabled = durationInput.value.trim() === "";
    });

    // --- 디버깅용 콘솔 ---
    startBtn.addEventListener("click", () => {
        console.log(`선택된 요약 타입: ${currentSummaryType}`);
        console.log(`요약 길이: ${durationInput.value || "default"}`);
    });
}
