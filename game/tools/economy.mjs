// Career economy check: a bot plays every level in order on one difficulty, keeps the coins it
// earns (same formula as the game), buys upgrades/weapons greedily between levels and retries
// on a loss. Shows where progress stalls and how many attempts each world takes.
// Usage: node tools/economy.mjs [difficulty] [skill]   skill 0..1 (default 1 = perfect bot steering
// every 0.1 s; below 1 = decides every 0.4 s and picks a random position with probability 1 - skill)
import { generateLevel, Sim, botTarget } from '../src/sim.js';
import { WORLDS, WEAPONS, DIFFICULTIES, UPGRADES, LEVELS_PER_WORLD, upgradeCost } from '../src/data.js';
import { levelCoins } from '../src/economy.js';

const diffId = process.argv[2] || 'soldier';
const skill = +(process.argv[3] ?? 1);
const diff = DIFFICULTIES.find((d) => d.id === diffId);
const up = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
const owned = new Set(['pistol']);
let equipped = 'pistol';
let coins = 0;
let attemptsTotal = 0;
const rows = [];
const unlockLevel = (w) => Math.min(39, w.tier * 4);

function shop(L) {
  // buy the best weapon you can afford, then spend the rest on the cheapest upgrade
  for (const w of [...WEAPONS].reverse()) {
    if (!owned.has(w.id) && L >= unlockLevel(w) && coins >= w.price && w.tier > WEAPONS.find((x) => x.id === equipped).tier) {
      coins -= w.price; owned.add(w.id); equipped = w.id; break;
    }
  }
  for (;;) {
    const opts = UPGRADES.filter((u) => up[u.id] < u.max).map((u) => [u, upgradeCost(u, up[u.id])]).sort((a, b) => a[1] - b[1]);
    if (!opts.length || coins < opts[0][1]) break;
    coins -= opts[0][1];
    up[opts[0][0].id]++;
  }
}

for (let L = 0; L < WORLDS.length * LEVELS_PER_WORLD; L++) {
  const wi = Math.floor(L / LEVELS_PER_WORLD), li = L % LEVELS_PER_WORLD;
  let attempts = 0, won = false;
  while (!won && attempts < 15) {
    attempts++;
    shop(L);
    const lvl = generateLevel(wi, li, diffId, attempts - 1);
    const sim = new Sim(lvl, { startTroops: 10 + 2 * up.troops, weapon: equipped, dmgMult: 1 + 0.06 * up.damage, rateMult: 1 + 0.04 * up.rate, armor: Math.min(0.45, 0.03 * up.armor) });
    let tx = 0;
    for (let f = 0; sim.state === 'run' && f < 60 * 600; f++) {
      // a person: decides every ~0.4 s, and with probability (1 - skill) makes a poor choice
      if (f % (skill >= 1 ? 6 : 24) === 0) tx = Math.random() < skill ? botTarget(sim) : (Math.random() - 0.5) * 10;
      sim.update(1 / 60, tx);
      sim.events.length = 0;
    }
    won = sim.state === 'won';
    coins += levelCoins({ won, L, kills: sim.kills, survivors: won ? (sim.finalN ?? sim.n) : 0, stars: sim.stars(), bonusMult: won && sim.bonus ? sim.bonus.mult : 1, distFrac: sim.d / lvl.length, pickedCoins: sim.coins, diffCoin: diff.coin, incomeLvl: up.income });
  }
  attemptsTotal += attempts;
  rows.push({ L, attempts, won, coins, equipped, up: { ...up } });
  if (li === LEVELS_PER_WORLD - 1 || !won) {
    const w = rows.filter((r) => Math.floor(r.L / LEVELS_PER_WORLD) === wi);
    console.log(`World ${wi + 1}: attempts per level [${w.map((r) => r.attempts).join(', ')}], weapon ${equipped}, upgrades ${JSON.stringify(up)}, coins in hand ${coins}`);
  }
  if (!won) { console.log(`STALLED at ${wi + 1}-${li + 1} after 15 attempts`); break; }
}
console.log(`difficulty=${diffId} skill=${skill}: ${rows.filter((r) => r.won).length}/40 levels cleared in ${attemptsTotal} attempts`);
