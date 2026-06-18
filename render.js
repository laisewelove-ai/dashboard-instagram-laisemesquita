const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const dir = __dirname;
  const file = 'file://' + path.join(dir, 'index.html');
  const out = path.join(dir, 'dashboard-instagram-laisemesquita.png');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 2400, deviceScaleFactor: 1.5 });
  await page.goto(file, { waitUntil: 'networkidle0' });

  // ensure fonts + icons are ready
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => {
    const v = document.querySelector('.view.active');
    const nav = document.querySelector('.nav-item .nav-ic svg');
    const tbl = v && v.querySelector('.tbl-wrap tbody tr');
    const kpi = v && v.querySelector('.kpi-ic svg');
    return v && nav && tbl && kpi;
  }, { timeout: 8000 });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log('written', out);
})();
