// public/static/existingSummariesHandler.js
import { setUploadedFileName } from './uploadHandler.js';
import { showToast } from './uiUtils.js';
import { loadResultDataForExistingSummary, resetSummaryMetrics } from './pipelineRunner.js';

// 화면 전체에 로딩 오버레이를 표시한다.
function showLoadingOverlay(message = "데이터를 불러오는 중...") {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
        // 오버레이 요소가 없으면 동적으로 생성하여 body에 추가한다.
        overlay = document.createElement("div");
        overlay.id = "loadingOverlay";
        // 스타일 설정
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "9999";
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity 0.3s ease-in-out";
        document.body.appendChild(overlay);
    }
    // 로딩 아이콘과 메시지를 포함한 내부 HTML을 설정한다.
    overlay.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-spinner fa-spin fa-3x" style="color: #007bff; margin-bottom: 20px;"></i>
            <p style="font-size: 1.2rem; color: #333;">${message}</p>
        </div>
    `;
    void overlay.offsetWidth; // 브라우저 리플로우를 강제하여 transition 애니메이션 활성화
    overlay.style.opacity = "1";
    overlay.style.display = "flex";
}

// 화면에 표시된 로딩 오버레이를 부드럽게 숨긴다.
function hideLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.opacity = "0";
        // transition 효과가 끝난 후 display 속성을 변경하여 렌더링에서 제외
        setTimeout(() => {
            if (overlay.style.opacity === "0") {
                overlay.style.display = "none";
            }
        }, 100);
    }
}

// 기존에 생성된 요약 영상 목록을 관리하는 사이드바의 모든 기능을 초기화한다.
export function initExistingSummariesHandler() {
    // UI 상호작용에 필요한 모든 DOM 요소를 가져옴
    const toggleBtn = document.getElementById("toggleExistingSummariesBtn");
    const sidebarEl = document.getElementById("existingSummariesCard");
    const listElement = document.getElementById("existingSummariesList");
    const loadingElement = document.getElementById("loadingExistingSummaries");
    const scrollContainer = document.querySelector(".scroll-container");
    const uploadSection = document.getElementById("upload-section");
    const progressSection = document.getElementById("progress-section");
    const resultSection = document.getElementById("result-section");
    const uploadCard = document.getElementById("uploadCard");
    const resultCard = document.getElementById("resultCard");
    const siteHeader = document.querySelector(".site-header");

    // 필수 요소가 하나라도 없으면 초기화를 중단하고 경고를 출력
    if (!toggleBtn || !sidebarEl || !listElement || !loadingElement ||
        !scrollContainer || !uploadSection || !progressSection || !resultSection || !uploadCard || !resultCard) {
        console.warn("ExistingSummariesHandler: 필수 UI 요소 중 일부를 찾을 수 없습니다.");
        return;
    }

    let summariesLoaded = false; // API 호출을 한 번만 하도록 제어하는 플래그

    // 사이드바를 열고, 필요한 경우 서버에서 요약 목록을 가져온다.
    async function openSidebar() {
        sidebarEl.classList.add("visible");
        scrollContainer.classList.add("sidebar-open");
        toggleBtn.setAttribute("aria-expanded", "true");
        if (siteHeader) siteHeader.classList.add("no-shadow");
        
        // 아직 목록을 로드하지 않았다면 서버에 요청
        if (!summariesLoaded) {
            const currentBtnContent = toggleBtn.innerHTML;
            toggleBtn.disabled = true;
            toggleBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; // 로딩 상태 아이콘으로 변경
            await loadAndDisplayExistingSummaries(listElement, loadingElement);
            summariesLoaded = true;
            toggleBtn.disabled = false;
            toggleBtn.innerHTML = currentBtnContent; // 원래 아이콘으로 복원
        }
    }

    // 사이드바를 닫는다.
    function closeSidebar() {
        sidebarEl.classList.remove("visible");
        scrollContainer.classList.remove("sidebar-open");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    // 토글 버튼 클릭 시 사이드바 열기/닫기 동작을 제어한다.
    toggleBtn.addEventListener("click", () => {
        if (sidebarEl.classList.contains("visible")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    // 사이드바 외부 영역 클릭 시 사이드바를 닫는다.
    document.addEventListener('click', (event) => {
        if (!sidebarEl.contains(event.target) && !toggleBtn.contains(event.target) && sidebarEl.classList.contains('visible')) {
            closeSidebar();
        }
    });

    // 서버에서 기존 요약 클립 목록을 비동기적으로 가져와 화면에 표시한다.
    async function loadAndDisplayExistingSummaries(listEl, loadingEl) {
        loadingEl.style.display = "block";
        listEl.innerHTML = ""; // 기존 목록 초기화

        try {
            const response = await fetch("/results/clips");
            if (!response.ok) throw new Error(`클립 목록 fetch 실패: ${response.statusText}`);
            const data = await response.json();

            if (data.clips && data.clips.length > 0) {
                // 각 클립 경로를 파싱하여 리스트 아이템을 생성한다.
                data.clips.forEach(clipPath => {
                    const parts = clipPath.split('/');
                    if (parts.length < 3) {
                        console.warn("예상치 못한 클립 경로 형식:", clipPath);
                        return;
                    }
                    const baseName = parts[parts.length - 2];
                    const originalFilenameFromServer = baseName + ".mp4";

                    const listItem = document.createElement("li");
                    listItem.innerHTML = `<i class="fas fa-film"></i> ${originalFilenameFromServer}`;
                    // 데이터셋 속성에 필요한 정보를 저장하여 클릭 시 활용
                    listItem.dataset.originalFilename = originalFilenameFromServer;
                    listItem.dataset.baseName = baseName;
                    listItem.dataset.summaryPath = clipPath;

                    // 각 리스트 아이템에 클릭 이벤트 리스너를 추가
                    listItem.addEventListener("click", async () => {
                        closeSidebar();
                        showLoadingOverlay(`'${listItem.dataset.originalFilename}' 요약 결과를 불러옵니다...`);
                        await handleExistingSummaryClick(
                            listItem.dataset.originalFilename,
                            listItem.dataset.baseName,
                            listItem.dataset.summaryPath
                        );
                    });
                    listEl.appendChild(listItem);
                });
            } else {
                listEl.innerHTML = "<li>표시할 기존 요약 영상이 없습니다.</li>";
            }
        } catch (error) {
            console.error("기존 요약 목록 로딩 중 오류:", error);
            listEl.innerHTML = "<li>목록을 불러오는데 실패했습니다.</li>";
            showToast("기존 요약 영상 목록 로딩 실패", "error");
        } finally {
            loadingEl.style.display = "none";
        }
    }

    /*
     * 기존 요약 리스트의 아이템 클릭 시 실행되는 핸들러
     * UI를 결과 섹션으로 전환하고 관련 데이터를 로드한다.
     */
    async function handleExistingSummaryClick(originalFilename, baseName, summaryPath) {
        setUploadedFileName(originalFilename); // 전역 파일 이름 설정
        resetSummaryMetrics();
        // UI를 결과 화면 상태로 즉시 전환
        uploadSection.style.display = "none";
        uploadCard.style.display = "none";
        progressSection.style.display = "none";
        resultSection.style.display = "block";
        resultCard.style.display = "block";

        try {
            // 파이프라인 러너를 통해 비디오, 썸네일, 리포트 등 모든 데이터를 로드
            await loadResultDataForExistingSummary(originalFilename, baseName, summaryPath);
            hideLoadingOverlay();

            // 데이터 로드가 완료되면 결과 섹션으로 부드럽게 스크롤
            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);

            // 페이지 네비게이션 상태 업데이트
            document.querySelectorAll('.page-navigation .nav-dot').forEach(dot => {
                dot.classList.remove('active');
                if (dot.dataset.section === "result-section") dot.classList.add('active');
            });

        } catch (error) {
            console.error("기존 요약 결과 표시 실패:", error);
            hideLoadingOverlay();
            showToast("기존 요약 영상 표시 중 오류 발생", "error");

            // 오류 발생 시 다시 업로드 화면으로 복구
            uploadSection.style.display = "block";
            uploadCard.style.display = "block";

            resultSection.style.display = "none";
            resultCard.style.display = "none";

            document.querySelectorAll('.page-navigation .nav-dot').forEach(dot => {
                dot.classList.remove('active');
                if (dot.dataset.section === "upload-section") dot.classList.add('active');
            });
        }
    }
}