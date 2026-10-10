// Headless balance test: a bot plays each level. Usage: node tools/balance.mjs [difficulty] [upgradeLevel] [weapon]
import { generateLevel, Sim, botTarget } from '../src/sim.js';
import { WORLDS, LEVELS_PER_WORLD } from '../src/data.js';
const diff = process.argv[2] || 'soldier';
const up = +(process.argv[3] ?? 0);
const weapon = process.argv[4] || 'pistol';
const rows = [];
let wins = 0, total = 0;
for (let wi = 0; wi < WORLDS.length; wi++) for (let li = 0; li < LEVELS_PER_WORLD; li++) {
  let res = [];
  for (let seed = 0; seed < 3; seed++) {
    const lvl = generateLevel(wi, li, diff, seed);
    const sim = new Sim(lvl, { startTroops: 10 + 2 * up, weapon, dmgMult: 1 + 0.06 * up, rateMult: 1 + 0.04 * up, armor: Math.min(0.45, 0.03 * up) });
    let tx = 0, t = 0;
    while (sim.state === 'run' && t < 400) { if (Math.round(t * 60) % 6 === 0) tx = botTarget(sim); sim.update(1 / 60, tx); sim.events.length = 0; t += 1 / 60; }
    res.push({ s: sim.state, n: sim.n, peak: sim.peak, w: sim.weapon.id, bossHp: Math.round(sim.boss.hp), bossMax: sim.boss.maxHp, t: Math.round(t) });
    total++; if (sim.state === 'won') wins++;
  }
  rows.push(`${WORLDS[wi].id.padEnd(8)} L${li + 1} ` + res.map(r => `${r.s === 'won' ? 'WIN ' : 'LOSE'} n=${String(r.n).padStart(4)} pk=${String(r.peak).padStart(4)} ${r.w.padEnd(7)} boss ${r.bossHp}/${r.bossMax} ${r.t}s`).join(' | '));
}
console.log(rows.join('\n'));
console.log(`diff=${diff} up=${up} weapon=${weapon}: ${wins}/${total} wins`);
