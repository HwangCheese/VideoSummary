// public/static/shareHandler.js
import { showToast } from "./uiUtils.js";

/**
 * 공유하기 버튼 기능 초기화 함수
 * 사용자가 버튼을 클릭하면 공유 가능한 URL을 생성하고, 클립보드에 복사합니다.
 * 
 * @param {string} uploadedFileName - 업로드된 비디오 파일의 이름
 * @param {Array} highlightSegments - 공유할 결과에 포함될 하이라이트 구간 데이터
 * @param {number} summaryScore - 요약 영상의 총 점수
 * @param {number} originalDuration - 원본 영상의 전체 길이(초)
 */
export function initShareHandler(uploadedFileName, highlightSegments, summaryScore, originalDuration) {
    const shareBtn = document.getElementById("shareBtn");
    if (!shareBtn) return;
    if (shareBtn.dataset.shareInit) return;
    shareBtn.dataset.shareInit = "1";
    console.log('[share] initShareHandler bound to #shareBtn');

    // 공유하기 버튼 클릭 이벤트 등록
    shareBtn.addEventListener("click", async () => {
        try {
            // 버튼 상태 변경 (로딩 표시)
            shareBtn.disabled = true;
            shareBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 공유 링크 생성중...';

            const ctx = (typeof window !== "undefined" && window.VideoSummaryContext) ? window.VideoSummaryContext : {};
            const fname = uploadedFileName || ctx.uploadedFileName;
            const segs = Array.isArray(highlightSegments) ? highlightSegments
                : (typeof highlightSegments === "function" ? highlightSegments()
                    : (ctx.getSegments?.() || []));
            const score = (typeof summaryScore === "number") ? summaryScore : (ctx.getScore?.() ?? null);
            const duration = (typeof originalDuration === "number") ? originalDuration : (ctx.getDuration?.() ?? null);

            // 공유 요청에 포함될 데이터 구성
            const payload = {
                filename: fname,
                segments: segs,
                score: score,
                meta: {
                    duration: duration,
                    createdAt: new Date().toISOString(), // 생성 시각 저장
                },
            };

            // 백엔드에 공유 링크 생성 요청
            const res = await fetch("/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error("공유 링크 생성 요청 실패");

            const { url } = await res.json();

            // 생성된 URL을 클립보드에 복사
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                // 구형 브라우저 호환용 (임시 textarea 활용)
                const textarea = document.createElement("textarea");
                textarea.value = url;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
            }

            // 사용자에게 성공 메시지 표시
            showToast("공유 링크가 클립보드에 복사되었습니다!", "success");

        } catch (err) {
            console.error("공유 링크 생성 중 오류:", err);
            showToast("공유 링크 생성에 실패했습니다.", "error");
        } finally {
            // 버튼 상태 원래대로 복구
            shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> 공유하기';
            shareBtn.disabled = false;
        }
    });
}
