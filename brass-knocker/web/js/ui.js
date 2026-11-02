/* The Brass Knocker — HTML interface: dialogs, HUD, notebook, bag, shop, title. */
"use strict";
(function () {
  var U = BK.util;
  var ui = BK.ui = {};
  var $ = function (id) { return document.getElementById(id); };
  var modalOpen = false, current = null;
  ui.isOpen = function () { return modalOpen; };

  /* ---------- portraits (drawn procedurally) ---------- */
  ui.portrait = function (p, size) {
    size = size || 72;
    var c = document.createElement("canvas");
    c.width = 48; c.height = 48; c.className = "portrait";
    c.style.width = size + "px"; c.style.height = size + "px";
    var g = c.getContext("2d");
    var rng = U.mulberry32(U.hash(p.seed || "x"));
    g.fillStyle = "#1c1814"; g.fillRect(0, 0, 48, 48);
    g.fillStyle = "rgba(200,160,80,0.15)"; g.beginPath(); g.arc(24, 20, 22, 0, 6.3); g.fill();
    // shoulders
    g.fillStyle = p.coat || "#333"; g.beginPath(); g.ellipse(24, 50, 20, 14, 0, 0, 6.3); g.fill();
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(22, 38, 4, 10);
    // neck & head
    var skin = p.skin || "#e0c0a0";
    g.fillStyle = skin; g.fillRect(20, 30, 8, 7);
    g.beginPath(); g.ellipse(24, 22, 9, 11, 0, 0, 6.3); g.fill();
    // hair
    g.fillStyle = p.hair || "#222";
    g.beginPath(); g.ellipse(24, 15, 10, 6, 0, Math.PI, 0); g.fill();
    if (rng() < 0.5) { g.fillRect(14, 14, 3, 12); g.fillRect(31, 14, 3, 12); }
    // eyes & mouth
    g.fillStyle = "#1a1010"; g.fillRect(19, 21, 2, 2); g.fillRect(27, 21, 2, 2);
    g.fillStyle = "rgba(120,40,40,0.8)"; g.fillRect(21, 28, 6, 1);
    if (rng() < 0.35) { g.fillStyle = p.hair || "#222"; g.fillRect(19, 26, 10, 2); } // moustache
    // hats
    var hat = p.hat;
    if (hat === "top") { g.fillStyle = "#111"; g.fillRect(16, 2, 16, 11); g.fillRect(12, 12, 24, 3); }
    else if (hat === "bowler") { g.fillStyle = "#1a1a1a"; g.beginPath(); g.ellipse(24, 11, 9, 7, 0, Math.PI, 0); g.fill(); g.fillRect(13, 11, 22, 2); }
    else if (hat === "cap") { g.fillStyle = "#3a3a30"; g.beginPath(); g.ellipse(24, 12, 11, 6, 0, Math.PI, 0); g.fill(); g.fillRect(24, 11, 13, 2); }
    else if (hat === "bonnet") { g.fillStyle = p.coat || "#4a2a3a"; g.beginPath(); g.ellipse(24, 16, 13, 12, 0, Math.PI, 0); g.fill(); g.fillStyle = "#c8b090"; g.fillRect(12, 16, 3, 10); g.fillRect(33, 16, 3, 10); }
    else if (hat === "feather") { g.fillStyle = "#2a1020"; g.fillRect(15, 8, 18, 4); g.strokeStyle = "#e0d0f0"; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 9); g.quadraticCurveTo(40, 0, 44, 6); g.stroke(); }
    else if (hat === "helmet") { g.fillStyle = "#101830"; g.beginPath(); g.ellipse(24, 10, 9, 10, 0, Math.PI, 0); g.fill(); g.fillRect(14, 9, 20, 3); g.fillStyle = "#c0a050"; g.fillRect(23, 3, 2, 3); }
    g.strokeStyle = "#7a6030"; g.lineWidth = 2; g.strokeRect(1, 1, 46, 46);
    return c;
  };

  ui.knockerIcon = function (kind, size) {
    size = size || 56;
    var c = document.createElement("canvas");
    c.width = 32; c.height = 32; c.className = "knocker-ico";
    c.style.width = size + "px"; c.style.height = size + "px";
    var g = c.getContext("2d");
    var col = (BK.KNOCKERS[kind] || BK.KNOCKERS.ring).color;
    g.fillStyle = "#2a1a10"; g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#3a2618"; g.fillRect(3, 0, 26, 32);
    var grad = g.createRadialGradient(13, 11, 1, 16, 14, 12);
    grad.addColorStop(0, "#fff0b0"); grad.addColorStop(0.4, col); grad.addColorStop(1, "#5a4010");
    g.fillStyle = grad; g.strokeStyle = grad;
    // mount
    g.beginPath(); g.arc(16, 10, 6, 0, 6.3); g.fill();
    g.fillStyle = "#2a1a10";
    if (kind === "lion") { g.fillRect(13, 9, 2, 2); g.fillRect(17, 9, 2, 2); g.fillRect(15, 12, 2, 1); }
    else if (kind === "fox") { g.beginPath(); g.moveTo(11, 6); g.lineTo(13, 2); g.lineTo(15, 6); g.fill(); g.beginPath(); g.moveTo(17, 6); g.lineTo(19, 2); g.lineTo(21, 6); g.fill(); g.fillRect(13, 10, 2, 1); g.fillRect(17, 10, 2, 1); }
    else if (kind === "owl") { g.beginPath(); g.arc(14, 10, 1.5, 0, 6.3); g.arc(18, 10, 1.5, 0, 6.3); g.fill(); }
    else if (kind === "rose") { g.beginPath(); g.arc(16, 10, 3, 0, 6.3); g.stroke(); g.beginPath(); g.arc(16, 10, 1.2, 0, 6.3); g.fill(); }
    else if (kind === "anchor") { g.fillRect(15, 6, 2, 8); g.fillRect(13, 8, 6, 1); }
    else if (kind === "hand") { g.fillRect(14, 7, 1, 5); g.fillRect(16, 6, 1, 6); g.fillRect(18, 7, 1, 5); }
    else if (kind === "mermaid") { g.beginPath(); g.moveTo(14, 7); g.quadraticCurveTo(20, 10, 15, 14); g.stroke(); }
    // ring
    g.strokeStyle = grad; g.lineWidth = 3;
    g.beginPath(); g.arc(16, 20, 7, 0, 6.3); g.stroke();
    g.fillStyle = "#fff8d0"; g.fillRect(11, 15, 2, 2);
    return c;
  };

  /* ---------- dialog ---------- */
  ui.dialog = function (o) {
    current = o;
    modalOpen = true;
    $("toast").classList.remove("show");
    var m = $("modal"), p = $("panel");
    p.innerHTML = "";
    var head = document.createElement("div"); head.className = "phead";
    if (o.portrait) head.appendChild(ui.portrait(o.portrait));
    else if (o.knocker) head.appendChild(ui.knockerIcon(o.knocker));
    var ht = document.createElement("div"); ht.className = "ptitle";
    ht.innerHTML = "<h2>" + U.esc(o.title || "") + "</h2>" + (o.sub ? "<div class='sub'>" + U.esc(o.sub) + "</div>" : "");
    head.appendChild(ht);
    if (!o.noClose) {
      var x = document.createElement("button"); x.className = "xbtn"; x.textContent = "✕"; x.setAttribute("aria-label", "Close");
      x.onclick = function () { ui.close(); };
      head.appendChild(x);
    }
    p.appendChild(head);
    var b = document.createElement("div"); b.className = "pbody"; b.innerHTML = o.body || "";
    if (o.node) b.appendChild(o.node);
    p.appendChild(b);
    if (o.choices && o.choices.length) {
      var cs = document.createElement("div"); cs.className = "choices";
      o.choices.forEach(function (c, i) {
        var btn = document.createElement("button");
        btn.className = "choice";
        btn.disabled = !!c.disabled;
        btn.innerHTML = "<span class='k'>" + (i + 1) + "</span><span class='l'>" + U.esc(c.label) + (c.note ? "<small>" + U.esc(c.note) + "</small>" : "") + "</span>";
        btn.onclick = function () { choose(c); };
        cs.appendChild(btn);
      });
      p.appendChild(cs);
    }
    m.classList.add("show");
    p.scrollTop = 0;
    ui.hud();
  };
  function choose(c) {
    if (c.disabled) return;
    var o = current;
    modalOpen = false; current = null;
    $("modal").classList.remove("show");
    if (BK.sfx) BK.sfx.blip();
    if (c.fn) c.fn();
    ui.hud();
    if (!modalOpen) BK.game.afterModal();
    ui.hud();
  }
  ui.close = function () {
    if (!modalOpen) return;
    if (current && current.noClose) return;
    modalOpen = false; current = null;
    $("modal").classList.remove("show");
    ui.hud();
    BK.game.afterModal();
    ui.hud();
  };
  ui.pickByNumber = function (n) {
    if (!current || !current.choices) return;
    var c = current.choices[n - 1];
    if (c) choose(c);
  };

  /* ---------- toast ---------- */
  var toastTimer = null;
  ui.toast = function (msg) {
    var t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  };

  /* ---------- HUD ---------- */
  ui.hud = function () {
    var S = BK.game.state();
    if (!S) return;
    var ch = BK.CHAPTERS[S.chapter];
    $("h-time").textContent = BK.game.clockText();
    $("h-night").textContent = "Night " + S.night + "/" + ch.nights;
    $("h-dist").textContent = BK.DISTRICT_NAMES[BK.world.district(S.px, S.py)];
    $("h-nerve").style.width = Math.round(100 * S.nerve / S.maxNerve) + "%";
    $("h-nerve-t").textContent = S.nerve + "/" + S.maxNerve;
    $("h-susp").style.width = S.suspicion + "%";
    $("h-susp-t").textContent = S.suspicion;
    $("h-coin").textContent = S.coin + "s";
    $("h-lvl").textContent = "Lv " + S.level;
    $("h-xp").style.width = Math.round(100 * S.xp / BK.game.xpNext()) + "%";
  };

  ui.setAction = function (label) {
    var a = $("btn-act");
    if (label) { a.textContent = label; a.classList.add("ready"); }
    else { a.textContent = "·"; a.classList.remove("ready"); }
  };

  /* ---------- notebook ---------- */
  var nbTab = "case";
  ui.notebook = function (tab) {
    if (tab) nbTab = tab;
    var S = BK.game.state();
    var tabs = [["case", "Case"], ["clues", "Clues"], ["quests", "Favours"], ["secrets", "Secrets"], ["map", "Map"]];
    var node = document.createElement("div");
    var bar = document.createElement("div"); bar.className = "tabs";
    tabs.forEach(function (t) {
      var b = document.createElement("button"); b.textContent = t[1]; if (t[0] === nbTab) b.className = "on";
      b.onclick = function () { ui.notebook(t[0]); };
      bar.appendChild(b);
    });
    node.appendChild(bar);
    var body = document.createElement("div"); body.className = "tabbody";
    if (nbTab === "case") {
      var html = "<p class='hint'>Tap a row to cycle your own mark: ✗ cleared · ? doubtful · ★ guilty. Testimony marks itself automatically.</p><div class='grid3'>";
      ["suspect", "means", "place"].forEach(function (cat) {
        var list = BK.CATS[cat];
        var crossed = list.filter(function (o) { var n = S.notes[cat][o.id]; return n && n.m === "x"; }).length;
        html += "<div class='col'><h3>" + BK.CAT_LABEL[cat] + "</h3>";
        if (crossed === list.length) html += "<div class='warn'>Everything is crossed off. Somebody lied to you!</div>";
        list.forEach(function (o) {
          var n = S.notes[cat][o.id], m = n ? n.m : "";
          var sym = m === "x" ? "✗" : m === "?" ? "?" : m === "!" ? "★" : "";
          html += "<button class='nrow m" + (m === "x" ? "x" : m === "?" ? "q" : m === "!" ? "s" : "") + "' data-cat='" + cat + "' data-id='" + o.id + "'><span class='sym'>" + sym + "</span><span class='nm'>" + U.esc(o.name) +
            (n && n.src ? "<small>" + U.esc(n.src) + "</small>" : "") + "</span></button>";
        });
        html += "</div>";
      });
      html += "</div>";
      body.innerHTML = html;
      body.querySelectorAll(".nrow").forEach(function (b) {
        b.onclick = function () { BK.game.cycleMark(b.getAttribute("data-cat"), b.getAttribute("data-id")); ui.notebook("case"); };
      });
    } else if (nbTab === "clues") {
      body.innerHTML = S.clues.length ? S.clues.map(function (c) {
        return "<div class='clue" + (c.evidence ? " ev" : "") + "'><div class='src'>Night " + c.night + " · " + U.esc(c.src) + "</div>" + c.text + "</div>";
      }).join("") : "<p>No clues yet. Start knocking.</p>";
    } else if (nbTab === "quests") {
      var qs = S.quests.filter(function (q) { return q.state !== "unknown"; });
      body.innerHTML = qs.length ? "<table class='tbl'><tr><th>Item</th><th>Owner</th><th>Status</th></tr>" + qs.map(function (q) {
        var gd = BK.game.doorById(q.giver), r = S.residents[q.giver];
        var known = q.state !== "found";
        var st = q.state === "done" ? "Returned ✓" : S.inv[q.item] ? "In your bag: return it" : "Look in " + BK.DISTRICT_NAMES[BK.game.doorById(q.holder).district];
        return "<tr><td>" + BK.ITEMS[q.item].name + "</td><td>" + (known ? U.esc(r.name) + "<br><small>" + BK.game.address(gd) + "</small>" : "Unknown owner") + "</td><td>" + st + "</td></tr>";
      }).join("") + "</table>" : "<p>Nobody has asked you for a favour yet. Residents sometimes do, once they trust you.</p>";
    } else if (nbTab === "secrets") {
      var ids = Object.keys(S.secrets);
      body.innerHTML = ids.length ? "<table class='tbl'><tr><th>Who</th><th>Where</th><th>Secret</th></tr>" + ids.map(function (id) {
        var d = BK.game.doorById(id), r = S.residents[id];
        return "<tr><td>" + U.esc(r.name) + "</td><td>" + BK.game.address(d) + "<br><small>" + BK.KNOCKERS[d.knocker].name + " knocker</small></td><td>" + U.esc(r.secret) + "</td></tr>";
      }).join("") + "</table>" : "<p>No secrets yet. Rose-door sisters and taproom gossip are good places to hear them.</p>";
    } else if (nbTab === "map") {
      body.appendChild(ui.minimap());
      var leg = document.createElement("div"); leg.className = "legend";
      leg.innerHTML = "<span><i style='background:#e05050'></i>You</span><span><i style='background:#f0c040'></i>Landmark</span><span><i style='background:#c080f0'></i>Suspect</span><span><i style='background:#70a0d0'></i>Knocked tonight</span><span><i style='background:#7a6a50'></i>Door</span>";
      body.appendChild(leg);
    }
    node.appendChild(body);
    ui.dialog({ title: "Nell's Notebook", sub: BK.CHAPTERS[S.chapter].title + " · Victim: " + BK.CHAPTERS[S.chapter].victim, node: node, choices: [] });
  };

  ui.minimap = function () {
    var w = BK.world, S = BK.game.state();
    var c = document.createElement("canvas"); c.className = "minimap";
    var sc = 5; c.width = w.W * sc; c.height = w.H * sc;
    var g = c.getContext("2d");
    for (var y = 0; y < w.H; y++) for (var x = 0; x < w.W; x++) {
      var t = w.get(x, y);
      g.fillStyle = t === w.TILE.BUILDING || t === w.TILE.DOOR ? "#4a3a30" : t === w.TILE.WATER || t === w.TILE.LOCK ? "#1a3040" : t === w.TILE.GRASS || t === w.TILE.TREE || t === w.TILE.GRAVE ? "#2a4a28" : t === w.TILE.BANK ? "#223020" : "#6a6258";
      g.fillRect(x * sc, y * sc, sc, sc);
    }
    w.doors.forEach(function (d) {
      g.fillStyle = S.knocked[d.id] ? "#70a0d0" : d.kind === "landmark" || d.kind === "home" ? "#f0c040" : d.kind === "suspect" ? "#c080f0" : "#7a6a50";
      g.fillRect(d.x * sc - 1, d.y * sc - 1, sc + 2, sc + 2);
    });
    g.fillStyle = "#f0c040"; w.spots.forEach(function (s) { g.fillRect((s.x + 1) * sc, (s.y + 1) * sc, sc * 2, sc * 2); });
    g.font = "bold 8px sans-serif"; g.textAlign = "center";
    w.signs.forEach(function (s) {
      if (s.small || s.noMini) return;
      var yy = (s.my || s.y) * sc + 4;
      g.fillStyle = "rgba(0,0,0,0.7)"; g.fillText(s.text, s.x * sc + 1, yy + 1);
      g.fillStyle = "#fff"; g.fillText(s.text, s.x * sc, yy);
    });
    g.fillStyle = "#e05050"; g.beginPath(); g.arc((S.px + 0.5) * sc, (S.py + 0.5) * sc, 5, 0, 6.3); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
    return c;
  };

  /* ---------- bag / character ---------- */
  ui.bag = function () {
    var S = BK.game.state();
    var node = document.createElement("div");
    var stats = "<table class='tbl stats'><tr><th>Charm</th><td>" + BK.game.stat("charm") + (S.buffs.perfume ? " (perfumed)" : "") + "</td><th>Level</th><td>" + S.level + " (" + S.xp + "/" + BK.game.xpNext() + " XP)</td></tr>" +
      "<tr><th>Wits</th><td>" + BK.game.stat("wits") + (S.buffs.snuff ? " (snuff)" : "") + "</td><th>Reputation</th><td>" + S.rep + "</td></tr>" +
      "<tr><th>Grit</th><td>" + S.grit + "</td><th>Weapon</th><td>" + (S.equip.weapon ? BK.ITEMS[S.equip.weapon].name : "Bare hands") + "</td></tr>" +
      "<tr><th>Nerve</th><td>" + S.nerve + "/" + S.maxNerve + "</td><th>Clothing</th><td>" + (S.equip.wear ? BK.ITEMS[S.equip.wear].name : "Everyday dress") + "</td></tr></table>";
    var ids = Object.keys(S.inv);
    var list = ids.length ? ids.map(function (id) {
      var it = BK.ITEMS[id];
      var eq = it.equip && (S.equip[it.equip.slot] === id);
      var act = it.equip ? (eq ? "Remove" : "Equip") : it.use ? "Use" : "";
      return "<div class='item'><div><b>" + it.name + "</b> ×" + S.inv[id] + (eq ? " <em>(worn)</em>" : "") + "<small>" + it.desc + "</small></div>" + (act ? "<button data-id='" + id + "'>" + act + "</button>" : "") + "</div>";
    }).join("") : "<p>Your bag is empty.</p>";
    node.innerHTML = stats + "<h3>Bag · " + S.coin + " shillings</h3>" + list;
    node.querySelectorAll("button[data-id]").forEach(function (b) {
      b.onclick = function () { BK.game.useItem(b.getAttribute("data-id")); ui.bag(); };
    });
    ui.dialog({ title: "Nell Tanner", sub: "Your bag and your talents", portrait: { seed: "nell", coat: "#8a1a1a", hair: "#6a2a10", hat: "bonnet", skin: "#ecc8a8" }, node: node, choices: [] });
  };

  /* ---------- shop ---------- */
  ui.shop = function (mode) {
    mode = mode || "buy";
    var S = BK.game.state();
    var node = document.createElement("div");
    var tabs = "<div class='tabs'><button class='" + (mode === "buy" ? "on" : "") + "' data-m='buy'>Buy</button><button class='" + (mode === "sell" ? "on" : "") + "' data-m='sell'>Sell</button></div>";
    var rows;
    if (mode === "buy") {
      rows = BK.SHOP_STOCK.map(function (id) {
        var it = BK.ITEMS[id], p = BK.game.priceOf(id);
        return "<div class='item'><div><b>" + it.name + "</b> · " + p + "s<small>" + it.desc + "</small></div><button data-id='" + id + "'" + (S.coin < p ? " disabled" : "") + ">Buy</button></div>";
      }).join("");
    } else {
      var ids = Object.keys(S.inv).filter(function (id) { return !BK.ITEMS[id].quest; });
      rows = ids.length ? ids.map(function (id) {
        var it = BK.ITEMS[id];
        return "<div class='item'><div><b>" + it.name + "</b> ×" + S.inv[id] + " · sells for " + Math.max(1, Math.floor(it.price / 2)) + "s</div><button data-id='" + id + "'>Sell</button></div>";
      }).join("") : "<p>Nothing Fenn wants.</p>";
    }
    node.innerHTML = tabs + "<p>You have <b>" + S.coin + "</b> shillings." + (S.rep < 0 ? " Fenn charges you extra: your reputation's poor." : S.rep >= 30 ? " Fenn gives you a discount: your name's good." : "") + "</p>" + rows;
    node.querySelectorAll(".tabs button").forEach(function (b) { b.onclick = function () { ui.shop(b.getAttribute("data-m")); }; });
    node.querySelectorAll("button[data-id]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-id");
        if (mode === "buy") { if (BK.game.buy(id)) ui.toast("Bought " + BK.ITEMS[id].name + "."); }
        else if (BK.game.sell(id)) ui.toast("Sold " + BK.ITEMS[id].name + ".");
        ui.shop(mode);
      };
    });
    ui.dialog({ title: "Fenn's Pawnshop", sub: "“Everything has a price, Tanner.”", portrait: { seed: "fenn", coat: "#3a3a20", hair: "#222", hat: "cap", skin: "#e0c0a0" }, node: node, choices: [] });
  };

  /* ---------- accusation ---------- */
  ui.accuse = function () {
    var S = BK.game.state();
    var sel = { suspect: null, means: null, place: null };
    // pre-select starred items
    ["suspect", "means", "place"].forEach(function (cat) {
      BK.CATS[cat].forEach(function (o) { var n = S.notes[cat][o.id]; if (n && n.m === "!") sel[cat] = o.id; });
    });
    var node = document.createElement("div");
    function render() {
      var html = "<p>Choose one from each column. Rejected accusations so far: <b>" + S.strikes + " / 3</b>.</p><div class='grid3'>";
      ["suspect", "means", "place"].forEach(function (cat) {
        html += "<div class='col'><h3>" + BK.CAT_LABEL[cat] + "</h3>";
        BK.CATS[cat].forEach(function (o) {
          var n = S.notes[cat][o.id], m = n ? n.m : "";
          html += "<button class='nrow pick" + (sel[cat] === o.id ? " sel" : "") + (m === "x" ? " mx" : "") + "' data-cat='" + cat + "' data-id='" + o.id + "'><span class='sym'>" + (sel[cat] === o.id ? "●" : m === "x" ? "✗" : m === "!" ? "★" : m === "?" ? "?" : "") + "</span><span class='nm'>" + U.esc(o.name) + "</span></button>";
        });
        html += "</div>";
      });
      html += "</div>";
      var ready = sel.suspect && sel.means && sel.place;
      html += "<button class='big' id='acc-go'" + (ready ? "" : " disabled") + ">Lay the charge before the Magistrate</button>";
      node.innerHTML = html;
      node.querySelectorAll(".pick").forEach(function (b) {
        b.onclick = function () { sel[b.getAttribute("data-cat")] = b.getAttribute("data-id"); render(); };
      });
      node.querySelector("#acc-go").onclick = function () {
        modalOpen = false; current = null; $("modal").classList.remove("show");
        BK.game.accuse(sel.suspect, sel.means, sel.place);
        ui.hud();
        if (!modalOpen) BK.game.afterModal();
      };
    }
    render();
    ui.dialog({ title: "The Accusation", sub: "WHO did it, WITH WHAT, and WHERE", node: node, choices: [] });
  };

  /* ---------- story screens ---------- */
  ui.intro = function () {
    var S = BK.game.state(), ch = BK.CHAPTERS[S.chapter];
    var pages = ch.intro.slice();
    var i = 0;
    function show() {
      var last = i === pages.length - 1;
      ui.dialog({
        title: ch.title, sub: "The victim: " + ch.victim,
        body: "<p class='story'>" + pages[i] + "</p>" + (last ? "<p class='hint'>Tip: the design of each brass knocker tells you who lives behind the door. Check the Notebook (N) often.</p>" : ""),
        choices: [{ label: last ? "Step out into the night" : "Continue", fn: function () { if (!last) { i++; show(); } else { ui.toast("Night " + S.night + " · 8:00pm · " + BK.CHAPTERS[S.chapter].nights + " nights to solve it"); BK.game.save(); } } }],
        noClose: true
      });
    }
    show();
  };

  ui.help = function () {
    ui.dialog({
      title: "How to play", sub: "A detective RPG of doors and deduction",
      body: "<table class='tbl'>" +
        "<tr><th>Goal</th><td>Work out <b>who</b> killed the victim, <b>with what</b> and <b>where</b>, then make your accusation at the Magistrate's Court in Gaslight Square.</td></tr>" +
        "<tr><th>Doors</th><td>Walk up to a door and press <b>Knock</b>. The brass knocker design tells you who lives there: lions are wealthy, foxes may lie, roses are friends, and so on.</td></tr>" +
        "<tr><th>Clues</th><td>Testimony crosses innocent names off your notebook automatically. ★ marks hard evidence. You can also mark rows yourself.</td></tr>" +
        "<tr><th>Places</th><td>Visit the eight possible crime scenes and <b>search</b> them to rule them in or out.</td></tr>" +
        "<tr><th>Suspects</th><td>Each suspect has a door. Pick at their alibi (Wits) or accuse them to their face (risky).</td></tr>" +
        "<tr><th>Time</th><td>Each night runs from 8pm to 5am. Walking, knocking and searching all take time. Run out of nights and the case goes cold.</td></tr>" +
        "<tr><th>Nerve</th><td>Your health. Fights and insults wear it down. Eat, drink, pray or rest with the sisters.</td></tr>" +
        "<tr><th>Suspicion</th><td>Too much and constables will stop you. At 100 you're arrested.</td></tr>" +
        "<tr><th>Controls</th><td>Arrows/WASD or the d-pad to move, or tap the map to walk there. <b>E/Space</b> knock or act · <b>N</b> notebook · <b>B</b> bag · <b>1–9</b> pick an option · <b>Esc</b> close.</td></tr>" +
        "</table>",
      choices: []
    });
  };

  ui.title = function () {
    $("title").classList.add("show");
    $("hud").classList.remove("show");
    $("controls").classList.remove("show");
    $("t-continue").style.display = BK.game.hasSave() ? "" : "none";
  };
  ui.hideTitle = function () {
    $("title").classList.remove("show");
    $("hud").classList.add("show");
    $("controls").classList.add("show");
  };
})();
