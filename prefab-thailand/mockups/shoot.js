// Render each mockup screen to PNG with the preinstalled Chromium.
const { chromium } = require('playwright');
const path = require('path');
const shots = [
  ['01-website-home', 1440, 900], ['02-see-it-on-your-land', 1440, 900],
  ['03-configurator', 1440, 1000], ['04-line-chat', 520, 900], ['05-owner-approvals', 520, 900],
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  for (const [name, w, h] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + path.join(__dirname, 'screens', name + '.html'));
    await page.screenshot({ path: path.join(__dirname, 'png', name + '.png') });
    console.log('shot', name);
  }
  await browser.close();
})();
