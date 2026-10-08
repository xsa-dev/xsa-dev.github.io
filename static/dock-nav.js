/**
 * Interactive Expandable / Collapsible Dock Navigation for Notes & Insights
 * Shows compact icons by default, expands labels on toggle/click.
 */
document.addEventListener('DOMContentLoaded', () => {
  const dockNav = document.getElementById('dock-nav');
  const toggleBtn = document.getElementById('dock-toggle-btn');
  
  if (!dockNav || !toggleBtn) return;

  function toggleDock(e) {
    if (e) e.stopPropagation();
    const isExpanded = dockNav.classList.toggle('dock-expanded');
    toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    
    // Animate hamburger to X
    const toggleIcon = toggleBtn.querySelector('.dock-icon-toggle');
    if (toggleIcon) {
      if (isExpanded) {
        toggleIcon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
      } else {
        toggleIcon.innerHTML = '<path d="M4 6h16M4 12h16M4 18h16"></path>';
      }
    }
  }

  function collapseDock() {
    if (dockNav.classList.contains('dock-expanded')) {
      dockNav.classList.remove('dock-expanded');
      toggleBtn.setAttribute('aria-expanded', 'false');
      const toggleIcon = toggleBtn.querySelector('.dock-icon-toggle');
      if (toggleIcon) {
        toggleIcon.innerHTML = '<path d="M4 6h16M4 12h16M4 18h16"></path>';
      }
    }
  }

  toggleBtn.addEventListener('click', toggleDock);

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dockNav.contains(e.target)) {
      collapseDock();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      collapseDock();
    }
  });
});
