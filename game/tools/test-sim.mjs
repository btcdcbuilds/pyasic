// Simulation smoke test: every level on every difficulty generates and plays for a while
// (bot steering) without exceptions, NaN values or broken invariants.
// Usage: node tools/test-sim.mjs   (exit code 1 on failure)
import { generateLevel, Sim, botTarget, HW } from '../src/sim.js';
import { WORLDS, DIFFICULTIES, LEVELS_PER_WORLD, WEAPONS } from '../src/data.js';

let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL ' + msg); };
const finite = (v) => Number.isFinite(v);

for (const diff of DIFFICULTIES) {
  for (let wi = 0; wi < WORLDS.length; wi++) {
    for (let li = 0; li < LEVELS_PER_WORLD; li++) {
      const tag = `${diff.id} ${wi + 1}-${li + 1}`;
      let lvl;
      try {
        lvl = generateLevel(wi, li, diff.id, 1);
      } catch (e) { fail(`${tag}: generateLevel threw ${e.message}`); continue; }
      if (!lvl.bosses.length || !lvl.bosses[lvl.bosses.length - 1].final) fail(`${tag}: no final boss`);
      for (const e of lvl.entities) {
        if (!finite(e.d)) fail(`${tag}: entity ${e.type} has bad d`);
        if (e.x0 !== undefined && !(e.x0 >= -HW - 1e-6 && e.x1 <= HW + 1e-6 && e.x0 < e.x1) && e.type !== 'saw' && e.type !== 'boulder') fail(`${tag}: ${e.type} outside the track`);
      }
      const weapon = WEAPONS[Math.min(9, Math.floor((wi * 5 + li) / 4))].id;
      const sim = new Sim(lvl, { startTroops: 20, weapon, dmgMult: 1.3, rateMult: 1.2, armor: 0.1 });
      let tx = 0;
      try {
        for (let f = 0; f < 60 * 90 && sim.state === 'run'; f++) {
          if (f % 6 === 0) tx = botTarget(sim);
          sim.update(1 / 60, tx);
          sim.events.length = 0;
          if (!finite(sim.n) || !finite(sim.x) || !finite(sim.d) || sim.n < 0) { fail(`${tag}: bad army state n=${sim.n} x=${sim.x} d=${sim.d}`); break; }
          if (Math.abs(sim.x) > HW + 1e-6) { fail(`${tag}: army left the track x=${sim.x}`); break; }
          for (let i = 1; i < sim.ents.length; i++) if (sim.ents[i - 1].d > sim.ents[i].d + 1e-6) { fail(`${tag}: entities out of order at frame ${f}`); i = sim.ents.length; f = 1e9; }
          for (const p of sim.proj) if (!finite(p.x) || !finite(p.d)) { fail(`${tag}: bad projectile`); f = 1e9; break; }
          const b = sim.boss;
          if (!finite(b.hp)) { fail(`${tag}: boss hp NaN`); break; }
        }
      } catch (e) { fail(`${tag}: update threw ${e.stack}`); }
    }
  }
}
console.log(failures ? `${failures} failure(s)` : 'All levels OK');
process.exit(failures ? 1 : 0);
