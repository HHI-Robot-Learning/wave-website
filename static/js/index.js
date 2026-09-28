// Nerfies page behavior: result carousel (the interpolation slider of the original is not used).
document.addEventListener('DOMContentLoaded', function () {
  bulmaCarousel.attach('.carousel', {
    slidesToScroll: 1,
    slidesToShow: 3,
    loop: true,
    infinite: true,
    autoplay: false,
    autoplaySpeed: 3000,
  });
});

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
