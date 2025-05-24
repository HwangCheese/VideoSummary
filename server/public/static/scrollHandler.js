// public/static/scrollHandler.js

// --- 모듈 스코프 변수 ---
let scrollContainer = null;
let sections = [];
let navDots = [];
let currentSectionIndex = 0; // 초기값
let isScrolling = false;
let touchStartY = 0;
const scrollDebounceTime = 500;

export function scrollToSectionExternally(index, smooth = true) {
  if (!scrollContainer || sections.length === 0) {
    console.warn("[Scroll Denied] Scroll handler not initialized or no sections/container.");
    return;
  }

  if (index < 0 || index >= sections.length) {
    console.warn(`[Scroll Denied] Invalid section index: ${index}. Max index: ${sections.length - 1}`);
    return;
  }

  if (smooth && isScrolling) {
    return;
  }

  if (smooth && !isScrolling && index === currentSectionIndex) {
    if (navDots.length > 0) {
      navDots.forEach((dot, idx) => dot.classList.toggle('active', idx === index));
    }
    if (sections[index] && !sections[index].classList.contains('active-scroll-section')) {
      sections.forEach((s) => s.classList.remove('active-scroll-section'));
      sections[index].classList.add('active-scroll-section');
    }
    return;
  }

  if (currentSectionIndex >= 0 && currentSectionIndex < sections.length && sections[currentSectionIndex]) {
    sections[currentSectionIndex].classList.remove('active-scroll-section');
  }

  if (smooth) {
    isScrolling = true;
  } else {
    isScrolling = false;
  }

  currentSectionIndex = index;
  const targetSection = sections[index];
  const vh = window.innerHeight;
  scrollContainer.style.transition = smooth ? `transform ${scrollDebounceTime / 1000}s ease-in-out` : 'none';
  scrollContainer.style.transform = `translateY(-${currentSectionIndex * vh}px)`;

  if (navDots.length > 0) {
    navDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentSectionIndex);
    });
  }

  if (targetSection) {
    targetSection.classList.add('active-scroll-section');
  }

  if (smooth) {
    setTimeout(() => {
      isScrolling = false;
    }, scrollDebounceTime);
  } else {
    isScrolling = false;
  }
}

export function initScrollerHandler() {
  scrollContainer = document.querySelector('.scroll-container');
  sections = Array.from(document.querySelectorAll('.scroll-section'));
  navDots = document.querySelectorAll('.nav-dot');

  currentSectionIndex = 0; // 초기화 시 명시적으로 0으로 설정
  isScrolling = false;
  touchStartY = 0;


  if (!scrollContainer || sections.length === 0) {
    return;
  }

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  function setupSections() {
    const vh = window.innerHeight;
    sections.forEach((section, idx) => {
      section.style.height = `${vh}px`;
      section.style.width = '100%';
      section.style.overflow = 'hidden';
    });
    scrollContainer.style.height = `${sections.length * vh}px`;
    scrollContainer.style.width = '100%';
  }

  function initializeCurrentSection() {
    let initialIndex = 0;
    // sections 배열 순서: upload-section (0), progress-section (1), result-section (2)
    if (window.location.hash) {
      const hashId = window.location.hash.substring(1);
      const foundIndex = sections.findIndex(s => s.id === hashId);
      if (foundIndex !== -1) {
        initialIndex = foundIndex;
      }
    }
    scrollToSectionExternally(initialIndex, false);
  }

  // --- 이벤트 핸들러 등록 ---
  document.addEventListener('wheel', function (e) {
    if (isScrolling) {
      e.preventDefault(); return;
    }
    // 특정 요소 내부 스크롤 허용
    if (e.target.closest('.transcript-list, .thumbnail-slider')) {
      return;
    }
    e.preventDefault();

    let targetIndex = currentSectionIndex;
    if (e.deltaY > 0) { targetIndex++; }
    else if (e.deltaY < 0) { targetIndex--; }

    if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentSectionIndex) {
      scrollToSectionExternally(targetIndex, true);
    }
  }, { passive: false });

  document.addEventListener('touchstart', function (e) {
    if (isScrolling) return;
    if (e.target.closest('.transcript-list, .thumbnail-slider')) {
      return;
    }
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (isScrolling) return;
    if (e.target.closest('.transcript-list, .thumbnail-slider')) {
      return;
    }

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY - touchEndY;
    const threshold = 50;

    if (Math.abs(deltaY) > threshold) {
      let targetIndex = currentSectionIndex;
      if (deltaY > 0) { targetIndex++; }
      else { targetIndex--; }
      if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentSectionIndex) {
        scrollToSectionExternally(targetIndex, true);
      }
    }
  }, { passive: true });

  if (navDots.length > 0) {
    navDots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        scrollToSectionExternally(index, true);
      });
    });
  }

  document.addEventListener('keydown', (e) => {
    const activeElement = document.activeElement;
    const isInputElement = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable);
    if (isInputElement && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ')) {
      return;
    }
    if (isScrolling) { e.preventDefault(); return; }

    let targetIndex = currentSectionIndex;
    let shouldPreventDefault = false;

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      targetIndex = currentSectionIndex + 1; shouldPreventDefault = true;
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      targetIndex = currentSectionIndex - 1; shouldPreventDefault = true;
    }

    if (shouldPreventDefault) {
      e.preventDefault();
      if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentSectionIndex) {
        scrollToSectionExternally(targetIndex, true);
      }
    }
  });

  setupSections();
  initializeCurrentSection();

  window.addEventListener('resize', () => {
    setupSections();
    const vh = window.innerHeight;
    if (scrollContainer) {
      scrollContainer.style.transition = 'none';
      scrollContainer.style.transform = `translateY(-${currentSectionIndex * vh}px)`;
    }
  });
}