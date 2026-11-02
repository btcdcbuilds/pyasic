/* Finding the Brass — rules, state and story flow. */
"use strict";
(function () {
  var U = BK.util, WD = BK.world;
  var G = BK.game = {};
  var S = null;
  var NIGHT_LEN = 540;           // 8pm to 5am, in minutes
  var SAVE_KEY = "findingthebrass.save.v1";
  var MAX_DOSES = 3;
  G.NIGHT_LEN = NIGHT_LEN;
  G.MAX_DOSES = MAX_DOSES;

  function R() { return Math.random(); }
  function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
  function ui() { return BK.ui; }
  function sfx(n) { if (BK.sfx && BK.sfx[n]) BK.sfx[n].apply(null, Array.prototype.slice.call(arguments, 1)); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function chapter() { return BK.CHAPTERS[S.chapter]; }
  function nick() { return chapter().nickname; }
  function doorById(id) { for (var i = 0; i < WD.doors.length; i++) if (WD.doors[i].id === id) return WD.doors[i]; return null; }
  function attr(d, cat) { return cat === "district" ? d.district : cat === "colour" ? d.colour : d.knocker; }
  function valName(cat, id) { var o = byId(BK.CATS[cat], id); return o ? o.name : id; }
  function colourWord(id) { return id; }
  function knockerWord(id) { return BK.KNOCKERS[id].name.toLowerCase(); }
  G.doorById = doorById;
  G.valName = valName;
  G.attr = attr;

  /* ============ state ============ */
  G.state = function () { return S; };
  G.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  G.save = function () {
    if (!S || S.over) return false;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch (e) { return false; }
  };
  G.load = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      S = JSON.parse(raw);
      return true;
    } catch (e) { return false; }
  };
  G.clearSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };

  G.newGame = function () {
    S = {
      v: 2, seed: (R() * 1e9) | 0, chapter: 0, night: 1, time: 0,
      px: WD.start.x, py: WD.start.y, facing: "up",
      charm: 3, wits: 2, grit: 2, level: 1, xp: 0, nerve: 50, maxNerve: 50,
      coin: 8, suspicion: 0, rep: 0,
      inv: { bread: 2, sheath: 1 }, equip: { weapon: null, wear: null }, buffs: {},
      knocked: {}, talked: {}, nightFlags: {}, chapterFlags: {},
      notes: { district: {}, colour: {}, knocker: {} }, clues: [], quests: [], secrets: {}, residents: {},
      brass: {}, ruled: {}, doseKnown: {}, target: null, dosed: false, doses: 0,
      secretKnock: false, totals: { knocks: 0, clues: 0, fights: 0, quests: 0, nights: 0, doses: 0 },
      nightLog: { knocks: 0, clues: 0 }, queue: [], over: false, encounterCool: 0, chaptersWon: 0
    };
    genResidents();
    G.startChapter(0);
  };

  function genResidents() {
    WD.doors.forEach(function (d) {
      if (d.kind !== "resident") return;
      var rng = U.mulberry32(S.seed ^ U.hash(d.id));
      var trait = BK.KNOCKERS[d.knocker].trait;
      S.residents[d.id] = {
        name: U.pick(rng, BK.NAMES.first) + " " + U.pick(rng, BK.NAMES.last), job: U.pick(rng, BK.NAMES.jobs[d.district]),
        trait: trait, met: false, look: randomLook(rng, false), cluesLeft: 2
      };
    });
    var counts = {};
    WD.doors.forEach(function (d) { counts[d.district] = (counts[d.district] || 0) + 1; d.num = counts[d.district]; });
  }
  function randomLook(rng, brass) {
    return {
      coat: U.pick(rng, brass ? ["#8a1a3a", "#6a1a5a", "#a03030", "#5a2a6a", "#8a4a1a", "#2a5a6a"] : ["#3a2a2a", "#2a3a4a", "#4a3a2a", "#2a4a3a", "#4a2a3a", "#555048", "#6a4a2a", "#283048"]),
      hair: U.pick(rng, ["#1a1208", "#3a2410", "#6a4420", "#a08060", "#8a3a10", "#d0a050", "#c06020"]),
      skin: U.pick(rng, ["#e8c8a8", "#d8b090", "#c09070", "#a07050", "#7a5038", "#f0d0b8"]),
      hat: U.pick(rng, brass ? ["feather", "none", "bonnet", "feather"] : ["none", "cap", "bowler", "bonnet", "top", "none"])
    };
  }

  G.address = function (d) { return "No. " + d.num + ", " + BK.DISTRICT_NAMES[d.district]; };
  G.describeDoor = function (d) {
    return "the " + colourWord(d.colour) + " door with the " + knockerWord(d.knocker) + " knocker at " + G.address(d);
  };

  G.startChapter = function (ch) {
    S.chapter = ch;
    var c = chapter();
    var resDoors = WD.doors.filter(function (d) { return d.kind === "resident"; });
    var sh = U.shuffle(R, resDoors);
    // the target's door must be the only door in town with its street + colour + knocker
    var target = sh.filter(function (d) {
      return resDoors.filter(function (o) { return o.district === d.district && o.colour === d.colour && o.knocker === d.knocker; }).length === 1;
    })[0] || sh[0];
    S.target = target.id;
    S.brass = {};
    var others = sh.filter(function (d) { return d !== target; });
    var brassDoors = [target].concat(others.slice(0, c.brasses - 1));
    brassDoors.forEach(function (d, i) {
      var rng = U.mulberry32(S.seed ^ U.hash(d.id + ":" + ch));
      var isT = d === target;
      S.brass[d.id] = {
        name: isT ? c.target : U.pick(rng, BK.NAMES.brassNick) + " " + U.pick(rng, BK.NAMES.brassFirst),
        target: isT, dosed: !isT && i <= c.dosed, look: randomLook(rng, true), cluesLeft: 2, looked: false, status: null, met: false
      };
    });
    var rest = others.slice(c.brasses - 1);
    S.notes = { district: {}, colour: {}, knocker: {} };
    S.clues = []; S.night = 1; S.time = 0; S.knocked = {}; S.talked = {}; S.nightFlags = {}; S.chapterFlags = {};
    S.secrets = {}; S.buffs = {}; S.suspicion = 0; S.ruled = {}; S.doseKnown = {}; S.dosed = false; S.doses = 0;
    S.nightLog = { knocks: 0, clues: 0 };
    S.px = WD.start.x; S.py = WD.start.y; S.facing = "up";
    resDoors.forEach(function (d) {
      var r = S.residents[d.id];
      r.cluesLeft = r.trait === "scholar" ? 3 : 2;
      r.holds = null; r.gives = null;
      r.secret = (r.trait === "wealthy" || R() < 0.3) ? pick(SECRET_TEMPLATES) : null;
    });
    // side quests among ordinary households
    S.quests = [];
    var qItems = U.shuffle(R, BK.QUEST_ITEMS).slice(0, 3);
    var qi = 0;
    qItems.forEach(function (item) {
      var giver = rest[qi++], holder = rest[qi++];
      if (!giver || !holder) return;
      S.residents[giver.id].gives = item;
      S.residents[holder.id].holds = item;
      S.quests.push({ item: item, giver: giver.id, holder: holder.id, state: "unknown", reward: ri(5, 9) + ch * 3 });
    });
    G.save();
  };

  /* ============ the deduction ============ */
  G.candidates = function () {
    if (!S) return [];
    return WD.doors.filter(function (d) {
      if (d.kind !== "resident" || S.ruled[d.id] || S.doseKnown[d.id]) return false;
      for (var cat in BK.CATS) { var n = S.notes[cat][attr(d, cat)]; if (n && n.m === "x") return false; }
      return true;
    });
  };
  G.isBrass = function (id) { return !!(S && S.brass[id]); };

  /* ============ derived stats ============ */
  G.stat = function (k) {
    var v = S[k];
    if (k === "charm" && S.buffs.cologne) v += 2;
    if (k === "charm" && S.dosed) v -= 2;
    if (k === "wits" && S.buffs.snuff) v += 2;
    return v;
  };
  function atkBonus() { var w = S.equip.weapon; return w ? BK.ITEMS[w].equip.atk : 0; }
  function defBonus() { var w = S.equip.wear; return w && BK.ITEMS[w].equip.def ? BK.ITEMS[w].equip.def : 0; }
  G.xpNext = function () { return 20 + S.level * 20; };
  G.clockText = function () { return U.fmtTime(20 * 60 + S.time); };
  G.nightsLeft = function () { return chapter().nights - S.night + 1; };

  function check(stat, dc) {
    var roll = ri(1, 10), val = G.stat(stat), total = roll + val;
    var ok = roll === 10 || (roll !== 1 && total >= dc);
    var label = stat.charAt(0).toUpperCase() + stat.slice(1);
    var text = '<div class="roll ' + (ok ? "ok" : "bad") + '">' + label + " " + val + " + d10 roll " + roll + " = " + total + " vs " + dc + (ok ? " — success" : " — failed") + "</div>";
    return { ok: ok, text: text, roll: roll };
  }
  G.check = check;

  function addSuspicion(n) {
    if (n > 0 && S.equip.wear === "peacoat") n = Math.round(n * 0.67);
    S.suspicion = U.clamp(S.suspicion + n, 0, 100);
    return n;
  }
  function addRep(n) { S.rep = U.clamp(S.rep + n, -50, 100); }
  function addNerve(n) { S.nerve = U.clamp(S.nerve + n, 0, S.maxNerve); }
  function addCoin(n) { S.coin = Math.max(0, S.coin + n); if (n > 0) sfx("coin"); }
  function gainXP(n) {
    S.xp += n;
    while (S.xp >= G.xpNext()) {
      S.xp -= G.xpNext(); S.level++;
      S.maxNerve += 8; addNerve(Math.round(S.maxNerve / 2));
      S.queue.push({ type: "levelup" });
    }
  }
  G.addItem = function (id, n) { S.inv[id] = (S.inv[id] || 0) + (n || 1); };
  function takeItem(id) { if (!S.inv[id]) return false; S.inv[id]--; if (S.inv[id] <= 0) delete S.inv[id]; return true; }
  G.advance = function (mins) { S.time += mins; };

  /* ============ notebook ============ */
  function mark(cat, id, m, src) {
    var cur = S.notes[cat][id];
    if (cur && cur.m === "x" && m === "?") return false;
    S.notes[cat][id] = { m: m, src: src };
    return true;
  }
  G.cycleMark = function (cat, id) {
    var order = ["", "x", "?"];
    var cur = S.notes[cat][id] ? S.notes[cat][id].m : "";
    var nxt = order[(order.indexOf(cur) + 1) % order.length];
    if (!nxt) delete S.notes[cat][id];
    else S.notes[cat][id] = { m: nxt, src: "your own note" };
    G.save();
  };
  function logClue(text, src, extra) {
    var c = { text: text, src: src, night: S.night };
    if (extra) for (var k in extra) c[k] = extra[k];
    S.clues.unshift(c);
    S.nightLog.clues++; S.totals.clues++;
  }

  function attrClueText(cat, id) {
    var n = nick();
    if (cat === "district") return pick([
      "“" + n + "? Not on " + valName(cat, id) + ", I'd know if she was.”",
      "“She doesn't work " + valName(cat, id) + ". Too many nosy neighbours.”",
      "“Whatever you've heard, " + n + " isn't anywhere on " + valName(cat, id) + ".”"]);
    if (cat === "colour") return pick([
      "“Her door's not " + id + ", I'll tell you that for nothing.”",
      "“" + n + "'s door? Never been painted " + id + " in its life.”",
      "“Not a " + id + " door. She can't abide " + id + ".”"]);
    return pick([
      "“There's no " + knockerWord(id) + " on " + n + "'s door.”",
      "“A " + knockerWord(id) + " knocker? Not on her door, sailor.”",
      "“I've seen her door, and it doesn't have a " + knockerWord(id) + " on it.”"]);
  }

  function doseRumour() {
    var opts = Object.keys(S.brass).filter(function (id) { return S.brass[id].dosed && !S.doseKnown[id]; });
    if (!opts.length) return null;
    var id = pick(opts), d = doorById(id), b = S.brass[id];
    S.doseKnown[id] = true; b.status = "dosed";
    var t = "“Keep well away from " + G.describeDoor(d) + ". " + b.name + " works from there, and she's got the dose.”";
    logClue(t, "a warning", { dose: true });
    gainXP(5); sfx("warn");
    return t + '<p class="dose-note">☠ Dose warning noted. That door is marked on your map.</p>';
  }
  G._doseRumour = doseRumour;

  /* returns html describing the clue */
  function giveTestimony(srcName, trait, allowLie, noDose) {
    var c = chapter(), t = doorById(S.target);
    if (!noDose && R() < 0.25) { var dr = doseRumour(); if (dr) return dr; }
    var cats = U.shuffle(R, Object.keys(BK.CATS));
    var canLie = allowLie && (trait === "shifty" || trait === "gambler") && R() < c.lieChance;
    if (canLie) {
      var lc = cats[0], lid = attr(t, lc);
      var txt = attrClueText(lc, lid);
      var det = check("wits", 9);
      if (det.ok) {
        mark(lc, lid, "?", srcName + " (you suspect a lie)");
        logClue(txt + " <em>You think they're lying.</em>", srcName, { doubted: true });
        return txt + det.text + '<p class="note">Something in their eyes says they’re lying. You note it with a question mark.</p>';
      }
      mark(lc, lid, "x", srcName);
      logClue(txt, srcName, { lie: true });
      return txt + det.text + '<p class="note">You cross <b>' + valName(lc, lid) + "</b> off your list.</p>";
    }
    var cands = [];
    cats.forEach(function (cat) {
      BK.CATS[cat].forEach(function (o) {
        if (o.id === attr(t, cat)) return;
        var n = S.notes[cat][o.id];
        if (n && n.m === "x" && n.src !== "your own note") return;
        cands.push({ cat: cat, id: o.id });
      });
    });
    if (!cands.length) { var d2 = doseRumour(); return d2 || "<p>They have nothing you don't already know.</p>"; }
    var p = pick(cands);
    var tx = attrClueText(p.cat, p.id);
    mark(p.cat, p.id, "x", srcName);
    logClue(tx, srcName);
    gainXP(5); sfx("clue");
    return tx + '<p class="note">You cross <b>' + valName(p.cat, p.id) + "</b> off your list." + candNote() + "</p>";
  }
  G._giveTestimony = giveTestimony;
  function candNote() {
    var n = G.candidates().length;
    return n === 1 ? " <b>Only one door in town still fits!</b>" : " " + n + " doors still fit your notes.";
  }

  var SECRET_TEMPLATES = ["keeps a second family in the Rookery", "has been pawning the church silver, piece by piece",
    "owes forty guineas to the mermaid-door gamblers", "writes love letters to Kitty Lark under a false name",
    "has been taking the mercury cure in secret", "smuggles brandy off the brig Gannet",
    "forged the signature on their late uncle's will", "was dismissed from the mill for theft and never told a soul"];

  function learnRandomSecret(excludeId) {
    var opts = WD.doors.filter(function (d) {
      var r = S.residents[d.id];
      return r && r.secret && !S.secrets[d.id] && d.id !== excludeId && !S.brass[d.id];
    });
    if (!opts.length) return "<p>" + pick(BK.RUMOURS) + "</p>";
    var d = pick(opts), r = S.residents[d.id];
    S.secrets[d.id] = true;
    return '<p class="secret">A whispered secret: ' + r.name + ", the " + r.job + " who lives behind " + G.describeDoor(d) + ", " + r.secret +
      '.</p><p class="note">Secrets give you leverage. Knock on that door and use it.</p>';
  }

  /* ============ flow helpers ============ */
  function dlg(o) { ui().dialog(o); }
  function leave(label) { return { label: label || "Leave", fn: function () { } }; }
  function residentPortrait(r) { return { seed: r.name, coat: r.look.coat, hair: r.look.hair, skin: r.look.skin, hat: r.look.hat }; }
  function localPortrait(s) { return { seed: s.id, coat: s.coat, hair: s.hair, hat: s.hat, skin: "#e0c0a0" }; }

  G.afterModal = function () {
    if (!S || S.over) return;
    if (S.queue.length) {
      var q = S.queue.shift();
      if (q.type === "levelup") return levelUp();
    }
    if (S.suspicion >= 100) return arrested();
    if (S.nerve <= 0) return collapse();
    if (S.time >= NIGHT_LEN) return dawn(false);
    if (!S.nightFlags.oneLeft && G.candidates().length === 1) {
      S.nightFlags.oneLeft = true;
      ui().toast("Your notes point to a single door! Check the map in your notebook.");
    }
    G.save();
  };

  function levelUp() {
    sfx("level");
    dlg({
      title: "Level " + S.level + "!", sub: "Brassmoor is teaching you its ways.",
      body: "<p>Your maximum Nerve rises to " + S.maxNerve + ". Choose a talent to sharpen:</p>",
      choices: [
        { label: "Charm +1", note: "Sweet-talking, singing, talking down a fight", fn: function () { S.charm++; } },
        { label: "Wits +1", note: "Spotting lies, spotting the dose, slipping away", fn: function () { S.wits++; } },
        { label: "Grit +1", note: "Leaning on people, fighting, hitting harder", fn: function () { S.grit++; } }
      ], noClose: true
    });
  }

  /* ============ interaction entry points ============ */
  G.interact = function (target) {
    if (!target) return;
    if (target.spot) return lookout(target.spot.place, target.spot.label);
    var d = target.door;
    if (d.kind === "home") return homeMenu(d);
    if (d.kind === "landmark") return landmark(d);
    if (d.kind === "local") return localDoor(d);
    return residentDoor(d);
  };

  /* ---------- resident doors ---------- */
  function questReturn(d) {
    var r = S.residents[d.id];
    if (!r.gives) return false;
    var q = S.quests.filter(function (q) { return q.giver === d.id && q.state !== "done"; })[0];
    if (!q || !S.inv[q.item]) return false;
    takeItem(q.item); q.state = "done"; addCoin(q.reward); gainXP(20); addRep(6); S.totals.quests++;
    var extra = r.cluesLeft > 0 ? "<p>“And here's something you'll want to hear…”</p>" + giveTestimony(r.name, r.trait, false) : "";
    if (r.cluesLeft > 0) r.cluesLeft--;
    dlg({
      title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r),
      body: "<p>Their face lights up when they see the " + BK.ITEMS[q.item].name.toLowerCase() + ".</p><p>“You found it! Bless you, sailor.”</p>" +
        '<p class="note">Favour done: +' + q.reward + " shillings, +20 XP, and your reputation improves.</p>" + extra,
      choices: [leave("Touch your cap and go")]
    });
    return true;
  }

  function doorStatusHtml(d) {
    var out = "";
    if (S.doseKnown[d.id]) out += "<p class='dose-note'>☠ You've been warned: the brass here has the dose.</p>";
    else if (S.ruled[d.id]) out += "<p class='hint'>Your notes say: " + U.esc(S.ruled[d.id]) + ".</p>";
    return out;
  }

  function residentDoor(d) {
    var r = S.residents[d.id], kn = BK.KNOCKERS[d.knocker], b = S.brass[d.id];
    if (!b && questReturn(d)) return;
    var who = b && b.met ? "<p><b>" + U.esc(b.name) + "</b> works from this house.</p>" : r.met && !b ? "<p>This is where <b>" + r.name + "</b>, " + r.job + ", lives.</p>" : "<p>You don't know who's behind this door.</p>";
    var sub = valName("colour", d.colour) + " · " + kn.name + " knocker";
    if (S.knocked[d.id]) {
      return dlg({ title: G.address(d), sub: sub, knocker: d.knocker, body: who + doorStatusHtml(d) + "<p>You've already knocked here tonight. Knock again and they'll fetch a constable.</p>", choices: [leave()] });
    }
    var ch = [
      { label: "Gentle knock", note: "Polite. Less likely to be answered.", fn: function () { knock(d, "gentle"); } },
      { label: "Firm knock", note: "Hard to ignore, but it annoys folk and draws eyes (+Suspicion).", fn: function () { knock(d, "firm"); } }
    ];
    if (S.secretKnock) ch.unshift({ label: "The brasses' knock", note: "Two quick, one slow. A brass always answers it.", fn: function () { knock(d, "secret"); } });
    ch.push(leave());
    dlg({ title: G.address(d), sub: sub, knocker: d.knocker, body: who + doorStatusHtml(d) + '<p class="hint">' + kn.hint + "</p>", choices: ch });
  }

  function knock(d, style) {
    var r = S.residents[d.id], b = S.brass[d.id];
    S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++;
    G.advance(10); sfx("knock", style);
    if (style === "firm") addSuspicion(3);
    if (b) {
      var pb = style === "secret" ? 1 : style === "firm" ? 0.88 : 0.72;
      if (S.time > 420) pb -= 0.1;
      if (R() > pb) return noAnswer(d);
      return brassMeet(d);
    }
    var p = style === "gentle" ? 0.62 : style === "firm" ? 0.86 : 0.55;
    if (S.time > 360) p -= 0.12;
    if (r.trait === "sister") p += S.rep / 200;
    if (r.trait === "wealthy" && style === "gentle") p -= 0.08;
    if (R() > p) return noAnswer(d);
    r.met = true;
    S.ruled[d.id] = "an ordinary household, no brass works here";
    var hostile = { wealthy: 0.16, sailor: 0.1, shifty: 0.1, devout: 0.12, plain: 0.08, scholar: 0.07, sister: 0.02, gambler: 0.1 }[r.trait] + (style === "firm" ? 0.08 : 0) - S.rep / 400;
    if (R() < hostile) return hostileDoor(d);
    conversation(d, style);
  }

  function noAnswer(d) {
    var ch = [];
    if (S.inv.lockpick) ch.push({ label: "Pick the lock", note: "Uses a lockpick. +Suspicion. Wits to search well.", fn: function () { burgle(d); } });
    ch.push(leave());
    dlg({ title: G.address(d), sub: "No answer", knocker: d.knocker, body: "<p>Your knock echoes down an empty hall. Nobody comes.</p>", choices: ch });
  }

  function burgle(d) {
    var r = S.residents[d.id], b = S.brass[d.id];
    takeItem("lockpick"); G.advance(20);
    var gain = addSuspicion(12);
    var c = check("wits", 9);
    var body = "<p>The lock gives with a click. You slip inside, into the smell of coal-smoke and cheap scent.</p>" + c.text;
    if (c.ok) {
      if (b && b.target) {
        body += "<p class='evidence'>On the dressing table, tied up with ribbon: a bundle of letters. Your letters, every one. This is " + nick() + "'s room!</p><p class='note'>Come back and knock when she's home.</p>";
        S.ruled = S.ruled || {};
        BK.CATS && Object.keys(BK.CATS).forEach(function (cat) {
          BK.CATS[cat].forEach(function (o) { if (o.id !== attr(d, cat)) mark(cat, o.id, "x", "her letters"); });
        });
        WD.doors.forEach(function (o) { if (o.kind === "resident" && o.id !== d.id && !S.ruled[o.id]) S.ruled[o.id] = "not her door (you found her letters elsewhere)"; });
        logClue("You found your own letters in " + G.describeDoor(d) + ". This is her door.", "a lockpick", { evidence: true });
        gainXP(15); sfx("evidence");
      } else if (b) {
        S.ruled[d.id] = "a brass works here, but not " + nick();
        if (b.dosed) { S.doseKnown[d.id] = true; b.status = "dosed"; body += "<p class='dose-note'>☠ A pot of mercury ointment on the washstand. Whoever works here has the dose.</p>"; }
        else body += "<p>A brass works from this room. The name on the letters is <b>" + U.esc(b.name) + "</b>, not " + nick() + ".</p>";
      } else if (r.holds && S.quests.some(function (q) { return q.holder === d.id && q.state !== "done" && !S.inv[q.item]; })) {
        G.addItem(r.holds); body += "<p>On the mantelpiece: a " + BK.ITEMS[r.holds].name.toLowerCase() + ". Somebody's missing that. You pocket it.</p>";
        S.quests.forEach(function (q) { if (q.holder === d.id && q.state !== "done") q.state = q.state === "unknown" ? "found" : "carrying"; });
      } else {
        S.ruled[d.id] = "an ordinary household, no brass works here";
        if (R() < 0.5 && r.cluesLeft > 0) { r.cluesLeft--; body += "<p>A half-written letter on the table catches your eye:</p>" + giveTestimony("a letter at " + G.address(d), "plain", false); }
        else { var c2 = ri(2, 6); addCoin(c2); body += "<p>Just an ordinary household. A jar of coins behind the clock: you take " + c2 + " shillings and try not to feel bad about it.</p>"; }
      }
    } else {
      addSuspicion(8);
      body += "<p>A floorboard shrieks. Upstairs, somebody shouts “THIEF!” and you bolt into the fog.</p>";
    }
    body += '<p class="note">Suspicion +' + gain + "</p>";
    dlg({ title: "Inside " + G.address(d), body: body, choices: [leave("Slip back out")] });
  }

  /* ---------- a brass answers ---------- */
  var BRASS_GREET = ["“Looking for company, sailor?”", "“Well, aren't you a long way from the sea.”", "“Evening, Jack. They're all called Jack, aren't they?”",
    "“Shut the door, love, you're letting the fog in.”", "“Three shillings, and wipe your boots.”"];

  function brassMeet(d, again) {
    var b = S.brass[d.id];
    b.met = true;
    var body = again ? "" : "<p>The door opens a crack: lamplight, a painted smile, a shawl the colour of claret. A brass works from this house.</p><p>" + pick(BRASS_GREET) + "</p>";
    if (b.status === "dosed" || S.doseKnown[d.id]) body += "<p class='dose-note'>☠ You know this one has the dose.</p>";
    else if (b.status === "clean") body += "<p class='good-note'>✔ You've looked her over: no sign of the dose.</p>";
    if (S.ruled[d.id]) body += "<p class='hint'>" + U.esc(S.ruled[d.id]) + ".</p>";
    var ch = [];
    if (!b.looked) ch.push({ label: "Look her over carefully [Wits 9]", note: "Spot the signs of the dose before it's too late.", fn: function () {
      b.looked = true; G.advance(5);
      var c = check("wits", 9), txt = c.text;
      if (c.ok) {
        if (b.dosed) { b.status = "dosed"; S.doseKnown[d.id] = true; sfx("warn"); txt += "<p>She smells of mercury ointment, and her hands have the shake that comes with the cure. <b>She has the dose.</b></p>"; }
        else { b.status = "clean"; txt += "<p>Clear-eyed, steady-handed, and nothing on the washstand but soap. No sign of the dose.</p>"; }
      } else txt += "<p>It's too dark in the doorway to tell anything.</p>";
      dlg({ title: b.met ? b.name : "A brass", portrait: brassPortrait(b), body: txt, choices: [{ label: "Carry on", fn: function () { brassMeet(d, true); } }] });
    } });
    if (!S.talked[d.id] && b.cluesLeft > 0) {
      ch.push({ label: "Ask her about " + nick() + " [Charm 7]", fn: function () { brassTalk(d, "charm"); } });
      ch.push({ label: "Pay her for gossip [2s]", disabled: S.coin < 2, fn: function () { addCoin(-2); brassTalk(d, "pay"); } });
    }
    var cands = G.candidates(), fits = cands.some(function (o) { return o.id === d.id; });
    ch.push({ label: "Step inside [3s]", note: (fits ? "Is she " + nick() + "? Only one way to find out. " : "Your notes say she isn't " + nick() + ". ") + "Risky if she has the dose.", disabled: S.coin < 3, fn: function () { stepInside(d); } });
    ch.push(leave("Move on"));
    dlg({ title: b.name, sub: "A brass · " + G.address(d), portrait: brassPortrait(b), body: body, choices: ch });
  }
  function brassPortrait(b) { return { seed: b.name, coat: b.look.coat, hair: b.look.hair, skin: b.look.skin, hat: b.look.hat }; }

  function brassTalk(d, how) {
    var b = S.brass[d.id];
    S.talked[d.id] = true; G.advance(10);
    var body = "";
    if (how === "charm") {
      var c = check("charm", 7); body += c.text;
      if (!c.ok) { body += "<p>“I don't gossip about the other girls, love. Bad for business.”</p>"; return dlg({ title: b.name, portrait: brassPortrait(b), body: body, choices: [{ label: "Carry on", fn: function () { brassMeet(d, true); } }] }); }
    } else body += "<p>The coins vanish into her stocking-top.</p>";
    b.cluesLeft--;
    body += giveTestimony(b.name, "plain", false);
    dlg({ title: b.name, portrait: brassPortrait(b), body: body, choices: [{ label: "Carry on", fn: function () { brassMeet(d, true); } }] });
  }

  function stepInside(d) {
    var b = S.brass[d.id];
    addCoin(-3); G.advance(60);
    if (b.target) return chapterWon(d);
    var body = "<p>The door closes behind you, and what happens next stays behind it.</p>";
    S.ruled[d.id] = "a brass works here, but not " + nick();
    if (b.dosed) {
      var risk = 0.85;
      var usedSheath = takeItem("sheath");
      if (usedSheath) risk = 0.4;
      S.doseKnown[d.id] = true; b.status = "dosed";
      if (R() < risk) {
        S.dosed = true; S.doses++; S.totals.doses++;
        addNerve(-15); sfx("bad");
        body += "<p>An hour later, walking back through the fog, you notice an itch you didn't have before. Then a burn. You know exactly what it is.</p>" +
          "<p class='dose-note'><b>You've caught the dose!</b> (" + S.doses + " of " + MAX_DOSES + " this shore leave.) Charm −2 and you'll feel rough every morning until you're cured: try the Lock Hospital, Dr Pell, or mercury pills from Fenn.</p>" +
          (usedSheath ? "<p class='note'>Even the French letter didn't save you.</p>" : "");
        if (S.doses >= MAX_DOSES) {
          return gameOver("Three doses in one shore leave. Captain Ruddock takes one look at you and signs you over to the Lock Hospital for the winter. The Gannet sails without you.");
        }
      } else {
        body += "<p class='good-note'>Afterwards she admits she's taking the mercury cure. " + (usedSheath ? "The French letter did its job: you got away clean." : "By sheer luck you got away clean, this time.") + "</p>";
      }
      body += "<p>She isn't " + nick() + ", either.</p>";
    } else {
      addNerve(15);
      body += "<p>A pleasant hour. But she isn't " + nick() + ". Afterwards, pinning up her hair, she tells you what she knows:</p>" + giveTestimony(b.name, "plain", false, true);
      if (b.cluesLeft > 0) { b.cluesLeft--; body += giveTestimony(b.name, "plain", false, true); }
    }
    dlg({ title: b.name, portrait: brassPortrait(b), body: body, choices: [leave("Back out into the night")] });
  }

  function hostileDoor(d) {
    var r = S.residents[d.id];
    var t = r.trait, body, after = null;
    if (t === "sailor" || (t === "shifty" && R() < 0.5)) {
      body = "<p>The door bangs open and " + r.name + " comes out swinging. “This is a respectable house!”</p>";
      after = function () { G.fight(makeEnemy("sailor", r.name)); };
    } else if (t === "wealthy" || t === "scholar") {
      var g = addSuspicion(12);
      body = "<p>A maid peers out, then shrieks for the master. A window goes up: “CONSTABLE! There's a sailor looking for women at my door!”</p><p class='note'>Suspicion +" + g + "</p>";
    } else if (t === "devout") {
      addNerve(-6);
      body = "<p>" + r.name + " reads you a long passage about the wages of sin, then slams the door. It stings more than you'd like.</p><p class='note'>Nerve −6</p>";
    } else {
      addNerve(-8);
      body = "<p>An upstairs window opens and a chamber-pot's worth of slops narrowly doesn't miss you.</p><p class='note'>Nerve −8</p>";
    }
    body += "<p class='hint'>No brass works from this house.</p>";
    dlg({ title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r), body: body, choices: [{ label: after ? "Defend yourself" : "Retreat", fn: after || function () { } }] });
  }

  var GREET = {
    wealthy: ["“What the devil do you want at this hour?”", "“If you're selling something, the tradesman's entrance is round the back.”"],
    shifty: ["“Well, well. A sailor with money in his pocket. What's it worth to you?”", "“Depends who's asking, don't it?”"],
    devout: ["“The Lord sees all who walk abroad at night, young man.”", "“If you've come to repent, the chapel opens at six.”"],
    sailor: ["“Ahoy! Off the Gannet, are you? Come in out of the fog.”", "“Shore leave, eh? I remember shore leave.”"],
    scholar: ["“Hmm? Ah. You have a question. Phrase it precisely.”", "“Do come in out of the draught; you're letting the fog in.”"],
    sister: ["“Oh, look at you, all salt and sunburn. Come in, love.”", "“You've the look of a lad hunting for somebody.”"],
    plain: ["“Do you know what time it is? Some of us work in the morning.”", "“Oh. A sailor. What is it?”"],
    gambler: ["“Feeling lucky, sailor?”", "“House always wins, but you're welcome to try.”"]
  };

  function conversation(d, style) {
    var r = S.residents[d.id];
    var dcBase = { wealthy: 10, shifty: 9, devout: 11, sailor: 8, scholar: 9, sister: 6, plain: 8, gambler: 9 }[r.trait] + (style === "firm" ? 1 : 0);
    var body = "<p>" + pick(GREET[r.trait]) + "</p><p class='hint'>No brass works from this house, but they might know where " + nick() + " does.</p>";
    var ch = [];
    if (r.cluesLeft > 0 && !S.talked[d.id]) {
      ch.push({ label: "Ask nicely about " + nick() + " [Charm " + dcBase + "]", fn: function () { approach(d, "charm", dcBase); } });
      var price = r.trait === "scholar" || r.trait === "wealthy" ? 3 : 2;
      if (r.trait === "devout") ch.push({ label: "Offer coin for what they know", note: "Devout folk won't take money for that sort of talk.", disabled: true });
      else ch.push({ label: "Pay for what they know [" + price + "s]", disabled: S.coin < price, note: S.coin < price ? "You can't afford it." : "", fn: function () { addCoin(-price); approach(d, "pay", 0); } });
      ch.push({ label: "Lean on them [Grit " + (dcBase - 1) + "]", note: "Works, but draws attention (+Suspicion).", fn: function () { approach(d, "grit", dcBase - 1); } });
      if (S.secrets[d.id]) ch.push({ label: "Remind them of their secret", note: "Sure to work and worth double, but it hurts your reputation.", fn: function () { approach(d, "secret", 0); } });
    } else if (r.cluesLeft <= 0) {
      body += "<p>They've told you everything they know.</p>";
    } else {
      body += "<p>They've already talked to you tonight.</p>";
    }
    if (r.holds && S.quests.some(function (q) { return q.holder === d.id && q.state !== "done" && !S.inv[q.item]; })) {
      ch.push({ label: "Ask about lost belongings", fn: function () { handOver(d); } });
    }
    if (r.trait === "gambler" && !S.nightFlags["bet" + d.id]) {
      ch.push({ label: "Have a flutter on the dice [bet 2s]", disabled: S.coin < 2, fn: function () { gamble(d); } });
    }
    if (r.trait === "sister" && !S.nightFlags["rest" + d.id]) {
      ch.push({ label: "Sit by their fire a while", note: "+20 Nerve, 20 minutes", fn: function () {
        S.nightFlags["rest" + d.id] = true; G.advance(20); addNerve(20);
        dlg({ title: r.name, portrait: residentPortrait(r), body: "<p>Tea with something stronger in it, a warm fire and a bit of mothering. You feel more like yourself.</p><p class='note'>Nerve +20</p>", choices: [leave("Back into the fog")] });
      } });
    }
    ch.push(leave("Say goodnight"));
    dlg({ title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r), body: body, choices: ch });
  }

  function approach(d, how, dc) {
    var r = S.residents[d.id];
    S.talked[d.id] = true;
    G.advance(10);
    var body = "", res;
    if (how === "charm" || how === "grit") {
      res = check(how, dc);
      body += res.text;
      if (how === "grit") { var g = addSuspicion(res.ok ? 6 : 10); body += "<p class='note'>Suspicion +" + g + "</p>"; }
      if (!res.ok) {
        if (how === "grit" && r.trait === "sailor") {
          return dlg({ title: r.name, portrait: residentPortrait(r), body: body + "<p>“Threaten ME, would you?” Fists come up.</p>", choices: [{ label: "Fight", fn: function () { G.fight(makeEnemy("sailor", r.name)); } }] });
        }
        body += "<p>" + (how === "charm" ? "They're not having it. “Goodnight, sailor.” The door closes, politely but firmly." : "They stare you down and slam the door. You'll get nothing here tonight.") + "</p>";
        return dlg({ title: r.name, portrait: residentPortrait(r), body: body, choices: [leave()] });
      }
    }
    if (how === "secret") { addRep(-4); body += "<p>You lean close and murmur what you know. The colour drains from their face.</p>"; }
    if (how === "pay") body += "<p>The coins vanish into a pocket.</p>";
    r.cluesLeft--;
    body += giveTestimony(r.name, r.trait, true);
    if (how === "secret") body += "<p>“…and there's more, if it keeps you quiet.”</p>" + giveTestimony(r.name, r.trait, false);
    if (r.gives) {
      var q = S.quests.filter(function (q) { return q.giver === d.id; })[0];
      if (q && q.state === "unknown") {
        q.state = "active";
        var hd = doorById(q.holder);
        body += "<p class='quest'>“One more thing. I've lost my " + BK.ITEMS[q.item].name.toLowerCase() + ". Last I had it was down in " + BK.DISTRICT_NAMES[hd.district] +
          ". Bring it back and I'll make it worth your while.”</p><p class='note'>New favour added to your notebook.</p>";
      } else if (q && q.state === "found") q.state = "carrying";
    }
    if (R() < 0.18) body += learnRandomSecret(d.id);
    dlg({ title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r), body: body, choices: [leave("Thank them and go")] });
  }

  function handOver(d) {
    var r = S.residents[d.id];
    var q = S.quests.filter(function (q) { return q.holder === d.id && q.state !== "done"; })[0];
    G.addItem(q.item);
    q.state = q.state === "unknown" ? "found" : "carrying";
    var giver = doorById(q.giver);
    dlg({ title: r.name, portrait: residentPortrait(r), body: "<p>“This? Found it in the gutter. No use to me, take it.” They hand you a " + BK.ITEMS[q.item].name.toLowerCase() + ".</p>" +
      (q.state === "carrying" ? "<p class='note'>Return it to " + S.residents[q.giver].name + " at " + G.address(giver) + ".</p>" : "<p class='note'>Somebody in Brassmoor must be missing this.</p>"), choices: [leave()] });
  }

  function gamble(d) {
    S.nightFlags["bet" + d.id] = true;
    addCoin(-2); G.advance(15);
    var win = R() < 0.42 + S.wits * 0.03;
    if (win) addCoin(5);
    dlg({ title: "Dice", body: win ? "<p>Double sixes! The table groans. You scoop up 5 shillings.</p>" : "<p>Snake eyes. The house smiles and keeps your money.</p>", choices: [leave()] });
  }

  /* ---------- the town's locals ---------- */
  var LOCAL_GREET = {
    crake: "“Do you know whose house this is? I could have you pressed into the Navy for knocking on it.”",
    vane: "“If you're after a room, I don't let to sailors. If you're after a girl, I don't let to those either. Officially.”",
    mott: "“My son, it's very late, and you smell of the sea and the gin-shop.”",
    pell: "“Ah. A sailor on shore leave. I can usually guess why you've come.” He wipes his hands on his apron.",
    ruddock: "“Halyard! Still ashore, and still in one piece? Keep it that way. I need every hand.”",
    lark: "“Darling, I've a performance tomorrow. Make it quick.” She opens the door all the way, though.",
    grime: "“Well, if it isn't Jack Tar. Causing trouble?” He taps his truncheon against his palm.",
    fenn: "“Pledging or redeeming, sailor?” His spectacles catch the gaslight."
  };

  function localDoor(d) {
    var s = byId(BK.LOCALS, d.local);
    if (S.knocked[d.id]) return dlg({ title: d.label, sub: s.name, body: "<p>You've already been here tonight. Come back tomorrow night.</p>", choices: [leave()] });
    dlg({
      title: d.label, sub: s.name + " — " + s.role, knocker: d.knocker,
      body: "<p>" + s.desc + "</p><p class='hint'>One of Brassmoor's notable locals. You can call once a night.</p>",
      choices: [{ label: "Knock", fn: function () {
        S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++;
        G.advance(10); sfx("knock", "firm");
        if (R() < 0.1) return dlg({ title: d.label, body: "<p>Nobody's home. A cat watches you from the window.</p>", choices: [leave()] });
        localTalk(d, s);
      } }, leave()]
    });
  }

  function localTalk(d, s) {
    var ch = [];
    if (!S.nightFlags["ask" + s.id]) {
      var dc = s.id === "crake" ? 11 : 9;
      ch.push({ label: "Ask what they know about " + nick() + " [Wits " + dc + "]", note: s.id === "crake" ? "He lets half the brass houses in town: three clues if he talks." : "Two clues if it goes well.", fn: function () {
        S.nightFlags["ask" + s.id] = true; G.advance(15);
        var c = check("wits", dc), body = c.text;
        if (c.ok) { var n = s.id === "crake" ? 3 : 2; for (var i = 0; i < n; i++) body += giveTestimony(s.name, "plain", false); }
        else body += "<p>You ask the wrong question, and they shut up like an oyster.</p>";
        dlg({ title: s.name, portrait: localPortrait(s), body: body, choices: [leave()] });
      } });
    }
    if (s.id === "pell" && S.dosed) ch.push({ label: "Get the dose treated, quietly [8s]", note: "Certain cure. No names asked.", disabled: S.coin < 8, fn: function () { addCoin(-8); G.advance(30); cure("Dr Pell's needle and a great deal of mercury. It works."); } });
    if (s.id === "vane" && !S.nightFlags.vane) ch.push({ label: "Ask which tenants are taking the mercury cure [4s]", note: "Up to two dose warnings.", disabled: S.coin < 4, fn: function () {
      S.nightFlags.vane = true; addCoin(-4); G.advance(10);
      var a = doseRumour(), b = doseRumour();
      dlg({ title: s.name, portrait: localPortrait(s), body: "<p>She opens a ledger and runs a finger down it.</p>" + (a || "") + (b || "") + (!a && !b ? "<p>“None that you don't already know about.”</p>" : ""), choices: [leave()] });
    } });
    if (s.id === "grime") ch.push({ label: "Grease his palm [10s]", note: "−30 Suspicion", disabled: S.coin < 10, fn: function () { addCoin(-10); addSuspicion(-30); ui().toast("Your name slides off the duty sheet. Suspicion −30."); } });
    if (s.id === "mott" && !S.nightFlags.sermon) ch.push({ label: "Sit through a sermon on the wages of sin", note: "+25 Nerve, −5 Suspicion", fn: function () {
      S.nightFlags.sermon = true; G.advance(30); addNerve(25); addSuspicion(-5);
      dlg({ title: s.name, portrait: localPortrait(s), body: "<p>Forty minutes on fire and brimstone. Oddly restful.</p><p class='note'>Nerve +25, Suspicion −5</p>", choices: [leave()] });
    } });
    if (s.id === "ruddock" && !S.chapterFlags.advance) ch.push({ label: "Ask for an advance on your pay", note: "+8 shillings, once per shore leave", fn: function () {
      S.chapterFlags.advance = true; addCoin(8);
      dlg({ title: s.name, portrait: localPortrait(s), body: "<p>“Eight shillings, and I'll stop it out of your wages. And Halyard: stay away from the dose.”</p>", choices: [leave()] });
    } });
    if (s.id === "lark" && !S.secretKnock) ch.push({ label: "Ask her to teach you the brasses' knock", fn: function () {
      S.secretKnock = true;
      dlg({ title: s.name, portrait: localPortrait(s), body: "<p>She laughs and raps it out on the doorframe. “Two quick, one slow. Every brass in Brassmoor will open for that.”</p><p class='note'>You learned the brasses' knock. A brass always answers it.</p>", choices: [leave("Thank her")] });
    } });
    if (s.id === "fenn") ch.push({ label: "Browse the shop", fn: function () { ui().shop(); } });
    ch.push(leave());
    dlg({ title: s.name, sub: s.role, portrait: localPortrait(s), body: "<p>" + LOCAL_GREET[s.id] + "</p>", choices: ch });
  }

  function cure(text) {
    S.dosed = false; sfx("clue");
    dlg({ title: "Cured", body: "<p>" + text + "</p><p class='good-note'>✔ You're free of the dose. Charm is back to normal.</p><p class='note'>Doses caught this shore leave: " + S.doses + " of " + MAX_DOSES + ".</p>", choices: [leave()] });
  }

  /* ---------- landmarks ---------- */
  function landmark(d) {
    var lm = d.lm;
    if (lm === "tavern") return tavern(d);
    if (lm === "church") return church(d);
    if (lm === "court") return hospital(d);
    if (lm === "hall") return hall(d);
    if (lm === "mill") return mill(d);
    if (lm === "warehouse") return warehouse(d);
    if (lm === "pawn") return pawn(d);
  }

  function homeMenu() {
    dlg({
      title: "The Sailors' Home", sub: "A hammock and a locker, 1s a night",
      body: "<p>Snoring seamen, a stove, and a matron who locks the door at six. Your hammock's still slung where you left it.</p>",
      choices: [
        { label: "Turn in until dawn", note: "Ends the night. Nerve is restored at dawn.", fn: function () { dawn(true); } },
        { label: "Save your progress", fn: function () { var ok = G.save(); ui().toast(ok ? "Game saved." : "Could not save on this device."); } },
        { label: "Read your notebook", fn: function () { ui().notebook(); } },
        leave()
      ]
    });
  }

  function tavern(d) {
    var ch = [];
    if (!S.nightFlags.round) ch.push({ label: "Buy a round and listen [2s]", disabled: S.coin < 2, fn: function () {
      S.nightFlags.round = true; addCoin(-2); G.advance(20);
      var body = "<p>Rum goes round, tongues loosen, and you steer the talk round to " + nick() + ".</p>";
      body += R() < 0.7 ? giveTestimony("talk in the Drowned Man", R() < 0.3 ? "shifty" : "plain", true) : learnRandomSecret(null);
      dlg({ title: "The Drowned Man", body: body, choices: [leave()] });
    } });
    if (!S.nightFlags.landlord) ch.push({ label: "Ask the landlord who's got the dose [1s]", disabled: S.coin < 1, fn: function () {
      S.nightFlags.landlord = true; addCoin(-1); G.advance(10);
      var dr = doseRumour();
      dlg({ title: "The landlord", body: "<p>He polishes a glass and lowers his voice.</p>" + (dr || "<p>“Can't say I've heard of any more, sailor.”</p>"), choices: [leave()] });
    } });
    ch.push({ label: "Eat a hot eel pie [2s]", note: "+30 Nerve", disabled: S.coin < 2, fn: function () { addCoin(-2); addNerve(30); G.advance(10); ui().toast("Hot, greasy and wonderful. Nerve +30."); } });
    ch.push(leave());
    dlg({ title: "The Drowned Man", sub: "Tavern · The Wharf", knocker: d.knocker, body: "<p>Low beams, a fire that smokes, and half the Gannet's crew already three sheets to the wind.</p>", choices: ch });
  }

  function church(d) {
    var ch = [];
    if (!S.nightFlags.prayed) ch.push({ label: "Kneel and pray", note: "+40 Nerve, −8 Suspicion. Once a night.", fn: function () {
      S.nightFlags.prayed = true; G.advance(20); addNerve(40); addSuspicion(-8);
      dlg({ title: "St Bride's", body: "<p>The candles gutter. For a while nobody wants anything from you.</p><p class='note'>Nerve +40, Suspicion −8</p>", choices: [leave()] });
    } });
    ch.push({ label: "Give alms [2s]", note: "+4 Reputation", disabled: S.coin < 2, fn: function () { addCoin(-2); addRep(4); ui().toast("The poor box clinks. Reputation +4."); } });
    ch.push({ label: "Climb the bell tower and keep watch", note: "Watch the streets below for a clue.", fn: function () { lookout("crypt", "The bell tower"); } });
    ch.push(leave());
    dlg({ title: "St Bride's Church", sub: "Chapel Hill", knocker: d.knocker, body: "<p>The great door is never locked. Inside: cold stone, old incense and the smell of candle wax.</p>", choices: ch });
  }

  function hospital(d) {
    var ch = [];
    if (S.dosed) {
      ch.push({ label: "Take the cure on the public ward", note: "Free, but it takes 3 hours.", fn: function () { G.advance(180); cure("Three hours on a hard bench, a nurse with a face like a bulldog, and a great deal of mercury. But it's done."); } });
      ch.push({ label: "Pay for a private room [6s]", note: "1 hour.", disabled: S.coin < 6, fn: function () { addCoin(-6); G.advance(60); cure("Clean sheets, a discreet doctor and a bitter draught. Money well spent."); } });
    }
    if (!S.nightFlags.matron) ch.push({ label: "Ask the matron which girls are on the ward [Charm 9]", fn: function () {
      S.nightFlags.matron = true; G.advance(15);
      var c = check("charm", 9), body = c.text;
      if (c.ok) { var a = doseRumour(), b = doseRumour(); body += "<p>“I shouldn't, but I'd rather you didn't end up in here.”</p>" + (a || "") + (b || "") + (!a && !b ? "<p>“Nobody you don't already know about.”</p>" : ""); }
      else body += "<p>“Patients' names are confidential, young man. Good night.”</p>";
      dlg({ title: "The Matron", body: body, choices: [leave()] });
    } });
    ch.push({ label: "Read the notice on the door", fn: function () {
      dlg({ title: "Notice", body: "<p><b>THE DOSE.</b> Seamen are warned that the venereal disease is prevalent in this port. Treatment is free on the public ward.</p>" +
        "<table class='tbl'><tr><th>Dosed right now</th><td>" + (S.dosed ? "Yes" : "No") + "</td></tr><tr><th>Doses caught this shore leave</th><td>" + S.doses + " of " + MAX_DOSES + "</td></tr><tr><th>Nights until the Gannet sails</th><td>" + G.nightsLeft() + "</td></tr></table>", choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "The Lock Hospital", sub: "Gaslight Square", knocker: d.knocker, body: "<p>A grim stone building with a lamp burning all night. Everyone in Brassmoor knows what it's for, and nobody says it out loud.</p>" +
      (S.dosed ? "<p class='dose-note'>☠ You have the dose. This is the place to be rid of it.</p>" : ""), choices: ch });
  }

  function hall(d) {
    var ch = [];
    if (!S.nightFlags.sang) ch.push({ label: "Sing a sea-shanty for the late crowd [Charm 8]", note: "Earn coin if they like you.", fn: function () {
      S.nightFlags.sang = true; G.advance(30);
      var c = check("charm", 8), body = c.text;
      if (c.ok) { var e = 2 + G.stat("charm"); addCoin(e); gainXP(5); body += "<p>You give them “Leave Her, Johnny” with feeling. Pennies and shillings rain onto the boards. +" + e + "s</p>"; }
      else { addNerve(-5); body += "<p>Somebody throws a cabbage. It's a good throw. Nerve −5</p>"; }
      dlg({ title: "Empire Music Hall", body: body, choices: [leave()] });
    } });
    if (!S.nightFlags.chorus) ch.push({ label: "Chat up the chorus girls at the stage door [Charm 8]", fn: function () {
      S.nightFlags.chorus = true; G.advance(20);
      var c = check("charm", 8), body = c.text;
      body += c.ok ? "<p>They giggle, nudge each other, and one of them leans in.</p>" + giveTestimony("a chorus girl", "plain", false) : "<p>“Get along with you, sailor.”</p>";
      dlg({ title: "Stage door", body: body, choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "Empire Music Hall", sub: "Gaslight Square", knocker: d.knocker, body: "<p>Gilt and limelight, a fiddler sawing away, and the smell of oranges and spilled beer.</p>", choices: ch });
  }

  function mill(d) {
    dlg({ title: "Crake's Mill", sub: "Mill Row", knocker: d.knocker, body: "<p>From the mill roof you could see half of Brassmoor's front doors. A watchman's lantern bobs behind the gate.</p>", choices: [
      { label: "Charm the watchman [Charm 9]", fn: function () {
        var c = check("charm", 9);
        if (c.ok) dlg({ title: "Mill gate", body: c.text + "<p>“Five minutes, mind.”</p>", choices: [{ label: "Climb to the roof", fn: function () { lookout("mill", "The mill roof"); } }] });
        else dlg({ title: "Mill gate", body: c.text + "<p>“Clear off!” He reaches for his cudgel.</p>", choices: [{ label: "Fight your way in", fn: function () { G.fight(makeEnemy("bully", "Mill watchman"), function () { lookout("mill", "The mill roof"); }); } }, leave("Clear off")] });
      } },
      { label: "Bribe him [2s]", disabled: S.coin < 2, fn: function () { addCoin(-2); lookout("mill", "The mill roof"); } },
      leave()] });
  }

  function warehouse(d) {
    dlg({ title: "Bonded Warehouse", sub: "The Wharf", knocker: d.knocker, body: "<p>A side door hangs off one hinge. Crimps are known to lurk in here, waiting for drunk sailors.</p>", choices: [
      { label: "Go in and look around", fn: function () {
        if (!S.nightFlags.wareAmbush && R() < 0.45) { S.nightFlags.wareAmbush = true; return G.fight(makeEnemy("crimp"), function () { lookout("warehouse", "The warehouse loft"); }); }
        lookout("warehouse", "The warehouse loft");
      } }, leave()] });
  }

  function pawn(d) {
    var fenn = byId(BK.LOCALS, "fenn");
    dlg({ title: "Fenn's Pawnshop", sub: "Three brass balls over the door", knocker: d.knocker, body: "<p>Shelves of other people's treasures, and a glass case of everything a sailor on shore leave might need. Mr Fenn watches you over his spectacles.</p>", choices: [
      { label: "Browse the shop", fn: function () { ui().shop(); } },
      { label: "Ask Mr Fenn what he's heard", fn: function () {
        if (S.knocked[d.id]) return dlg({ title: fenn.name, portrait: localPortrait(fenn), body: "<p>“We've spoken tonight, sailor. Buy something or leave.”</p>", choices: [leave()] });
        S.knocked[d.id] = true; localTalk(d, fenn);
      } },
      leave()] });
  }

  /* keep watch from a high or busy place: one truthful clue a night per place */
  function lookout(place, label) {
    label = label || "Lookout";
    if (S.nightFlags["watch" + place]) return dlg({ title: label, body: "<p>You've already kept watch here tonight. Try another night.</p>", choices: [leave()] });
    S.nightFlags["watch" + place] = true;
    G.advance(30);
    var c = check("wits", S.buffs.lantern ? 7 : 8);
    var body = "<p>You settle into the shadows and watch the doors, and who comes and goes.</p>" + c.text;
    if (c.ok) { gainXP(5); body += "<p>Patience pays.</p>" + giveTestimony("your own eyes", "plain", false); }
    else body += "<p>Fog rolls in and you can't see a thing. Try another night.</p>";
    dlg({ title: label, body: body, choices: [leave()] });
  }

  /* ============ chapter end ============ */
  function liarsSummary() {
    var l = S.clues.filter(function (c) { return c.lie; }).map(function (c) { return c.src; });
    return l.length ? "<p>People who lied to you: <b>" + l.filter(function (x, i) { return l.indexOf(x) === i; }).join(", ") + "</b>.</p>" : "";
  }

  function chapterWon(d) {
    sfx("win");
    S.chaptersWon++; S.totals.nights += S.night;
    var bonus = S.doses === 0 ? 20 : 0;
    gainXP(50 + bonus); addCoin(15); addRep(10);
    var last = S.chapter >= BK.CHAPTERS.length - 1;
    var body = "<p>The door opens, and there she is: <b>" + chapter().target + "</b>. She looks at you for a long moment, then smiles. “Took you long enough, sailor.”</p>" +
      "<p class='evidence'>You found the brass: " + G.describeDoor(d) + ".</p>" +
      "<table class='tbl'><tr><th>Nights used</th><td>" + S.night + " of " + chapter().nights + "</td></tr><tr><th>Doses caught</th><td>" + S.doses + (S.doses === 0 ? " (clean as a whistle: +20 XP)" : "") + "</td></tr><tr><th>Doors knocked</th><td>" + S.totals.knocks + " in total</td></tr></table>" +
      liarsSummary() + "<p class='note'>+" + (50 + bonus) + " XP, +15 shillings.</p>";
    if (last) return dlg({ title: "Found her!", body: body, choices: [{ label: "Epilogue", fn: ending }], noClose: true });
    dlg({ title: "Found her!", body: body, choices: [{ label: "Next shore leave: " + BK.CHAPTERS[S.chapter + 1].title.split("—")[1].trim(), fn: function () {
      G.startChapter(S.chapter + 1); addNerve(999); ui().intro();
    } }], noClose: true });
  }

  function ending() {
    var nights = S.totals.nights, doses = S.totals.doses;
    var rank = doses === 0 && nights <= 8 ? "Admiral of the Fleet: never dosed, never lost" : doses === 0 ? "Clean as a Whistle" : doses <= 2 ? "Old Salt" : "Regular at the Lock Hospital";
    S.over = true; G.clearSave();
    dlg({ title: "Epilogue", body: "<p>The Gannet sails for the Indies on the morning tide. In every port from here to Bombay, they'll tell the story of the sailor who found the Brass of Brassmoor.</p>" +
      "<table class='tbl'><tr><th>Rank</th><td>" + rank + "</td></tr><tr><th>Nights taken</th><td>" + nights + "</td></tr><tr><th>Doses caught</th><td>" + doses + "</td></tr><tr><th>Doors knocked</th><td>" + S.totals.knocks +
      "</td></tr><tr><th>Clues gathered</th><td>" + S.totals.clues + "</td></tr><tr><th>Fights won</th><td>" + S.totals.fights + "</td></tr><tr><th>Favours done</th><td>" + S.totals.quests +
      "</td></tr><tr><th>Level</th><td>" + S.level + "</td></tr></table>", choices: [{ label: "Back to title", fn: function () { ui().title(); } }], noClose: true });
  }

  function gameOver(text) {
    sfx("bad");
    var ch = S.chapter, t = doorById(S.target);
    dlg({ title: "Shore leave over", body: "<p>" + text + "</p><p>" + chapter().target + " was behind " + G.describeDoor(t) + ".</p>" + liarsSummary(),
      choices: [
        { label: "Retry this shore leave", note: "A new search; you keep your level and items.", fn: function () { S.over = false; G.startChapter(ch); S.nerve = S.maxNerve; ui().intro(); } },
        { label: "Back to title", fn: function () { S.over = true; G.clearSave(); ui().title(); } }
      ], noClose: true });
    S.over = true;
  }

  /* ============ night & day ============ */
  function goHome() { S.px = WD.start.x; S.py = WD.start.y; S.facing = "up"; if (BK.render) BK.render.snap(); }

  function dawn(slept) {
    var body = slept ? "<p>You sleep like a log in your hammock at the Sailors' Home.</p>" :
      "<p>The sky greys over the mill chimneys. You stagger back to the Sailors' Home through the first carts of the morning, aching.</p>";
    var summary = "<table class='tbl'><tr><th>Doors knocked</th><td>" + S.nightLog.knocks + "</td></tr><tr><th>Clues found</th><td>" + S.nightLog.clues + "</td></tr><tr><th>Doors that still fit</th><td>" + G.candidates().length + "</td></tr></table>";
    var rent = S.coin >= 1;
    if (rent) addCoin(-1); else addRep(-5);
    addSuspicion(-10);
    S.nerve = S.maxNerve - (slept ? 0 : 10);
    var doseNote = "";
    if (S.dosed) { S.nerve = Math.max(1, S.nerve - 20); doseNote = "<p class='dose-note'>☠ It burns. The dose costs you 20 Nerve this morning. Get it cured!</p>"; }
    S.buffs = {}; S.knocked = {}; S.talked = {}; S.nightFlags = {};
    S.night++; S.time = 0; S.nightLog = { knocks: 0, clues: 0 };
    goHome();
    if (S.night > chapter().nights) {
      return gameOver("The Gannet sails on the morning tide, and you're aboard her, without ever having found " + chapter().target + ".");
    }
    var head = pick(BK.HEADLINES), gaz = "";
    if (R() < 0.3) {
      var t = doorById(S.target);
      var cat = pick(Object.keys(BK.CATS));
      var opts = BK.CATS[cat].filter(function (o) { var n = S.notes[cat][o.id]; return o.id !== attr(t, cat) && !(n && n.m === "x"); });
      if (opts.length) {
        var o = pick(opts);
        mark(cat, o.id, "x", "the Gazette");
        gaz = "<p class='note'>In the gossip column, a useful detail: it rules out <b>" + o.name + "</b>.</p>";
        logClue("The Gazette's gossip column rules out " + o.name + ".", "the Gazette");
      }
    }
    G.save();
    sfx("dawn");
    dlg({ title: "Dawn · Night " + (S.night - 1) + " is over", sub: G.nightsLeft() + " night(s) left before the Gannet sails", body: body + summary + doseNote +
      "<div class='gazette'><div class='gz-title'>THE BRASSMOOR GAZETTE</div><div class='gz-head'>" + head + "</div></div>" + gaz +
      "<p class='note'>" + (rent ? "Hammock paid for (1s)." : "You couldn't pay for your hammock. The matron will remember it (Reputation −5).") + " Suspicion fades a little.</p>",
      choices: [{ label: "Sleep through the day, and go out at 8pm", fn: function () { ui().toast("Night " + S.night + " · 8:00pm"); } }], noClose: true });
  }
  G.dawn = dawn;

  function collapse() {
    var lost = Math.floor(S.coin / 2); S.coin -= lost;
    S.nerve = 1;
    dlg({ title: "Everything goes dark", body: "<p>Your legs go out from under you. When you come to, your purse is lighter by " + lost + " shillings, and it's nearly morning.</p>",
      choices: [{ label: "Crawl home", fn: function () { S.time = NIGHT_LEN; dawn(false); } }], noClose: true });
  }

  function arrested() {
    var lost = Math.floor(S.coin / 2); S.coin -= lost;
    S.suspicion = 50;
    sfx("bad");
    dlg({ title: "Arrested!", body: "<p>A whistle shrills, then another. You spend the rest of the night in the cells at the Station House, and the desk sergeant helps himself to " + lost + " shillings for 'costs'.</p>",
      choices: [{ label: "Released at dawn", fn: function () { S.time = NIGHT_LEN; dawn(false); } }], noClose: true });
  }

  /* ============ street events ============ */
  function makeEnemy(id, name) {
    var e = byId(BK.ENEMIES, id);
    var boost = chapter().enemyBoost;
    return { name: name || e.name, hp: e.hp + boost * 3, atk: e.atk + Math.floor(boost / 2), will: e.will + Math.floor(boost / 2), xp: e.xp, coin: e.coin, line: e.line };
  }

  G.onStep = function () {
    G.advance(1);
    if (S.encounterCool > 0) { S.encounterCool--; return false; }
    var dist = WD.district(S.px, S.py);
    if (WD.get(S.px, S.py) === WD.TILE.PLAZA) return false;
    var p = 0.008 * ({ rookery: 1.8, wharf: 1.6, mill: 1.0, square: 0.5, chapel: 0.6 }[dist] || 1);
    if (S.time > 300) p *= 1.3;
    if (R() < p) {
      S.encounterCool = 30;
      var pool = BK.ENEMIES.filter(function (e) { return !e.minCh || e.minCh <= S.chapter; });
      if (dist === "wharf") pool = pool.concat([byId(BK.ENEMIES, "crimp")]);
      G.fight(makeEnemy(pick(pool).id));
      return true;
    }
    return false;
  };

  G.constableStop = function () {
    var dc = 8 + Math.floor(S.suspicion / 15);
    dlg({ title: "“Evening, sailor.”", sub: "A constable steps out of the fog", portrait: { seed: "constable", coat: "#1a2440", hair: "#3a2a1a", hat: "helmet", skin: "#e0c0a0" },
      body: "<p>“Been knocking on a lot of doors tonight, haven't we? There've been complaints.”</p><p class='note'>Your Suspicion is " + S.suspicion + ".</p>",
      choices: [
        { label: "Slip him a few coins [3s]", disabled: S.coin < 3, fn: function () { addCoin(-3); addSuspicion(-5); ui().toast("He pockets it and suddenly finds the lamp-post fascinating."); } },
        { label: "Talk your way out [Charm " + dc + "]", fn: function () {
          var c = check("charm", dc);
          if (c.ok) dlg({ title: "Constable", body: c.text + "<p>“Go on, then. And get back to your ship.”</p>", choices: [leave()] });
          else cells(c.text);
        } },
        { label: "Run for it [Wits " + dc + "]", fn: function () {
          var c = check("wits", dc);
          if (c.ok) dlg({ title: "Away!", body: c.text + "<p>Down an alley, over a wall, and gone. His whistle fades behind you.</p>", choices: [leave()] });
          else cells(c.text);
        } },
        { label: "Go quietly", note: "Two hours in the cells, but it calms things down (−10 Suspicion).", fn: function () { G.advance(120); addSuspicion(-10); goHome(); dlg({ title: "The cells", body: "<p>Two hours on a cold bench. They let you go with a warning.</p>", choices: [leave()] }); } }
      ], noClose: true });
  };
  function cells(pre) {
    var g = addSuspicion(10); G.advance(120);
    dlg({ title: "The cells", body: pre + "<p>A hand on your collar, and two hours on a cold bench at the Station House.</p><p class='note'>Suspicion +" + g + "</p>", choices: [leave()] });
  }

  /* ============ combat ============ */
  G.fight = function (enemy, onWin) {
    var e = { name: enemy.name, hp: enemy.hp, maxHp: enemy.hp, atk: enemy.atk, will: enemy.will, xp: enemy.xp, coin: enemy.coin };
    var log = [enemy.line || ("A " + enemy.name + " blocks your way!")];
    sfx("alarm");
    function enemyHits() {
      if (R() < 0.75 - G.stat("wits") * 0.03) {
        var dmg = Math.max(1, e.atk + ri(0, 2) - defBonus());
        addNerve(-dmg); sfx("hurt");
        log.push(e.name + " hits you for <b>" + dmg + "</b>.");
      } else log.push(e.name + " swings and misses.");
    }
    function end(outcome) {
      if (outcome === "win") {
        S.totals.fights++;
        var c = e.coin ? ri(e.coin[0], e.coin[1]) : 0;
        addCoin(c); gainXP(e.xp);
        dlg({ title: "You win", body: "<p>" + log.slice(-2).join("<br>") + "</p><p>" + e.name + " flees into the fog.</p><p class='note'>+" + e.xp + " XP" + (c ? ", +" + c + " shillings" : "") + "</p>",
          choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "talk") {
        gainXP(Math.round(e.xp / 2));
        dlg({ title: "Talked down", body: "<p>" + log[log.length - 1] + "</p><p class='note'>+" + Math.round(e.xp / 2) + " XP</p>", choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "flee") {
        dlg({ title: "Escaped", body: "<p>You dart down a side-alley and lose them.</p>", choices: [leave("Catch your breath")], noClose: true });
      } else {
        S.nerve = 0;
        dlg({ title: "Beaten", body: "<p>" + log.slice(-2).join("<br>") + "</p>", choices: [leave("…")], noClose: true });
      }
    }
    function round(action, itemId) {
      if (action === "strike") {
        if (R() < 0.8) {
          var dmg = 2 + G.stat("grit") + atkBonus() + ri(0, 3);
          e.hp -= dmg; sfx("hit");
          log.push("You hit " + e.name + " for <b>" + dmg + "</b>.");
        } else log.push("You swing and miss.");
        if (e.hp <= 0) return end("win");
      } else if (action === "talk") {
        var c = check("charm", e.will);
        if (c.ok) { log.push("You talk fast and friendly, and they lower their fists. " + c.text); return end("talk"); }
        log.push("They're not listening. " + c.text);
      } else if (action === "flee") {
        var f = check("wits", 7 + Math.ceil(e.atk / 2));
        if (f.ok) return end("flee");
        log.push("You try to run, but they cut you off. " + f.text);
      } else if (action === "item") {
        G.useItem(itemId, true);
        log.push("You use the " + BK.ITEMS[itemId].name.toLowerCase() + ".");
      }
      enemyHits();
      if (S.nerve <= 0) return end("lose");
      show();
    }
    function show() {
      var consum = Object.keys(S.inv).filter(function (k) { var it = BK.ITEMS[k]; return it.use && it.use.nerve; });
      var ch = [
        { label: "Strike [Grit]", note: "Damage " + (2 + G.stat("grit") + atkBonus()) + "–" + (5 + G.stat("grit") + atkBonus()), fn: function () { round("strike"); } },
        { label: "Talk them down [Charm " + e.will + "]", fn: function () { round("talk"); } },
        { label: "Run [Wits " + (7 + Math.ceil(e.atk / 2)) + "]", fn: function () { round("flee"); } }
      ];
      consum.forEach(function (k) { ch.push({ label: "Use " + BK.ITEMS[k].name + " (" + S.inv[k] + ")", note: BK.ITEMS[k].desc, fn: function () { round("item", k); } }); });
      var bar = function (v, m, cls) { return "<div class='bar " + cls + "'><i style='width:" + Math.max(0, Math.round(100 * v / m)) + "%'></i><span>" + Math.max(0, v) + " / " + m + "</span></div>"; };
      dlg({ title: e.name, sub: "Street fight", portrait: { seed: e.name, coat: "#2a2a2a", hair: "#2a1a0a", hat: "cap", skin: "#c8a080" },
        body: "<div class='fight'><div><b>" + e.name + "</b>" + bar(e.hp, e.maxHp, "enemy") + "</div><div><b>Jack</b>" + bar(S.nerve, S.maxNerve, "nerve") + "</div></div><div class='log'>" + log.slice(-3).join("<br>") + "</div>",
        choices: ch, noClose: true });
    }
    show();
  };

  /* ============ items & shop ============ */
  G.useItem = function (id, silent) {
    var it = BK.ITEMS[id];
    if (!it || !S.inv[id]) return;
    if (it.equip) {
      var slot = it.equip.slot;
      S.equip[slot] = S.equip[slot] === id ? null : id;
      if (!silent) ui().toast(S.equip[slot] ? "Equipped " + it.name + "." : "Took off " + it.name + ".");
      return;
    }
    if (!it.use) { if (!silent) ui().toast(it.name + " is used automatically when needed."); return; }
    var u = it.use;
    if (u.cure !== undefined) {
      if (!S.dosed) { if (!silent) ui().toast("You don't have the dose. Save the pills."); return; }
      takeItem(id);
      if (R() < u.cure) { cure("You choke down the mercury pills. Three days of feeling like death, compressed into one night, but it's gone."); }
      else ui().toast("The pills make you sick as a dog, but the dose is still there.");
      return;
    }
    takeItem(id);
    if (u.nerve) addNerve(u.nerve);
    if (u.suspicion) addSuspicion(u.suspicion);
    if (u.lantern) S.buffs.lantern = 1;
    if (u.cologne) S.buffs.cologne = 1;
    if (u.snuff) S.buffs.snuff = 1;
    sfx("blip");
    if (!silent) ui().toast("Used " + it.name + ".");
  };
  G.priceOf = function (id) { var p = BK.ITEMS[id].price; if (S.rep < 0) p += 1; if (S.rep >= 30) p = Math.max(1, p - 1); return p; };
  G.buy = function (id) {
    var p = G.priceOf(id);
    if (S.coin < p) return false;
    addCoin(-p); G.addItem(id); return true;
  };
  G.sell = function (id) {
    var it = BK.ITEMS[id];
    if (!S.inv[id] || it.quest) return false;
    if (S.equip.weapon === id && S.inv[id] === 1) S.equip.weapon = null;
    if (S.equip.wear === id && S.inv[id] === 1) S.equip.wear = null;
    takeItem(id); addCoin(Math.max(1, Math.floor(it.price / 2))); return true;
  };
})();
