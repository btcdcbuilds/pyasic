// Save data: versioned, validated and repaired on load so a corrupted or old save can never
// break the game. Pure functions (plus localStorage helpers) so it can be tested in Node.
import { WORLDS, WEAPONS, DIFFICULTIES, UPGRADES, LEVELS_PER_WORLD } from './data.js';

export const SAVE_KEY = 'armyrush.save.v1';
export const SAVE_VERSION = 2;
const TOTAL_LEVELS = WORLDS.length * LEVELS_PER_WORLD;

export const defaults = () => ({
  version: SAVE_VERSION,
  coins: 0,
  progress: 0,
  stars: {},
  upgrades: {},
  owned: ['pistol'],
  equipped: 'pistol',
  difficulty: 'soldier',
  sound: true,
  music: true,
  vibe: true,
  quality: 'high',
  tutorialDone: false,
  stats: { kills: 0, levelsWon: 0, levelsPlayed: 0, bossesKilled: 0, bestArmy: 0, playSeconds: 0, coinsEarned: 0 },
  daily: { last: '', streak: 0 },
});

const int = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

// Repair anything missing, wrong-typed or out of range. Unknown keys are dropped.
export function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = d;
  s.coins = int(raw.coins, 0, 1e12, 0);
  s.progress = int(raw.progress, 0, TOTAL_LEVELS, 0);
  if (raw.stars && typeof raw.stars === 'object') {
    for (const [k, v] of Object.entries(raw.stars)) {
      if (/^\d+-\d+-[a-z]+$/.test(k)) s.stars[k] = int(v, 0, 3, 0);
    }
  }
  if (raw.upgrades && typeof raw.upgrades === 'object') {
    for (const u of UPGRADES) s.upgrades[u.id] = int(raw.upgrades[u.id], 0, u.max, 0);
  }
  const ids = new Set(WEAPONS.map((w) => w.id));
  s.owned = Array.isArray(raw.owned) ? [...new Set(['pistol', ...raw.owned.filter((w) => ids.has(w))])] : ['pistol'];
  s.equipped = s.owned.includes(raw.equipped) ? raw.equipped : 'pistol';
  s.difficulty = DIFFICULTIES.some((x) => x.id === raw.difficulty) ? raw.difficulty : 'soldier';
  s.sound = bool(raw.sound, true);
  s.music = bool(raw.music, true);
  s.vibe = bool(raw.vibe, true);
  s.quality = ['high', 'medium', 'low'].includes(raw.quality) ? raw.quality : 'high';
  s.tutorialDone = bool(raw.tutorialDone, s.progress > 0);
  const st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  for (const k of Object.keys(s.stats)) s.stats[k] = int(st[k], 0, 1e12, 0);
  const dl = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
  s.daily.last = typeof dl.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dl.last) ? dl.last : '';
  s.daily.streak = int(dl.streak, 0, 10000, 0);
  return s;
}

export function loadSave(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage && storage.getItem(SAVE_KEY);
  } catch { /* storage unavailable */ }
  if (!raw) return defaults();
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    // unreadable: keep a copy for recovery and start fresh
    try { storage.setItem(`${SAVE_KEY}.corrupt.${Date.now()}`, raw); } catch { /* ignore */ }
    return defaults();
  }
}

export function persistSave(save, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// Daily reward: claimable once per calendar day; the streak grows on consecutive days.
export function dailyStatus(save, today) {
  const last = save.daily.last;
  if (last === today) return { claimable: false, streak: save.daily.streak };
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const streak = last === yesterday ? save.daily.streak + 1 : 1;
  return { claimable: true, streak, reward: dailyReward(streak, save.progress) };
}

export function dailyReward(streak, progress) {
  return Math.round((60 + progress * 12) * Math.min(3, 1 + (streak - 1) * 0.25));
}
