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

    const customizeBtn = document.createElement("button");
    customizeBtn.id = "customizeBtn";
    customizeBtn.className = "secondary-btn";
    customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';

    const saveCustomBtn = document.createElement("button");
    saveCustomBtn.id = "saveCustomBtn";
    saveCustomBtn.className = "primary-btn";
    saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
    saveCustomBtn.style.display = "none";

    const buttonGroup = document.querySelector("#resultCard .button-group");
    if (buttonGroup) {
        buttonGroup.insertBefore(saveCustomBtn, buttonGroup.firstChild);
        buttonGroup.insertBefore(customizeBtn, saveCustomBtn);
    } else {
        console.error("버튼 그룹(.button-group)을 찾을 수 없습니다.");
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
                    e.stopPropagation();
                    if (confirm("이 구간을 삭제하시겠습니까?")) {
                        const segId = parseInt(block.dataset.segmentId, 10);
                        highlightSegments.splice(segId, 1);
                        showHighlightBar();
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

    function toggleEditMode() {
        if (!isEditMode) {
            backupSegments = JSON.parse(JSON.stringify(highlightSegments));
            isEditMode = true;
            saveCustomBtn.style.display = "inline-block";
            customizeBtn.innerHTML = '<i class="fas fa-times"></i> 편집 취소';
            resultCard.classList.add('editing-mode');
            highlightBarContainer.style.cursor = "crosshair";
            showToast("편집 모드 활성화. 구간을 드래그 하세요.", "info");
        } else {
            if (backupSegments) highlightSegments = backupSegments;
            isEditMode = false;
            saveCustomBtn.style.display = "none";
            customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';
            resultCard.classList.remove('editing-mode');
            highlightBarContainer.style.cursor = "default";
            showToast("편집 모드 비활성화.", "info");
        }
        showHighlightBar();
    }

    function exitEditModeAfterSave() {
        backupSegments = null;
        isEditMode = false;
        saveCustomBtn.style.display = "none";
        customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';
        resultCard.classList.remove('editing-mode');
        highlightBarContainer.style.cursor = "default";
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
            const minDuration = 0.5;

            const ghost = handle.closest('.highlight-segment').cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.pointerEvents = 'none';
            ghost.style.backgroundColor = 'var(--primary-color)';
            highlightBarContainer.appendChild(ghost);

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const dx = moveEvent.clientX - startX;
                const dt = (dx / containerWidth) * originalDuration;
                let newStart = seg.start_time;
                let newEnd = seg.end_time;

                if (isLeft) {
                    newStart = Math.max(0, Math.min(initialStart + dt, initialEnd - minDuration));
                    seg.start_time = newStart;
                } else {
                    newEnd = Math.min(originalDuration, Math.max(initialEnd + dt, initialStart + minDuration));
                    seg.end_time = newEnd;
                }

                const newLeft = (seg.start_time / originalDuration) * 100;
                const newWidth = ((seg.end_time - seg.start_time) / originalDuration) * 100;
                ghost.style.left = `${newLeft}%`;
                ghost.style.width = `${newWidth}%`;
                const tooltip = ghost.querySelector('.highlight-tooltip');
                if (tooltip) tooltip.textContent = `${formatTime(seg.start_time)} ~ ${formatTime(seg.end_time)}`;
            };

            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                ghost.remove();
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

        const totalDuration = highlightSegments.reduce((sum, seg) => sum + (seg.end_time - seg.start_time), 0);
        console.log("총 숏폼 길이:", totalDuration.toFixed(1) + "초");

        try {
            saveCustomBtn.disabled = true;
            saveCustomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: uploadedFileName, segments: highlightSegments })
            });

            saveCustomBtn.disabled = false;

            if (res.ok) {
                showToast("숏폼 변경사항이 저장되었습니다!", "success");
                exitEditModeAfterSave();
                const videoBaseName = uploadedFileName.replace(/\.mp4$/i, "");
                finalVideo.src = `/clips/${videoBaseName}/highlight_${videoBaseName}.mp4?t=${Date.now()}`;
                finalVideo.load();
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
        }
    }

    highlightBarContainer.addEventListener("click", (e) => {
        if (!isEditMode || e.target !== highlightBarContainer || originalDuration <= 0) return;

        const clickRatio = (e.clientX - highlightBarContainer.getBoundingClientRect().left) / highlightBarContainer.offsetWidth;
        const clickTime = clickRatio * originalDuration;
        const newSegment = {
            start_time: Math.max(0, clickTime - 2.5),
            end_time: Math.min(originalDuration, clickTime + 2.5),
            score: 0.5
        };

        if (newSegment.end_time - newSegment.start_time < 0.5) {
            showToast("너무 짧은 구간은 추가할 수 없습니다.", "warning");
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

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;
            seg.start_time = parseFloat(ghost.style.left) / 100 * originalDuration;
            seg.end_time = seg.start_time + segmentDuration;
            ghost.remove();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            highlightSegments.sort((a, b) => a.start_time - b.start_time);
            showHighlightBar();
        }
    }

    customizeBtn.addEventListener("click", toggleEditMode);
    saveCustomBtn.addEventListener("click", saveChanges);

    return {
        loadHighlightData,
        showHighlightBar,
        destroy() {
            customizeBtn.removeEventListener("click", toggleEditMode);
            saveCustomBtn.removeEventListener("click", saveChanges);
            customizeBtn.remove();
            saveCustomBtn.remove();
            highlightBarContainer.innerHTML = "";
            highlightSegments = [];
            originalDuration = 0;
            isEditMode = false;
            backupSegments = null;
            resultCard.classList.remove('editing-mode');
            highlightBarContainer.style.cursor = "default";
            console.log("Highlight Editor가 제거되었습니다.");
        }
    };
}
