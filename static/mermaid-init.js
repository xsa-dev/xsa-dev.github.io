/**
 * Native Mermaid.js Diagram Auto-Renderer for Notes & Insights (Zola)
 * Finds ```mermaid code blocks and turns them into interactive vector SVG diagrams.
 */
(async () => {
  function decodeHtml(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }

  const mermaidCodes = document.querySelectorAll('code[data-lang="mermaid"]');
  if (!mermaidCodes.length) return;

  try {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
    
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    mermaid.initialize({
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

    for (let i = 0; i < mermaidCodes.length; i++) {
      const codeEl = mermaidCodes[i];
      const pre = codeEl.closest('pre') || codeEl;
      const rawText = decodeHtml(codeEl.innerText.trim());
      
      const id = 'mermaid-diagram-' + i;
      try {
        const { svg } = await mermaid.render(id, rawText);
        const container = document.createElement('div');
        container.className = 'mermaid-container';
        container.style.cssText = 'display:flex;justify-content:center;margin:2rem 0;overflow-x:auto;padding:1.5rem;background:rgba(15,23,42,0.7);border-radius:14px;border:1px solid rgba(56,189,248,0.25);box-shadow:0 10px 30px rgba(0,0,0,0.3);';
        container.innerHTML = svg;
        pre.parentNode.replaceChild(container, pre);
      } catch (renderErr) {
        console.error('Mermaid render error for block ' + i, renderErr);
      }
    }
  } catch (err) {
    console.error('Failed to initialize Mermaid:', err);
  }
})();
