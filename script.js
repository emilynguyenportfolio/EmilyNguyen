// ── SIDEBAR TOGGLE ──
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });
});

// ── CUSTOM CURSOR (pointer devices only) ──
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const dot  = document.createElement('div');
  const lbl  = document.createElement('span');
  dot.className  = 'cursor-dot';
  lbl.className  = 'cursor-label';
  document.body.append(dot, lbl);

  let mx = -300, my = -300;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
    lbl.style.left = mx + 'px';
    lbl.style.top  = my + 'px';
  });

  // Show label on project rows (uses existing data-label)
  document.querySelectorAll('[data-label]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      lbl.textContent = el.dataset.label;
      lbl.classList.add('active');
      document.body.classList.add('cursor-active');
    });
    el.addEventListener('mouseleave', () => {
      lbl.classList.remove('active');
      document.body.classList.remove('cursor-active');
    });
  });

  // Expand ring on interactive elements
  document.querySelectorAll('a, button, .fs-teaser-photo, .sn-strip-photo, .sn-section-link, .g-item').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });
})();

// ── PROJECT HOVER PREVIEW ──
const projRows    = document.querySelectorAll('.proj-row');
const previewBlock = document.getElementById('previewBlock');
const previewLabel = document.getElementById('previewLabel');

if (projRows.length && previewBlock) {
  let currentColor = null;
  projRows.forEach(row => {
    row.addEventListener('mouseenter', () => {
      const color = row.dataset.color;
      if (color !== currentColor) {
        previewBlock.style.background = color;
        currentColor = color;
      }
      previewBlock.classList.add('active');
      if (previewLabel) {
        previewLabel.textContent = row.dataset.label || '';
        previewLabel.classList.add('active');
      }
    });
    row.addEventListener('mouseleave', () => {
      previewBlock.classList.remove('active');
      if (previewLabel) previewLabel.classList.remove('active');
    });
  });
}

// ── SCROLL FADE-IN ──
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
);
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
