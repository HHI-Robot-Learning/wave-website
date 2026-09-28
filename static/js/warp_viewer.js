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
    var video = h('video', '', vbox);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('playsinline', '');

    // ── scene: true vs presented, with the candidate cloud (under the video) ──
    var scene = h('div', 'wv-scene', vbox);
    var st = h('p', 'wv-block-title', scene, 'Scene ');
    h('span', 'wv-block-sub', st, 'true vs. presented, with the candidate cloud');
    var canvas = h('canvas', 'wv-scene-canvas', scene);
    var sc = h('div', 'wv-scene-controls', scene);
    var tog = h('div', 'buttons has-addons wv-toggles', sc);
    var show = { trail: true, full: true, warp: true };
    [['trail', 'Trails'], ['full', 'Full path'], ['warp', 'Warp vectors']].forEach(function (t) {
      var b = h('button', 'button is-small is-dark', tog, t[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () {
        show[t[0]] = !show[t[0]];
        b.classList.toggle('is-dark', show[t[0]]);
        b.setAttribute('aria-pressed', String(show[t[0]]));
        drawScene();
      });
    });
    function slider(label, min, max, stp, value, fmt, onInput) {
      var box = h('label', 'wv-speed', sc);
      h('span', 'wv-label', box, label);
      var r = h('input', '', box);
      r.type = 'range'; r.min = min; r.max = max; r.step = stp; r.value = value;
      r.setAttribute('aria-label', label);
      var v = h('span', 'wv-speed-val', box);
      function upd() { v.textContent = fmt(+r.value); onInput(+r.value); }
      r.addEventListener('input', function () { upd(); drawScene(); });
      upd();
      return r;
    }
    var nCand = 220, temp = 1;
    slider('Cloud', 0, 400, 20, 220, function (x) { return String(x); }, function (x) { nCand = x; });
    slider('Temperature', 0, 100, 1, 0, function (x) {
      var t = Math.pow(10, x / 25);
      return 'T = ' + (t < 10 ? t.toFixed(2) : t.toPrecision(3));
    }, function (x) { temp = Math.pow(10, x / 25); });
    var sleg = h('p', 'wv-legend wv-scene-legend', scene);
    sleg.innerHTML = '<span class="wv-dot is-true"></span>true position <span class="wv-dot is-goal"></span>presented goal ' +
      '<span class="wv-dot is-obj"></span>presented object <span class="wv-dot is-ee"></span>presented jaws ' +
      '<span class="wv-dot is-sat"></span>placed cube <span class="wv-dash"></span>warp vector';
    h('p', 'wv-explain', scene,
      'Left: side view (x\u2013z), which shows lifting. Right: top view (x\u2013y). Grey outlines are where the cubes, goals ' +
      'and jaws really are; filled dots are where the warp makes the frozen skill believe the selected cube, its goal and ' +
      'the jaws are (the presented scene), and the dashed lines between them are the warp. The faint cloud shows alternative ' +
      'warps sampled from the policy\u2019s own choice distribution at this decision; raise the temperature to see what else it considered.');

    var side = h('div', 'wv-side', main);
    function shareBlock(title, sub, labels, cls) {
      var box = h('div', 'wv-block ' + cls, side);
      var t = h('p', 'wv-block-title', box, title + ' ');
      h('span', 'wv-block-sub', t, sub);
      return labels.map(function (label) {
        var row = h('div', 'wv-share', box);
        var n = D.channels[D.inputs.concat(D.outputs).indexOf(label)];
        row.title = label + ': ' + n + ' warp parameters (a multiplier and an offset per coordinate)';
        h('span', 'wv-share-label', row, label);
        var track = h('span', 'wv-share-track', row);
        var fill = h('span', 'wv-share-fill', track);
        var val = h('span', 'wv-share-val', row);
        return { fill: fill, val: val };
      });
    }
    var inRows = shareBlock('Input warp', 'what the frozen skill sees', D.inputs, 'is-input');
    var outRows = shareBlock('Output warp', 'what the robot is told to do', D.outputs, 'is-output');
    h('p', 'wv-explain', side,
      'Each percentage is the share of that quantity\u2019s warp parameters (a multiplier and an offset per ' +
      'coordinate) that the warping policy is changing at this decision, i.e. not at the identity (multiplier 1, ' +
      'offset 0). 0% means it passes through unchanged; the goal, for example, has 12 parameters, so 50% means 6 ' +
      'of them are being edited.');

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
    h('span', 'wv-block-sub', tlTitle, 'share of input and output channels edited (averaged over 9 decisions); numbers mark cubes placed. Click to jump.');
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
    var yMax = 100;  // set per episode to its largest smoothed share, rounded up to 10%
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
      yMax = Math.max(20, Math.ceil(Math.max.apply(null, vin.concat(vout)) / 10) * 10);
      axisLabel.textContent = yMax + '%';
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

    // ── scene data (one lazily loaded file per episode) and drawing ──
    var SC = D.scene, NB = SC.n_bins, SCENES = [], sceneWaiting = {};
    window.WARP_SCENE_LOADED = function (i, d) {
      var bin = atob(d.logits), u = new Int8Array(bin.length);
      for (var j = 0; j < bin.length; j++) u[j] = (bin.charCodeAt(j) << 24) >> 24;
      d.logits = u;
      SCENES[i] = d;
      if (i === ep) drawScene();
    };
    function loadScene(i) {
      if (SCENES[i] || sceneWaiting[i]) return;
      sceneWaiting[i] = true;
      var tag = document.createElement('script');
      tag.src = SC.files[i];
      document.head.appendChild(tag);
    }
    // Presented positions, as in the full explorer: anchored on the selected cube A,
    // presented = A + (1 + slope) * (true - A) + offset, per axis. w holds the 18 position
    // channels: goal, goal slope, object, object slope, hand, hand slope (x, y, z each).
    function present(sf, atom, w) {
      var A = sf[atom], G = sf[D.n_obj + atom], ee = sf[2 * D.n_obj];
      var jaw = [ee[0], ee[1], ee[2] - SC.ee_z_offset];
      function map(t, off, slope) { return [0, 1, 2].map(function (d) { return A[d] + (1 + w[slope + d]) * (t[d] - A[d]) + w[off + d]; }); }
      return { goal: map(G, 0, 3), obj: map(A, 6, 9), ee: map(jaw, 12, 15), jaw: jaw, anchor: A.slice(), trueGoal: G.slice() };
    }
    function sampleW(scn, t, base) {
      var w = base.slice();
      for (var c = 0; c < 18; c++) {
        var off = (t * 18 + c) * NB, mask = SC.mask[c], p = new Float64Array(NB), sum = 0;
        for (var b = 0; b < NB; b++) { if (!mask[b]) continue; p[b] = Math.exp(scn.logits[off + b] / temp); sum += p[b]; }
        var r = Math.random() * sum, acc = 0, pick = 0;
        for (b = 0; b < NB; b++) { acc += p[b]; if (r <= acc && p[b] > 0) { pick = b; break; } }
        w[c] = SC.bins[c][pick];
      }
      return w;
    }
    function bounds(scn) {
      if (scn._bd) return scn._bd;
      var lo = [9, 9, 9], hi = [-9, -9, -9];
      scn.frames.forEach(function (sf) {
        var ee = sf[2 * D.n_obj];
        sf.slice(0, 2 * D.n_obj).concat([[ee[0], ee[1], ee[2] - SC.ee_z_offset]]).forEach(function (p) {
          for (var d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p[d]); hi[d] = Math.max(hi[d], p[d]); }
        });
      });
      for (var d = 0; d < 3; d++) { var pad = 0.1 * (hi[d] - lo[d]) + 0.06; lo[d] -= pad; hi[d] += pad; }
      return (scn._bd = { lo: lo, hi: hi });
    }
    function drawScene() {
      var scn = SCENES[ep];
      var dpr = window.devicePixelRatio || 1, Wc = canvas.clientWidth || 500, Hc = Math.round(Wc * 0.62);
      if (canvas.width !== Math.round(Wc * dpr) || canvas.height !== Math.round(Hc * dpr)) {
        canvas.width = Math.round(Wc * dpr); canvas.height = Math.round(Hc * dpr);
      }
      canvas.style.height = Hc + 'px';
      var cx = canvas.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, Wc, Hc);
      var css = getComputedStyle(root);
      function col(n) { return css.getPropertyValue(n).trim(); }
      if (!scn) {
        cx.fillStyle = col('--sc-muted'); cx.font = '12px sans-serif';
        cx.fillText('Loading the scene\u2026', 12, 24);
        return;
      }
      var f = frames[k], sf = scn.frames[k], atom = f[1], w = scn.w[k], sat = scn.sat[k];
      var bd = bounds(scn), half = SC.cube_half, gap = 12, vw = (Wc - gap) / 2;
      var views = [{ x0: 0, dx: 0, dy: 2, title: 'SIDE  x\u2013z' }, { x0: vw + gap, dx: 0, dy: 1, title: 'TOP  x\u2013y' }];
      views.forEach(function (v) {
        var lox = bd.lo[v.dx], hix = bd.hi[v.dx], loy = bd.lo[v.dy], hiy = bd.hi[v.dy];
        var sc_ = Math.min(vw / (hix - lox), (Hc - 30) / (hiy - loy));
        var ox = v.x0 + (vw - sc_ * (hix - lox)) / 2, oy = 22 + ((Hc - 30) - sc_ * (hiy - loy)) / 2;
        v.P = function (p) { return [ox + (p[v.dx] - lox) * sc_, oy + (hiy - p[v.dy]) * sc_]; };
        v.s = sc_;
        cx.fillStyle = col('--sc-field'); cx.fillRect(v.x0, 0, vw, Hc);
        cx.strokeStyle = col('--sc-rule'); cx.lineWidth = 1; cx.strokeRect(v.x0 + 0.5, 0.5, vw - 1, Hc - 1);
        cx.fillStyle = col('--sc-muted'); cx.font = '10px ui-monospace, Menlo, monospace';
        cx.fillText(v.title, v.x0 + 8, 14);
      });
      function dot(v, p, r, fill, stroke, alpha) {
        var q = v.P(p); cx.globalAlpha = alpha == null ? 1 : alpha;
        cx.beginPath(); cx.arc(q[0], q[1], r, 0, 6.2832);
        if (fill) { cx.fillStyle = fill; cx.fill(); }
        if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = 1.5; cx.stroke(); }
        cx.globalAlpha = 1;
      }
      function seg(v, a, b, c, lw, dash) {
        var p = v.P(a), q = v.P(b); cx.save(); cx.setLineDash(dash || []);
        cx.strokeStyle = c; cx.lineWidth = lw || 1.5;
        cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(q[0], q[1]); cx.stroke(); cx.restore();
      }
      function poly(v, pts, c, lw, alpha) {
        if (pts.length < 2) return; cx.globalAlpha = alpha == null ? 1 : alpha;
        cx.strokeStyle = c; cx.lineWidth = lw || 1.2; cx.beginPath();
        var a = v.P(pts[0]); cx.moveTo(a[0], a[1]);
        for (var i = 1; i < pts.length; i++) { var q = v.P(pts[i]); cx.lineTo(q[0], q[1]); }
        cx.stroke(); cx.globalAlpha = 1;
      }
      var cur = present(sf, atom, w), cands = [];
      for (var s_ = 0; s_ < nCand; s_++) cands.push(present(sf, atom, sampleW(scn, k, w)));
      if (show.full && !scn._path) {
        scn._path = {
          g: scn.frames.map(function (x, i) { return present(x, frames[i][1], scn.w[i]).goal; }),
          o: scn.frames.map(function (x, i) { return x[frames[i][1]]; }),
        };
      }
      var C = { true_: col('--sc-true'), goal: col('--sc-goal'), obj: col('--sc-obj'), ee: col('--sc-ee'),
                warp: col('--sc-warp'), sat: col('--sc-sat'), field: col('--sc-field'), ink2: col('--sc-ink2') };
      views.forEach(function (v) {
        // Keep each view's drawing inside its own frame (a presented point can lie far off-scene).
        cx.save();
        cx.beginPath(); cx.rect(v.x0 + 1, 1, vw - 2, Hc - 2); cx.clip();
        if (show.full) { poly(v, scn._path.g, C.goal, 1, 0.22); poly(v, scn._path.o, C.true_, 1, 0.22); }
        for (var i = 0; i < D.n_obj; i++) dot(v, sf[D.n_obj + i], Math.max(3, half * v.s * 0.8), null, C.true_, 0.5);
        for (i = 0; i < D.n_obj; i++) {
          var placed = sat[i] === 1;
          dot(v, sf[i], Math.max(4, half * v.s), placed ? C.sat : null, C.true_, placed ? 0.38 : 0.95);
          if (i === atom) dot(v, sf[i], Math.max(4, half * v.s) + 4, null, C.ink2, 0.75);
        }
        dot(v, cur.jaw, 6, null, C.true_, 0.95);
        var a = Math.min(0.5, 14 / Math.max(cands.length, 1));
        cands.forEach(function (c) {
          dot(v, c.goal, 1.9, C.goal, null, a); dot(v, c.obj, 1.9, C.obj, null, a); dot(v, c.ee, 1.9, C.ee, null, a);
        });
        if (show.trail) {
          var tr = [];
          for (var t = Math.max(0, k - 26); t <= k; t++) tr.push(present(scn.frames[t], frames[t][1], scn.w[t]));
          poly(v, tr.map(function (x) { return x.goal; }), C.goal, 2, 0.55);
          poly(v, tr.map(function (x) { return x.ee; }), C.ee, 2, 0.45);
        }
        if (show.warp) {
          seg(v, cur.trueGoal, cur.goal, C.warp, 1.6, [4, 3]);
          seg(v, cur.jaw, cur.ee, C.warp, 1.6, [4, 3]);
          seg(v, cur.anchor, cur.obj, C.warp, 1.6, [4, 3]);
        }
        dot(v, cur.goal, 6.5, C.goal, C.field, 1);
        dot(v, cur.obj, 5.5, C.obj, C.field, 1);
        dot(v, cur.ee, 5.5, C.ee, C.field, 1);
        cx.restore();
      });
    }
    window.addEventListener('resize', function () { drawScene(); });
    document.addEventListener('themechange', function () { drawScene(); });

    function render() {
      var f = frames[k];
      var placed = f[0], cube = f[1] + 1;
      readout.innerHTML = 'Decision <b>' + (k + 1) + '</b> / ' + frames.length +
        ' &nbsp;·&nbsp; <b>' + placed + '</b> of ' + D.n_obj + ' cubes placed' +
        (placed < D.n_obj ? ' &nbsp;·&nbsp; working on cube <b>' + cube + '</b>' + (f[2] ? ', carrying it' : '') : ' &nbsp;·&nbsp; <b>done</b>');
      inRows.concat(outRows).forEach(function (r, i) {
        var v = f[SH + i];
        r.fill.style.width = v + '%';
        r.val.textContent = v + '%';
      });
      actRows.forEach(function (r, i) {
        place(r.skill, f[ACT + i]);
        place(r.warped, f[ACT + nAct + i]);
      });
      drawScene();
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
      loadScene(i);
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
        var i = Math.min(frames.length - 1, Math.floor(video.currentTime * D.fps));
        if (i !== k) { k = i; render(); }
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
