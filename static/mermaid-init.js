/**
 * Native Mermaid.js Diagram Auto-Renderer for Notes & Insights (Zola)
 * Dynamically loads Mermaid and converts ```mermaid code blocks into crisp vector SVGs.
 */
(function() {
  function renderAllMermaid() {
    var mermaidCodes = document.querySelectorAll('code[data-lang="mermaid"]');
    if (!mermaidCodes.length) return;

    function doRender() {
      if (!window.mermaid) return;
      var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      
      window.mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        themeVariables: isDark ? {
          darkMode: true,
          background: '#090d16',
          mainBkg: '#111827',
          primaryColor: '#1e293b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#38bdf8',
          lineColor: '#818cf8',
          secondaryColor: '#0f172a',
          tertiaryColor: '#1e1b4b',
          fontSize: '14px',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        } : {
          fontSize: '14px',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        },
        securityLevel: 'loose'
      });

      mermaidCodes.forEach(function(codeEl, i) {
        var pre = codeEl.closest('pre') || codeEl;
        var rawText = codeEl.innerText.trim();
        var id = 'mermaid-svg-' + i + '-' + Math.floor(Math.random() * 10000);
        
        window.mermaid.render(id, rawText).then(function(res) {
          var container = document.createElement('div');
          container.className = 'mermaid-container';
          container.style.cssText = 'display:flex;justify-content:center;margin:2rem 0;overflow-x:auto;padding:1.5rem;background:rgba(15,23,42,0.7);border-radius:14px;border:1px solid rgba(56,189,248,0.25);box-shadow:0 10px 30px rgba(0,0,0,0.3);';
          container.innerHTML = res.svg;
          pre.parentNode.replaceChild(container, pre);
        }).catch(function(err) {
          console.error('Mermaid render error for block ' + i, err);
        });
      });
    }

    if (window.mermaid) {
      doRender();
    } else {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.onload = doRender;
      document.head.appendChild(script);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAllMermaid);
  } else {
    renderAllMermaid();
  }
})();
