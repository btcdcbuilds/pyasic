// Automated playtest: plays the real game build in a phone-sized headless Chrome,
// takes screenshots and records gameplay metrics for a Claude agent (or a person) to review.
//
// Usage (from game/):
//   npm run build
//   node tools/playtest.mjs --levels 1-1,1-3,3-2 --styles bot,naive --speed 2 --out playtest/run
//   (--upgrades N --weapon rifle to give the player a realistic loadout; --ui for menu screenshots)
//
// Levels are "world-level", 1-based (1-1 = Golden Bridge level 1).
// Styles: bot   = good player (steers for the best gate/reward, dodges traps)
//         naive = stays in the middle and only drifts a little (a distracted player)
//         lazy  = never steers at all
// Needs Chromium: set CHROME_PATH, otherwise /opt/pw-browsers/chromium-*/chrome-linux/chrome is used.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const levels = (args.levels || '1-1,1-3').split(',').map((s) => s.split('-').map((n) => +n - 1));
const styles = (args.styles || 'bot,naive').split(',');
const speed = +(args.speed || 2);
const out = path.resolve(args.out || 'playtest/run');
const shotEvery = +(args['shots-every'] || 4); // game seconds between screenshots
const diff = args.difficulty || 'soldier';
const upgrades = +(args.upgrades || 0);
const weapon = args.weapon || 'pistol';
const maxGameSeconds = +(args['max-seconds'] || 300);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base).sort().reverse()) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
    }
  }
  throw new Error('Chromium not found: set CHROME_PATH');
}

// tiny static server for dist/
const dist = path.resolve(args.dist || 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run "npm run build" first (dist/ is missing)');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/?speed=${speed}`;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// --ui: screenshot every menu screen (fresh player and a returning player with progress)
if (args.ui) {
  for (const [who, saveData] of [['new', null], ['veteran', { progress: 22, coins: 8400, tutorialDone: true, owned: ['pistol', 'smg', 'rifle', 'shotgun'], equipped: 'rifle', upgrades: { troops: 6, damage: 5 }, stars: { '0-0-soldier': 3, '0-1-soldier': 2 }, stats: { kills: 25000, levelsWon: 22, levelsPlayed: 30, bossesKilled: 50, bestArmy: 1400, playSeconds: 7200 } }]]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    if (saveData) await page.addInitScript((d) => localStorage.setItem('armyrush.save.v1', JSON.stringify(d)), saveData);
    await page.goto(url);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `ui-${who}-0-start.png`) });
    if (await page.isVisible('#btn-daily')) { await page.click('#btn-daily'); await page.waitForTimeout(200); }
    for (const scr of ['worlds', 'armory', 'upgrades', 'stats', 'settings']) {
      await page.click(`#scr-menu [data-go=${scr}]`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `ui-${who}-${scr}.png`), fullPage: true });
      await page.click(`#scr-${scr} [data-go=menu]`);
    }
    await page.click('#btn-play');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, `ui-${who}-play.png`) });
    await page.click('#btn-pause');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `ui-${who}-pause.png`) });
    await page.close();
  }
  console.log('UI screenshots saved');
}

const report = { generated: new Date().toISOString(), difficulty: diff, upgrades, speed, note: 'Headless software rendering: FPS numbers are much lower than a real phone and only useful for relative comparison.', runs: [] };

for (const [wi, li] of levels) {
  for (const style of styles) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__game);
    const tag = `w${wi + 1}-l${li + 1}-${style}`;
    await page.evaluate(({ wi, li, diff, upgrades, style, weapon }) => {
      const g = window.__game;
      const save = g.save;
      save.progress = 40;
      save.difficulty = diff;
      for (const k of ['troops', 'damage', 'rate', 'armor', 'income']) save.upgrades[k] = upgrades;
      if (!save.owned.includes(weapon)) save.owned.push(weapon);
      save.equipped = weapon;
      save.tutorialDone = !(wi === 0 && li === 0);
      // in-page telemetry
      const T = window.__pt = {
        events: {}, losses: {}, expire: [], hits: 0, unlocked: 0, collected: 0, missed: 0, gateMax: 0, gatesHit: 0,
        squads: 0, clashes: 0, dangerPeak: 0, firstBossHit: null, bossDown: null, frames: [], log: [], peak: 0,
        trackVisible: null,
      };
      g.onEvents = (evs, sim) => {
        for (const e of evs) {
          T.events[e.type] = (T.events[e.type] || 0) + 1;
          if (e.type === 'lose') T.losses[e.cause] = (T.losses[e.cause] || 0) + e.k;
          if (e.type === 'expire' && T.expire.length < 4000) T.expire.push(Math.round(e.travel));
          if (e.type === 'hit') T.hits++;
          if (e.type === 'unlock') T.unlocked++;
          if (e.type === 'collect') T.collected++;
          if (e.type === 'missed') { T.missed++; T.log.push(`${sim.t.toFixed(1)}s missed ${e.e.type}`); }
          if (e.type === 'clash') T.clashes++;
          if (e.type === 'spawn') T.squads++;
          if (e.type === 'gate') T.log.push(`${sim.t.toFixed(1)}s gate ${e.e.op}${e.e.v} -> army ${sim.n}`);
          if (e.type === 'weapon') T.log.push(`${sim.t.toFixed(1)}s weapon ${e.w.id}`);
          if (e.type === 'hit' && e.ent === 'boss' && T.firstBossHit === null) T.firstBossHit = sim.t;
          if (e.type === 'bossDown') T.bossDown = sim.t;
          if (e.type === 'lost' || e.type === 'won') T.log.push(`${sim.t.toFixed(1)}s ${e.type} with army ${sim.n}`);
        }
        T.peak = Math.max(T.peak, sim.n);
        T.dangerPeak = Math.max(T.dangerPeak, sim.danger || 0);
        for (const e of sim.ents) if (e.type === 'gate' && e.cap !== undefined && e.v >= e.cap && !e._maxSeen) { e._maxSeen = true; T.gateMax++; }
      };
      g.onFrame = (dt) => { if (T.frames.length < 20000) T.frames.push(dt); };
      g.startLevel(wi, li);
      const sim = g.sim;
      T.squads += sim.ents.filter((e) => e.type === 'squad').length;
      if (style === 'bot') g.setAutoplay(true);
      else {
        g.setAutoplay(false);
        let drift = 0;
        setInterval(() => {
          if (style === 'naive') { drift = Math.max(-2, Math.min(2, drift + (Math.random() - 0.5) * 2)); g.setTarget(drift); }
        }, 1500);
      }
    }, { wi, li, diff, upgrades, style, weapon });

    let lastShot = -shotEvery;
    let shots = 0;
    for (;;) {
      const st = await page.evaluate(() => { const s = window.__game.sim; return s ? { t: s.t, state: s.state, bossGap: s.boss.d - s.d, n: s.n } : null; });
      if (!st) break;
      if (st.t - lastShot >= shotEvery || (st.state !== 'run' && shots < 999)) {
        lastShot = st.t;
        await page.screenshot({ path: path.join(out, `${tag}-${String(Math.round(st.t)).padStart(3, '0')}s.png`) });
        shots++;
      }
      if (st.state !== 'run' || st.t > maxGameSeconds) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(out, `${tag}-zz-result.png`) });
    const data = await page.evaluate(() => {
      const s = window.__game.sim;
      const T = window.__pt;
      const ex = T.expire.slice().sort((a, b) => a - b);
      const fr = T.frames.slice().sort((a, b) => a - b);
      const lv = s.level;
      return {
        result: s.state, gameSeconds: +s.t.toFixed(1), levelLength: Math.round(lv.length), finalArmy: s.n, peakArmy: T.peak,
        kills: s.kills, heroes: s.heroes, weapon: s.weapon.id, weaponRange: Math.round(s.range()),
        bossHpLeft: Math.round(s.boss.hp), bossMaxHp: s.boss.maxHp,
        bossFightSeconds: T.firstBossHit === null ? null : +(((T.bossDown ?? s.t) - T.firstBossHit)).toFixed(1),
        bullets: { hits: T.hits, expiredWithoutHitting: T.expire.length, medianTravel: ex[Math.floor(ex.length / 2)] ?? null, maxTravel: ex[ex.length - 1] ?? null },
        rewards: { shotOpen: T.unlocked, collected: T.collected, missedAfterOpening: T.missed, gatesThatHitMax: T.gateMax },
        enemies: { squadsTotal: T.squads, clashes: T.clashes, peakDanger: +T.dangerPeak.toFixed(2) },
        losses: T.losses, events: T.events,
        fps: fr.length ? { median: Math.round(1 / fr[Math.floor(fr.length / 2)]), p5: Math.round(1 / fr[Math.floor(fr.length * 0.95)]) } : null,
        timeline: T.log.slice(0, 80),
      };
    });
    data.level = `${wi + 1}-${li + 1}`;
    data.style = style;
    data.errors = errors.slice(0, 10);
    report.runs.push(data);
    console.log(`${tag}: ${data.result} in ${data.gameSeconds}s, army ${data.finalArmy}/${data.peakArmy}, bullets median travel ${data.bullets.medianTravel}, missed rewards ${data.rewards.missedAfterOpening}, errors ${errors.length}`);
    await page.close();
  }
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
console.log(`Report: ${path.join(out, 'report.json')}`);
