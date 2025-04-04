// public/static/highlightEditor.js
import { showToast, formatTime } from "./uiUtils.js";

/**
 * 하이라이트 편집기(Highlight Editor) 초기화
 * @param {HTMLElement} highlightBarContainer - 하이라이트를 그리는 컨테이너
 * @param {HTMLVideoElement} finalVideo - 최종(하이라이트) 영상 DOM
 * @param {string} uploadedFileName - 업로드된 비디오 파일명
 */
export function initHighlightEditor(highlightBarContainer, finalVideo, uploadedFileName) {
    let highlightSegments = [];
    let originalDuration = 0;
    let isEditMode = false;
    let backupSegments = null;

    // ------------------------------
    // UI 요소 준비
    // ------------------------------
    // "하이라이트 편집" / "편집 취소" 버튼
    const customizeBtn = document.createElement("button");
    customizeBtn.id = "customizeBtn";
    customizeBtn.className = "secondary-btn";
    customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 하이라이트 편집';

    // "저장" 버튼
    const saveCustomBtn = document.createElement("button");
    saveCustomBtn.id = "saveCustomBtn";
    saveCustomBtn.className = "primary-btn";
    saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
    saveCustomBtn.style.display = "none";

    // 버튼 그룹은 resultCard의 .button-group 을 가정
    const buttonGroup = document.querySelector(".button-group");
    buttonGroup.insertBefore(customizeBtn, buttonGroup.firstChild);
    buttonGroup.insertBefore(saveCustomBtn, buttonGroup.firstChild);

    // ------------------------------
    // 내부 함수들
    // ------------------------------

    /**
     * 현재 highlightSegments를 바탕으로 하이라이트 바를 그리는 함수
     */
    async function showHighlightBar() {
        // 먼저 기존 내용을 청소
        highlightBarContainer.innerHTML = "";

        // 타임 마커 추가
        const timeMarkers = document.createElement("div");
        timeMarkers.className = "time-markers";
        const ratioArray = [0, 0.25, 0.5, 0.75, 1];
        timeMarkers.innerHTML = ratioArray
            .map(r =>
                `<span class="time-marker" style="left: ${r * 100}%">
           ${formatTime(originalDuration * r)}
         </span>`
            )
            .join("");
        highlightBarContainer.appendChild(timeMarkers);

        // 하이라이트 구간 Block들
        highlightSegments.forEach((seg, index) => {
            const start = seg.start_time;
            const end = seg.end_time;
            const width = ((end - start) / originalDuration) * 100;
            const left = (start / originalDuration) * 100;

            const block = document.createElement("div");
            block.className = "highlight-segment";
            block.dataset.segmentId = index;
            Object.assign(block.style, {
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                height: "100%",
                backgroundColor: "#f72585",
                borderRadius: "8px",
                boxShadow: "0 0 4px rgba(0,0,0,0.3)",
                zIndex: "2",
                cursor: "pointer"
            });

            const leftHandle = document.createElement("div");
            leftHandle.className = "resize-handle left";

            const rightHandle = document.createElement("div");
            rightHandle.className = "resize-handle right";

            block.appendChild(leftHandle);
            block.appendChild(rightHandle);

            setupResizeHandle(leftHandle, seg, true);
            setupResizeHandle(rightHandle, seg, false);

            // Tooltip
            const tooltip = document.createElement("div");
            tooltip.className = "highlight-tooltip";
            tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
            Object.assign(tooltip.style, {
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(0,0,0,0.8)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
                display: "none",
                pointerEvents: "none",
                zIndex: "10"
            });
            block.appendChild(tooltip);

            block.addEventListener("mouseenter", () => (tooltip.style.display = "block"));
            block.addEventListener("mouseleave", () => (tooltip.style.display = "none"));

            // 클릭 시, 편집 모드에서 해당 구간을 삭제 (ghost 제거)
            block.addEventListener("click", (e) => {
                // 이벤트 버블링 방지
                e.stopPropagation();
                if (!isEditMode) return;
                // Remove this segment from the array
                const segId = parseInt(block.dataset.segmentId, 10);
                highlightSegments.splice(segId, 1);
                showHighlightBar();
            });

            highlightBarContainer.appendChild(block);
        });
    }

    /**
     * highlightBarContainer 클릭 시, 새 구간 추가 (편집 모드에서)
     */
    highlightBarContainer.addEventListener("click", (e) => {
        if (!isEditMode) return;
        // 클릭이 이미 구간 블록에 의해 처리되지 않았으면(버블링 방지됨)
        const containerRect = highlightBarContainer.getBoundingClientRect();
        const clickPosition = (e.clientX - containerRect.left) / containerRect.width;
        const clickTime = clickPosition * originalDuration;
        // 기본 길이를 5초로 설정하여 새 구간 추가
        const newSegment = {
            start_time: Math.max(0, clickTime - 2.5),
            end_time: Math.min(originalDuration, clickTime + 2.5),
            score: 0.5
        };
        highlightSegments.push(newSegment);
        showHighlightBar();
    });

    /**
     * 서버에서 JSON으로 받은 { segments, original_duration } 설정
     * -> highlightSegments, originalDuration 업데이트 후 Bar 리렌더링
     */
    function loadHighlightData(segments, duration) {
        highlightSegments = segments;
        originalDuration = duration;
        showHighlightBar();
    }

    /**
     * 편집 모드 토글
     */
    function toggleEditMode() {
        if (!isEditMode) {
            // 편집 모드 진입 시 현재 highlightSegments를 백업
            backupSegments = JSON.parse(JSON.stringify(highlightSegments)); // deep copy
            isEditMode = true;
            saveCustomBtn.style.display = "inline-block";
            customizeBtn.innerHTML = '<i class="fas fa-times"></i> 편집 취소';
        } else {
            // 편집 취소 시, 백업 복원
            if (backupSegments) {
                highlightSegments = backupSegments;
                backupSegments = null;
            }
            isEditMode = false;
            saveCustomBtn.style.display = "none";
            customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 하이라이트 편집';
            showHighlightBar(); // 원래 상태로 리렌더링
        }
    }

    function exitEditModeAfterSave() {
        backupSegments = null;
        isEditMode = false;
        saveCustomBtn.style.display = "none";
        customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 하이라이트 편집';
    }

    // setupResizeHandle를 내부 함수로 정의 (스코프 문제 해결)
    function setupResizeHandle(handle, seg, isLeft) {
        let isDragging = false;
        let startX = 0;
        let containerWidth = 0;
        let initialStart = 0;
        let initialEnd = 0;

        handle.addEventListener("mousedown", (e) => {
            if (!isEditMode) return;
            e.stopPropagation();
            e.preventDefault();

            isDragging = true;
            startX = e.clientX;
            containerWidth = highlightBarContainer.getBoundingClientRect().width;
            initialStart = seg.start_time;
            initialEnd = seg.end_time;

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dt = (dx / containerWidth) * originalDuration;

            if (isLeft) {
                const newStart = Math.max(0, Math.min(initialStart + dt, seg.end_time - 0.1));
                seg.start_time = newStart;
            } else {
                const newEnd = Math.min(originalDuration, Math.max(initialEnd + dt, seg.start_time + 0.1));
                seg.end_time = newEnd;
            }

            showHighlightBar(); // 실시간 리렌더링
        }

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        }
    }

    /**
     * 업데이트된 segments 서버에 저장
     */
    async function saveChanges() {
        // .disabled가 아닌 엘리먼트만 추려낸다 (이제 삭제된 항목은 배열에서 이미 제거됨)
        const updatedSegments = highlightSegments;

        try {
            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    filename: uploadedFileName,
                    segments: updatedSegments
                })
            });
            if (res.ok) {
                showToast("하이라이트 변경사항이 저장되었습니다!", "success");
                // 저장 성공 후 편집 모드 종료 (백업 버림)
                exitEditModeAfterSave();
                finalVideo.src = `/clips/highlight_${uploadedFileName}?` + Date.now();
            } else {
                showToast("변경사항 저장에 실패했습니다.", "error");
            }
        } catch (err) {
            console.error("하이라이트 저장 오류:", err);
            showToast("오류가 발생했습니다.", "error");
        }
    }

    // ------------------------------
    // 버튼 이벤트 연결
    // ------------------------------
    customizeBtn.addEventListener("click", toggleEditMode);
    saveCustomBtn.addEventListener("click", saveChanges);

    // ------------------------------
    // 모듈에서 제공할 API
    // ------------------------------
    return {
        loadHighlightData,  // 서버에서 받은 segments/duration 세팅
        showHighlightBar,   // 필요시 강제 리렌더 (보통 loadHighlightData 내에서 자동)
    };
}
