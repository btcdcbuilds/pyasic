// Regression test: a boss must keep taking damage for the whole fight.
// (v1.0.3 bug: an out-of-order entity hid the boss from bullets after ~8 s.)
// Usage: node tools/test-boss.mjs   (exit code 1 on failure)
import { generateLevel, Sim, botTarget } from '../src/sim.js';

let failed = 0;
for (const [wi, li] of [[0, 0], [0, 2], [3, 0], [5, 2], [7, 4]]) {
  const lvl = generateLevel(wi, li, 'soldier', 0);
  // weak but nearly unkillable army so the fight lasts a long time
  const sim = new Sim(lvl, { startTroops: 60, weapon: 'pistol', dmgMult: 0.1, rateMult: 1, armor: 0.98 });
  const fb = sim.bosses[sim.bosses.length - 1];
  let t = 0, f = 0, tx = 0;
  const windows = [];
  let lastHp = null, windowStart = null;
  while (sim.state === 'run' && t < 900) {
    if (f % 6 === 0) tx = botTarget(sim);
    sim.n = Math.max(sim.n, 60); // keep the army alive and the same size
    sim.update(1 / 60, tx);
    sim.events.length = 0;
    t += 1 / 60; f++;
    const b = sim.boss;
    if (!b.alive && windowStart !== null && b === fb) { windows.push(Math.round(lastHp)); windowStart = null; } // died mid-window
    if (b.alive && b.awake) { // from the moment it can be shot (~110 m out)
      if (windowStart === null) { windowStart = t; lastHp = b.hp; }
      if (t - windowStart >= 10) {
        windows.push(Math.round(lastHp - b.hp));
        windowStart = t; lastHp = b.hp;
      }
    } else windowStart = null;
  }
  const stalled = windows.some((w) => w <= 0);
  const ok = windows.length >= 1 && !stalled;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} world ${wi + 1} level ${li + 1}: damage per 10 s window = [${windows.slice(0, 12).join(', ')}${windows.length > 12 ? ', …' : ''}] (${windows.length} windows, final boss ${fb.alive ? 'alive' : 'dead'})`);
}
process.exit(failed ? 1 : 0);
