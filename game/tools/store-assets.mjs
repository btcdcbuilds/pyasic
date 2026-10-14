// Generates Play Store screenshots (1080x1920) from the real game build.
// Usage (from game/): npm run build && node tools/store-assets.mjs   -> store/screenshots/*.png
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('store/screenshots');
fs.mkdirSync(out, { recursive: true });
const dist = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const chrome = process.env.CHROME_PATH || fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function page() {
  const p = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
  await p.addInitScript(() => localStorage.setItem('armyrush.save.v1', JSON.stringify({ progress: 40, coins: 12500, tutorialDone: true, daily: { last: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), streak: 1 }, owned: ['pistol', 'smg', 'rifle'], equipped: 'rifle' })));
  await p.goto(url);
  await p.waitForFunction(() => window.__game);
  return p;
}
// advance the simulation quickly but keep its events for the renderer
const ff = (p, cond) => p.evaluate((cond) => {
  const g = window.__game, s = g.sim, test = new Function('s', `return ${cond}`);
  for (let i = 0; i < 60000 && s.state === 'run' && !test(s); i++) s.update(1 / 60, g.botTarget(s));
  s.events.length = 0;
}, cond);

const shots = [
  ['01-menu', async (p) => { await p.waitForTimeout(800); }],
  ['02-bridge-run', async (p) => {
    await p.evaluate(() => { window.__game.startLevel(0, 1); window.__game.setAutoplay(true); });
    await ff(p, "s.ents.some(e => e.type === 'board' && e.d - s.d < 32 && e.d - s.d > 20)");
    await p.waitForTimeout(1800);
  }],
  ['03-horde-lanes', async (p) => {
    await p.evaluate(() => { window.__game.startLevel(2, 2); window.__game.setAutoplay(true); });
    await ff(p, '(s.dividers[0] ? s.d > s.dividers[0].d0 - 2 : true)');
    await p.waitForTimeout(2600);
  }],
  ['04-boss-dodge', async (p) => {
    await p.evaluate(() => { window.__game.startLevel(4, 1); window.__game.setAutoplay(true); });
    await ff(p, 's.bosses[0].d - s.d < 40');
    await p.waitForFunction(() => window.__game.sim.boss.atk && window.__game.sim.boss.atk.t < window.__game.sim.boss.atk.tele * 0.4, null, { timeout: 60000 }).catch(() => {});
  }],
  ['05-neon-city', async (p) => {
    await p.evaluate(() => { window.__game.startLevel(5, 2); window.__game.setAutoplay(true); });
    await ff(p, 's.ents.some(e => e.type === "squad" && e.alive && e.d - s.d < 60 && e.d - s.d > 35)');
    await p.waitForTimeout(1500);
  }],
  ['06-bonus-run', async (p) => {
    await p.evaluate(() => { window.__game.startLevel(1, 0); window.__game.setAutoplay(true); });
    await ff(p, 's.bonus && s.ents.some(e => e.type === "bonus" && e.reached && e.step >= 1)');
    await p.waitForTimeout(1200);
  }],
];

for (const [name, run] of shots) {
  const p = await page();
  await run(p);
  await p.screenshot({ path: path.join(out, `${name}.png`) });
  console.log('saved', name);
  await p.close();
}
await browser.close();
server.close();
