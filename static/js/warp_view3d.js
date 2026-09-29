// Interactive 3-D view for the Warp Explorer section (three.js). It draws the recorded scene of
// scripts/build_warp_data.py (static/js/warp_3d/ep<i>.js): the arena, the cubes at their recorded
// poses, their goals, the gantry's jaws driven by the recorded joints, and the warp as the presented
// goal / object / jaws with dashed lines to the true positions. Geometry follows the scene file
// scenes/gripper_cube_stack_wide_heavy_gantry.yml of the training repository; as in the renderer,
// the gantry's links have no geometry, so only the jaws are drawn. World frame: z up, metres.
(function () {
  'use strict';

  var CUBE = 0.16;
  var JAW = [0.12, 0.02, 0.18];
  var BASE_Z = 0.5;          // gantry base height; carriage world z = BASE_Z + q[2]
  var FLOOR_TOP = 0.15;

  // Cube colors of the scene generator: evenly spaced hues, saturation 0.85, value 0.9.
  function cubeColor(i, n) {
    var c = new THREE.Color();
    var h = i / Math.max(n, 1), s = 0.85, v = 0.9;
    var f = function (k) { var kk = (k + h * 6) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
    c.setRGB(f(5), f(3), f(1));
    return c;
  }

  function WarpView3D(container, D) {
    var V = D.view3d, nObj = D.n_obj, NR = V.n_robot;
    var episodes = [], waiting = {}, ep = -1, onReady = null;

    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    // Framed like the rendered video: looking down on the arena from the front.
    var camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 50);
    camera.up.set(0, 0, 1);
    var HOME = { pos: new THREE.Vector3(0, -3.9, 3.3), target: new THREE.Vector3(0, -0.05, 0.2) };
    camera.position.copy(HOME.pos);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME.target);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1.2;
    controls.maxDistance = 12;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5b4b, 0.75));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(2.5, -3, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -2.5; sc.right = 2.5; sc.top = 2.5; sc.bottom = -2.5; sc.near = 1; sc.far = 15;
    scene.add(sun);

    function box(size, color, opacity) {
      var m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8, metalness: 0.0,
        transparent: opacity < 1, opacity: opacity });
      return new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    }

    // Arena: floor and the four walls of the scene file.
    var floor = box([4, 4, 0.1], new THREE.Color(0.45, 0.35, 0.25), 1);
    floor.position.set(0, 0, 0.1); floor.receiveShadow = true; scene.add(floor);
    var wallColor = new THREE.Color(0.55, 0.45, 0.35);
    [[[1.53, 0, 0.32], [0.06, 3.12, 0.3]], [[-1.53, 0, 0.32], [0.06, 3.12, 0.3]],
     [[0, 1.53, 0.32], [2.98, 0.06, 0.3]], [[0, -1.53, 0.32], [2.98, 0.06, 0.3]]].forEach(function (w) {
      var m = box(w[1], wallColor, 0.35); m.position.set(w[0][0], w[0][1], w[0][2]); scene.add(m);
    });

    // Cubes and their goals (translucent, with edges).
    var cubes = [], goals = [];
    for (var i = 0; i < nObj; i++) {
      var col = cubeColor(i, nObj);
      var c = box([CUBE, CUBE, CUBE], col, 1); c.castShadow = true; c.receiveShadow = true;
      scene.add(c); cubes.push(c);
      var g = box([CUBE, CUBE, CUBE], col, 0.18);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 })));
      scene.add(g); goals.push(g);
    }

    // Gantry: carriage -> wrist (roll, pitch, yaw hinges) -> two jaws sliding along the wrist's y.
    var carriage = new THREE.Group(); scene.add(carriage);
    var wrist = new THREE.Group(); carriage.add(wrist);
    var jawColor = new THREE.Color(0, 0.85, 0.85);
    var jawL = box(JAW, jawColor, 1), jawR = box(JAW, jawColor, 1);
    jawL.castShadow = jawR.castShadow = true;
    wrist.add(jawL); wrist.add(jawR);

    // Warp overlay: presented goal / object / jaws and dashed lines from the true positions.
    var overlay = new THREE.Group(); scene.add(overlay);
    // The presented points usually lie inside the true cube or between the jaws (the warp is a
    // few centimetres), so the overlay ignores depth and is drawn after everything else.
    function marker(color) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16),
        new THREE.MeshBasicMaterial({ color: color, depthTest: false, depthWrite: false }));
      var ring = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, side: THREE.BackSide }));
      ring.renderOrder = 10; m.renderOrder = 11; m.add(ring);
      overlay.add(m); return m;
    }
    function dashed(color) {
      var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      var l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: color, dashSize: 0.05, gapSize: 0.035,
        depthTest: false, depthWrite: false }));
      l.renderOrder = 12;
      overlay.add(l); return l;
    }
    var mGoal = marker(0xd98324), mObj = marker(0x4a6fa5), mJaw = marker(0x2f8f6b);
    var lGoal = dashed(0xb5453a), lObj = dashed(0xb5453a), lJaw = dashed(0xb5453a);
    function setLine(l, a, b) {
      var p = l.geometry.attributes.position;
      p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
      l.geometry.computeBoundingSphere(); l.computeLineDistances();
    }

    // ── pose at a (fractional) decision ──
    var tmpQ1 = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpAll(a, b, t) { return a.map(function (x, i) { return lerp(x, b[i], t); }); }
    function pose(k, t) {
      var E = episodes[ep];
      if (!E) return;
      var n = E.length, a = E[Math.max(0, Math.min(n - 1, k))], b = E[Math.max(0, Math.min(n - 1, k + 1))];
      if (!(t > 0)) { b = a; t = 0; }
      var qa = a.q, qb = b.q, q = [];
      for (var j = 0; j < NR; j++) q.push(lerp(qa[j], qb[j], t));
      carriage.position.set(q[0], q[1], BASE_Z + q[2]);
      wrist.rotation.set(q[3], q[4], q[5], 'XYZ');  // hinge X, then Y, then Z (stacked wrist)
      jawL.position.set(0, q[6], 0); jawR.position.set(0, q[7], 0);
      for (var i = 0; i < nObj; i++) {
        var o = NR + 7 * i;
        cubes[i].position.set(lerp(qa[o], qb[o], t), lerp(qa[o + 1], qb[o + 1], t), lerp(qa[o + 2], qb[o + 2], t));
        tmpQ1.set(qa[o + 4], qa[o + 5], qa[o + 6], qa[o + 3]);  // recorded as w, x, y, z
        tmpQ2.set(qb[o + 4], qb[o + 5], qb[o + 6], qb[o + 3]);
        cubes[i].quaternion.copy(tmpQ1).slerp(tmpQ2, t);
        var gp = a.g[i];
        goals[i].position.set(gp[0], gp[1], gp[2]);
        goals[i].visible = !a.s[i];  // a placed cube covers its goal
      }
      // presented points and the true points they are warped from
      var p = lerpAll(a.p, b.p, t), pg = p.slice(0, 3), po = p.slice(3, 6), pj = p.slice(6, 9);
      var atom = D.episodes[ep].frames[Math.max(0, Math.min(n - 1, k))][1];
      var trueObj = cubes[atom].position.toArray(), trueGoal = a.g[atom];
      var trueJaw = [q[0], q[1], BASE_Z + q[2]];
      mGoal.position.fromArray(pg); mObj.position.fromArray(po); mJaw.position.fromArray(pj);
      setLine(lGoal, trueGoal, pg); setLine(lObj, trueObj, po); setLine(lJaw, trueJaw, pj);
    }

    var cur = { k: 0, t: 0 };
    function draw() {
      controls.update();
      renderer.render(scene, camera);
    }
    (function loop() { draw(); requestAnimationFrame(loop); })();

    function resize() {
      var w = container.clientWidth || 600, h = Math.round(w / 1.487);
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    function setTheme() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      scene.background = new THREE.Color(dark ? 0x10141a : 0xe9edf1);
    }
    document.addEventListener('themechange', setTheme);
    setTheme();

    window.WARP_3D_LOADED = function (i, data) {
      episodes[i] = data;
      if (i === ep) { pose(cur.k, cur.t); if (onReady) onReady(); }
    };

    return {
      setEpisode: function (i, ready) {
        ep = i; onReady = ready || null;
        if (episodes[i]) { pose(0, 0); return; }
        if (!waiting[i]) {
          waiting[i] = true;
          var tag = document.createElement('script');
          tag.src = V.files[i];
          document.head.appendChild(tag);
        }
      },
      setTime: function (k, t) { cur.k = k; cur.t = t || 0; pose(cur.k, cur.t); },
      setOverlay: function (on) { overlay.visible = on; },
      resetView: function () { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update(); },
      resize: resize,
      isReady: function () { return !!episodes[ep]; },
    };
  }

  window.WarpView3D = WarpView3D;
})();
