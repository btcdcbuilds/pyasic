// Pure gameplay simulation (no rendering). The renderer reads this state every frame.
// Coordinates: d = distance along the track (forward), x = lateral position in [-HW, HW].
import { WORLDS, DIFFICULTIES, WEAPONS, weaponById, LEVELS_PER_WORLD } from './data.js';

export const HW = 6;
export const SPEED = 10;
export const HERO_POWER = 12; // a hero shoots like this many soldiers
export const HERO_HP = 10; // soldiers a hero is worth when the army is wiped
export const MAX_ARMY = 9999;
export const BOSS_STAND = 13; // how far from a boss the army stops
export const CHARGE_DIST = 75; // enemy squads start charging from this far
export const MIN_TRAVEL = 120; // every bullet flies at least this far up the track
export const BOSS_WAKE = 30; // a boss is shielded until your army is this close
const LANE2 = [[-HW, 0], [0, HW]];
const LANE3 = [[-HW, -2], [-2, 2], [2, HW]];

// Tightly packed crowd: about 0.5 m² per soldier, capped so a big army still fits in one lane.
export function armyRadius(n) {
  return Math.min(2.5, 0.16 * Math.sqrt(Math.max(1, Math.min(n, 400))) + 0.35);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function levelIndex(wi, li) {
  return wi * LEVELS_PER_WORLD + li;
}

// ---------------------------------------------------------------- level generation
export function generateLevel(wi, li, diffId, seedExtra = 0) {
  const world = WORLDS[wi];
  const diff = DIFFICULTIES.find((d) => d.id === diffId) || DIFFICULTIES[1];
  const mod = world.mod;
  const L = levelIndex(wi, li);
  const rng = mulberry32(7919 + L * 104729 + seedExtra * 31337);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const D = diff.hp;
  const hpScale = (1 + 0.3 * L) * D;
  const rows = 16 + Math.min(12, Math.floor(L / 2)) + li * 2;
  const ents = [];
  const dividers = [];
  let id = 0;
  const add = (e) => {
    e.id = id++;
    e.alive = true;
    e.passed = false;
    ents.push(e);
    return e;
  };
  const pBad = Math.min(0.7, (0.25 + L * 0.015) * diff.bad);
  const maxTier = Math.min(9, 1 + wi + (mod.boardWeight ? 1 : 0));
  const enemyHp = 1.4 * (1 + 0.14 * L) * Math.sqrt(D) * (mod.shield || 1);
  let mulLeft = 1 + (L > 15 ? 1 : 0); // multiplier gates are rare treats
  const squadSize = (i) => Math.round((5 + i * 1.6 + L * 1.0) * Math.sqrt(D));

  const goodGate = (i, allowMul) => {
    const r = rng();
    if (allowMul && mulLeft > 0 && r < 0.12) { mulLeft--; return { op: 'x', v: 2 }; }
    if (r < 0.3 && i > 0) return { op: rng() < 0.5 ? 'rate' : 'dmg', v: ri(8, 16) + Math.floor(L / 3) };
    return { op: '+', v: ri(4, 9) + Math.floor(L * 0.4) + Math.floor(i * 0.6) };
  };
  const badGate = (i) => {
    if (rng() < 0.25 && i > 3) return { op: '÷', v: 2 };
    return { op: '-', v: Math.round((ri(5, 10) + L * 0.7 + i) * diff.bad) };
  };
  const gate = (lane, dd, g) => add({ type: 'gate', d: dd, x0: lane[0], x1: lane[1], row: id, ...g, acc: 0, step: 3 * hpScale });
  const gateRow = (i, dd) => {
    let a = goodGate(i, i >= 2);
    let b = i > 1 && rng() < pBad ? badGate(i) : goodGate(i, false);
    if (rng() < 0.5) [a, b] = [b, a];
    const row = id;
    add({ type: 'gate', d: dd, x0: -HW, x1: 0, row, ...a, acc: 0, step: 3 * hpScale });
    add({ type: 'gate', d: dd, x0: 0, x1: HW, row, ...b, acc: 0, step: 3 * hpScale });
  };
  const weaponBoard = (lane, dd, i, bonusTier = 0) => {
    const tier = clamp(ri(Math.max(1, wi), maxTier) + bonusTier, 1, 9);
    return add({ type: 'board', d: dd, x0: lane[0] + 0.2, x1: lane[1] - 0.2, weapon: WEAPONS[tier].id, hp: (14 + 4 * i) * hpScale });
  };
  const boardRow = (i, dd) => {
    const s = rng() < 0.5 ? 0 : 1;
    weaponBoard(LANE2[s], dd, i);
    const o = LANE2[1 - s];
    const other = rng();
    if (other < 0.4) add({ type: 'hero', d: dd, x0: o[0] + 0.2, x1: o[1] - 0.2, hp: (40 + 8 * i) * hpScale });
    else if (other < 0.75) add({ type: 'cage', d: dd, x0: o[0] + 0.3, x1: o[1] - 0.3, hp: (10 + 3 * i) * hpScale, allies: 5 + Math.floor(L * 0.4) + i });
    else gate(o, dd + 14, goodGate(i, false));
  };
  const squad = (dd, x, m, lane = null) => add({
    type: 'squad', d: dd, x, m, m0: m, hpEach: enemyHp, acc: 0, contact: false, lane,
  });
  const squadRow = (i, dd) => {
    const m = squadSize(i);
    if (m > 40 && rng() < 0.5) {
      squad(dd + 6, -3, Math.round(m * 0.55));
      squad(dd + 9, 3, Math.round(m * 0.55));
    } else squad(dd + 6, pick([-3, 0, 3]), m);
  };
  const wallRow = (i, dd) => {
    const gap = ri(0, 2);
    LANE3.forEach((lane, k) => {
      if (k === gap) return;
      if (rng() < 0.4 + (mod.barrelWeight ? 0.25 : 0)) {
        const c = (lane[0] + lane[1]) / 2;
        add({ type: 'barrel', d: dd, x0: c - 0.8, x1: c + 0.8, hp: 4 * hpScale });
      } else {
        add({ type: 'wall', d: dd, x0: lane[0] + 0.15, x1: lane[1] - 0.15, hp: (16 + 3 * i) * hpScale });
      }
    });
    const c = (LANE3[gap][0] + LANE3[gap][1]) / 2;
    for (let k = 0; k < 4; k++) add({ type: 'coin', d: dd - 8 + k * 3, x0: c - 0.6, x1: c + 0.6, value: 2 + Math.floor(L / 4) });
  };
  const hazardRow = (i, dd) => {
    const kinds = ['saw'];
    if (mod.boulders) kinds.push('boulder', 'boulder');
    if (mod.geysers) kinds.push('geyser', 'geyser');
    if (mod.saws) kinds.push('saw');
    const k = pick(kinds);
    if (k === 'geyser') {
      [0, 1, 2].sort(() => rng() - 0.5).slice(0, 2).forEach((lane, n) => {
        add({ type: 'geyser', d: dd, x0: LANE3[lane][0], x1: LANE3[lane][1], phase: n * 1.2 + rng(), period: 2.4, on: 1.0 });
      });
    } else {
      add({ type: k, d: dd, x0: 0, x1: 0, phase: rng() * 6.28, w: k === 'boulder' ? 1.4 : 2.2, half: k === 'boulder' ? 1.3 : 0.9 });
    }
    if (L > 3 && rng() < 0.5) squad(dd + 14, pick([-3, 3]), squadSize(Math.max(0, i - 3)));
  };
  // A strip of small "+N" blocks down one lane: run through all of them to add up.
  const strip = (lane, d0, count, v, big = false) => {
    const c = (lane[0] + lane[1]) / 2;
    const w = Math.min(lane[1] - lane[0] - 0.4, big ? 3.4 : 3);
    for (let k = 0; k < count; k++) add({ type: 'pickup', d: d0 + k * (big ? 7 : 3), x0: c - w / 2, x1: c + w / 2, v, big });
  };
  const stripRow = (i, dd) => {
    const s = rng() < 0.5 ? 0 : 1;
    strip(LANE2[s], dd - 8, 7, 1 + Math.floor(L / 15));
    if (rng() < 0.5) squad(dd + 6, s ? -3 : 3, Math.round(squadSize(i) * 0.6));
    else gate(LANE2[1 - s], dd + 10, goodGate(i, false));
  };
  // Three walled lanes, like the bridge in the ads: a +1 strip, an enemy horde with a weapon
  // at the end, and a lane of big bonuses guarded by a hero board or wall. You can't switch
  // lanes once inside, but the horde can jump the low walls, so there's no hiding from it.
  const gauntlet = (i, dd) => {
    const len = 66;
    const order = [0, 1, 2].sort(() => rng() - 0.5);
    const [stripLane, hordeLane, bigLane] = order.map((k) => LANE3[k]);
    dividers.push({ d0: dd, d1: dd + len, xs: [-2, 2] });
    strip(stripLane, dd + 4, 16, 1 + Math.floor(L / 15));
    const hc = (hordeLane[0] + hordeLane[1]) / 2;
    const hm = squadSize(i);
    for (let k = 0; k < 3; k++) squad(dd + 14 + k * 16, hc, Math.round(hm * (0.6 + k * 0.25)));
    weaponBoard(hordeLane, dd + len - 4, i, 1);
    const g = rng() < 0.5
      ? add({ type: 'hero', d: dd + 8, x0: bigLane[0] + 0.15, x1: bigLane[1] - 0.15, hp: (50 + 8 * i) * hpScale })
      : add({ type: 'wall', d: dd + 8, x0: bigLane[0] + 0.15, x1: bigLane[1] - 0.15, hp: (30 + 5 * i) * hpScale });
    void g;
    strip(bigLane, dd + 18, 4, 4 + Math.floor(L * 0.4), true);
    return len;
  };

  // Levels are split into stages. Each stage ends with a boss; beating a mid-boss sends in
  // reinforcements and the run continues to the next stage. The last boss ends the level.
  const stages = li >= 3 ? 3 : 2;
  const rowsPer = Math.ceil(rows / stages);
  // early bosses are gentler (ramp to full strength by world 3) so new players can learn the fight
  const ramp = Math.min(1, 0.55 + L * 0.045);
  const baseBossHp = 13000 * Math.exp(0.145 * L) * Math.sqrt(D) * ramp;
  const bosses = [];
  let dd = 45;
  for (let i = 0, st = 0; st < stages; st++) {
   for (let k = 0; k < rowsPer && i < rows; k++, i++) {
    if (L >= 20 ? i > 5 && i % 6 === 5 : i > 2 && i % 6 === 3) {
      dd += gauntlet(i, dd) + 24;
      continue;
    }
    if (i % 2 === 0) {
      gateRow(i, dd);
    } else {
      const opts = [['board', 3 * (mod.boardWeight || 1)], ['squad', 3 + L * 0.08], ['wall', 2 + (mod.barrelWeight || 0)],
        ['cage', 0.6 * (mod.cageWeight || 1)], ['hazard', L > 0 ? 1.6 : 0], ['strip', 1.5]];
      const tot = opts.reduce((s, o) => s + o[1], 0);
      let r = rng() * tot;
      let kind = 'board';
      for (const [k, w] of opts) {
        if ((r -= w) <= 0) { kind = k; break; }
      }
      if (i === 1) kind = 'board';
      if (kind === 'board') boardRow(i, dd);
      else if (kind === 'squad') squadRow(i, dd);
      else if (kind === 'wall') wallRow(i, dd);
      else if (kind === 'hazard') hazardRow(i, dd);
      else if (kind === 'strip') stripRow(i, dd);
      else {
        const s = rng() < 0.5 ? 0 : 1;
        const a = LANE2[s];
        const b = LANE2[1 - s];
        add({ type: 'cage', d: dd, x0: a[0] + 0.3, x1: a[1] - 0.3, hp: (10 + 3 * i) * hpScale, allies: 6 + Math.floor(L * 0.5) + i });
        add({ type: 'wall', d: dd, x0: b[0] + 0.2, x1: b[1] - 0.2, hp: (12 + 3 * i) * hpScale });
      }
    }
    dd += 28;
   }
    const final = st === stages - 1;
    squad(dd, -3, squadSize(i));
    squad(dd + 4, 3, squadSize(i));
    dd += 40;
    // tuned with tools/balance.mjs: a typical army needs roughly 10-15 s of fire for the final boss
    const hp = Math.round(baseBossHp * (final ? 3.5 : 1.2 + 0.4 * st));
    bosses.push(add({
      type: 'boss', d: dd + 8, x: 0, half: 2.8, hp, maxHp: hp, final, stage: st, stages,
      hitBase: Math.ceil((2 + L * 0.5) * Math.sqrt(D)), ramp, atkT: 2.5, atk: null, phase: 1, engaged: false,
      minions: Math.round((4 + L * 1.1) * Math.sqrt(D) * (final ? 1 : 0.7)), callT: 3,
      reinforce: 6 + Math.floor(L * 0.6), contact: false,
    }));
    dd += final ? 0 : 60;
  }
  ents.sort((a, b) => a.d - b.d);
  return { wi, li, L, world, diff, entities: ents, dividers, bosses, boss: bosses[bosses.length - 1], length: dd + 8, hpScale, enemyHp, nextId: id, seed: seedExtra };
}

// ---------------------------------------------------------------- simulation
export class Sim {
  // stats: { startTroops, weapon, dmgMult, rateMult, armor (0..1 loss reduction) }
  constructor(level, stats) {
    this.level = level;
    this.world = level.world;
    this.mod = level.world.mod;
    this.ents = level.entities;
    this.dividers = level.dividers || [];
    this.bosses = level.bosses || [level.boss];
    this.n = stats.startTroops;
    this.peak = this.n;
    this.heroes = 0;
    this.weapon = weaponById[stats.weapon] || WEAPONS[0];
    this.dmgMult = stats.dmgMult;
    this.rateMult = stats.rateMult;
    this.lossMult = 1 - stats.armor;
    this.x = 0;
    this.vx = 0;
    this.d = 0;
    this.t = 0;
    this.fireAcc = 0;
    this.heroAcc = 0;
    this.proj = [];
    this.events = [];
    this.kills = 0;
    this.coins = 0;
    this.state = 'run';
    this.clashing = false;
    this.lock = null;
    this.cursor = 0;
    this.danger = 0;
    this.soldierValue = 2.2 * level.hpScale;
  }

  get radius() {
    return armyRadius(this.n);
  }

  // The boss you're currently fighting (or the final boss once all are down).
  get boss() {
    for (const b of this.bosses) if (b.alive) return b;
    return this.bosses[this.bosses.length - 1];
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  lose(k, cause = 'hit') {
    k = Math.max(0, Math.round(k));
    if (k <= 0) return;
    this.n -= k;
    while (this.n <= 0 && this.heroes > 0) {
      this.heroes--;
      this.n += HERO_HP;
      this.emit('heroDown');
    }
    if (this.n < 0) this.n = 0;
    this.emit('lose', { k, cause });
  }

  gain(k) {
    this.n = Math.min(MAX_ARMY, this.n + Math.round(k));
    this.peak = Math.max(this.peak, this.n);
  }

  windForce() {
    return this.mod.wind ? Math.sin(this.t * 0.45) * 2.4 + Math.sin(this.t * 1.3) * 0.8 : 0;
  }

  // Lane the army is locked into while inside a walled section, or null.
  laneBounds() {
    for (const dv of this.dividers) {
      if (this.d < dv.d0 - 0.5 || this.d > dv.d1) continue;
      if (!this.lock || this.lock.dv !== dv) {
        const edges = [-HW, ...dv.xs, HW];
        let k = 0;
        while (k < edges.length - 2 && this.x > edges[k + 1]) k++;
        this.lock = { dv, lo: edges[k], hi: edges[k + 1] };
      }
      return this.lock;
    }
    this.lock = null;
    return null;
  }

  update(dt, targetX) {
    if (this.state !== 'run') return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const R = this.radius;
    let lo = -HW + R * 0.9;
    let hi = HW - R * 0.9;
    const lane = this.laneBounds();
    if (lane) {
      lo = lane.lo + Math.min(R * 0.9, (lane.hi - lane.lo) / 2 - 0.01);
      hi = lane.hi - Math.min(R * 0.9, (lane.hi - lane.lo) / 2 - 0.01);
    }
    const tx = clamp(targetX, lo, hi);
    if (this.mod.ice) {
      this.vx += (tx - this.x) * 9 * dt;
      this.vx *= Math.max(0, 1 - 2.4 * dt);
      this.x += this.vx * dt;
    } else {
      this.x += (tx - this.x) * Math.min(1, dt * 12);
    }
    this.x += this.windForce() * dt;
    this.x = clamp(this.x, lo, hi);

    const b = this.boss;
    this.d += (this.clashing ? 2.5 : SPEED) * dt;
    // the army halts at a standoff distance and trades fire with the boss
    if (b.alive) this.d = Math.min(this.d, b.d - BOSS_STAND);

    this.fire(dt);
    this.updateProjectiles(dt);
    this.updateEntities(dt);
    this.resort();
    this.collide();

    if (this.n <= 0 && this.heroes <= 0) {
      this.state = 'lost';
      this.emit('lost');
    } else if (!this.boss.alive) {
      this.state = 'won';
      this.emit('won');
    }
  }

  range() {
    return this.weapon.range * (this.mod.rangeMult || 1);
  }

  dps() {
    const w = this.weapon;
    return this.n * w.dmg * w.rate * (w.pellets || 1) * this.dmgMult * this.rateMult;
  }

  // Continuous fire: every soldier shoots on its own rhythm, so bullets stream out
  // instead of coming in volleys. Damage per bullet is the army's DPS spread over the
  // bullets actually spawned.
  fire(dt) {
    const w = this.weapon;
    const R = this.radius;
    const range = this.range();
    const pellets = w.pellets || 1;
    const maxVis = w.rate <= 1.2 ? 14 : w.rate < 3 ? 30 : 60;
    const perSec = clamp(this.n * w.rate * this.rateMult, 3, maxVis);
    const dmg = this.dps() / (perSec * pellets);
    const target = this.aimTarget(range);
    this.fireAcc += perSec * dt;
    let shots = 0;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      shots++;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * R * 0.85;
      const sx = this.x + Math.cos(a) * r;
      const sd = this.d + Math.sin(a) * r * 0.85;
      for (let p = 0; p < pellets; p++) {
        const spread = pellets > 1 ? ((p / (pellets - 1)) - 0.5) * (w.spread || 0) : 0;
        this.spawn(sx + spread, sd, dmg, range, w, false, target);
      }
    }
    // heroes fire their own minigun streams
    if (this.heroes > 0) {
      const mg = weaponById.minigun;
      const heroDps = this.heroes * HERO_POWER * mg.dmg * mg.rate * this.dmgMult;
      const hs = 14 * this.heroes;
      this.heroAcc += hs * dt;
      while (this.heroAcc >= 1) {
        this.heroAcc -= 1;
        const i = Math.floor(Math.random() * this.heroes);
        this.spawn(this.heroX(i), this.d + 0.5, heroDps / hs, mg.range, mg, true, this.aimTarget(mg.range));
      }
    }
    if (shots) this.emit('shot', { w: w.id, k: shots });
  }

  // Soldiers aim at the nearest enemy squad or boss roughly in front of them (like the ads);
  // gates, boards and walls still need you to steer into their lane.
  aimTarget(range) {
    const R = this.radius;
    let best = null;
    let bestD = Infinity;
    for (let i = this.cursor; i < this.ents.length; i++) {
      const e = this.ents[i];
      if (e.d - this.d > range) break;
      if (!e.alive || (e.type !== 'squad' && e.type !== 'boss')) continue;
      if (e.type === 'boss' && e.d - this.d > BOSS_WAKE) continue;
      const half = e.type === 'boss' ? e.half : armyRadius(e.m);
      if (Math.abs(e.x - this.x) > R + half + 3 || e.d < this.d + 4) continue;
      if (e.d < bestD) { bestD = e.d; best = e; }
    }
    return best;
  }

  spawn(x, d, dmg, range, w, hero, target = null) {
    x = clamp(x, -HW, HW);
    let vx = 0;
    if (target) {
      const half = target.type === 'boss' ? target.half * 0.7 : armyRadius(target.m) * 0.7;
      const tx = target.x + (Math.random() * 2 - 1) * half;
      const t = Math.max(0.05, (target.d - d) / w.speed);
      vx = clamp((tx - x) / t, -0.25 * w.speed, 0.25 * w.speed);
    }
    this.proj.push({ x, vx, d, d0: d, dmg, range, travel: Math.max(range, MIN_TRAVEL), speed: w.speed, pierce: w.pierce || 0, hit: null, w, hero });
  }

  heroX(i) {
    const R = this.radius;
    const side = i % 2 === 0 ? 1 : -1;
    const lo = this.lock ? this.lock.lo : -HW;
    const hi = this.lock ? this.lock.hi : HW;
    return clamp(this.x + side * (R + 0.5 + Math.floor(i / 2) * 0.9), lo + 0.4, hi - 0.4);
  }

  shootable(e) {
    if (!e.alive || e.unlocked) return false;
    if (e.type === 'boss' && e.d - this.d > BOSS_WAKE) return false; // still shielded
    return e.type !== 'coin' && e.type !== 'saw' && e.type !== 'boulder' && e.type !== 'geyser' && e.type !== 'pickup';
  }

  spanOf(e) {
    if (e.type === 'squad') {
      const r = armyRadius(e.m);
      return [e.x - r, e.x + r, e.d - r, e.d + r];
    }
    if (e.type === 'boss') return [e.x - e.half, e.x + e.half, e.d - 1, e.d + 1];
    return [e.x0, e.x1, e.d - 0.4, e.d + 0.4];
  }

  updateProjectiles(dt) {
    while (this.cursor < this.ents.length - 1 && this.ents[this.cursor].d < this.d - 15 && this.ents[this.cursor].type !== 'boss') this.cursor++;
    const out = [];
    for (const p of this.proj) {
      const prev = p.d;
      p.d += p.speed * dt;
      if (p.vx) p.x += p.vx * dt;
      let best = null;
      let bestD = Infinity;
      const ents = this.ents;
      for (let i = this.cursor; i < ents.length; i++) {
        const e = ents[i];
        if (e.d - 8 > p.d) break; // entities are roughly sorted by d
        if (!this.shootable(e) || (p.hit && p.hit.has(e.id))) continue;
        const [x0, x1, d0, d1] = this.spanOf(e);
        if (p.x < x0 || p.x > x1) continue;
        if (d1 < prev || d0 > p.d) continue;
        if (d0 < bestD) { bestD = d0; best = e; }
      }
      if (best) {
        const dmg = p.d - p.d0 > p.range ? p.dmg * 0.5 : p.dmg;
        this.damage(best, dmg);
        this.emit('hit', { x: p.x, d: Math.max(prev, bestD), w: p.w.id, ent: best.type });
        if (p.w.splash) this.splash(p.x, bestD, p.w.splash, p.dmg * 0.6, best);
        if (p.w.chain) this.chain(p.x, bestD, p.w.chain, p.dmg * 0.7, best);
        if (p.pierce > 0) {
          p.pierce--;
          (p.hit ||= new Set()).add(best.id);
          out.push(p);
        }
        continue;
      }
      if (p.d - p.d0 < p.travel) out.push(p);
      else this.emit('expire', { travel: p.d - p.d0, x: p.x });
    }
    this.proj = out;
  }

  splash(x, d, r, dmg, skip) {
    for (const e of this.ents) {
      if (e === skip || !this.shootable(e) || e.type === 'gate') continue;
      if (Math.abs(e.d - d) > r + 1.5) continue;
      const [x0, x1] = this.spanOf(e);
      if (x < x0 - r || x > x1 + r) continue;
      this.damage(e, dmg);
    }
    this.emit('boom', { x, d, r });
  }

  chain(x, d, count, dmg, skip) {
    const targets = [];
    for (const e of this.ents) {
      if (e === skip || !this.shootable(e) || e.type === 'gate') continue;
      const ex = e.type === 'squad' || e.type === 'boss' ? e.x : (e.x0 + e.x1) / 2;
      const dist = Math.hypot(ex - x, e.d - d);
      if (dist < 8) targets.push([dist, e, ex]);
    }
    targets.sort((a, b) => a[0] - b[0]);
    for (const [, e, ex] of targets.slice(0, count)) {
      this.damage(e, dmg);
      this.emit('arc', { x0: x, d0: d, x1: ex, d1: e.d });
    }
  }

  damage(e, dmg) {
    switch (e.type) {
      case 'gate': {
        // only +/- gates react to bullets. Progress counts bullets that hit (not damage), so a
        // huge army can't snowball a gate. No cap: each point above the starting value needs a
        // few more hits than the last, so a gate keeps growing the longer you shoot it.
        if (e.op !== '+' && e.op !== '-') return;
        if (e.v0 === undefined) e.v0 = e.v; // for a - gate: the size it can grow back to once flipped
        e.acc += 1;
        for (;;) {
          const cost = e.op === '+' ? 2 * Math.pow(2, Math.max(0, e.v - e.v0) / Math.max(3, e.v0 / 2)) : 2;
          if (e.acc < cost) break;
          e.acc -= cost;
          if (e.op === '-') {
            e.v -= 1;
            if (e.v <= 0) { e.op = '+'; e.v = 1; this.emit('gateFlip', { e }); }
          } else e.v += 1;
          e.bump = 1;
        }
        e.dirty = true;
        return;
      }
      case 'squad': {
        e.acc += dmg;
        const k = Math.min(e.m, Math.floor(e.acc / e.hpEach));
        if (k > 0) {
          e.m -= k;
          e.acc -= k * e.hpEach;
          this.kills += k;
          this.emit('kill', { e, k });
        }
        if (e.m <= 0) { e.alive = false; e.acc = 0; }
        return;
      }
      case 'boss':
        e.hp -= dmg;
        e.flash = Math.min(1, (e.flash || 0) + 0.15);
        if (e.hp <= 0) {
          e.hp = 0;
          e.alive = false;
          e.atk = null;
          this.emit('bossDown', { e });
          if (!e.final) {
            // stage clear: reinforcements join and the run continues
            this.gain(e.reinforce + Math.round(this.peak * 0.15));
            this.emit('stageClear', { e, k: e.reinforce + Math.round(this.peak * 0.15) });
          }
        }
        return;
      default:
        e.hp -= dmg;
        e.dirty = true;
        if (e.hp <= 0) {
          e.hp = 0;
          if (e.type === 'board' || e.type === 'hero' || e.type === 'cage') {
            if (this.overlap(e.x0, e.x1) > 0) {
              // shot open from its lane: the reward now runs over to your army
              e.unlocked = true;
              this.emit('unlock', { e });
            } else {
              // stray bullets from the next lane can't open it: steer over to claim it
              e.hp = 1;
              if (!e.hinted) { e.hinted = true; this.emit('steerHere', { e }); }
            }
          } else this.destroy(e);
        }
    }
  }

  destroy(e) {
    if (!e.alive) return;
    e.alive = false;
    if (e.type === 'barrel') this.splash((e.x0 + e.x1) / 2, e.d, 4, 30 * this.level.hpScale, e);
    this.emit('destroy', { e });
  }

  collect(e) {
    e.alive = false;
    if (e.type === 'board') {
      const w = weaponById[e.weapon];
      if (w.tier > this.weapon.tier) {
        this.weapon = w;
        this.emit('weapon', { w });
      } else {
        this.dmgMult *= 1.15;
        this.emit('powerup', { text: '+15% DAMAGE' });
      }
    } else if (e.type === 'hero') {
      this.heroes++;
      this.emit('hero');
    } else if (e.type === 'cage') {
      this.gain(e.allies);
      this.emit('allies', { k: e.allies, e });
    }
    this.emit('collect', { e });
  }

  overlap(x0, x1) {
    const R = this.radius;
    const a = Math.max(x0, this.x - R);
    const b = Math.min(x1, this.x + R);
    return Math.max(0, b - a) / (2 * R);
  }

  hazardX(e) {
    return Math.sin(this.t * e.w * 0.7 + e.phase) * (HW - e.half);
  }

  geyserOn(e) {
    return ((this.t + e.phase) % e.period) < e.on;
  }

  spawnSquad(d, x, m) {
    const e = { type: 'squad', d, x, m, m0: m, hpEach: this.level.enemyHp, acc: 0, contact: false, alive: true, passed: false, id: this.level.nextId++ };
    let i = this.ents.length;
    while (i > 0 && this.ents[i - 1].d > d) i--;
    this.ents.splice(i, 0, e);
    this.emit('spawn', { e });
    return e;
  }

  // Entities move (squads charge, rewards run to you), so restore the sort by distance
  // every frame. The projectile scan relies on it; an out-of-order entity used to hide the
  // boss from bullets. Insertion sort is cheap because the list is almost sorted.
  resort() {
    const a = this.ents;
    for (let i = 1; i < a.length; i++) {
      const e = a[i];
      let j = i - 1;
      if (a[j].d <= e.d) continue;
      while (j >= 0 && a[j].d > e.d) { a[j + 1] = a[j]; j--; }
      a[j + 1] = e;
    }
    while (this.cursor > 0 && a[this.cursor - 1].d >= this.d - 15) this.cursor--;
  }

  updateEntities(dt) {
    const R = this.radius;
    this.clashing = false;
    this.danger = 0;
    for (const e of this.ents) {
      if (!e.alive) continue;
      if (e.type === 'squad') {
        const r = armyRadius(e.m);
        const gap = e.d - r - (this.d + R * 0.8);
        const lateral = Math.abs(e.x - this.x) < R + r * 0.9;
        if (gap <= 0 && lateral) {
          // clash: both sides lose soldiers at the same rate
          this.clashing = true;
          const rate = Math.max(18, (this.n + e.m) * 2.2);
          const k = Math.min(this.n + this.heroes * HERO_HP, e.m, Math.ceil(rate * dt));
          e.m -= k;
          this.kills += k;
          this.lose(k, 'clash');
          this.emit('kill', { e, k, clash: true });
          if (!e.contact) { e.contact = true; this.emit('clash', { e }); }
          if (e.m <= 0) e.alive = false;
        } else if (e.d < this.d - R - r - 1) {
          e.alive = false; // ran past
          this.emit('dodge', { e });
        } else if (e.d - this.d < CHARGE_DIST) {
          e.d -= 8 * dt;
          // charge: run at the army and cut across lanes toward it; close in hard at the end
          const near = gap < 6 && Math.abs(e.x - this.x) < R + r + 1.5;
          e.x += clamp(this.x - e.x, -1, 1) * (near ? 8 : 5) * dt;
          e.x = clamp(e.x, -HW + r, HW - r);
          e.charging = true;
          const inLine = Math.abs(e.x - this.x) < R + r + 1.5;
          if (inLine) {
            const closeness = 1 - Math.max(0, gap) / CHARGE_DIST;
            this.danger = Math.max(this.danger, Math.min(1.5, e.m / Math.max(1, this.n)) * closeness);
          }
          // they shoot back once within 20 m
          if (inLine && gap < 20) {
            e.fireAcc = (e.fireAcc || 0) + 0.02 * e.m * this.lossMult * dt;
            if (e.fireAcc >= 1) {
              const k = Math.floor(e.fireAcc);
              e.fireAcc -= k;
              this.lose(k, 'shot');
            }
            e.tracer = (e.tracer || 0) + Math.min(12, e.m) * dt * 2;
            while (e.tracer >= 1) { e.tracer -= 1; this.emit('enemyFire', { e }); }
          }
        }
      } else if (e.type === 'boss') {
        this.updateBoss(e, dt);
      } else if (e.unlocked) {
        // shot open: the reward (or the freed prisoners) runs over to your army
        const cx = (e.x0 + e.x1) / 2;
        const dx = clamp(this.x - cx, -1, 1) * 9 * dt;
        e.x0 += dx;
        e.x1 += dx;
        if (e.d - this.d > 6) e.d -= 4 * dt;
      } else if (e.bump > 0) {
        e.bump = Math.max(0, e.bump - dt * 6);
      }
    }
  }

  // Boss fight: the boss stands its ground and telegraphs attacks onto the area where your
  // army stands (red zones). Move out of the zone before it lands. It gets faster and nastier
  // as it loses health, and keeps calling squads in to charge you.
  updateBoss(e, dt) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 8);
    const dist = e.d - this.d;
    if (dist > 70) return;
    if (!e.awake && dist <= BOSS_WAKE) { e.awake = true; this.emit('bossWake', { e }); }
    const frac = e.hp / e.maxHp;
    const phase = frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
    if (phase !== e.phase) { e.phase = phase; this.emit('bossPhase', { e, phase }); }
    e.engaged = dist <= BOSS_STAND + 1;
    // reinforcements
    if (dist < 55) {
      e.callT -= dt;
      if (e.callT <= 0) {
        e.callT = [5, 4, 3][phase - 1];
        const m = Math.round(e.minions * (0.7 + 0.3 * phase));
        const side = Math.random() < 0.5 ? -1 : 1;
        this.spawnSquad(this.d + 25, side * (1.5 + Math.random() * 2.5), Math.ceil(m / 2));
        this.spawnSquad(this.d + 28, -side * (1.5 + Math.random() * 2.5), Math.ceil(m / 2));
      }
    }
    if (!e.engaged) return;
    if (e.atk) {
      e.atk.t -= dt;
      if (e.atk.t <= 0) this.resolveAttack(e, e.atk);
      return;
    }
    e.atkT -= dt;
    if (e.atkT > 0) return;
    e.atkT = [2.4, 1.8, 1.3][phase - 1];
    const kinds = phase === 1 ? ['slam', 'slam', 'rocks'] : phase === 2 ? ['slam', 'sweep', 'rocks'] : ['slam', 'sweep', 'rocks', 'double'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const tele = [1.2, 1.0, 0.85][phase - 1];
    let zones;
    if (kind === 'slam') zones = [[this.x - 2.6, this.x + 2.6]];
    else if (kind === 'sweep') zones = this.x < 0 ? [[-HW, 0.5]] : [[-0.5, HW]];
    else if (kind === 'double') zones = [[this.x - 2.2, this.x + 2.2], this.x < 0 ? [2, HW] : [-HW, -2]];
    else {
      zones = [[this.x - 1.4, this.x + 1.4]];
      for (let k = 0; k < 2; k++) {
        const c = (Math.random() - 0.5) * 2 * (HW - 1.4);
        zones.push([c - 1.4, c + 1.4]);
      }
    }
    zones = zones.map(([a, b]) => [clamp(a, -HW, HW), clamp(b, -HW, HW)]);
    e.atk = { kind, zones, t: tele, tele, d: this.d };
    this.emit('bossAttack', { e, atk: e.atk });
  }

  resolveAttack(e, atk) {
    e.atk = null;
    let f = 0;
    for (const [a, b] of atk.zones) f += this.overlap(a, b);
    f = Math.min(1, f);
    const share = { slam: 0.22, sweep: 0.18, rocks: 0.15, double: 0.22 }[atk.kind];
    let k = 0;
    if (f > 0) {
      k = (Math.ceil(this.n * f * share * e.ramp) + e.hitBase) * this.lossMult;
      this.lose(Math.min(this.n + this.heroes * HERO_HP, k), 'boss');
    }
    this.emit('bossImpact', { e, atk, hit: f > 0, k: Math.round(k) });
  }

  collide() {
    const R = this.radius;
    const front = this.d + R * 0.6;
    for (const e of this.ents) {
      if (e.type === 'squad' || e.type === 'boss') continue;
      if (e.d > front) break;
      if (!e.alive || e.passed) continue;
      e.passed = true;
      switch (e.type) {
        case 'gate': {
          // only the gate the army's centre runs through counts
          if (this.x < e.x0 || this.x > e.x1) {
            const other = this.ents.find((o) => o !== e && o.type === 'gate' && o.row === e.row && o.alive);
            if (!other) e.alive = false;
            continue;
          }
          this.applyGate(e);
          for (const o of this.ents) if (o.type === 'gate' && o.row === e.row) { o.alive = false; o.passed = true; }
          break;
        }
        case 'board': case 'hero': case 'cage': {
          const f = this.overlap(e.x0, e.x1);
          if (e.unlocked) {
            this.collect(e);
          } else if (f > 0) {
            this.lose(Math.max(1, Math.min(Math.ceil(this.n * f), Math.ceil(e.hp / this.soldierValue)) * this.lossMult), 'crash');
            e.alive = false;
            this.emit('crash', { e });
          }
          break;
        }
        case 'wall': {
          const f = this.overlap(e.x0, e.x1);
          if (f > 0) {
            this.lose(Math.max(1, Math.min(Math.ceil(this.n * f), Math.ceil(e.hp / this.soldierValue)) * this.lossMult), 'crash');
            e.alive = false;
            this.emit('crash', { e });
          }
          break;
        }
        case 'barrel': {
          if (this.overlap(e.x0, e.x1) > 0) {
            this.lose(6 * this.lossMult, 'crash');
            this.destroy(e);
          }
          break;
        }
        case 'pickup': {
          if (this.overlap(e.x0, e.x1) > 0.15) {
            this.gain(e.v);
            e.alive = false;
            this.emit('pickup', { e });
          }
          break;
        }
        case 'coin': {
          if (this.overlap(e.x0, e.x1) > 0) {
            this.coins += e.value;
            e.alive = false;
            this.emit('coin', { e });
          }
          break;
        }
        case 'saw': case 'boulder': {
          const hx = this.hazardX(e);
          if (this.overlap(hx - e.half, hx + e.half) > 0) {
            this.lose((Math.ceil(this.n * (e.type === 'boulder' ? 0.2 : 0.14)) + 2) * this.lossMult, 'crash');
            this.emit('crash', { e });
          }
          break;
        }
        case 'geyser': {
          if (this.geyserOn(e) && this.overlap(e.x0, e.x1) > 0.15) {
            this.lose((Math.ceil(this.n * 0.2) + 3) * this.lossMult, 'burn');
            this.emit('burn', { e });
          }
          break;
        }
      }
    }
  }

  applyGate(e) {
    const before = this.n;
    switch (e.op) {
      case '+': this.gain(e.v); break;
      case 'x': this.gain(this.n * (e.v - 1)); break;
      case '-': this.lose(Math.min(this.n, e.v), 'gate'); break;
      case '÷': this.lose(this.n - Math.ceil(this.n / e.v), 'gate'); break;
      case 'rate': this.rateMult *= 1 + e.v / 100; break;
      case 'dmg': this.dmgMult *= 1 + e.v / 100; break;
    }
    this.emit('gate', { e, good: e.op === '+' || e.op === 'x' || e.op === 'rate' || e.op === 'dmg', delta: this.n - before });
  }

  stars() {
    if (this.state !== 'won') return 0;
    return 1 + (this.n >= this.peak * 0.3 ? 1 : 0) + (this.n >= this.peak * 0.6 ? 1 : 0);
  }
}

const x1v = (cx, R) => cx + R;

// Simple AI used for balance testing and the ?autoplay demo.
export function botTarget(sim) {
  let bestX = sim.x;
  let bestScore = -Infinity;
  const R = sim.radius;
  const look = sim.dividers.some((dv) => dv.d0 - sim.d < 30 && dv.d1 > sim.d) ? 80 : 45;
  for (let cx = -5; cx <= 5.001; cx += 0.5) {
    let score = -Math.abs(cx - sim.x) * 0.3;
    for (const e of sim.ents) {
      if (!e.alive || e.passed) continue;
      const ahead = e.d - sim.d;
      if (ahead < -1) continue;
      if (ahead > look) break;
      const near = ahead < 14;
      const x0 = cx - R;
      const x1 = cx + R;
      const ov = (a, b) => Math.max(0, Math.min(b, x1) - Math.max(a, x0)) / (2 * R);
      switch (e.type) {
        case 'gate': {
          if (cx < e.x0 || cx > e.x1) break;
          let val = 0;
          if (e.op === '+') val = e.v;
          else if (e.op === 'x') val = sim.n * (e.v - 1);
          else if (e.op === '-') val = -e.v;
          else if (e.op === '÷') val = -sim.n / 2;
          else val = sim.n * e.v / 100 * 1.5;
          score += val * (near ? 3 : 1);
          break;
        }
        case 'board': case 'hero': case 'cage': {
          const worth = e.type === 'cage' ? e.allies : e.type === 'hero' ? HERO_POWER * 2 : 25;
          if (e.unlocked) score += ov(e.x0, e.x1) * worth * 2;
          else if (near) score -= ov(e.x0, e.x1) * Math.min(sim.n, e.hp / sim.soldierValue) * 2;
          else score += ov(e.x0, e.x1) * worth;
          break;
        }
        case 'pickup':
          score += ov(e.x0, e.x1) * e.v * 1.5;
          break;
        case 'wall': case 'barrel':
          if (near) score -= ov(e.x0, e.x1) * Math.min(sim.n, e.hp / sim.soldierValue + 6) * 3;
          break;
        case 'coin':
          score += ov(e.x0, e.x1) * 2;
          break;
        case 'saw': case 'boulder':
          if (near) {
            const hx = sim.hazardX(e);
            score -= ov(hx - e.half, hx + e.half) * sim.n * 0.4;
          }
          break;
        case 'geyser':
          if (near) score -= ov(e.x0, e.x1) * sim.n * 0.3;
          break;
        case 'squad': {
          const r = armyRadius(e.m);
          if (Math.abs(e.x - cx) < R + r) score -= Math.min(e.m, sim.n) * 0.4;
          break;
        }
      }
    }
    const b = sim.boss;
    if (b.alive && b.atk) {
      for (const [z0, z1] of b.atk.zones) score -= (Math.max(0, Math.min(z1, x1v(cx, R)) - Math.max(z0, cx - R)) / (2 * R)) * (sim.n + 20) * 4;
    } else if (b.alive && b.engaged) score -= Math.abs(cx - b.x) * 0.5;
    if (score > bestScore) { bestScore = score; bestX = cx; }
  }
  return bestX;
}
