const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const dir = __dirname;
  const file = 'file://' + path.join(dir, 'index.html');
  const outDir = path.join(dir, 'qa');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 2400, deviceScaleFactor: 1.25 });
  await page.goto(file, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await new Promise(r => setTimeout(r, 500));

  const errors = await page.evaluate(() => window.__errs || []);

  const views = [
    { key: 'instagram', out: 'qa-instagram.png' },
    { key: 'youtube', out: 'qa-youtube.png' },
    { key: 'proj:flow-longo', out: 'qa-flow-longo.png' }
  ];

  for (const v of views) {
    await page.evaluate(k => switchView(k), v.key);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(outDir, v.out), fullPage: true });
    console.log('captured', v.key, '->', v.out);
  }

  // sanity probes on the IG view
  await page.evaluate(k => switchView(k), 'instagram');
  await new Promise(r => setTimeout(r, 300));
  const probe = await page.evaluate(() => {
    const appW = document.querySelector('.app').getBoundingClientRect().width;
    const winW = window.innerWidth;
    return {
      appWidth: Math.round(appW), winWidth: winW,
      hasVeredito: !!document.querySelector('.verd-big'),
      hasFormula: !!document.querySelector('.fcard'),
      hasScatter: !!document.querySelector('.scatter-card svg circle'),
      hasVenceAfunda: !!document.querySelector('.va-card'),
      hasAcoes: document.querySelectorAll('.act').length,
      thumbsIG: document.querySelectorAll('.tbl-wrap .thumb').length,
      rowLinks: document.querySelectorAll('.tbl-wrap a.row-link').length,
      projNavItems: document.querySelectorAll('#sbNavProj .nav-item').length
    };
  });
  console.log('PROBE', JSON.stringify(probe, null, 2));

  // YouTube probe
  await page.evaluate(k => switchView(k), 'youtube');
  await new Promise(r => setTimeout(r, 300));
  const yt = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.tbl-wrap .cmt-cell')];
    return {
      thumbsYT: document.querySelectorAll('.tbl-wrap .thumb.horiz').length,
      errCells: cells.filter(c => c.classList.contains('err')).length,
      okCells: cells.filter(c => c.classList.contains('ok')).length,
      hasOldNote: document.body.innerText.includes('Por que vazio')
    };
  });
  console.log('YT', JSON.stringify(yt, null, 2));

  // project probe
  await page.evaluate(k => switchView(k), 'proj:flow-longo');
  await new Promise(r => setTimeout(r, 300));
  const pr = await page.evaluate(() => ({
    ativRows: document.querySelectorAll('.ativ-row').length,
    tbdRows: document.querySelectorAll('.ativ-row.tbd-row').length,
    hasLinkMeta: !!document.querySelector('.ativ-link-meta'),
    hasSsot: !!document.querySelector('.proj-hero .ssot-seal')
  }));
  console.log('PROJ', JSON.stringify(pr, null, 2));

  await browser.close();
})();
