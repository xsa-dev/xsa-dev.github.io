document.addEventListener("DOMContentLoaded", function () {
  if (typeof renderMathInElement !== "function") return;

  var article = document.querySelector('article') || document.body;
  
  // Clean up any Markdown emphasis tags that split LaTeX math
  var ps = article.querySelectorAll('p, li, dd');
  ps.forEach(function(el) {
    if (el.innerHTML.includes('$$') || el.innerHTML.includes('$')) {
      el.innerHTML = el.innerHTML.replace(/\$\$([\s\S]*?)\$\$/g, function(match, inner) {
        return '$$' + inner.replace(/<\/?em>/g, '_') + '$$';
      });
    }
  });

  renderMathInElement(article, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
    errorColor: '#cc0000',
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
  });
});
