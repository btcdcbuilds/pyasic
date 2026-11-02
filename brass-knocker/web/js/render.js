/* The Brass Knocker — canvas rendering, lighting, NPCs, input and sound. */
"use strict";
(function () {
  var U = BK.util, WD = BK.world, T = WD.T;
  var R = BK.render = {};
  var cv, ctx, dark, dctx, dpr = 1, Z = 3, camX = 0, camY = 0;
  var mv = null;                // current tile move {fx,fy,tx,ty,t}
  var path = [];                // queued tile path from tap-to-move
  var pendingTarget = null;     // door/spot to interact with on arrival
  var held = { up: 0, down: 0, left: 0, right: 0 };
  var npcs = [], smoke = [], fog = [];
  var last = 0, clock = 0, copCool = 0;
  var STEP_TIME = 0.14;
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function S() { return BK.game.state(); }

  /* ---------------- sound (synthesized, no files) ---------------- */
  var ac = null, muted = false;
  try { muted = localStorage.getItem("brassknocker.mute") === "1"; } catch (e) { /* ignore */ }
  function audio() {
    if (muted) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, start, dur, type, vol, slideTo) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, a.currentTime + start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + start + dur);
    g.gain.setValueAtTime(0.0001, a.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, a.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
  }
  function thud(start, vol) {
    var a = audio(); if (!a) return;
    var len = Math.floor(a.sampleRate * 0.12), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = a.createBufferSource(); src.buffer = buf;
    var f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    var g = a.createGain(); g.gain.value = vol || 0.6;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(a.currentTime + start);
    tone(110, start, 0.15, "sine", (vol || 0.6) * 0.5, 60);
    tone(1900, start, 0.25, "triangle", 0.02); // brass ring
  }
  BK.sfx = {
    knock: function (style) {
      if (style === "secret") { thud(0, 0.5); thud(0.12, 0.5); thud(0.5, 0.6); }
      else if (style === "firm") { thud(0, 0.9); thud(0.22, 0.9); thud(0.44, 0.9); }
      else { thud(0, 0.45); thud(0.3, 0.45); thud(0.6, 0.45); }
    },
    blip: function () { tone(660, 0, 0.05, "square", 0.04); },
    coin: function () { tone(1250, 0, 0.08, "square", 0.05); tone(1700, 0.07, 0.12, "square", 0.05); },
    clue: function () { tone(523, 0, 0.12, "triangle", 0.12); tone(659, 0.1, 0.12, "triangle", 0.12); tone(784, 0.2, 0.2, "triangle", 0.12); },
    evidence: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.3, "triangle", 0.14); }); },
    hit: function () { thud(0, 0.7); },
    hurt: function () { tone(200, 0, 0.2, "sawtooth", 0.08, 90); },
    alarm: function () { tone(1800, 0, 0.25, "sine", 0.06, 2300); tone(1800, 0.3, 0.3, "sine", 0.06, 2300); },
    level: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.25, "square", 0.05); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.15, 0.35, "triangle", 0.12); }); },
    bad: function () { tone(220, 0, 0.4, "sawtooth", 0.07, 110); tone(160, 0.35, 0.5, "sawtooth", 0.07, 80); },
    dawn: function () { tone(880, 0, 0.6, "sine", 0.05); tone(1320, 0.25, 0.8, "sine", 0.04); },
    toggle: function () { muted = !muted; try { localStorage.setItem("brassknocker.mute", muted ? "1" : "0"); } catch (e) { /* ignore */ } return !muted; },
    isOn: function () { return !muted; }
  };

  /* ---------------- setup ---------------- */
  R.init = function () {
    cv = document.getElementById("game");
    ctx = cv.getContext("2d");
    dark = document.createElement("canvas");
    dctx = dark.getContext("2d");
    WD.prerender();
    window.addEventListener("resize", resize);
    resize();
    spawnNpcs();
    for (var i = 0; i < 14; i++) fog.push({ x: Math.random() * WD.W * T, y: Math.random() * WD.H * T, r: 60 + Math.random() * 90, v: 4 + Math.random() * 8 });
    bindInput();
    requestAnimationFrame(frame);
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    dark.width = cv.width; dark.height = cv.height;
    Z = Math.max(1.5 * dpr, Math.min(cv.width / (19 * T), cv.height / (11 * T)));
  }

  R.snap = function () { mv = null; path = []; pendingTarget = null; };

  /* ---------------- NPCs ---------------- */
  function randomStreet() {
    for (var i = 0; i < 200; i++) {
      var x = Math.floor(Math.random() * WD.W), y = Math.floor(Math.random() * 49);
      var t = WD.get(x, y);
      if (t === WD.TILE.STREET || t === WD.TILE.PLAZA || t === WD.TILE.TOWPATH) return { x: x, y: y };
    }
    return { x: 0, y: 0 };
  }
  function spawnNpcs() {
    npcs = [];
    var coats = ["#4a3a2a", "#2a3a2a", "#3a2a3a", "#555", "#6a4a3a", "#2a2a4a"];
    for (var i = 0; i < 14; i++) {
      var p = randomStreet();
      npcs.push({ kind: i < 5 ? "cop" : "civ", x: p.x, y: p.y, fx: p.x, fy: p.y, path: [], t: 0, wait: Math.random() * 3, coat: coats[i % coats.length], hat: i % 3 });
    }
  }
  function updateNpcs(dt) {
    var s = S();
    npcs.forEach(function (n) {
      if (n.wait > 0) { n.wait -= dt; return; }
      if (!n.path.length) {
        var tgt = randomStreet();
        var far = Math.abs(tgt.x - n.x) + Math.abs(tgt.y - n.y);
        if (far > 30) { n.wait = 0.5; return; }
        n.path = WD.path(n.x, n.y, tgt.x, tgt.y) || [];
        n.wait = n.kind === "cop" ? 1 + Math.random() * 3 : Math.random() * 2;
        return;
      }
      var spd = n.kind === "cop" ? 2.2 : 1.8;
      n.t += dt * spd;
      if (n.t >= 1) {
        n.t = 0; var nx = n.path.shift(); n.x = nx.x; n.y = nx.y;
      }
    });
    if (!s || BK.ui.isOpen()) return;
    copCool -= dt;
    if (s.suspicion >= 50 && copCool <= 0) {
      for (var i = 0; i < npcs.length; i++) {
        var n = npcs[i];
        if (n.kind !== "cop") continue;
        var p = npcPos(n);
        if (Math.abs(p.x - s.px) + Math.abs(p.y - s.py) < 1.3) {
          copCool = 45; n.path = []; n.wait = 6;
          R.snap(); BK.game.constableStop();
          return;
        }
      }
    }
  }
  function npcPos(n) {
    if (!n.path.length) return { x: n.x, y: n.y };
    var nx = n.path[0];
    return { x: n.x + (nx.x - n.x) * n.t, y: n.y + (nx.y - n.y) * n.t };
  }

  /* ---------------- player movement ---------------- */
  function tryStep(dir) {
    var s = S(), d = DIRS[dir];
    s.facing = dir;
    var nx = s.px + d[0], ny = s.py + d[1];
    if (WD.isSolid(nx, ny)) return false;
    mv = { fx: s.px, fy: s.py, tx: nx, ty: ny, t: 0 };
    return true;
  }
  function heldDir() {
    if (held.up) return "up"; if (held.down) return "down"; if (held.left) return "left"; if (held.right) return "right"; return null;
  }
  function updatePlayer(dt) {
    var s = S();
    if (!s || BK.ui.isOpen() || s.over) return;
    if (mv) {
      mv.t += dt / STEP_TIME;
      if (mv.t >= 1) {
        s.px = mv.tx; s.py = mv.ty; mv = null;
        var interrupted = BK.game.onStep();
        BK.ui.hud();
        if (interrupted) { path = []; pendingTarget = null; return; }
        if (s.time >= BK.game.NIGHT_LEN) { path = []; pendingTarget = null; BK.game.afterModal(); return; }
        if (!path.length && pendingTarget && !heldDir()) {
          var tg = pendingTarget; pendingTarget = null;
          if (tg.door) s.facing = "up";
          BK.game.interact(tg);
          return;
        }
      } else return;
    }
    var hd = heldDir();
    if (hd) { path = []; pendingTarget = null; tryStep(hd); return; }
    if (path.length) {
      var nxt = path.shift();
      var dir = nxt.x > s.px ? "right" : nxt.x < s.px ? "left" : nxt.y > s.py ? "down" : "up";
      if (!tryStep(dir)) { path = []; pendingTarget = null; }
    }
  }

  /* what can the player interact with right now? */
  R.targetHere = function () {
    var s = S(); if (!s) return null;
    for (var i = 0; i < WD.doors.length; i++) { var d = WD.doors[i]; if (d.fx === s.px && d.fy === s.py) return { door: d }; }
    for (var j = 0; j < WD.spots.length; j++) {
      var sp = WD.spots[j];
      if (s.px >= sp.x - 1 && s.px <= sp.x + sp.w && s.py >= sp.y - 1 && s.py <= sp.y + sp.h) return { spot: sp };
    }
    return null;
  };
  function labelFor(t) {
    if (!t) return null;
    if (t.spot) return "Search";
    var d = t.door;
    if (d.kind === "home") return "Home";
    if (d.kind === "landmark") return "Enter";
    return "Knock";
  }
  R.act = function () {
    var s = S();
    if (!s || BK.ui.isOpen() || s.over || mv) return;
    var t = R.targetHere();
    if (t) { if (t.door) s.facing = "up"; BK.game.interact(t); }
    else BK.ui.toast("Nothing here. Walk up to a door and knock.");
  };

  /* ---------------- input ---------------- */
  function bindInput() {
    var keymap = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    window.addEventListener("keydown", function (e) {
      if (!S() || document.getElementById("title").classList.contains("show")) return;
      if (BK.ui.isOpen()) {
        if (e.key === "Escape") { BK.ui.close(); e.preventDefault(); }
        else if (/^[1-9]$/.test(e.key)) { BK.ui.pickByNumber(+e.key); e.preventDefault(); }
        return;
      }
      if (keymap[e.code]) { held[keymap[e.code]] = 1; e.preventDefault(); }
      else if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") { R.act(); e.preventDefault(); }
      else if (e.code === "KeyN" || e.code === "KeyJ") BK.ui.notebook();
      else if (e.code === "KeyB" || e.code === "KeyI") BK.ui.bag();
      else if (e.code === "KeyM") BK.ui.notebook("map");
      else if (e.code === "KeyH") BK.ui.help();
      else if (e.key === "Escape") BK.menu();
    });
    window.addEventListener("keyup", function (e) { if (keymap[e.code]) held[keymap[e.code]] = 0; });
    window.addEventListener("blur", function () { held.up = held.down = held.left = held.right = 0; });

    document.querySelectorAll("#dpad button").forEach(function (b) {
      var dir = b.getAttribute("data-dir");
      var on = function (e) { e.preventDefault(); held[dir] = 1; audio(); };
      var off = function (e) { e.preventDefault(); held[dir] = 0; };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    document.getElementById("btn-act").addEventListener("click", function () { audio(); R.act(); });

    cv.addEventListener("pointerdown", function (e) {
      var s = S();
      if (!s || BK.ui.isOpen() || s.over) return;
      audio();
      var wx = (e.clientX * dpr) / Z + camX, wy = (e.clientY * dpr) / Z + camY;
      var tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      var target = null, gx = tx, gy = ty;
      var door = WD.doors.filter(function (d) { return d.x === tx && (d.y === ty || d.y - 1 === ty); })[0];
      if (!door) door = WD.doors.filter(function (d) { var b = d.building; return b && tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h; })[0];
      if (door) { target = { door: door }; gx = door.fx; gy = door.fy; }
      else {
        var sp = WD.spots.filter(function (p) { return tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h; })[0];
        if (sp) {
          target = { spot: sp };
          if (WD.isSolid(tx, ty)) { gx = sp.x; gy = sp.y; if (WD.isSolid(gx, gy)) { gx = sp.x; gy = sp.y - 1; } }
        }
      }
      if (WD.isSolid(gx, gy)) return;
      if (gx === s.px && gy === s.py && !mv) { if (target) BK.game.interact(target); return; }
      var p = WD.path(mv ? mv.tx : s.px, mv ? mv.ty : s.py, gx, gy);
      if (p) { path = p; pendingTarget = target; R.tapMark = { x: gx, y: gy, t: 1 }; }
    });
  }

  /* ---------------- drawing ---------------- */
  function darkness(time) {
    if (time < 90) return 0.5 + 0.3 * (time / 90);
    if (time > 480) return 0.8 - 0.25 * Math.min(1, (time - 480) / 60);
    return 0.8;
  }

  function drawPerson(x, y, o, t) {
    // x,y = top-left of tile in world px
    var bob = o.moving ? Math.round(Math.sin(t * 18) * 1) : 0;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(x + 8, y + 15, 5, 2, 0, 0, 6.3); ctx.fill();
    // skirt / legs
    ctx.fillStyle = o.skirt || "#1e1a20";
    if (o.skirt) { ctx.beginPath(); ctx.moveTo(x + 4, y + 15); ctx.lineTo(x + 12, y + 15); ctx.lineTo(x + 10, y + 8 + bob); ctx.lineTo(x + 6, y + 8 + bob); ctx.fill(); }
    else { ctx.fillRect(x + 5, y + 10 + bob, 2, 5); ctx.fillRect(x + 9, y + 10 - bob, 2, 5); }
    // body
    ctx.fillStyle = o.coat; ctx.fillRect(x + 4, y + 5 + bob, 8, 6);
    // head
    ctx.fillStyle = o.skin || "#e8c8a8"; ctx.fillRect(x + 5, y + 1 + bob, 6, 5);
    // hat
    ctx.fillStyle = o.hatColor || "#111";
    if (o.hat === "helmet") { ctx.fillRect(x + 5, y - 3 + bob, 6, 4); ctx.fillStyle = "#c0a050"; ctx.fillRect(x + 7, y - 4 + bob, 2, 1); }
    else if (o.hat === "bonnet") { ctx.fillStyle = o.hatColor || "#8a1a1a"; ctx.fillRect(x + 4, y + bob, 8, 3); ctx.fillRect(x + 4, y + bob, 2, 5); ctx.fillRect(x + 10, y + bob, 2, 5); }
    else if (o.hat === 1) { ctx.fillRect(x + 4, y + 1 + bob, 8, 1); ctx.fillRect(x + 5, y - 2 + bob, 6, 3); }
    else if (o.hat === 2) { ctx.fillRect(x + 5, y + bob, 6, 2); ctx.fillRect(x + 10, y + 1 + bob, 3, 1); }
    // facing hint
    if (o.facing === "left") { ctx.fillStyle = "#222"; ctx.fillRect(x + 5, y + 3 + bob, 1, 1); }
    else if (o.facing === "right") { ctx.fillStyle = "#222"; ctx.fillRect(x + 10, y + 3 + bob, 1, 1); }
    else if (o.facing !== "up") { ctx.fillStyle = "#222"; ctx.fillRect(x + 6, y + 3 + bob, 1, 1); ctx.fillRect(x + 9, y + 3 + bob, 1, 1); }
  }

  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; clock += dt;
    var s = S();
    var playing = s && !document.getElementById("title").classList.contains("show");
    if (playing) { updatePlayer(dt); }
    updateNpcs(dt);
    // camera
    var px, py;
    if (playing) {
      px = s.px; py = s.py;
      if (mv) { px = mv.fx + (mv.tx - mv.fx) * mv.t; py = mv.fy + (mv.ty - mv.fy) * mv.t; }
    } else { px = 36 + Math.sin(clock * 0.05) * 25; py = 24 + Math.cos(clock * 0.04) * 14; }
    var vw = cv.width / Z, vh = cv.height / Z;
    camX = (px + 0.5) * T - vw / 2; camY = (py + 0.5) * T - vh / 2;
    var mw = WD.W * T, mh = WD.H * T;
    camX = vw >= mw ? (mw - vw) / 2 : U.clamp(camX, 0, mw - vw);
    camY = vh >= mh ? (mh - vh) / 2 : U.clamp(camY, 0, mh - vh);
    camX = Math.round(camX * Z) / Z; camY = Math.round(camY * Z) / Z;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0a0c"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
    var sx = Math.max(0, Math.floor(camX)), sy = Math.max(0, Math.floor(camY));
    var sw = Math.min(mw - sx, Math.ceil(vw) + 2), sh = Math.min(mh - sy, Math.ceil(vh) + 2);
    ctx.drawImage(WD.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    var x0 = camX / T - 1, y0 = camY / T - 2, x1 = (camX + vw) / T + 1, y1 = (camY + vh) / T + 2;
    function vis(x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }

    // water shimmer
    ctx.fillStyle = "rgba(120,160,190,0.18)";
    for (var wx = Math.floor(x0); wx < x1; wx++) for (var wy = 49; wy <= 51; wy++) {
      if (!vis(wx, wy) || WD.get(wx, wy) !== WD.TILE.WATER) continue;
      var ph = Math.sin(clock * 1.5 + wx * 0.7 + wy * 1.3);
      ctx.fillRect(wx * T + 3 + ph * 2, wy * T + 6 + (wy % 2) * 4, 6, 1);
    }
    // doors: knocker glints & markers
    WD.doors.forEach(function (d) {
      if (!vis(d.x, d.y)) return;
      var kx = d.x * T + 8, ky = d.y * T + 2;
      var col = (BK.KNOCKERS[d.knocker] || BK.KNOCKERS.ring).color;
      var gl = 0.6 + 0.4 * Math.sin(clock * 2 + d.x);
      ctx.fillStyle = col; ctx.globalAlpha = 0.7 + 0.3 * gl;
      ctx.beginPath(); ctx.arc(kx, ky, 2.2, 0, 6.3); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(kx, ky + 3.5, 2, 0, 6.3); ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // lamp posts
    WD.lamps.forEach(function (l) {
      if (!vis(l.x, l.y)) return;
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(l.x * T - 1, l.y * T - 14, 2, 16);
      ctx.fillStyle = "#2a2a2a"; ctx.fillRect(l.x * T - 3, l.y * T - 18, 6, 5);
    });
    // npcs
    npcs.forEach(function (n) {
      var p = npcPos(n);
      if (!vis(p.x, p.y)) return;
      drawPerson(p.x * T, p.y * T, n.kind === "cop" ? { coat: "#1a2440", hat: "helmet", hatColor: "#101830", moving: n.path.length > 0, facing: "down" } :
        { coat: n.coat, hat: n.hat, moving: n.path.length > 0, facing: "down" }, clock + n.x);
    });
    // player
    if (playing) {
      drawPerson(px * T, py * T, { coat: "#9a1c1c", skirt: "#2a1a2a", hat: "bonnet", hatColor: "#6a1414", moving: !!mv, facing: s.facing, skin: "#ecc8a8" }, clock);
      ctx.fillStyle = "#f0c060"; ctx.fillRect(px * T + 12, py * T + 8, 2, 3);
    }
    // tap marker
    if (R.tapMark && R.tapMark.t > 0) {
      R.tapMark.t -= dt * 1.5;
      ctx.strokeStyle = "rgba(240,200,100," + R.tapMark.t + ")"; ctx.lineWidth = 1;
      ctx.strokeRect(R.tapMark.x * T + 2, R.tapMark.y * T + 2, T - 4, T - 4);
    }
    // smoke from the mill
    var millB = WD.buildings.filter(function (b) { return b.lm === "mill"; })[0];
    if (millB && Math.random() < 0.3) smoke.push({ x: millB.x * T + millB.w * T - 16, y: millB.y * T - 32, r: 3, a: 0.4 });
    smoke.forEach(function (p) { p.y -= dt * 8; p.x += dt * 5; p.r += dt * 4; p.a -= dt * 0.08; });
    smoke = smoke.filter(function (p) { return p.a > 0; });
    smoke.forEach(function (p) { ctx.fillStyle = "rgba(90,85,80," + p.a + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); });
    // fog
    fog.forEach(function (f) {
      f.x += f.v * dt; if (f.x - f.r > mw) f.x = -f.r;
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, "rgba(150,150,160,0.10)"); g.addColorStop(1, "rgba(150,150,160,0)");
      ctx.fillStyle = g; ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    });

    // ---- lighting ----
    var time = playing ? s.time : 200;
    dctx.globalCompositeOperation = "source-over";
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = "rgba(6,8,22," + darkness(time) + ")";
    dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
    dctx.globalCompositeOperation = "destination-out";
    function hole(x, y, r, a) {
      var g = dctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + a + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g; dctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    WD.lamps.forEach(function (l) { if (vis(l.x, l.y)) hole(l.x * T, l.y * T - 12, T * 4.2, 0.95 + 0.05 * Math.sin(clock * 9 + l.x)); });
    WD.doors.forEach(function (d) { if ((d.kind === "landmark" || d.kind === "home") && vis(d.x, d.y)) hole(d.x * T + 8, d.y * T + 8, T * 2.5, 0.7); });
    if (playing) hole((px + 0.5) * T, (py + 0.5) * T, T * (s.buffs.lantern ? 6 : 3.8), 0.95);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
    // warm glow on lamps (after darkness so they read as light sources)
    ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
    ctx.globalCompositeOperation = "lighter";
    WD.lamps.forEach(function (l) {
      if (!vis(l.x, l.y)) return;
      var g = ctx.createRadialGradient(l.x * T, l.y * T - 15, 0, l.x * T, l.y * T - 15, T * 2);
      g.addColorStop(0, "rgba(255,190,90,0.35)"); g.addColorStop(1, "rgba(255,190,90,0)");
      ctx.fillStyle = g; ctx.fillRect(l.x * T - T * 2, l.y * T - 15 - T * 2, T * 4, T * 4);
      ctx.fillStyle = "rgba(255,230,160,0.9)"; ctx.fillRect(l.x * T - 1.5, l.y * T - 17, 3, 3);
    });
    ctx.globalCompositeOperation = "source-over";

    // ---- overlays in screen space ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var fs = Math.round(11 * dpr);
    ctx.font = "600 " + fs + "px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    WD.signs.forEach(function (sg) {
      if (!vis(sg.x, sg.y)) return;
      if (playing && Math.abs(sg.x - s.px) > 14) return;
      var sxp = (sg.x * T - camX) * Z, syp = (sg.y * T - camY) * Z;
      var w = ctx.measureText(sg.text).width + 10 * dpr;
      ctx.fillStyle = "rgba(20,14,8,0.8)"; ctx.fillRect(sxp - w / 2, syp - fs * 0.8, w, fs * 1.6);
      ctx.strokeStyle = "rgba(200,160,80,0.8)"; ctx.lineWidth = dpr; ctx.strokeRect(sxp - w / 2, syp - fs * 0.8, w, fs * 1.6);
      ctx.fillStyle = "#f0d8a0"; ctx.fillText(sg.text, sxp, syp + dpr);
    });
    if (playing) {
      // door markers: knocked tonight (✓), suspects (◆), quests (!)
      var carrying = s.quests.filter(function (q) { return q.state !== "done" && s.inv[q.item]; }).map(function (q) { return q.giver; });
      WD.doors.forEach(function (d) {
        if (!vis(d.x, d.y)) return;
        var mx = ((d.x + 0.5) * T - camX) * Z, my = ((d.y - 0.6) * T - camY) * Z;
        var sym = null, col = "#fff";
        if (carrying.indexOf(d.id) >= 0) { sym = "!"; col = "#ffd040"; }
        else if (s.knocked[d.id]) { sym = "✓"; col = "rgba(140,180,220,0.9)"; }
        else if (d.kind === "suspect") { sym = "◆"; col = "#d090f0"; }
        if (sym) { ctx.font = "bold " + Math.round(12 * dpr) + "px sans-serif"; ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(sym, mx + dpr, my + dpr); ctx.fillStyle = col; ctx.fillText(sym, mx, my); }
      });
      // constables alert
      if (s.suspicion >= 50) npcs.forEach(function (n) {
        if (n.kind !== "cop") return; var p = npcPos(n);
        if (Math.abs(p.x - s.px) + Math.abs(p.y - s.py) > 7) return;
        ctx.font = "bold " + Math.round(13 * dpr) + "px sans-serif"; ctx.fillStyle = "#ff5050";
        ctx.fillText("!", ((p.x + 0.5) * T - camX) * Z, ((p.y - 0.5) * T - camY) * Z);
      });
      if (!mv && !BK.ui.isOpen()) BK.ui.setAction(labelFor(R.targetHere()));
      if (Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) BK.ui.hud();
    }
    requestAnimationFrame(frame);
  }
})();
