// public/static/scrollHandler.js
export function initScrollerHandler() {
    const scrollContainer = document.querySelector('.scroll-container');
    const sections = document.querySelectorAll('.scroll-section');
    const navDots = document.querySelectorAll('.nav-dot');
    let currentSectionIndex = 0;
    let isScrolling = false;
    let touchStartY = 0;
  
    if (!scrollContainer || sections.length === 0) return;
  
    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
  
    navDots.forEach((dot, index) => {
      dot.addEventListener('click', () => scrollToSection(index));
    });
  
    function handleWheel(e) {
      e.preventDefault();
      if (isScrolling) return;
      const delta = e.deltaY;
      if (delta > 0 && currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
      else if (delta < 0 && currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
    }
  
    function handleTouchStart(e) {
      touchStartY = e.touches[0].clientY;
    }
  
    function handleTouchMove(e) {
      e.preventDefault();
      if (isScrolling) return;
      const diff = touchStartY - e.touches[0].clientY;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
        else if (diff < 0 && currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
      }
    }
  
    function scrollToSection(index) {
      if (isScrolling) return;
      isScrolling = true;
      currentSectionIndex = index;
      navDots.forEach(dot => dot.classList.remove('active'));
      if (navDots[index]) navDots[index].classList.add('active');
      sections[index].scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => { isScrolling = false; }, 1000);
    }
  
    document.addEventListener('keydown', (e) => {
      if (isScrolling) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        if (currentSectionIndex < sections.length - 1) scrollToSection(currentSectionIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (currentSectionIndex > 0) scrollToSection(currentSectionIndex - 1);
      }
    });
  
    function adjustSectionHeight() {
      const vh = window.innerHeight;
      sections.forEach(section => {
        section.style.minHeight = `${vh}px`;
      });
    }
  
    function init() {
      const hash = window.location.hash.substring(1);
      if (hash) {
        const target = document.getElementById(hash);
        const index = Array.from(sections).indexOf(target);
        if (index !== -1) {
          currentSectionIndex = index;
          scrollToSection(index);
        }
      }
      adjustSectionHeight();
      window.addEventListener('resize', adjustSectionHeight);
    }
  
    init();
}
  