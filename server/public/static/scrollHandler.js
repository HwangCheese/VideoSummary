// public/static/scrollHandler.js
export function initScrollerHandler() {
  const scrollContainer = document.querySelector('.scroll-container');
  const sections = document.querySelectorAll('.scroll-section');
  const navDots = document.querySelectorAll('.nav-dot'); // 네비게이션 점은 여전히 섹션 표시/이동에 사용될 수 있음
  let currentSectionIndex = 0;
  // isScrolling 플래그는 이제 섹션 이동 로직이 없으므로 덜 중요해짐
  // let isScrolling = false;
  let touchStartY = 0;

  if (!scrollContainer || sections.length === 0) return;

  // 휠 이벤트: 기본 동작만 막고, 섹션 이동 로직은 주석 처리 또는 제거
  scrollContainer.addEventListener('wheel', function (e) {
    e.preventDefault(); // 브라우저 기본 휠 스크롤 방지
    // if (isScrolling) return; // 더 이상 필요 없을 수 있음
    // const delta = e.deltaY;
    // if (delta > 0 && currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
    // else if (delta < 0 && currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
  }, { passive: false });

  // 터치 시작 이벤트는 Y 좌표 기록을 위해 유지 가능 (만약 다른 로직에서 사용한다면)
  scrollContainer.addEventListener('touchstart', function (e) {
    // e.preventDefault(); // 터치 시작에서 preventDefault는 터치 인터랙션(예: 클릭)을 막을 수 있으므로 주의
    touchStartY = e.touches[0].clientY;
  }, { passive: false }); // passive:false는 preventDefault 사용 시에만 의미가 있음

  // 터치 이동 이벤트: 기본 동작만 막고, 섹션 이동 로직은 주석 처리 또는 제거
  scrollContainer.addEventListener('touchmove', function (e) {
    e.preventDefault(); // 터치 스크롤(화면 이동) 방지
    // if (isScrolling) return;
    // const diff = touchStartY - e.touches[0].clientY;
    // if (Math.abs(diff) > 50) {
    //   if (diff > 0 && currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
    //   else if (diff < 0 && currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
    // }
  }, { passive: false });

  // 네비게이션 점 클릭을 통한 섹션 이동은 유지할지 결정
  // 만약 이것도 막고 싶다면 이 부분도 주석 처리 또는 제거
  navDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      // scrollToSection(index); // 네비게이션 점을 통한 스크롤도 막으려면 주석 처리
      console.log(`Nav dot ${index} clicked, but scrolling is disabled.`);
    });
  });

  // scrollToSection 함수는 이제 직접 호출되지 않거나, 네비게이션 점에 의해서만 제한적으로 호출될 수 있음
  // 또는 완전히 제거해도 됨 (만약 네비게이션 점 이동도 막는다면)
  function scrollToSection(index) {
    // if (isScrolling) return;
    // isScrolling = true;
    currentSectionIndex = index;
    navDots.forEach(dot => dot.classList.remove('active'));
    if (navDots[index]) navDots[index].classList.add('active');

    // sections[index].scrollIntoView({ behavior: 'smooth' }); // 실제 스크롤 이동 부분 주석 처리
    console.log(`Attempted to scroll to section ${index}, but scrolling is disabled.`);

    // setTimeout(() => { isScrolling = false; }, 1000); // 더 이상 필요 없을 수 있음
  }

  // 키보드 이벤트: 기본 동작만 막고, 섹션 이동 로직은 주석 처리 또는 제거
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); // 키보드를 통한 페이지 스크롤 방지
      // if (isScrolling) return;
      // if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      //   if (currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
      // } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      //   if (currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
      // }
      console.log(`Key ${e.key} pressed, but scrolling is disabled.`);
    }
  });

  // 섹션 높이 조정 및 초기화 로직은 그대로 유지 (레이아웃에는 영향을 줄 수 있음)
  function adjustSectionHeight() {
    const vh = window.innerHeight;
    sections.forEach(section => {
      section.style.minHeight = `${vh}px`;
    });
  }

  function init() {
    // 해시를 통한 초기 섹션 로드는 스크롤을 유발하므로, 이 부분도 비활성화 고려
    // const hash = window.location.hash.substring(1);
    // if (hash) {
    //   const target = document.getElementById(hash);
    //   const index = Array.from(sections).indexOf(target);
    //   if (index !== -1) {
    //     currentSectionIndex = index;
    //     // scrollToSection(index); // 초기 스크롤도 막음
    //     // 만약 초기 위치 설정만 하고 싶다면, currentSectionIndex와 navDot 활성화만 처리
    //     navDots.forEach(dot => dot.classList.remove('active'));
    //     if (navDots[index]) navDots[index].classList.add('active');
    //     sections[index].scrollIntoView({ behavior: 'auto' }); // 애니메이션 없이 바로 이동 (이것도 스크롤임)
    //     // 또는, CSS로 첫 번째 섹션만 보이도록 처리하고 JS에서는 상태만 관리
    //   }
    // }
    adjustSectionHeight(); // 섹션 높이는 계속 조정
    window.addEventListener('resize', adjustSectionHeight); // 리사이즈 시 높이 조정도 유지
  }

  init();
}