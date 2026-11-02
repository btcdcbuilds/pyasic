/* Finding the Brass — the town of Brassmoor: map generation, collision, pathfinding, rendering. */
"use strict";
(function () {
  var U = BK.util;
  var T = 16;               // tile size in source pixels
  var W = 72, H = 53;       // map size in tiles
  var BW = 8, BH = 7;       // block size
  var COLS = 7, ROWS = 5;

  var TILE = { STREET: 0, PLAZA: 1, GRASS: 2, TREE: 3, WATER: 4, TOWPATH: 5, BUILDING: 6, DOOR: 7, GRAVE: 8, FOUNTAIN: 9, BANK: 10, LOCK: 11 };
  var SOLID = {}; SOLID[TILE.TREE] = SOLID[TILE.WATER] = SOLID[TILE.BUILDING] = SOLID[TILE.DOOR] = SOLID[TILE.GRAVE] = SOLID[TILE.FOUNTAIN] = SOLID[TILE.BANK] = true;

  function blockDistrict(bx, by) {
    if (by === 0) return "chapel";
    if (bx <= 1) return "rookery";
    if (by === 4) return "wharf";
    if (bx >= 5) return "mill";
    return "square";
  }

  // whole-block landmarks
  var WHOLE = {
    "3,0": { lm: "church", label: "St Bride's Church", roof: "#3a3f4a", wall: "#6b6458" },
    "2,0": { park: "churchyard", label: "Churchyard" },
    "3,1": { lm: "court", label: "The Lock Hospital", roof: "#3c3c46", wall: "#8a8478" },
    "3,2": { plaza: true, label: "Gaslight Square" },
    "4,2": { lm: "hall", label: "Empire Music Hall", roof: "#5a2030", wall: "#9a6a4a" },
    "6,2": { lm: "mill", label: "Crake's Mill", roof: "#3a2a22", wall: "#7a3a2a" },
    "2,4": { lm: "tavern", label: "The Drowned Man", roof: "#3a3020", wall: "#6a5030" },
    "5,4": { lm: "warehouse", label: "Bonded Warehouse", roof: "#30343a", wall: "#5a5048" },
    "1,2": { park: "green", label: "Ragged Green" }
  };
  // half-block specials: [block, side 0=left 1=right]
  var HALF = {
    "1,0,0": { kind: "local", local: "pell", label: "Dr Pell's Surgery", knocker: "owl", colour: "black" },
    "4,0,0": { kind: "local", local: "mott", label: "The Vicarage", knocker: "hand", colour: "black" },
    "5,0,0": { kind: "local", local: "crake", label: "Crake House", knocker: "lion", colour: "green" },
    "4,1,0": { kind: "local", local: "grime", label: "Station House", knocker: "ring", colour: "blue" },
    "5,1,1": { kind: "local", local: "vane", label: "Vane's Lodgings", knocker: "hand", colour: "white" },
    "5,3,0": { kind: "landmark", lm: "pawn", local: "fenn", label: "Fenn's Pawnshop", knocker: "fox", colour: "yellow" },
    "4,4,0": { kind: "local", local: "ruddock", label: "Harbourmaster's Rooms", knocker: "anchor", colour: "blue" },
    "2,2,1": { kind: "local", local: "lark", label: "Miss Lark's Rooms", knocker: "rose", colour: "red" },
    "0,3,0": { kind: "home", label: "The Sailors' Home", knocker: "anchor", colour: "blue" }
  };

  var world = {
    T: T, W: W, H: H, TILE: TILE,
    tiles: new Uint8Array(W * H),
    buildings: [], doors: [], lamps: [], spots: [], trees: [], boats: [], signs: []
  };

  function set(x, y, t) { if (x >= 0 && y >= 0 && x < W && y < H) world.tiles[y * W + x] = t; }
  function get(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return TILE.BUILDING; return world.tiles[y * W + x]; }
  world.get = get;
  world.isSolid = function (x, y) { return !!SOLID[get(x, y)]; };
  world.district = function (x, y) {
    var bx = U.clamp(Math.floor((x - 2) / 10), 0, COLS - 1), by = U.clamp(Math.floor((y - 2) / 9), 0, ROWS - 1);
    if (y >= 45) return "wharf";
    return blockDistrict(bx, by);
  };

  function build() {
    var rng = U.mulberry32(18870101);
    var x, y, bx, by;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) set(x, y, TILE.STREET);
    // canal
    for (x = 0; x < W; x++) {
      set(x, 47, TILE.TOWPATH); set(x, 48, TILE.TOWPATH);
      set(x, 49, TILE.WATER); set(x, 50, TILE.WATER); set(x, 51, TILE.WATER); set(x, 52, TILE.BANK);
    }
    for (y = 49; y <= 51; y++) { set(58, y, TILE.LOCK); set(59, y, TILE.LOCK); }
    world.spots.push({ id: "lock", x: 58, y: 49, w: 2, h: 3, label: "Canal Lock", place: "lock" });
    world.signs.push({ x: 59, y: 48.2, text: "Canal Lock" });
    world.boats.push({ x: 12, y: 49.4, len: 5 }, { x: 31, y: 50.2, len: 4 }, { x: 44, y: 49.5, len: 6 }, { x: 64, y: 50.1, len: 4 });

    var doorIdx = 0;
    function addDoor(d) { d.id = "d" + (doorIdx++); world.doors.push(d); set(d.x, d.y, TILE.DOOR); return d; }

    for (by = 0; by < ROWS; by++) for (bx = 0; bx < COLS; bx++) {
      var x0 = 2 + bx * 10, y0 = 2 + by * 9;
      var dist = blockDistrict(bx, by);
      var key = bx + "," + by;
      var whole = WHOLE[key];
      if (whole && whole.plaza) {
        for (y = y0 - 1; y < y0 + BH + 1; y++) for (x = x0 - 1; x < x0 + BW + 1; x++) set(x, y, TILE.PLAZA);
        set(x0 + 3, y0 + 3, TILE.FOUNTAIN); set(x0 + 4, y0 + 3, TILE.FOUNTAIN); set(x0 + 3, y0 + 4, TILE.FOUNTAIN); set(x0 + 4, y0 + 4, TILE.FOUNTAIN);
        world.spots.push({ id: "square", x: x0 + 2, y: y0 + 2, w: 4, h: 4, label: "The fountain", place: "square" });
        world.lamps.push({ x: x0 + 0.5, y: y0 + 0.5 }, { x: x0 + 7.5, y: y0 + 0.5 }, { x: x0 + 0.5, y: y0 + 6.5 }, { x: x0 + 7.5, y: y0 + 6.5 });
        world.signs.push({ x: x0 + 4, y: y0 + 1.2, text: "Gaslight Square", my: y0 + 5.6 });
        continue;
      }
      if (whole && whole.park) {
        for (y = y0; y < y0 + BH; y++) for (x = x0; x < x0 + BW; x++) set(x, y, TILE.GRASS);
        for (var k = 0; k < 9; k++) {
          var tx = x0 + Math.floor(rng() * BW), ty = y0 + Math.floor(rng() * BH);
          if (whole.park === "churchyard" && k < 7) { if ((tx + ty) % 2 === 0) set(tx, ty, TILE.GRAVE); }
          else set(tx, ty, TILE.TREE);
        }
        // keep a walking path through the middle
        for (x = x0; x < x0 + BW; x++) set(x, y0 + 3, TILE.GRASS);
        for (y = y0; y < y0 + BH; y++) set(x0 + 4, y, TILE.GRASS);
        world.signs.push({ x: x0 + 4, y: y0 + 0.2, text: whole.label, noMini: true });
        continue;
      }
      if (whole && whole.lm) {
        var b = { x: x0, y: y0, w: BW, h: BH, roof: whole.roof, wall: whole.wall, lm: whole.lm, label: whole.label, district: dist };
        world.buildings.push(b);
        for (y = y0; y < y0 + BH; y++) for (x = x0; x < x0 + BW; x++) set(x, y, TILE.BUILDING);
        var d = addDoor({ x: x0 + 4, y: y0 + BH - 1, fx: x0 + 4, fy: y0 + BH, district: dist, kind: "landmark", lm: whole.lm, label: whole.label, knocker: whole.lm === "church" ? "hand" : whole.lm === "court" ? "hand" : "ring", colour: whole.lm === "court" ? "white" : "black", building: b });
        b.door = d;
        world.signs.push({ x: x0 + 4, y: y0 - 0.3, text: whole.label });
        continue;
      }
      // two houses per block
      for (var side = 0; side < 2; side++) {
        var hx = x0 + side * 4;
        var roofs = { chapel: ["#4a4a58", "#3e4652", "#55485a"], rookery: ["#3a3530", "#463a30", "#2e2a28"], mill: ["#5a3a30", "#4a3428", "#3a3a3a"], square: ["#4a3a4a", "#3a4a4a", "#5a4a3a"], wharf: ["#33404a", "#3a4038", "#40382e"] }[dist];
        var walls = { chapel: ["#9a8a70", "#8a7a68", "#a09080"], rookery: ["#5a4a3a", "#625040", "#4e4238"], mill: ["#8a4a38", "#7a4232", "#904e3a"], square: ["#8a7060", "#7a6a5a", "#988070"], wharf: ["#6a6050", "#5a5848", "#706858"] }[dist];
        var hb = { x: hx, y: y0, w: 4, h: BH, roof: U.pick(rng, roofs), wall: U.pick(rng, walls), district: dist };
        world.buildings.push(hb);
        for (y = y0; y < y0 + BH; y++) for (x = hx; x < hx + 4; x++) set(x, y, TILE.BUILDING);
        var spec = HALF[bx + "," + by + "," + side];
        var dx = hx + 1 + Math.floor(rng() * 2);
        var door = { x: dx, y: y0 + BH - 1, fx: dx, fy: y0 + BH, district: dist, building: hb };
        if (spec) {
          door.kind = spec.kind; door.label = spec.label; door.knocker = spec.knocker;
          if (spec.local) door.local = spec.local;
          door.colour = spec.colour;
          if (spec.lm) door.lm = spec.lm;
          hb.label = spec.label;
          world.signs.push({ x: hx + 2, y: y0 - 0.3, text: spec.label, small: true });
        } else {
          door.kind = "resident";
          door.knocker = U.pick(rng, BK.DISTRICT_KNOCKERS[dist]);
          door.colour = U.pick(rng, BK.COLOURS).id;
        }
        hb.door = addDoor(door);
      }
    }
    // street lamps at every crossing
    for (var cy = 0; cy <= ROWS; cy++) for (var cx = 0; cx <= COLS; cx++) {
      var lx = cx * 10 + 1, ly = cy * 9 + 1;
      if (ly > 46) ly = 46;
      if (get(lx, ly) === TILE.STREET || get(lx, ly) === TILE.PLAZA) world.lamps.push({ x: lx + 0.5, y: ly + 0.5 });
    }
    for (x = 4; x < W; x += 9) world.lamps.push({ x: x + 0.5, y: 47.2 });
    world.start = { x: 3, y: 2 + 3 * 9 + BH }; // in front of your lodging
    var home = world.doors.filter(function (d) { return d.kind === "home"; })[0];
    world.start = { x: home.fx, y: home.fy };
  }

  /* ---------- pathfinding (BFS on the tile grid) ---------- */
  world.path = function (sx, sy, tx, ty) {
    if (world.isSolid(tx, ty)) return null;
    var prev = new Int32Array(W * H).fill(-1);
    var start = sy * W + sx, goal = ty * W + tx;
    var q = [start]; prev[start] = start;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      var cur = q.shift();
      if (cur === goal) break;
      var cx = cur % W, cy = (cur / W) | 0;
      for (var i = 0; i < 4; i++) {
        var nx = cx + dirs[i][0], ny = cy + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx;
        if (prev[n] !== -1 || world.isSolid(nx, ny)) continue;
        prev[n] = cur; q.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    var out = [], c = goal;
    while (c !== start) { out.push({ x: c % W, y: (c / W) | 0 }); c = prev[c]; }
    return out.reverse();
  };

  /* ---------- static prerender ---------- */
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = U.clamp(Math.round(r * f), 0, 255); g = U.clamp(Math.round(g * f), 0, 255); b = U.clamp(Math.round(b * f), 0, 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  world.shade = shade;

  world.prerender = function () {
    var c = document.createElement("canvas");
    c.width = W * T; c.height = H * T;
    var g = c.getContext("2d");
    var rng = U.mulberry32(42);
    var x, y, i;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var t = get(x, y), px = x * T, py = y * T;
      if (t === TILE.STREET || t === TILE.BUILDING || t === TILE.DOOR) {
        g.fillStyle = "#3d3a38"; g.fillRect(px, py, T, T);
        for (i = 0; i < 6; i++) {
          g.fillStyle = rng() < 0.5 ? "#4a4642" : "#34312f";
          g.fillRect(px + Math.floor(rng() * 14), py + Math.floor(rng() * 14), 3 + Math.floor(rng() * 2), 2);
        }
      } else if (t === TILE.PLAZA || t === TILE.FOUNTAIN) {
        g.fillStyle = "#5a5650"; g.fillRect(px, py, T, T);
        g.strokeStyle = "#4a4640"; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      } else if (t === TILE.GRASS || t === TILE.TREE || t === TILE.GRAVE) {
        g.fillStyle = "#2f4a2a"; g.fillRect(px, py, T, T);
        for (i = 0; i < 5; i++) { g.fillStyle = rng() < 0.5 ? "#3a5a32" : "#273f23"; g.fillRect(px + Math.floor(rng() * 15), py + Math.floor(rng() * 15), 1, 2); }
      } else if (t === TILE.TOWPATH) {
        g.fillStyle = "#4a4032"; g.fillRect(px, py, T, T);
        for (i = 0; i < 4; i++) { g.fillStyle = "#5a4e3c"; g.fillRect(px + Math.floor(rng() * 14), py + Math.floor(rng() * 14), 2, 1); }
      } else if (t === TILE.WATER) {
        g.fillStyle = "#16242e"; g.fillRect(px, py, T, T);
      } else if (t === TILE.BANK) {
        g.fillStyle = "#2a3326"; g.fillRect(px, py, T, T);
        g.fillStyle = "#5a5246"; g.fillRect(px, py, T, 3);
      } else if (t === TILE.LOCK) {
        g.fillStyle = "#16242e"; g.fillRect(px, py, T, T);
        g.fillStyle = "#5a4630"; g.fillRect(px + 2, py, 12, T);
        g.fillStyle = "#3a2c1e"; for (i = 0; i < 4; i++) g.fillRect(px + 2, py + i * 4, 12, 1);
      }
      if (t === TILE.TREE) {
        g.fillStyle = "#3a2a1a"; g.fillRect(px + 7, py + 9, 3, 6);
        g.fillStyle = "#1e3a1c"; g.beginPath(); g.arc(px + 8, py + 7, 7, 0, 6.3); g.fill();
        g.fillStyle = "#2a4e26"; g.beginPath(); g.arc(px + 6, py + 5, 3, 0, 6.3); g.fill();
      } else if (t === TILE.GRAVE) {
        g.fillStyle = "#7a7a76"; g.fillRect(px + 5, py + 4, 6, 9); g.beginPath(); g.arc(px + 8, py + 4, 3, Math.PI, 0); g.fill();
        g.fillStyle = "#5a5a56"; g.fillRect(px + 7, py + 6, 2, 5); g.fillRect(px + 6, py + 7, 4, 1);
      }
    }
    // canal edge stones
    g.fillStyle = "#6a6458"; g.fillRect(0, 49 * T, W * T, 2);
    // fountain
    var sq = world.spots.filter(function (s) { return s.id === "square"; })[0];
    if (sq) {
      var fx = (sq.x + 2) * T, fy = (sq.y + 2) * T;
      g.fillStyle = "#77736a"; g.beginPath(); g.arc(fx, fy, 15, 0, 6.3); g.fill();
      g.fillStyle = "#1e3440"; g.beginPath(); g.arc(fx, fy, 12, 0, 6.3); g.fill();
      g.fillStyle = "#8a867c"; g.fillRect(fx - 2, fy - 8, 4, 10);
      g.fillStyle = "#c0a050"; g.beginPath(); g.arc(fx, fy - 9, 3, 0, 6.3); g.fill();
    }
    // buildings
    world.buildings.forEach(function (b) {
      var bx = b.x * T, by = b.y * T, bw = b.w * T, bh = b.h * T;
      var facadeH = 2 * T + 4;
      var roofH = bh - facadeH;
      // roof
      g.fillStyle = b.roof; g.fillRect(bx, by, bw, roofH);
      g.fillStyle = shade(b.roof, 1.25); g.fillRect(bx, by, bw, 3);
      g.fillStyle = shade(b.roof, 0.75);
      for (var ry = by + 6; ry < by + roofH; ry += 5) g.fillRect(bx, ry, bw, 1);
      g.fillStyle = shade(b.roof, 0.6); g.fillRect(bx, by + roofH - 3, bw, 3);
      // chimney pots
      if (!b.lm || b.lm === "tavern") {
        g.fillStyle = shade(b.wall, 0.8); g.fillRect(bx + bw - 14, by + 4, 6, 10);
        g.fillStyle = "#222"; g.fillRect(bx + bw - 13, by + 3, 4, 2);
      }
      // facade
      var fy0 = by + roofH;
      g.fillStyle = b.wall; g.fillRect(bx, fy0, bw, facadeH);
      g.fillStyle = shade(b.wall, 0.85);
      for (var yy = fy0 + 3; yy < fy0 + facadeH; yy += 4) for (var xx = bx + ((yy / 4) % 2 ? 0 : 3); xx < bx + bw; xx += 7) g.fillRect(xx, yy, 1, 3);
      for (var yy2 = fy0 + 2; yy2 < fy0 + facadeH; yy2 += 4) g.fillRect(bx, yy2, bw, 1);
      // windows
      var doorCol = b.door ? b.door.x : -1;
      for (var wx = b.x; wx < b.x + b.w; wx++) {
        if (wx === doorCol) continue;
        var wpx = wx * T + 4;
        g.fillStyle = "#1a1612"; g.fillRect(wpx - 1, fy0 + 5, 10, 11);
        g.fillStyle = rng() < 0.45 ? "#c8a050" : "#202838"; g.fillRect(wpx, fy0 + 6, 8, 9);
        g.fillStyle = "#1a1612"; g.fillRect(wpx + 3, fy0 + 6, 1, 9); g.fillRect(wpx, fy0 + 10, 8, 1);
        g.fillStyle = shade(b.wall, 1.2); g.fillRect(wpx - 1, fy0 + 16, 10, 2);
      }
      // landmark decorations
      if (b.lm === "church") {
        g.fillStyle = "#4a4e58"; g.fillRect(bx + bw / 2 - 10, by - 6, 20, roofH + 6);
        g.fillStyle = "#5a5e68"; g.beginPath(); g.moveTo(bx + bw / 2 - 12, by + 2); g.lineTo(bx + bw / 2, by - 22); g.lineTo(bx + bw / 2 + 12, by + 2); g.fill();
        g.fillStyle = "#c0a050"; g.fillRect(bx + bw / 2 - 1, by - 34, 2, 12); g.fillRect(bx + bw / 2 - 5, by - 30, 10, 2);
        g.fillStyle = "#c8a050"; g.beginPath(); g.arc(bx + bw / 2, by + 14, 6, 0, 6.3); g.fill();
        g.fillStyle = "#2a2a2a"; g.fillRect(bx + bw / 2 - 0.5, by + 9, 1, 5); g.fillRect(bx + bw / 2, by + 13.5, 4, 1);
      } else if (b.lm === "mill") {
        g.fillStyle = "#5a2a1e"; g.fillRect(bx + bw - 22, by - 30, 12, roofH + 30);
        g.fillStyle = "#3a1a12"; g.fillRect(bx + bw - 24, by - 32, 16, 4);
        g.fillStyle = "#9a8a6a"; g.font = "bold 9px serif"; g.fillText("CRAKE & CO.", bx + 6, by + 18);
      } else if (b.lm === "court") {
        g.fillStyle = "#b0aa9a";
        for (var col = 0; col < 6; col++) g.fillRect(bx + 10 + col * 20, fy0 + 2, 5, facadeH - 2);
        g.beginPath(); g.moveTo(bx + 2, fy0); g.lineTo(bx + bw / 2, by + roofH - 26); g.lineTo(bx + bw - 2, fy0); g.fill();
      } else if (b.lm === "hall") {
        g.fillStyle = "#e0c070";
        for (var bl = 0; bl < 14; bl++) { g.beginPath(); g.arc(bx + 6 + bl * 9, fy0 + 2, 1.6, 0, 6.3); g.fill(); }
        g.fillStyle = "#2a0a12"; g.fillRect(bx + 20, by + 10, bw - 40, 18);
        g.fillStyle = "#f0d080"; g.font = "bold 11px serif"; g.fillText("EMPIRE", bx + bw / 2 - 22, by + 23);
      } else if (b.lm === "tavern") {
        g.fillStyle = "#2a1a0a"; g.fillRect(bx + bw / 2 + 18, fy0 + 2, 18, 14);
        g.fillStyle = "#4a7a8a"; g.fillRect(bx + bw / 2 + 20, fy0 + 4, 14, 10);
        g.fillStyle = "#d8c090"; g.fillRect(bx + bw / 2 + 24, fy0 + 7, 6, 2);
      } else if (b.lm === "warehouse") {
        g.fillStyle = "#3a3026"; g.fillRect(bx + 14, fy0 + 3, 28, facadeH - 3); g.fillRect(bx + bw - 42, fy0 + 3, 28, facadeH - 3);
        g.strokeStyle = "#5a4a38"; g.beginPath(); g.moveTo(bx + 14, fy0 + 3); g.lineTo(bx + 42, fy0 + facadeH); g.moveTo(bx + 42, fy0 + 3); g.lineTo(bx + 14, fy0 + facadeH); g.stroke();
      }
    });
    // doors
    world.doors.forEach(function (d) {
      var px = d.x * T, py = d.y * T;
      g.fillStyle = "#1a120c"; g.fillRect(px + 2, py - 6, 12, 22);
      var col = BK.COLOURS.filter(function (c) { return c.id === d.colour; })[0].hex;
      g.fillStyle = col; g.fillRect(px + 3, py - 5, 10, 21);
      g.fillStyle = shade(col, 1.4); g.fillRect(px + 4, py - 3, 3, 7); g.fillRect(px + 9, py - 3, 3, 7); g.fillRect(px + 4, py + 6, 3, 8); g.fillRect(px + 9, py + 6, 3, 8);
      g.fillStyle = "#555"; g.fillRect(px + 1, py + 15, 14, 1);
    });
    // boats
    world.boats.forEach(function (b) {
      var px = b.x * T, py = b.y * T;
      g.fillStyle = "#3a2a1a"; g.fillRect(px, py, b.len * T, 12);
      g.fillStyle = "#5a4028"; g.fillRect(px + 2, py + 2, b.len * T - 4, 3);
      g.fillStyle = "#2a3a2a"; g.fillRect(px + 10, py - 4, 12, 7);
    });
    world.canvas = c;
    return c;
  };

  build();
  world.TILE = TILE;
  BK.world = world;
})();
