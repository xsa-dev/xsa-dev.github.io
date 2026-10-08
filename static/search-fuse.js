/**
 * High-Performance Search Engine (Fuse.js)
 * Preloads search index, supports fuzzy matching, transliteration, input debounce, and empty states.
 */
(() => {
  let searchSetup = false;
  let fuseInstance = null;
  let loadPromise = null;

  async function getFuse() {
    if (fuseInstance) return fuseInstance;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const urlEl = document.getElementById("search-index");
        const url = urlEl ? urlEl.textContent.trim() : "/search_index.ru.json";
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const data = await response.json();
        const options = {
          includeScore: true,
          includeMatches: true,
          ignoreLocation: true,
          findAllMatches: true,
          threshold: 0.35,
          minMatchCharLength: 2,
          keys: [
            { name: "title", weight: 4 },
            { name: "description", weight: 2.5 },
            { name: "body", weight: 1 }
          ]
        };

        fuseInstance = new Fuse(data, options);
        searchSetup = true;
        return fuseInstance;
      } catch (err) {
        console.error("Failed to load search index:", err);
        return null;
      }
    })();

    return loadPromise;
  }

  // Preload index in idle time
  if (typeof window !== "undefined") {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => getFuse());
    } else {
      setTimeout(getFuse, 1000);
    }
  }

  function toggleSearch() {
    const searchBar = document.getElementById("search-bar");
    const searchContainer = document.getElementById("search-container");
    const searchResults = document.getElementById("search-results");
    if (!searchContainer || !searchBar) return;

    const isActive = searchContainer.classList.contains("active");
    if (isActive) {
      searchContainer.classList.remove("active");
      searchBar.disabled = true;
      searchBar.value = "";
      if (searchResults) {
        searchResults.innerHTML = "";
        searchResults.style.display = "none";
      }
    } else {
      searchContainer.classList.add("active");
      searchBar.disabled = false;
      searchBar.focus();
      getFuse(); // Ensure loaded
    }
  }

  // Expose globally for nav controllers
  window.toggleSearch = toggleSearch;

  function initSearch() {
    const searchBar = document.getElementById("search-bar");
    const searchResults = document.getElementById("search-results");
    const searchContainer = document.getElementById("search-container");
    const searchToggle = document.getElementById("search-toggle");
    if (!searchBar || !searchResults || !searchContainer) return;

    const MAX_ITEMS = 8;
    const MAX_RESULTS = 3;
    const TEASER_SIZE = 25;

    let debounceTimer = null;

    async function performSearch() {
      const query = searchBar.value.trim();
      if (!query) {
        searchResults.innerHTML = "";
        searchResults.style.display = "none";
        return;
      }

      const fuse = await getFuse();
      if (!fuse) {
        searchResults.innerHTML = `<div class="search-no-results">Индекс поиска загружается…</div>`;
        searchResults.style.display = "flex";
        return;
      }

      const results = fuse.search(query, { limit: MAX_ITEMS });

      if (results.length === 0) {
        searchResults.innerHTML = `
          <div class="search-result item search-empty-state">
            <span class="search-empty-text">Ничего не найдено по запросу «<strong>${escapeHtml(query)}</strong>»</span>
          </div>
        `;
        searchResults.style.display = "flex";
        return;
      }

      let html = "";
      for (const res of results) {
        html += makeResultCard(res, query);
      }
      searchResults.innerHTML = html;
      searchResults.style.display = "flex";
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function makeResultCard(result, query) {
      const item = result.item;
      let output = `
        <div class="search-result item">
          <a class="result-title" href="${item.url}">${escapeHtml(item.title)}</a>
      `;

      if (result.matches && result.matches.length > 0) {
        for (const match of result.matches) {
          if (match.key === "title") continue;
          const value = match.value;
          if (!value) continue;

          const indices = match.indices
            .slice()
            .sort((a, b) => (a[0] - b[0]))
            .slice(0, MAX_RESULTS);

          for (const ind of indices) {
            const start = Math.max(0, ind[0] - TEASER_SIZE);
            const end = Math.min(value.length, ind[1] + TEASER_SIZE + 1);
            const prefix = (start > 0 ? "…" : "") + escapeHtml(value.substring(start, ind[0]));
            const matchText = escapeHtml(value.substring(ind[0], ind[1] + 1));
            const suffix = escapeHtml(value.substring(ind[1] + 1, end)) + (end < value.length ? "…" : "");

            output += `<span>${prefix}<strong>${matchText}</strong>${suffix}</span>`;
          }
          break; // Show snippet from highest weighted content match
        }
      } else if (item.description) {
        output += `<span>${escapeHtml(item.description.slice(0, 120))}…</span>`;
      }

      output += `</div>`;
      return output;
    }

    // Bind both input and keyup for instant, mobile-safe response
    const handleInput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(performSearch, 70);
    };

    searchBar.addEventListener("input", handleInput);
    searchBar.addEventListener("keyup", handleInput);

    // Global keyboard shortcut '/'
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== searchBar && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        toggleSearch();
      }
    });

    if (searchToggle) {
      searchToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSearch();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearch);
  } else {
    initSearch();
  }
})();
