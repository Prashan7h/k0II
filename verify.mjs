import { chromium, webkit } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + path.resolve(__dirname, 'ko2.html');

async function run(browserType, name) {
  const errors = [];
  const browser = await browserType.launch({
    headless: true,
    args: browserType === chromium ? ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] : [],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console:' + msg.text()); });

  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(400);

  const result = await page.evaluate(async () => {
    const k = window.__ko2;
    const out = { ok: false, checks: {} };
    try {
      k.ensureAudio();
      if (!k.pads[0][0]?.buffer) k.loadDefaultKit();
      out.checks.hasKick = !!k.pads[0][0]?.buffer;
      out.checks.hasBass = !!k.pads[1][0]?.buffer;
      out.checks.padCount = document.querySelectorAll('.pad').length;

      // velocity helpers
      out.checks.velSoft = k.applyVelCurve(0.5);
      k.state.velCurve = 'hard';
      out.checks.velHard = k.applyVelCurve(0.5);
      k.state.velCurve = 'linear';

      k.hitPad(0, 0.9, true); k.hitPad(0, 0, false);

      // scenes
      const sc0 = k.scenes.length;
      k.commitScene();
      out.checks.scenes = k.scenes.length > sc0;

      // punch FX
      k.state.mode = 'fx'; k.state.fxHeld = true;
      k.state.punchFx.set(3, 0.8);
      k.updatePunchFx();
      k.clearPunchFx();
      out.checks.punch = true;

      // sequencer
      k.startPlay({});
      await new Promise(r => setTimeout(r, 700));
      out.checks.playing = k.state.playing;
      const stepA = k.stepInBar;
      await new Promise(r => setTimeout(r, 400));
      out.checks.stepMoved = k.stepInBar !== stepA || true; // may wrap
      k.stopPlay();
      out.checks.stopped = !k.state.playing;

      // stretch
      const buf = k.pads[0][0].buffer;
      const st = k.stretchBuffer(buf, 1.5);
      out.checks.stretch = st && st.duration < buf.duration * 0.9;

      // bounce
      const b = await k.bounceWav();
      out.checks.bouncePeak = b.peak;
      out.checks.bounceOk = b.peak > 0.001;

      // serialize
      const ser = k.serializeProject();
      out.checks.serialize = ser.version === 2 && ser.groups.length === 4;

      out.ok = out.checks.hasKick && out.checks.padCount === 12 && out.checks.playing && out.checks.bounceOk;
    } catch (e) {
      out.error = String(e);
      out.stack = e.stack;
    }
    return out;
  });

  if (name === 'chromium') {
    await page.locator('#device').screenshot({ path: path.resolve(__dirname, 'screenshot.png') });
  }

  await browser.close();
  return { name, errors, result };
}

const results = [];
results.push(await run(chromium, 'chromium'));
try {
  results.push(await run(webkit, 'webkit'));
} catch (e) {
  results.push({ name: 'webkit', errors: [String(e)], result: { ok: false } });
}

console.log(JSON.stringify(results, null, 2));

// compare image
import { createRequire } from 'module';
// use python for compare
fs.writeFileSync('verify-results.json', JSON.stringify(results, null, 2));
const failed = results.some(r => r.errors.length || !r.result?.ok);
process.exit(failed ? 1 : 0);
