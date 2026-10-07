(function() {
  let searchIndex = null;
  let searchModal = null;
  let searchInput = null;
  let searchResults = null;
  let selectedIndex = -1;

  function initSearch() {
    searchModal = document.getElementById('search-modal');
    searchInput = document.getElementById('search-input');
    searchResults = document.getElementById('search-results');
    const openBtn = document.getElementById('search-open-btn');
    const closeBtn = document.getElementById('search-close-btn');

    if (!searchModal || !searchInput || !searchResults) return;

    if (openBtn) {
      openBtn.addEventListener('click', openModal);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    searchModal.addEventListener('click', function(e) {
      if (e.target === searchModal) closeModal();
    });

    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleModal();
      } else if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
        closeModal();
      } else if (!searchModal.classList.contains('hidden')) {
        handleKeyboardNav(e);
      }
    });

    searchInput.addEventListener('input', debounce(performSearch, 150));
  }

  function toggleModal() {
    if (searchModal.classList.contains('hidden')) {
      openModal();
    } else {
      closeModal();
    }
  }

  function openModal() {
    loadIndex();
    searchModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => searchInput.focus(), 50);
  }

  function closeModal() {
    searchModal.classList.add('hidden');
    document.body.style.overflow = '';
    searchInput.value = '';
    searchResults.innerHTML = '';
    selectedIndex = -1;
  }

  function loadIndex() {
    if (searchIndex || window.elasticlunrIndex) return;

    if (window.searchIndex && window.elasticlunr) {
      window.elasticlunrIndex = window.elasticlunr.Index.load(window.searchIndex);
    }
  }

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchResults.innerHTML = '';
      selectedIndex = -1;
      return;
    }

    const index = window.elasticlunrIndex;
    if (!index) {
      searchResults.innerHTML = '<li class="search-status">Загрузка поискового индекса...</li>';
      return;
    }

    const results = index.search(query, {
      fields: {
        title: { boost: 3 },
        body: { boost: 1 },
        tags: { boost: 2 }
      },
      expand: true,
      bool: "OR"
    });

    renderResults(results, query);
  }

  function renderResults(results, query) {
    if (results.length === 0) {
      searchResults.innerHTML = '<li class="search-status">Ничего не найдено</li>';
      selectedIndex = -1;
      return;
    }

    const items = results.slice(0, 8).map((result, idx) => {
      const doc = result.doc;
      const snippet = getSnippet(doc.body || '', query);
      return `
        <li class="search-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}">
          <a href="${doc.permalink || doc.path || '#'}">
            <div class="search-item-title">${escapeHtml(doc.title)}</div>
            ${snippet ? `<div class="search-item-snippet">${snippet}</div>` : ''}
          </a>
        </li>
      `;
    }).join('');

    searchResults.innerHTML = items;
    selectedIndex = 0;

    const itemsEls = searchResults.querySelectorAll('.search-item');
    itemsEls.forEach((el, idx) => {
      el.addEventListener('mouseenter', () => setSelectedIndex(idx));
    });
  }

  function handleKeyboardNav(e) {
    const items = searchResults.querySelectorAll('.search-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((selectedIndex + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((selectedIndex - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const link = items[selectedIndex].querySelector('a');
      if (link) link.click();
    }
  }

  function setSelectedIndex(idx) {
    const items = searchResults.querySelectorAll('.search-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
    });
    selectedIndex = idx;
    if (items[idx]) {
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  function getSnippet(text, query) {
    if (!text) return '';
    const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const lower = clean.toLowerCase();
    const qLower = query.toLowerCase();
    const pos = lower.indexOf(qLower);

    if (pos === -1) {
      return clean.slice(0, 110) + (clean.length > 110 ? '...' : '');
    }

    const start = Math.max(0, pos - 40);
    const end = Math.min(clean.length, pos + query.length + 70);
    let snippet = (start > 0 ? '...' : '') + clean.slice(start, end) + (end < clean.length ? '...' : '');
    
    // Highlight matched term
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return snippet.replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }
})();
