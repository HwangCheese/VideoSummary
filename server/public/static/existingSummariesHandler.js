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
            overlay.style.display = "none";
        }, 300);
    }
}

export function initExistingSummariesHandler() {
    const toggleBtn = document.getElementById("toggleExistingSummariesBtn");
    const existingSummariesCard = document.getElementById("existingSummariesCard");
    const uploadCard = document.getElementById("uploadCard");
    const listElement = document.getElementById("existingSummariesList");
    const loadingElement = document.getElementById("loadingExistingSummaries");
    const backToUploadBtn = document.getElementById("backToUploadBtn");

    const uploadSection = document.getElementById("upload-section");
    const progressSection = document.getElementById("progress-section");
    const resultSection = document.getElementById("result-section");
    const resultCardFromPipeline = document.getElementById("resultCard");

    if (!toggleBtn || !existingSummariesCard || !uploadCard || !listElement || !loadingElement || !backToUploadBtn || !progressSection) {
        console.warn("필수 UI 요소 중 일부를 찾을 수 없습니다 (ExistingSummariesHandler).");
        return;
    }

    let summariesLoaded = false;

    toggleBtn.addEventListener("click", async () => {
        if (existingSummariesCard.style.display === "none") {
            toggleBtn.disabled = true;
            toggleBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 목록 로딩 중...`;
            uploadCard.classList.add("hidden-anim");

            if (!summariesLoaded) {
                await loadAndDisplayExistingSummaries(listElement, loadingElement);
                summariesLoaded = true;
            }

            setTimeout(() => {
                existingSummariesCard.style.display = "block";
                existingSummariesCard.classList.remove('animate__fadeOutDownSm');
                existingSummariesCard.classList.add('animate__fadeInUpSm');
                toggleBtn.innerHTML = `<i class="fas fa-upload"></i> 새 영상 업로드하기`;
                toggleBtn.disabled = false;
            }, 300);

        } else {
            hideExistingSummariesShowUpload();
        }
    });

    backToUploadBtn.addEventListener("click", () => {
        hideExistingSummariesShowUpload();
    });

    function hideExistingSummariesShowUpload() {
        existingSummariesCard.classList.remove('animate__fadeInUpSm');
        existingSummariesCard.classList.add('animate__fadeOutDownSm');
        setTimeout(() => {
            existingSummariesCard.style.display = "none";
            uploadCard.classList.remove("hidden-anim");
            toggleBtn.innerHTML = `<i class="fas fa-history"></i> 기존 요약 영상 보기`;
        }, 300);
    }

    async function loadAndDisplayExistingSummaries(listEl, loadingEl) {
        loadingEl.style.display = "block";
        listEl.innerHTML = "";

        try {
            const response = await fetch("/results/clips");
            if (!response.ok) throw new Error(`Failed to fetch clips: ${response.statusText}`);
            const data = await response.json();

            if (data.clips && data.clips.length > 0) {
                data.clips.forEach(clipPath => {
                    const parts = clipPath.split('/');
                    if (parts.length < 4) return;
                    const baseName = parts[2];
                    const originalFilename = baseName + ".mp4";

                    const listItem = document.createElement("li");
                    listItem.innerHTML = `<i class="fas fa-film"></i> ${originalFilename}`;
                    listItem.dataset.originalFilename = originalFilename;
                    listItem.dataset.baseName = baseName;
                    listItem.dataset.summaryPath = clipPath;

                    listItem.addEventListener("click", async () => {
                        existingSummariesCard.classList.remove('animate__fadeInUpSm');
                        existingSummariesCard.classList.add('animate__fadeOutDownSm');

                        setTimeout(async () => {
                            existingSummariesCard.style.display = "none";
                            showLoadingOverlay(`'${listItem.dataset.originalFilename}' 요약 결과를 불러옵니다...`);
                            await handleExistingSummaryClick(
                                listItem.dataset.originalFilename,
                                listItem.dataset.baseName,
                                listItem.dataset.summaryPath
                            );
                        }, 400);
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
        if (progressSection) progressSection.style.display = "none";
        const progressCardEl = document.getElementById("progressCard");
        if (progressCardEl) progressCardEl.style.display = "none";

        if (resultCardFromPipeline) resultCardFromPipeline.style.display = "none";
        resetSummaryMetrics();
        if (uploadSection) uploadSection.style.display = "block";
        if (resultSection) resultSection.style.display = "block";


        try {
            // 데이터 로드
            await loadResultDataForExistingSummary(originalFilename, baseName, summaryPath);
            // 데이터 로드 완료 후
            hideLoadingOverlay();
            if (uploadCard && !uploadCard.classList.contains("hidden-anim")) {
                uploadCard.classList.add("hidden-anim");
            }
            if (toggleBtn) {
                toggleBtn.innerHTML = `<i class="fas fa-upload"></i> 새 영상 업로드하기`;
            }

            if (resultCardFromPipeline) {
                resultCardFromPipeline.style.display = "block";
            }

            if (resultSection) {
                setTimeout(() => {
                    resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 100);
            }
            document.querySelectorAll('.page-navigation .nav-dot').forEach(dot => {
                dot.classList.remove('active');
                if (dot.dataset.section === "result-section") dot.classList.add('active');
            });
        } catch (error) {
            console.error("Failed to display existing summary:", error);
            hideLoadingOverlay();
            showToast("기존 요약 영상 표시 중 오류 발생", "error");
            if (resultCardFromPipeline) resultCardFromPipeline.style.display = "none";
        }
    }
}