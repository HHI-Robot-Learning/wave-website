// Warp Explorer section: a compact viewer over window.WARP_DATA (static/js/warp_data.js, built by
// scripts/build_warp_data.py). The episode video is the clock (one video frame per decision); the
// bars, the action panel and the timeline all follow the decision on screen.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function h(tag, cls, parent, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function s(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function init(root) {
    var D = window.WARP_DATA;
    if (!D) return;
    var nIn = D.inputs.length, nOut = D.outputs.length, nAct = D.actions.length;
    var SH = 3, ACT = 3 + nIn + nOut;  // frame layout, see build_warp_data.py
    var BAR_MAX = D.kl_max;  // bits at a full warp bar: the recording's maximum, -log2(1e-6) = 19.9
    var ep = 0, k = 0, playing = false, userPaused = false, frames = D.episodes[0].frames;

    // Share of all input (output) channels edited at a decision, weighted by channel count.
    function sideShare(f, from, to) {
      var num = 0, den = 0;
      for (var i = from; i < to; i++) { num += f[SH + i] * D.channels[i]; den += D.channels[i]; }
      return den ? num / den : 0;
    }

    // ── controls ──
    var bar = h('div', 'wv-controls', root);
    var eps = h('div', 'buttons has-addons wv-episodes', bar);
    h('span', 'wv-label', eps, 'Episode');
    var epButtons = D.episodes.map(function (e, i) {
      var b = h('button', 'button is-small', eps, String(i + 1));
      b.type = 'button';
      b.title = e.frames.length + ' decisions';
      b.addEventListener('click', function () { userPaused = false; loadEpisode(i, true); });
      return b;
    });
    var nav = h('div', 'buttons has-addons wv-nav', bar);
    function navButton(icon, label) {
      var b = h('button', 'button is-small', nav);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = '<span class="icon"><i class="fas ' + icon + '"></i></span>';
      return b;
    }
    var back = navButton('fa-backward-step', 'Previous decision');
    var play = h('button', 'button is-small is-dark wv-play', nav);
    play.type = 'button';
    var fwd = navButton('fa-forward-step', 'Next decision');
    var scrub = h('input', 'wv-scrub', bar);
    scrub.type = 'range'; scrub.min = 0; scrub.step = 1;
    scrub.setAttribute('aria-label', 'Decision');
    var speedBox = h('label', 'wv-speed', bar);
    h('span', 'wv-label', speedBox, 'Speed');
    var SPEEDS = [0.25, 0.5, 1, 2, 4];
    var speed = h('input', '', speedBox);
    speed.type = 'range'; speed.min = 0; speed.max = SPEEDS.length - 1; speed.step = 1; speed.value = 0;  // 0.25x by default
    speed.setAttribute('aria-label', 'Playback speed');
    var speedVal = h('span', 'wv-speed-val', speedBox, SPEEDS[0] + '\u00d7');
    var readout = h('p', 'wv-readout', root);

    // ── main: video + panels ──
    var main = h('div', 'wv-main', root);
    var vbox = h('div', 'wv-video', main);
    // ── 3-D view (default) or the rendered video; the video stays the clock either way ──
    var vbar = h('div', 'wv-viewbar', vbox);
    var modeBtns = h('div', 'buttons has-addons wv-mode', vbar);
    var b3d = h('button', 'button is-small is-dark', modeBtns, '3-D');
    var bVid = h('button', 'button is-small', modeBtns, 'Video');
    b3d.type = bVid.type = 'button';
    var bOverlay = h('button', 'button is-small is-dark wv-overlay-btn', vbar, 'Warp overlay');
    bOverlay.type = 'button';
    var bReset = h('button', 'button is-small wv-reset-btn', vbar, 'Reset view');
    bReset.type = 'button';
    var box3d = h('div', 'wv-3d', vbox);
    var video = h('video', '', vbox);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    var legend3d = h('p', 'wv-legend wv-3d-legend', vbox);
    legend3d.innerHTML = '<span class="wv-dot is-goal"></span>presented goal <span class="wv-dot is-obj"></span>presented object ' +
      '<span class="wv-dot is-ee"></span>presented jaws <span class="wv-dash"></span>warp (true \u2192 presented) ' +
      '<span class="wv-hint">Drag to rotate, scroll to zoom, right-drag to pan.</span>';

    var view = null, mode = '3d', overlayOn = true;
    try {
      if (window.THREE && window.WarpView3D && THREE.OrbitControls) view = WarpView3D(box3d, D);
    } catch (e) { view = null; }
    function setMode(m) {
      mode = view ? m : 'video';
      vbox.classList.toggle('is-3d', mode === '3d');
      b3d.classList.toggle('is-dark', mode === '3d');
      bVid.classList.toggle('is-dark', mode === 'video');
      if (mode === '3d' && view) view.resize();
    }
    if (!view) vbar.style.display = 'none';
    b3d.addEventListener('click', function () { setMode('3d'); });
    bVid.addEventListener('click', function () { setMode('video'); });
    bOverlay.addEventListener('click', function () {
      overlayOn = !overlayOn;
      bOverlay.classList.toggle('is-dark', overlayOn);
      if (view) view.setOverlay(overlayOn);
      legend3d.classList.toggle('is-off', !overlayOn);
    });
    bReset.addEventListener('click', function () { if (view) view.resetView(); });
    video.setAttribute('playsinline', '');

    var side = h('div', 'wv-side', main);
    function shareBlock(title, sub, labels, cls) {
      var box = h('div', 'wv-block ' + cls, side);
      var t = h('p', 'wv-block-title', box, title + ' ');
      h('span', 'wv-block-sub', t, sub);
      return labels.map(function (label) {
        var row = h('div', 'wv-share', box);
        var n = D.channels[D.inputs.concat(D.outputs).indexOf(label)];
        row.title = label + ': ' + n + ' warp parameters (a multiplier and an offset per coordinate); the bar is their mean KL from \u201cno edit\u201d, in bits';
        h('span', 'wv-share-label', row, label);
        var track = h('span', 'wv-share-track', row);
        var fill = h('span', 'wv-share-fill', track);
        var val = h('span', 'wv-share-val', row);
        return { fill: fill, val: val };
      });
    }
    var inRows = shareBlock('Input warp', 'what the frozen skill sees \u00b7 KL, bits', D.inputs, 'is-input');
    var outRows = shareBlock('Output warp', 'what the robot is told to do \u00b7 KL, bits', D.outputs, 'is-output');
    h('p', 'wv-explain wv-explain-wide', root,  // full width under both columns, so they stay balanced
      'Each value is the Kullback\u2013Leibler divergence KL(\u03b4 \u2016 \u03c0) = \u2212log\u2082 \u03c0(unchanged) between the ' +
      'point mass \u03b4 on leaving a warp parameter unchanged (multiplier 1, offset 0, or holding an unchanged value) ' +
      'and the warping policy\u2019s categorical distribution \u03c0 over that parameter\u2019s values at this decision, ' +
      'averaged over the quantity\u2019s parameters (one multiplier and one offset per coordinate) and given in bits. ' +
      'A value of 0 means the policy leaves the quantity unchanged with probability 1. The bars span 0 to ' +
      (BAR_MAX).toFixed(1) + ' bits (\u2212log\u2082 10\u207b\u2076), the largest value the recording represents, since it stores ' +
      'probabilities with a floor of 10\u207b\u2076.');

    var actBox = h('div', 'wv-block', side);
    var at = h('p', 'wv-block-title', actBox, 'Action ');
    h('span', 'wv-block-sub', at, 'the skill alone vs. after the warp');
    var actRows = D.actions.map(function (name) {
      var row = h('div', 'wv-act', actBox);
      h('span', 'wv-share-label', row, name);
      var track = h('span', 'wv-act-track', row);
      h('span', 'wv-act-zero', track);
      return { skill: h('span', 'wv-act-bar is-skill', track), warped: h('span', 'wv-act-bar is-warped', track) };
    });
    var legend = h('p', 'wv-legend', actBox);
    legend.innerHTML = '<span class="wv-swatch is-skill"></span>skill alone <span class="wv-swatch is-warped"></span>executed (after the output warp)';

    // ── timeline ──
    var tl = h('div', 'wv-timeline', root);
    var tlTitle = h('p', 'wv-block-title', tl, 'Warp activity over the episode ');
    h('span', 'wv-block-sub', tlTitle, 'KL from \u201cno edit\u201d, averaged over all input and all output warp parameters and over 9 decisions; numbers mark cubes placed. Click to jump.');
    var svg = s('svg', { class: 'wv-tl-svg', preserveAspectRatio: 'none' }, tl);
    var W = 1000, H = 90, PAD = 14;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var areaIn = s('path', { class: 'wv-tl-in' }, svg);
    var lineOut = s('path', { class: 'wv-tl-out' }, svg);
    var marks = s('g', { class: 'wv-tl-marks' }, svg);
    var head = s('line', { class: 'wv-tl-head', y1: 0, y2: H }, svg);
    s('line', { class: 'wv-tl-grid', x1: 0, x2: W, y1: PAD, y2: PAD }, svg);
    var axisLabel = h('span', 'wv-tl-axis', tl);
    var tlLegend = h('p', 'wv-legend', tl);
    tlLegend.innerHTML = '<span class="wv-swatch is-input"></span>input warp <span class="wv-swatch is-output"></span>output warp';

    function x(i) { return frames.length > 1 ? (i / (frames.length - 1)) * W : 0; }
    var yMax = 100;  // set per episode to its largest smoothed value (bits x100), rounded up to 0.5 bits
    function y(v) { return H - 4 - (v / yMax) * (H - PAD - 4); }

    // Centered moving average over SMOOTH decisions: the per-decision share flickers, the trend reads.
    var SMOOTH = 9;
    function smooth(v) {
      var r = SMOOTH >> 1;
      return v.map(function (_, i) {
        var a = Math.max(0, i - r), b = Math.min(v.length - 1, i + r), t = 0;
        for (var j = a; j <= b; j++) t += v[j];
        return t / (b - a + 1);
      });
    }
    function drawTimeline() {
      var vin = smooth(frames.map(function (f) { return sideShare(f, 0, nIn); }));
      var vout = smooth(frames.map(function (f) { return sideShare(f, nIn, nIn + nOut); }));
      yMax = Math.max(50, Math.ceil(Math.max.apply(null, vin.concat(vout)) / 50) * 50);
      axisLabel.textContent = (yMax / 100).toFixed(1) + ' bits';
      var dIn = 'M0,' + y(0), dOut = '';
      frames.forEach(function (f, i) {
        dIn += ' L' + x(i).toFixed(1) + ',' + y(vin[i]).toFixed(1);
        dOut += (i ? ' L' : 'M') + x(i).toFixed(1) + ',' + y(vout[i]).toFixed(1);
      });
      areaIn.setAttribute('d', dIn + ' L' + W + ',' + y(0) + ' Z');
      lineOut.setAttribute('d', dOut);
      marks.innerHTML = '';
      for (var i = 1; i < frames.length; i++) {
        if (frames[i][0] > frames[i - 1][0]) {
          s('line', { x1: x(i), x2: x(i), y1: PAD - 2, y2: H, class: 'wv-tl-mark' }, marks);
          var t = s('text', { x: x(i), y: PAD - 4, class: 'wv-tl-mark-label' }, marks);
          t.textContent = frames[i][0];
        }
      }
    }

    function render() {
      if (view && !playing) view.setTime(k, 0);
      var f = frames[k];
      var placed = f[0], cube = f[1] + 1;
      readout.innerHTML = 'Decision <b>' + (k + 1) + '</b> / ' + frames.length +
        ' &nbsp;·&nbsp; <b>' + placed + '</b> of ' + D.n_obj + ' cubes placed' +
        (placed < D.n_obj ? ' &nbsp;·&nbsp; working on cube <b>' + cube + '</b>' + (f[2] ? ', carrying it' : '') : ' &nbsp;·&nbsp; <b>done</b>');
      inRows.concat(outRows).forEach(function (r, i) {
        var v = f[SH + i];
        // bars span 0 to BAR_MAX bits
        r.fill.style.width = Math.min(100, v / BAR_MAX) + '%';
        r.val.textContent = (v / 100).toFixed(2);
      });
      actRows.forEach(function (r, i) {
        place(r.skill, f[ACT + i]);
        place(r.warped, f[ACT + nAct + i]);
      });
      head.setAttribute('x1', x(k));
      head.setAttribute('x2', x(k));
      scrub.value = k;
    }
    // A bar from the center line to the value, on a -1..1 scale.
    function place(el, v) {
      v = Math.max(-1, Math.min(1, v));
      el.style.left = (v < 0 ? 50 + v * 50 : 50) + '%';
      el.style.width = Math.abs(v) * 50 + '%';
    }

    function setPlaying(p) {
      playing = p;
      play.innerHTML = p ? '<span class="icon"><i class="fas fa-pause"></i></span><span>Pause</span>'
                         : '<span class="icon"><i class="fas fa-play"></i></span><span>Play</span>';
      if (p) video.play().catch(function () {}); else video.pause();
    }
    function seek(i) {
      k = Math.max(0, Math.min(frames.length - 1, i));
      if (video.readyState >= 1) video.currentTime = (k + 0.5) / D.fps;
      render();
    }
    function loadEpisode(i, autoplay) {
      ep = i;
      frames = D.episodes[i].frames;
      epButtons.forEach(function (b, j) { b.classList.toggle('is-dark', j === i); b.classList.toggle('is-selected', j === i); });
      scrub.max = frames.length - 1;
      k = 0;
      if (view) view.setEpisode(i, function () { view.setTime(k, 0); });
      video.src = D.episodes[i].video;
      // Loading a new source resets playbackRate to defaultPlaybackRate, so set both.
      video.defaultPlaybackRate = video.playbackRate = SPEEDS[+speed.value];
      drawTimeline();
      render();
      if (autoplay) setPlaying(true);
    }

    // The video is the clock while playing; at the end of an episode, move on to the next.
    function tick() {
      if (playing && video.readyState >= 2) {
        var ft = video.currentTime * D.fps;
        var i = Math.min(frames.length - 1, Math.floor(ft));
        if (i !== k) { k = i; render(); }
        if (view) view.setTime(k, ft - i);
      }
      requestAnimationFrame(tick);
    }
    video.addEventListener('ended', function () {
      if (playing) loadEpisode((ep + 1) % D.episodes.length, true);
    });

    play.addEventListener('click', function () { userPaused = playing; setPlaying(!playing); });
    function step(d) { userPaused = true; setPlaying(false); seek(k + d); }
    back.addEventListener('click', function () { step(-1); });
    fwd.addEventListener('click', function () { step(1); });
    speed.addEventListener('input', function () {
      var r = SPEEDS[+speed.value];
      video.defaultPlaybackRate = video.playbackRate = r;
      speedVal.textContent = r + '\u00d7';
    });
    // Arrow keys step one decision, space plays and pauses, while the viewer has focus.
    root.tabIndex = 0;
    root.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === ' ') { e.preventDefault(); play.click(); }
    });
    scrub.addEventListener('input', function () { userPaused = true; setPlaying(false); seek(+scrub.value); });
    function tlSeek(e) {
      var r = svg.getBoundingClientRect();
      userPaused = true;
      setPlaying(false);
      seek(Math.round(((e.clientX - r.left) / r.width) * (frames.length - 1)));
    }
    svg.addEventListener('pointerdown', function (e) {
      tlSeek(e);
      svg.setPointerCapture(e.pointerId);
      svg.onpointermove = tlSeek;
    });
    svg.addEventListener('pointerup', function () { svg.onpointermove = null; });

    setMode('3d');
    loadEpisode(0, false);
    setPlaying(false);
    requestAnimationFrame(tick);

    // Play while the section is on screen and pause when it leaves, unless the visitor paused
    // it themselves (or prefers less motion).
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { if (!userPaused) setPlaying(true); }
        else if (playing) setPlaying(false);
      }, { threshold: 0.3 }).observe(root);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('warp-viewer');
    if (root) init(root);
  });
})();
