/**
 * Modern Responsive Hybrid Navigation Drawer & Search Integration Controller
 * Notes & Insights (https://xsa-dev.github.io)
 */
document.addEventListener('DOMContentLoaded', () => {
  // Drawer Elements
  const drawerToggle = document.getElementById('nav-drawer-toggle');
  const drawerClose = document.getElementById('nav-drawer-close');
  const drawerBackdrop = document.getElementById('nav-drawer-backdrop');
  const drawer = document.getElementById('nav-drawer');

  // Search Elements
  const searchToggle = document.getElementById('search-toggle');
  const searchCardTrigger = document.getElementById('drawer-search-card');
  const searchCloseBtn = document.getElementById('search-close-btn');
  const searchBackdrop = document.getElementById('search-modal-backdrop');
  const searchContainer = document.getElementById('search-container');
  const searchBar = document.getElementById('search-bar');

  // Theme Elements
  const quickThemeToggle = document.getElementById('quick-theme-toggle');
  const drawerThemeCard = document.getElementById('drawer-theme-card');

  // --- 1. Drawer Logic ---
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (drawerBackdrop) drawerBackdrop.classList.add('open');
    if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-drawer-locked');
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (drawerBackdrop) drawerBackdrop.classList.remove('open');
    if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-drawer-locked');
  }

  if (drawerToggle) {
    drawerToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  // --- 2. Search Integration with search-fuse.js ---
  function triggerSearch() {
    closeDrawer();
    if (searchToggle) {
      searchToggle.click();
    }
  }

  if (searchCardTrigger) {
    searchCardTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSearch();
    });
  }

  if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', () => {
      if (searchContainer && searchContainer.classList.contains('active')) {
        triggerSearch();
      }
    });
  }

  if (searchBackdrop) {
    searchBackdrop.addEventListener('click', () => {
      if (searchContainer && searchContainer.classList.contains('active')) {
        triggerSearch();
      }
    });
  }

  // --- 3. Quick Theme Toggle Logic ---
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);

    // Sync Giscus comments theme
    const giscusFrame = document.querySelector('iframe.giscus-frame');
    if (giscusFrame) {
      giscusFrame.contentWindow.postMessage(
        { giscus: { setConfig: { theme: nextTheme === 'dark' ? 'dark_dimmed' : 'light' } } },
        'https://giscus.app'
      );
    }
  }

  if (quickThemeToggle) quickThemeToggle.addEventListener('click', toggleTheme);
  if (drawerThemeCard) drawerThemeCard.addEventListener('click', toggleTheme);

  // --- 4. Global Keyboard Shortcuts (Escape to close, Ctrl+K / Cmd+K for search) ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (searchContainer && searchContainer.classList.contains('active')) {
        triggerSearch();
      } else if (drawer && drawer.classList.contains('open')) {
        closeDrawer();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      triggerSearch();
    }
  });
});