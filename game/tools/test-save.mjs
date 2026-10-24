// Save data tests: corrupted, old and hostile saves are repaired; daily reward rules.
import assert from 'node:assert/strict';
import { sanitize, defaults, loadSave, dailyStatus, SAVE_KEY } from '../src/save.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

// empty / garbage
assert.deepEqual(sanitize(null), defaults());
assert.deepEqual(loadSave(mem()), defaults());
const bad = mem({ [SAVE_KEY]: '{not json' });
assert.deepEqual(loadSave(bad), defaults());
assert.ok([...bad.m.keys()].some((k) => k.startsWith(SAVE_KEY + '.corrupt.')), 'corrupt save is backed up');

// v1 save (no version, no stats) keeps progress
const v1 = { coins: 1234, progress: 7, stars: { '0-1-soldier': 3 }, upgrades: { troops: 4 }, owned: ['pistol', 'smg'], equipped: 'smg', difficulty: 'veteran', sound: false, vibe: true, quality: 'low' };
const s1 = sanitize(v1);
assert.equal(s1.coins, 1234); assert.equal(s1.progress, 7); assert.equal(s1.stars['0-1-soldier'], 3);
assert.equal(s1.upgrades.troops, 4); assert.equal(s1.equipped, 'smg'); assert.equal(s1.difficulty, 'veteran');
assert.equal(s1.sound, false); assert.equal(s1.quality, 'low'); assert.equal(s1.tutorialDone, true);
assert.equal(s1.stats.kills, 0);

// hostile values are clamped / dropped
const h = sanitize({ coins: -5, progress: 999, upgrades: { troops: 1e9, hack: 5 }, owned: ['railgun', 'nuke'], equipped: 'nuke', difficulty: 'god', quality: 'ultra', stars: { 'x': 9, '1-2-recruit': 99 } });
assert.equal(h.coins, 0); assert.equal(h.progress, 40); assert.equal(h.upgrades.troops, 25); assert.equal(h.upgrades.hack, undefined);
assert.deepEqual(h.owned, ['pistol', 'railgun']); assert.equal(h.equipped, 'pistol'); assert.equal(h.difficulty, 'soldier');
assert.equal(h.quality, 'high'); assert.equal(h.stars.x, undefined); assert.equal(h.stars['1-2-recruit'], 3);

// daily reward
const d = defaults();
let st = dailyStatus(d, '2026-10-11');
assert.equal(st.claimable, true); assert.equal(st.streak, 1);
d.daily = { last: '2026-10-11', streak: 1 };
assert.equal(dailyStatus(d, '2026-10-11').claimable, false);
assert.equal(dailyStatus(d, '2026-10-12').streak, 2);
assert.equal(dailyStatus(d, '2026-10-14').streak, 1);
d.daily = { last: '2026-12-31', streak: 5 };
assert.equal(dailyStatus(d, '2027-01-01').streak, 6, 'streak continues across a year boundary');
// visual theme
assert.equal(sanitize({ theme: 'bitcoin' }).theme, 'bitcoin');
assert.equal(sanitize({ theme: 'footy' }).theme, 'footy');
assert.equal(sanitize({ theme: 'nfl-official' }).theme, 'classic', 'unknown theme falls back to classic');
assert.equal(defaults().theme, 'classic');
// every theme names all 8 worlds and their bosses
const { THEMES, themedWorld } = await import('../src/themes.js');
const { WORLDS } = await import('../src/data.js');
for (const th of THEMES) for (let wi = 0; wi < WORLDS.length; wi++) {
  const w = themedWorld(wi, th.id);
  assert.ok(w.name && w.boss.name && w.mod === WORLDS[wi].mod, `${th.id} world ${wi + 1}`);
}
console.log('Save tests OK');
