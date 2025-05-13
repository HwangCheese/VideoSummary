/*
summaryOptions.js – 요약 모드 선택 UI
*/

let currentSummaryType = "highlight"; // 기본값

export function getSummaryType() {
    return currentSummaryType;
}

export function initSummaryOptions() {
    const highlightRadio = document.getElementById("highlightRadio");
    const storyRadio = document.getElementById("storyRadio");
    const durationInput = document.getElementById("durationInput");
    const startBtn = document.getElementById("startBtn");

    if (!highlightRadio || !storyRadio || !durationInput || !startBtn) {
        console.warn("summaryOptions.js: 필수 요소를 찾을 수 없습니다.");
        return;
    }

    // --- 라디오 버튼 변경 시 currentSummaryType 반영
    highlightRadio.addEventListener("change", () => {
        if (highlightRadio.checked) currentSummaryType = "highlight";
    });

    storyRadio.addEventListener("change", () => {
        if (storyRadio.checked) currentSummaryType = "story";
    });

    // --- 길이 입력 유효성 검사
    durationInput.addEventListener("input", () => {
        startBtn.disabled = durationInput.value.trim() === "";
    });

    // --- 디버깅용 콘솔 로그
    startBtn.addEventListener("click", () => {
        console.log(`선택된 요약 타입: ${currentSummaryType}`);
        console.log(`요약 길이: ${durationInput.value || "default"}`);
    });
}
