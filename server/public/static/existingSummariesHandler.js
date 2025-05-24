// public/static/existingSummariesHandler.js
import { setUploadedFileName } from './uploadHandler.js';
import { showToast } from './uiUtils.js';
import { loadResultDataForExistingSummary, resetSummaryMetrics } from './pipelineRunner.js';

function showLoadingOverlay(message = "데이터를 불러오는 중...") {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loadingOverlay";
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
    overlay.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-spinner fa-spin fa-3x" style="color: #007bff; margin-bottom: 20px;"></i>
            <p style="font-size: 1.2rem; color: #333;">${message}</p>
        </div>
    `;
    void overlay.offsetWidth;
    overlay.style.opacity = "1";
    overlay.style.display = "flex";
}

function hideLoadingOverlay() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.opacity = "0";
        setTimeout(() => {
            if (overlay.style.opacity === "0") {
                overlay.style.display = "none";
            }
        }, 100);
    }
}

export function initExistingSummariesHandler() {
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

    if (!toggleBtn || !sidebarEl || !listElement || !loadingElement ||
        !scrollContainer || !uploadSection || !progressSection || !resultSection || !uploadCard || !resultCard) {
        console.warn("ExistingSummariesHandler: 필수 UI 요소 중 일부를 찾을 수 없습니다.");
        return;
    }

    let summariesLoaded = false;
    const originalToggleBtnHTML = toggleBtn.innerHTML;

    async function openSidebar() {
        sidebarEl.classList.add("visible");
        scrollContainer.classList.add("sidebar-open");
        toggleBtn.setAttribute("aria-expanded", "true");
        if (siteHeader) siteHeader.classList.add("no-shadow");
        if (!summariesLoaded) {
            const currentBtnContent = toggleBtn.innerHTML;
            toggleBtn.disabled = true;
            toggleBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
            await loadAndDisplayExistingSummaries(listElement, loadingElement);
            summariesLoaded = true;
            toggleBtn.disabled = false;
            toggleBtn.innerHTML = currentBtnContent; // Restore icon before spinner
        }
    }

    function closeSidebar() {
        sidebarEl.classList.remove("visible");
        scrollContainer.classList.remove("sidebar-open");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", () => {
        if (sidebarEl.classList.contains("visible")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    document.addEventListener('click', (event) => {
        if (!sidebarEl.contains(event.target) && !toggleBtn.contains(event.target) && sidebarEl.classList.contains('visible')) {
            closeSidebar();
        }
    });

    async function loadAndDisplayExistingSummaries(listEl, loadingEl) {
        loadingEl.style.display = "block";
        listEl.innerHTML = ""; // Clear previous items

        try {
            const response = await fetch("/results/clips");
            if (!response.ok) throw new Error(`Failed to fetch clips: ${response.statusText}`);
            const data = await response.json();

            if (data.clips && data.clips.length > 0) {
                data.clips.forEach(clipPath => {
                    const parts = clipPath.split('/');
                    if (parts.length < 3) {
                        console.warn("Unexpected clip path format:", clipPath);
                        return;
                    }
                    const baseName = parts[parts.length - 2];
                    const originalFilenameFromServer = baseName + ".mp4";

                    const listItem = document.createElement("li");
                    listItem.innerHTML = `<i class="fas fa-film"></i> ${originalFilenameFromServer}`;
                    listItem.dataset.originalFilename = originalFilenameFromServer;
                    listItem.dataset.baseName = baseName;
                    listItem.dataset.summaryPath = clipPath;

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
            console.error("Error loading existing summaries:", error);
            listEl.innerHTML = "<li>목록을 불러오는데 실패했습니다.</li>";
            showToast("기존 요약 영상 목록 로딩 실패", "error");
        } finally {
            loadingEl.style.display = "none";
        }
    }

    async function handleExistingSummaryClick(originalFilename, baseName, summaryPath) {
        setUploadedFileName(originalFilename);
        resetSummaryMetrics();
        uploadSection.style.display = "none";
        uploadCard.style.display = "none";
        progressSection.style.display = "none";
        resultSection.style.display = "block";
        resultCard.style.display = "block";

        try {
            await loadResultDataForExistingSummary(originalFilename, baseName, summaryPath);
            hideLoadingOverlay();

            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);

            document.querySelectorAll('.page-navigation .nav-dot').forEach(dot => {
                dot.classList.remove('active');
                if (dot.dataset.section === "result-section") dot.classList.add('active');
            });

        } catch (error) {
            console.error("Failed to display existing summary:", error);
            hideLoadingOverlay();
            showToast("기존 요약 영상 표시 중 오류 발생", "error");

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