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
    if (!highlightBarContainer) {
        console.error("Highlight Editor 초기화 실패: highlightBarContainer 요소가 필요합니다.");
        return null;
    }

    const customizeBtn = document.createElement("button");
    customizeBtn.id = "customizeBtn";
    customizeBtn.className = "accent-btn default-action";
    customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';

    const saveCustomBtn = document.createElement("button");
    saveCustomBtn.id = "saveCustomBtn";
    saveCustomBtn.className = "primary-btn";
    saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
    saveCustomBtn.style.display = "none";

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.id = "cancelEditBtn";
    cancelEditBtn.className = "secondary-btn";
    cancelEditBtn.innerHTML = '<i class="fas fa-times"></i> 편집 취소';
    cancelEditBtn.style.display = "none";

    const buttonGroup = resultCard.querySelector(".button-group");
    const downloadBtnEl = document.getElementById("downloadBtn");
    const newBtnEl = document.getElementById("newBtn");
    const shareBtnEl = document.getElementById("shareBtn");

    if (buttonGroup && downloadBtnEl && newBtnEl && shareBtnEl) {
        buttonGroup.insertBefore(saveCustomBtn, newBtnEl);
        buttonGroup.insertBefore(cancelEditBtn, saveCustomBtn);
        buttonGroup.insertBefore(customizeBtn, cancelEditBtn);
    } else {
        console.error("버튼 그룹 또는 기준 버튼(downloadBtn, newBtn, shareBtn)을 찾을 수 없습니다. 버튼 배치에 실패했습니다.");
    }

    function setButtonVisibility(isEditingMode) {
        if (downloadBtnEl) downloadBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (newBtnEl) newBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (shareBtnEl) shareBtnEl.style.display = isEditingMode ? "none" : "inline-block";

        customizeBtn.style.display = isEditingMode ? "none" : "inline-block";
        saveCustomBtn.style.display = isEditingMode ? "inline-block" : "none";
        cancelEditBtn.style.display = isEditingMode ? "inline-block" : "none";
    }

    function enterEditMode() {
        if (isEditMode) return;

        backupSegments = JSON.parse(JSON.stringify(highlightSegments));
        isEditMode = true;
        setButtonVisibility(true);
        resultCard.classList.add('editing-mode');
        highlightBarContainer.style.bottom = "-20px"; // 비디오 컨트롤러 아래로 바 밑으로 내림
        highlightBarContainer.style.opacity = "1";
        highlightBarContainer.style.pointerEvents = "auto";
        highlightBarContainer.style.cursor = "crosshair";

        showToast("편집 모드 활성화. 구간을 클릭하여 삭제하거나, 드래그/조절하세요.", "info");
        showHighlightBar();
    }

    function commonExitEditModeActions() {
        isEditMode = false;
        setButtonVisibility(false);
        resultCard.classList.remove('editing-mode');
        highlightBarContainer.style.bottom = "";
        highlightBarContainer.style.opacity = "";
        highlightBarContainer.style.pointerEvents = "";
        highlightBarContainer.style.cursor = "default";
        showHighlightBar();
    }

    function cancelEditing() {
        if (!isEditMode) return;
        if (backupSegments) {
            highlightSegments = JSON.parse(JSON.stringify(backupSegments));
            backupSegments = null;
        }
        commonExitEditModeActions();
        showToast("편집이 취소되었습니다.", "info");
    }

    function exitEditModeAfterSave() {
        commonExitEditModeActions();
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
            let width = ((end - start) / originalDuration) * 100;
            let left = (start / originalDuration) * 100;

            left = Math.max(0, Math.min(left, 100));
            width = Math.max(0, Math.min(width, 100 - left));

            if (isNaN(width) || isNaN(left) || width < 0) {
                console.warn("Skipping segment due to invalid dimensions:", { start, end, width, left, originalDuration });
                return;
            }

            const block = document.createElement("div");
            block.className = "highlight-segment";
            block.dataset.segmentIndex = index;
            Object.assign(block.style, {
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                height: "100%",
                backgroundColor: "var(--accent-color)",
                borderRadius: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                zIndex: "2",
                cursor: isEditMode ? "grab" : "pointer",
                opacity: isEditMode ? "0.9" : "1.0",
                transition: "opacity 0.2s ease, background-color 0.2s ease, left 0.1s ease, width 0.1s ease, box-shadow 0.2s ease",
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
                if (isEditMode) block.style.boxShadow = "0 0 8px var(--accent-color)";
                setTimeout(() => {
                    tooltip.style.opacity = "1";
                    tooltip.style.bottom = "calc(100% + 8px)";
                }, 10);
            });
            block.addEventListener("mouseleave", () => {
                tooltip.style.opacity = "0";
                if (isEditMode) block.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
                tooltip.style.bottom = "calc(100% + 5px)";
                setTimeout(() => {
                    if (tooltip.style.opacity === "0") tooltip.style.display = "none";
                }, 200);
            });

            if (isEditMode) {
                block.style.cursor = "pointer"
                block.title = "클릭하여 삭제, 드래그하여 이동, 핸들로 크기 조절";
                block.addEventListener("click", (e) => {
                    if (!isEditMode) return;
                    if (e.target.classList.contains('resize-handle')) return;

                    e.stopPropagation();

                    if (confirm(`이 구간(${formatTime(seg.start_time)} ~ ${formatTime(seg.end_time)})을 삭제하시겠습니까?`)) {
                        highlightSegments.splice(index, 1);
                        showHighlightBar();
                        showToast("구간이 삭제되었습니다.", "info");
                    }
                });

                const leftHandle = document.createElement("div");
                leftHandle.className = "resize-handle left";
                const rightHandle = document.createElement("div");
                rightHandle.className = "resize-handle right";
                block.appendChild(leftHandle);
                block.appendChild(rightHandle);

                setupResizeHandle(leftHandle, highlightSegments[index], true, index);
                setupResizeHandle(rightHandle, highlightSegments[index], false, index);
                setupDragAndDrop(block, highlightSegments[index], index);
            }
            highlightBarContainer.appendChild(block);
        });
    }

    function loadHighlightData(segments, duration) {
        highlightSegments = segments.map(s => ({ ...s }));
        originalDuration = duration;
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        showHighlightBar();
    }

    function setupResizeHandle(handle, segRef, isLeft, segmentIndex) {
        handle.addEventListener("mousedown", (e) => {
            if (!isEditMode) return;
            e.stopPropagation();
            e.preventDefault();

            let isDragging = true;
            const startX = e.clientX;
            const containerRect = highlightBarContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;

            const initialStart = segRef.start_time;
            const initialEnd = segRef.end_time;
            const minDuration = 0.1;
            const ghost = handle.closest('.highlight-segment').cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.pointerEvents = 'none';
            ghost.style.backgroundColor = 'var(--primary-color)';
            highlightBarContainer.appendChild(ghost);

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const dx = moveEvent.clientX - startX;
                const dt = (dx / containerWidth) * originalDuration;

                let newProposedStart = segRef.start_time;
                let newProposedEnd = segRef.end_time;

                if (isLeft) {
                    newProposedStart = Math.max(0, Math.min(initialStart + dt, initialEnd - minDuration));
                    if (segmentIndex > 0) {
                        const prevSegment = highlightSegments[segmentIndex - 1];
                        newProposedStart = Math.max(newProposedStart, prevSegment.end_time);
                    }
                } else {
                    newProposedEnd = Math.min(originalDuration, Math.max(initialEnd + dt, initialStart + minDuration));
                    if (segmentIndex < highlightSegments.length - 1) {
                        const nextSegment = highlightSegments[segmentIndex + 1];
                        newProposedEnd = Math.min(newProposedEnd, nextSegment.start_time);
                    }
                }

                if (isLeft) {
                    if (newProposedStart <= newProposedEnd - minDuration) {
                        segRef.start_time = newProposedStart;
                    } else {
                        segRef.start_time = newProposedEnd - minDuration;
                    }
                } else {
                    if (newProposedEnd >= newProposedStart + minDuration) {
                        segRef.end_time = newProposedEnd;
                    } else {
                        segRef.end_time = newProposedStart + minDuration;
                    }
                }
                segRef.start_time = Math.max(0, segRef.start_time);
                segRef.end_time = Math.min(originalDuration, segRef.end_time);

                const newLeftGhost = (segRef.start_time / originalDuration) * 100;
                const newWidthGhost = ((segRef.end_time - segRef.start_time) / originalDuration) * 100;
                ghost.style.left = `${newLeftGhost}%`;
                ghost.style.width = `${Math.max(0, newWidthGhost)}%`;
                const tooltip = ghost.querySelector('.highlight-tooltip');
                if (tooltip) tooltip.textContent = `${formatTime(segRef.start_time)} ~ ${formatTime(segRef.end_time)}`;
            };

            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                ghost.remove();
                highlightSegments.sort((a, b) => a.start_time - b.start_time);
                showHighlightBar();
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
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        for (let i = 0; i < highlightSegments.length; i++) {
            if (highlightSegments[i].end_time <= highlightSegments[i].start_time) {
                showToast(`잘못된 구간이 있습니다 (종료시간이 시작시간보다 빠르거나 같음): ${formatTime(highlightSegments[i].start_time)}~${formatTime(highlightSegments[i].end_time)}`, "error");
                return;
            }
            if (i > 0 && highlightSegments[i].start_time < highlightSegments[i - 1].end_time) {
                showToast(`겹치는 구간이 있습니다: ${formatTime(highlightSegments[i - 1].end_time)}와 ${formatTime(highlightSegments[i].start_time)}`, "warning");
                return;
            }
        }

        const totalDuration = highlightSegments.reduce((sum, seg) => sum + (seg.end_time - seg.start_time), 0);
        console.log("총 숏폼 길이:", totalDuration.toFixed(1) + "초");

        try {
            saveCustomBtn.disabled = true;
            saveCustomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
            cancelEditBtn.disabled = true;

            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: uploadedFileName, segments: highlightSegments })
            });

            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            saveCustomBtn.disabled = false;
            cancelEditBtn.disabled = false;

            if (res.ok) {
                showToast("숏폼 변경사항이 저장되었습니다!", "success");
                const data = await res.json();
                if (finalVideo && data.video_path) {
                    finalVideo.src = data.video_path;
                    finalVideo.load();
                }
                backupSegments = JSON.parse(JSON.stringify(highlightSegments));
                exitEditModeAfterSave();

            } else {
                const errorData = await res.json().catch(() => ({ message: "알 수 없는 오류" }));
                showToast(`변경사항 저장 실패: ${errorData.message || res.statusText}`, "error");
            }
        } catch (err) {
            console.error("숏폼 저장 오류:", err);
            showToast(`네트워크 오류 또는 처리 중 문제 발생: ${err.message}`, "error");
            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            saveCustomBtn.disabled = false;
            cancelEditBtn.disabled = false;
        }
    }

    highlightBarContainer.addEventListener("click", (e) => {
        if (!isEditMode || e.target !== highlightBarContainer || originalDuration <= 0) return;

        const rect = highlightBarContainer.getBoundingClientRect();
        const clickRatio = (e.clientX - rect.left) / rect.width;
        const clickTime = clickRatio * originalDuration;

        const tenPercentDuration = originalDuration * 0.10;
        let newSegmentDuration = Math.min(5, tenPercentDuration);
        newSegmentDuration = Math.max(0.2, newSegmentDuration);

        let newStart = Math.max(0, clickTime - newSegmentDuration / 2);
        let newEnd = Math.min(originalDuration, newStart + newSegmentDuration);

        if (newEnd - newStart < newSegmentDuration - 0.05) {
            if (newStart === 0) {
                newEnd = Math.min(originalDuration, newSegmentDuration);
            } else if (newEnd === originalDuration) {
                newStart = Math.max(0, originalDuration - newSegmentDuration);
            }
        }
        if (newEnd - newStart < 0.1) {
            showToast("구간을 추가하기에 가장자리가 너무 가깝거나 영상이 너무 짧습니다.", "warning");
            return;
        }

        for (const seg of highlightSegments) {
            if (Math.max(newStart, seg.start_time) < Math.min(newEnd, seg.end_time)) {
                showToast("새 구간이 기존 구간과 겹칩니다. 다른 곳을 클릭해주세요.", "warning");
                return;
            }
        }

        const newSegment = {
            start_time: newStart,
            end_time: newEnd,
            score: 0.5
        };

        highlightSegments.push(newSegment);
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        showHighlightBar();
        showToast("새 구간 추가됨. 위치나 길이를 조절하세요.", "info");
    });

    function setupDragAndDrop(block, segRef, segmentIndex) {
        let isDragging = false, startX = 0, initialStart = 0, segmentDuration = 0, containerWidth = 0, ghost = null;

        block.addEventListener('mousedown', (e) => {
            if (!isEditMode || e.target.classList.contains('resize-handle')) return;
            e.preventDefault();

            isDragging = true;
            startX = e.clientX;
            initialStart = segRef.start_time;
            segmentDuration = segRef.end_time - segRef.start_time;
            containerWidth = highlightBarContainer.getBoundingClientRect().width;

            ghost = block.cloneNode(true);
            Object.assign(ghost.style, {
                opacity: '0.6',
                pointerEvents: 'none',
                backgroundColor: 'var(--primary-light)',
                zIndex: '100'
            });
            highlightBarContainer.appendChild(ghost);
            block.style.opacity = '0.3';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            let newProposedStart = initialStart + (dx / containerWidth) * originalDuration;

            newProposedStart = Math.max(0, Math.min(newProposedStart, originalDuration - segmentDuration));

            if (segmentIndex > 0) {
                const prevSegment = highlightSegments[segmentIndex - 1];
                newProposedStart = Math.max(newProposedStart, prevSegment.end_time);
            }
            if (segmentIndex < highlightSegments.length - 1) {
                const nextSegment = highlightSegments[segmentIndex + 1];
                newProposedStart = Math.min(newProposedStart, nextSegment.start_time - segmentDuration);
            }


            const newLeft = (newProposedStart / originalDuration) * 100;
            ghost.style.left = `${newLeft}%`;
            const tooltip = ghost.querySelector('.highlight-tooltip');
            if (tooltip) tooltip.textContent = `${formatTime(newProposedStart)} ~ ${formatTime(newProposedStart + segmentDuration)}`;
        }

        function onMouseUp(e) {
            if (!isDragging) return;
            isDragging = false;

            const finalGhostLeftPercentage = parseFloat(ghost.style.left);
            if (!isNaN(finalGhostLeftPercentage)) {
                let newActualStart = (finalGhostLeftPercentage / 100) * originalDuration;
                const currentDuration = segRef.end_time - segRef.start_time;

                segRef.start_time = newActualStart;
                segRef.end_time = newActualStart + currentDuration;
            }

            block.style.opacity = '';
            if (ghost) ghost.remove();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            highlightSegments.sort((a, b) => a.start_time - b.start_time);
            showHighlightBar();
        }
    }

    customizeBtn.addEventListener("click", enterEditMode);
    cancelEditBtn.addEventListener("click", cancelEditing);
    saveCustomBtn.addEventListener("click", saveChanges);

    setButtonVisibility(false);

    return {
        loadHighlightData,
        showHighlightBar,
        destroy() {
            customizeBtn.removeEventListener("click", enterEditMode);
            saveCustomBtn.removeEventListener("click", saveChanges);
            cancelEditBtn.removeEventListener("click", cancelEditing);

            if (customizeBtn.parentElement) customizeBtn.remove();
            if (saveCustomBtn.parentElement) saveCustomBtn.remove();
            if (cancelEditBtn.parentElement) cancelEditBtn.remove();

            highlightBarContainer.innerHTML = "";
            highlightSegments = [];
            originalDuration = 0;
            isEditMode = false;
            backupSegments = null;
            if (resultCard) resultCard.classList.remove('editing-mode');

            if (highlightBarContainer) {
                highlightBarContainer.style.bottom = "";
                highlightBarContainer.style.opacity = "";
                highlightBarContainer.style.pointerEvents = "";
                highlightBarContainer.style.cursor = "default";
            }
            console.log("Highlight Editor가 제거되었습니다.");
        }
    };
}