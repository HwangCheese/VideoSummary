// public/static/highlightEditor.js
import { showToast, formatTime } from "./uiUtils.js";

/**
 * 숏폼 편집기(Highlight Editor) 초기화
 * @param {HTMLElement} highlightBarContainer - 숏폼 타임라인 컨테이너
 * @param {HTMLVideoElement} finalVideo - 최종(숏폼) 영상 DOM
 * @param {string} uploadedFileName - 업로드된 비디오 파일명
 * @param {HTMLElement} resultCard - 결과 섹션 카드 요소 (레이아웃 변경용)
 */
export function initHighlightEditor(highlightBarContainer, finalVideo, uploadedFileName, resultCard) { // resultCard 추가
    let highlightSegments = [];
    let originalDuration = 0;
    let isEditMode = false;
    let backupSegments = null;

    // resultCard 유효성 검사 (추가)
    if (!resultCard) {
        console.error("Highlight Editor 초기화 실패: resultCard 요소가 필요합니다.");
        return null; // 초기화 실패
    }

    // ------------------------------
    // UI 요소 준비 (변경 없음)
    // ------------------------------
    const customizeBtn = document.createElement("button");
    customizeBtn.id = "customizeBtn";
    customizeBtn.className = "secondary-btn";
    customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';

    const saveCustomBtn = document.createElement("button");
    saveCustomBtn.id = "saveCustomBtn";
    saveCustomBtn.className = "primary-btn";
    saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
    saveCustomBtn.style.display = "none";

    const buttonGroup = document.querySelector("#resultCard .button-group"); // 좀 더 명확한 선택자
    if (buttonGroup) {
        buttonGroup.insertBefore(saveCustomBtn, buttonGroup.firstChild); // 저장 버튼 먼저 추가
        buttonGroup.insertBefore(customizeBtn, saveCustomBtn); // 편집 버튼 다음에 추가
    } else {
        console.error("버튼 그룹(.button-group)을 찾을 수 없습니다.");
    }


    // ------------------------------
    // 내부 함수들
    // ------------------------------

    // showHighlightBar, loadHighlightData 함수는 변경 없음
    async function showHighlightBar() { /* ... 이전 코드와 동일 ... */
        // 먼저 기존 내용을 청소
        highlightBarContainer.innerHTML = "";

        // 타임 마커 추가
        const timeMarkers = document.createElement("div");
        timeMarkers.className = "time-markers";
        const ratioArray = [0, 0.25, 0.5, 0.75, 1];
        if (originalDuration > 0) { // duration이 0 이상일 때만 마커 생성
            timeMarkers.innerHTML = ratioArray
                .map(r =>
                    `<span class="time-marker" style="left: ${r * 100}%">
               ${formatTime(originalDuration * r)}
             </span>`
                )
                .join("");
        }
        highlightBarContainer.appendChild(timeMarkers);

        // 숏폼 구간 Block들
        highlightSegments.forEach((seg, index) => {
            if (originalDuration <= 0) return; // duration이 0 이하면 블록 생성 방지

            const start = seg.start_time;
            const end = seg.end_time;
            const width = ((end - start) / originalDuration) * 100;
            const left = (start / originalDuration) * 100;

            // width나 left가 유효하지 않은 경우 방지
            if (isNaN(width) || isNaN(left) || width < 0 || left < 0) {
                console.warn("잘못된 세그먼트 데이터:", seg);
                return;
            }

            const block = document.createElement("div");
            block.className = "highlight-segment";
            block.dataset.segmentId = index;
            Object.assign(block.style, {
                position: "absolute",
                left: `${left}%`,
                width: `${Math.max(0, width)}%`, // 너비가 음수가 되지 않도록
                height: "100%",
                backgroundColor: "var(--accent-color)", // CSS 변수 사용
                borderRadius: "6px", // 약간 줄임
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                zIndex: "2",
                cursor: isEditMode ? "grab" : "pointer", // 편집 모드일 때 커서 변경
                opacity: isEditMode ? "0.9" : "1.0", // 편집 모드일 때 약간 투명하게
                transition: "opacity 0.2s ease, background-color 0.2s ease", // 부드러운 효과
            });


            // Tooltip (수정 없음)
            const tooltip = document.createElement("div");
            tooltip.className = "highlight-tooltip";
            tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
            Object.assign(tooltip.style, {
                position: "absolute",
                bottom: "calc(100% + 5px)", // 살짝 간격 띄움
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(0,0,0,0.8)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                display: "none", // 기본 숨김
                pointerEvents: "none",
                zIndex: "10",
                opacity: "0", // 기본 투명
                transition: "opacity 0.2s ease, bottom 0.2s ease" // 부드러운 등장
            });
            block.appendChild(tooltip);

            block.addEventListener("mouseenter", () => {
                tooltip.style.display = "block";
                setTimeout(() => { // 약간의 딜레이 후 보이도록
                    tooltip.style.opacity = "1";
                    tooltip.style.bottom = "calc(100% + 8px)"; // 살짝 위로 이동
                }, 10);
            });
            block.addEventListener("mouseleave", () => {
                tooltip.style.opacity = "0";
                tooltip.style.bottom = "calc(100% + 5px)";
                setTimeout(() => { // 트랜지션 후 숨김
                    if (tooltip.style.opacity === "0") tooltip.style.display = "none";
                }, 200);
            });


            if (isEditMode) {
                block.style.cursor = "grab"; // 편집 모드일 때 드래그 가능 표시
                block.title = "클릭하여 삭제, 드래그하여 이동, 핸들로 크기 조절";

                // Resize Handles 추가 (편집 모드일 때만)
                const leftHandle = document.createElement("div");
                leftHandle.className = "resize-handle left";
                const rightHandle = document.createElement("div");
                rightHandle.className = "resize-handle right";
                block.appendChild(leftHandle);
                block.appendChild(rightHandle);
                setupResizeHandle(leftHandle, seg, true);
                setupResizeHandle(rightHandle, seg, false);

                // 클릭 시 삭제 로직
                block.addEventListener("click", (e) => {
                    e.stopPropagation(); // 핸들 클릭 이벤트와 구분
                    // 클릭 시 삭제 확인 (선택 사항)
                    if (confirm("이 구간을 삭제하시겠습니까?")) {
                        const segId = parseInt(block.dataset.segmentId, 10);
                        highlightSegments.splice(segId, 1);
                        showHighlightBar(); // 바 다시 그리기
                    }
                });

                // 드래그하여 이동 로직 추가
                setupDragAndDrop(block, seg);

            } else {
                block.style.cursor = "pointer"; // 일반 모드
                block.title = `${formatTime(start)} ~ ${formatTime(end)}`;
            }


            highlightBarContainer.appendChild(block);
        });
    }

    function loadHighlightData(segments, duration) {
        highlightSegments = segments.map(s => ({ ...s })); // 원본 불변성 위해 복사
        originalDuration = duration;
        showHighlightBar();
    }

    /**
     * 편집 모드 토글 (수정됨)
     */
    function toggleEditMode() {
        if (!isEditMode) {
            // 편집 모드 진입
            backupSegments = JSON.parse(JSON.stringify(highlightSegments)); // deep copy
            isEditMode = true;
            saveCustomBtn.style.display = "inline-block";
            customizeBtn.innerHTML = '<i class="fas fa-times"></i> 편집 취소';
            resultCard.classList.add('editing-mode'); // <<< 레이아웃 변경 클래스 추가
            showHighlightBar(); // 바 다시 그려서 핸들 등 표시
            highlightBarContainer.style.cursor = "crosshair"; // 새 구간 추가 가능 표시
            showToast("편집 모드 활성화. 구간을 드래그 하세요.", "info");
        } else {
            // 편집 취소
            if (backupSegments) {
                highlightSegments = backupSegments;
                backupSegments = null;
            }
            isEditMode = false;
            saveCustomBtn.style.display = "none";
            customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';
            resultCard.classList.remove('editing-mode'); // <<< 레이아웃 변경 클래스 제거
            showHighlightBar(); // 원래 상태로 리렌더링
            highlightBarContainer.style.cursor = "default"; // 커서 복원
            showToast("편집 모드 비활성화.", "info");
        }
    }

    /**
     * 저장 후 편집 모드 종료 (수정됨)
     */
    function exitEditModeAfterSave() {
        backupSegments = null; // 백업본 필요 없음
        isEditMode = false;
        saveCustomBtn.style.display = "none";
        customizeBtn.innerHTML = '<i class="fas fa-edit"></i> 직접 편집';
        resultCard.classList.remove('editing-mode'); // <<< 레이아웃 변경 클래스 제거
        showHighlightBar(); // 저장된 상태로 리렌더링 (핸들 제거 등)
        highlightBarContainer.style.cursor = "default";
    }

    // setupResizeHandle 함수는 변경 없음
    function setupResizeHandle(handle, seg, isLeft) {
        // 드래그 로직 개선
        handle.addEventListener("mousedown", (e) => {
            if (!isEditMode) return;
            e.stopPropagation(); // 부모 요소(block)의 이벤트 방지
            e.preventDefault(); // 기본 동작 방지

            let isDragging = true; // 여기서 true로 설정
            const startX = e.clientX;
            const containerWidth = highlightBarContainer.getBoundingClientRect().width;
            const initialStart = seg.start_time;
            const initialEnd = seg.end_time;
            const minDuration = 0.5; // 최소 구간 길이 (초)

            // 임시 표시용 요소 (선택 사항)
            const ghostElement = handle.closest('.highlight-segment').cloneNode(true);
            ghostElement.style.opacity = '0.5';
            ghostElement.style.pointerEvents = 'none';
            ghostElement.style.backgroundColor = 'var(--primary-color)'; // 색상 변경으로 구분
            ghostElement.style.height = '100%';
            highlightBarContainer.appendChild(ghostElement);

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

                // 실시간 업데이트 (ghost 요소 사용)
                const newLeft = (seg.start_time / originalDuration) * 100;
                const newWidth = ((seg.end_time - seg.start_time) / originalDuration) * 100;
                ghostElement.style.left = `${newLeft}%`;
                ghostElement.style.width = `${newWidth}%`;
                // 툴팁도 업데이트
                const tooltip = ghostElement.querySelector('.highlight-tooltip');
                if (tooltip) {
                    tooltip.textContent = `${formatTime(seg.start_time)} ~ ${formatTime(seg.end_time)}`;
                }
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);

                // ghost 요소 제거
                if (ghostElement.parentNode) {
                    ghostElement.parentNode.removeChild(ghostElement);
                }

                // 최종 바 업데이트
                showHighlightBar();
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    // saveChanges 함수는 변경 없음
    async function saveChanges() {
        const updatedSegments = highlightSegments;

        // 구간들이 겹치거나 순서가 맞지 않으면 정렬 및 병합 (선택적 고급 기능)
        // updatedSegments = mergeOverlappingSegments(updatedSegments);

        if (updatedSegments.length === 0) {
            showToast("적어도 하나 이상의 구간이 필요합니다.", "warning");
            return;
        }

        // 총 길이를 계산하여 너무 길거나 짧으면 경고 (선택 사항)
        const totalDuration = updatedSegments.reduce((sum, seg) => sum + (seg.end_time - seg.start_time), 0);
        console.log("총 숏폼 길이:", totalDuration.toFixed(1) + "초");


        try {
            // 로딩 상태 표시 (선택 사항)
            saveCustomBtn.disabled = true;
            saveCustomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

            const res = await fetch(`/upload/update-highlights`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: uploadedFileName,
                    segments: updatedSegments
                })
            });

            saveCustomBtn.disabled = false; // 버튼 활성화

            if (res.ok) {
                const result = await res.json(); // 서버 응답 처리
                showToast("숏폼 변경사항이 저장되었습니다!", "success");
                exitEditModeAfterSave(); // 저장 성공 후 편집 모드 종료
                // 새 비디오 URL로 업데이트 (캐시 방지)
                finalVideo.src = `/clips/highlight_${uploadedFileName}?t=` + Date.now();
                finalVideo.load(); // 비디오 다시 로드

                // 서버에서 받은 데이터로 다시 로드 (선택적이지만 데이터 동기화에 좋음)
                // if (result.segments && result.original_duration) {
                //     loadHighlightData(result.segments, result.original_duration);
                // }

            } else {
                const errorData = await res.json().catch(() => ({ message: "알 수 없는 오류" }));
                showToast(`변경사항 저장 실패: ${errorData.message || res.statusText}`, "error");
                saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장'; // 버튼 텍스트 복원
            }
        } catch (err) {
            console.error("숏폼 저장 오류:", err);
            showToast(`네트워크 오류 또는 처리 중 문제 발생: ${err.message}`, "error");
            saveCustomBtn.disabled = false;
            saveCustomBtn.innerHTML = '<i class="fas fa-save"></i> 변경사항 저장';
        }
    }

    /**
    * highlightBarContainer 클릭 시, 새 구간 추가 (편집 모드에서)
    */
    highlightBarContainer.addEventListener("click", (e) => {
        if (!isEditMode || originalDuration <= 0) return;
        // 이벤트 타겟이 highlightBarContainer 자체인지 확인 (자식 요소 클릭 무시)
        if (e.target !== highlightBarContainer) return;

        const containerRect = highlightBarContainer.getBoundingClientRect();
        const clickPosition = (e.clientX - containerRect.left) / containerRect.width;
        const clickTime = clickPosition * originalDuration;
        const defaultDuration = 5.0; // 기본 구간 길이 (초)

        // 새 구간 생성 (시간 경계 처리)
        const newSegment = {
            start_time: Math.max(0, clickTime - defaultDuration / 2),
            end_time: Math.min(originalDuration, clickTime + defaultDuration / 2),
            score: 0.5 // 기본 점수 (서버 로직에 따라 불필요할 수 있음)
        };

        // 새 구간이 너무 짧으면 생성하지 않음 (선택 사항)
        if (newSegment.end_time - newSegment.start_time < 0.5) {
            showToast("너무 짧은 구간은 추가할 수 없습니다.", "warning");
            return;
        }

        highlightSegments.push(newSegment);

        // 시간 순서대로 정렬 (선택 사항)
        highlightSegments.sort((a, b) => a.start_time - b.start_time);

        showHighlightBar(); // 바 다시 그리기
        showToast("새 구간 추가됨. 위치나 길이를 조절하세요.", "info");
    });

    // 드래그 앤 드롭 로직 추가
    function setupDragAndDrop(block, seg) {
        let isDragging = false;
        let startX = 0;
        let initialStart = 0;
        let segmentDuration = 0;
        let containerWidth = 0;
        let ghostElement = null;

        block.addEventListener('mousedown', (e) => {
            // 핸들 클릭 시에는 드래그 시작 안 함
            if (e.target.classList.contains('resize-handle')) return;
            if (!isEditMode) return;

            e.preventDefault(); // 텍스트 선택 등 방지

            isDragging = true;
            startX = e.clientX;
            initialStart = seg.start_time;
            segmentDuration = seg.end_time - seg.start_time;
            containerWidth = highlightBarContainer.getBoundingClientRect().width;
            block.style.cursor = 'grabbing'; // 드래그 중 커서 변경
            block.style.zIndex = '3'; // 드래그 중인 요소를 위로

            // Ghost 요소 생성
            ghostElement = block.cloneNode(true);
            ghostElement.style.opacity = '0.6';
            ghostElement.style.pointerEvents = 'none';
            ghostElement.style.cursor = 'grabbing';
            ghostElement.style.backgroundColor = 'var(--primary-light)'; // 색상 변경
            highlightBarContainer.appendChild(ghostElement);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dt = (dx / containerWidth) * originalDuration;
            let newStart = initialStart + dt;

            // 경계 제한
            newStart = Math.max(0, Math.min(newStart, originalDuration - segmentDuration));

            // 실시간 업데이트 (Ghost 사용)
            const newLeft = (newStart / originalDuration) * 100;
            ghostElement.style.left = `${newLeft}%`;

            // 툴팁 업데이트
            const newEnd = newStart + segmentDuration;
            const tooltip = ghostElement.querySelector('.highlight-tooltip');
            if (tooltip) {
                tooltip.textContent = `${formatTime(newStart)} ~ ${formatTime(newEnd)}`;
            }
        }

        function onMouseUp(e) {
            if (!isDragging) return;
            isDragging = false;

            // Ghost 요소에서 최종 위치 계산
            const finalLeftPercent = parseFloat(ghostElement.style.left);
            const finalStart = (finalLeftPercent / 100) * originalDuration;

            // 원래 세그먼트 데이터 업데이트
            seg.start_time = Math.max(0, finalStart); // 최종 경계 확인
            seg.end_time = Math.min(originalDuration, seg.start_time + segmentDuration);
            seg.start_time = seg.end_time - segmentDuration; // 끝 시간 기준으로 시작 시간 재조정

            block.style.cursor = 'grab'; // 커서 복원
            block.style.zIndex = '2'; // z-index 복원

            // Ghost 요소 제거
            if (ghostElement && ghostElement.parentNode) {
                ghostElement.parentNode.removeChild(ghostElement);
            }

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 시간순 정렬 및 전체 바 다시 그리기
            highlightSegments.sort((a, b) => a.start_time - b.start_time);
            showHighlightBar();
        }
    }

    // ------------------------------
    // 버튼 이벤트 연결 (변경 없음)
    // ------------------------------
    customizeBtn.addEventListener("click", toggleEditMode);
    saveCustomBtn.addEventListener("click", saveChanges);

    // ------------------------------
    // 모듈에서 제공할 API (destroy 함수 수정)
    // ------------------------------
    return {
        loadHighlightData,
        showHighlightBar,
        // destroy 함수: 생성된 버튼과 이벤트 리스너 정리
        destroy() {
            // 버튼 이벤트 리스너 제거
            customizeBtn.removeEventListener("click", toggleEditMode);
            saveCustomBtn.removeEventListener("click", saveChanges);

            // 버튼 DOM에서 제거
            if (customizeBtn.parentNode) customizeBtn.parentNode.removeChild(customizeBtn);
            if (saveCustomBtn.parentNode) saveCustomBtn.parentNode.removeChild(saveCustomBtn);

            // 하이라이트 바 이벤트 리스너 제거 (만약 추가했다면)
            // highlightBarContainer.removeEventListener('click', ...);

            // 하이라이트 타임라인 내용 비우기
            highlightBarContainer.innerHTML = "";

            // 내부 상태 초기화
            highlightSegments = [];
            originalDuration = 0;
            isEditMode = false;
            backupSegments = null;

            // 혹시 편집 모드 상태였다면 클래스 제거
            resultCard.classList.remove('editing-mode');
            highlightBarContainer.style.cursor = "default";

            console.log("Highlight Editor가 제거되었습니다.");
        }
    };
}