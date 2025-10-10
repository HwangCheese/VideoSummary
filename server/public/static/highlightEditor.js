// public/static/highlightEditor.js
import { showToast, formatTime } from "./uiUtils.js";

/**
 * 하이라이트 편집기 인스턴스를 생성하고 초기화합니다.
 * @param {HTMLElement} highlightBarContainer - 하이라이트 바가 렌더링될 컨테이너 요소.
 * @param {HTMLVideoElement} finalVideo - 편집 결과가 반영될 비디오 요소.
 * @param {string} uploadedFileName - 현재 편집 중인 파일의 이름.
 * @param {HTMLElement} resultCard - 결과 카드 요소 (편집 모드 스타일 적용 대상).
 * @returns {object|null} 편집기 인스턴스 (메서드 포함) 또는 초기화 실패 시 null.
 */
export function initHighlightEditor(highlightBarContainer, finalVideo, uploadedFileName, resultCard) {
    // 내부 상태 변수
    let highlightSegments = []; // 하이라이트 구간 데이터 배열
    let originalDuration = 0; // 원본 영상의 전체 길이
    let isEditMode = false; // 현재 편집 모드인지 여부
    let backupSegments = null; // 편집 취소 시 복원을 위한 원본 구간 데이터

     // 필수 요소 확인
    if (!resultCard) {
        console.error("Highlight Editor 초기화 실패: resultCard 요소가 필요합니다.");
        return null;
    }
    if (!highlightBarContainer) {
        console.error("Highlight Editor 초기화 실패: highlightBarContainer 요소가 필요합니다.");
        return null;
    }

    // 동적 버튼 생성
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

    // 생성된 버튼들을 DOM에 삽입
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

    /**
     * 편집 모드 상태에 따라 버튼들의 표시 여부를 설정
     * @param {boolean} isEditingMode - 현재 편집 모드인지 여부
     */
    function setButtonVisibility(isEditingMode) {
        if (downloadBtnEl) downloadBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (newBtnEl) newBtnEl.style.display = isEditingMode ? "none" : "inline-block";
        if (shareBtnEl) shareBtnEl.style.display = isEditingMode ? "none" : "inline-block";

        customizeBtn.style.display = isEditingMode ? "none" : "inline-block";
        saveCustomBtn.style.display = isEditingMode ? "inline-block" : "none";
        cancelEditBtn.style.display = isEditingMode ? "inline-block" : "none";
    }

    /**
     * 편집 모드로 진입
     */
    function enterEditMode() {
        if (isEditMode) return;

        // 현재 구간 데이터를 백업
        backupSegments = JSON.parse(JSON.stringify(highlightSegments));
        isEditMode = true;
        setButtonVisibility(true);
        resultCard.classList.add('editing-mode');

        // 하이라이트 바를 비디오 컨트롤러 아래로 이동시켜 조작이 용이하도록 함
        highlightBarContainer.style.bottom = "-20px";
        highlightBarContainer.style.opacity = "1";
        highlightBarContainer.style.pointerEvents = "auto";
        highlightBarContainer.style.cursor = "crosshair";

        showToast("편집 모드 활성화. 구간을 클릭하여 삭제하거나, 드래그/조절하세요.", "info");
        showHighlightBar(); // 편집 모드 UI로 다시 렌더링
    }

    /**
     * 편집 모드 종료 시 공통으로 수행할 작업을 처리
     */
    function commonExitEditModeActions() {
        isEditMode = false;
        setButtonVisibility(false);
        resultCard.classList.remove('editing-mode');
        // 하이라이트 바 스타일 초기화
        highlightBarContainer.style.bottom = "";
        highlightBarContainer.style.opacity = "";
        highlightBarContainer.style.pointerEvents = "";
        highlightBarContainer.style.cursor = "default";
        showHighlightBar(); // 일반 모드 UI로 다시 렌더링
    }

    /**
     * 편집을 취소하고 이전 상태로 복원
     */
    function cancelEditing() {
        if (!isEditMode) return;
        if (backupSegments) {
            // 백업된 데이터로 복원
            highlightSegments = JSON.parse(JSON.stringify(backupSegments));
            backupSegments = null;
        }
        commonExitEditModeActions();
    }

    /**
     * 변경사항 저장 후 편집 모드 종료
     */
    function exitEditModeAfterSave() {
        commonExitEditModeActions();
    }

    /**
     * 현재 highlightSegments 데이터를 기반으로 하이라이트 바 UI를 렌더링
     */
    function showHighlightBar() {
        highlightBarContainer.innerHTML = ""; // 컨테이너 초기화

        // 시간 마커 생성
        const timeMarkers = document.createElement("div");
        timeMarkers.className = "time-markers";
        const ratioArray = [0, 0.25, 0.5, 0.75, 1];
        if (originalDuration > 0) {
            timeMarkers.innerHTML = ratioArray
                .map(r => `<span class="time-marker" style="left: ${r * 100}%">${formatTime(originalDuration * r)}</span>`)
                .join("");
        }
        highlightBarContainer.appendChild(timeMarkers);

        // 각 하이라이트 구간을 블록으로 렌더링
        highlightSegments.forEach((seg, index) => {
            if (originalDuration <= 0) return;

            const start = seg.start_time;
            const end = seg.end_time;
            // 시간 값을 퍼센트(%) 위치와 너비로 변환
            let width = ((end - start) / originalDuration) * 100;
            let left = (start / originalDuration) * 100;

            // 값이 0~100 범위를 벗어나지 않도록 보정
            left = Math.max(0, Math.min(left, 100));
            width = Math.max(0, Math.min(width, 100 - left));

            if (isNaN(width) || isNaN(left) || width < 0) {
                console.warn("Skipping segment due to invalid dimensions:", { start, end, width, left, originalDuration });
                return;
            }

            // 구간 블록 요소 생성 및 스타일링
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

            // 툴팁 생성
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


            // 마우스 호버 시 툴팁 표시 이벤트
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

            // 편집 모드일 때만 추가 기능(삭제, 리사이즈, 드래그) 활성화
            if (isEditMode) {
                block.style.cursor = "pointer"
                block.title = "클릭하여 삭제, 드래그하여 이동, 핸들로 크기 조절";
                // 클릭 시 구간 삭제
                block.addEventListener("click", (e) => {
                    if (!isEditMode) return;

                    // 리사이즈 핸들 클릭은 무시
                    if (e.target.classList.contains('resize-handle')) return;

                    e.stopPropagation();

                    if (confirm(`이 구간(${formatTime(seg.start_time)} ~ ${formatTime(seg.end_time)})을 삭제하시겠습니까?`)) {
                        highlightSegments.splice(index, 1);
                        showHighlightBar(); // UI 갱신
                    }
                });

                // 리사이즈 핸들 생성
                const leftHandle = document.createElement("div");
                leftHandle.className = "resize-handle left";
                const rightHandle = document.createElement("div");
                rightHandle.className = "resize-handle right";
                block.appendChild(leftHandle);
                block.appendChild(rightHandle);

                // 각 핸들에 리사이즈 로직 설정
                setupResizeHandle(leftHandle, highlightSegments[index], true, index);
                setupResizeHandle(rightHandle, highlightSegments[index], false, index);
            }
            highlightBarContainer.appendChild(block);
        });
    }

    /**
     * 외부로부터 하이라이트 데이터를 로드하고 UI 갱신
     * @param {Array<object>} segments - 하이라이트 구간 데이터 배열
     * @param {number} duration - 원본 영상의 전체 길이
     */
    function loadHighlightData(segments, duration) {
        highlightSegments = segments.map(s => ({ ...s }));
        originalDuration = duration;
        highlightSegments.sort((a, b) => a.start_time - b.start_time); // 시간순 정렬
        showHighlightBar();
    }

    /**
     * 리사이즈 핸들의 드래그 이벤트 설정
     * @param {HTMLElement} handle - 리사이즈 핸들 요소
     * @param {object} segRef - 참조할 세그먼트 데이터 객체
     * @param {boolean} isLeft - 왼쪽 핸들인지 여부
     * @param {number} segmentIndex - 세그먼트 배열의 인덱스
     */
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
            const minDuration = 0.1; // 최소 구간 길이

            // 드래그 중 시각적 피드백을 위한 '고스트' 요소 생성
            const ghost = handle.closest('.highlight-segment').cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.pointerEvents = 'none';
            ghost.style.backgroundColor = 'var(--primary-color)';
            highlightBarContainer.appendChild(ghost);

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const dx = moveEvent.clientX - startX; // 마우스 이동 거리
                const dt = (dx / containerWidth) * originalDuration; // 시간 변화량

                let newProposedStart = segRef.start_time;
                let newProposedEnd = segRef.end_time;

                // 왼쪽/오른쪽 핸들에 따라 새로운 시작/종료 시간 계산
                if (isLeft) {
                    newProposedStart = Math.max(0, Math.min(initialStart + dt, initialEnd - minDuration));
                    // 이전 구간과 겹치지 않도록 제한
                    if (segmentIndex > 0) {
                        const prevSegment = highlightSegments[segmentIndex - 1];
                        newProposedStart = Math.max(newProposedStart, prevSegment.end_time);
                    }
                } else {
                    newProposedEnd = Math.min(originalDuration, Math.max(initialEnd + dt, initialStart + minDuration));
                    // 다음 구간과 겹치지 않도록 제한
                    if (segmentIndex < highlightSegments.length - 1) {
                        const nextSegment = highlightSegments[segmentIndex + 1];
                        newProposedEnd = Math.min(newProposedEnd, nextSegment.start_time);
                    }
                }

                // 계산된 값으로 실제 데이터 업데이트
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

                // 고스트 요소의 위치와 너비 실시간 업데이트
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
                highlightSegments.sort((a, b) => a.start_time - b.start_time); // 정렬
                showHighlightBar(); // 최종 UI 갱신 
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    /**
     * 편집된 하이라이트 구간 정보를 서버에 저장
     */
    async function saveChanges() {
        // 유효성 검사
        if (highlightSegments.length === 0) {
            showToast("적어도 하나 이상의 구간이 필요합니다.", "warning");
            return;
        }
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        for (let i = 0; i < highlightSegments.length; i++) {
            // 종료 시간이 시작 시간보다 빠르거나 같은 경우
            if (highlightSegments[i].end_time <= highlightSegments[i].start_time) {
                showToast(`잘못된 구간이 있습니다 (종료시간이 시작시간보다 빠르거나 같음): ${formatTime(highlightSegments[i].start_time)}~${formatTime(highlightSegments[i].end_time)}`, "error");
                return;
            }
            // 구간이 겹치는 경우
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

            // 서버에 변경된 구간 데이터 전송
            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: uploadedFileName, segments: highlightSegments })
            });

            // 버튼 상태 복원
            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            saveCustomBtn.disabled = false;
            cancelEditBtn.disabled = false;

            if (res.ok) {
                const data = await res.json();
                // 서버로부터 받은 새 비디오 경로로 플레이어 소스 업데이트
                if (finalVideo && data.video_path) {
                    finalVideo.src = data.video_path;
                    finalVideo.load();
                }
                backupSegments = JSON.parse(JSON.stringify(highlightSegments));
                exitEditModeAfterSave(); // 편집 모드 종료
                showToast("변경사항이 성공적으로 저장되었습니다.", "success");
            } else {
                const errorData = await res.json().catch(() => ({ message: "알 수 없는 오류" }));
                showToast(`변경사항 저장 실패: ${errorData.message || res.statusText}`, "error");
            }
        } catch (err) {
            console.error("숏폼 저장 오류:", err);
            showToast(`네트워크 오류 또는 처리 중 문제 발생: ${err.message}`, "error");

            // 버튼 상태 복원
            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
            saveCustomBtn.disabled = false;
            cancelEditBtn.disabled = false;
        }
    }

    // 하이라이트 바의 빈 공간 클릭 시 새로운 구간 추가
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

        // 새로운 구간의 시작/종료 시간 계산
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

        // 기존 구간과 겹치는지 확인
        for (const seg of highlightSegments) {
            if (Math.max(newStart, seg.start_time) < Math.min(newEnd, seg.end_time)) {
                showToast("새 구간이 기존 구간과 겹칩니다. 다른 곳을 클릭해주세요.", "warning");
                return;
            }
        }

        const newSegment = {
            start_time: newStart,
            end_time: newEnd,
            score: 0.5 // 기본 점수
        };

        highlightSegments.push(newSegment);
        highlightSegments.sort((a, b) => a.start_time - b.start_time);
        showHighlightBar(); // UI 갱신
    });

    // 버튼 이벤트 리스너 연결
    customizeBtn.addEventListener("click", enterEditMode);
    cancelEditBtn.addEventListener("click", cancelEditing);
    saveCustomBtn.addEventListener("click", saveChanges);

    setButtonVisibility(false); // 초기 버튼 상태 설정

    // 외부에서 호출할 수 있는 메서드들을 반환
    return {
        loadHighlightData,
        showHighlightBar,
        /**
         * 편집기 인스턴스를 파괴하고 모든 이벤트 리스너와 DOM 요소를 정리합니다.
         */
        destroy() {
            // 이벤트 리스너 제거
            customizeBtn.removeEventListener("click", enterEditMode);
            saveCustomBtn.removeEventListener("click", saveChanges);
            cancelEditBtn.removeEventListener("click", cancelEditing);

            // 동적으로 추가된 버튼 제거
            if (customizeBtn.parentElement) customizeBtn.remove();
            if (saveCustomBtn.parentElement) saveCustomBtn.remove();
            if (cancelEditBtn.parentElement) cancelEditBtn.remove();

            // 내부 상태 초기화
            highlightBarContainer.innerHTML = "";
            highlightSegments = [];
            originalDuration = 0;
            isEditMode = false;
            backupSegments = null;
            if (resultCard) resultCard.classList.remove('editing-mode');

            // 컨테이너 스타일 초기화
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