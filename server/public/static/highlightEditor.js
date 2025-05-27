// public/static/highlightEditor.js
import { showToast, formatTime } from "./uiUtils.js";

export function initHighlightEditor(highlightBarContainer, finalVideo, uploadedFileName, resultCard) {
    let highlightSegments = [];
    let originalDuration = 0;
    let isEditMode = false;
    let backupSegments = null;

    if (!resultCard) {
        console.error("Highlight Editor 초기화 실패: resultCard 요소가 필요합니다.");
        return null;
    }

    // "직접 편집" 버튼 생성
    const customizeBtn = document.createElement("button");
    customizeBtn.id = "customizeBtn";
    customizeBtn.className = "secondary-btn default-action";
    customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';

    // "변경사항 저장" 버튼 생성
    const saveCustomBtn = document.createElement("button");
    saveCustomBtn.id = "saveCustomBtn";
    saveCustomBtn.className = "primary-btn";
    saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
    saveCustomBtn.style.display = "none"; // 기본적으로 숨김

    // "편집 취소" 버튼 생성
    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.id = "cancelEditBtn";
    cancelEditBtn.className = "secondary-btn";
    cancelEditBtn.innerHTML = '<i class="fas fa-times"></i> 편집 취소';
    cancelEditBtn.style.display = "none"; // 기본적으로 숨김


    // 버튼 그룹 및 기준이 될 버튼들 참조
    const buttonGroup = resultCard.querySelector(".button-group");
    const downloadBtnEl = document.getElementById("downloadBtn");
    const newBtnEl = document.getElementById("newBtn");
    const shareBtnEl = document.getElementById("shareBtn");

    if (buttonGroup && downloadBtnEl && newBtnEl && shareBtnEl) {
        // 편집 관련 버튼들을 newBtnEl 앞에 삽입 (이 순서대로 DOM에 들어감)
        // 최종 순서: 다운로드 - 직접 편집 - (편집 시: 편집 취소 - 변경사항 저장) - 새 영상 - 공유하기
        buttonGroup.insertBefore(saveCustomBtn, newBtnEl);    // 저장 버튼을 "새 영상" 앞에
        buttonGroup.insertBefore(cancelEditBtn, saveCustomBtn); // 취소 버튼을 "저장" 버튼 바로 앞에

        // "직접 편집" 버튼을 "다운로드" 다음, "새 영상 만들기" 앞에 (즉, 취소/저장 버튼들 앞에 위치하게 됨)
        buttonGroup.insertBefore(customizeBtn, cancelEditBtn); // cancelEditBtn이 newBtnEl 앞에 있으므로 이 위치가 맞음
    } else {
        console.error("버튼 그룹 또는 기준 버튼(downloadBtn, newBtn, shareBtn)을 찾을 수 없습니다. 버튼 배치에 실패했습니다.");
    }

    // 버튼 표시 상태를 관리하는 함수
    function setButtonVisibility(isEditingMode) {
        // 기본 액션 버튼들 (HTML에 원래 있던 버튼들 + customizeBtn)
        if (downloadBtnEl) downloadBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (newBtnEl) newBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (shareBtnEl) shareBtnEl.style.display = isEditingMode ? "none" : "inline-block";

        // 편집 플로우 관련 버튼들
        customizeBtn.style.display = isEditingMode ? "none" : "inline-block";   // "직접 편집" 버튼
        saveCustomBtn.style.display = isEditingMode ? "inline-block" : "none";    // "변경사항 저장" 버튼
        cancelEditBtn.style.display = isEditingMode ? "inline-block" : "none";    // "편집 취소" 버튼
    }

    // "직접 편집" 버튼 클릭 시 -> 편집 모드 진입
    function enterEditMode() {
        if (isEditMode) return;

        backupSegments = JSON.parse(JSON.stringify(highlightSegments));
        isEditMode = true;
        setButtonVisibility(true);
        resultCard.classList.add('editing-mode');
        highlightBarContainer.style.cursor = "crosshair";
        showToast("편집 모드 활성화", "info");
        showHighlightBar();
    }

    // "편집 취소" 버튼 클릭 시 또는 로직상 취소 시 -> 편집 모드 종료 (변경사항 복원)
    function cancelEditing() {
        if (!isEditMode) return;

        if (backupSegments) {
            highlightSegments = JSON.parse(JSON.stringify(backupSegments));
            backupSegments = null;
        }
        isEditMode = false;
        setButtonVisibility(false);
        resultCard.classList.remove('editing-mode');
        highlightBarContainer.style.cursor = "default";
        showToast("편집이 취소되었습니다.", "info");
        showHighlightBar();
    }

    // "변경사항 저장" 성공 후 -> 편집 모드 종료 (변경사항 유지)
    function exitEditModeAfterSave() {
        backupSegments = null;
        isEditMode = false;
        setButtonVisibility(false);
        resultCard.classList.remove('editing-mode');
        highlightBarContainer.style.cursor = "default";
        showHighlightBar();
    }

    function showHighlightBar() {
        highlightBarContainer.innerHTML = "";

        const timeMarkers = document.createElement("div");
        timeMarkers.className = "time-markers";
        const ratioArray = [0, 0.25, 0.5, 0.75, 1];
        if (originalDuration > 0) {
            timeMarkers.innerHTML = ratioArray
                .map(r => `<span class="time-marker" style="left: ${r * 100}%">${formatTime(originalDuration * r)}</span>`)
                .join("");
        }
        highlightBarContainer.appendChild(timeMarkers);

        highlightSegments.forEach((seg, index) => {
            if (originalDuration <= 0) return;

            const start = seg.start_time;
            const end = seg.end_time;
            const width = ((end - start) / originalDuration) * 100;
            const left = (start / originalDuration) * 100;
            if (isNaN(width) || isNaN(left) || width < 0 || left < 0) return;

            const block = document.createElement("div");
            block.className = "highlight-segment";
            block.dataset.segmentId = index;
            Object.assign(block.style, {
                position: "absolute",
                left: `${left}%`,
                width: `${Math.max(0, width)}%`,
                height: "100%",
                backgroundColor: "var(--accent-color)",
                borderRadius: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                zIndex: "2",
                cursor: isEditMode ? "grab" : "pointer",
                opacity: isEditMode ? "0.9" : "1.0",
                transition: "opacity 0.2s ease, background-color 0.2s ease",
            });

            const tooltip = document.createElement("div");
            tooltip.className = "highlight-tooltip";
            tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
            Object.assign(tooltip.style, {
                position: "absolute",
                bottom: "calc(100% + 5px)",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(0,0,0,0.8)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                display: "none",
                pointerEvents: "none",
                zIndex: "10",
                opacity: "0",
                transition: "opacity 0.2s ease, bottom 0.2s ease"
            });
            block.appendChild(tooltip);

            block.addEventListener("mouseenter", () => {
                tooltip.style.display = "block";
                setTimeout(() => {
                    tooltip.style.opacity = "1";
                    tooltip.style.bottom = "calc(100% + 8px)";
                }, 10);
            });
            block.addEventListener("mouseleave", () => {
                tooltip.style.opacity = "0";
                tooltip.style.bottom = "calc(100% + 5px)";
                setTimeout(() => {
                    if (tooltip.style.opacity === "0") tooltip.style.display = "none";
                }, 200);
            });

            if (isEditMode) {
                block.title = "클릭하여 삭제, 드래그하여 이동, 핸들로 크기 조절";

                const leftHandle = document.createElement("div");
                leftHandle.className = "resize-handle left";
                const rightHandle = document.createElement("div");
                rightHandle.className = "resize-handle right";
                block.appendChild(leftHandle);
                block.appendChild(rightHandle);
                setupResizeHandle(leftHandle, seg, true);
                setupResizeHandle(rightHandle, seg, false);

                block.addEventListener("click", (e) => {
                    // 핸들 클릭 시에는 삭제 로직 실행 안 함
                    if (e.target.classList.contains('resize-handle')) return;
                    e.stopPropagation();
                    if (confirm("이 구간을 삭제하시겠습니까?")) {
                        const segId = parseInt(block.dataset.segmentId, 10);
                        highlightSegments.splice(segId, 1);
                        showHighlightBar(); // 삭제 후 바 즉시 업데이트
                    }
                });
                setupDragAndDrop(block, seg);
            }
            highlightBarContainer.appendChild(block);
        });
    }

    function loadHighlightData(segments, duration) {
        highlightSegments = segments.map(s => ({ ...s }));
        originalDuration = duration;
        showHighlightBar();
    }

    function setupResizeHandle(handle, seg, isLeft) {
        handle.addEventListener("mousedown", (e) => {
            if (!isEditMode) return;
            e.stopPropagation();
            e.preventDefault();

            let isDragging = true;
            const startX = e.clientX;
            const containerWidth = highlightBarContainer.getBoundingClientRect().width;
            const initialStart = seg.start_time;
            const initialEnd = seg.end_time;
            const minDuration = 0.5; // 최소 구간 길이

            const ghost = handle.closest('.highlight-segment').cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.pointerEvents = 'none';
            ghost.style.backgroundColor = 'var(--primary-color)';
            highlightBarContainer.appendChild(ghost);

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const dx = moveEvent.clientX - startX;
                const dt = (dx / containerWidth) * originalDuration;
                let newStart = seg.start_time; // seg 직접 수정 전 임시 변수
                let newEnd = seg.end_time;   // seg 직접 수정 전 임시 변수

                if (isLeft) {
                    newStart = Math.max(0, Math.min(initialStart + dt, initialEnd - minDuration));
                } else {
                    newEnd = Math.min(originalDuration, Math.max(initialEnd + dt, initialStart + minDuration));
                }

                // 유효성 검사 후 seg 업데이트
                if (newEnd - newStart >= minDuration) {
                    if (isLeft) seg.start_time = newStart;
                    else seg.end_time = newEnd;
                }


                const newLeftGhost = (seg.start_time / originalDuration) * 100;
                const newWidthGhost = ((seg.end_time - seg.start_time) / originalDuration) * 100;
                ghost.style.left = `${newLeftGhost}%`;
                ghost.style.width = `${Math.max(0, newWidthGhost)}%`; // 너비가 음수가 되지 않도록
                const tooltip = ghost.querySelector('.highlight-tooltip');
                if (tooltip) tooltip.textContent = `${formatTime(seg.start_time)} ~ ${formatTime(seg.end_time)}`;
            };

            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                ghost.remove();
                highlightSegments.sort((a, b) => a.start_time - b.start_time); // 정렬
                showHighlightBar(); // 최종 UI 업데이트
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    async function saveChanges() {
        if (highlightSegments.length === 0) {
            showToast("적어도 하나 이상의 구간이 필요합니다.", "warning");
            return;
        }

        // 중복 구간 및 유효성 검사 (선택적이지만 권장)
        for (let i = 0; i < highlightSegments.length; i++) {
            if (highlightSegments[i].end_time <= highlightSegments[i].start_time) {
                showToast(`잘못된 구간이 있습니다: ${formatTime(highlightSegments[i].start_time)}~${formatTime(highlightSegments[i].end_time)}`, "error");
                return;
            }
            for (let j = i + 1; j < highlightSegments.length; j++) {
                if (Math.max(highlightSegments[i].start_time, highlightSegments[j].start_time) < Math.min(highlightSegments[i].end_time, highlightSegments[j].end_time)) {
                    showToast("겹치는 구간이 있습니다. 수정해주세요.", "warning");
                    return;
                }
            }
        }

        const totalDuration = highlightSegments.reduce((sum, seg) => sum + (seg.end_time - seg.start_time), 0);
        console.log("총 숏폼 길이:", totalDuration.toFixed(1) + "초");

        try {
            saveCustomBtn.disabled = true;
            saveCustomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
            cancelEditBtn.disabled = true; // 저장 중에는 취소도 비활성화

            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: uploadedFileName, segments: highlightSegments })
            });

            saveCustomBtn.disabled = false;
            cancelEditBtn.disabled = false; // 저장 완료 후 취소 버튼 다시 활성화

            if (res.ok) {
                showToast("숏폼 변경사항이 저장되었습니다!", "success");
                exitEditModeAfterSave();
                const videoBaseName = uploadedFileName.replace(/\.mp4$/i, "");
                if (finalVideo) {
                    finalVideo.src = `/clips/${videoBaseName}/highlight_${videoBaseName}.mp4?t=${Date.now()}`;
                    finalVideo.load();
                }
            } else {
                const errorData = await res.json().catch(() => ({ message: "알 수 없는 오류" }));
                showToast(`변경사항 저장 실패: ${errorData.message || res.statusText}`, "error");
                saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            }
        } catch (err) {
            console.error("숏폼 저장 오류:", err);
            showToast(`네트워크 오류 또는 처리 중 문제 발생: ${err.message}`, "error");
            saveCustomBtn.disabled = false;
            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            cancelEditBtn.disabled = false;
        }
    }

    highlightBarContainer.addEventListener("click", (e) => {
        if (!isEditMode || e.target !== highlightBarContainer || originalDuration <= 0) return;

        const clickRatio = (e.clientX - highlightBarContainer.getBoundingClientRect().left) / highlightBarContainer.offsetWidth;
        const clickTime = clickRatio * originalDuration;
        const newSegmentDuration = 5; // 기본 5초
        const newSegment = {
            start_time: Math.max(0, clickTime - newSegmentDuration / 2),
            end_time: Math.min(originalDuration, clickTime + newSegmentDuration / 2),
            score: 0.5 // 기본 점수 또는 서버에서 계산
        };

        // 생성된 구간이 너무 짧거나, 시작시간 > 종료시간인 경우 조정
        if (newSegment.end_time - newSegment.start_time < 0.5) {
            if (clickTime < originalDuration / 2) { // 영상 앞부분 클릭
                newSegment.end_time = Math.min(originalDuration, newSegment.start_time + 0.5);
            } else { // 영상 뒷부분 클릭
                newSegment.start_time = Math.max(0, newSegment.end_time - 0.5);
            }
        }
        if (newSegment.end_time - newSegment.start_time < 0.5) { // 그래도 짧으면 추가 안함
            showToast("구간을 추가하기에 가장자리가 너무 가깝습니다.", "warning");
            return;
        }


        highlightSegments.push(newSegment);
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        showHighlightBar();
        showToast("새 구간 추가됨. 위치나 길이를 조절하세요.", "info");
    });

    function setupDragAndDrop(block, seg) {
        let isDragging = false, startX = 0, initialStart = 0, segmentDuration = 0, containerWidth = 0, ghost = null;

        block.addEventListener('mousedown', (e) => {
            if (!isEditMode || e.target.classList.contains('resize-handle')) return;
            e.preventDefault();

            isDragging = true;
            startX = e.clientX;
            initialStart = seg.start_time;
            segmentDuration = seg.end_time - seg.start_time;
            containerWidth = highlightBarContainer.getBoundingClientRect().width;

            ghost = block.cloneNode(true);
            ghost.style.opacity = '0.6';
            ghost.style.pointerEvents = 'none';
            ghost.style.backgroundColor = 'var(--primary-light)';
            highlightBarContainer.appendChild(ghost);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            let newStart = Math.max(0, Math.min(initialStart + (dx / containerWidth) * originalDuration, originalDuration - segmentDuration));
            const newLeft = (newStart / originalDuration) * 100;
            ghost.style.left = `${newLeft}%`;
            const tooltip = ghost.querySelector('.highlight-tooltip');
            if (tooltip) tooltip.textContent = `${formatTime(newStart)} ~ ${formatTime(newStart + segmentDuration)}`;
        }

        function onMouseUp(e) {
            if (!isDragging) return;
            isDragging = false;

            const finalGhostLeftPercentage = parseFloat(ghost.style.left);
            if (!isNaN(finalGhostLeftPercentage)) {
                seg.start_time = (finalGhostLeftPercentage / 100) * originalDuration;
                seg.end_time = seg.start_time + segmentDuration;
            }

            ghost.remove();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            highlightSegments.sort((a, b) => a.start_time - b.start_time);
            showHighlightBar();
        }
    }

    customizeBtn.addEventListener("click", enterEditMode);
    cancelEditBtn.addEventListener("click", cancelEditing);
    saveCustomBtn.addEventListener("click", saveChanges);

    setButtonVisibility(false); // 초기 버튼 상태 설정

    return {
        loadHighlightData,
        showHighlightBar,
        destroy() {
            customizeBtn.removeEventListener("click", enterEditMode);
            saveCustomBtn.removeEventListener("click", saveChanges);
            cancelEditBtn.removeEventListener("click", cancelEditing);

            if (customizeBtn && customizeBtn.parentElement) customizeBtn.remove();
            if (saveCustomBtn && saveCustomBtn.parentElement) saveCustomBtn.remove();
            if (cancelEditBtn && cancelEditBtn.parentElement) cancelEditBtn.remove();

            highlightBarContainer.innerHTML = "";
            highlightSegments = [];
            originalDuration = 0;
            isEditMode = false;
            backupSegments = null;
            if (resultCard) resultCard.classList.remove('editing-mode');
            highlightBarContainer.style.cursor = "default";
            console.log("Highlight Editor가 제거되었습니다.");
        }
    };
}