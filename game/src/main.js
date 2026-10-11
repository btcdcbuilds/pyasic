import '@fontsource/lilita-one/latin-400.css';
import { WORLDS, WEAPONS, DIFFICULTIES, UPGRADES, LEVELS_PER_WORLD, upgradeCost, weaponById, weaponDps } from './data.js';
import { generateLevel, Sim, levelIndex, botTarget } from './sim.js';
import { Renderer, fmt } from './render.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { levelCoins } from './economy.js';
import { drawWeaponIcon } from './icons.js';
import { THEMES, themeById, themedWorld } from './themes.js';

import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { loadSave, persistSave, defaults, dailyStatus, sanitize, SAVE_KEY } from './save.js';

// ------------------------------------------------------------------ save data
let save = loadSave();
try { document.fonts.load('32px "Lilita One"'); } catch { /* old WebView: falls back to system fonts */ }
function persist() {
  if (!persistSave(save)) toast('Could not save progress (storage full or blocked)');
  // second copy in Android's native app storage, in case the WebView storage is ever cleared
  try { Preferences.set({ key: SAVE_KEY, value: JSON.stringify(save) }).catch(() => {}); } catch { /* web */ }
}
// If the main copy is missing but the native backup exists, restore it.
async function restoreBackup() {
  let hasMain = false;
  try { hasMain = !!localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
  if (hasMain) return;
  try {
    const { value } = await Preferences.get({ key: SAVE_KEY });
    if (!value) return;
    save = sanitize(JSON.parse(value));
    persistSave(save);
    if (screen === 'menu') show('menu');
    toast('Progress restored');
  } catch { /* no backup */ }
}
const upLvl = (id) => save.upgrades[id] || 0;
const TOTAL_LEVELS = WORLDS.length * LEVELS_PER_WORLD;
const weaponUnlockLevel = (w) => Math.min(TOTAL_LEVELS - 1, w.tier * 4);

// ------------------------------------------------------------------ setup
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const canvas = $('#game');
const overlay = $('#overlay');
const renderer = new Renderer(canvas, overlay);
renderer.setTheme(save.theme);
const tw = (wi) => themedWorld(wi, save.theme); // world names/bosses as the chosen theme shows them
renderer.setQuality(save.quality);
const sfx = new Sfx();
sfx.enabled = save.sound;
const music = new Music(sfx);
music.enabled = save.music;
function menuMusic() { music.play(current ? current.wi : 0, 'menu'); }

let sim = null;
let current = null; // { wi, li }
let targetX = 0;
let paused = true;
let lastT = performance.now();
let hintTimer = 0;
let lastWarn = 0;
let slowFrames = 0;
const dangerEl = document.getElementById('danger');
let autoplay = new URLSearchParams(location.search).has('autoplay');
// playtest hook: ?speed=2 runs the game faster (used by tools/playtest.mjs)
const timeScale = Math.max(0.25, Math.min(4, +(new URLSearchParams(location.search).get('speed') || 1)));

function vibrate(ms) {
  if (save.vibe && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ screens
const screens = ['menu', 'worlds', 'armory', 'upgrades', 'stats', 'themes', 'settings', 'pause', 'result', 'daily'];
let screen = 'menu';
function show(name) {
  screen = name;
  dangerEl.style.opacity = 0;
  for (const s of screens) $('#scr-' + s).classList.toggle('hidden', s !== name);
  $('#hud').classList.toggle('hidden', !!name && name !== 'pause' && name !== 'result');
  if (name !== 'pause') menuMusic();
  if (name === 'menu') renderMenu();
  if (name === 'worlds') renderWorlds();
  if (name === 'armory') renderArmory();
  if (name === 'upgrades') renderUpgrades();
  if (name === 'settings') renderSettings();
  if (name === 'stats') renderStats();
  if (name === 'themes') renderThemes();
  $$('.coins-total').forEach((el) => (el.textContent = fmt(save.coins)));
}
function hideAll() {
  screen = 'game';
  for (const s of screens) $('#scr-' + s).classList.add('hidden');
  $('#hud').classList.remove('hidden');
}
document.addEventListener('click', (ev) => {
  sfx.unlock();
  if (screen !== 'game') menuMusic();
  const go = ev.target.closest('[data-go]');
  if (go) { sfx.click(); show(go.dataset.go); }
});

function diffButtons(el) {
  el.innerHTML = '';
  for (const d of DIFFICULTIES) {
    const b = document.createElement('button');
    b.textContent = d.name;
    b.className = d.id === save.difficulty ? 'on' : '';
    b.onclick = () => { save.difficulty = d.id; persist(); sfx.click(); diffButtons(el); if (el.id === 'worlds-diff') renderWorlds(); };
    el.appendChild(b);
  }
  const desc = document.createElement('div');
  desc.className = 'diff-desc';
  desc.textContent = DIFFICULTIES.find((d) => d.id === save.difficulty).desc;
  el.appendChild(desc);
}

function nextLevel() {
  const p = Math.min(save.progress, TOTAL_LEVELS - 1);
  return { wi: Math.floor(p / LEVELS_PER_WORLD), li: p % LEVELS_PER_WORLD };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let dailyOffer = null;
function checkDaily() {
  const st = dailyStatus(save, today());
  if (!st.claimable || !save.tutorialDone) return false;
  dailyOffer = st;
  $('#daily-streak').textContent = st.streak > 1 ? `Day ${st.streak} streak!` : 'Welcome back, commander!';
  $('#daily-amount').textContent = '+' + fmt(st.reward);
  show('daily');
  return true;
}
$('#btn-daily').onclick = () => {
  if (!dailyOffer) return show('menu');
  save.coins += dailyOffer.reward;
  save.daily = { last: today(), streak: dailyOffer.streak };
  dailyOffer = null;
  persist();
  sfx.win();
  show('menu');
};

function renderStats() {
  const st = save.stats;
  const mins = Math.round(st.playSeconds / 60);
  const starsTotal = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const rows = [
    ['Levels cleared', `${save.progress} / ${TOTAL_LEVELS}`],
    ['Stars earned', `${starsTotal} / ${TOTAL_LEVELS * 3 * DIFFICULTIES.length}`],
    ['Levels played', fmt(st.levelsPlayed)],
    ['Wins', fmt(st.levelsWon)],
    ['Enemies defeated', fmt(st.kills)],
    ['Bosses defeated', fmt(st.bossesKilled)],
    ['Biggest army', fmt(st.bestArmy)],
    ['Coins earned', fmt(st.coinsEarned)],
    ['Time played', mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`],
    ['Daily streak', `${save.daily.streak} day${save.daily.streak === 1 ? '' : 's'}`],
  ];
  $('#stats-table').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
}

function renderMenu() {
  const n = nextLevel();
  const ch = challengeToday();
  const cb = $('#btn-challenge');
  cb.classList.toggle('hidden', save.progress < 3);
  cb.innerHTML = `Daily Challenge <small>${tw(ch.wi).name}${ch.done ? ' &#10003; done today' : ' &bull; 1.5x coins'}</small>`;
  $('#play-sub').textContent = save.progress >= TOTAL_LEVELS ? 'All worlds cleared! Replay the final battle' : `${tw(n.wi).name} - Level ${n.li + 1}`;
  diffButtons($('#menu-diff'));
}

function starKey(wi, li, d) { return `${wi}-${li}-${d}`; }

function renderWorlds() {
  diffButtons($('#worlds-diff'));
  const list = $('#world-list');
  list.innerHTML = '';
  WORLDS.forEach((_, wi) => {
    const w = tw(wi);
    const unlocked = save.progress >= wi * LEVELS_PER_WORLD;
    const card = document.createElement('div');
    card.className = 'card world-card' + (unlocked ? '' : ' locked');
    const sky = '#' + w.sky.toString(16).padStart(6, '0');
    const gr = '#' + w.ground.toString(16).padStart(6, '0');
    card.innerHTML = `<div class="swatch" style="background:linear-gradient(135deg, ${sky}, ${gr})"></div>
      <div class="wc-head"><h3>${wi + 1}. ${w.name}</h3><span class="wc-tag">${unlocked ? w.tagline : 'LOCKED'}</span></div>
      <div class="wc-desc">${w.desc} Boss: ${w.boss.name}.</div><div class="levels"></div>`;
    const lv = card.querySelector('.levels');
    for (let li = 0; li < LEVELS_PER_WORLD; li++) {
      const L = levelIndex(wi, li);
      const b = document.createElement('button');
      const st = save.stars[starKey(wi, li, save.difficulty)] || 0;
      b.innerHTML = `${li + 1}<small>${'★'.repeat(st)}</small>`;
      b.disabled = L > save.progress;
      if (li === LEVELS_PER_WORLD - 1) b.classList.add('boss');
      b.onclick = () => { sfx.click(); startLevel(wi, li); };
      lv.appendChild(b);
    }
    list.appendChild(card);
  });
}

function statBars(w) {
  const maxDps = Math.max(...WEAPONS.map(weaponDps));
  const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.max(4, Math.min(100, v * 100))}%"></i></div></div>`;
  const extras = [];
  if (w.pellets) extras.push(`${w.pellets} pellets`);
  if (w.pierce) extras.push(`pierces ${w.pierce}`);
  if (w.splash) extras.push('explosive');
  if (w.chain) extras.push(`chains to ${w.chain}`);
  return bar('Power', weaponDps(w) / maxDps) + bar('Rate', w.rate / 11) + bar('Range', w.range / 80) +
    (extras.length ? `<div class="tagline">${extras.join(' &bull; ')}</div>` : '');
}

function renderArmory() {
  const list = $('#weapon-list');
  list.innerHTML = '';
  for (const w of WEAPONS) {
    const owned = save.owned.includes(w.id);
    const need = weaponUnlockLevel(w);
    const available = save.progress >= need;
    const card = document.createElement('div');
    card.className = 'card row weapon-card' + (available || owned ? '' : ' locked');
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 108;
    drawWeaponIcon(cv.getContext('2d'), w, 10, 6, 220, 96);
    card.appendChild(cv);
    const meta = document.createElement('div');
    meta.className = 'wmeta';
    meta.innerHTML = `<h3>${w.name}</h3>${statBars(w)}`;
    card.appendChild(meta);
    const b = document.createElement('button');
    b.className = 'btn small' + (save.equipped === w.id ? ' primary' : '');
    if (owned) {
      b.textContent = save.equipped === w.id ? 'Equipped' : 'Equip';
      b.onclick = () => { save.equipped = w.id; persist(); sfx.click(); renderArmory(); };
    } else if (!available) {
      // unlocked once `need` levels are cleared, i.e. after clearing level number `need`
      b.textContent = `Clear ${Math.floor((need - 1) / LEVELS_PER_WORLD) + 1}-${((need - 1) % LEVELS_PER_WORLD) + 1}`;
      b.disabled = true;
    } else {
      b.innerHTML = `<span class="coin-ic"></span>${fmt(w.price)}`;
      b.disabled = save.coins < w.price;
      b.onclick = () => {
        if (save.coins < w.price) return;
        save.coins -= w.price; save.owned.push(w.id); save.equipped = w.id; persist(); sfx.weapon(); show('armory');
      };
    }
    card.appendChild(b);
    list.appendChild(card);
  }
}

function renderUpgrades() {
  const list = $('#upgrade-list');
  list.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = upLvl(u.id);
    const maxed = lvl >= u.max;
    const cost = upgradeCost(u, lvl);
    const card = document.createElement('div');
    card.className = 'card row';
    card.innerHTML = `<div><div>${u.name} <span class="lv">Lv ${lvl}/${u.max}</span></div><div class="up-desc">${u.desc} per level</div></div>`;
    const b = document.createElement('button');
    b.className = 'btn small primary';
    if (maxed) b.textContent = 'MAX';
    else b.innerHTML = `<span class="coin-ic"></span>${fmt(cost)}`;
    b.disabled = maxed || save.coins < cost;
    b.onclick = () => {
      if (maxed || save.coins < cost) return;
      save.coins -= cost; save.upgrades[u.id] = lvl + 1; persist(); sfx.good(); show('upgrades');
    };
    card.appendChild(b);
    list.appendChild(card);
  }
}

function renderSettings() {
  $('#app-version').textContent = typeof __APP_VERSION__ === 'string' ? `v${__APP_VERSION__}` : '';
  $('#set-sound').textContent = save.sound ? 'On' : 'Off';
  $('#set-music').textContent = save.music ? 'On' : 'Off';
  $('#set-vibe').textContent = save.vibe ? 'On' : 'Off';
  $('#set-quality').textContent = { high: 'High', medium: 'Medium', low: 'Low' }[save.quality];
}
$('#set-sound').onclick = () => { save.sound = !save.sound; sfx.enabled = save.sound; persist(); renderSettings(); };
$('#set-music').onclick = () => { save.music = !save.music; music.setEnabled(save.music); persist(); renderSettings(); };
$('#set-vibe').onclick = () => { save.vibe = !save.vibe; persist(); renderSettings(); };
$('#set-quality').onclick = () => {
  save.quality = { high: 'medium', medium: 'low', low: 'high' }[save.quality];
  renderer.setQuality(save.quality); persist(); renderSettings();
};
$('#set-reset').onclick = () => {
  if (!confirm('Reset ALL progress, coins and upgrades?')) return;
  save = defaults(); persist(); show('menu');
};

// ------------------------------------------------------------------ gameplay
function playerStats() {
  return {
    startTroops: 10 + 2 * upLvl('troops'),
    weapon: save.equipped,
    dmgMult: 1 + 0.06 * upLvl('damage'),
    rateMult: 1 + 0.04 * upLvl('rate'),
    armor: Math.min(0.45, 0.03 * upLvl('armor')),
  };
}

// Daily challenge: a different world and layout every day, scaled to your progress.
function challengeToday() {
  const t = today();
  const day = Math.floor(Date.parse(`${t}T00:00:00Z`) / 86400000);
  return { day, wi: day % WORLDS.length, L: Math.max(2, Math.min(TOTAL_LEVELS - 1, save.progress - 1)), done: save.challenge.last === t };
}

function startLevel(wi, li, opts = {}) {
  current = { wi, li, challenge: !!opts.challenge };
  const ch = opts.challenge ? challengeToday() : null;
  const level = ch ? generateLevel(ch.wi, 3, save.difficulty, ch.day, { L: ch.L }) : generateLevel(wi, li, save.difficulty, 0);
  if (ch) current = { wi: ch.wi, li: 3, challenge: true };
  sim = new Sim(level, playerStats());
  targetX = 0;
  renderer.camInit = false;
  renderer.load(sim);
  const w = tw(level.wi);
  $('#hud-world').textContent = w.name;
  $('#hud-lvl').textContent = `${ch ? 'Daily Challenge' : `Level ${li + 1}/${LEVELS_PER_WORLD}`} - ${DIFFICULTIES.find((d) => d.id === save.difficulty).name}`;
  $('#hud-coins').textContent = '0';
  const mod = $('#world-mod');
  mod.textContent = w.desc;
  mod.style.opacity = 1;
  setTimeout(() => (mod.style.opacity = 0), 4500);
  $('#hint').classList.toggle('hidden', save.progress > 2);
  hintTimer = 0;
  updateWeaponHud();
  tut = !save.tutorialDone && wi === 0 && li === 0 ? { step: 0, showing: 0, slow: 0, dragged: 0, cur: null } : null;
  coachEl().classList.remove('show');
  $('#world-mod').style.visibility = '';
  if (tut) $('#hint').classList.add('hidden');
  hideAll();
  paused = false;
  lastT = performance.now();
}

function updateWeaponHud() {
  $('#hud-weapon').textContent = sim.weapon.name;
  const parts = [];
  if (sim.dmgMult > 1.001) parts.push(`DMG x${sim.dmgMult.toFixed(2)}`);
  if (sim.rateMult > 1.001) parts.push(`RATE x${sim.rateMult.toFixed(2)}`);
  $('#hud-mults').textContent = parts.join('  ');
}

function popText(text, cls, x, y, z) {
  const [sx, sy] = renderer.project(x, y, z);
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  overlay.appendChild(el);
  // keep the whole text on screen even when the source is near an edge
  const half = el.offsetWidth / 2 + 8;
  const cx = Math.max(half, Math.min(window.innerWidth - half, sx));
  const cy = Math.max(120, Math.min(window.innerHeight - 120, sy));
  el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  setTimeout(() => el.remove(), 1000);
}

function handleSimEvents() {
  const evs = sim.events;
  if (!evs.length) return;
  renderer.handleEvents(evs, popText);
  let weaponChanged = false;
  for (const ev of evs) {
    switch (ev.type) {
      case 'shot': sfx.shot(ev.w); break;
      case 'boom': sfx.boom(); vibrate(30); break;
      case 'gate': ev.good ? sfx.good() : (sfx.bad(), vibrate(60)); weaponChanged = true; break;
      case 'weapon': case 'hero': sfx.weapon(); weaponChanged = true; vibrate(40); break;
      case 'powerup': case 'allies': sfx.good(); weaponChanged = true; break;
      case 'unlock': sfx.unlockReward(); vibrate(25); break;
      case 'collect': sfx.good(); break;
      case 'bossAttack': sfx.warning(); break;
      case 'bossImpact': sfx.stomp(); vibrate(ev.hit ? 150 : 40); break;
      case 'bossPhase': sfx.bad(); vibrate(80); break;
      case 'stageClear': sfx.win(); vibrate(60); break;
      case 'bonusStep': sfx.pickup(true); vibrate(20); break;
      case 'bossExposed': sfx.unlockReward(); break;
      case 'pickup': sfx.pickup(ev.e.big); break;
      case 'kill': if (!ev.clash) sfx.kill(); break;
      case 'coin': sfx.coin(); $('#hud-coins').textContent = sim.coins; break;
      case 'crash': case 'burn': sfx.crash(); vibrate(80); break;
      case 'clash': sfx.clash(); vibrate(40); break;
      case 'stomp': sfx.stomp(); vibrate(120); break;
      case 'bossDown': sfx.boom(); vibrate(200); break;
      case 'destroy': if (ev.e.type !== 'barrel') sfx.crash(); else { sfx.boom(); vibrate(30); } break;
      case 'won': case 'lost': {
        const s = sim; // ignore if the player restarted before the timer fired
        const won = ev.type === 'won';
        setTimeout(() => { if (sim === s) finish(won); }, won ? 1400 : 900);
        won ? sfx.win() : sfx.lose();
        break;
      }
    }
  }
  if (weaponChanged) updateWeaponHud();
  if (window.__game.onEvents) window.__game.onEvents(evs, sim);
  evs.length = 0;
}

function finish(won) {
  if (!sim) return;
  const { wi, li } = current;
  const L = levelIndex(wi, li);
  const diff = DIFFICULTIES.find((d) => d.id === save.difficulty);
  const stars = sim.stars();
  const bonusMult = won && sim.bonus ? sim.bonus.mult : 1;
  const survivors = won ? (sim.finalN ?? sim.n) : 0;
  const challenge = current.challenge;
  const firstChallengeWin = challenge && won && save.challenge.last !== today();
  const coins = Math.round(levelCoins({
    won, L: sim.level.L, kills: sim.kills, survivors, stars, bonusMult, distFrac: sim.d / sim.level.length,
    pickedCoins: sim.coins, diffCoin: diff.coin, incomeLvl: upLvl('income'),
  }) * (firstChallengeWin ? 1.5 : 1));
  save.coins += coins;
  const st = save.stats;
  st.levelsPlayed++;
  if (won) st.levelsWon++;
  st.kills += sim.kills;
  st.bossesKilled += sim.bosses.filter((b) => !b.alive).length;
  st.bestArmy = Math.max(st.bestArmy, sim.peak);
  st.playSeconds += Math.round(sim.t);
  st.coinsEarned += coins;
  if (won) save.tutorialDone = true;
  coachEl().classList.remove('show');
  if (firstChallengeWin) { save.challenge.last = today(); save.challenge.wins++; }
  if (won && !challenge) {
    if (L === save.progress) save.progress = Math.min(TOTAL_LEVELS, L + 1);
    const k = starKey(wi, li, save.difficulty);
    save.stars[k] = Math.max(save.stars[k] || 0, stars);
  }
  persist();
  $('#res-title').textContent = won ? (firstChallengeWin ? 'Challenge complete!' : 'Victory!') : 'Defeated';
  $('#res-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
  $('#res-surv').textContent = won ? `${fmt(survivors)} (peak ${fmt(sim.peak)})` : '0';
  $('#res-bonus').textContent = won ? `x${bonusMult}` : '-';
  $('#res-kills').textContent = fmt(sim.kills);
  $('#res-weapon').textContent = sim.weapon.name;
  $('#res-coins').textContent = '+' + fmt(coins);
  const note = resultNote(won, challenge, wi, li, L);
  $('#res-note').innerHTML = note;
  $('#res-note').classList.toggle('hidden', !note);
  $('#btn-res-upgrades').classList.toggle('hidden', won || !UPGRADES.some((u) => upLvl(u.id) < u.max && save.coins >= upgradeCost(u, upLvl(u.id))));
  const hasNext = won && !challenge && L + 1 < TOTAL_LEVELS;
  $('#btn-next').classList.toggle('hidden', !hasNext);
  $('#btn-retry').classList.toggle('primary', !won);
  paused = true;
  show('result');
}

// Short text under the results: what to try after a defeat, or a milestone after a win.
function resultNote(won, challenge, wi, li, L) {
  if (!won) {
    const b = sim.boss;
    const affordable = UPGRADES.some((u) => upLvl(u.id) < u.max && save.coins >= upgradeCost(u, upLvl(u.id)));
    let tip;
    if (b && b.alive && b.engaged) tip = 'Steer out of the <b>red zones</b> before the boss attack lands, and keep firing at the glowing weak spot for double damage.';
    else if (sim.peak < 40) tip = 'Your army stayed small. Shoot the blue <b>+ gates</b> to raise them before you run through, and free prisoners from cages.';
    else tip = 'Big squads charge from 75 m. Line up with them early so your whole army fires, and grab weapon boards for more damage.';
    if (affordable) tip += ' You can afford an <b>upgrade</b> now.';
    else if (save.difficulty !== 'recruit') tip += ' Stuck? Pick an easier difficulty on the menu.';
    return tip;
  }
  if (challenge) return '';
  if (L === TOTAL_LEVELS - 1) {
    return `<b>You beat all ${WORLDS.length} worlds!</b> Thank you for playing Army Rush. Try a harder difficulty for more coins and new stars.<br><small>Made with Three.js and Capacitor.</small>`;
  }
  if (li === LEVELS_PER_WORLD - 1) return `<b>${tw(wi).name} complete!</b> ${tw(wi + 1).name} is now open.`;
  return '';
}

// Theme picker: changes the look of the whole game (players, enemies, bosses, stadiums, names).
function renderThemes() {
  const list = $('#theme-list');
  list.innerHTML = '';
  for (const th of THEMES) {
    const card = document.createElement('button');
    card.className = 'card theme-card' + (save.theme === th.id ? ' on' : '');
    card.innerHTML = `<div class="theme-swatch" style="background:linear-gradient(135deg, ${th.swatch[0]} 0 50%, ${th.swatch[1]} 50% 100%)"></div>
      <div class="theme-meta"><h3>${th.name}</h3><div class="up-desc">${th.desc}</div><div class="theme-worlds">${WORLDS.map((_, wi) => themedWorld(wi, th.id).name).slice(0, 3).join(' &bull; ')} &bull; ...</div></div>
      <span class="theme-pick">${save.theme === th.id ? 'Selected' : 'Choose'}</span>`;
    card.onclick = () => {
      save.theme = th.id;
      renderer.setTheme(th.id);
      persist();
      sfx.good();
      applyThemeToMenu();
      renderThemes();
    };
    list.appendChild(card);
  }
}
function applyThemeToMenu() {
  const th = themeById(save.theme);
  $('#menu-subtitle').textContent = th.id === 'classic' ? 'Worlds at War' : `${th.name} edition`;
  document.body.dataset.theme = th.id;
}
applyThemeToMenu();

$('#btn-res-upgrades').onclick = () => { sfx.click(); show('upgrades'); };
function renderPauseToggles() {
  $('#pause-sound').textContent = `Sound: ${save.sound ? 'On' : 'Off'}`;
  $('#pause-music').textContent = `Music: ${save.music ? 'On' : 'Off'}`;
}
$('#pause-sound').onclick = () => { save.sound = !save.sound; sfx.enabled = save.sound; persist(); renderPauseToggles(); };
$('#pause-music').onclick = () => { save.music = !save.music; music.setEnabled(save.music); persist(); renderPauseToggles(); };

$('#btn-play').onclick = () => { const n = nextLevel(); startLevel(n.wi, n.li); };
$('#btn-pause').onclick = () => { if (sim && sim.state === 'run') { paused = true; renderPauseToggles(); show('pause'); } };
$('#btn-resume').onclick = () => { hideAll(); paused = false; lastT = performance.now(); };
$('#btn-restart').onclick = () => startLevel(current.wi, current.li, { challenge: current.challenge });
$('#btn-quit').onclick = () => { paused = true; show('menu'); };
$('#btn-retry').onclick = () => startLevel(current.wi, current.li, { challenge: current.challenge });
$('#btn-challenge').onclick = () => { sfx.click(); startLevel(0, 0, { challenge: true }); };
$('#btn-menu').onclick = () => show('menu');
$('#btn-next').onclick = () => {
  let L = levelIndex(current.wi, current.li) + 1;
  startLevel(Math.floor(L / LEVELS_PER_WORLD), L % LEVELS_PER_WORLD);
};

// ------------------------------------------------------------------ input
let dragging = false;
let dragStartX = 0;
let dragStartTarget = 0;
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  dragging = true;
  dragStartX = e.clientX;
  dragStartTarget = targetX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const sens = 15 / Math.min(window.innerWidth, 600);
  const nx = Math.max(-6, Math.min(6, dragStartTarget + (e.clientX - dragStartX) * sens));
  if (tut) tut.dragged += Math.abs(nx - targetX);
  targetX = nx;
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key));
window.addEventListener('keyup', (e) => keys.delete(e.key));

// ------------------------------------------------------------------ tutorial (first level only)
const coachEl = () => document.getElementById('coach');
let tut = null;
// Each step shows when `when` becomes true and stays up until the player has done it (`done`)
// or `max` seconds pass, so nobody gets rushed past an instruction.
const TUT_STEPS = [
  { id: 'steer', text: 'Drag left and right to steer your army', when: (s) => s.t > 0.5, done: () => tut.dragged > 4, max: 12 },
  { id: 'gate', text: 'Blue gates add soldiers. Keep shooting a gate to make its number bigger!', when: (s) => s.ents.some((e) => e.type === 'gate' && e.alive && e.d - s.d < 38 && e.d > s.d), done: (s) => !s.ents.some((e) => e.type === 'gate' && e.alive && e.d > s.d && e.d - s.d < 38), max: 8 },
  { id: 'board', text: 'Get in a board\'s lane and shoot it to 0 to win that weapon', when: (s) => s.ents.some((e) => e.type === 'board' && e.alive && e.d - s.d < 45 && e.d > s.d), done: (s) => !s.ents.some((e) => e.type === 'board' && e.alive && !e.unlocked && e.d > s.d && e.d - s.d < 45), max: 8 },
  { id: 'squad', text: 'Enemies charge at you! Shoot them down before they reach you', when: (s) => s.ents.some((e) => e.type === 'squad' && e.alive && e.charging), max: 3.5 },
  { id: 'boss', text: 'Red zone = attack incoming. Steer out of it!', when: (s) => !!s.boss.atk, done: (s) => !s.boss.atk, max: 5 },
  { id: 'weak', text: 'The glowing core is exposed: double damage now!', when: (s) => s.boss.exposed > 0, max: 3 },
];
function tutorialTick(dt) {
  if (!tut) return 1;
  if (tut.cur) {
    tut.showing += dt;
    const st = tut.cur;
    if (tut.showing >= st.max || (tut.showing > 1.2 && st.done && st.done(sim))) {
      coachEl().classList.remove('show');
      $('#world-mod').style.visibility = '';
      tut.cur = null;
    }
  }
  const next = TUT_STEPS[tut.step];
  if (next && !tut.cur && next.when(sim)) {
    coachEl().textContent = next.text;
    coachEl().classList.add('show');
    $('#world-mod').style.visibility = 'hidden'; // the coach bubble sits in the same spot
    tut.cur = next;
    tut.showing = 0;
    if (next.id === 'steer') tut.dragged = 0;
    tut.slow = 1.2;
    tut.step++;
  }
  if (tut.slow > 0) { tut.slow -= dt; return 0.45; } // brief slow-motion so there's time to read
  return 1;
}

function pauseGame() {
  if (sim && !paused && sim.state === 'run') { paused = true; renderPauseToggles(); show('pause'); }
}
// pause when the app goes to the background
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// Android back button: close the current screen, pause a running level, or leave the app.
function handleBack() {
  if (screen === 'game') return pauseGame();
  if (screen === 'pause') return $('#btn-resume').click();
  if (screen === 'menu') {
    try { App.exitApp(); } catch { /* not on Android */ }
    return;
  }
  sfx.click();
  if (screen === 'result') return show('menu');
  show('menu');
}
try {
  App.addListener('backButton', handleBack);
  App.addListener('appStateChange', ({ isActive }) => { if (!isActive) { pauseGame(); persist(); } });
} catch { /* web build without the native bridge */ }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') handleBack(); });

// ------------------------------------------------------------------ loop
let errorCount = 0;
function recover(err) {
  console.error(err);
  errorCount++;
  paused = true;
  sim = null;
  try { show('menu'); } catch { /* ignore */ }
  toast(errorCount > 3 ? 'Something keeps going wrong. Try lowering Graphics in Settings.' : 'Something went wrong. Back to the menu, your progress is saved.');
}
window.addEventListener('error', (e) => { if (sim && !paused) recover(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => console.error(e.reason));

function frame(now) {
  requestAnimationFrame(frame);
  try {
    tick(now);
  } catch (err) {
    recover(err);
  }
}

function tick(now) {
  const rawDt = Math.min(0.1, (now - lastT) / 1000);
  if (window.__game.onFrame) window.__game.onFrame(rawDt);
  let dt = rawDt * timeScale;
  lastT = now;
  if (sim && !paused) {
    const kx = targetX;
    if (keys.has('ArrowLeft') || keys.has('a')) targetX = Math.max(-6, targetX - dt * 12);
    if (keys.has('ArrowRight') || keys.has('d')) targetX = Math.min(6, targetX + dt * 12);
    if (tut) tut.dragged += Math.abs(targetX - kx);
    if (autoplay) targetX = botTarget(sim);
    // step the simulation by the real frame time (smooth on 60/90/120 Hz screens)
    let left = dt * tutorialTick(dt);
    while (left > 1e-4) {
      const step = Math.min(left, 1 / 50);
      sim.update(step, targetX);
      left -= step;
    }
    // danger warning when a big horde is charging you
    const danger = Math.min(1, sim.danger || 0);
    dangerEl.style.opacity = danger > 0.15 ? (0.35 + 0.65 * danger) * (0.75 + 0.25 * Math.sin(now / 90)) : 0;
    if (danger > 0.45 && now - lastWarn > 1300) { lastWarn = now; sfx.warning(); vibrate(20); }
    // if the phone can't keep up, drop the render resolution once
    slowFrames = dt > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && renderer.lowerResolution()) slowFrames = 0;
    handleSimEvents();
    if ($('#hud-weapon').textContent !== sim.weapon.name) updateWeaponHud();
    music.play(current.wi, sim.boss.awake && sim.boss.alive ? 'boss' : 'run');
    hintTimer += dt;
    if (hintTimer > 5) $('#hint').classList.add('hidden');
  }
  if (sim && (!paused || renderer.time === 0)) renderer.render(paused ? 0 : dt);
}

// attract mode behind the menu: show world 1
sim = new Sim(generateLevel(0, 0, 'soldier', 0), playerStats());
current = { wi: 0, li: 0 };
renderer.load(sim);
renderer.render(0);
sim = null;
show('menu');
checkDaily();
restoreBackup();
requestAnimationFrame(frame);

// expose for automated testing
window.__game = { get sim() { return sim; }, renderer, startLevel, get save() { return save; }, setAutoplay: (v) => (autoplay = v), setTarget: (x) => (targetX = x), botTarget };
