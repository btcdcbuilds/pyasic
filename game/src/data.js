// Static game data: weapons, worlds, difficulties and upgrades.

export const WEAPONS = [
  // dmg = damage per bullet, rate = shots per second per soldier, range in world units.
  // pellets = bullets per shot, pierce = extra targets hit, splash = explosion radius, chain = extra arc targets.
  { id: 'pistol',  name: 'Pistol',          tier: 0, dmg: 1,   rate: 2.0, range: 42, speed: 91, color: 0xffe08a, size: 0.9, price: 0 },
  { id: 'smg',     name: 'SMG',             tier: 1, dmg: 1,   rate: 4.5, range: 42, speed: 98, color: 0xffd060, size: 0.8, price: 400 },
  { id: 'rifle',   name: 'Assault Rifle',   tier: 2, dmg: 2.2, rate: 3.6, range: 52, speed: 110, color: 0xffb040, size: 1.0, price: 1200 },
  { id: 'shotgun', name: 'Combat Shotgun',  tier: 3, dmg: 1.6, rate: 1.6, range: 35, speed: 91, color: 0xffa060, size: 0.8, pellets: 5, spread: 1.6, price: 2500 },
  { id: 'minigun', name: 'Minigun',         tier: 4, dmg: 1.5, rate: 11,  range: 49, speed: 117, color: 0xfff27a, size: 0.8, price: 5000 },
  { id: 'laser',   name: 'Laser Rifle',     tier: 5, dmg: 4.5, rate: 4,   range: 60, speed: 182, color: 0x5cf2ff, size: 1.6, pierce: 2, price: 9000 },
  { id: 'rocket',  name: 'Rocket Launcher', tier: 6, dmg: 16,  rate: 1.0, range: 60, speed: 58, color: 0xff6a2a, size: 1.8, splash: 3.2, price: 15000 },
  { id: 'plasma',  name: 'Plasma Cannon',   tier: 7, dmg: 9,   rate: 2.6, range: 56, speed: 78, color: 0xc05cff, size: 1.6, splash: 1.8, pierce: 1, price: 24000 },
  { id: 'tesla',   name: 'Tesla Arc',       tier: 8, dmg: 7,   rate: 3.2, range: 46, speed: 156, color: 0x8ad8ff, size: 1.2, chain: 3, price: 36000 },
  { id: 'railgun', name: 'Railgun',         tier: 9, dmg: 40,  rate: 0.9, range: 80, speed: 286, color: 0x7affc8, size: 2.6, pierce: 6, price: 55000 },
];
export const weaponById = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const weaponDps = (w) => w.dmg * w.rate * (w.pellets || 1) * (1 + (w.pierce || 0) * 0.25 + (w.splash ? 0.5 : 0) + (w.chain || 0) * 0.25);

// Each world: look (sky/fog/ground/track colours, prop style), enemy/boss style and a gameplay modifier.
export const WORLDS = [
  {
    id: 'bridge', name: 'Golden Bridge', tagline: 'Storm the great red bridge',
    sky: 0x8fd3ff, fog: 0xbfe6ff, fogNear: 60, fogFar: 230, ground: 0x2f8fd0, track: 0xc9c9cf, rail: 0xd2463c,
    light: 1.0, props: 'bridge', enemy: 0xe0302e, boss: { name: 'Red Brute', color: 0xd0302a, accent: 0x6b1b17, eye: 0xffee55, horns: false, mech: false },
    mod: {}, desc: 'Learn the ropes. Shoot gates to raise their numbers.',
  },
  {
    id: 'desert', name: 'Desert Canyon', tagline: 'Sandstorms cut your range',
    sky: 0xf3c98b, fog: 0xe9b679, fogNear: 40, fogFar: 170, ground: 0xd59a55, track: 0xc8a06a, rail: 0x8a5a2b,
    light: 1.05, props: 'desert', enemy: 0xd64a22, boss: { name: 'Sand Golem', color: 0xc78a45, accent: 0x7a4f22, eye: 0xff7a1a, horns: true, mech: false },
    mod: { rangeMult: 0.8, barrelWeight: 2 }, desc: 'Sandstorm: -20% weapon range. Explosive barrels everywhere.',
  },
  {
    id: 'temple', name: 'Jungle Temple', tagline: 'Ancient traps in the dark',
    sky: 0x1e2a24, fog: 0x24342b, fogNear: 25, fogFar: 140, ground: 0x2c3b2c, track: 0x7a6a52, rail: 0x5a5242,
    light: 0.65, props: 'temple', enemy: 0xc21f2f, boss: { name: 'Stone Colossus', color: 0x8f8a7a, accent: 0x4a473e, eye: 0x6cff6c, horns: true, mech: false },
    mod: { boulders: true, cageWeight: 2 }, desc: 'Rolling boulders and more prisoner cages to free.',
  },
  {
    id: 'frozen', name: 'Frozen Peaks', tagline: 'Ice makes you slide',
    sky: 0xcfe8ff, fog: 0xe8f4ff, fogNear: 30, fogFar: 160, ground: 0xf4fbff, track: 0xb9d8ee, rail: 0x6fa8d6,
    light: 1.1, props: 'frozen', enemy: 0xc0303a, boss: { name: 'Frost Titan', color: 0x7fc0ff, accent: 0x2f5f9a, eye: 0xffffff, horns: true, mech: false },
    mod: { ice: true }, desc: 'Icy track: your army slides when you steer.',
  },
  {
    id: 'volcano', name: 'Volcano Forge', tagline: 'Lava geysers erupt',
    sky: 0x3a1410, fog: 0x4a1a12, fogNear: 30, fogFar: 150, ground: 0xff4a10, track: 0x3b2f2c, rail: 0xff6a1a,
    light: 0.8, props: 'volcano', enemy: 0xff3a1a, boss: { name: 'Magma Behemoth', color: 0x3a2622, accent: 0xff5a10, eye: 0xffd000, horns: true, mech: false },
    mod: { geysers: true }, desc: 'Lava geysers erupt in lanes. Time your moves.',
  },
  {
    id: 'neon', name: 'Neon City', tagline: 'Shielded enemies, big guns',
    sky: 0x0a0820, fog: 0x160f38, fogNear: 40, fogFar: 180, ground: 0x0d0b22, track: 0x26243a, rail: 0xff2bd6,
    light: 0.7, props: 'neon', enemy: 0xff2b6a, boss: { name: 'Mech Walker', color: 0x3a3d52, accent: 0xff2bd6, eye: 0x2bf0ff, horns: false, mech: true },
    mod: { shield: 1.5, boardWeight: 2, saws: true }, desc: 'Enemies have +50% shields. More weapon drops and saw blades.',
  },
  {
    id: 'sky', name: 'Sky Fortress', tagline: 'Crosswinds push you around',
    sky: 0x6fb6ff, fog: 0xdcefff, fogNear: 50, fogFar: 220, ground: 0xffffff, track: 0xb6b2a8, rail: 0xe0c060,
    light: 1.1, props: 'sky', enemy: 0xb02020, boss: { name: 'Storm Warlord', color: 0x4a4f7a, accent: 0xffd34a, eye: 0x9ae6ff, horns: true, mech: false },
    mod: { wind: true, saws: true }, desc: 'Crosswinds drag your army toward the edge.',
  },
  {
    id: 'lunar', name: 'Lunar Base', tagline: 'Final war on the Moon',
    sky: 0x02030a, fog: 0x05060f, fogNear: 60, fogFar: 240, ground: 0x8a8a90, track: 0x55575f, rail: 0x2bf0a0,
    light: 0.9, props: 'lunar', enemy: 0x7cff4a, boss: { name: 'Alien Overlord', color: 0x3ad06a, accent: 0x1a5a2a, eye: 0xff2bd6, horns: true, mech: false },
    mod: { shield: 1.3, geysers: true, saws: true, boardWeight: 2 }, desc: 'Everything at once. Only the strongest army survives.',
  },
];
export const LEVELS_PER_WORLD = 5;

export const DIFFICULTIES = [
  { id: 'recruit',   name: 'Recruit',   hp: 0.7, coin: 0.8, bad: 0.5, desc: 'Relaxed. Weaker enemies.' },
  { id: 'soldier',   name: 'Soldier',   hp: 1.0, coin: 1.0, bad: 1.0, desc: 'The intended challenge.' },
  { id: 'veteran',   name: 'Veteran',   hp: 1.6, coin: 1.5, bad: 1.4, desc: 'Tougher enemies, more traps. 1.5x coins.' },
  { id: 'nightmare', name: 'Nightmare', hp: 2.8, coin: 2.2, bad: 1.9, desc: 'Brutal. Mistakes are fatal. 2.2x coins.' },
];

export const UPGRADES = [
  { id: 'troops', name: 'Recruits',  desc: '+2 starting soldiers',          base: 60,  growth: 1.45, max: 25 },
  { id: 'damage', name: 'Firepower', desc: '+6% damage',                    base: 90,  growth: 1.5,  max: 25 },
  { id: 'rate',   name: 'Fire Rate', desc: '+4% fire rate',                 base: 90,  growth: 1.5,  max: 20 },
  { id: 'armor',  name: 'Armor',     desc: '-3% losses from traps & bosses', base: 120, growth: 1.55, max: 15 },
  { id: 'income', name: 'Income',    desc: '+10% coins',                    base: 150, growth: 1.6,  max: 15 },
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.growth, lvl));
