// public/static/uiUtils.js

export function showToast(message, type = "info") {
  let toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);

    const style = document.createElement("style");
    style.textContent = `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .toast {
        display: flex;
        justify-content: space-between;
        align-items: center;
        min-width: 250px;
        max-width: 320px;
        padding: 14px 18px;
        border-radius: 12px;
        font-size: 14px;
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: toast-in 0.4s ease;
        word-break: break-word;
        position: relative;
      }

      .toast-success { background-color: #2ecc71; }
      .toast-error   { background-color: #e74c3c; }
      .toast-info    { background-color: #3498db; }
      .toast-warning { background-color: #f39c12; }

      .toast .close-btn {
        margin-left: 12px;
        cursor: pointer;
        font-weight: bold;
        font-size: 16px;
      }

      @keyframes toast-in {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <span class="close-btn">&times;</span>
  `;

  toast.querySelector(".close-btn").addEventListener("click", () => {
    toast.remove();
  });

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000); // 자동으로 4초 뒤 사라짐
}


export function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min.toString().padStart(2, "0")}:${sec
    .toString()
    .padStart(2, "0")}`;
}

export function formatTimeHMS(seconds) {
  // 0이나 유효하지 않은 값 처리
  if (!seconds || seconds <= 0 || isNaN(seconds)) {
    return "00분 00초";
  }

  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}시간${min.toString().padStart(2, "0")}분${sec.toString().padStart(2, "0")}초`;
  } else {
    return `${min.toString().padStart(2, "0")}분 ${sec.toString().padStart(2, "0")}초`;
  }
}

export function formatFileSize(bytes) {
  const units = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + units[i];
}

export function resetProgressSteps() {
  document
    .querySelectorAll(".step")
    .forEach((s) => s.classList.remove("active", "completed"));
}

export function updateProgressStep(currentStepNumber) {
  const steps = document.querySelectorAll("#progressSteps .step");
  steps.forEach(step => {
    const stepNumberAttribute = step.dataset.step;
    if (!stepNumberAttribute) return; // data-step이 없는 요소는 무시

    const stepNum = parseInt(stepNumberAttribute, 10);

    // 현재 지정된 단계(currentStepNumber)보다 작은 단계는 'completed'
    if (stepNum < currentStepNumber) {
      step.classList.add("completed");
      step.classList.remove("active");
    }
    // 현재 지정된 단계와 같은 단계는 'active'
    else if (stepNum === currentStepNumber) {
      step.classList.remove("completed"); // 혹시 completed가 있었다면 제거
      step.classList.add("active");
    }
    // 현재 지정된 단계보다 큰 단계는 모두 비활성화
    else {
      step.classList.remove("completed");
      step.classList.remove("active");
    }
  });
}

export function resetUI() {
  document.getElementById("uploadInfo").style.display = "none";
  document.getElementById("progressCard").style.display = "none";
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("fileInput").value = "";
  document.getElementById("progressBarInner").style.width = "0%";
}