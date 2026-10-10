import { WORLDS, WEAPONS, DIFFICULTIES, UPGRADES, LEVELS_PER_WORLD, upgradeCost, weaponById, weaponDps } from './data.js';
import { generateLevel, Sim, levelIndex, botTarget } from './sim.js';
import { Renderer, fmt } from './render.js';
import { Sfx } from './audio.js';
import { drawWeaponIcon } from './icons.js';

// ------------------------------------------------------------------ save data
const SAVE_KEY = 'armyrush.save.v1';
const defaults = () => ({
  coins: 0, progress: 0, stars: {}, upgrades: {}, owned: ['pistol'], equipped: 'pistol',
  difficulty: 'soldier', sound: true, vibe: true, quality: 'high',
});
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return defaults();
}
let save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
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
renderer.setQuality(save.quality);
const sfx = new Sfx();
sfx.enabled = save.sound;

let sim = null;
let current = null; // { wi, li }
let targetX = 0;
let paused = true;
let acc = 0;
let lastT = performance.now();
let hintTimer = 0;
let autoplay = new URLSearchParams(location.search).has('autoplay');

function vibrate(ms) {
  if (save.vibe && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------------ screens
const screens = ['menu', 'worlds', 'armory', 'upgrades', 'settings', 'pause', 'result'];
function show(name) {
  for (const s of screens) $('#scr-' + s).classList.toggle('hidden', s !== name);
  $('#hud').classList.toggle('hidden', !!name && name !== 'pause' && name !== 'result');
  if (name === 'menu') renderMenu();
  if (name === 'worlds') renderWorlds();
  if (name === 'armory') renderArmory();
  if (name === 'upgrades') renderUpgrades();
  if (name === 'settings') renderSettings();
  $$('.coins-total').forEach((el) => (el.textContent = fmt(save.coins)));
}
function hideAll() {
  for (const s of screens) $('#scr-' + s).classList.add('hidden');
  $('#hud').classList.remove('hidden');
}
document.addEventListener('click', (ev) => {
  sfx.unlock();
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

function renderMenu() {
  const n = nextLevel();
  $('#play-sub').textContent = `${WORLDS[n.wi].name} - Level ${n.li + 1}`;
  diffButtons($('#menu-diff'));
}

function starKey(wi, li, d) { return `${wi}-${li}-${d}`; }

function renderWorlds() {
  diffButtons($('#worlds-diff'));
  const list = $('#world-list');
  list.innerHTML = '';
  WORLDS.forEach((w, wi) => {
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
  return bar('Power', weaponDps(w) / maxDps) + bar('Rate', w.rate / 11) + bar('Range', w.range / 46) +
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
      const wi = Math.floor(need / LEVELS_PER_WORLD);
      b.textContent = `W${wi + 1}-${(need % LEVELS_PER_WORLD) + 1}`;
      b.disabled = true;
    } else {
      b.innerHTML = fmt(w.price);
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
    b.textContent = maxed ? 'MAX' : fmt(cost);
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
  $('#set-sound').textContent = save.sound ? 'On' : 'Off';
  $('#set-vibe').textContent = save.vibe ? 'On' : 'Off';
  $('#set-quality').textContent = { high: 'High', medium: 'Medium', low: 'Low' }[save.quality];
}
$('#set-sound').onclick = () => { save.sound = !save.sound; sfx.enabled = save.sound; persist(); renderSettings(); };
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

function startLevel(wi, li) {
  current = { wi, li };
  const level = generateLevel(wi, li, save.difficulty, 0);
  sim = new Sim(level, playerStats());
  targetX = 0;
  renderer.camInit = false;
  renderer.load(sim);
  const w = WORLDS[wi];
  $('#hud-world').textContent = w.name;
  $('#hud-lvl').textContent = `Level ${li + 1}/${LEVELS_PER_WORLD} - ${DIFFICULTIES.find((d) => d.id === save.difficulty).name}`;
  $('#hud-coins').textContent = '0';
  const mod = $('#world-mod');
  mod.textContent = w.desc;
  mod.style.opacity = 1;
  setTimeout(() => (mod.style.opacity = 0), 4500);
  $('#hint').classList.toggle('hidden', save.progress > 2);
  hintTimer = 0;
  updateWeaponHud();
  hideAll();
  paused = false;
  acc = 0;
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
  el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
  overlay.appendChild(el);
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
      case 'coin': sfx.coin(); $('#hud-coins').textContent = sim.coins; break;
      case 'crash': case 'burn': sfx.crash(); vibrate(80); break;
      case 'clash': sfx.clash(); vibrate(40); break;
      case 'stomp': sfx.stomp(); vibrate(120); break;
      case 'bossDown': sfx.boom(); vibrate(200); break;
      case 'destroy': if (ev.e.type !== 'barrel') sfx.crash(); break;
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
  evs.length = 0;
}

function finish(won) {
  if (!sim) return;
  const { wi, li } = current;
  const L = levelIndex(wi, li);
  const diff = DIFFICULTIES.find((d) => d.id === save.difficulty);
  const income = 1 + 0.1 * upLvl('income');
  const stars = sim.stars();
  let coins;
  if (won) {
    coins = (25 + L * 8 + sim.kills * 0.15 + sim.n * 0.25) * (1 + 0.25 * (stars - 1));
  } else {
    coins = (8 + L * 2 + sim.kills * 0.08) * Math.min(1, sim.d / sim.level.length);
  }
  coins = Math.round(coins * diff.coin * income) + sim.coins;
  save.coins += coins;
  if (won) {
    if (L === save.progress) save.progress = Math.min(TOTAL_LEVELS, L + 1);
    const k = starKey(wi, li, save.difficulty);
    save.stars[k] = Math.max(save.stars[k] || 0, stars);
  }
  persist();
  $('#res-title').textContent = won ? 'Victory!' : 'Defeated';
  $('#res-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
  $('#res-surv').textContent = won ? `${fmt(sim.n)} (peak ${fmt(sim.peak)})` : '0';
  $('#res-kills').textContent = fmt(sim.kills);
  $('#res-weapon').textContent = sim.weapon.name;
  $('#res-coins').textContent = '+' + fmt(coins);
  const hasNext = won && L + 1 < TOTAL_LEVELS;
  $('#btn-next').classList.toggle('hidden', !hasNext);
  $('#btn-retry').classList.toggle('primary', !won);
  paused = true;
  show('result');
}

$('#btn-play').onclick = () => { const n = nextLevel(); startLevel(n.wi, n.li); };
$('#btn-pause').onclick = () => { if (sim && sim.state === 'run') { paused = true; show('pause'); } };
$('#btn-resume').onclick = () => { hideAll(); paused = false; lastT = performance.now(); };
$('#btn-restart').onclick = () => startLevel(current.wi, current.li);
$('#btn-quit').onclick = () => { paused = true; show('menu'); };
$('#btn-retry').onclick = () => startLevel(current.wi, current.li);
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
  const sens = 13 / Math.min(window.innerWidth, 600);
  targetX = Math.max(-5, Math.min(5, dragStartTarget + (e.clientX - dragStartX) * sens));
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key));
window.addEventListener('keyup', (e) => keys.delete(e.key));

// pause when the app goes to the background
document.addEventListener('visibilitychange', () => {
  if (document.hidden && sim && !paused && sim.state === 'run') { paused = true; show('pause'); }
});

// ------------------------------------------------------------------ loop
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (sim && !paused) {
    if (keys.has('ArrowLeft') || keys.has('a')) targetX = Math.max(-5, targetX - dt * 10);
    if (keys.has('ArrowRight') || keys.has('d')) targetX = Math.min(5, targetX + dt * 10);
    if (autoplay) targetX = botTarget(sim);
    acc += dt;
    while (acc >= 1 / 60) {
      sim.update(1 / 60, targetX);
      acc -= 1 / 60;
    }
    handleSimEvents();
    if ($('#hud-weapon').textContent !== sim.weapon.name) updateWeaponHud();
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
requestAnimationFrame(frame);

// expose for automated testing
window.__game = { get sim() { return sim; }, startLevel, get save() { return save; }, setAutoplay: (v) => (autoplay = v), botTarget };
