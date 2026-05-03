// Sidebar toggle
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });
});

// ── Project hover preview ──
const projRows = document.querySelectorAll('.proj-row');
const previewBlock = document.getElementById('previewBlock');
const previewVeil  = document.getElementById('previewVeil');
const previewLabel = document.getElementById('previewLabel');

if (projRows.length && previewBlock) {
  let currentColor = null;

  projRows.forEach(row => {
    row.addEventListener('mouseenter', () => {
      const color = row.dataset.color;
      const label = row.dataset.label;

      // only animate if color changes
      if (color !== currentColor) {
        previewBlock.style.background = color;
        currentColor = color;
      }

      previewBlock.classList.add('active');
      previewVeil.classList.add('active');
      previewLabel.textContent = label;
      previewLabel.classList.add('active');
    });

    row.addEventListener('mouseleave', () => {
      previewBlock.classList.remove('active');
      previewVeil.classList.remove('active');
      previewLabel.classList.remove('active');
    });
  });
}

// ── Scroll fade-in ──
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
