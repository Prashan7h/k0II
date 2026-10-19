import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + path.resolve(__dirname, 'ko2.html');

async function shot(w, h, name) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  // measure device
  const metrics = await page.evaluate(() => {
    const d = document.getElementById('device');
    const r = d.getBoundingClientRect();
    const hdr = d.querySelector('.header').getBoundingClientRect();
    const disp = d.querySelector('.display').getBoundingClientRect();
    const pad = d.querySelector('.pad')?.getBoundingClientRect();
    const bottom = d.getBoundingClientRect().bottom;
    const pads = [...d.querySelectorAll('.pad')].map(p => p.getBoundingClientRect());
    const lastPad = pads[pads.length - 1];
    return {
      device: { w: r.width, h: r.height, aspect: r.width/r.height, top: r.top, bottom: r.bottom },
      headerPct: hdr.height / r.height,
      displayPct: disp.height / r.height,
      padWPct: pad ? pad.width / r.width : 0,
      padHPct: pad ? pad.height / r.height : 0,
      clipped: lastPad ? lastPad.bottom > r.bottom - 2 : null,
      lastPadBottom: lastPad?.bottom, deviceBottom: r.bottom,
      viewportH: window.innerHeight,
      fits: r.bottom <= window.innerHeight + 1,
    };
  });
  await page.locator('#device').screenshot({ path: path.resolve(__dirname, name) });
  await page.screenshot({ path: path.resolve(__dirname, name.replace('.png','-full.png')) });
  await browser.close();
  return { metrics, errors };
}

const a = await shot(1280, 900, 'shot-1280.png');
const b = await shot(1440, 900, 'shot-1440.png');
console.log(JSON.stringify({ a, b }, null, 2));
