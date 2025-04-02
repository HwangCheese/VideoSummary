let uploadedFileName = "";
const dropZone = document.getElementById("dropZone");
const startBtn = document.getElementById("startBtn");
const statusDiv = document.getElementById("status");
const finalVideo = document.getElementById("finalVideo");
const progressBarContainer = document.getElementById("progressBarContainer");
const progressBarInner = document.getElementById("progressBarInner");
const highlightBarContainer = document.getElementById("highlightBarContainer");

const finalVideoTitle = document.querySelector("h2:nth-of-type(1)");
const highlightTitle = document.querySelector("h2:nth-of-type(2)");

// 초기 숨김 처리
progressBarContainer.style.display = "none";
finalVideo.style.display = "none";
highlightBarContainer.style.display = "none";
startBtn.style.display = "none";
finalVideoTitle.style.display = "none";
highlightTitle.style.display = "none";
progressBarInner.style.width = "0%";

["dragenter", "dragover"].forEach(eventName => {
  dropZone.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("hover");
  }, false);
});
["dragleave", "drop"].forEach(eventName => {
  dropZone.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("hover");
  }, false);
});

dropZone.addEventListener("drop", async e => {
  e.preventDefault();
  e.stopPropagation();

  const dt = e.dataTransfer;
  const files = dt?.files;

  if (!files || !files.length) {
    alert("⚠️ 파일이 감지되지 않았습니다.");
    return;
  }

  const file = files[0];
  if (!file.name.endsWith(".mp4")) {
    alert("⚠️ mp4 파일만 업로드 가능합니다.");
    return;
  }

  statusDiv.textContent = "⏳ 업로드 중...";
  progressBarInner.style.width = "0%";
  progressBarContainer.style.display = "none";

  const formData = new FormData();
  formData.append("video", file);

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (res.ok) {
      uploadedFileName = data.filename;
      statusDiv.textContent = `✅ 업로드 성공: ${uploadedFileName}`;
      startBtn.disabled = false;
      startBtn.style.display = "inline-block";
    } else {
      statusDiv.textContent = "❌ 업로드 실패";
      progressBarInner.style.width = "0%";
      progressBarContainer.style.display = "none";
    }
  } catch (error) {
    console.error(error);
    statusDiv.textContent = "❌ 업로드 중 오류 발생";
    progressBarInner.style.width = "0%";
    progressBarContainer.style.display = "none";
  }
});

startBtn.addEventListener("click", async () => {
  if (!uploadedFileName) return;

  statusDiv.textContent = "🧠 생성 시작 중...";
  progressBarInner.style.width = "5%";
  startBtn.disabled = true;
  startBtn.style.display = "none";
  progressBarContainer.style.display = "block";
  finalVideo.style.display = "none";
  highlightBarContainer.style.display = "none";
  finalVideoTitle.style.display = "none";
  highlightTitle.style.display = "none";

  try {
    const res = await fetch(`/upload/process?filename=${uploadedFileName}`);
    const data = await res.json();

    if (res.ok) {
      statusDiv.textContent = "🎉 숏폼 영상 생성 완료!";
      progressBarInner.style.width = "100%";
      progressBarContainer.style.display = "none";

      finalVideo.src = `/clips/highlight_${uploadedFileName}?` + Date.now();
      finalVideo.style.display = "block";
      finalVideoTitle.style.display = "block";
      finalVideo.addEventListener("loadedmetadata", showHighlightBar, { once: true });
    } else {
      statusDiv.textContent = "❌ 숏폼 생성 실패";
      progressBarInner.style.width = "0%";
      progressBarContainer.style.display = "none";
      startBtn.disabled = false;
      startBtn.style.display = "inline-block";
    }
  } catch (error) {
    console.error(error);
    statusDiv.textContent = "❌ 숏폼 생성 중 오류 발생";
    progressBarInner.style.width = "0%";
    progressBarContainer.style.display = "none";
    startBtn.disabled = false;
    startBtn.style.display = "inline-block";
  }
});

async function showHighlightBar() {
  const baseName = uploadedFileName.split('.').slice(0, -1).join('.');
  const jsonName = `highlight_${baseName}.json`;
  const res = await fetch(`/clips/${jsonName}`);
  const data = await res.json();
  const segments = data.segments || [];
  const originalDuration = data.original_duration || 60;
  if (!segments.length || !originalDuration) return;

  highlightBarContainer.innerHTML = "";
  highlightBarContainer.style.display = "block";
  highlightTitle.style.display = "block";

  segments.forEach(seg => {
    const start = seg.start_time;
    const end = seg.end_time;
    const segLen = end - start;
    const percentStart = (start / originalDuration) * 100;
    const percentWidth = (segLen / originalDuration) * 100;

    const block = document.createElement("div");
    block.style.position = "absolute";
    block.style.left = `${percentStart}%`;
    block.style.width = `${percentWidth}%`;
    block.style.height = "100%";
    block.style.backgroundColor = "red";
    block.style.borderRadius = "8px";
    block.style.boxShadow = "0 0 4px rgba(0,0,0,0.3)";

    const tooltip = document.createElement("div");
    tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
    tooltip.style.position = "absolute";
    tooltip.style.bottom = "100%";
    tooltip.style.left = "50%";
    tooltip.style.transform = "translateX(-50%)";
    tooltip.style.backgroundColor = "black";
    tooltip.style.color = "white";
    tooltip.style.padding = "4px 8px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.fontSize = "0.8rem";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.display = "none";
    tooltip.style.zIndex = "10";

    block.appendChild(tooltip);
    block.addEventListener("mouseenter", () => tooltip.style.display = "block");
    block.addEventListener("mouseleave", () => tooltip.style.display = "none");

    highlightBarContainer.appendChild(block);
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const evtSource = new EventSource("/upload/progress-sse");
  evtSource.onmessage = function(e) {
    const progressState = JSON.parse(e.data);
    console.log("SSE onmessage:", progressState);

    let percent = 5;
    if (progressState.step === 1) percent = 30;
    else if (progressState.step === 2) percent = 60;
    else if (progressState.step === 3) percent = 90;
    if (progressState.done) percent = 100;

    progressBarInner.style.width = percent + "%";
    if (progressState.message) {
      statusDiv.textContent = `${percent}% - ${progressState.message}`;
    }

    if (progressState.done) {
      evtSource.close();
    }
  };
});
