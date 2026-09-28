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
    var layer = addHotspots(box, w, h);
    function fit() {
      var s = box.clientWidth / w;
      frame.style.transform = 'scale(' + s + ')';
      if (layer) layer.style.transform = 'scale(' + s + ')';
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

// Hotspots over the HTML figures (notes in static/js/figure_notes.js). The layer sits above the
// iframe in the figure's native coordinates and is scaled with it. Hovering or focusing a hotspot
// shows its note; tapping one on a touch screen toggles it. Hotspots with a link jump to the
// linked figure or section on click (on touch screens, from the link inside the note).
function addHotspots(box, w, h) {
  var notes = (window.FIGURE_NOTES || {})[box.dataset.notes];
  if (!notes) return null;

  var layer = document.createElement('div');
  layer.className = 'fig-hotspots';
  layer.style.width = w + 'px';
  layer.style.height = h + 'px';
  box.appendChild(layer);

  var pop = document.createElement('div');
  pop.className = 'fig-popover';
  pop.setAttribute('role', 'tooltip');
  box.appendChild(pop);

  var touch = window.matchMedia('(hover: none)').matches;
  var active = null;

  function show(spot, note) {
    active = spot;
    pop.innerHTML = '<p class="fig-popover-title">' + note.title + '</p><p>' + note.body + '</p>' +
      (note.link ? '<a class="fig-popover-link" href="' + note.link.href + '">' + note.link.label + ' &rarr;</a>' : '');
    renderMath(pop);
    pop.classList.add('is-visible');
    // Place the note under the hotspot, or above it when there is no room below.
    var s = box.clientWidth / w, r = note.rect;
    var left = Math.min(Math.max(0, r[0] * s), box.clientWidth - pop.offsetWidth);
    var below = (r[1] + r[3]) * s + 6;
    var top = below + pop.offsetHeight > box.clientHeight + 120 ? r[1] * s - pop.offsetHeight - 6 : below;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    layer.querySelectorAll('.fig-hotspot').forEach(function (el) { el.classList.toggle('is-active', el === spot); });
  }
  // KaTeX loads deferred; a note opened before it is ready renders its math once it arrives.
  function renderMath(el) {
    var opts = { delimiters: [{ left: '\\(', right: '\\)', display: false }] };
    if (window.renderMathInElement) renderMathInElement(el, opts);
    else window.addEventListener('load', function () { if (window.renderMathInElement) renderMathInElement(el, opts); }, { once: true });
  }
  function hide() {
    active = null;
    pop.classList.remove('is-visible');
    layer.querySelectorAll('.fig-hotspot').forEach(function (el) { el.classList.remove('is-active'); });
  }

  notes.forEach(function (note) {
    var spot = document.createElement(note.link ? 'a' : 'button');
    spot.className = 'fig-hotspot' + (note.link ? ' has-link' : '');
    if (note.link) spot.href = note.link.href; else spot.type = 'button';
    spot.setAttribute('aria-label', note.title.replace(/\\[()]/g, ''));
    spot.style.left = note.rect[0] + 'px';
    spot.style.top = note.rect[1] + 'px';
    spot.style.width = note.rect[2] + 'px';
    spot.style.height = note.rect[3] + 'px';
    spot.addEventListener('mouseenter', function () { if (!touch) show(spot, note); });
    spot.addEventListener('focus', function () { show(spot, note); });
    spot.addEventListener('click', function (e) {
      if (touch || !note.link) {
        e.preventDefault();
        if (active === spot) hide(); else show(spot, note);
      }
    });
    layer.appendChild(spot);
  });

  box.addEventListener('mouseleave', function () { if (!touch) hide(); });
  document.addEventListener('click', function (e) { if (!box.contains(e.target)) hide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  return layer;
}
