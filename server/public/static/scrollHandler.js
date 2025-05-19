// public/static/scrollHandler.js
export function initScrollerHandler() {
  const scrollContainer = document.querySelector('.scroll-container');
  const sections = document.querySelectorAll('.scroll-section');
  const navDots = document.querySelectorAll('.nav-dot');
  let touchStartY = 0;

  if (!scrollContainer || sections.length === 0) return;
  scrollContainer.addEventListener('wheel', function (e) {
    e.preventDefault();
  }, { passive: false });

  scrollContainer.addEventListener('touchstart', function (e) {
    touchStartY = e.touches[0].clientY;
  }, { passive: false });

  scrollContainer.addEventListener('touchmove', function (e) {
    e.preventDefault();
  }, { passive: false });

  navDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      console.log(`Nav dot ${index} clicked, but scrolling is disabled.`);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      console.log(`Key ${e.key} pressed, but scrolling is disabled.`);
    }
  });

  function adjustSectionHeight() {
    const vh = window.innerHeight;
    sections.forEach(section => {
      section.style.minHeight = `${vh}px`;
    });
  }

  function init() {
    adjustSectionHeight();
    window.addEventListener('resize', adjustSectionHeight);
  }

  init();
}