/* Finding the Brass — rules, state and story flow.
 * Knock on doors, see who answers, pay (or haggle), and take your chances:
 * a great night, a bad night, your purse lifted, a fancy-man, or the dose.
 */
"use strict";
(function () {
  var U = BK.util, WD = BK.world;
  var G = BK.game = {};
  var S = null;
  var NIGHT_LEN = 540;           // 8pm to 5am, in minutes
  var SAVE_KEY = "findingthebrass.save.v3";
  var BEST_KEY = "findingthebrass.best";
  var MAX_DOSES = 3;
  G.NIGHT_LEN = NIGHT_LEN;
  G.MAX_DOSES = MAX_DOSES;

  function R() { return Math.random(); }
  function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
  function ui() { return BK.ui; }
  function sfx(n) { if (BK.sfx && BK.sfx[n]) BK.sfx[n].apply(null, Array.prototype.slice.call(arguments, 1)); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function doorById(id) { for (var i = 0; i < WD.doors.length; i++) if (WD.doors[i].id === id) return WD.doors[i]; return null; }
  function stars(n) { var s = ""; for (var i = 0; i < 5; i++) s += i < n ? "★" : "☆"; return s; }
  G.doorById = doorById;
  G.stars = stars;

  /* ============ state & saving ============ */
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
      Object.keys(S.inv || {}).forEach(function (k) { if (!BK.ITEMS[k]) delete S.inv[k]; });
      return true;
    } catch (e) { return false; }
  };
  G.clearSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };
  G.best = function () { try { return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { return 0; } };
  function setBest(n) { try { if (n > G.best()) localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ } }

  G.newGame = function () {
    S = {
      v: 3, seed: (R() * 1e9) | 0, leave: 0, night: 1, time: 0,
      px: WD.start.x, py: WD.start.y, facing: "up",
      charm: 3, wits: 2, grit: 2, level: 1, xp: 0, nerve: 50, maxNerve: 50,
      coin: 0, suspicion: 0,
      inv: { bread: 1, violets: 1 }, equip: { weapon: null, wear: null }, buffs: {},
      knocked: {}, nightFlags: {}, leaveFlags: {}, avail: {},
      residents: {}, ladies: {}, book: {}, diary: [],
      dosed: false, doses: 0, good: 0,
      totals: { knocks: 0, nights: 0, great: 0, bad: 0, doses: 0, robbed: 0, fights: 0, spent: 0, leaves: 0 },
      nightLog: { knocks: 0, ladies: 0, good: 0, spent: 0 }, queue: [], over: false, encounterCool: 0
    };
    genResidents();
    G.startLeave();
  };

  function genResidents() {
    WD.doors.forEach(function (d) {
      if (d.kind !== "resident") return;
      var rng = U.mulberry32(S.seed ^ U.hash(d.id));
      S.residents[d.id] = {
        name: U.pick(rng, BK.NAMES.first) + " " + U.pick(rng, BK.NAMES.last), job: U.pick(rng, BK.NAMES.jobs[d.district]),
        trait: BK.KNOCKERS[d.knocker].trait, met: false
      };
    });
  }
  (function numberDoors() {
    var counts = {};
    WD.doors.forEach(function (d) { counts[d.district] = (counts[d.district] || 0) + 1; d.num = counts[d.district]; });
  })();

  G.address = function (d) { return "No. " + d.num + ", " + BK.DISTRICT_NAMES[d.district]; };

  function makeLady(d, tier, rng, legend) {
    var T = BK.TIERS[tier];
    var name;
    if (legend) name = "Lady Lucinda Fairweather";
    else if (tier === "courtesan") name = U.pick(rng, BK.NAMES.poshFirst) + " " + U.pick(rng, BK.NAMES.poshLast);
    else if (tier === "parlour") name = "Miss " + U.pick(rng, BK.NAMES.brassFirst) + " " + U.pick(rng, BK.NAMES.last);
    else name = U.pick(rng, BK.NAMES.brassNick) + " " + U.pick(rng, BK.NAMES.brassFirst);
    var mult = BK.DISTRICT_PRICE[d.district] || 1;
    var base = T.price[0] + Math.floor(rng() * (T.price[1] - T.price[0] + 1));
    var looks = T.looks[0] + Math.floor(rng() * (T.looks[1] - T.looks[0] + 1));
    var spark = T.spark[0] + Math.floor(rng() * (T.spark[1] - T.spark[0] + 1));
    var odds = BK.KNOCKER_ODDS[d.knocker] || {};
    var doseP = T.dose + (BK.DISTRICT_DOSE[d.district] || 0) + (S.leave - 1) * 0.03;
    return {
      name: name, tier: tier, legend: !!legend, seed: d.id + ":" + S.leave + ":" + name,
      price: legend ? 25 : Math.max(1, Math.round(base * mult * (1 + (S.leave - 1) * 0.1))),
      looks: looks, spark: legend ? 11 : spark,
      dosed: !legend && rng() < Math.max(0, doseP),
      thief: !legend && rng() < T.thief + (odds.thief || 0),
      fancy: !legend && rng() < T.fancy + (odds.fancy || 0)
    };
  }

  /* every shore leave the ladies move house: new faces, new risks */
  G.startLeave = function () {
    S.leave++;
    var rng = U.mulberry32(S.seed ^ U.hash("leave" + S.leave));
    S.ladies = {}; S.book = {}; S.diary = [];
    WD.doors.forEach(function (d) {
      if (d.kind !== "resident") return;
      var odds = BK.KNOCKER_ODDS[d.knocker];
      if (rng() < odds.p) S.ladies[d.id] = makeLady(d, U.pick(rng, odds.tiers), rng);
    });
    // the Brass of Brassmoor receives callers behind one lion knocker
    var lions = WD.doors.filter(function (d) { return d.kind === "resident" && d.knocker === "lion"; });
    if (lions.length) { var ld = U.pick(rng, lions); S.ladies[ld.id] = makeLady(ld, "legend", rng, true); }
    // a chorus girl at the music hall's stage door
    var hall = WD.doors.filter(function (d) { return d.lm === "hall"; })[0];
    if (hall) S.ladies[hall.id] = makeLady(hall, "parlour", rng);
    S.night = 1; S.time = 0; S.knocked = {}; S.nightFlags = {}; S.leaveFlags = {}; S.avail = {};
    S.dosed = false; S.doses = 0; S.good = 0; S.suspicion = 0; S.buffs = {};
    S.coin += BK.LEAVE.pay;
    S.nerve = S.maxNerve;
    S.nightLog = { knocks: 0, ladies: 0, good: 0, spent: 0 };
    S.px = WD.start.x; S.py = WD.start.y; S.facing = "up";
    G.save();
  };
  G.ladyCount = function () { return Object.keys(S.ladies).length; };

  /* ============ derived stats ============ */
  G.stat = function (k) {
    var v = S[k];
    if (k === "charm") {
      if (S.buffs.cologne) v += 2;
      if (S.equip.wear === "jacket") v += 1;
      if (S.dosed) v -= 2;
    }
    if (k === "wits" && S.buffs.snuff) v += 2;
    return v;
  };
  function atkBonus() { var w = S.equip.weapon; return w ? BK.ITEMS[w].equip.atk : 0; }
  function defBonus() { var w = S.equip.wear; return w && BK.ITEMS[w].equip.def ? BK.ITEMS[w].equip.def : 0; }
  G.xpNext = function () { return 20 + S.level * 20; };
  G.clockText = function () { return U.fmtTime(20 * 60 + S.time); };
  G.nightsLeft = function () { return BK.LEAVE.nights - S.night + 1; };
  G.rank = function (score) { var r = BK.RANKS[0][1]; BK.RANKS.forEach(function (x) { if (score >= x[0]) r = x[1]; }); return r; };

  function check(stat, dc) {
    var roll = ri(1, 10), val = G.stat(stat), total = roll + val;
    var ok = roll === 10 || (roll !== 1 && total >= dc);
    var label = stat.charAt(0).toUpperCase() + stat.slice(1);
    var text = '<div class="roll ' + (ok ? "ok" : "bad") + '">' + label + " " + val + " + d10 roll " + roll + " = " + total + " vs " + dc + (ok ? " — success" : " — failed") + "</div>";
    return { ok: ok, text: text, roll: roll };
  }
  G.check = check;

  function addSuspicion(n) { S.suspicion = U.clamp(S.suspicion + n, 0, 100); return n; }
  function addNerve(n) { S.nerve = U.clamp(S.nerve + n, 0, S.maxNerve); }
  function addCoin(n) { S.coin = Math.max(0, S.coin + n); if (n > 0) sfx("coin"); if (n < 0) { S.totals.spent -= n; S.nightLog.spent -= n; } }
  function addGood(n) { S.good = Math.max(0, S.good + n); if (n > 0) S.nightLog.good += n; }
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

  /* ============ the little black book ============ */
  function entry(id) { return S.book[id] || (S.book[id] = { seen: false, tip: false, visits: 0, stars: 0, known: {} }); }
  G.entry = function (id) { return S.book[id]; };
  function diary(text, kind) { S.diary.unshift({ night: S.night, text: text, kind: kind || "" }); }

  /* reveal something true about a lady, through gossip; returns html or null */
  function gossipAbout(kind) {
    var ids = Object.keys(S.ladies).filter(function (id) { return !S.ladies[id].legend && doorById(id).kind === "resident"; });
    var L, id, d, e;
    if (kind === "dose") {
      var dz = ids.filter(function (i) { return S.ladies[i].dosed && !(S.book[i] && S.book[i].known.dose); });
      if (!dz.length) return null;
      id = pick(dz); L = S.ladies[id]; d = doorById(id); e = entry(id); e.tip = true; e.known.dose = true;
      sfx("warn");
      return "<p>“Keep away from <b>" + L.name + "</b> at " + G.address(d) + " (the " + BK.KNOCKERS[d.knocker].name.toLowerCase() + " knocker). She's got the dose.”</p><p class='dose-note'>✖ Noted in your Little Black Book and marked on the map.</p>";
    }
    if (kind === "thief") {
      var th = ids.filter(function (i) { return S.ladies[i].thief && !(S.book[i] && S.book[i].known.thief); });
      if (!th.length) return null;
      id = pick(th); L = S.ladies[id]; d = doorById(id); e = entry(id); e.tip = true; e.known.thief = true;
      return "<p>“Watch your purse with <b>" + L.name + "</b> at " + G.address(d) + ". Light fingers, that one.”</p><p class='note'>$ Noted in your Little Black Book.</p>";
    }
    if (kind === "legend") {
      var lg = Object.keys(S.ladies).filter(function (i) { return S.ladies[i].legend; })[0];
      if (!lg) return null;
      d = doorById(lg);
      if (S.leaveFlags.legendHint) { e = entry(lg); e.tip = true; return "<p>“Lady Lucinda? I heard it's <b>" + G.address(d) + "</b>, behind the lion's head. Twenty-five shillings, mind, and worth every penny.”</p><p class='note'>♛ Marked on your map.</p>"; }
      S.leaveFlags.legendHint = true;
      return "<p>“They say Lady Lucinda, the Brass of Brassmoor, is receiving gentlemen this week, somewhere on <b>" + BK.DISTRICT_NAMES[d.district] + "</b>, behind a lion's-head knocker. The night of a lifetime, if you can afford her.”</p>";
    }
    // a recommendation: always true about her quality
    var cand = ids.filter(function (i) { return !(S.book[i] && S.book[i].tip); });
    if (!cand.length) return null;
    id = pick(cand); L = S.ladies[id]; d = doorById(id); e = entry(id); e.tip = true; e.known.spark = L.spark >= 7 ? "good" : L.spark <= 3 ? "bad" : "fair";
    var verdict = L.spark >= 7 ? "the best " + L.price + " shillings you'll ever spend" : L.spark <= 3 ? "a cold fish, between you and me" : "fair enough for the money";
    return "<p>“<b>" + L.name + "</b>, " + BK.TIERS[L.tier].name.toLowerCase() + " at " + G.address(d) + " (" + BK.KNOCKERS[d.knocker].name.toLowerCase() + " knocker). " + verdict.charAt(0).toUpperCase() + verdict.slice(1) + ".”</p><p class='note'>Noted in your Little Black Book.</p>";
  }
  function gossip() {
    var r = R(), out = null;
    if (r < 0.4) out = gossipAbout("tip");
    else if (r < 0.7) out = gossipAbout("dose");
    else if (r < 0.85) out = gossipAbout("thief");
    else out = gossipAbout("legend");
    return out || gossipAbout("tip") || gossipAbout("dose") || "<p>" + pick(BK.RUMOURS) + "</p>";
  }
  G._gossip = gossipAbout;

  /* ============ flow helpers ============ */
  function dlg(o) { ui().dialog(o); }
  function leave(label) { return { label: label || "Leave", fn: function () { } }; }
  G.ladyArt = function (L) { return BK.portraits.svg(BK.portraits.makeLady(L.seed, { tier: L.tier })); };
  function manArt(seed, opts) { return BK.portraits.svg(BK.portraits.makeMan(seed, opts)); }
  function localArt(s) {
    if (s.lady) return BK.portraits.svg(BK.portraits.makeLady("local:" + s.id, { tier: "parlour" }));
    return manArt("local:" + s.id, { coat: s.coat, hair: s.hair, hat: s.hat });
  }

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
      title: "Level " + S.level + "!", sub: "You're learning the ways of a port town.",
      body: "<p>Your maximum Nerve rises to " + S.maxNerve + ". Choose a talent to sharpen:</p>",
      choices: [
        { label: "Charm +1", note: "Haggling, sweet-talking, better nights", fn: function () { S.charm++; } },
        { label: "Wits +1", note: "Spotting the dose and light fingers, slipping away", fn: function () { S.wits++; } },
        { label: "Grit +1", note: "Fighting off fancy-men and footpads", fn: function () { S.grit++; } }
      ], noClose: true
    });
  }

  /* ============ interaction entry points ============ */
  G.interact = function (target) {
    if (!target) return;
    if (target.spot) return spot(target.spot);
    var d = target.door;
    if (d.kind === "home") return homeMenu();
    if (d.kind === "landmark") return landmark(d);
    if (d.kind === "local") return localDoor(d);
    return residentDoor(d);
  };

  function bookLine(d) {
    var e = S.book[d.id], L = S.ladies[d.id];
    if (!e || !L) return "";
    var bits = [];
    if (e.seen || e.tip) bits.push("<b>" + U.esc(L.name) + "</b> works here (" + BK.TIERS[L.tier].name.toLowerCase() + (e.seen ? ", " + L.price + "s" : "") + ")");
    if (e.visits) bits.push("you rated her " + stars(e.stars));
    if (e.sweetheart) bits.push("<span class='good-note'>♥ she's sweet on you</span>");
    var out = bits.length ? "<p>Your Little Black Book: " + bits.join(" · ") + ".</p>" : "";
    if (e.known.dose) out += "<p class='dose-note'>✖ She has the dose.</p>";
    if (e.known.thief) out += "<p class='note'>$ Light fingers: watch your purse.</p>";
    return out;
  }

  /* ---------- ordinary doors ---------- */
  function residentDoor(d) {
    var kn = BK.KNOCKERS[d.knocker];
    var body = bookLine(d) + '<p class="hint">' + kn.hint + "</p>";
    if (S.knocked[d.id]) return dlg({ title: G.address(d), sub: kn.name + " knocker", knocker: d.knocker, body: body + "<p>You've already knocked here tonight. Try again tomorrow night.</p>", choices: [leave()] });
    dlg({ title: G.address(d), sub: kn.name + " knocker", knocker: d.knocker, body: body, choices: [
      { label: "Knock", fn: function () { knock(d, "gentle"); } },
      { label: "Hammer on the door", note: "Somebody's more likely to answer, but the neighbours notice (+Suspicion).", fn: function () { knock(d, "firm"); } },
      leave("Walk on")
    ] });
  }

  function knock(d, style) {
    S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++;
    G.advance(10); sfx("knock", style);
    if (style === "firm") addSuspicion(4);
    var L = S.ladies[d.id];
    if (L) {
      var a = S.avail[d.id];
      if (!a) { var r = R(); a = S.avail[d.id] = r < (L.legend ? 0.6 : 0.74) ? "in" : r < 0.9 ? "busy" : "out"; }
      if (a === "out" && style === "firm" && R() < 0.5) a = "busy";
      if (a === "out") return dlg({ title: G.address(d), sub: "No answer", knocker: d.knocker, body: "<p>Your knock echoes down an empty hall. Nobody comes. Maybe another night.</p>", choices: [leave()] });
      if (a === "busy") {
        entry(d.id).tip = true;
        return dlg({ title: G.address(d), sub: "The maid answers", art: BK.portraits.svg(BK.portraits.makeLady("maid" + d.id, { tier: "dollymop" })),
          body: "<p>A maid in a mob-cap peers round the door. “The lady is <i>engaged</i> this evening, sir. Try another night.”</p><p class='note'>So a lady does work from here: <b>" + U.esc(L.name) + "</b>. Noted in your Little Black Book.</p>", choices: [leave("Touch your cap and go")] });
      }
      return meetLady(d, true);
    }
    var res = S.residents[d.id];
    var p = style === "firm" ? 0.9 : 0.65;
    if (R() > p) return dlg({ title: G.address(d), sub: "No answer", knocker: d.knocker, body: "<p>Nobody comes. A curtain twitches upstairs.</p>", choices: [leave()] });
    res.met = true;
    householder(d, res, style);
  }

  function householder(d, res, style) {
    var t = res.trait, hostile = { wealthy: 0.6, devout: 0.65, scholar: 0.45, sailor: 0.4, plain: 0.4, shifty: 0.45, gambler: 0.35, sister: 0.2 }[t] + (style === "firm" ? 0.1 : 0);
    if (R() < hostile) {
      var body, after = null;
      if (t === "sailor" || t === "shifty") { body = "<p>" + res.name + " fills the doorway. “Come knocking for MY wife, would you?”</p>"; after = function () { G.fight(makeEnemy("sailor", res.name)); }; }
      else if (t === "wealthy" || t === "scholar") { var g = addSuspicion(12); body = "<p>A maid shrieks for the master. A window goes up: “CONSTABLE! There's a sailor looking for women at my door!”</p><p class='note'>Suspicion +" + g + "</p>"; }
      else if (t === "devout") { addNerve(-6); body = "<p>" + res.name + " reads you a long passage about the wages of sin, then slams the door.</p><p class='note'>Nerve −6</p>"; }
      else { addNerve(-8); body = "<p>An upstairs window opens and a chamber-pot's worth of slops narrowly doesn't miss you.</p><p class='note'>Nerve −8</p>"; }
      body += "<p class='hint'>Wrong door: no lady works here.</p>";
      return dlg({ title: res.name, sub: res.job + " · " + G.address(d), art: manArt(res.name, { scowl: true }), body: body, choices: [{ label: after ? "Defend yourself" : "Retreat", fn: after || function () { } }] });
    }
    var tip = gossipAbout("tip");
    dlg({ title: res.name, sub: res.job + " · " + G.address(d), art: manArt(res.name, { scowl: false }),
      body: "<p>" + res.name + " looks you up and down and sighs. “Wrong door, sailor. But I know what you're after…”</p>" + (tip || "<p>“…and I've no idea where. Good night.”</p>"),
      choices: [leave("Thank them")] });
  }

  /* ---------- a lady answers: the turn of the card ---------- */
  var GREET = {
    dollymop: ["“Hello, sailor! Got a shilling or two for a girl?”", "“Ooh, you're a big one. Come in out of the cold.”", "“Mum's asleep. Be quick and be quiet.”"],
    street: ["“Evening, Jack. They're all called Jack, aren't they?”", "“Shut the door, love, you're letting the fog in.”", "“Looking for company, sailor?”"],
    parlour: ["“Good evening, sir. Do come in; there's a fire in the parlour.”", "“A gentleman caller! Wipe your boots, there's a dear.”", "“You'll take a glass of something? It's that sort of house.”"],
    courtesan: ["“And who might you be?” She looks you up and down as if you were a horse she was thinking of buying.", "“A sailor. How… refreshing.”", "“I choose my gentlemen, you understand. Let's see if I choose you.”"],
    legend: ["“So you're the sailor everyone's been talking about.” Her smile could light the whole of Gaslight Square."]
  };

  function askPrice(d) {
    var L = S.ladies[d.id], e = S.book[d.id];
    if (e && e.sweetheart) return 0;
    if (L.askOverride !== null && L.askOverride !== undefined) return L.askOverride;
    return L.price;
  }

  function meetLady(d, fresh) {
    var L = S.ladies[d.id], e = entry(d.id);
    if (fresh) {
      if (!e.seen) S.nightLog.ladies++;
      e.seen = true; L.mood = L.mood || 0;
      L.haggled = false; L.drink = false; L.looked = false; L.gift = false; L.askOverride = null;
      sfx("reveal");
    }
    var price = askPrice(d);
    var T = BK.TIERS[L.tier];
    var body = (fresh ? "<p class='greet'>" + pick(GREET[L.tier]) + "</p>" : "") +
      "<table class='tbl lady-stats'><tr><th>She is</th><td>" + T.name + ": " + T.desc + "</td></tr><tr><th>Looks</th><td class='stars'>" + stars(L.looks) + "</td></tr><tr><th>Asking</th><td><b>" + (price === 0 ? "Nothing: she's sweet on you" : price + " shillings") + "</b>" + (S.coin < price ? " <span class='bad-note'>(you have " + S.coin + "s)</span>" : "") + "</td></tr></table>" +
      (e.visits ? "<p>You've been upstairs with her " + e.visits + " time" + (e.visits > 1 ? "s" : "") + " before. You rated her " + stars(e.stars) + ".</p>" : "");
    if (e.known.dose) body += "<p class='dose-note'>✖ She has the dose. Go upstairs with her and you WILL catch it.</p>";
    else if (e.known.clean) body += "<p class='good-note'>✔ No sign of the dose.</p>";
    if (e.known.thief) body += "<p class='note'>$ Light fingers: watch your purse.</p>";
    if (e.known.spark === "good") body += "<p class='good-note'>The word is she's wonderful company.</p>";
    if (e.known.spark === "bad") body += "<p class='note'>The word is she's a cold fish.</p>";
    var ch = [];
    ch.push({ label: price === 0 ? "Go up to her room (free)" : "Pay " + price + "s and go up to her room", disabled: S.coin < price, note: S.coin < price ? "You can't afford her." : "Take your chances.", fn: function () { upstairs(d, price); } });
    if (!L.haggled && price > 0) {
      var dc = { dollymop: 6, street: 7, parlour: 9, courtesan: 11, legend: 99 }[L.tier];
      ch.push({ label: L.legend ? "Haggle" : "Haggle [Charm " + dc + "]", disabled: L.legend, note: L.legend ? "One does not haggle with Lady Lucinda." : "Knock her price down, or offend her.", fn: function () { haggle(d, dc); } });
    }
    if (!L.drink) ch.push({ label: "Buy her a drink first [2s]", disabled: S.coin < 2, note: "She warms to you, and you might learn something.", fn: function () { drink(d); } });
    if (!L.gift && S.inv.violets) ch.push({ label: "Give her a bunch of violets", note: "She'll like you better for it.", fn: function () {
      takeItem("violets"); L.gift = true; L.mood += 2;
      dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: "<p>She buries her nose in the violets and laughs. “Well! Aren't you the gentleman.”</p><p class='good-note'>She likes you better now.</p>", choices: [{ label: "Carry on", fn: function () { meetLady(d, false); } }] });
    } });
    if (!L.looked) ch.push({ label: "Look her over carefully [Wits 9]", note: "Check for signs of the dose before you go upstairs.", fn: function () { lookOver(d); } });
    ch.push(leave("Say goodnight and move on"));
    dlg({ title: L.name, sub: G.address(d), art: G.ladyArt(L), card: fresh, wide: true, body: body, choices: ch });
  }

  function haggle(d, dc) {
    var L = S.ladies[d.id];
    L.haggled = true; G.advance(5);
    var c = check("charm", dc - Math.min(2, L.mood));
    var price = askPrice(d);
    if (c.ok) {
      var cut = Math.max(1, Math.ceil(price * (0.25 + R() * 0.2)));
      L.askOverride = Math.max(1, price - cut);
      return dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: c.text + "<p>She laughs. “Cheeky. Go on then: " + L.askOverride + " shillings, and not a farthing less.”</p>", choices: [{ label: "Carry on", fn: function () { meetLady(d, false); } }] });
    }
    if (R() < 0.3) return dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: c.text + "<p>“If you can't afford a lady, don't knock on her door.” SLAM.</p>", choices: [leave("Ouch")] });
    L.askOverride = price + 1;
    dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: c.text + "<p>Her eyes narrow. “For that, it's " + L.askOverride + " shillings.”</p>", choices: [{ label: "Carry on", fn: function () { meetLady(d, false); } }] });
  }

  function drink(d) {
    var L = S.ladies[d.id], e = entry(d.id);
    L.drink = true; addCoin(-2); G.advance(20); L.mood += 2;
    var body = "<p>Gin for her, rum for you, and ten minutes of her laughing at your stories.</p><p class='good-note'>She warms to you.</p>";
    if (R() < 0.4) {
      if (L.thief && !e.known.thief) { e.known.thief = true; body += "<p class='note'>Her eyes keep drifting to your purse. $ Light fingers, you reckon.</p>"; }
      else if (L.dosed && !e.known.dose && R() < 0.5) { e.known.dose = true; body += "<p class='dose-note'>She knocks back her gin with a wince and a pill. Mercury. ✖ She has the dose.</p>"; }
      else if (L.spark >= 7) { e.known.spark = "good"; body += "<p class='good-note'>She's warm, funny and quick. This could be a very good night.</p>"; }
      else if (L.spark <= 3) { e.known.spark = "bad"; body += "<p class='note'>She keeps yawning. You suspect she'd rather be asleep.</p>"; }
    }
    dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: body, choices: [{ label: "Carry on", fn: function () { meetLady(d, false); } }] });
  }

  function lookOver(d) {
    var L = S.ladies[d.id], e = entry(d.id);
    L.looked = true; G.advance(5);
    var c = check("wits", 9), body = c.text;
    if (c.ok) {
      if (L.dosed) { e.known.dose = true; sfx("warn"); body += "<p>She smells of mercury ointment, and her hands have the shake that comes with the cure.</p><p class='dose-note'>✖ She has the dose. Go upstairs with her and you WILL catch it.</p>"; }
      else { e.known.clean = true; body += "<p>Clear-eyed, steady-handed, and nothing on the washstand but soap and rosewater.</p><p class='good-note'>✔ No sign of the dose.</p>"; }
    } else body += "<p>It's too dark in the doorway to tell anything. You'll have to take your chances.</p>";
    dlg({ title: L.name, art: G.ladyArt(L), wide: true, body: body, choices: [{ label: "Carry on", fn: function () { meetLady(d, false); } }] });
  }

  /* ---------- the night itself: the luck of the draw ---------- */
  var OUTCOMES = [
    { min: 13, title: "The night of your life", good: 40, nerve: 40, xp: 20, kind: "great",
      text: ["Hours later you're both laughing at nothing, the candle's burned down to a stub, and you've completely forgotten your own name.", "She sings to you in French, badly, and you'll remember it on every night watch for the rest of your life.", "You walk out into the fog grinning like a fool. Seven months at sea were worth it for this."] },
    { min: 10, title: "A grand night", good: 25, nerve: 25, xp: 14, kind: "good",
      text: ["Warm sheets, a good fire and better company. Money well spent.", "She's lovely, and she laughs at your jokes. Even the bad ones.", "You stay longer than you paid for, and she doesn't seem to mind."] },
    { min: 7, title: "Fair enough", good: 12, nerve: 10, xp: 8, kind: "fair",
      text: ["Nothing to write home about, which is just as well.", "Pleasant enough. She's polite, you're polite, and the bed doesn't collapse.", "It was what it was. You've had worse nights at sea."] },
    { min: 4, title: "A disappointing night", good: 4, nerve: 0, xp: 5, kind: "poor",
      text: ["She spends most of the hour complaining about her landlady.", "The bed's damp, the room's freezing and she keeps looking at the clock.", "She falls asleep. You let yourself out."] },
    { min: -99, title: "A disaster", good: 0, nerve: -10, xp: 3, kind: "bad",
      text: ["The bed collapses, the landlady screams, and the cat was sitting in your boot.", "She cries all night about a sailor called Bill. You're not Bill.", "Her mother's in the next room and the walls are paper-thin. It's a long, long hour."] }
  ];
  G.OUTCOMES = OUTCOMES;

  function upstairs(d, price) {
    var L = S.ladies[d.id], e = entry(d.id);
    addCoin(-price); G.advance(90);
    S.totals.nights++;
    var q = L.spark + (L.mood || 0) + Math.floor(G.stat("charm") / 2) + (S.inv.rabbit ? 1 : 0) + (e.sweetheart ? 2 : 0) + (S.nightFlags.lucky ? 1 : 0) + ri(-3, 3);
    if (S.dosed) q -= 2;
    var extra = "";
    if (S.suspicion >= 60 && R() < 0.3) {
      q -= 4; addSuspicion(8); G.advance(60);
      extra = "<p class='note'>Halfway through, whistles shrill in the street: a raid! You spend an hour hiding in a wardrobe. Suspicion +8.</p>";
    }
    var o = OUTCOMES.filter(function (x) { return q >= x.min; })[0];
    var body = "<p>The door closes behind you, and what happens next stays behind it.</p>";
    body += "<div class='outcome " + o.kind + "'><div class='o-title'>" + o.title + "</div><p>" + pick(o.text) + "</p></div>";
    addGood(o.good); addNerve(o.nerve); gainXP(o.xp);
    if (o.kind === "great") S.totals.great++;
    if (o.kind === "bad") S.totals.bad++;
    body += "<p class='note'>Good Times +" + o.good + (o.nerve ? " · Nerve " + (o.nerve > 0 ? "+" : "") + o.nerve : "") + "</p>" + extra;
    e.visits++;
    e.stars = { great: 5, good: 4, fair: 3, poor: 2, bad: 1 }[o.kind];
    if (!e.sweetheart && !L.legend && q >= 12 && R() < 0.35) {
      e.sweetheart = true;
      body += "<p class='good-note'>♥ As you're leaving she catches your sleeve. “Next time, sailor, you don't pay.” She's sweet on you!</p>";
    } else if (q >= 15 && price > 0 && R() < 0.3) {
      S.coin += price;
      body += "<p class='good-note'>She pushes your coins back into your hand. “Keep it. I had a lovely time.”</p>";
    }
    // The rule of the game: sleep with the wrong brass, one who has the dose, and you catch it. Every time.
    if (L.dosed) {
      e.known.dose = true;
      S.dosed = true; S.doses++; S.totals.doses++;
      addNerve(-15); addGood(-10); sfx("bad");
      body += "<p class='dose-note'><b>…and an hour later, walking back through the fog, the itch starts. Then the burn. You've caught the dose!</b> (" + S.doses + " of " + MAX_DOSES + " this shore leave.) Good Times −10, Charm −2, and you'll feel rotten every morning until you're cured: Lock Hospital, Dr Pell, or mercury pills.</p>";
    } else e.known.clean = true;
    diary(L.name + " (" + G.address(d) + "): " + o.title + (L.dosed ? ", and caught the dose" : "") + ".", L.dosed ? "dose" : o.kind);
    var after = [];
    if (L.thief) after.push(thiefEvent);
    if (L.fancy && R() < 0.45) after.push(fancyEvent);
    var chain = function () {
      if (S.doses >= MAX_DOSES) return leaveOver("hospital");
      var f = after.shift();
      if (!f) return;
      if (after.length) S.queue.unshift({ type: "fn", fn: chain });
      f(d);
    };
    dlg({ title: L.name, sub: o.title, art: G.ladyArt(L), wide: true, body: body, choices: [{ label: "Back out into the night", fn: chain }] });
  }

  function thiefEvent(d) {
    var L = S.ladies[d.id], e = entry(d.id);
    var c = check("wits", 10);
    e.known.thief = true;
    if (c.ok) {
      dlg({ title: "Light fingers!", art: G.ladyArt(L), body: c.text + "<p>On the stairs you catch her hand in your coat pocket. She goes scarlet and gives it all back, with a kiss for your trouble.</p>", choices: [leave("Check your purse twice")] });
    } else {
      var lost = Math.min(S.coin, Math.max(1, Math.floor(S.coin * (0.4 + R() * 0.3))));
      S.coin -= lost; S.totals.robbed++; sfx("bad");
      diary("Robbed of " + lost + "s by " + L.name + ".", "bad");
      dlg({ title: "Robbed!", art: G.ladyArt(L), body: c.text + "<p>Halfway down the street you reach for your purse. It's a good deal lighter: <b>" + lost + " shillings</b> lighter. She's bolted the door and won't answer.</p>", choices: [leave("Swear like a sailor")] });
    }
  }

  function fancyEvent(d) {
    var demand = 4 + S.leave;
    dlg({ title: "The fancy-man", sub: "Her 'protector' blocks the stairs", art: manArt("fancy" + d.id, { hat: "bowler", coat: "#5a3a1a", tache: true, scowl: true }),
      body: "<p>A flash cove in a checked suit is waiting at the bottom of the stairs, slapping a cosh against his palm. “That'll be another <b>" + demand + " shillings</b> for the room, sailor.”</p>",
      choices: [
        { label: "Pay him [" + demand + "s]", disabled: S.coin < demand, fn: function () { addCoin(-demand); ui().toast("He pockets it and tips his hat."); } },
        { label: "Talk your way past [Charm 10]", fn: function () {
          var c = check("charm", 10);
          if (c.ok) dlg({ title: "The fancy-man", body: c.text + "<p>You tell him your captain's the meanest man on the Wharf and he's waiting outside. He lets you pass.</p>", choices: [leave()] });
          else dlg({ title: "The fancy-man", body: c.text + "<p>“Nice try.” He raises the cosh.</p>", choices: [{ label: "Fight", fn: function () { G.fight(makeEnemy("pimp")); } }] });
        } },
        { label: "Fight him", fn: function () { G.fight(makeEnemy("pimp")); } }
      ], noClose: true });
  }

  /* ---------- the town's locals ---------- */
  var LOCAL_GREET = {
    crake: "“Do you know whose house this is? I could have you pressed into the Navy for knocking on it.”",
    vane: "“If you're after a room, I don't let to sailors. If you're after a girl, I don't let to those either. Officially.”",
    mott: "“My son, it's very late, and you smell of the sea and the gin-shop.”",
    pell: "“Ah. A sailor on shore leave. I can usually guess why you've come.”",
    ruddock: "“Halyard! Still ashore, and still in one piece? Keep it that way. I need every hand.”",
    lark: "“Darling, I've a performance tomorrow. Make it quick.” She opens the door all the way, though.",
    grime: "“Well, if it isn't Jack Tar. Causing trouble?” He taps his truncheon against his palm.",
    fenn: "“Pledging or redeeming, sailor?” His spectacles catch the gaslight."
  };

  function localDoor(d) {
    var s = byId(BK.LOCALS, d.local);
    if (S.knocked[d.id]) return dlg({ title: d.label, sub: s.name, art: localArt(s), body: "<p>You've already been here tonight. Come back tomorrow night.</p>", choices: [leave()] });
    dlg({ title: d.label, sub: s.name + " — " + s.role, knocker: d.knocker, body: "<p>" + s.desc + "</p>", choices: [{ label: "Knock", fn: function () {
      S.knocked[d.id] = true; S.totals.knocks++; S.nightLog.knocks++; G.advance(10); sfx("knock", "firm");
      localTalk(d, s);
    } }, leave()] });
  }

  function localTalk(d, s) {
    var ch = [];
    if (s.id === "pell" && S.dosed) ch.push({ label: "Get the dose treated, quietly [8s]", note: "Certain cure. No names asked.", disabled: S.coin < 8, fn: function () { addCoin(-8); G.advance(30); cure("Dr Pell's needle and a great deal of mercury. It works."); } });
    if (s.id === "pell" && !S.dosed) ch.push({ label: "Buy a bottle of his tonic [5s]", disabled: S.coin < 5, fn: function () { addCoin(-5); G.addItem("tonic"); ui().toast("Dr Pell's Tonic added to your bag."); } });
    if (s.id === "vane" && !S.nightFlags.vane) ch.push({ label: "Ask which girls are taking the mercury cure [4s]", note: "Up to two dose warnings.", disabled: S.coin < 4, fn: function () {
      S.nightFlags.vane = true; addCoin(-4); G.advance(10);
      var a = gossipAbout("dose"), b = gossipAbout("dose");
      dlg({ title: s.name, art: localArt(s), body: "<p>She opens a ledger and runs a finger down it.</p>" + (a || "") + (b || "") + (!a && !b ? "<p>“None that you don't already know about.”</p>" : ""), choices: [leave()] });
    } });
    if (s.id === "grime") ch.push({ label: "Grease his palm [10s]", note: "−30 Suspicion", disabled: S.coin < 10, fn: function () { addCoin(-10); addSuspicion(-30); ui().toast("Your name slides off the duty sheet. Suspicion −30."); } });
    if (s.id === "mott" && !S.nightFlags.sermon) ch.push({ label: "Sit through a sermon on the wages of sin", note: "+25 Nerve, −5 Suspicion", fn: function () {
      S.nightFlags.sermon = true; G.advance(30); addNerve(25); addSuspicion(-5);
      dlg({ title: s.name, art: localArt(s), body: "<p>Forty minutes on fire and brimstone. Oddly restful.</p><p class='note'>Nerve +25, Suspicion −5</p>", choices: [leave()] });
    } });
    if (s.id === "ruddock" && !S.leaveFlags.advance) ch.push({ label: "Ask for an advance on your pay", note: "+10 shillings, once per shore leave", fn: function () {
      S.leaveFlags.advance = true; addCoin(10);
      dlg({ title: s.name, art: localArt(s), body: "<p>“Ten shillings, and I'll stop it out of your wages. And Halyard: stay away from the dose.”</p>", choices: [leave()] });
    } });
    if (s.id === "lark" && !S.nightFlags.lark) ch.push({ label: "Ask Kitty to recommend a lady [3s]", note: "She only knows the good ones.", disabled: S.coin < 3, fn: function () {
      S.nightFlags.lark = true; addCoin(-3); G.advance(10);
      var best = Object.keys(S.ladies).filter(function (id) { var L = S.ladies[id]; return !L.legend && !L.dosed && L.spark >= 7 && doorById(id).kind === "resident" && !(S.book[id] && S.book[id].known.spark); });
      var body;
      if (best.length) {
        var id = pick(best), L = S.ladies[id], dd = doorById(id), e = entry(id);
        e.tip = true; e.known.spark = "good"; e.known.clean = true;
        body = "<p>“Darling, you want <b>" + L.name + "</b>, " + G.address(dd) + ". Clean as a whistle and the best company in town.”</p><p class='good-note'>♥ Noted in your Little Black Book.</p>";
      } else body = gossipAbout("legend") || "<p>“You've met all the best girls already, you rogue.”</p>";
      dlg({ title: s.name, art: localArt(s), body: body, choices: [leave()] });
    } });
    if (s.id === "crake" && !S.nightFlags.crake) ch.push({ label: "Ask which of his houses have ladies in [Charm 10]", fn: function () {
      S.nightFlags.crake = true; G.advance(15);
      var c = check("charm", 10), body = c.text;
      if (c.ok) {
        var opts = Object.keys(S.ladies).filter(function (id) { return doorById(id).kind === "resident" && !(S.book[id] && (S.book[id].tip || S.book[id].seen)); });
        opts = U.shuffle(R, opts).slice(0, 3);
        opts.forEach(function (id) { entry(id).tip = true; });
        body += "<p>He wets a pencil and scribbles some addresses. “Tell them Crake sent you, and they'll charge you double.”</p>" +
          (opts.length ? "<ul>" + opts.map(function (id) { var dd = doorById(id); return "<li>" + U.esc(S.ladies[id].name) + ": " + G.address(dd) + " (" + BK.KNOCKERS[dd.knocker].name.toLowerCase() + " knocker)</li>"; }).join("") + "</ul>" : "<p>“You've found them all, you dog.”</p>");
      } else body += "<p>“Get off my doorstep before I call Sergeant Grime.”</p>";
      dlg({ title: s.name, art: localArt(s), body: body, choices: [leave()] });
    } });
    if (s.id === "fenn") ch.push({ label: "Browse the shop", fn: function () { ui().shop(); } });
    ch.push(leave());
    dlg({ title: s.name, sub: s.role, art: localArt(s), body: "<p>" + LOCAL_GREET[s.id] + "</p>", choices: ch });
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
        { label: "Turn in until dawn", note: "Ends the night.", fn: function () { dawn(true); } },
        { label: "Save your progress", fn: function () { var ok = G.save(); ui().toast(ok ? "Game saved." : "Could not save on this device."); } },
        { label: "Read your Little Black Book", fn: function () { ui().book(); } },
        leave()
      ]
    });
  }

  function tavern(d) {
    var ch = [];
    if (!S.nightFlags.round) ch.push({ label: "Buy a round and listen to the gossip [2s]", disabled: S.coin < 2, fn: function () {
      S.nightFlags.round = true; addCoin(-2); G.advance(20);
      dlg({ title: "The Drowned Man", body: "<p>Rum goes round, and the talk turns, as it always does, to the ladies of Brassmoor.</p>" + gossip() + gossip(), choices: [leave()] });
    } });
    if (!S.nightFlags.landlord) ch.push({ label: "Ask the landlord who's got the dose [1s]", disabled: S.coin < 1, fn: function () {
      S.nightFlags.landlord = true; addCoin(-1); G.advance(10);
      dlg({ title: "The landlord", body: "<p>He polishes a glass and lowers his voice.</p>" + (gossipAbout("dose") || "<p>“Can't say I've heard of any more, sailor.”</p>"), choices: [leave()] });
    } });
    if (!S.nightFlags.crew) ch.push({ label: "Drink with the Gannet's crew [3s]", note: "+8 Good Times, +3 Suspicion", disabled: S.coin < 3, fn: function () {
      S.nightFlags.crew = true; addCoin(-3); G.advance(40); addGood(8); addSuspicion(3);
      dlg({ title: "The Drowned Man", body: "<p>Shanties, arm-wrestling and a man called Spud who can drink a pint through his nose. A fine evening.</p><p class='note'>Good Times +8</p>", choices: [leave()] });
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
    ch.push(leave());
    dlg({ title: "St Bride's Church", sub: "Chapel Hill", knocker: d.knocker, body: "<p>Cold stone, old incense and the smell of candle wax. A strange place for a sailor on shore leave, but nobody's judging. Much.</p>", choices: ch });
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
      if (c.ok) { var a = gossipAbout("dose"), b = gossipAbout("dose"); body += "<p>“I shouldn't, but I'd rather you didn't end up in here.”</p>" + (a || "") + (b || "") + (!a && !b ? "<p>“Nobody you don't already know about.”</p>" : ""); }
      else body += "<p>“Patients' names are confidential, young man. Good night.”</p>";
      dlg({ title: "The Matron", body: body, choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "The Lock Hospital", sub: "Gaslight Square", knocker: d.knocker, body: "<p>A grim stone building with a lamp burning all night. Everyone in Brassmoor knows what it's for, and nobody says it out loud.</p>" +
      (S.dosed ? "<p class='dose-note'>✖ You have the dose. This is the place to be rid of it.</p>" : "<p class='hint'>You're clean. Keep it that way.</p>"), choices: ch });
  }

  function hall(d) {
    var ch = [];
    var L = S.ladies[d.id];
    if (!S.nightFlags.sang) ch.push({ label: "Sing a sea-shanty for the late crowd [Charm 8]", note: "Earn coin if they like you.", fn: function () {
      S.nightFlags.sang = true; G.advance(30);
      var c = check("charm", 8), body = c.text;
      if (c.ok) { var e = 2 + G.stat("charm"); addCoin(e); addGood(4); gainXP(5); body += "<p>You give them “Leave Her, Johnny” with feeling. Coins rain onto the boards. +" + e + "s, Good Times +4</p>"; }
      else { addNerve(-5); body += "<p>Somebody throws a cabbage. It's a good throw. Nerve −5</p>"; }
      dlg({ title: "Empire Music Hall", body: body, choices: [leave()] });
    } });
    if (L && !S.knocked[d.id]) ch.push({ label: "Wait at the stage door for a chorus girl", fn: function () {
      S.knocked[d.id] = true; G.advance(20);
      if (R() < 0.75) meetLady(d, true);
      else dlg({ title: "Stage door", body: "<p>The chorus girls sweep past on the arms of gentlemen in top hats. Not tonight, sailor.</p>", choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "Empire Music Hall", sub: "Gaslight Square", knocker: d.knocker, body: "<p>Gilt and limelight, a fiddler sawing away, and the smell of oranges and spilled beer.</p>", choices: ch });
  }

  function mill(d) {
    var ch = [];
    if (!S.nightFlags.dice) ch.push({ label: "Dice with the night watchman [bet 3s]", note: "Double or nothing.", disabled: S.coin < 3, fn: function () {
      S.nightFlags.dice = true; addCoin(-3); G.advance(20);
      var win = R() < 0.45 + G.stat("wits") * 0.02;
      if (win) addCoin(6);
      dlg({ title: "Dice", body: win ? "<p>Double sixes! The watchman swears and pays up. +6s</p>" : "<p>Snake eyes. The watchman grins and pockets your money.</p>", choices: [leave()] });
    } });
    ch.push(leave());
    dlg({ title: "Crake's Mill", sub: "Mill Row", knocker: d.knocker, body: "<p>The looms are silent at night. A watchman sits by a brazier, rattling a pair of dice.</p>", choices: ch });
  }

  function warehouse(d) {
    var ch = [];
    if (!S.nightFlags.scav) ch.push({ label: "Look for spilled cargo", note: "Crimps lurk in here.", fn: function () {
      S.nightFlags.scav = true; G.advance(30);
      if (R() < 0.4) return G.fight(makeEnemy("crimp"), scavenge);
      scavenge();
    } });
    ch.push(leave());
    dlg({ title: "Bonded Warehouse", sub: "The Wharf", knocker: d.knocker, body: "<p>A side door hangs off one hinge. Inside, broken crates, and the smell of tea, tobacco and rats.</p>", choices: ch });
  }
  function scavenge() {
    var c = ri(0, 6);
    if (c) addCoin(c);
    dlg({ title: "Spilled cargo", body: c ? "<p>A split crate of tobacco twists. You flog them to a passing lighterman for " + c + " shillings.</p>" : "<p>Nothing but rats.</p>", choices: [leave()] });
  }

  function pawn(d) {
    dlg({ title: "Fenn's Pawnshop", sub: "Three brass balls over the door", knocker: d.knocker, body: "<p>Shelves of other people's treasures, and a glass case of everything a sailor on shore leave might need. Mr Fenn watches you over his spectacles.</p>", choices: [
      { label: "Browse the shop", fn: function () { ui().shop(); } },
      { label: "Pawn something for cash", fn: function () { ui().shop("sell"); } },
      leave()] });
  }

  function spot(sp) {
    if (sp.place === "square") return dlg({ title: "Gaslight Square", body: "<p>The fountain's brass dolphin spits green water. Sailors toss pennies in for luck.</p>", choices: [
      { label: "Toss a coin in for luck [1s]", note: "Better nights for the rest of tonight.", disabled: S.coin < 1 || !!S.nightFlags.lucky, fn: function () { addCoin(-1); S.nightFlags.lucky = true; ui().toast("Plink. You feel lucky tonight."); } }, leave()] });
    if (sp.place === "lock") return dlg({ title: "The Canal Lock", body: "<p>Black water slaps the gates. It's quiet here, away from the noise of the town.</p>", choices: [
      { label: "Sit by the water a while", note: "+15 Nerve, 20 minutes. Once a night.", disabled: !!S.nightFlags.canal, fn: function () { S.nightFlags.canal = true; G.advance(20); addNerve(15); ui().toast("You watch the water and get your breath back. Nerve +15."); } }, leave()] });
  }

  /* ============ night & day ============ */
  function goHome() { S.px = WD.start.x; S.py = WD.start.y; S.facing = "up"; if (BK.render) BK.render.snap(); }

  function dawn(slept) {
    var body = slept ? "<p>You sleep like a log in your hammock at the Sailors' Home.</p>" :
      "<p>The sky greys over the mill chimneys. You stagger back to the Sailors' Home through the first carts of the morning.</p>";
    var nl = S.nightLog;
    var summary = "<table class='tbl'><tr><th>Doors knocked</th><td>" + nl.knocks + "</td></tr><tr><th>Ladies met</th><td>" + nl.ladies + "</td></tr><tr><th>Good Times tonight</th><td>+" + nl.good + "</td></tr><tr><th>Money spent</th><td>" + nl.spent + "s</td></tr><tr><th>Purse now</th><td>" + S.coin + "s</td></tr></table>";
    var rent = S.coin >= 1;
    if (rent) { S.coin -= 1; S.totals.spent += 1; }
    addSuspicion(-10);
    S.buffs = {}; S.knocked = {}; S.nightFlags = {}; S.avail = {};
    S.night++; S.time = 0; S.nightLog = { knocks: 0, ladies: 0, good: 0, spent: 0 };
    goHome();
    if (S.night > BK.LEAVE.nights) return leaveOver("sail", body + summary);
    var doseNote = S.dosed ? "<p class='dose-note'>✖ It burns. The dose will cost you 20 Nerve tonight. Get it cured!</p>" : "";
    S.nerve = S.maxNerve;
    G.save();
    sfx("dawn");
    var start = function (nerveFrac) { S.nerve = Math.max(1, Math.round(S.maxNerve * nerveFrac) - (S.dosed ? 20 : 0)); ui().toast("Night " + S.night + " · 8:00pm"); };
    dlg({ title: "Dawn · Night " + (S.night - 1) + " is over", sub: G.nightsLeft() + " night(s) of shore leave left", body: body + summary + doseNote +
      "<div class='gazette'><div class='gz-title'>THE BRASSMOOR GAZETTE</div><div class='gz-head'>" + pick(BK.HEADLINES) + "</div></div>" +
      "<p class='note'>" + (rent ? "Hammock paid for (1s)." : "You couldn't pay for your hammock; the matron let you off this once.") + " How will you spend the day?</p>",
      choices: [
        { label: "Sleep all day", note: "Go out tonight with full Nerve.", fn: function () { start(1); } },
        { label: "Work a shift unloading ships [+8s]", note: "Earn money, but go out tonight with 60% Nerve.", fn: function () { addCoin(8); start(0.6); } },
        { label: "Spend the day in the gin palace [5s]", note: "+10 Good Times, but go out with 70% Nerve and +5 Suspicion.", disabled: S.coin < 5, fn: function () { addCoin(-5); addGood(10); addSuspicion(5); start(0.7); } }
      ], noClose: true });
  }
  G.dawn = dawn;

  function leaveOver(why, pre) {
    var score = why === "hospital" ? Math.floor(S.good / 2) : S.good;
    var best = G.best();
    setBest(score);
    S.totals.leaves++;
    S.over = true;
    var head = why === "hospital" ? "<p>Three doses in one shore leave. Captain Ruddock takes one look at you and signs you over to the Lock Hospital until the Gannet sails. Your shore leave is over.</p>" :
      "<p>The Gannet sails on the morning tide. You lean on the rail and watch Brassmoor's chimneys disappear into the fog.</p>";
    var tbl = "<table class='tbl'><tr><th>Good Times</th><td><b>" + score + "</b>" + (why === "hospital" ? " (halved: Lock Hospital)" : "") + "</td></tr><tr><th>Rank</th><td>" + G.rank(score) + "</td></tr><tr><th>Best ever</th><td>" + Math.max(best, score) + (score > best ? " <b>NEW RECORD!</b>" : "") + "</td></tr>" +
      "<tr><th>Nights with a lady</th><td>" + S.totals.nights + " in total</td></tr><tr><th>Nights of your life</th><td>" + S.totals.great + "</td></tr><tr><th>Disasters</th><td>" + S.totals.bad + "</td></tr><tr><th>Times robbed</th><td>" + S.totals.robbed + "</td></tr><tr><th>Doses caught</th><td>" + S.totals.doses + "</td></tr><tr><th>Money spent</th><td>" + S.totals.spent + "s</td></tr><tr><th>Money left</th><td>" + S.coin + "s</td></tr></table>";
    sfx(score >= 150 ? "win" : "dawn");
    dlg({ title: "Shore leave over", sub: "Shore leave " + S.leave, body: (pre || "") + head + tbl,
      choices: [
        { label: "Next shore leave", note: "Seven months at sea, then a new run ashore: new ladies, fresh pay. You keep your level and your bag.", fn: function () { S.over = false; G.startLeave(); ui().intro(true); } },
        { label: "Back to title", fn: function () { G.clearSave(); ui().title(); } }
      ], noClose: true });
  }

  function collapse() {
    var lost = Math.floor(S.coin / 2); S.coin -= lost;
    S.nerve = 1;
    dlg({ title: "Everything goes dark", body: "<p>Your legs go out from under you. When you come to, your purse is lighter by " + lost + " shillings, and it's nearly morning.</p>",
      choices: [{ label: "Crawl home", fn: function () { S.time = NIGHT_LEN; dawn(false); } }], noClose: true });
  }

  function arrested() {
    var fine = Math.min(S.coin, 5 + S.leave * 2); S.coin -= fine;
    S.suspicion = 40;
    sfx("bad");
    dlg({ title: "Arrested!", body: "<p>A whistle shrills, then another. You spend the rest of the night in the cells at the Station House, and the magistrate fines you " + fine + " shillings in the morning.</p>",
      choices: [{ label: "Released at dawn", fn: function () { S.time = NIGHT_LEN; dawn(false); } }], noClose: true });
  }

  /* ============ street events ============ */
  function makeEnemy(id, name) {
    var e = byId(BK.ENEMIES, id);
    var boost = (S.leave - 1) * 2;
    return { name: name || e.name, hp: e.hp + boost * 3, atk: e.atk + Math.floor(boost / 2), will: e.will + Math.floor(boost / 2), xp: e.xp, coin: e.coin, line: e.line };
  }

  G.onStep = function () {
    G.advance(1);
    if (S.encounterCool > 0) { S.encounterCool--; return false; }
    var dist = WD.district(S.px, S.py);
    if (WD.get(S.px, S.py) === WD.TILE.PLAZA) return false;
    var p = 0.007 * ({ rookery: 1.8, wharf: 1.6, mill: 1.0, square: 0.5, chapel: 0.6 }[dist] || 1);
    if (S.time > 300) p *= 1.3;
    if (R() < p) {
      S.encounterCool = 30;
      var pool = BK.ENEMIES.filter(function (e) { return !e.minCh || e.minCh < S.leave; });
      if (dist === "wharf") pool = pool.concat([byId(BK.ENEMIES, "crimp")]);
      G.fight(makeEnemy(pick(pool).id));
      return true;
    }
    return false;
  };

  G.constableStop = function () {
    var dc = 8 + Math.floor(S.suspicion / 15);
    dlg({ title: "“Evening, sailor.”", sub: "A constable steps out of the fog", art: manArt("constable", { hat: "helmet", coat: "#1a2440", tache: true, scowl: true }),
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
    var art = manArt("enemy:" + e.name, { scowl: true, hat: pick(["cap", "bowler", "none"]) });
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
        dlg({ title: "You win", art: art, body: "<p>" + log.slice(-2).join("<br>") + "</p><p>" + e.name + " flees into the fog.</p><p class='note'>+" + e.xp + " XP" + (c ? ", +" + c + " shillings" : "") + "</p>",
          choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "talk") {
        gainXP(Math.round(e.xp / 2));
        dlg({ title: "Talked down", art: art, body: "<p>" + log[log.length - 1] + "</p><p class='note'>+" + Math.round(e.xp / 2) + " XP</p>", choices: [{ label: "Carry on", fn: function () { if (onWin) onWin(); } }], noClose: true });
      } else if (outcome === "flee") {
        dlg({ title: "Escaped", body: "<p>You dart down a side-alley and lose them.</p>", choices: [leave("Catch your breath")], noClose: true });
      } else {
        S.nerve = 0;
        dlg({ title: "Beaten", art: art, body: "<p>" + log.slice(-2).join("<br>") + "</p>", choices: [leave("…")], noClose: true });
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
      dlg({ title: e.name, sub: "Street fight", art: art,
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
    if (!it.use) { if (!silent) ui().toast(it.name + ": " + it.desc); return; }
    var u = it.use;
    if (u.cure !== undefined) {
      if (!S.dosed) { if (!silent) ui().toast("You don't have the dose. Save the pills."); return; }
      takeItem(id);
      if (R() < u.cure) cure("You choke down the mercury pills. A night of feeling like death, but it's gone.");
      else ui().toast("The pills make you sick as a dog, but the dose is still there.");
      return;
    }
    takeItem(id);
    if (u.nerve) addNerve(u.nerve);
    if (u.suspicion) addSuspicion(u.suspicion);
    if (u.cologne) S.buffs.cologne = 1;
    if (u.snuff) S.buffs.snuff = 1;
    sfx("blip");
    if (!silent) ui().toast("Used " + it.name + ".");
  };
  G.priceOf = function (id) { return BK.ITEMS[id].price; };
  G.buy = function (id) {
    var p = G.priceOf(id);
    if (S.coin < p) return false;
    addCoin(-p); G.addItem(id); return true;
  };
  G.sell = function (id) {
    var it = BK.ITEMS[id];
    if (!S.inv[id]) return false;
    if (S.equip.weapon === id && S.inv[id] === 1) S.equip.weapon = null;
    if (S.equip.wear === id && S.inv[id] === 1) S.equip.wear = null;
    takeItem(id); S.coin += Math.max(1, Math.floor(it.price / 2)); sfx("coin"); return true;
  };
})();
