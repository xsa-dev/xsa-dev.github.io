/**
 * Native Mermaid.js Diagram Auto-Renderer for Notes & Insights (Zola)
 * Finds ```mermaid code blocks and turns them into interactive vector SVG diagrams.
 */
(async () => {
  const mermaidBlocks = document.querySelectorAll('pre[data-lang="mermaid"], pre code.language-mermaid, pre.giallo[data-lang="mermaid"]');
  if (!mermaidBlocks.length) return;

  // Dynamically load Mermaid ESM
  try {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
    
    // Check current theme
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      themeVariables: isDark ? {
        darkMode: true,
        background: '#0e1726',
        mainBkg: '#1e293b',
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

    // Replace code blocks with mermaid divs
    mermaidBlocks.forEach((block, idx) => {
      let code = block.textContent.trim();
      let parent = block.closest('pre') || block;
      
      const container = document.createElement('div');
      container.className = 'mermaid-container';
      container.style.cssText = 'display:flex;justify-content:center;margin:1.75rem 0;overflow-x:auto;padding:1rem;background:rgba(15,23,42,0.6);border-radius:12px;border:1px solid rgba(255,255,255,0.08);';
      
      const mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'mermaid';
      mermaidDiv.textContent = code;
      
      container.appendChild(mermaidDiv);
      parent.parentNode.replaceChild(container, parent);
    });

    await mermaid.run();
  } catch (err) {
    console.error('Failed to initialize Mermaid:', err);
  }
})();
