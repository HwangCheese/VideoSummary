document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const startBtn = document.getElementById("startBtn");
    const statusDiv = document.getElementById("status");
    const finalVideo = document.getElementById("finalVideo");
    const progressBarContainer = document.getElementById("progressBarContainer");
    const progressBarInner = document.getElementById("progressBarInner");
    const highlightBarContainer = document.getElementById("highlightBarContainer");
    const progressCard = document.getElementById("progressCard");
    const resultCard = document.getElementById("resultCard");
    const uploadInfo = document.getElementById("uploadInfo");
    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const downloadBtn = document.getElementById("downloadBtn");
    const newBtn = document.getElementById("newBtn");
    const progressSteps = document.getElementById("progressSteps");
  
    let uploadedFileName = "";
    progressBarInner.style.width = "0%";
  
    // 파일 드래그 앤 드롭 이벤트
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
  
    // 파일 입력 이벤트 (클릭으로 파일 선택)
    dropZone.addEventListener("click", () => {
      fileInput.click();
    });
  
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    });
  
    // 파일 드랍 처리
    dropZone.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
  
      const dt = e.dataTransfer;
      const files = dt?.files;
  
      if (!files || !files.length) {
        showToast("⚠️ 파일이 감지되지 않았습니다.", "warning");
        return;
      }
  
      handleFile(files[0]);
    });
  
    function handleFile(file) {
      if (!file.name.endsWith(".mp4")) {
        showToast("⚠️ mp4 파일만 업로드 가능합니다.", "warning");
        return;
      }
  
      // 파일 정보 표시
      fileName.textContent = file.name;
      fileSize.textContent = formatFileSize(file.size);
      uploadInfo.style.display = "block";
      
      uploadFile(file);
    }
  
    async function uploadFile(file) {
      statusDiv.textContent = "⏳ 업로드 중...";
      progressBarInner.style.width = "0%";
      startBtn.disabled = true;
  
      const formData = new FormData();
      formData.append("video", file);
  
      try {
        const res = await fetch("/upload", { method: "POST", body: formData });
        const data = await res.json();
  
        if (res.ok) {
          uploadedFileName = data.filename;
          statusDiv.textContent = `✅ 업로드 성공: ${uploadedFileName}`;
          startBtn.disabled = false;
          showToast("업로드가 완료되었습니다!", "success");
        } else {
          statusDiv.textContent = "❌ 업로드 실패";
          showToast("업로드에 실패했습니다. 다시 시도해주세요.", "error");
        }
      } catch (error) {
        console.error(error);
        statusDiv.textContent = "❌ 업로드 중 오류 발생";
        showToast("업로드 중 오류가 발생했습니다.", "error");
      }
    }
  
    // 숏폼 생성 시작
    startBtn.addEventListener("click", async () => {
      if (!uploadedFileName) return;
      
      // UI 초기화
      uploadInfo.style.display = "none";
      progressCard.style.display = "block";
      resultCard.style.display = "none";
      statusDiv.textContent = "🧠 생성 시작 중...";
      progressBarInner.style.width = "0%";
      
      resetProgressSteps();
      updateProgressStep(1); // 첫번째 단계 활성화
  
      try {
        const res = await fetch(`/upload/process?filename=${uploadedFileName}`);
        const data = await res.json();
  
        if (res.ok) {
          progressCard.style.display = "none";
          resultCard.style.display = "block";
          showToast("🎉 숏폼 영상이 성공적으로 생성되었습니다!", "success");
  
          finalVideo.src = `/clips/highlight_${uploadedFileName}?` + Date.now();
          finalVideo.addEventListener("loadedmetadata", showHighlightBar, { once: true });
          
          // 다운로드 버튼 설정
          downloadBtn.addEventListener("click", () => {
            const downloadLink = document.createElement("a");
            downloadLink.href = finalVideo.src;
            downloadLink.download = `highlight_${uploadedFileName}`;
            downloadLink.click();
          });
        } else {
          progressCard.style.display = "none";
          statusDiv.textContent = "❌ 숏폼 생성 실패";
          showToast("숏폼 생성에 실패했습니다. 다시 시도해주세요.", "error");
        }
      } catch (error) {
        console.error(error);
        progressCard.style.display = "none";
        statusDiv.textContent = "❌ 숏폼 생성 중 오류 발생";
        showToast("처리 중 오류가 발생했습니다.", "error");
      }
    });
  
    // 새 영상 만들기 버튼
    newBtn.addEventListener("click", () => {
      resetUI();
    });
  
    // SSE로 진행상황 수신
    const evtSource = new EventSource("/upload/progress-sse");
    evtSource.onmessage = function(e) {
      const progressState = JSON.parse(e.data);
      let percent = progressState.percent;
      
      if (typeof percent !== 'number') {
        percent = 0;
        if (progressState.step === 1) percent = 70;
        else if (progressState.step === 2) percent = 80;
        else if (progressState.step === 3) percent = 100;
        if (progressState.done) percent = 100;
      }
      
      progressBarInner.style.width = percent + "%";
      
      if (progressState.message) {
        statusDiv.textContent = `${percent}% - ${progressState.message}`;
      }
      
      // 단계별 진행 상태 업데이트
      if (progressState.step) {
        updateProgressStep(progressState.step);
      }
      
      if (progressState.done) {
        evtSource.close();
      }
    };
  
    // 하이라이트 바 표시 함수
    async function showHighlightBar() {
      const baseName = uploadedFileName.split('.').slice(0, -1).join('.');
      const jsonName = `highlight_${baseName}.json`;
      try {
        const res = await fetch(`/clips/${jsonName}`);
        const data = await res.json();
        const segments = data.segments || [];
        const originalDuration = data.original_duration || 60;
        
        if (!segments.length || !originalDuration) return;
        
        highlightBarContainer.innerHTML = `
          <div class="time-markers">
            <span class="time-marker" style="left: 0%">${formatTime(0)}</span>
            <span class="time-marker" style="left: 25%">${formatTime(originalDuration * 0.25)}</span>
            <span class="time-marker" style="left: 50%">${formatTime(originalDuration * 0.5)}</span>
            <span class="time-marker" style="left: 75%">${formatTime(originalDuration * 0.75)}</span>
            <span class="time-marker" style="left: 100%">${formatTime(originalDuration)}</span>
          </div>
        `;
        
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
          block.style.backgroundColor = "#f72585";
          block.style.borderRadius = "8px";
          block.style.boxShadow = "0 0 4px rgba(0,0,0,0.3)";
          block.style.zIndex = "2";
          
          const tooltip = document.createElement("div");
          tooltip.textContent = `${formatTime(start)} ~ ${formatTime(end)}`;
          tooltip.style.position = "absolute";
          tooltip.style.bottom = "100%";
          tooltip.style.left = "50%";
          tooltip.style.transform = "translateX(-50%)";
          tooltip.style.backgroundColor = "rgba(0,0,0,0.8)";
          tooltip.style.color = "white";
          tooltip.style.padding = "4px 8px";
          tooltip.style.borderRadius = "6px";
          tooltip.style.fontSize = "0.8rem";
          tooltip.style.whiteSpace = "nowrap";
          tooltip.style.display = "none";
          tooltip.style.zIndex = "10";
          tooltip.style.pointerEvents = "none";
          
          block.appendChild(tooltip);
          block.addEventListener("mouseenter", () => tooltip.style.display = "block");
          block.addEventListener("mouseleave", () => tooltip.style.display = "none");
          
          highlightBarContainer.appendChild(block);
        });
      } catch (error) {
        console.error("하이라이트 정보를 가져오는 중 오류 발생:", error);
      }
    }
  
    // 헬퍼 함수들
    function formatTime(seconds) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function resetUI() {
      uploadInfo.style.display = "none";
      progressCard.style.display = "none";
      resultCard.style.display = "none";
      fileInput.value = "";
      uploadedFileName = "";
      progressBarInner.style.width = "0%";
    }
    
    function resetProgressSteps() {
      const steps = progressSteps.querySelectorAll('.step');
      steps.forEach(step => {
        step.classList.remove('active', 'completed');
      });
    }
    
    function updateProgressStep(currentStep) {
      const steps = progressSteps.querySelectorAll('.step');
      steps.forEach((step, index) => {
        const stepNumber = index + 1;
        if (stepNumber < currentStep) {
          step.classList.add('completed');
          step.classList.remove('active');
        } else if (stepNumber === currentStep) {
          step.classList.add('active');
          step.classList.remove('completed');
        } else {
          step.classList.remove('active', 'completed');
        }
      });
    }
    
    // 토스트 메시지 표시 함수
    function showToast(message, type = 'info') {
      // 이미 존재하는 토스트 컨테이너를 찾거나 새로 생성
      let toastContainer = document.querySelector('.toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
        
        // 스타일 추가
        const style = document.createElement('style');
        style.textContent = `
          .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
          }
          .toast {
            min-width: 250px;
            margin-bottom: 10px;
            padding: 12px 15px;
            border-radius: 4px;
            font-size: 14px;
            animation: toast-in-right 0.5s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .toast-success {
            background-color: #2ecc71;
            color: white;
          }
          .toast-error {
            background-color: #e74c3c;
            color: white;
          }
          .toast-info {
            background-color: #3498db;
            color: white;
          }
          .toast-warning {
            background-color: #f39c12;
            color: white;
          }
          @keyframes toast-in-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `;
        document.head.appendChild(style);
      }
      
      // 토스트 메시지 생성
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <span>${message}</span>
        <button style="background:transparent; border:none; color:white; cursor:pointer; padding:0; margin-left:10px;">✖</button>
      `;
      
      // 닫기 버튼 기능
      const closeBtn = toast.querySelector('button');
      closeBtn.addEventListener('click', () => {
        toast.remove();
      });
      
      // 토스트 추가 및 자동 제거
      toastContainer.appendChild(toast);
      
      // 3초 후 자동 제거
      setTimeout(() => {
        toast.remove();
      }, 3000);
    }
  });