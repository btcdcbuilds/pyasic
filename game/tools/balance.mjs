// Headless balance test: a bot plays each level.
// Usage: node tools/balance.mjs [difficulty] [upgradeLevel|career] [weapon] [--verbose]
// 'career' gives the bot the upgrades/weapon a player would plausibly own at each level
// (upgrade level = L/3, weapon tier = L/6).
import { generateLevel, Sim, botTarget } from '../src/sim.js';
import { WORLDS, WEAPONS, LEVELS_PER_WORLD } from '../src/data.js';
const diff = process.argv[2] || 'soldier';
const career = process.argv[3] === 'career';
const up0 = career ? 0 : +(process.argv[3] ?? 0);
const weapon = process.argv[4] || 'pistol';
const verbose = process.argv.includes('--verbose');
const SEEDS = 3;
let wins = 0, total = 0, runT = 0, bossT = 0, bossN = 0, peakSum = 0, dpsSum = 0, dpsN = 0;
const dpsByL = [];
for (let wi = 0; wi < WORLDS.length; wi++) for (let li = 0; li < LEVELS_PER_WORLD; li++) {
  const res = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const L = wi * LEVELS_PER_WORLD + li;
    const up = career ? Math.floor(L / 3) : up0;
    const wpn = career ? WEAPONS[Math.min(9, Math.floor(L / 6))].id : weapon;
    const lvl = generateLevel(wi, li, diff, seed);
    const sim = new Sim(lvl, { startTroops: 10 + 2 * up, weapon: wpn, dmgMult: 1 + 0.06 * up, rateMult: 1 + 0.04 * up, armor: Math.min(0.45, 0.03 * up) });
    let tx = 0, t = 0, f = 0, bossStart = null;
    while (sim.state === 'run' && t < 600) {
      if (f % 6 === 0) tx = botTarget(sim);
      sim.update(1 / 60, tx); sim.events.length = 0; t += 1 / 60; f++;
      if (bossStart === null && sim.boss.d - sim.d < 34) { bossStart = t; const dps = sim.dps() + sim.heroes * 12 * 16.5 * sim.dmgMult; dpsSum += dps; dpsN++; (dpsByL[wi * 5 + li] ||= []).push(Math.round(dps)); }
    }
    const bt = bossStart === null ? null : t - bossStart;
    res.push({ s: sim.state, n: sim.n, peak: sim.peak, w: sim.weapon.id, boss: Math.round(sim.boss.hp), max: sim.boss.maxHp, t, bt });
    total++; runT += t; peakSum += sim.peak;
    if (sim.state === 'won') { wins++; bossT += bt; bossN++; }
  }
  if (verbose) console.log(`${WORLDS[wi].id.padEnd(8)} L${li + 1} ` + res.map((r) => `${r.s === 'won' ? 'WIN ' : 'LOSE'} n=${String(r.n).padStart(4)} pk=${String(r.peak).padStart(4)} ${r.w.padEnd(7)} boss ${r.boss}/${r.max} ${r.t.toFixed(0)}s fight ${r.bt === null ? '-' : r.bt.toFixed(1)}s`).join(' | '));
}
console.log(`diff=${diff} up=${career ? 'career' : up0} weapon=${career ? 'career' : weapon}: ${wins}/${total} wins, avg level ${(runT / total).toFixed(0)}s, avg boss fight (wins) ${(bossT / Math.max(1, bossN)).toFixed(1)}s, avg peak army ${(peakSum / total).toFixed(0)}`);
if (process.argv.includes('--dps')) console.log(JSON.stringify(dpsByL.map((a) => a && a.sort((x, y) => x - y)[Math.floor(a.length / 2)])));
