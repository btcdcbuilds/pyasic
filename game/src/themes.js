// Visual themes ("skins"). A theme changes how the game looks: players, enemies, bosses,
// stadium/scenery, coins, projectiles and names. Gameplay, levels and world twists stay the same,
// so every theme plays all 40 levels. Team names, logos and league marks are deliberately
// generic (no real clubs, leagues or brands).
import { WORLDS } from './data.js';

export const THEMES = [
  {
    id: 'classic', name: 'Army Rush', short: 'Army',
    desc: 'Soldiers, monsters and eight wild worlds.',
    swatch: ['#2f7bff', '#e0302e'],
    army: 0x2f7bff, armyKind: 'soldier', enemyKind: 'soldier', proj: 'tracer', env: 'world', coin: 'gold',
  },
  {
    id: 'bitcoin', name: 'Bitcoin Bulls', short: 'Bitcoin',
    desc: 'Bulls vs bears. Stack sats, dodge the FUD and send it to the Moon. Just for fun: no real bitcoin.',
    swatch: ['#f7931a', '#8a2a2a'],
    army: 0xf7931a, rail: 0xf7931a, armyKind: 'bull', enemyKind: 'bear', enemy: 0xb3262e, proj: 'tracer', projColor: 0xffb347, env: 'bitcoin', coin: 'btc',
    hero: { main: 0xf7931a, trim: 0xffffff },
    words: { 'DODGED!': 'HODL!', 'FIGHT!': 'BEAR ATTACK!', 'BONUS RUN!': 'TO THE MOON!', 'WEAK SPOT! x2 DAMAGE': 'WEAK HANDS! x2 DAMAGE', 'STAGE CLEAR!': 'BLOCK MINED!', 'HERO JOINED!': 'WHALE JOINED!', TROOPS: 'BULLS', 'Victory!': 'TO THE MOON!', Defeated: 'REKT!', FREED: 'HODLERS' },
    worlds: [
      { name: 'Genesis Block', boss: { name: 'Grizzly Bear', color: 0x6b4226, accent: 0x3e2414, eye: 0xff2a2a, bear: true } },
      { name: 'Mining Canyon', boss: { name: 'FUD Golem', color: 0xa86b3a, accent: 0x5a3415, eye: 0xff2a2a, bear: true } },
      { name: 'Cypherpunk Temple', boss: { name: 'Paper Hands', color: 0xe8e2d0, accent: 0x8a8370, eye: 0xff2a2a, bear: true } },
      { name: 'Crypto Winter', boss: { name: 'Polar Bear', color: 0xf2f6fa, accent: 0xa8c0d8, eye: 0x2a2aff, bear: true } },
      { name: 'Hashrate Forge', boss: { name: 'Margin Call', color: 0x3a2622, accent: 0xff5a10, eye: 0xffd000, bear: true } },
      { name: 'Neon Exchange', boss: { name: 'Rug Puller', color: 0x3a3d52, accent: 0xff2bd6, eye: 0xff2a2a, mech: true } },
      { name: 'Lightning Fortress', boss: { name: 'Bear Whale', color: 0x3a4a6a, accent: 0x1a2440, eye: 0xffd34a, bear: true } },
      { name: 'To The Moon', boss: { name: 'The Last Bear', color: 0x2a1a12, accent: 0xf7931a, eye: 0xff2a2a, bear: true } },
    ],
  },
  {
    id: 'gridiron', name: 'Gridiron Rush', short: 'Gridiron',
    desc: 'American football: helmets, pads and stadium lights. Throw your way to the end zone.',
    swatch: ['#1f4fd0', '#d0262a'],
    army: 0x1f4fd0, armyKind: 'gridiron', enemyKind: 'gridiron', enemy: 0xd0262a, proj: 'ball', ball: 0x7a3f1a, env: 'gridiron', coin: 'gold',
    hero: { main: 0x1f4fd0, trim: 0xffc81a },
    words: { 'DODGED!': 'JUKED!', 'FIGHT!': 'KICKOFF!', 'BONUS RUN!': 'VICTORY LAP!', 'STAGE CLEAR!': 'TOUCHDOWN!', 'HERO JOINED!': 'STAR PLAYER!', TROOPS: 'PLAYERS', 'Victory!': 'TOUCHDOWN!', FREED: 'SIGNED' },
    worlds: [
      { name: 'Rookie Bowl', boss: { name: 'The Big Lineman' } },
      { name: 'Desert Dome', boss: { name: 'Sand Linebacker' } },
      { name: 'Jungle Bowl', boss: { name: 'Stone Tackle' } },
      { name: 'Frozen Tundra Field', boss: { name: 'Ice Nose Tackle' } },
      { name: 'Lava Bowl', boss: { name: 'Magma Blitzer' } },
      { name: 'Neon Night Game', boss: { name: 'Mech Quarterback' } },
      { name: 'Sky Bowl', boss: { name: 'Storm Linebacker' } },
      { name: 'Moon Bowl', boss: { name: 'Galactic Champion' } },
    ],
  },
  {
    id: 'footy', name: 'Footy Rush', short: 'Footy',
    desc: 'Aussie rules football: guernseys, long socks and four goal posts. Kick it long!',
    swatch: ['#1d3fa8', '#c8202a'],
    army: 0x1d3fa8, armyKind: 'footy', enemyKind: 'footy', enemy: 0xc8202a, proj: 'ball', ball: 0xc8261e, env: 'footy', coin: 'gold',
    hero: { main: 0x1d3fa8, trim: 0xffffff },
    words: { 'DODGED!': 'SIDESTEP!', 'FIGHT!': 'BALL UP!', 'BONUS RUN!': 'LAP OF HONOUR!', 'STAGE CLEAR!': 'GOAL!', 'HERO JOINED!': 'STAR PLAYER!', TROOPS: 'PLAYERS', 'Victory!': 'PREMIERS!', FREED: 'SIGNED' },
    worlds: [
      { name: 'Harbour Oval', boss: { name: 'The Big Ruckman' } },
      { name: 'Outback Oval', boss: { name: 'Outback Ruckman' } },
      { name: 'Rainforest Oval', boss: { name: 'Stone Full-Forward' } },
      { name: 'Alpine Oval', boss: { name: 'Snowy Ruckman' } },
      { name: 'Volcano Oval', boss: { name: 'Magma Ruckman' } },
      { name: 'Neon Night Footy', boss: { name: 'Mech Full-Back' } },
      { name: 'Sky Oval', boss: { name: 'Storm Ruckman' } },
      { name: 'Moon Oval', boss: { name: 'Galactic Ruckman' } },
    ],
  },
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
// A theme's wording for a game message (falls back to the classic text)
export const say = (theme, text) => (theme.words && theme.words[text]) || text;

// The world as the renderer and menus should show it under a theme. Gameplay fields (mod, ids,
// props for the world twist) are kept; names, boss look and enemy colour can change.
export function themedWorld(wi, themeId) {
  const base = WORLDS[wi];
  const th = themeById(themeId);
  const tw = th.worlds && th.worlds[wi];
  if (!tw && !th.enemy) return base;
  const sport = th.armyKind === 'gridiron' || th.armyKind === 'footy';
  const boss = { ...base.boss, ...(tw ? tw.boss : {}) };
  if (sport) {
    // giant player of the rival team
    Object.assign(boss, { color: th.enemy, accent: 0xf2f2f2, eye: 0x1a1a1a, horns: false, bear: false, mech: false, player: th.armyKind });
  }
  return { ...base, name: tw ? tw.name : base.name, enemy: th.enemy ?? base.enemy, rail: th.rail ?? base.rail, boss };
}
