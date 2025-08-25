// public/static/scrollHandler.js

// --- 모듈 스코프 변수 ---
let scrollContainer = null; // 모든 섹션을 감싸는 컨테이너
let sections = []; // 스크롤될 각 섹션 요소의 배열
let navDots = []; // 우측의 네비게이션 점 요소의 배열
let currentSectionIndex = 0; // 현재 활성화된 섹션의 인덱스
let isScrolling = false; // 현재 스크롤 애니메이션이 진행 중인지 여부 (중복 이벤트 방지)
let touchStartY = 0; // 터치 시작 지점의 Y 좌표
const scrollDebounceTime = 500; // 스크롤 애니메이션 시간 (ms)

/**
 * 외부에서 특정 섹션으로 스크롤을 트리거하는 함수
 * @param {number} index - 이동할 섹션의 인덱스
 * @param {boolean} [smooth=true] - 부드러운 스크롤 효과를 사용할지 여부
 */
export function scrollToSectionExternally(index, smooth = true) {
  if (!scrollContainer || sections.length === 0) {
    console.warn("[Scroll Denied] Scroll handler not initialized or no sections/container.");
    return;
  }

  if (index < 0 || index >= sections.length) {
    console.warn(`[Scroll Denied] Invalid section index: ${index}. Max index: ${sections.length - 1}`);
    return;
  }

  // 부드러운 스크롤 중이거나, 이미 해당 섹션에 있는 경우 중복 실행 방지
  if (smooth && isScrolling) {
    return;
  }

  // 이전 섹션의 활성 클래스 제거
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

  // scrollContainer의 transform: translateY 값을 변경하여 스크롤 효과 구현
  scrollContainer.style.transition = smooth ? `transform ${scrollDebounceTime / 1000}s ease-in-out` : 'none';
  scrollContainer.style.transform = `translateY(-${currentSectionIndex * vh}px)`;

  // 네비게이션 점 활성 상태 업데이트
  if (navDots.length > 0) {
    navDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentSectionIndex);
    });
  }

  // 현재 섹션에 활성 클래스 추가
  if (targetSection) {
    targetSection.classList.add('active-scroll-section');
  }

  // 애니메이션 시간이 지난 후 isScrolling 플래그를 false로 설정
  if (smooth) {
    setTimeout(() => {
      isScrolling = false;
    }, scrollDebounceTime);
  } else {
    isScrolling = false;
  }
}

/**
 * 스크롤 핸들러를 초기화하고 필요한 이벤트 리스너를 등록
 */
export function initScrollerHandler() {
  // DOM 요소 초기화
  scrollContainer = document.querySelector('.scroll-container');
  sections = Array.from(document.querySelectorAll('.scroll-section'));
  navDots = document.querySelectorAll('.nav-dot');

  currentSectionIndex = 0; // 초기화 시 명시적으로 0으로 설정
  isScrolling = false;
  touchStartY = 0;


  if (!scrollContainer || sections.length === 0) {
    return;
  }

  // 기본 브라우저 스크롤 비활성화
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  /**
   * 각 섹션의 높이를 뷰포트 높이에 맞게 설정
   */
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

  /**
   * 페이지 로드 시 초기 섹션 설정
   */
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
    scrollToSectionExternally(initialIndex, false); // 초기 로드는 부드러운 효과 없이
  }

  // --- 이벤트 핸들러 등록 ---
  // 마우스 휠 이벤트
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
    if (e.deltaY > 0) { targetIndex++; } // 아래로 스크롤
    else if (e.deltaY < 0) { targetIndex--; } // 위로 스크롤
 
    if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentSectionIndex) {
      scrollToSectionExternally(targetIndex, true);
    }
  }, { passive: false }); // preventDefault를 위해 passive: false 설정

  // 터치 이벤트 (모바일)
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
      if (deltaY > 0) { targetIndex++; } // 위로 스와이프
      else { targetIndex--; } // 아래로 스와이프
      if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentSectionIndex) {
        scrollToSectionExternally(targetIndex, true);
      }
    }
  }, { passive: true });

  // 네비게이션 점 클릭 이벤트
  if (navDots.length > 0) {
    navDots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        scrollToSectionExternally(index, true);
      });
    });
  }

  // 키보드 이벤트 (화살표 키, 페이지 업/다운, 스페이스바)
  document.addEventListener('keydown', (e) => {
    // 입력 필드에 포커스된 경우 키보드 스크롤 방지
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

  // 초기화 함수 실행
  setupSections();
  initializeCurrentSection();

  // 창 크기 변경 시 섹션 높이 재설정
  window.addEventListener('resize', () => {
    setupSections();

    // 현재 위치를 유지하도록 transform 값 재계산
    const vh = window.innerHeight;
    if (scrollContainer) {
      scrollContainer.style.transition = 'none';
      scrollContainer.style.transform = `translateY(-${currentSectionIndex * vh}px)`;
    }
  });
}