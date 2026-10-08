/**
 * Medium-style Smooth Image Zoom Lightbox for Notes & Insights
 * Zero-dependency, lightweight, mobile & touch friendly.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Create overlay container if not present
  let overlay = document.getElementById('image-zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'image-zoom-overlay';
    overlay.className = 'zoom-overlay';
    overlay.innerHTML = `
      <div class="zoom-backdrop"></div>
      <div class="zoom-content">
        <img class="zoom-target-img" src="" alt="" />
        <div class="zoom-caption"></div>
        <button class="zoom-close-btn" aria-label="Закрыть (Esc)">✕</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const backdrop = overlay.querySelector('.zoom-backdrop');
  const targetImg = overlay.querySelector('.zoom-target-img');
  const caption = overlay.querySelector('.zoom-caption');
  const closeBtn = overlay.querySelector('.zoom-close-btn');

  let active = false;

  function openZoom(img) {
    if (active) return;
    active = true;
    
    targetImg.src = img.src;
    targetImg.alt = img.alt || '';
    
    if (img.alt && img.alt !== 'image' && !img.alt.includes('.png') && !img.alt.includes('.jpg')) {
      caption.textContent = img.alt;
      caption.style.display = 'block';
    } else {
      caption.textContent = '';
      caption.style.display = 'none';
    }

    overlay.classList.add('zoom-active');
    document.body.classList.add('zoom-lock-scroll');
  }

  function closeZoom() {
    if (!active) return;
    active = false;
    overlay.classList.remove('zoom-active');
    document.body.classList.remove('zoom-lock-scroll');
    setTimeout(() => {
      if (!active) targetImg.src = '';
    }, 250);
  }

  // Attach listener to all content images
  const images = document.querySelectorAll('article img:not(.no-zoom), main img:not(.no-zoom), .zoomable');
  images.forEach(img => {
    img.classList.add('zoomable-img');
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openZoom(img);
    });
  });

  // Close interactions
  overlay.addEventListener('click', (e) => {
    if (e.target !== targetImg) {
      closeZoom();
    }
  });

  closeBtn.addEventListener('click', closeZoom);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) {
      closeZoom();
    }
  });
});
