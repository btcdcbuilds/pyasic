/* The Brass Knocker — rules, state and story flow. */
"use strict";
(function () {
  var U = BK.util, WD = BK.world;
  var G = BK.game = {};
  var S = null;
  var NIGHT_LEN = 540;           // 8pm to 5am, in minutes
  var SAVE_KEY = "brassknocker.save.v1";
  G.NIGHT_LEN = NIGHT_LEN;

  function R() { return Math.random(); }
  function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
  function ui() { return BK.ui; }
  function sfx(n) { if (BK.sfx && BK.sfx[n]) BK.sfx[n].apply(null, Array.prototype.slice.call(arguments, 1)); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function catList(cat) { return BK.CATS[cat]; }
  function itemName(cat, id) { var o = byId(catList(cat), id); return o ? o.name : id; }
  function chapter() { return BK.CHAPTERS[S.chapter]; }
  function doorById(id) { for (var i = 0; i < WD.doors.length; i++) if (WD.doors[i].id === id) return WD.doors[i]; return null; }
  G.doorById = doorById;
  G.itemName = itemName;

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
      v: 1, seed: (R() * 1e9) | 0, chapter: 0, night: 1, time: 0,
      px: WD.start.x, py: WD.start.y, facing: "up",
      charm: 3, wits: 2, grit: 2, level: 1, xp: 0, nerve: 50, maxNerve: 50,
      coin: 5, suspicion: 0, rep: 0,
      inv: { bread: 2 }, equip: { weapon: null, wear: null }, buffs: {},
      knocked: {}, talked: {}, nightFlags: {}, strikes: 0, pressed: {},
      notes: { suspect: {}, means: {}, place: {} }, clues: [], quests: [], secrets: {}, residents: {},
      searched: {}, secretKnock: false, totals: { knocks: 0, clues: 0, fights: 0, quests: 0, nights: 0 },
      nightLog: { knocks: 0, clues: 0 }, queue: [], over: false, encounterCool: 0, chaptersWon: 0
    };
    genResidents();
    G.startChapter(0);
  };

  function genResidents() {
    WD.doors.forEach(function (d, i) {
      if (d.kind !== "resident") return;
      var rng = U.mulberry32(S.seed ^ U.hash(d.id));
      var first = U.pick(rng, BK.NAMES.first), last = U.pick(rng, BK.NAMES.last);
      var trait = BK.KNOCKERS[d.knocker].trait;
      S.residents[d.id] = {
        name: first + " " + last, job: trait === "sister" ? "working girl" : U.pick(rng, BK.NAMES.jobs[d.district]),
        trait: trait, met: false,
        look: { coat: U.pick(rng, ["#3a2a2a", "#2a3a4a", "#4a3a2a", "#2a4a3a", "#4a2a3a", "#555048", "#6a4a2a", "#283048"]),
          hair: U.pick(rng, ["#1a1208", "#3a2410", "#6a4420", "#a08060", "#c0c0b8", "#8a3a10", "#d0a050"]),
          skin: U.pick(rng, ["#e8c8a8", "#d8b090", "#c09070", "#a07050", "#7a5038", "#f0d0b8"]),
          hat: U.pick(rng, trait === "sister" ? ["feather", "none", "bonnet"] : ["none", "cap", "bowler", "bonnet", "top", "none"]) },
        cluesLeft: 2
      };
    });
    // number the doors per district, for addresses
    var counts = {};
    WD.doors.forEach(function (d) { counts[d.district] = (counts[d.district] || 0) + 1; d.num = counts[d.district]; });
  }

  G.address = function (d) { return "No. " + d.num + ", " + BK.DISTRICT_NAMES[d.district]; };

  G.startChapter = function (ch) {
    S.chapter = ch;
    var c = chapter();
    S.solution = { suspect: pick(BK.SUSPECTS).id, means: pick(BK.MEANS).id, place: pick(BK.PLACES).id };
    S.notes = { suspect: {}, means: {}, place: {} };
    S.clues = []; S.strikes = 0; S.night = 1; S.time = 0; S.knocked = {}; S.talked = {}; S.nightFlags = {};
    S.searched = {}; S.pressed = {}; S.secrets = {}; S.buffs = {}; S.suspicion = 0;
    S.nightLog = { knocks: 0, clues: 0 };
    S.px = WD.start.x; S.py = WD.start.y; S.facing = "up";
    var resDoors = WD.doors.filter(function (d) { return d.kind === "resident"; });
    resDoors.forEach(function (d) {
      var r = S.residents[d.id];
      r.cluesLeft = r.trait === "scholar" ? 3 : 2;
      r.evidence = null; r.holds = null; r.gives = null;
      r.secret = (r.trait === "wealthy" || R() < 0.3) ? pick(SECRET_TEMPLATES) : null;
    });
    // two pieces of hard evidence hidden behind doors
    var shuffled = U.shuffle(R, resDoors.filter(function (d) { return S.residents[d.id].trait !== "sister"; }));
    S.residents[shuffled[0].id].evidence = "means";
    S.residents[shuffled[1].id].evidence = "place";
    // side quests
    S.quests = [];
    var qItems = U.shuffle(R, BK.QUEST_ITEMS).slice(0, 3);
    var qi = 2;
    qItems.forEach(function (item) {
      var giver = shuffled[qi++], holder = shuffled[qi++];
      S.residents[giver.id].gives = item;
      S.residents[holder.id].holds = item;
      S.quests.push({ item: item, giver: giver.id, holder: holder.id, state: "unknown", reward: ri(5, 9) + ch * 3 });
    });
    G.save();
  };

  /* ============ derived stats ============ */
  G.stat = function (k) {
    var v = S[k];
    if (k === "charm" && S.buffs.perfume) v += 2;
    if (k === "wits" && S.buffs.snuff) v += 2;
    return v;
  };
  function atkBonus() { var w = S.equip.weapon; return w ? BK.ITEMS[w].equip.atk : 0; }
  function defBonus() { var w = S.equip.wear; return w && BK.ITEMS[w].equip.def ? BK.ITEMS[w].equip.def : 0; }
  G.xpNext = function () { return 20 + S.level * 20; };
  G.clockText = function () { return U.fmtTime(20 * 60 + S.time); };
  G.nightsLeft = function () { return chapter().nights - S.night + 1; };

  function check(stat, dc, hidden) {
    var roll = ri(1, 10), val = G.stat(stat), total = roll + val;
    var ok = roll === 10 || (roll !== 1 && total >= dc);
    var label = stat.charAt(0).toUpperCase() + stat.slice(1);
    var text = hidden ? "" : '<div class="roll ' + (ok ? "ok" : "bad") + '">' + label + " " + val + " + d10 roll " + roll + " = " + total + " vs " + dc + (ok ? " — success" : " — failed") + "</div>";
    return { ok: ok, text: text, roll: roll };
  }
  G.check = check;

  function addSuspicion(n) {
    if (n > 0 && S.equip.wear === "shawl") n = Math.round(n * 0.67);
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
    if (cur && cur.m === "!" && m !== "!") return false;
    if (cur && cur.m === "x" && m === "?") return false;
    S.notes[cat][id] = { m: m, src: src };
    return true;
  }
  G.cycleMark = function (cat, id) {
    var order = ["", "x", "?", "!"];
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

  var ALIBIS = ["drinking in the Drowned Man till they were thrown out", "at my own table playing whist until three", "in the front pew at the night vigil",
    "on the far side of town, shouting at a cab-man", "being sick in my gutter, if you must know", "at the Empire, three rows from the front",
    "arguing with the harbourmaster on the quay", "asleep in a chair at the Mechanics' Institute"];
  var MEANS_WHY = ["The constables found it clean as a whistle.", "There's only one on this street and it never left my sight.",
    "The coroner's man says the wounds don't fit.", "It was under lock and key the whole night.", "That turned up hours later, miles away from the body."];
  var PLACE_WHY = ["I was there half the night, and it was quiet as the grave.", "There were twenty people there all evening. Somebody would have seen.",
    "The watchman there swears there wasn't a soul about.", "My brother sweeps it out at dawn and there wasn't so much as a drop of blood."];

  function testimonyText(cat, id) {
    var o = byId(catList(cat), id);
    if (cat === "suspect") return "“" + o.name + "? No. " + o.short + " was " + pick(ALIBIS) + ". I'd swear to it.”";
    if (cat === "means") return "“The " + o.name.toLowerCase() + "? Not a chance. " + pick(MEANS_WHY) + "”";
    return "“" + o.name + "? " + pick(PLACE_WHY) + "”";
  }

  /* returns html describing the clue */
  function giveTestimony(srcName, trait, allowLie) {
    var c = chapter();
    var cats = U.shuffle(R, ["suspect", "means", "place"]);
    var canLie = allowLie && (trait === "shifty" || trait === "gambler") && R() < c.lieChance;
    if (canLie) {
      var lc = cats[0], lid = S.solution[lc];
      var txt = testimonyText(lc, lid);
      var det = check("wits", 9, false);
      if (det.ok) {
        mark(lc, lid, "?", srcName + " (you suspect a lie)");
        logClue(txt + " <em>You think they're lying.</em>", srcName, { doubted: true });
        return txt + det.text + '<p class="note">Something in their eyes says they’re lying. You note it with a question mark.</p>';
      }
      mark(lc, lid, "x", srcName);
      logClue(txt, srcName, { lie: true });
      return txt + det.text + '<p class="note">You cross ' + itemName(lc, lid) + " off your list.</p>";
    }
    var cands = [];
    cats.forEach(function (cat) {
      catList(cat).forEach(function (o) {
        if (o.id === S.solution[cat]) return;
        var n = S.notes[cat][o.id];
        if (n && n.m === "x" && n.src !== "your own note") return;
        cands.push({ cat: cat, id: o.id });
      });
    });
    if (!cands.length) return "<p>They have nothing you don't already know.</p>";
    var p = pick(cands);
    var t = testimonyText(p.cat, p.id);
    mark(p.cat, p.id, "x", srcName);
    logClue(t, srcName);
    gainXP(5); sfx("clue");
    return t + '<p class="note">You cross <b>' + itemName(p.cat, p.id) + "</b> off your list.</p>";
  }
  G._giveTestimony = giveTestimony;

  function eliminateTrue(src, cat) {
    var c = catList(cat).filter(function (o) {
      var n = S.notes[cat][o.id];
      return o.id !== S.solution[cat] && !(n && n.m === "x" && n.src !== "your own note");
    });
    if (!c.length) return null;
    var o = pick(c);
    mark(cat, o.id, "x", src);
    return o;
  }

  var EVIDENCE_TEXT = {
    means: function (id) { return "Wrapped in sacking under the stairs, you find it: the " + itemName("means", id).toLowerCase() + ", still stained. Someone hid it here in a hurry."; },
    place: function (id) { return "A pawn ticket, a scrap of torn shawl and a smear of mud, and all of them point one way: it happened at " + itemName("place", id) + "."; },
    suspect: function (id) { return "There's no doubt left: " + itemName("suspect", id) + " is the one."; }
  };
  function giveEvidence(cat, src) {
    var id = S.solution[cat];
    mark(cat, id, "!", src);
    var t = EVIDENCE_TEXT[cat](id);
    logClue("<b>HARD EVIDENCE:</b> " + t, src, { evidence: true });
    gainXP(15); sfx("evidence");
    return '<p class="evidence">' + t + '</p><p class="note">Marked <b>' + itemName(cat, id) + "</b> with a ★ in your notebook.</p>";
  }

  var SECRET_TEMPLATES = ["keeps a second family in the Rookery", "has been pawning the church silver, piece by piece",
    "owes forty guineas to the mermaid-door gamblers", "writes love letters to Kitty Lark under a false name",
    "visits the sisters' houses every Thursday while their spouse is at chapel", "smuggles brandy off the brig Gannet",
    "forged the signature on their late uncle's will", "was dismissed from the mill for theft and never told a soul"];

  function learnRandomSecret(excludeId) {
    var opts = WD.doors.filter(function (d) {
      var r = S.residents[d.id];
      return r && r.secret && !S.secrets[d.id] && d.id !== excludeId;
    });
    if (!opts.length) return "<p>" + pick(BK.RUMOURS) + "</p>";
    var d = pick(opts), r = S.residents[d.id];
    S.secrets[d.id] = true;
    return '<p class="secret">A whispered secret: whoever lives behind the <b>' + BK.KNOCKERS[d.knocker].name.toLowerCase() + "</b> knocker at <b>" +
      G.address(d) + "</b> — " + r.name + ", the " + r.job + " — " + r.secret + '.</p><p class="note">Secrets give you leverage. Knock on that door and use it.</p>';
  }

  /* ============ flow helpers ============ */
  function dlg(o) { ui().dialog(o); }
  function leave(label) { return { label: label || "Leave", fn: function () { } }; }
  function residentPortrait(r) { return { seed: r.name, coat: r.look.coat, hair: r.look.hair, skin: r.look.skin, hat: r.look.hat }; }
  function suspectPortrait(s) { return { seed: s.id, coat: s.coat, hair: s.hair, hat: s.hat, skin: "#e0c0a0" }; }

  G.afterModal = function () {
    if (!S || S.over) return;
    if (S.queue.length) {
      var q = S.queue.shift();
      if (q.type === "levelup") return levelUp();
      if (q.type === "fn") return q.fn();
    }
    if (S.suspicion >= 100) return arrested();
    if (S.nerve <= 0) return collapse();
    if (S.time >= NIGHT_LEN) return dawn(false);
    G.save();
  };

  function levelUp() {
    sfx("level");
    dlg({
      title: "Level " + S.level + "!", sub: "Brassmoor is teaching you its ways.",
      body: "<p>Your maximum Nerve rises to " + S.maxNerve + ". Choose a talent to sharpen:</p>",
      choices: [
        { label: "Charm +1", note: "Sweet-talking, singing, talking down a fight", fn: function () { S.charm++; } },
        { label: "Wits +1", note: "Spotting lies, searching, slipping away", fn: function () { S.wits++; } },
        { label: "Grit +1", note: "Leaning on people, fighting, hitting harder", fn: function () { S.grit++; } }
      ], noClose: true
    });
  }

  /* ============ interaction entry points ============ */
  G.interact = function (target) {
    if (!target) return;
    if (target.spot) return sceneSpot(target.spot);
    var d = target.door;
    if (d.kind === "home") return homeMenu(d);
    if (d.kind === "landmark") return landmark(d);
    if (d.kind === "suspect") return suspectDoor(d);
    return residentDoor(d);
  };

  /* ---------- resident doors ---------- */
  function questReturn(d) {
    var r = S.residents[d.id];
    if (!r.gives) return false;
    var q = S.quests.filter(function (q) { return q.giver === d.id && q.state !== "done"; })[0];
    if (!q || !S.inv[q.item]) return false;
    takeItem(q.item); q.state = "done"; addCoin(q.reward); gainXP(20); addRep(6); S.totals.quests++;
    dlg({
      title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r),
      body: "<p>Their face lights up when they see the " + BK.ITEMS[q.item].name.toLowerCase() + ".</p><p>“You found it! Bless you, girl, whatever they say about you.”</p>" +
        '<p class="note">Quest complete: +' + q.reward + " shillings, +20 XP, and your reputation improves.</p>" +
        (r.cluesLeft > 0 ? "<p>“And here, something you'll want to hear…”</p>" + giveTestimony(r.name, r.trait, false) : ""),
      choices: [leave("Thank them and go")]
    });
    if (r.cluesLeft > 0) r.cluesLeft--;
    return true;
  }

  function residentDoor(d) {
    var r = S.residents[d.id], kn = BK.KNOCKERS[d.knocker];
    if (questReturn(d)) return;
    var who = r.met ? "<p>This is where <b>" + r.name + "</b>, " + r.job + ", lives.</p>" : "<p>You don't know who lives here.</p>";
    if (S.knocked[d.id]) {
      return dlg({ title: G.address(d), sub: kn.name + " knocker", body: who + "<p>You've already knocked here tonight. Knock again and they'll fetch a constable.</p>", choices: [leave()] });
    }
    var ch = [
      { label: "Gentle knock", note: "Polite. Less likely to be answered.", fn: function () { knock(d, "gentle"); } },
      { label: "Firm knock", note: "Hard to ignore, but it annoys folk and draws eyes (+Suspicion).", fn: function () { knock(d, "firm"); } }
    ];
    if (r.trait === "sister" && S.secretKnock) ch.unshift({ label: "The sisters' secret knock", note: "Two quick, one slow. Always answered.", fn: function () { knock(d, "secret"); } });
    ch.push(leave());
    dlg({ title: G.address(d), sub: kn.name + " knocker", knocker: d.knocker, body: who + '<p class="hint">' + kn.hint + "</p>", choices: ch });
  }

  function knock(d, style) {
    var r = S.residents[d.id];
    S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++;
    G.advance(10); sfx("knock", style);
    var p = style === "gentle" ? 0.62 : style === "firm" ? 0.86 : 1;
    if (style !== "secret") {
      if (S.time > 360) p -= 0.12;
      if (r.trait === "sister") p += S.rep / 200;
      if (r.trait === "wealthy" && style === "gentle") p -= 0.08;
    }
    if (style === "firm") addSuspicion(3);
    if (R() > p) return noAnswer(d);
    r.met = true;
    var hostile = { wealthy: 0.16, sailor: 0.14, shifty: 0.1, devout: 0.12, plain: 0.08, scholar: 0.07, sister: 0.02, gambler: 0.1 }[r.trait] + (style === "firm" ? 0.08 : 0) - S.rep / 400;
    if (style === "secret") hostile = 0;
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
    var r = S.residents[d.id];
    takeItem("lockpick"); G.advance(20);
    var gain = addSuspicion(12);
    var c = check("wits", 9);
    var body = "<p>The lock gives with a click. You slip inside, into the smell of coal-smoke and boiled cabbage.</p>" + c.text;
    if (c.ok) {
      if (r.evidence) { body += giveEvidence(r.evidence, "a search of " + G.address(d)); r.evidence = null; }
      else if (r.holds && S.quests.some(function (q) { return q.holder === d.id && q.state !== "done" && !S.inv[q.item]; })) {
        G.addItem(r.holds); body += "<p>On the mantelpiece: a " + BK.ITEMS[r.holds].name.toLowerCase() + ". Somebody's missing that. You pocket it.</p>";
        S.quests.forEach(function (q) { if (q.holder === d.id && q.state !== "done") q.state = q.state === "unknown" ? "found" : "carrying"; });
      } else if (R() < 0.5 && r.cluesLeft > 0) {
        r.cluesLeft--;
        body += "<p>A half-written letter on the table catches your eye:</p>" + giveTestimony("a letter at " + G.address(d), "plain", false);
      } else {
        var c2 = ri(2, 6); addCoin(c2); body += "<p>A jar of coins behind the clock. You take " + c2 + " shillings and try not to feel bad about it.</p>";
      }
    } else {
      addSuspicion(8);
      body += "<p>A floorboard shrieks. Upstairs, somebody shouts “THIEF!” and you bolt into the fog.</p>";
    }
    body += '<p class="note">Suspicion +' + gain + "</p>";
    dlg({ title: "Inside " + G.address(d), body: body, choices: [leave("Slip back out")] });
  }

  function hostileDoor(d) {
    var r = S.residents[d.id];
    var t = r.trait, body, after = null;
    if (t === "sailor" || (t === "shifty" && R() < 0.5)) {
      body = "<p>The door bangs open and " + r.name + " comes out swinging. “I know your sort!”</p>";
      after = function () { G.fight(makeEnemy("sailor", r.name)); };
    } else if (t === "wealthy" || t === "scholar") {
      var g = addSuspicion(12);
      body = "<p>A maid peers out, then shrieks for the master. A window goes up: “CONSTABLE! There's a brass at my door!”</p><p class='note'>Suspicion +" + g + "</p>";
    } else if (t === "devout") {
      addNerve(-6);
      body = "<p>" + r.name + " reads you a long passage about the wages of sin, then slams the door. It stings more than you'd like.</p><p class='note'>Nerve −6</p>";
    } else {
      addNerve(-8);
      body = "<p>An upstairs window opens and a chamber-pot's worth of slops narrowly doesn't miss you.</p><p class='note'>Nerve −8</p>";
    }
    dlg({ title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r), body: body, choices: [{ label: after ? "Defend yourself" : "Retreat", fn: after || function () { } }] });
  }

  var GREET = {
    wealthy: ["“What the devil do you want at this hour?”", "“If you're collecting, the tradesman's entrance is round the back.”"],
    shifty: ["“Well, well. Nell Tanner. What's it worth to you?”", "“Depends who's asking, don't it?”"],
    devout: ["“The Lord sees all who walk abroad at night, girl.”", "“If you've come to repent, the chapel opens at six.”"],
    sailor: ["“Ahoy, Nell! You look like you've weathered a squall.”", "“Come to see an old salt, have you?”"],
    scholar: ["“Hmm? Ah. You have a question. Phrase it precisely.”", "“Do come in out of the draught; you're letting the fog in.”"],
    sister: ["“Nell! Get in here before you catch your death.”", "“Oh love, we heard. Poor thing. What do you need?”"],
    plain: ["“Do you know what time it is? Some of us work in the morning.”", "“Oh. It's you. What is it?”"],
    gambler: ["“Feeling lucky, Nell?”", "“House always wins, darling, but you're welcome to try.”"]
  };

  function conversation(d, style) {
    var r = S.residents[d.id];
    var dcBase = { wealthy: 10, shifty: 9, devout: 11, sailor: 8, scholar: 9, sister: 6, plain: 8, gambler: 9 }[r.trait] + (style === "firm" ? 1 : 0);
    var body = "<p>" + pick(GREET[r.trait]) + "</p>";
    var ch = [];
    var victim = chapter().victim;
    if (r.cluesLeft > 0 && !S.talked[d.id]) {
      ch.push({ label: "Sweet-talk them about " + victim.split(",")[0] + " [Charm " + dcBase + "]", fn: function () { approach(d, "charm", dcBase); } });
      var price = r.trait === "scholar" || r.trait === "wealthy" ? 3 : 2;
      if (r.trait === "devout") ch.push({ label: "Offer coin for what they know", note: "Devout folk won't take a brass's money.", disabled: true });
      else ch.push({ label: "Pay for what they know [" + price + "s]", disabled: S.coin < price, note: S.coin < price ? "You can't afford it." : "", fn: function () { addCoin(-price); approach(d, "pay", 0); } });
      ch.push({ label: "Lean on them [Grit " + (dcBase - 1) + "]", note: "Works, but draws attention (+Suspicion).", fn: function () { approach(d, "grit", dcBase - 1); } });
      if (S.secrets[d.id]) ch.push({ label: "Remind them of their secret", note: "Sure to work and worth double, but it hurts your reputation.", fn: function () { approach(d, "secret", 0); } });
    } else if (r.cluesLeft <= 0) {
      body += "<p>They've told you everything they know about the case.</p>";
    } else {
      body += "<p>They've already talked to you tonight.</p>";
    }
    if (r.holds && S.quests.some(function (q) { return q.holder === d.id && q.state !== "done" && !S.inv[q.item]; })) {
      ch.push({ label: "Ask about lost belongings", fn: function () { handOver(d); } });
    }
    if (r.trait === "gambler" && !S.nightFlags["bet" + d.id]) {
      ch.push({ label: "Have a flutter on the dice [bet 2s]", disabled: S.coin < 2, fn: function () { gamble(d); } });
    }
    if (r.trait === "sister") {
      if (!S.nightFlags["rest" + d.id]) ch.push({ label: "Sit by their fire a while", note: "+20 Nerve, 20 minutes", fn: function () {
        S.nightFlags["rest" + d.id] = true; G.advance(20); addNerve(20);
        dlg({ title: r.name, portrait: residentPortrait(r), body: "<p>Tea with something stronger in it, a warm fire and gossip about the regulars. You feel more like yourself.</p><p class='note'>Nerve +20</p>", choices: [leave("Back into the fog")] });
      } });
      if (!S.secretKnock) ch.push({ label: "Ask to be taught the sisters' knock", fn: function () {
        S.secretKnock = true;
        dlg({ title: r.name, portrait: residentPortrait(r), body: "<p>“Two quick, one slow, on the rose. Any of our doors will open for that, Nell.”</p><p class='note'>You learned the secret knock. Rose doors will always answer you.</p>", choices: [leave("Thank her")] });
      } });
    }
    ch.push(leave("Say goodnight"));
    dlg({ title: r.name, sub: r.job + " · " + G.address(d), portrait: residentPortrait(r), body: body, choices: ch });
  }

  function approach(d, how, dc) {
    var r = S.residents[d.id];
    S.talked[d.id] = true;
    G.advance(10);
    var body = "", res = null;
    if (how === "charm" || how === "grit") {
      res = check(how, dc);
      body += res.text;
      if (how === "grit") { var g = addSuspicion(res.ok ? 6 : 10); body += "<p class='note'>Suspicion +" + g + "</p>"; }
      if (!res.ok) {
        if (how === "grit" && r.trait === "sailor") {
          return dlg({ title: r.name, portrait: residentPortrait(r), body: body + "<p>“Threaten ME, would you?” Fists come up.</p>", choices: [{ label: "Fight", fn: function () { G.fight(makeEnemy("sailor", r.name)); } }] });
        }
        body += "<p>" + (how === "charm" ? "They're not having it. “Goodnight, Nell.” The door closes, politely but firmly." : "They stare you down and slam the door. You'll get nothing here tonight.") + "</p>";
        return dlg({ title: r.name, portrait: residentPortrait(r), body: body, choices: [leave()] });
      }
    }
    if (how === "secret") { addRep(-4); body += "<p>You lean close and murmur what you know. The colour drains from their face.</p>"; }
    if (how === "pay") body += "<p>The coins vanish into a pocket.</p>";
    r.cluesLeft--;
    if (r.evidence) {
      body += "<p>“I wasn't going to show anyone… but you'd better see this.”</p>" + giveEvidence(r.evidence, r.name);
      r.evidence = null;
    } else {
      body += giveTestimony(r.name, r.trait, true);
      if (how === "secret" && r.cluesLeft >= 0) body += "<p>“…and there's more, if it keeps you quiet.”</p>" + giveTestimony(r.name, r.trait, false);
    }
    if (r.gives) {
      var q = S.quests.filter(function (q) { return q.giver === d.id; })[0];
      if (q && q.state === "unknown") {
        q.state = "active";
        var hd = doorById(q.holder);
        body += "<p class='quest'>“One more thing. I've lost my " + BK.ITEMS[q.item].name.toLowerCase() + ". Last I had it was down in " + BK.DISTRICT_NAMES[hd.district] +
          ". Bring it back and I'll make it worth your while.”</p><p class='note'>New quest added to your notebook.</p>";
      } else if (q && q.state === "found") {
        q.state = "carrying";
      }
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

  /* ---------- suspects ---------- */
  var SUSPECT_GREET = {
    crake: "“Do you know whose house this is? I could have you transported for knocking on it.”",
    vane: "“Rent's due Friday, and so is yours, I shouldn't wonder. What is it?”",
    mott: "“My child, it's very late.” He smells of peppermint, and of gin under the peppermint.",
    pell: "“If you've come to sell me something, it had better be fresh.” He wipes his hands on his apron.",
    ruddock: "“Nell Tanner. Last I saw you, you were dancing on the quay.” His eyes flick past you to the street.",
    lark: "“Darling, I've a performance tomorrow. Make it quick.” She doesn't open the door all the way.",
    grime: "“Well, if it isn't trouble. Come to confess?” He taps his truncheon against his palm.",
    fenn: "“Tanner. Pledging or redeeming?” His spectacles catch the gaslight."
  };

  function suspectDoor(d) {
    var s = byId(BK.SUSPECTS, d.suspect);
    if (S.knocked[d.id]) return dlg({ title: d.label, sub: s.name, body: "<p>You've already been here tonight. Come back tomorrow night.</p>", choices: [leave()] });
    dlg({
      title: d.label, sub: s.name + " — " + s.role, knocker: d.knocker,
      body: "<p>" + s.desc + "</p><p class='hint'>A suspect's door. You can question them once a night.</p>",
      choices: [{ label: "Knock", fn: function () { suspectKnock(d, s); } }, leave()]
    });
  }

  function suspectKnock(d, s) {
    S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++;
    G.advance(10); sfx("knock", "firm");
    if (R() < 0.12) return dlg({ title: d.label, body: "<p>Nobody's home. A cat watches you from the window.</p>", choices: [leave()] });
    suspectTalk(d, s);
  }

  function suspectTalk(d, s) {
    var ch = [];
    var note = S.notes.suspect[s.id];
    if (!S.nightFlags["alibi" + s.id]) ch.push({ label: "Pick at their alibi [Wits 10]", note: "If they're innocent and you're sharp, their story will hold up.", fn: function () { questionAlibi(d, s); } });
    if (!S.pressed[s.id]) ch.push({ label: "Accuse them to their face [Grit]", note: "Decisive, but the innocent will complain loudly (+18 Suspicion). The guilty may turn violent.", fn: function () { pressSuspect(d, s); } });
    ch.push(leave());
    dlg({ title: s.name, sub: s.role, portrait: suspectPortrait(s), body: "<p>" + SUSPECT_GREET[s.id] + "</p>" + (note && note.m === "x" ? "<p class='note'>Your notebook says they've been cleared.</p>" : ""), choices: ch });
  }

  function questionAlibi(d, s) {
    S.nightFlags["alibi" + s.id] = true; G.advance(15);
    var c = check("wits", 10, true);
    var body = "<p>You ask where they were that night, then ask again, from another angle, watching their hands.</p>";
    if (c.ok && S.solution.suspect !== s.id) {
      mark("suspect", s.id, "x", "your own questioning");
      logClue(s.name + "'s alibi holds up under your questioning.", "your own questioning");
      gainXP(8); sfx("clue");
      body += "<p>Every detail lines up: names, times, a cab-fare receipt. Their alibi holds.</p><p class='note'>" + s.short + " crossed off.</p>";
    } else {
      body += "<p>You can't make their story break, and you can't make it hold. Maybe another night.</p>";
    }
    dlg({ title: s.name, portrait: suspectPortrait(s), body: body, choices: [leave()] });
  }

  function pressSuspect(d, s) {
    S.pressed[s.id] = true; G.advance(10);
    if (S.solution.suspect === s.id) {
      var boss = { name: s.name, hp: 40 + S.chapter * 14, atk: 7 + S.chapter * 2, will: 99, xp: 60, coin: [5, 10], boss: true, suspect: s.id,
        line: "Something cold comes into " + s.short + "'s face. “You should have stayed on your street corner, Nell.” Then they come for you." };
      return G.fight(boss);
    }
    var g = addSuspicion(18); addRep(-3);
    mark("suspect", s.id, "x", "their furious alibi");
    logClue(s.name + " furiously produced an alibi when you accused them.", "your accusation");
    dlg({ title: s.name, portrait: suspectPortrait(s), body: "<p>“HOW DARE YOU!” Half the street hears it. Within a minute they've produced a witness, a receipt and a very angry neighbour. Whatever they are, they're not the killer.</p><p class='note'>" + s.short + " cleared. Suspicion +" + g + "</p>", choices: [leave("Back away")] });
  }

  /* ---------- landmarks ---------- */
  function landmark(d) {
    var lm = d.lm;
    if (lm === "tavern") return tavern(d);
    if (lm === "church") return church(d);
    if (lm === "court") return court(d);
    if (lm === "hall") return hall(d);
    if (lm === "mill") return mill(d);
    if (lm === "warehouse") return warehouse(d);
    if (lm === "pawn") return pawn(d);
  }

  function homeMenu(d) {
    dlg({
      title: "Your lodging", sub: "A narrow room above a laundry in the Rookery",
      body: "<p>Damp walls, one candle, and a bed that's yours, which is more than many have. Rosie's shawl still hangs on the hook.</p>",
      choices: [
        { label: "Sleep until dawn", note: "Ends the night. Nerve is restored at dawn.", fn: function () { dawn(true); } },
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
      var body = "<p>Gin goes round, tongues loosen, and the talk turns to " + chapter().victim.split(",")[0] + ".</p>";
      body += R() < 0.65 ? giveTestimony("talk in the Drowned Man", R() < 0.3 ? "shifty" : "plain", true) : learnRandomSecret(null);
      dlg({ title: "The Drowned Man", body: body, choices: [leave()] });
    } });
    ch.push({ label: "Eat a hot eel pie [2s]", note: "+30 Nerve", disabled: S.coin < 2, fn: function () { addCoin(-2); addNerve(30); G.advance(10); ui().toast("Hot, greasy and wonderful. Nerve +30."); } });
    ch.push({ label: "Search the cellar and yard", note: "Look for signs the deed was done here.", fn: function () { searchScene("drowned"); } });
    ch.push(leave());
    dlg({ title: "The Drowned Man", sub: "Tavern · The Wharf", knocker: d.knocker, body: "<p>Low beams, a fire that smokes, and a landlord who's seen everything twice. Nobody looks twice at a brass in here.</p>", choices: ch });
  }

  function church(d) {
    var ch = [];
    if (!S.nightFlags.prayed) ch.push({ label: "Kneel and pray", note: "+40 Nerve, −8 Suspicion. Once a night.", fn: function () {
      S.nightFlags.prayed = true; G.advance(20); addNerve(40); addSuspicion(-8);
      dlg({ title: "St Bride's", body: "<p>The candles gutter. For a while nobody wants anything from you.</p><p class='note'>Nerve +40, Suspicion −8</p>", choices: [leave()] });
    } });
    ch.push({ label: "Give alms [2s]", note: "+4 Reputation", disabled: S.coin < 2, fn: function () { addCoin(-2); addRep(4); ui().toast("The poor box clinks. Reputation +4."); } });
    ch.push({ label: "Descend to the crypt", note: "Search for signs of the crime.", fn: function () { searchScene("crypt"); } });
    ch.push(leave());
    dlg({ title: "St Bride's Church", sub: "Chapel Hill", knocker: d.knocker, body: "<p>The great door is never locked. Inside: cold stone, old incense and the smell of candle wax.</p>", choices: ch });
  }

  function court(d) {
    var ch = [];
    ch.push({ label: "Lay your accusation", note: "Name WHO, WITH WHAT and WHERE. Three wrong accusations and you're finished.", fn: function () { ui().accuse(); } });
    if (!S.nightFlags.coroner) ch.push({ label: "Bribe the clerk for the coroner's report [5s]", disabled: S.coin < 5, fn: function () {
      S.nightFlags.coroner = true; addCoin(-5); G.advance(15);
      var n = G.stat("wits") >= 4 ? 2 : 1, out = [];
      for (var i = 0; i < n; i++) { var o = eliminateTrue("the coroner's report", "means"); if (o) out.push(o.name); }
      out.forEach(function (nm) { logClue("The coroner's report rules out the " + nm.toLowerCase() + ".", "coroner's report"); });
      sfx("clue");
      dlg({ title: "Coroner's Report", body: out.length ? "<p>Copperplate, coffee stains and a great deal of Latin. You make out enough: it <b>wasn't</b> the " + out.join(", nor the ").toLowerCase() + ".</p>" : "<p>Nothing you don't already know.</p>", choices: [leave()] });
    } });
    ch.push({ label: "Grease the desk sergeant's palm [10s]", note: "−30 Suspicion", disabled: S.coin < 10, fn: function () { addCoin(-10); addSuspicion(-30); ui().toast("Your name slides off the duty sheet. Suspicion −30."); } });
    ch.push({ label: "Read the case notice", fn: function () {
      dlg({ title: "Notice", body: "<p>The death of <b>" + chapter().victim + "</b>. The Assizes close the matter in <b>" + G.nightsLeft() + "</b> night(s).</p><p>Accusations rejected so far: <b>" + S.strikes + " / 3</b>.</p>", choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "Magistrate's Court", sub: "Gaslight Square", knocker: d.knocker, body: "<p>A night clerk dozes under a lamp. The Magistrate keeps late hours for the right sort of evidence.</p>", choices: ch });
  }

  function hall(d) {
    var ch = [];
    if (!S.nightFlags.sang) ch.push({ label: "Sing a turn for the late crowd [Charm 8]", note: "Earn coin if they like you.", fn: function () {
      S.nightFlags.sang = true; G.advance(30);
      var c = check("charm", 8), body = c.text;
      if (c.ok) { var e = 2 + G.stat("charm"); addCoin(e); gainXP(5); body += "<p>You give them “The Knocker on My Heart” with feeling. Pennies and shillings rain onto the boards. +" + e + "s</p>"; }
      else { addNerve(-5); body += "<p>Somebody throws a cabbage. It's a good throw. Nerve −5</p>"; }
      dlg({ title: "Empire Music Hall", body: body, choices: [leave()] });
    } });
    ch.push({ label: "Slip backstage and search", note: "The doorman wants 1s, or charm him (Charm 8).", fn: function () {
      if (S.nightFlags.hallIn) return searchScene("hall");
      dlg({ title: "Stage door", body: "<p>A doorman the size of a wardrobe blocks the way.</p>", choices: [
        { label: "Slip him a shilling [1s]", disabled: S.coin < 1, fn: function () { addCoin(-1); S.nightFlags.hallIn = true; searchScene("hall"); } },
        { label: "Flutter your eyelashes [Charm 8]", fn: function () {
          var c = check("charm", 8);
          if (c.ok) { S.nightFlags.hallIn = true; dlg({ title: "Stage door", body: c.text + "<p>He blushes and looks the other way.</p>", choices: [{ label: "Go in", fn: function () { searchScene("hall"); } }] }); }
          else dlg({ title: "Stage door", body: c.text + "<p>“Nice try, love.”</p>", choices: [leave()] });
        } }, leave()] });
    } });
    ch.push(leave());
    dlg({ title: "Empire Music Hall", sub: "Gaslight Square", knocker: d.knocker, body: "<p>Gilt and limelight, a fiddler sawing away, and the smell of oranges and spilled beer.</p>", choices: ch });
  }

  function mill(d) {
    dlg({ title: "Crake's Mill", sub: "Mill Row", knocker: d.knocker, body: "<p>The looms are silent at night, but a watchman's lantern bobs behind the gate.</p>", choices: [
      { label: "Charm the watchman [Charm 9]", fn: function () {
        var c = check("charm", 9);
        if (c.ok) dlg({ title: "Mill gate", body: c.text + "<p>“Five minutes, mind.”</p>", choices: [{ label: "Search the mill", fn: function () { searchScene("mill"); } }] });
        else dlg({ title: "Mill gate", body: c.text + "<p>“Clear off!” He reaches for his cudgel.</p>", choices: [{ label: "Fight your way in", fn: function () { G.fight(makeEnemy("bully", "Mill watchman"), function () { searchScene("mill"); }); } }, leave("Clear off")] });
      } },
      { label: "Slip over the wall [Wits 10]", fn: function () {
        var c = check("wits", 10);
        if (c.ok) dlg({ title: "Mill yard", body: c.text + "<p>Over the wall and into the shadows, quiet as a cat.</p>", choices: [{ label: "Search the mill", fn: function () { searchScene("mill"); } }] });
        else { var g = addSuspicion(8); dlg({ title: "Mill wall", body: c.text + "<p>You land in a stack of bobbins with a crash that wakes half of Mill Row. Suspicion +" + g + "</p>", choices: [leave("Run")] }); }
      } },
      { label: "Bribe him [2s]", disabled: S.coin < 2, fn: function () { addCoin(-2); searchScene("mill"); } },
      leave()] });
  }

  function warehouse(d) {
    dlg({ title: "Bonded Warehouse", sub: "The Wharf", knocker: d.knocker, body: "<p>A side door hangs off one hinge. It's dark in there, and you can hear rats, or something bigger.</p>", choices: [
      { label: "Go in and search", fn: function () {
        if (!S.nightFlags.wareAmbush && R() < 0.4) { S.nightFlags.wareAmbush = true; return G.fight(makeEnemy("snatcher"), function () { searchScene("warehouse"); }); }
        searchScene("warehouse");
      } }, leave()] });
  }

  function pawn(d) {
    var fenn = byId(BK.SUSPECTS, "fenn");
    var ch = [
      { label: "Browse the shop", fn: function () { ui().shop(); } },
      { label: "Speak with Mr Fenn", note: "He's a suspect.", fn: function () {
        if (S.knocked[d.id]) return dlg({ title: fenn.name, portrait: suspectPortrait(fenn), body: "<p>“We've spoken tonight, Tanner. Buy something or leave.”</p>", choices: [leave()] });
        S.knocked[d.id] = true; suspectTalk(d, fenn);
      } },
      { label: "Search the back room while he's distracted [Wits 10]", fn: function () {
        if (S.nightFlags.pawnTry) return dlg({ title: "Back room", body: "<p>Fenn is watching you like a hawk now. Not tonight.</p>", choices: [leave()] });
        S.nightFlags.pawnTry = true;
        var c = check("wits", 10);
        if (c.ok) searchScene("pawn", c.text);
        else { var g = addSuspicion(10); dlg({ title: "Back room", body: c.text + "<p>“And WHERE do you think you're going?” Suspicion +" + g + "</p>", choices: [leave()] }); }
      } },
      leave()
    ];
    dlg({ title: "Fenn's Pawnshop", sub: "Three brass balls over the door", knocker: d.knocker, body: "<p>Shelves of other people's treasures: wedding rings, flat-irons, a stuffed owl. Mr Fenn watches you over his spectacles.</p>", choices: ch });
  }

  function sceneSpot(spot) {
    if (spot.place === "square") return dlg({ title: "Gaslight Square", body: "<p>The fountain's brass dolphin spits green water. The flagstones around it have seen a thousand fights.</p>", choices: [{ label: "Search the square", fn: function () { searchScene("square"); } }, leave()] });
    if (spot.place === "lock") return dlg({ title: "The Canal Lock", body: "<p>Black water slaps the gates. The lock-keeper's hut is dark.</p>", choices: [{ label: "Search the lock", fn: function () { searchScene("lock"); } }, leave()] });
  }

  function searchScene(place, pre) {
    var p = byId(BK.PLACES, place);
    if (S.searched[place]) return dlg({ title: p.name, body: "<p>You've already gone over every inch of this place.</p>", choices: [leave()] });
    if (S.nightFlags["search" + place]) return dlg({ title: p.name, body: "<p>It's too dark to search properly again tonight. Try another night.</p>", choices: [leave()] });
    S.nightFlags["search" + place] = true;
    G.advance(30);
    var dc = S.buffs.lantern ? 7 : 8;
    var c = check("wits", dc);
    var body = (pre || "") + "<p>You hold up your lantern and go over the place inch by inch.</p>" + c.text;
    if (c.ok) {
      S.searched[place] = true; gainXP(8);
      if (S.solution.place === place) body += giveEvidence("place", "your own search");
      else {
        mark("place", place, "x", "your own search");
        logClue("Your search of " + p.name + " found nothing: it didn't happen here.", "your own search");
        sfx("clue");
        body += "<p>No blood, no scuffs, nothing out of place. Whatever happened, it didn't happen here.</p><p class='note'>" + p.short + " crossed off.</p>";
      }
    } else body += "<p>Shadows and more shadows. You can't be sure of anything. Come back another night.</p>";
    dlg({ title: p.name, body: body, choices: [leave()] });
  }

  /* ============ accusation ============ */
  G.accuse = function (sus, means, place) {
    var sol = S.solution;
    var right = (sus === sol.suspect ? 1 : 0) + (means === sol.means ? 1 : 0) + (place === sol.place ? 1 : 0);
    G.advance(20);
    if (right === 3) return chapterWon();
    S.strikes++;
    var g = addSuspicion(15);
    sfx("bad");
    if (S.strikes >= 3) return gameOver("The Magistrate's patience runs out. “Three times you've wasted this court's time, Miss Tanner.” The cell door clangs shut, and the real killer walks free.");
    dlg({ title: "The Magistrate frowns", body: "<p>He hears you out, then removes his spectacles.</p><p>“Of the three charges you lay, <b>" + right + "</b> " + (right === 1 ? "holds" : "hold") + " up. The rest is supposition.”</p><p class='note'>Strike " + S.strikes + " of 3. Suspicion +" + g + "</p>", choices: [leave("Leave, burning")] });
  };

  function liarsSummary() {
    var l = S.clues.filter(function (c) { return c.lie; }).map(function (c) { return c.src; });
    return l.length ? "<p>People who lied to you: <b>" + l.filter(function (x, i) { return l.indexOf(x) === i; }).join(", ") + "</b>.</p>" : "";
  }

  function chapterWon() {
    sfx("win");
    var sol = S.solution;
    S.chaptersWon++; S.totals.nights += S.night;
    gainXP(50); addCoin(15); addRep(10);
    var last = S.chapter >= BK.CHAPTERS.length - 1;
    var body = "<p>The Magistrate reads your case twice. Then he rings for the constables, and this time they're not coming for you.</p>" +
      '<p class="evidence"><b>' + itemName("suspect", sol.suspect) + "</b>, with the <b>" + itemName("means", sol.means).toLowerCase() + "</b>, at <b>" + itemName("place", sol.place) + "</b>.</p>" +
      liarsSummary() + "<p class='note'>+50 XP, +15 shillings, reputation +10.</p>";
    if (last) {
      return dlg({ title: "Justice for Brassmoor", body: body, choices: [{ label: "Epilogue", fn: ending }], noClose: true });
    }
    dlg({ title: "Case closed!", body: body, choices: [{ label: "Continue to " + BK.CHAPTERS[S.chapter + 1].title.split("—")[0].trim(), fn: function () {
      G.startChapter(S.chapter + 1); addNerve(999); ui().intro();
    } }], noClose: true });
  }

  function ending() {
    var nights = S.totals.nights;
    var rank = nights <= 9 ? "The Brass of Brassmoor: a legend" : nights <= 12 ? "Queen of the Knockers" : "A Brass to be Reckoned With";
    S.over = true; G.clearSave();
    dlg({ title: "Epilogue", body: "<p>They still cross the road when they see you coming. But now it's because they know you'll find them out.</p>" +
      "<table class='tbl'><tr><th>Rank</th><td>" + rank + "</td></tr><tr><th>Nights taken</th><td>" + nights + "</td></tr><tr><th>Doors knocked</th><td>" + S.totals.knocks +
      "</td></tr><tr><th>Clues gathered</th><td>" + S.totals.clues + "</td></tr><tr><th>Fights won</th><td>" + S.totals.fights + "</td></tr><tr><th>Favours done</th><td>" + S.totals.quests +
      "</td></tr><tr><th>Level</th><td>" + S.level + "</td></tr></table>", choices: [{ label: "Back to title", fn: function () { ui().title(); } }], noClose: true });
  }

  function gameOver(text) {
    sfx("bad");
    var sol = S.solution;
    var ch = S.chapter;
    dlg({ title: "The case goes cold", body: "<p>" + text + "</p><p>The truth: <b>" + itemName("suspect", sol.suspect) + "</b>, with the <b>" + itemName("means", sol.means).toLowerCase() + "</b>, at <b>" + itemName("place", sol.place) + "</b>.</p>" + liarsSummary(),
      choices: [
        { label: "Retry this chapter", note: "A new mystery; you keep your level and items.", fn: function () { S.over = false; G.startChapter(ch); S.nerve = S.maxNerve; ui().intro(); } },
        { label: "Back to title", fn: function () { S.over = true; G.clearSave(); ui().title(); } }
      ], noClose: true });
    S.over = true;
  }

  /* ============ night & day ============ */
  function goHome() { S.px = WD.start.x; S.py = WD.start.y; S.facing = "up"; if (BK.render) BK.render.snap(); }

  function dawn(slept) {
    var atHome = slept;
    var body = atHome ? "<p>You sleep like the dead, which in Brassmoor is a figure of speech you'd rather not use.</p>" :
      "<p>The sky greys over the mill chimneys. You stagger home through the first carts of the morning, aching.</p>";
    var summary = "<table class='tbl'><tr><th>Doors knocked</th><td>" + S.nightLog.knocks + "</td></tr><tr><th>Clues found</th><td>" + S.nightLog.clues + "</td></tr></table>";
    // day passes
    var rent = S.coin >= 1;
    if (rent) addCoin(-1); else addRep(-5);
    addSuspicion(-10);
    S.nerve = S.maxNerve - (atHome ? 0 : 10);
    S.buffs = {}; S.knocked = {}; S.talked = {}; S.nightFlags = {};
    S.night++; S.time = 0; S.nightLog = { knocks: 0, clues: 0 };
    goHome();
    var head = pick(BK.HEADLINES), gaz = "";
    if (R() < 0.35) {
      var cat = pick(["suspect", "means", "place"]);
      var o = eliminateTrue("the Brassmoor Gazette", cat);
      if (o) { gaz = "<p class='note'>Buried on page four, a useful detail: it rules out <b>" + o.name + "</b>.</p>"; logClue("The Gazette's report rules out " + o.name + ".", "the Gazette"); }
    }
    if (S.night > chapter().nights) {
      return gameOver("The Assizes sit. With no case brought, the court files the death of " + chapter().victim + " under 'misadventure'.");
    }
    G.save();
    sfx("dawn");
    dlg({ title: "Dawn · Night " + (S.night - 1) + " is over", sub: G.nightsLeft() + " night(s) left before the Assizes", body: body + summary +
      "<div class='gazette'><div class='gz-title'>THE BRASSMOOR GAZETTE</div><div class='gz-head'>" + head + "</div></div>" + gaz +
      "<p class='note'>" + (rent ? "Rent paid (1s)." : "You couldn't pay the rent. The landlady will remember it (Reputation −5).") + " Suspicion fades a little. Nerve restored.</p>",
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
    dlg({ title: "Arrested!", body: "<p>A whistle shrills, then another. Hands grab your arms. You spend the rest of the night in the cells at the Station House, and the desk sergeant helps himself to " + lost + " shillings for 'costs'.</p>",
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
    var t = WD.get(S.px, S.py);
    if (t === WD.TILE.PLAZA) return false;
    var p = 0.008 * ({ rookery: 1.8, wharf: 1.6, mill: 1.0, square: 0.5, chapel: 0.6 }[dist] || 1);
    if (S.time > 300) p *= 1.3;
    if (R() < p) {
      S.encounterCool = 30;
      var pool = BK.ENEMIES.filter(function (e) { return !e.minCh || e.minCh <= S.chapter; });
      if (dist === "wharf") pool = pool.concat([byId(BK.ENEMIES, "sailor")]);
      var e = pick(pool);
      G.fight(makeEnemy(e.id));
      return true;
    }
    return false;
  };

  G.constableStop = function () {
    var dc = 8 + Math.floor(S.suspicion / 15);
    dlg({ title: "“Evening, miss.”", sub: "A constable steps out of the fog", portrait: { seed: "constable", coat: "#1a2440", hair: "#3a2a1a", hat: "helmet", skin: "#e0c0a0" },
      body: "<p>“Out late, aren't we? There's been talk about you, Tanner. A lot of talk.”</p><p class='note'>Your Suspicion is " + S.suspicion + ".</p>",
      choices: [
        { label: "Slip him a few coins [3s]", disabled: S.coin < 3, fn: function () { addCoin(-3); addSuspicion(-5); ui().toast("He pockets it and suddenly finds the lamp-post fascinating."); } },
        { label: "Smile sweetly [Charm " + dc + "]", fn: function () {
          var c = check("charm", dc);
          if (c.ok) dlg({ title: "Constable", body: c.text + "<p>“Go on, then. And keep out of trouble.”</p>", choices: [leave()] });
          else cells(c.text);
        } },
        { label: "Run for it [Wits " + dc + "]", fn: function () {
          var c = check("wits", dc);
          if (c.ok) { dlg({ title: "Away!", body: c.text + "<p>Down an alley, over a wall, and gone. His whistle fades behind you.</p>", choices: [leave()] }); }
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
    var e = { name: enemy.name, hp: enemy.hp, maxHp: enemy.hp, atk: enemy.atk, will: enemy.will, xp: enemy.xp, coin: enemy.coin, boss: enemy.boss, suspect: enemy.suspect };
    var log = [enemy.line || ("A " + enemy.name + " blocks your way!")];
    sfx("alarm");
    function enemyHits() {
      var hitChance = 0.75 - G.stat("wits") * 0.03;
      if (R() < hitChance) {
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
        var body = "<p>" + log.slice(-2).join("<br>") + "</p><p>" + (e.boss ? "" : e.name + " flees into the fog.") + "</p><p class='note'>+" + e.xp + " XP" + (c ? ", +" + c + " shillings" : "") + "</p>";
        if (e.boss) {
          body += "<p>" + e.name + " staggers back, then runs into the fog. An innocent person doesn't fight like that.</p>" + giveEvidence("suspect", "their attack on you");
        }
        dlg({ title: "You win", body: body, choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "talk") {
        gainXP(Math.round(e.xp / 2));
        dlg({ title: "Talked down", body: "<p>" + log[log.length - 1] + "</p><p class='note'>+" + Math.round(e.xp / 2) + " XP</p>", choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "flee") {
        dlg({ title: "Escaped", body: "<p>You dart down a side-alley and lose them.</p>", choices: [leave("Catch your breath")], noClose: true });
      } else {
        S.nerve = 0;
        if (e.boss) log.push(e.name + " vanishes into the fog while you lie on the cobbles.");
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
        if (c.ok) { log.push("You talk fast and sweet, and they lower their fists. " + c.text); return end("talk"); }
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
      var consum = Object.keys(S.inv).filter(function (k) { var it = BK.ITEMS[k]; return it.use && (it.use.nerve); });
      var ch = [
        { label: "Strike [Grit]", note: "Damage " + (2 + G.stat("grit") + atkBonus()) + "–" + (5 + G.stat("grit") + atkBonus()), fn: function () { round("strike"); } },
        { label: "Talk them down [Charm " + e.will + "]", disabled: e.will >= 99, note: e.will >= 99 ? "Past talking." : "", fn: function () { round("talk"); } },
        { label: "Run [Wits " + (7 + Math.ceil(e.atk / 2)) + "]", disabled: !!e.boss && false, fn: function () { round("flee"); } }
      ];
      consum.forEach(function (k) { ch.push({ label: "Use " + BK.ITEMS[k].name + " (" + S.inv[k] + ")", note: BK.ITEMS[k].desc, fn: function () { round("item", k); } }); });
      var bar = function (v, m, cls) { return "<div class='bar " + cls + "'><i style='width:" + Math.max(0, Math.round(100 * v / m)) + "%'></i><span>" + Math.max(0, v) + " / " + m + "</span></div>"; };
      dlg({ title: e.name, sub: e.boss ? "The killer!" : "Street fight", portrait: e.suspect ? suspectPortrait(byId(BK.SUSPECTS, e.suspect)) : { seed: e.name, coat: "#2a2a2a", hair: "#2a1a0a", hat: "cap", skin: "#c8a080" },
        body: "<div class='fight'><div><b>" + e.name + "</b>" + bar(e.hp, e.maxHp, "enemy") + "</div><div><b>Nell</b>" + bar(S.nerve, S.maxNerve, "nerve") + "</div></div><div class='log'>" + log.slice(-3).join("<br>") + "</div>",
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
    if (!it.use) return;
    takeItem(id);
    var u = it.use;
    if (u.nerve) addNerve(u.nerve);
    if (u.suspicion) addSuspicion(u.suspicion);
    if (u.lantern) S.buffs.lantern = 1;
    if (u.perfume) S.buffs.perfume = 1;
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
