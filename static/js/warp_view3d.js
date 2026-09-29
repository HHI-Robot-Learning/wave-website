// Interactive 3-D view for the Warp Explorer section (three.js). It draws a recorded episode of the
// selected task (static/js/warp_tasks/<task>.js): the arena, the cubes at their recorded poses,
// their goals, the robot driven by its recorded joints, and the warp as the presented goal /
// object (/ jaws) with dashed lines from the true positions. World frame: z up, metres.
// Geometry follows the scene files of the training repository (26-MOGB, commit 32aaf30):
//   gantry   scenes/gripper_cube_stack_wide{,30}_heavy_gantry.yml + _gripper_robot.yml; as in the
//            renderer the gantry's links have no geometry, so only the jaws are drawn
//   Panda    scenes/panda_cube_stack.yml / panda_push.yml + _panda_{gripper,pusher}_robot.yml, with
//            the arm's kinematic chain and link meshes of rai-robotModels/panda
//            (static/js/panda_meshes.js, built by scripts/build_panda_meshes.py)
(function () {
  'use strict';

  var MESH_FILE = 'static/js/panda_meshes.js';

  // Arenas: boxes as [center, full size, rgb, opacity]; camera as [position, target].
  var WALL = [0.55, 0.45, 0.35], GLASS = [0.6, 0.6, 0.65], WOOD = [0.45, 0.35, 0.25], TABLE = [0.55, 0.45, 0.35];
  var SCENES = {
    gantry_wide: {
      boxes: [[[0, 0, 0.1], [4, 4, 0.1], WOOD, 1],
              [[1.53, 0, 0.32], [0.06, 3.12, 0.3], WALL, 0.35], [[-1.53, 0, 0.32], [0.06, 3.12, 0.3], WALL, 0.35],
              [[0, 1.53, 0.32], [2.98, 0.06, 0.3], WALL, 0.35], [[0, -1.53, 0.32], [2.98, 0.06, 0.3], WALL, 0.35]],
      camera: [[0, -3.9, 3.3], [0, -0.05, 0.2]], fov: 38, span: 2.5,
    },
    gantry_wide30: {
      boxes: [[[0, 0, 0.1], [6.6, 6.6, 0.1], WOOD, 1],
              [[2.83, 0, 0.32], [0.06, 5.72, 0.3], WALL, 0.35], [[-2.83, 0, 0.32], [0.06, 5.72, 0.3], WALL, 0.35],
              [[0, 2.83, 0.32], [5.58, 0.06, 0.3], WALL, 0.35], [[0, -2.83, 0.32], [5.58, 0.06, 0.3], WALL, 0.35]],
      camera: [[0, -7.0, 5.9], [0, -0.1, 0.2]], fov: 38, span: 4.2,
    },
    panda_stack: {
      boxes: [[[0.475, 0, -0.05], [0.55, 0.70, 0.10], TABLE, 1], [[0, 0, -0.06], [0.18, 0.18, 0.12], [0.35, 0.35, 0.38], 1],
              [[0.19, 0, 0.10], [0.02, 0.74, 0.20], GLASS, 0.25], [[0.76, 0, 0.10], [0.02, 0.74, 0.20], GLASS, 0.25],
              [[0.475, -0.36, 0.10], [0.59, 0.02, 0.20], GLASS, 0.25], [[0.475, 0.36, 0.10], [0.59, 0.02, 0.20], GLASS, 0.25]],
      camera: [[0.52, -0.88, 0.78], [0.42, 0.02, 0.12]], fov: 45, span: 0.9, base: [0, 0, 0],
    },
    panda_push: {
      boxes: [[[-0.30, 0.14, 0.10], [1.10, 1.12, 0.1], TABLE, 1],
              [[-0.80, -0.1625, 0.195], [0.02, 0.445, 0.08], GLASS, 0.25], [[0.20, -0.1625, 0.195], [0.02, 0.445, 0.08], GLASS, 0.25],
              [[-0.30, -0.375, 0.195], [0.97, 0.02, 0.08], GLASS, 0.25], [[-0.30, 0.05, 0.195], [0.97, 0.02, 0.08], GLASS, 0.25]],
      camera: [[-0.25, -1.15, 1.0], [-0.30, -0.05, 0.2]], fov: 45, span: 1.2, base: [-0.34, 0.4, 0.161],
    },
  };

  // Panda arm, from rai-robotModels/panda/panda_arm_hand_conv.yml: per joint the origin relative to
  // the previous joint frame (position, quaternion w x y z), then a hinge about the local z axis.
  var R2 = 0.7071067811882787, R2b = 0.7071067811848163;
  var PANDA_CHAIN = [
    [[0, 0, 0.333], [1, 0, 0, 0], 'link1'],
    [[0, 0, 0], [R2, -R2b, 0, 0], 'link2'],
    [[0, -0.316, 0], [R2, R2b, 0, 0], 'link3'],
    [[0.0825, 0, 0], [R2, R2b, 0, 0], 'link4'],
    [[-0.0825, 0.384, 0], [R2, -R2b, 0, 0], 'link5'],
    [[0, 0, 0], [R2, R2b, 0, 0], 'link6'],
    [[0.088, 0, 0], [R2, R2b, 0, 0], 'link7'],
  ];

  // Cube colors of the scene generator: evenly spaced hues, saturation 0.85, value 0.9.
  function cubeColor(i, n) {
    var hh = i / Math.max(n, 1), sat = 0.85, v = 0.9;
    var f = function (k) { var kk = (k + hh * 6) % 6; return v - v * sat * Math.max(0, Math.min(kk, 4 - kk, 1)); };
    return new THREE.Color(f(5), f(3), f(1));
  }
  function quat(q) { return new THREE.Quaternion(q[1], q[2], q[3], q[0]); }

  var meshData = null, meshWaiting = [];
  function loadMeshes(cb) {
    if (meshData) { cb(); return; }
    meshWaiting.push(cb);
    if (meshWaiting.length > 1) return;
    var tag = document.createElement('script');
    tag.src = MESH_FILE;
    tag.onload = function () {
      meshData = window.PANDA_MESHES;
      meshWaiting.forEach(function (f) { f(); });
      meshWaiting = [];
    };
    document.head.appendChild(tag);
  }
  function b64(str, Type) {
    var bin = atob(str), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Type(u.buffer);
  }
  var geoCache = {};
  function pandaMesh(name) {
    var g = geoCache[name];
    if (!g) {
      var m = meshData.meshes[name], scale = meshData.scale;
      var v = b64(m.v, Int16Array), pos = new Float32Array(v.length);
      for (var i = 0; i < v.length; i++) pos[i] = v[i] * scale;
      var c = b64(m.c, Uint8Array), col = new Float32Array(c.length);
      for (i = 0; i < c.length; i++) col[i] = c[i] / 255;
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(b64(m.f, Uint16Array), 1));
      g.computeVertexNormals();
      g.userData.shared = true;  // cached across tasks, never disposed
      geoCache[name] = g;
    }
    var mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    mesh.castShadow = true;
    return mesh;
  }

  function WarpView3D(container) {
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1.5, 0.01, 60);
    camera.up.set(0, 0, 1);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5b4b, 0.75));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun); scene.add(sun.target);

    var world = null, S = null, T = null, poses = null, overlayOn = true, HOME = null, cur = { k: 0, t: 0 };

    function box(size, color, opacity) {
      var m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8, metalness: 0.0,
        transparent: opacity < 1, opacity: opacity });
      return new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    }
    function rgb(c) { return new THREE.Color(c[0], c[1], c[2]); }

    function build(task, ready) {
      if (world) {
        scene.remove(world);
        world.traverse(function (o) {
          if (o.material) o.material.dispose();
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        });
      }
      world = new THREE.Group(); scene.add(world);
      T = task;
      var cfg = SCENES[task.scene], n = task.n_obj, edge = 2 * task.cube_half;
      S = { cfg: cfg, cubes: [], goals: [], robot: null };

      cfg.boxes.forEach(function (b) {
        var m = box(b[1], rgb(b[2]), b[3]);
        m.position.fromArray(b[0]);
        m.receiveShadow = b[3] === 1;
        world.add(m);
      });
      for (var i = 0; i < n; i++) {
        var col = cubeColor(i, n);
        var c = box([edge, edge, edge], col, 1); c.castShadow = true; c.receiveShadow = true;
        world.add(c); S.cubes.push(c);
        var g = box([edge, edge, edge], col, 0.18);
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry),
          new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 })));
        world.add(g); S.goals.push(g);
      }

      // Warp overlay, drawn on top: the presented points usually lie inside the true cube or
      // between the jaws, since a warp moves them by only a few centimetres.
      S.overlay = new THREE.Group(); S.overlay.visible = overlayOn; world.add(S.overlay);
      var r = 0.75 * task.cube_half;
      function marker(color) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 24, 16),
          new THREE.MeshBasicMaterial({ color: color, depthTest: false, depthWrite: false }));
        var ring = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, side: THREE.BackSide }));
        ring.renderOrder = 10; m.renderOrder = 11; m.add(ring);
        S.overlay.add(m); return m;
      }
      function dashed(color) {
        var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        var l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: color, dashSize: r, gapSize: 0.7 * r,
          depthTest: false, depthWrite: false }));
        l.renderOrder = 12; S.overlay.add(l); return l;
      }
      S.mGoal = marker(0xd98324); S.mObj = marker(0x4a6fa5); S.lGoal = dashed(0xb5453a); S.lObj = dashed(0xb5453a);
      if (task.ee_point) { S.mJaw = marker(0x2f8f6b); S.lJaw = dashed(0xb5453a); }

      // camera, light and shadow frustum sized to the arena
      HOME = { pos: new THREE.Vector3().fromArray(cfg.camera[0]), target: new THREE.Vector3().fromArray(cfg.camera[1]) };
      camera.fov = cfg.fov; camera.near = cfg.span * 0.004; camera.far = cfg.span * 30; camera.updateProjectionMatrix();
      var span = cfg.span;
      controls.minDistance = span * 0.25; controls.maxDistance = span * 6;
      sun.position.set(HOME.target.x + span, HOME.target.y - 1.2 * span, HOME.target.z + 2.4 * span);
      sun.target.position.copy(HOME.target);
      var sc = sun.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 0.05 * span; sc.far = 6 * span; sc.updateProjectionMatrix();
      resetView();

      if (task.robot === 'gantry') {
        buildGantry(); if (ready) ready();
      } else {
        loadMeshes(function () { if (T === task) { buildPanda(task.robot); pose(cur.k, cur.t); if (ready) ready(); } });
      }
    }

    // Gantry: carriage -> wrist (roll, pitch, yaw hinges) -> two jaws sliding along the wrist's y.
    function buildGantry() {
      var carriage = new THREE.Group(); world.add(carriage);
      var wrist = new THREE.Group(); carriage.add(wrist);
      var jawL = box([0.12, 0.02, 0.18], rgb([0, 0.85, 0.85]), 1), jawR = box([0.12, 0.02, 0.18], rgb([0, 0.85, 0.85]), 1);
      jawL.castShadow = jawR.castShadow = true;
      wrist.add(jawL); wrist.add(jawR);
      S.robot = function (q) {
        carriage.position.set(q[0], q[1], 0.5 + q[2]);
        wrist.rotation.set(q[3], q[4], q[5], 'XYZ');  // hinge X, then Y, then Z (stacked wrist)
        jawL.position.set(0, q[6], 0); jawR.position.set(0, q[7], 0);
        return [q[0], q[1], 0.5 + q[2]];
      };
    }

    // Panda: base -> seven hinges -> flange; the gripper carries the hand and two jaw pads, the
    // pusher a rod with a ball (hand and fingers hidden, as in its scene file).
    function buildPanda(kind) {
      var base = new THREE.Group(); base.position.fromArray(S.cfg.base); world.add(base);
      base.add(pandaMesh('link0'));
      var parent = base, hinges = [];
      PANDA_CHAIN.forEach(function (j) {
        var origin = new THREE.Group();
        origin.position.fromArray(j[0]); origin.quaternion.copy(quat(j[1]));
        parent.add(origin);
        var hinge = new THREE.Group(); origin.add(hinge);
        hinge.add(pandaMesh(j[2]));
        hinges.push(hinge); parent = hinge;
      });
      var flange = new THREE.Group(); flange.position.set(0, 0, 0.107); parent.add(flange);
      var jaws = [], tool = new THREE.Group();
      if (kind === 'panda_gripper') {
        var hand = new THREE.Group(); hand.quaternion.copy(quat([0.9238795325113726, 0, 0, -0.38268343236488267]));
        flange.add(hand);
        hand.add(pandaMesh('hand'));
        var tip = new THREE.Group(); tip.position.set(0, 0, 0.0584); hand.add(tip);
        tip.add(pandaMesh('finger'));
        var f2 = pandaMesh('finger'); f2.quaternion.copy(quat([0, 0, 0, 1])); tip.add(f2);
        [0, 1].forEach(function () {
          var p = box([0.022, 0.008, 0.036], rgb([0, 0.85, 0.85]), 1); p.castShadow = true; tip.add(p); jaws.push(p);
        });
        tip.add(tool);
      } else {
        var rod = box([0.022, 0.022, 0.268], rgb([0.15, 0.15, 0.17]), 1);
        rod.position.set(0, 0, 0.145); rod.castShadow = true; flange.add(rod);
        var ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16),
          new THREE.MeshStandardMaterial({ color: rgb([0.1, 0.3, 0.9]), roughness: 0.5 }));
        ball.position.set(0, 0, 0.3); ball.castShadow = true; flange.add(ball);
        ball.add(tool);
      }
      var tipWorld = new THREE.Vector3();
      S.robot = function (q) {
        for (var i = 0; i < 7; i++) hinges[i].rotation.set(0, 0, q[i]);
        if (jaws.length && q.length > 8) { jaws[0].position.set(0, q[7], 0); jaws[1].position.set(0, q[8], 0); }
        tool.updateWorldMatrix(true, false);
        return tool.getWorldPosition(tipWorld).toArray();
      };
    }

    // ── pose at a (fractional) decision ──
    var q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpAll(a, b, t) { return a.map(function (x, i) { return lerp(x, b[i], t); }); }
    function setLine(l, a, b) {
      var p = l.geometry.attributes.position;
      p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
      l.geometry.computeBoundingSphere(); l.computeLineDistances();
    }
    function pose(k, t) {
      if (!poses || !S || !S.robot) return;
      var n = poses.length, a = poses[Math.max(0, Math.min(n - 1, k))], b = poses[Math.max(0, Math.min(n - 1, k + 1))];
      if (!(t > 0)) { b = a; t = 0; }
      var NR = T.n_robot, qa = a.q, qb = b.q, q = [];
      for (var j = 0; j < NR; j++) q.push(lerp(qa[j], qb[j], t));
      var jaw = S.robot(q);
      for (var i = 0; i < T.n_obj; i++) {
        var o = NR + 7 * i;
        S.cubes[i].position.set(lerp(qa[o], qb[o], t), lerp(qa[o + 1], qb[o + 1], t), lerp(qa[o + 2], qb[o + 2], t));
        q1.set(qa[o + 4], qa[o + 5], qa[o + 6], qa[o + 3]);  // recorded as w, x, y, z
        q2.set(qb[o + 4], qb[o + 5], qb[o + 6], qb[o + 3]);
        S.cubes[i].quaternion.copy(q1).slerp(q2, t);
        S.goals[i].position.fromArray(a.g[i]);
        S.goals[i].visible = !a.s[i];  // a placed cube covers its goal
      }
      // presented points (goal, object[, jaws]) and the true points they are warped from
      var p = lerpAll(a.p, b.p, t), atom = a.a;
      S.mGoal.position.fromArray(p.slice(0, 3)); S.mObj.position.fromArray(p.slice(3, 6));
      setLine(S.lGoal, a.g[atom], p.slice(0, 3));
      setLine(S.lObj, S.cubes[atom].position.toArray(), p.slice(3, 6));
      if (S.mJaw && p.length >= 9) { S.mJaw.position.fromArray(p.slice(6, 9)); setLine(S.lJaw, jaw, p.slice(6, 9)); }
    }

    (function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();

    function resize() {
      var w = container.clientWidth || 600, hgt = Math.round(w / 1.487);
      renderer.setSize(w, hgt);
      camera.aspect = w / hgt; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    function setTheme() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      scene.background = new THREE.Color(dark ? 0x10141a : 0xe9edf1);
    }
    document.addEventListener('themechange', setTheme);
    setTheme();

    function resetView() {
      if (!HOME) return;
      camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update();
    }

    return {
      setTask: function (task, ready) { poses = null; build(task, ready); },
      setEpisode: function (p) { poses = p; cur = { k: 0, t: 0 }; pose(0, 0); },
      setTime: function (k, t) { cur.k = k; cur.t = t || 0; pose(cur.k, cur.t); },
      setOverlay: function (on) { overlayOn = on; if (S && S.overlay) S.overlay.visible = on; },
      resetView: resetView,
      resize: resize,
    };
  }

  window.WarpView3D = WarpView3D;
})();
