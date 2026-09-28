// Light/dark toggle. The initial theme is set by an inline script in <head> (saved choice,
// else the system preference); without a saved choice the page follows system changes.
document.addEventListener('DOMContentLoaded', function () {
  var root = document.documentElement;
  var button = document.getElementById('theme-toggle');
  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var dark = theme === 'dark';
    button.querySelector('i').className = dark ? 'fas fa-sun' : 'fas fa-moon';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    document.dispatchEvent(new CustomEvent('themechange'));
  }

  apply(root.getAttribute('data-theme') || 'light');

  button.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  media.addEventListener('change', function (e) {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (err) {}
    if (!saved) apply(e.matches ? 'dark' : 'light');
  });
});

// Scale each HTML figure's iframe from its native size (data-width/height) to the column width.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.html-figure').forEach(function (box) {
    var w = +box.dataset.width, h = +box.dataset.height;
    var frame = box.querySelector('iframe');
    themeFrame(box, frame);
    function fit() {
      var s = box.clientWidth / w;
      frame.style.transform = 'scale(' + s + ')';
      box.style.height = h * s + 'px';
    }
    fit();
    new ResizeObserver(fit).observe(box);
  });
});

// The HTML figures are separate pages with a white background baked in, so the site's dark mode
// does not reach them. In dark mode, invert the figure's colors with the hue kept (blue stays blue)
// and invert photos back. Each bundle swaps in a new <html> element once it has unpacked, so the
// style is re-added whenever the frame's document changes.
function themeFrame(box, frame) {
  var CSS = 'html { background: #fff; filter: invert(0.91) hue-rotate(180deg); }' +
            'img { filter: invert(1) hue-rotate(180deg); }';

  function apply() {
    var doc;
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.documentElement) {
      // Cross-origin (e.g. opened from file://): fall back to filtering the frame from outside.
      box.classList.add('no-access');
      return;
    }
    var style = doc.getElementById('wave-theme');
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      if (!style) {
        style = doc.createElement('style');
        style.id = 'wave-theme';
        style.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(style);
      }
    } else if (style) {
      style.remove();
    }
  }

  frame.addEventListener('load', function () {
    apply();
    try { new MutationObserver(apply).observe(frame.contentDocument, { childList: true, subtree: false }); } catch (e) {}
  });
  document.addEventListener('themechange', apply);
}
