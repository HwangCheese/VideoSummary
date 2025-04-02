// public/static/uiUtils.js

export function showToast(message, type = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
  
      const style = document.createElement('style');
      style.textContent = `
        .toast-container {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
        }
        .toast {
          min-width: 250px; margin-bottom: 10px; padding: 12px 15px;
          border-radius: 4px; font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex; justify-content: space-between; align-items: center;
          animation: toast-in 0.5s;
        }
        .toast-success { background-color: #2ecc71; color: white; }
        .toast-error { background-color: #e74c3c; color: white; }
        .toast-info { background-color: #3498db; color: white; }
        .toast-warning { background-color: #f39c12; color: white; }
        @keyframes toast-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `;
      document.head.appendChild(style);
    }
  
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span><button style="background:none;border:none;color:white;">✖</button>`;
    toast.querySelector('button').addEventListener('click', () => toast.remove());
  
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  
  export function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  
  export function formatFileSize(bytes) {
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }
  
  export function resetProgressSteps() {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active', 'completed'));
  }
  
  export function updateProgressStep(currentStep) {
    document.querySelectorAll('.step').forEach((step, i) => {
      const stepNum = i + 1;
      step.classList.toggle('completed', stepNum < currentStep);
      step.classList.toggle('active', stepNum === currentStep);
    });
  }
  
  export function resetUI() {
    document.getElementById("uploadInfo").style.display = "none";
    document.getElementById("progressCard").style.display = "none";
    document.getElementById("resultCard").style.display = "none";
    document.getElementById("fileInput").value = "";
    document.getElementById("progressBarInner").style.width = "0%";
  }
  