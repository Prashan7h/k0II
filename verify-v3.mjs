import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + path.resolve(__dirname, 'ko2.html');
const errors = [];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);

const result = await page.evaluate(async () => {
  const k = window.__ko2;
  const out = { ok: false, checks: {}, metrics: {} };
  try {
    k.ensureAudio();
    if (!k.pads[0][0]?.buffer) k.loadDefaultKit();
    out.checks.pads = document.querySelectorAll('.pad').length;
    out.checks.hasKick = !!k.pads[0][0]?.buffer;

    // visuals
    const d = document.getElementById('device').getBoundingClientRect();
    const knob = document.getElementById('knobVol').getBoundingClientRect();
    const knobX = document.getElementById('knobX').getBoundingClientRect();
    out.metrics.volKnobPct = knob.width / d.width;
    out.metrics.bpmKnobPct = knobX.width / d.width;
    out.metrics.headerPct = document.querySelector('.header').getBoundingClientRect().height / d.height;
    out.metrics.fits = d.bottom <= window.innerHeight + 2;
    out.metrics.koFont = getComputedStyle(document.querySelector('.brand .ko')).fontSize;

    // sample swap punch
    k.state.mode = 'fx'; k.state.fxHeld = true;
    k.hitPad(10, 0.9, true); // pad "0" = swap
    out.checks.swapActive = k.state.punchFx.has(10);
    k.updatePunchFx();
    k.hitPad(10, 0, false);
    k.clearPunchFx();
    out.checks.swapClear = true;

    // velocity layers data
    const snd = k.pads[0][0];
    snd.layers = [
      { min: 0, max: 0.5, name: 'soft', buffer: k.pads[0][1].buffer },
      { min: 0.5, max: 1, name: 'hard', buffer: k.pads[0][0].buffer },
    ];
    k.hitPad(0, 0.3, true); k.hitPad(0, 0, false);
    k.hitPad(0, 0.9, true); k.hitPad(0, 0, false);
    out.checks.layers = snd.layers.length === 2;

    // step locks
    k.state.stepLockMode = true;
    k.state.currentStep = 0; k.state.selectedPad = 0;
    k.writeLiveLock('level', 0.5);
    k.writeLiveLock('pitch', -3);
    const n = k.currentPattern(0).notes.find(x => x.step === 0 && x.pad === 0);
    out.checks.locks = !!(n && n.locks && n.locks.level === 0.5 && n.locks.pitch === -3);
    k.state.stepLockMode = false;

    // panels exist
    out.checks.layerPanel = !!document.getElementById('layerPanel');
    out.checks.lockPanel = !!document.getElementById('lockPanel');

    k.commitScene();
    k.startPlay({});
    await new Promise(r => setTimeout(r, 500));
    out.checks.playing = k.state.playing;
    k.stopPlay();
    const b = await k.bounceWav();
    out.checks.bounce = b.peak > 0.001;
    out.ok = out.checks.pads === 12 && out.checks.hasKick && out.checks.playing && out.checks.bounce && out.checks.locks && out.checks.layers;
  } catch (e) {
    out.error = String(e);
    out.stack = e.stack;
  }
  return out;
});

await page.locator('#device').screenshot({ path: path.resolve(__dirname, 'screenshot.png') });
await browser.close();
console.log(JSON.stringify({ errors, result }, null, 2));
process.exit(errors.length || !result.ok ? 1 : 0);
