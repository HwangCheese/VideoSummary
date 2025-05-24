// public/static/scrollHandler.js
export function initScrollerHandler() {
  const scrollContainer = document.querySelector('.scroll-container');
  const sections = Array.from(document.querySelectorAll('.scroll-section'));
  const navDots = document.querySelectorAll('.nav-dot');
  let currentSectionIndex = 0;
  let isScrolling = false;
  let touchStartY = 0;
  const scrollDebounceTime = 500;

  if (!scrollContainer || sections.length === 0) {
    console.warn("Scroll container or sections not found for fullpage scroll.");
    return;
  }

  document.documentElement.style.overflow = 'hidden'; // HTML 태그
  document.body.style.overflow = 'hidden';             // BODY 태그

  // 특정 섹션으로 이동하는 함수
  function scrollToSection(index, smooth = true) {
    if (index < 0 || index >= sections.length || isScrolling) {
      return;
    }

    if (sections[currentSectionIndex]) {
      sections[currentSectionIndex].classList.remove('active-scroll-section');
    }

    isScrolling = true;
    currentSectionIndex = index;
    const targetSection = sections[index];
    const vh = window.innerHeight;
    scrollContainer.style.transition = smooth ? `transform ${scrollDebounceTime / 1000}s ease-in-out` : 'none';
    scrollContainer.style.transform = `translateY(-${index * vh}px)`;

    // 네비게이션 닷 업데이트
    navDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });

    // 새로운 활성 섹션에 클래스 추가
    targetSection.classList.add('active-scroll-section');

    setTimeout(() => {
      isScrolling = false;
    }, scrollDebounceTime);
  }

  // 초기 섹션 설정
  function initializeCurrentSection() {
    let initialIndex = 0;
    if (window.location.hash) {
      const hashId = window.location.hash.substring(1);
      const foundIndex = sections.findIndex(s => s.id === hashId);
      if (foundIndex !== -1) {
        initialIndex = foundIndex;
      }
    }
    const uploadSection = document.getElementById('upload-section');
    const progressSection = document.getElementById('progress-section');
    const resultSection = document.getElementById('result-section');

    if (uploadSection && getComputedStyle(uploadSection).display !== 'none') initialIndex = sections.indexOf(uploadSection);
    else if (progressSection && getComputedStyle(progressSection).display !== 'none') initialIndex = sections.indexOf(progressSection);
    else if (resultSection && getComputedStyle(resultSection).display !== 'none') initialIndex = sections.indexOf(resultSection);

    currentSectionIndex = initialIndex;
    scrollToSection(currentSectionIndex, false); // 부드럽지 않게 즉시 이동
  }


  // --- Wheel 이벤트 핸들러 ---
  document.addEventListener('wheel', function (e) {
    if (isScrolling) {
      e.preventDefault();
      return;
    }
    e.preventDefault();

    if (e.deltaY > 0) {
      scrollToSection(currentSectionIndex + 1);
    } else if (e.deltaY < 0) {
      scrollToSection(currentSectionIndex - 1);
    }
  }, { passive: false });

  document.addEventListener('touchstart', function (e) { // document에 이벤트 리스너 등록
    if (isScrolling) return;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function (e) { // document에 이벤트 리스너 등록
    if (isScrolling) return;

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY - touchEndY;
    const threshold = 50;

    if (Math.abs(deltaY) > threshold) {
      if (deltaY > 0) {
        scrollToSection(currentSectionIndex + 1);
      } else {
        scrollToSection(currentSectionIndex - 1);
      }
    }
  }, { passive: true });

  // --- 네비게이션 닷 클릭 핸들러 ---
  navDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      scrollToSection(index);
    });
  });

  // --- 키보드 이벤트 핸들러 ---
  document.addEventListener('keydown', (e) => {
    if (isScrolling) {
      e.preventDefault();
      return;
    }
    let targetIndex = currentSectionIndex;
    let shouldPreventDefault = false;

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      targetIndex = currentSectionIndex + 1;
      shouldPreventDefault = true;
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      targetIndex = currentSectionIndex - 1;
      shouldPreventDefault = true;
    }

    if (shouldPreventDefault) {
      e.preventDefault();
      scrollToSection(targetIndex);
    }
  });

  function setupSections() {
    const vh = window.innerHeight;
    sections.forEach(section => {
      section.style.height = `${vh}px`;
      section.style.width = '100%';
      section.style.overflow = 'hidden';
    });
    scrollContainer.style.height = `${sections.length * vh}px`;
    scrollContainer.style.width = '100%';
  }

  // --- 초기화 ---
  function init() {
    setupSections();
    initializeCurrentSection();

    window.addEventListener('resize', () => {
      setupSections();
      const vh = window.innerHeight;
      scrollContainer.style.transition = 'none'; // 애니메이션 없이 즉시 위치 조정
      scrollContainer.style.transform = `translateY(-${currentSectionIndex * vh}px)`;
    });
  }

  init();
}