export function initSummaryOptions() {
    const highlightBtn = document.getElementById('highlightBtn');
    const storyBtn = document.getElementById('storyBtn');
    const durationInput = document.getElementById('durationInput');
    const startBtn = document.getElementById('startBtn');

    let summaryType = 'highlight'; // 기본값 설정

    highlightBtn.addEventListener('click', () => {
        summaryType = 'highlight';
        highlightBtn.classList.add('active');
        storyBtn.classList.remove('active');
        // 기존 하이라이트 방식은 uploadHandler.js에 연결됨
    });

    storyBtn.addEventListener('click', () => {
        summaryType = 'story';
        highlightBtn.classList.remove('active');
        storyBtn.classList.add('active');
        // 스토리 기반 방식 구현 예정
    });

    durationInput.addEventListener('input', () => {
        startBtn.disabled = durationInput.value.trim() === '';
    });

    startBtn.addEventListener('click', () => {
        if (summaryType === 'highlight') {
            console.log("하이라이트 기반 요약 시작");
        } else {
            console.log("스토리 기반 요약 (준비 중)");
        }
        console.log(`영상 길이 설정: ${durationInput.value}`);
    });
}
