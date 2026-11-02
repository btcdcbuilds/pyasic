/* Finding the Brass — painted-style SVG portraits, generated from a seed.
 * Ladies: varied faces, hair, eyes, gowns and jewellery, in Victorian dress.
 * Men: simpler portraits for householders, locals and street toughs.
 */
"use strict";
(function () {
  var U = BK.util;
  var P = BK.portraits = {};
  var uid = 0;

  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function sh(h, f) {
    var c = hex2rgb(h);
    return "rgb(" + c.map(function (v) { return U.clamp(Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f), 0, 255); }).join(",") + ")";
  }

  var SKIN = ["#f6dcc8", "#f1d0b5", "#e8c0a0", "#dcae8a", "#c99470", "#a8724e", "#8a5a3c", "#6e4630"];
  var HAIR = { raven: "#1b1210", chestnut: "#5a2c14", auburn: "#8e3416", copper: "#b9561e", honey: "#c08a3e", blonde: "#e2c27a", flaxen: "#efdca8", strawberry: "#c8784a", mahogany: "#4a1a12" };
  var EYES = ["#3d6ea8", "#2f7a52", "#5a3418", "#7a6a2c", "#5e7488", "#3a2a1a", "#4a8a8a"];
  var LIPS = ["#b8283a", "#c2404a", "#d0606a", "#9a2238", "#c85a48", "#a83a5a"];
  var GOWNS = ["#7a1430", "#1e3a6e", "#2c5a3a", "#5a1e5e", "#9a6a1e", "#1a1a22", "#8a2a1a", "#3a5a7a", "#6e2848", "#c8b090"];
  var SHAWLS = ["#d8c8a8", "#3a2a4a", "#8a5a2a", "#2a4a4a", "#e0d0d8"];
  var FLOWERS = ["#d02a40", "#f0a0b8", "#f4f0e8", "#e8c040", "#9a3ab0"];

  P.makeLady = function (seed, opts) {
    opts = opts || {};
    var r = U.mulberry32(U.hash("lady:" + seed));
    var pk = function (a) { return a[Math.floor(r() * a.length)]; };
    var hairKey = pk(Object.keys(HAIR));
    var fancy = opts.tier === "courtesan" || opts.tier === "legend";
    return {
      g: "f", seed: seed,
      skin: pk(SKIN), hair: HAIR[hairKey], hairKey: hairKey,
      style: pk(["updo", "ringlets", "loose", "updo", "chignon"]),
      eyes: pk(EYES), lips: pk(LIPS), gown: pk(GOWNS), shawl: pk(SHAWLS),
      neck: fancy ? pk(["square", "square", "high"]) : pk(["square", "shawl", "high", "shawl"]),
      acc: fancy ? pk(["hat", "aigrette", "flowers"]) : pk(["flowers", "ribbon", "none", "hat", "flowers"]),
      flower: pk(FLOWERS),
      earrings: r() < (fancy ? 0.9 : 0.6), jewel: fancy ? "pearls" : pk(["choker", "none", "locket", "choker"]),
      mole: r() < 0.35, moleSide: r() < 0.5 ? -1 : 1,
      mood: pk(["smile", "sly", "sweet", "pout", "smile"]),
      faceW: 0.95 + r() * 0.1, eyeTilt: r() * 2 - 0.5
    };
  };

  P.makeMan = function (seed, opts) {
    opts = opts || {};
    var r = U.mulberry32(U.hash("man:" + seed));
    var pk = function (a) { return a[Math.floor(r() * a.length)]; };
    return {
      g: "m", seed: seed, skin: opts.skin || pk(SKIN), hair: opts.hair || pk([HAIR.raven, HAIR.chestnut, "#8c7a68", "#9a9088", HAIR.auburn, "#c8c4bc"]),
      eyes: pk(EYES), coat: opts.coat || pk(["#2a2a30", "#3a2a22", "#22303a", "#3a3a2a", "#4a2a2a"]),
      hat: opts.hat || pk(["none", "top", "bowler", "cap", "none"]), tache: opts.tache !== undefined ? opts.tache : r() < 0.55,
      beard: r() < 0.25, scowl: opts.scowl !== undefined ? opts.scowl : r() < 0.5
    };
  };

  P.svg = function (p, size) {
    var id = "p" + (uid++);
    var out = p.g === "m" ? man(p, id) : lady(p, id);
    var w = size || 160;
    var vb = p.g === "m" ? "16 0 168 210" : "24 6 152 190";
    return '<svg class="portrait-svg" viewBox="' + vb + '" width="' + w + '" height="' + Math.round(w * 1.25) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Portrait">' + out + "</svg>";
  };

  function commonDefs(p, id) {
    return '<radialGradient id="' + id + 'bg" cx="38%" cy="30%" r="85%"><stop offset="0" stop-color="#7a4426"/><stop offset=".55" stop-color="#3a1810"/><stop offset="1" stop-color="#140806"/></radialGradient>' +
      '<pattern id="' + id + 'wp" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M11 2 C15 7 15 9 11 13 C7 9 7 7 11 2Z M0 18 h22" fill="none" stroke="#e8b860" stroke-width=".8"/></pattern>' +
      '<radialGradient id="' + id + 'sk" cx="44%" cy="38%" r="70%"><stop offset="0" stop-color="' + sh(p.skin, 1.1) + '"/><stop offset=".6" stop-color="' + p.skin + '"/><stop offset="1" stop-color="' + sh(p.skin, 0.8) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'hr" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="' + sh(p.hair, 1.35) + '"/><stop offset=".45" stop-color="' + p.hair + '"/><stop offset="1" stop-color="' + sh(p.hair, 0.6) + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'vg" cx="50%" cy="45%" r="75%"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>' +
      '<radialGradient id="' + id + 'lamp" cx="20%" cy="12%" r="60%"><stop offset="0" stop-color="#ffd890" stop-opacity=".35"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>';
  }
  function backdrop(id) {
    return '<rect width="200" height="250" fill="url(#' + id + 'bg)"/><rect width="200" height="250" fill="url(#' + id + 'wp)" opacity=".07"/><rect width="200" height="250" fill="url(#' + id + 'lamp)"/>';
  }
  function finish(id) {
    return '<rect width="200" height="250" fill="url(#' + id + 'vg)"/>';
  }

  function eye(cx, cy, p, id, side) {
    // side: -1 left eye (outer corner on the left), 1 right eye
    var w = 12.5, t = p.eyeTilt * side;
    var x0 = cx - w, x1 = cx + w;
    var yo = cy - t * 0.6, yi = cy + t * 0.6; // outer corner slightly lifted
    var ox = side < 0 ? x0 : x1, ix = side < 0 ? x1 : x0;
    var oy = yo, iy = yi;
    var white = "M" + ox + "," + oy + " Q" + cx + "," + (cy - 10) + " " + ix + "," + iy + " Q" + cx + "," + (cy + 6.5) + " " + ox + "," + oy + "Z";
    var clip = id + "e" + (side < 0 ? "L" : "R");
    var s = '<clipPath id="' + clip + '"><path d="' + white + '"/></clipPath>';
    s += '<path d="M' + ox + "," + (oy - 2) + " Q" + cx + "," + (cy - 15) + " " + ix + "," + (iy - 2) + '" fill="none" stroke="' + sh(p.skin, 0.72) + '" stroke-width="1.1" opacity=".55"/>';
    s += '<path d="M' + (ox - side * 1) + "," + (oy + 1) + " Q" + cx + "," + (cy - 13) + " " + ix + "," + (iy + 1) + " Q" + cx + "," + (cy - 9) + " " + ox + "," + oy + 'Z" fill="#7a3a5a" opacity=".22"/>';
    s += '<path d="' + white + '" fill="#f6eee8"/>';
    s += '<g clip-path="url(#' + clip + ')"><circle cx="' + (cx + side * 0.4) + '" cy="' + (cy - 1.2) + '" r="5.6" fill="url(#' + id + 'ir)"/><circle cx="' + (cx + side * 0.4) + '" cy="' + (cy - 1.2) + '" r="2.6" fill="#0c0806"/>' +
      '<path d="M' + ox + "," + (oy - 3) + " Q" + cx + "," + (cy - 11) + " " + ix + "," + (iy - 3) + " L" + ix + "," + (iy - 1) + " Q" + cx + "," + (cy - 7) + " " + ox + "," + (oy - 1) + 'Z" fill="#000" opacity=".18"/></g>';
    s += '<circle cx="' + (cx + side * 0.4 + 1.7) + '" cy="' + (cy - 3) + '" r="1.5" fill="#fff"/><circle cx="' + (cx + side * 0.4 - 1.6) + '" cy="' + (cy + 0.6) + '" r=".7" fill="#fff" opacity=".7"/>';
    // upper lash line and flick
    s += '<path d="M' + (ox - side * 0.5) + "," + (oy + 0.5) + " Q" + cx + "," + (cy - 11.2) + " " + (ix + side * 0.5) + "," + (iy - 0.3) + '" fill="none" stroke="#1a0e0a" stroke-width="2.5" stroke-linecap="round"/>';
    for (var k = 0; k < 4; k++) {
      var lx = ox - side * (-1 + k * 2.6), ly = oy - 0.5 - k * 2.2;
      s += '<path d="M' + lx + "," + ly + " q" + (side * -4) + "," + (-2.5 - k * 0.6) + " " + (side * -5.5) + "," + (-1 - k) + '" fill="none" stroke="#1a0e0a" stroke-width="1.1" stroke-linecap="round"/>';
    }
    s += '<path d="M' + (ox + side * -0.5 + side * 2) + "," + (oy + 2.5) + " Q" + cx + "," + (cy + 7.5) + " " + (ix - side * 1) + "," + (iy + 1.5) + '" fill="none" stroke="' + sh(p.skin, 0.6) + '" stroke-width=".8" opacity=".55"/>';
    return s;
  }

  function lady(p, id) {
    var d = "<defs>" + commonDefs(p, id) +
      '<radialGradient id="' + id + 'ir" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="' + sh(p.eyes, 1.5) + '"/><stop offset=".55" stop-color="' + p.eyes + '"/><stop offset="1" stop-color="' + sh(p.eyes, 0.45) + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sh(p.gown, 1.3) + '"/><stop offset=".5" stop-color="' + p.gown + '"/><stop offset="1" stop-color="' + sh(p.gown, 0.55) + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'lp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sh(p.lips, 1.15) + '"/><stop offset="1" stop-color="' + sh(p.lips, 0.75) + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'bl"><stop offset="0" stop-color="#e8506a" stop-opacity=".38"/><stop offset="1" stop-color="#e8506a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'pe" cx="35%" cy="30%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#efe6da"/><stop offset="1" stop-color="#b8aa98"/></radialGradient>' +
      "</defs>";
    var s = d + backdrop(id);
    var H = "url(#" + id + "hr)", SK = "url(#" + id + "sk)", GW = "url(#" + id + "gw)";
    var fw = p.faceW;
    // ---- hair, back layer ----
    if (p.style === "updo") s += '<ellipse cx="100" cy="58" rx="56" ry="36" fill="' + H + '"/><ellipse cx="62" cy="86" rx="15" ry="27" fill="' + H + '"/><ellipse cx="138" cy="86" rx="15" ry="27" fill="' + H + '"/><circle cx="100" cy="26" r="21" fill="' + H + '"/><path d="M86 22 C96 12 112 16 112 28 C112 36 100 38 96 32" fill="none" stroke="' + sh(p.hair, 1.5) + '" stroke-width="2" opacity=".5"/>';
    else if (p.style === "chignon") s += '<ellipse cx="100" cy="64" rx="52" ry="38" fill="' + H + '"/><ellipse cx="146" cy="118" rx="20" ry="17" fill="' + H + '"/><path d="M134 112 C144 104 158 110 158 122" fill="none" stroke="' + sh(p.hair, 1.5) + '" stroke-width="2" opacity=".45"/>';
    else if (p.style === "loose") s += '<path d="M46 72 C30 140 36 206 44 250 L156 250 C164 206 170 140 154 72 C150 40 50 40 46 72Z" fill="' + H + '"/>';
    else s += '<ellipse cx="100" cy="66" rx="53" ry="41" fill="' + H + '"/>';
    // ---- shoulders, neck, gown ----
    if (p.neck !== "high") s += '<path d="M12 250 C16 214 48 196 84 188 L116 188 C152 196 184 214 188 250Z" fill="' + SK + '"/>' +
      '<path d="M70 204 Q84 210 94 206 M130 204 Q116 210 106 206" fill="none" stroke="' + sh(p.skin, 0.75) + '" stroke-width="1.2" opacity=".45"/>';
    s += '<path d="M85 138 C86 160 84 178 81 194 L119 194 C116 178 114 160 115 138Z" fill="' + SK + '"/>' +
      '<path d="M85 146 C92 162 108 162 115 146 L115 160 C108 168 92 168 85 160Z" fill="' + sh(p.skin, 0.62) + '" opacity=".35"/>';
    if (p.neck === "high") {
      s += '<path d="M12 250 C16 214 48 194 82 186 L84 160 C92 167 108 167 116 160 L118 186 C152 194 184 214 188 250Z" fill="' + GW + '"/>';
      for (var i = 0; i < 9; i++) s += '<circle cx="' + (84 + i * 4) + '" cy="' + (161 + Math.abs(i - 4) * -0.6 + 3) + '" r="3.2" fill="#f4ecdc" opacity=".92"/>';
      for (var j = 0; j < 4; j++) s += '<circle cx="100" cy="' + (190 + j * 14) + '" r="2.2" fill="#e8d8a8"/>';
      s += '<ellipse cx="100" cy="176" rx="6" ry="7.5" fill="#d8b060"/><ellipse cx="100" cy="176" rx="4" ry="5.5" fill="#f2e8d8"/>';
    } else {
      s += '<path d="M12 250 C16 224 34 210 60 207 L64 226 C88 233 112 233 136 226 L140 207 C166 210 184 224 188 250Z" fill="' + GW + '"/>' +
        '<ellipse cx="36" cy="222" rx="26" ry="17" fill="' + GW + '"/><ellipse cx="164" cy="222" rx="26" ry="17" fill="' + GW + '"/>';
      for (var k = 0; k <= 12; k++) { var tx = 64 + k * 6, ty = 226 + Math.sin(k / 12 * Math.PI) * 6.5; s += '<circle cx="' + tx + '" cy="' + (ty + 1) + '" r="3.3" fill="#f6efe2" opacity=".9"/>'; }
      if (p.neck === "shawl") s += '<path d="M8 250 C12 214 40 196 74 190 L100 244 L58 250Z" fill="' + p.shawl + '"/><path d="M192 250 C188 214 160 196 126 190 L100 244 L142 250Z" fill="' + sh(p.shawl, 0.85) + '"/>' +
        '<path d="M74 190 L100 244 L126 190" fill="none" stroke="' + sh(p.shawl, 0.6) + '" stroke-width="1.5" opacity=".6"/>';
      if (p.jewel === "pearls") { for (var q = 0; q < 15; q++) { var a = q / 14, px = 80 + a * 40, py = 196 + Math.sin(a * Math.PI) * 14; s += '<circle cx="' + px + '" cy="' + py + '" r="2.4" fill="url(#' + id + 'pe)"/>'; } }
      if (p.jewel === "locket") s += '<path d="M84 190 Q100 206 116 190" fill="none" stroke="#d8b060" stroke-width="1"/><ellipse cx="100" cy="206" rx="5" ry="6" fill="#d8b060"/><ellipse cx="100" cy="206" rx="3" ry="4" fill="#f0d890"/>';
    }
    if (p.jewel === "choker" && p.neck !== "high") s += '<path d="M85 168 Q100 174 115 168 L115 174 Q100 180 85 174Z" fill="#1a0c14"/><ellipse cx="100" cy="177" rx="4.5" ry="5.5" fill="#d8b060"/><ellipse cx="100" cy="177" rx="3" ry="4" fill="#f2e6d6"/>';
    // ---- ears & earrings ----
    s += '<ellipse cx="' + (100 - 34 * fw) + '" cy="110" rx="5" ry="9" fill="' + sh(p.skin, 0.92) + '"/><ellipse cx="' + (100 + 34 * fw) + '" cy="110" rx="5" ry="9" fill="' + sh(p.skin, 0.92) + '"/>';
    if (p.earrings) [100 - 34 * fw, 100 + 34 * fw].forEach(function (ex) {
      s += '<line x1="' + ex + '" y1="118" x2="' + ex + '" y2="125" stroke="#d8b060" stroke-width="1"/><ellipse cx="' + ex + '" cy="128.5" rx="3" ry="4" fill="' + (p.jewel === "pearls" ? "url(#" + id + "pe)" : p.lips) + '"/><circle cx="' + (ex - 1) + '" cy="127" r=".9" fill="#fff" opacity=".8"/>';
    });
    // ---- face ----
    var L = 100 - 35 * fw, Rr = 100 + 35 * fw;
    s += '<path d="M100 52 C' + (100 + 28 * fw) + " 52 " + (Rr + 1) + " 78 " + Rr + " 100 C" + (Rr - 1) + " 126 " + (100 + 22 * fw) + " 150 100 160 C" + (100 - 22 * fw) + " 150 " + (L + 1) + " 126 " + L + " 100 C" + (L - 1) + " 78 " + (100 - 28 * fw) + ' 52 100 52Z" fill="' + SK + '"/>';
    s += '<ellipse cx="78" cy="124" rx="13" ry="8" fill="url(#' + id + 'bl)"/><ellipse cx="122" cy="124" rx="13" ry="8" fill="url(#' + id + 'bl)"/>';
    // ---- brows ----
    var bc = sh(p.hair, p.hairKey === "blonde" || p.hairKey === "flaxen" ? 0.55 : 0.75);
    var lift = p.mood === "sly" ? -3 : 0;
    s += '<path d="M70 93 Q80 85.5 95 89.5" fill="none" stroke="' + bc + '" stroke-width="2.6" stroke-linecap="round"/>';
    s += '<path d="M130 ' + (93 + lift) + " Q120 " + (85.5 + lift) + ' 105 89.5" fill="none" stroke="' + bc + '" stroke-width="2.6" stroke-linecap="round"/>';
    // ---- eyes ----
    s += eye(83, 105, p, id, -1) + eye(117, 105, p, id, 1);
    if (p.mood === "sweet") s += '<path d="M73 109 Q83 112 93 108 M107 108 Q117 112 127 109" fill="none" stroke="' + sh(p.skin, 0.8) + '" stroke-width=".8" opacity=".5"/>';
    // ---- nose ----
    s += '<path d="M101 106 C99 116 97.5 121 99 125.5" fill="none" stroke="' + sh(p.skin, 0.7) + '" stroke-width="1.3" opacity=".45" stroke-linecap="round"/>' +
      '<path d="M95 126.5 Q100 130 105 126.5" fill="none" stroke="' + sh(p.skin, 0.62) + '" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>' +
      '<ellipse cx="100" cy="118" rx="2" ry="6" fill="#fff" opacity=".12"/>';
    // ---- lips ----
    var cy = 140, cu = p.mood === "smile" || p.mood === "sweet" ? -2.2 : 0, cl = p.mood === "sly" ? -2.6 : cu, fuller = p.mood === "pout" ? 2 : 0;
    s += '<path d="M87 ' + (cy + cu) + " Q93 " + (cy - 5.5 - fuller / 2) + " 100 " + (cy - 2.6) + " Q107 " + (cy - 5.5 - fuller / 2) + " 113 " + (cy + cl) + " Q100 " + (cy + 1.6) + " 87 " + (cy + cu) + 'Z" fill="url(#' + id + 'lp)"/>';
    s += '<path d="M87 ' + (cy + cu) + " Q100 " + (cy + 11 + fuller) + " 113 " + (cy + cl) + " Q100 " + (cy + 2) + " 87 " + (cy + cu) + 'Z" fill="url(#' + id + 'lp)"/>';
    s += '<path d="M87.5 ' + (cy + cu) + " Q100 " + (cy + 2.6) + " 112.5 " + (cy + cl) + '" fill="none" stroke="' + sh(p.lips, 0.5) + '" stroke-width=".9"/>';
    s += '<ellipse cx="100" cy="' + (cy + 5.5 + fuller / 2) + '" rx="5" ry="1.6" fill="#fff" opacity=".32"/>';
    if (p.mood === "smile" || p.mood === "sweet") s += '<path d="M84 ' + (cy - 3) + " q-1.5 2 -0.5 4 M116 " + (cy - 3) + ' q1.5 2 0.5 4" fill="none" stroke="' + sh(p.skin, 0.7) + '" stroke-width=".9" opacity=".45"/>';
    if (p.mole) s += '<circle cx="' + (100 + p.moleSide * 17) + '" cy="132" r="1.4" fill="#3a2010"/>';
    // ---- hair, front layer ----
    s += '<path d="M' + (L - 1) + " 104 C" + (L - 6) + " 62 82 44 100 44 C118 44 " + (Rr + 6) + " 62 " + (Rr + 1) + " 104 C" + (Rr - 2) + " 84 128 70 113 65 C107 74 93 72 86 67 C76 72 " + (L + 2) + " 86 " + (L - 1) + ' 104Z" fill="' + H + '"/>';
    s += '<path d="M84 50 C76 58 70 72 68 90 M116 50 C124 58 130 72 132 90 M98 46 C92 52 88 60 86 66" fill="none" stroke="' + sh(p.hair, 1.6) + '" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>';
    if (p.style === "ringlets") {
      [-1, 1].forEach(function (sd) {
        for (var n = 0; n < 6; n++) {
          var rx = 100 + sd * (37 + n * 1.5), ry = 106 + n * 15;
          s += '<circle cx="' + rx + '" cy="' + ry + '" r="8.5" fill="' + H + '"/><path d="M' + (rx - 5) + " " + (ry - 2) + " q5 -5 9 1" + '" fill="none" stroke="' + sh(p.hair, 1.5) + '" stroke-width="1.3" opacity=".5"/>';
        }
      });
    }
    if (p.style === "loose") s += '<path d="M' + (L + 1) + " 100 C" + (L - 10) + " 146 " + (L - 6) + " 196 " + (L - 22) + " 246 L" + (L - 2) + " 246 C" + (L + 6) + " 200 " + (L + 5) + " 150 " + (L + 4) + ' 112Z" fill="' + H + '"/>' +
      '<path d="M' + (Rr - 1) + " 100 C" + (Rr + 10) + " 146 " + (Rr + 6) + " 196 " + (Rr + 22) + " 246 L" + (Rr + 2) + " 246 C" + (Rr - 6) + " 200 " + (Rr - 5) + " 150 " + (Rr - 4) + ' 112Z" fill="' + H + '"/>';
    // ---- accessories ----
    if (p.acc === "flowers") {
      var fx = 134, fy = 62;
      s += '<ellipse cx="' + (fx + 12) + '" cy="' + (fy + 8) + '" rx="9" ry="4" fill="#2e5a2a" transform="rotate(30 ' + (fx + 12) + " " + (fy + 8) + ')"/><ellipse cx="' + (fx - 10) + '" cy="' + (fy + 10) + '" rx="8" ry="3.5" fill="#3a6a32" transform="rotate(-30 ' + (fx - 10) + " " + (fy + 10) + ')"/>';
      [[0, 0, 8], [12, -6, 6.5], [-9, -7, 6]].forEach(function (f) {
        s += '<circle cx="' + (fx + f[0]) + '" cy="' + (fy + f[1]) + '" r="' + f[2] + '" fill="' + p.flower + '"/><path d="M' + (fx + f[0] - f[2] * 0.5) + " " + (fy + f[1]) + " a" + f[2] * 0.5 + " " + f[2] * 0.5 + " 0 1 1 " + f[2] * 0.6 + " " + f[2] * 0.3 + '" fill="none" stroke="' + sh(p.flower, 0.6) + '" stroke-width="1.2"/>';
      });
    } else if (p.acc === "ribbon") {
      s += '<path d="M100 40 L80 30 L82 50Z M100 40 L120 30 L118 50Z" fill="' + sh(p.gown, 1.2) + '"/><circle cx="100" cy="40" r="4.5" fill="' + p.gown + '"/>';
    } else if (p.acc === "hat") {
      s += '<g transform="rotate(-13 104 46)"><ellipse cx="106" cy="46" rx="50" ry="10" fill="' + sh(p.gown, 0.55) + '"/><path d="M80 46 L84 22 Q108 13 131 22 L134 46Z" fill="' + sh(p.gown, 0.7) + '"/>' +
        '<rect x="82" y="36" width="51" height="6" fill="' + sh(p.gown, 1.25) + '"/><path d="M128 32 C160 2 182 18 174 42 C164 28 148 26 128 32Z" fill="' + sh(p.shawl, 1.1) + '"/><path d="M130 31 C152 18 168 22 172 38" fill="none" stroke="' + sh(p.shawl, 0.6) + '" stroke-width="1"/></g>';
    } else if (p.acc === "aigrette") {
      s += '<path d="M120 40 C130 8 150 0 156 6 C146 12 136 24 126 44Z" fill="#f4f0ea" opacity=".95"/><path d="M122 42 C136 18 148 8 154 8" fill="none" stroke="#c8c0b0" stroke-width="1"/>';
      for (var g = 0; g < 7; g++) s += '<circle cx="' + (76 + g * 8) + '" cy="' + (50 - Math.sin(g / 6 * Math.PI) * 6) + '" r="2.3" fill="url(#' + id + 'pe)"/>';
      s += '<circle cx="122" cy="44" r="4" fill="#3a8aa0"/><circle cx="121" cy="43" r="1.3" fill="#fff" opacity=".8"/>';
    }
    return s + finish(id);
  }

  function man(p, id) {
    var d = "<defs>" + commonDefs(p, id) + '<linearGradient id="' + id + 'ct" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sh(p.coat, 1.4) + '"/><stop offset="1" stop-color="' + sh(p.coat, 0.6) + '"/></linearGradient></defs>';
    var s = d + backdrop(id), SK = "url(#" + id + "sk)", H = "url(#" + id + "hr)";
    s += '<path d="M84 140 L82 196 L118 196 L116 140Z" fill="' + SK + '"/>';
    s += '<path d="M8 250 C12 210 48 192 82 186 L100 214 L118 186 C152 192 188 210 192 250Z" fill="url(#' + id + 'ct)"/>';
    s += '<path d="M82 186 L100 214 L92 222 L76 192Z M118 186 L100 214 L108 222 L124 192Z" fill="#ece6da"/><path d="M94 196 L100 214 L106 196 Q100 192 94 196Z" fill="' + sh(p.coat, 0.5) + '"/>';
    s += '<ellipse cx="65" cy="110" rx="6" ry="10" fill="' + sh(p.skin, 0.9) + '"/><ellipse cx="135" cy="110" rx="6" ry="10" fill="' + sh(p.skin, 0.9) + '"/>';
    s += '<path d="M100 52 C130 52 138 80 137 102 C136 132 124 156 100 164 C76 156 64 132 63 102 C62 80 70 52 100 52Z" fill="' + SK + '"/>';
    if (p.beard) s += '<path d="M64 112 C66 150 84 170 100 172 C116 170 134 150 136 112 C130 140 118 152 100 152 C82 152 70 140 64 112Z" fill="' + H + '"/>';
    var by = p.scowl ? 2 : 0;
    s += '<path d="M70 ' + (90 + by) + " L95 " + (92 + by * 2) + '" stroke="' + sh(p.hair, 0.7) + '" stroke-width="4" stroke-linecap="round"/><path d="M130 ' + (90 + by) + " L105 " + (92 + by * 2) + '" stroke="' + sh(p.hair, 0.7) + '" stroke-width="4" stroke-linecap="round"/>';
    [83, 117].forEach(function (ex) {
      s += '<path d="M' + (ex - 10) + " 104 Q" + ex + " 97 " + (ex + 10) + " 104 Q" + ex + " 108 " + (ex - 10) + ' 104Z" fill="#f2ebe4"/><circle cx="' + ex + '" cy="103.5" r="3.6" fill="' + p.eyes + '"/><circle cx="' + ex + '" cy="103.5" r="1.8" fill="#000"/><circle cx="' + (ex + 1) + '" cy="102.3" r=".9" fill="#fff"/>' +
        '<path d="M' + (ex - 10) + " 104 Q" + ex + " 96.5 " + (ex + 10) + ' 104" fill="none" stroke="#2a1a10" stroke-width="1.6"/>';
    });
    s += '<path d="M101 106 C99 118 96 124 99 129 L105 129" fill="none" stroke="' + sh(p.skin, 0.65) + '" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>';
    s += '<path d="M90 143 Q100 ' + (p.scowl ? 140 : 146) + ' 110 143" fill="none" stroke="' + sh(p.skin, 0.5) + '" stroke-width="2" stroke-linecap="round"/>';
    if (p.tache) s += '<path d="M84 138 C90 131 98 133 100 136 C102 133 110 131 116 138 C110 137 104 139 100 139 C96 139 90 137 84 138Z" fill="' + H + '"/>';
    if (p.hat === "none" || p.hat === "cap") s += '<path d="M63 100 C58 58 82 44 100 44 C120 44 142 58 137 100 C134 76 122 64 100 64 C80 64 66 76 63 100Z" fill="' + H + '"/>';
    if (p.hat === "top") s += '<rect x="68" y="6" width="64" height="50" fill="#141214"/><rect x="68" y="44" width="64" height="7" fill="#3a2a2a"/><ellipse cx="100" cy="56" rx="50" ry="8" fill="#0e0c0e"/>';
    else if (p.hat === "bowler") s += '<path d="M66 58 C66 22 134 22 134 58Z" fill="#1c1a1a"/><ellipse cx="100" cy="58" rx="46" ry="7" fill="#121010"/>';
    else if (p.hat === "cap") s += '<path d="M62 66 C62 38 138 38 138 66Z" fill="' + sh(p.coat, 0.9) + '"/><path d="M100 64 L150 70 L138 62Z" fill="' + sh(p.coat, 0.6) + '"/>';
    else if (p.hat === "helmet") s += '<path d="M64 64 C62 6 138 6 136 64Z" fill="#141c34"/><rect x="60" y="58" width="80" height="7" rx="3" fill="#0e1428"/><circle cx="100" cy="34" r="6" fill="#d8b060"/>';
    else if (p.hat === "sailor") s += '<path d="M60 62 C62 40 138 40 140 62Z" fill="#f2efe6"/><rect x="62" y="56" width="76" height="8" fill="#1a1a2a"/>';
    return s + finish(id);
  }
})();
