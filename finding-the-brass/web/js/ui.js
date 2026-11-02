/* Finding the Brass — HTML interface: dialogs, card reveals, HUD, Little Black Book, bag, shop, title. */
"use strict";
(function () {
  var U = BK.util;
  var ui = BK.ui = {};
  var $ = function (id) { return document.getElementById(id); };
  var modalOpen = false, current = null;
  ui.isOpen = function () { return modalOpen; };

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
    g.beginPath(); g.arc(16, 10, 6, 0, 6.3); g.fill();
    g.fillStyle = "#2a1a10";
    if (kind === "lion") { g.fillRect(13, 9, 2, 2); g.fillRect(17, 9, 2, 2); g.fillRect(15, 12, 2, 1); }
    else if (kind === "fox") { g.beginPath(); g.moveTo(11, 6); g.lineTo(13, 2); g.lineTo(15, 6); g.fill(); g.beginPath(); g.moveTo(17, 6); g.lineTo(19, 2); g.lineTo(21, 6); g.fill(); g.fillRect(13, 10, 2, 1); g.fillRect(17, 10, 2, 1); }
    else if (kind === "owl") { g.beginPath(); g.arc(14, 10, 1.5, 0, 6.3); g.arc(18, 10, 1.5, 0, 6.3); g.fill(); }
    else if (kind === "rose") { g.beginPath(); g.arc(16, 10, 3, 0, 6.3); g.stroke(); g.beginPath(); g.arc(16, 10, 1.2, 0, 6.3); g.fill(); }
    else if (kind === "anchor") { g.fillRect(15, 6, 2, 8); g.fillRect(13, 8, 6, 1); }
    else if (kind === "hand") { g.fillRect(14, 7, 1, 5); g.fillRect(16, 6, 1, 6); g.fillRect(18, 7, 1, 5); }
    else if (kind === "mermaid") { g.beginPath(); g.moveTo(14, 7); g.quadraticCurveTo(20, 10, 15, 14); g.stroke(); }
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
    p.className = o.wide && o.art ? "wide" : "";
    var main = p;
    if (o.wide && o.art) {
      var lay = document.createElement("div"); lay.className = "lady-layout";
      var artCol = document.createElement("div"); artCol.className = "art-col";
      artCol.innerHTML = o.card ? "<div class='card flip'><div class='card-inner'><div class='card-back'><div class='cb-door'><div class='cb-knocker'></div></div></div><div class='card-front'>" + o.art + "</div></div></div>" : "<div class='card'><div class='card-front still'>" + o.art + "</div></div>";
      lay.appendChild(artCol);
      main = document.createElement("div"); main.className = "text-col";
      lay.appendChild(main);
      p.appendChild(lay);
    }
    var head = document.createElement("div"); head.className = "phead";
    if (o.art && !o.wide) { var a = document.createElement("div"); a.className = "head-art"; a.innerHTML = o.art; head.appendChild(a); }
    else if (o.knocker && !o.art) head.appendChild(ui.knockerIcon(o.knocker));
    var ht = document.createElement("div"); ht.className = "ptitle";
    ht.innerHTML = "<h2>" + U.esc(o.title || "") + "</h2>" + (o.sub ? "<div class='sub'>" + U.esc(o.sub) + "</div>" : "");
    head.appendChild(ht);
    if (!o.noClose) {
      var x = document.createElement("button"); x.className = "xbtn"; x.textContent = "✕"; x.setAttribute("aria-label", "Close");
      x.onclick = function () { ui.close(); };
      head.appendChild(x);
    }
    main.appendChild(head);
    var b = document.createElement("div"); b.className = "pbody"; b.innerHTML = o.body || "";
    if (o.node) b.appendChild(o.node);
    main.appendChild(b);
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
      main.appendChild(cs);
    }
    m.classList.add("show");
    p.scrollTop = 0;
    if (o.card) setTimeout(function () { var f = p.querySelector(".card.flip"); if (f) f.classList.add("turned"); }, 60);
    ui.hud();
  };
  function choose(c) {
    if (c.disabled) return;
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
    $("h-time").textContent = BK.game.clockText();
    $("h-night").textContent = "Night " + Math.min(S.night, BK.LEAVE.nights) + "/" + BK.LEAVE.nights;
    $("h-dist").textContent = BK.DISTRICT_NAMES[BK.world.district(S.px, S.py)];
    $("h-nerve").style.width = Math.round(100 * S.nerve / S.maxNerve) + "%";
    $("h-nerve-t").textContent = S.nerve + "/" + S.maxNerve;
    $("h-susp").style.width = S.suspicion + "%";
    $("h-susp-t").textContent = S.suspicion;
    $("h-coin").textContent = S.coin + "s";
    $("h-good").textContent = "★ " + S.good;
    $("h-lvl").textContent = "Lv " + S.level;
    $("h-xp").style.width = Math.round(100 * S.xp / BK.game.xpNext()) + "%";
    $("h-dose").style.display = S.dosed ? "" : "none";
  };

  ui.setAction = function (label) {
    var a = $("btn-act");
    if (label) { a.textContent = label; a.classList.add("ready"); }
    else { a.textContent = "·"; a.classList.remove("ready"); }
  };

  /* ---------- the Little Black Book ---------- */
  var bookTab = "ladies";
  ui.book = function (tab) {
    if (tab) bookTab = tab;
    var S = BK.game.state();
    var node = document.createElement("div");
    var bar = document.createElement("div"); bar.className = "tabs";
    [["ladies", "Ladies"], ["diary", "Diary"], ["map", "Map"]].forEach(function (t) {
      var b = document.createElement("button"); b.textContent = t[1]; if (t[0] === bookTab) b.className = "on";
      b.onclick = function () { ui.book(t[0]); };
      bar.appendChild(b);
    });
    node.appendChild(bar);
    var body = document.createElement("div"); body.className = "tabbody";
    if (bookTab === "ladies") {
      var ids = Object.keys(S.book).filter(function (id) { return S.ladies[id] && (S.book[id].seen || S.book[id].tip); });
      ids.sort(function (a, b) {
        var ea = S.book[a], eb = S.book[b];
        return (eb.sweetheart ? 10 : 0) + eb.stars - (ea.sweetheart ? 10 : 0) - ea.stars - (eb.known.dose ? 20 : 0) + (ea.known.dose ? 20 : 0);
      });
      if (!ids.length) body.innerHTML = "<p>No names yet. Knock on doors, or buy a round at the Drowned Man and listen to the gossip.</p>";
      else ids.forEach(function (id) {
        var L = S.ladies[id], e = S.book[id], d = BK.game.doorById(id);
        var row = document.createElement("div"); row.className = "lady-row" + (e.known.dose ? " dosed" : "") + (e.sweetheart ? " sweet" : "");
        var pic = e.seen ? BK.portraits.svg(BK.portraits.makeLady(L.seed, { tier: L.tier }), 64) : "<div class='unseen'>?</div>";
        var flags = [];
        if (e.sweetheart) flags.push("<span class='flag sweet'>♥ Sweet on you: free</span>");
        if (e.known.dose) flags.push("<span class='flag dose'>✖ Has the dose</span>");
        else if (e.known.clean) flags.push("<span class='flag clean'>✔ Clean</span>");
        if (e.known.thief) flags.push("<span class='flag thief'>$ Light fingers</span>");
        if (e.known.spark === "good") flags.push("<span class='flag clean'>Wonderful company</span>");
        if (e.known.spark === "bad") flags.push("<span class='flag'>Cold fish</span>");
        row.innerHTML = "<div class='lr-pic'>" + pic + "</div><div class='lr-info'><b>" + U.esc(L.name) + "</b>" + (L.legend ? " ♛" : "") +
          "<small>" + BK.TIERS[L.tier].name + " · " + (d.kind === "landmark" ? "Empire stage door" : BK.game.address(d) + " · " + BK.KNOCKERS[d.knocker].name + " knocker") + "</small>" +
          "<small>" + (e.seen ? "Asks " + L.price + "s" : "Not met yet") + (e.visits ? " · Your rating " + BK.game.stars(e.stars) + " (" + e.visits + " visit" + (e.visits > 1 ? "s" : "") + ")" : "") + "</small>" +
          "<div class='flags'>" + flags.join("") + "</div></div>";
        body.appendChild(row);
      });
    } else if (bookTab === "diary") {
      body.innerHTML = S.diary.length ? S.diary.map(function (c) {
        return "<div class='clue " + (c.kind === "dose" || c.kind === "bad" ? "dz" : c.kind === "great" ? "ev" : "") + "'><div class='src'>Night " + c.night + "</div>" + U.esc(c.text) + "</div>";
      }).join("") : "<p>Nothing to write home about yet.</p>";
    } else {
      body.appendChild(ui.minimap());
      var leg = document.createElement("div"); leg.className = "legend";
      leg.innerHTML = "<span><i style='background:#ff7ab0'></i>Lady you know of</span><span><i style='background:#ff3030'></i>Has the dose</span><span><i style='background:#ffd040'></i>Lady Lucinda</span><span><i style='background:#c8a050'></i>Landmark</span><span><i style='background:#9a7ad0'></i>Local</span><span><i style='background:#5a5048'></i>Other door</span><span><i style='background:#fff'></i>You</span>";
      body.appendChild(leg);
    }
    node.appendChild(body);
    ui.dialog({ title: "Little Black Book", sub: "Shore leave " + S.leave + " · Good Times " + S.good, node: node, choices: [] });
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
      var e = S.book[d.id], L = S.ladies[d.id], known = e && L && (e.seen || e.tip);
      g.fillStyle = known && e.known.dose ? "#ff3030" : known && L.legend ? "#ffd040" : known ? "#ff7ab0" : d.kind === "landmark" || d.kind === "home" ? "#c8a050" : d.kind === "local" ? "#9a7ad0" : "#5a5048";
      g.fillRect(d.x * sc - 1, d.y * sc - 1, sc + 2, sc + 2);
    });
    g.fillStyle = "#c8a050"; w.spots.forEach(function (s) { g.fillRect((s.x + 1) * sc, (s.y + 1) * sc, sc * 2, sc * 2); });
    g.font = "bold 8px sans-serif"; g.textAlign = "center";
    w.signs.forEach(function (s) {
      if (s.small || s.noMini) return;
      var yy = (s.my || s.y) * sc + 4;
      g.fillStyle = "rgba(0,0,0,0.7)"; g.fillText(s.text, s.x * sc + 1, yy + 1);
      g.fillStyle = "#fff"; g.fillText(s.text, s.x * sc, yy);
    });
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc((S.px + 0.5) * sc, (S.py + 0.5) * sc, 5, 0, 6.3); g.fill();
    g.strokeStyle = "#000"; g.lineWidth = 1.5; g.stroke();
    return c;
  };

  /* ---------- bag / character ---------- */
  ui.bag = function () {
    var S = BK.game.state();
    var node = document.createElement("div");
    var stats = "<table class='tbl stats'><tr><th>Charm</th><td>" + BK.game.stat("charm") + (S.dosed ? " (dosed −2)" : "") + "</td><th>Level</th><td>" + S.level + " (" + S.xp + "/" + BK.game.xpNext() + " XP)</td></tr>" +
      "<tr><th>Wits</th><td>" + BK.game.stat("wits") + "</td><th>Good Times</th><td>" + S.good + " (best ever " + BK.game.best() + ")</td></tr>" +
      "<tr><th>Grit</th><td>" + S.grit + "</td><th>Weapon</th><td>" + (S.equip.weapon ? BK.ITEMS[S.equip.weapon].name : "Bare fists") + "</td></tr>" +
      "<tr><th>Nerve</th><td>" + S.nerve + "/" + S.maxNerve + "</td><th>Clothing</th><td>" + (S.equip.wear ? BK.ITEMS[S.equip.wear].name : "Sailor's slops") + "</td></tr>" +
      "<tr><th>The dose</th><td>" + (S.dosed ? "<b style='color:#ff6060'>DOSED</b>" : "Clean") + "</td><th>Doses this leave</th><td>" + S.doses + " of " + BK.game.MAX_DOSES + "</td></tr></table>";
    var ids = Object.keys(S.inv);
    var list = ids.length ? ids.map(function (id) {
      var it = BK.ITEMS[id];
      var eq = it.equip && (S.equip[it.equip.slot] === id);
      var act = it.equip ? (eq ? "Remove" : "Equip") : it.use ? "Use" : "";
      return "<div class='item'><div><b>" + it.name + "</b> ×" + S.inv[id] + (eq ? " <em>(worn)</em>" : "") + "<small>" + it.desc + "</small></div>" + (act ? "<button data-id='" + id + "'>" + act + "</button>" : "") + "</div>";
    }).join("") : "<p>Your bag is empty.</p>";
    node.innerHTML = stats + "<h3>Bag · " + S.coin + " shillings</h3>" + list;
    node.querySelectorAll("button[data-id]").forEach(function (b) {
      b.onclick = function () { BK.game.useItem(b.getAttribute("data-id")); if (!ui.isOpen() || current && current.title === "Jack Halyard") ui.bag(); };
    });
    ui.dialog({ title: "Jack Halyard", sub: "Able seaman, brig Gannet", art: BK.portraits.svg(BK.portraits.makeMan("jack-halyard", { hat: "sailor", coat: "#1c2c5e", hair: "#5a3a1a", tache: false, scowl: false })), node: node, choices: [] });
  };

  /* ---------- shop ---------- */
  ui.shop = function (mode) {
    mode = mode || "buy";
    var S = BK.game.state();
    var node = document.createElement("div");
    var tabs = "<div class='tabs'><button class='" + (mode === "buy" ? "on" : "") + "' data-m='buy'>Buy</button><button class='" + (mode === "sell" ? "on" : "") + "' data-m='sell'>Pawn</button></div>";
    var rows;
    if (mode === "buy") {
      rows = BK.SHOP_STOCK.map(function (id) {
        var it = BK.ITEMS[id], p = BK.game.priceOf(id);
        return "<div class='item'><div><b>" + it.name + "</b> · " + p + "s<small>" + it.desc + "</small></div><button data-id='" + id + "'" + (S.coin < p ? " disabled" : "") + ">Buy</button></div>";
      }).join("");
    } else {
      var ids = Object.keys(S.inv);
      rows = ids.length ? ids.map(function (id) {
        var it = BK.ITEMS[id];
        return "<div class='item'><div><b>" + it.name + "</b> ×" + S.inv[id] + " · Fenn gives " + Math.max(1, Math.floor(it.price / 2)) + "s</div><button data-id='" + id + "'>Pawn</button></div>";
      }).join("") : "<p>Nothing to pawn.</p>";
    }
    node.innerHTML = tabs + "<p>You have <b>" + S.coin + "</b> shillings.</p>" + rows;
    node.querySelectorAll(".tabs button").forEach(function (b) { b.onclick = function () { ui.shop(b.getAttribute("data-m")); }; });
    node.querySelectorAll("button[data-id]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-id");
        if (mode === "buy") { if (BK.game.buy(id)) ui.toast("Bought " + BK.ITEMS[id].name + "."); }
        else if (BK.game.sell(id)) ui.toast("Pawned " + BK.ITEMS[id].name + ".");
        ui.shop(mode);
      };
    });
    ui.dialog({ title: "Fenn's Pawnshop", sub: "“Everything has a price, sailor.”", art: BK.portraits.svg(BK.portraits.makeMan("local:fenn", { coat: "#3a3a20", hair: "#222222", hat: "cap" })), node: node, choices: [] });
  };

  /* ---------- story screens ---------- */
  ui.intro = function (again) {
    var S = BK.game.state();
    var pages = again ? ["Seven months at sea, a hold full of cargo, and the Gannet is back in Brassmoor. Captain Ruddock hands out the pay: " + BK.LEAVE.pay + " shillings, and " + BK.LEAVE.nights + " nights' shore leave.",
      "The ladies have moved house since last time: new faces behind new doors, and the dose is doing the rounds again. Prices are up a little too. Good luck, Jack."] : BK.INTRO.slice();
    var i = 0;
    function show() {
      var last = i === pages.length - 1;
      ui.dialog({
        title: again ? "Shore leave " + S.leave : "Finding the Brass", sub: "Brassmoor, 1887",
        body: "<p class='story'>" + pages[i] + "</p>" + (last ? "<p class='hint'>Tip: rose knockers are almost always brass houses. Lions can mean a courtesan, or a rich man calling the constables. Your Little Black Book (B) keeps track of every lady you meet.</p>" : ""),
        choices: [{ label: last ? "Step ashore" : "Continue", fn: function () { if (!last) { i++; show(); } else { ui.toast("Night " + S.night + " · 8:00pm · " + S.coin + " shillings in your pocket"); BK.game.save(); } } }],
        noClose: true
      });
    }
    show();
  };

  ui.help = function () {
    ui.dialog({
      title: "How to play", sub: "Knock on doors. Take your chances. Avoid the dose.",
      body: "<table class='tbl'>" +
        "<tr><th>Goal</th><td>You're a sailor with " + BK.LEAVE.nights + " nights of shore leave and " + BK.LEAVE.pay + " shillings. Have as many <b>Good Times</b> as you can before your ship sails.</td></tr>" +
        "<tr><th>Knocking</th><td>Walk up to a door and press <b>Knock</b>. The knocker gives you the odds: rose doors are almost always brass houses; lion doors might be a courtesan or an angry gentleman; hand doors will just lecture you.</td></tr>" +
        "<tr><th>The ladies</th><td>When a lady answers you see her, her looks and her price. Pay and go up to her room, haggle (Charm), buy her a drink, give her violets, or look her over (Wits) before you decide.</td></tr>" +
        "<tr><th>Luck of the draw</th><td>Every night upstairs is a gamble: anything from <b>the night of your life</b> to <b>a disaster</b>. She might lift your purse, or her fancy-man might demand more money. If she falls for you, she won't charge you again.</td></tr>" +
        "<tr><th>The dose</th><td>Some ladies have it. Go up to the wrong room with the wrong brass and you <b>will</b> catch it: Good Times −10, Charm −2 and Nerve lost every day. Three doses ends your shore leave. Gossip, Mrs Vane, the matron and a careful look can warn you. Cure it at the Lock Hospital, Dr Pell's or with mercury pills.</td></tr>" +
        "<tr><th>Money</th><td>Ladies, drinks, cures, fines and fancy-men all cost money. Earn more by working the docks by day, singing at the music hall, dice, or your captain's advance.</td></tr>" +
        "<tr><th>Nerve / Suspicion</th><td>Nerve is your health. Suspicion builds when you hammer on doors: too much and the constables stop you; at 100 you're arrested.</td></tr>" +
        "<tr><th>Controls</th><td>D-pad or arrows/WASD to walk, or tap the map to walk there. <b>E/Space</b> knock · <b>B</b> Little Black Book · <b>I</b> bag · <b>1–9</b> pick an option · <b>Esc</b> close.</td></tr>" +
        "</table>",
      choices: []
    });
  };

  ui.title = function () {
    $("title").classList.add("show");
    $("hud").classList.remove("show");
    $("controls").classList.remove("show");
    $("t-continue").style.display = BK.game.hasSave() ? "" : "none";
    var b = BK.game.best();
    $("t-best").textContent = b ? "Best shore leave: " + b + " Good Times · " + BK.game.rank(b) : "";
  };
  ui.hideTitle = function () {
    $("title").classList.remove("show");
    $("hud").classList.add("show");
    $("controls").classList.add("show");
  };
})();
