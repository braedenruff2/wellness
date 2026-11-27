/* Calm ambient background sound (white/pink/brown noise) + exact custom timer + after-sit autopilot note. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 10, 0) });
  const { page, base } = t;

  await page.addInitScript(() => {
    window.__noise = { starts: 0, stops: 0, loops: [], oscs: 0 };
    const AC = window.AudioContext;
    window.AudioContext = function () {
      const c = new AC();
      const origOsc = c.createOscillator.bind(c);
      c.createOscillator = function () { window.__noise.oscs++; return origOsc(); };
      const origBufSrc = c.createBufferSource.bind(c);
      c.createBufferSource = function () {
        const s = origBufSrc();
        const oStart = s.start.bind(s), oStop = s.stop.bind(s);
        s.start = function (...a) { window.__noise.starts++; window.__noise.loops.push(!!s.loop); return oStart(...a); };
        s.stop = function (...a) { window.__noise.stops++; return oStop(...a); };
        return s;
      };
      return c;
    };
  });

  await t.step('Calm settings saves background sound choice and reloads it', async () => {
    await page.goto(base + '#calm');
    await page.waitForSelector('#c-noise');
    await page.click('#c-noise [data-noise="white"]');
    await page.waitForSelector('#c-noise [data-noise="white"][aria-pressed="true"]');
    await page.reload();
    await page.waitForSelector('#c-noise [data-noise="white"][aria-pressed="true"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.noise);
    assert.strictEqual(saved, 'white');
  });

  await t.step('Exact timer: 75 s is 1:15 (not 0:59), under 10 s says so, a cleared field goes back to the chosen length', async () => {
    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-exact-m');
    const before = await page.textContent('#c-pp');
    await page.fill('#c-exact-s', '75');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 1:15');
    assert.strictEqual(await page.textContent('#c-exact-note'), '= 1:15');
    await page.fill('#c-exact-s', '5');
    assert.strictEqual(await page.textContent('#c-exact-note'), 'At least 10 seconds.');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 1:15', 'too short: the last good time stays');
    await page.fill('#c-exact-s', '');
    assert.strictEqual(await page.textContent('#c-pp'), before, 'cleared: back to the length chips');
    assert.strictEqual(await page.isHidden('#c-exact-note'), true);
    await page.fill('#c-exact-m', '200');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 120 min', 'at most 120 minutes');
    await page.fill('#c-exact-m', '');
  });

  await t.step('Quiet timer: exact custom minutes + seconds (1m 30s), looping white noise on play/pause/resume/finish, and exact mm:ss countdown', async () => {
    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-exact-m');
    await page.fill('#c-exact-m', '1');
    await page.fill('#c-exact-s', '30');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 1:30');
    assert.strictEqual(await page.getAttribute('#c-noise-pick [data-noise="white"]', 'aria-pressed'), 'true');

    const beforeOscs = await page.evaluate(() => window.__noise.oscs);
    await page.click('#c-pp');
    const afterStart = await page.evaluate(() => ({
      starts: window.__noise.starts,
      loops: window.__noise.loops.slice(),
      cur: window.WLNoise.current(),
      left: document.getElementById('c-left').textContent
    }));
    const oscDelta = (await page.evaluate(() => window.__noise.oscs)) - beforeOscs;
    assert.strictEqual(oscDelta, 3, 'only the start bell used oscillators (noise uses buffer source)');
    assert.strictEqual(afterStart.starts, 1, 'noise buffer started once');
    assert.deepStrictEqual(afterStart.loops, [true], 'noise loops seamlessly');
    assert.strictEqual(afterStart.cur, 'white');
    assert.ok(/^1:30 left$|^1:29 left$/.test(afterStart.left), 'exact mm:ss countdown: ' + afterStart.left);

    // Pause stops noise; resume restarts it
    await page.clock.runFor(5000);
    assert.strictEqual(await page.textContent('#c-left'), '1:25 left');
    await page.click('#c-pp'); // pause
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
    assert.ok((await page.evaluate(() => window.__noise.stops)) >= 1);
    await page.clock.runFor(10000);
    assert.strictEqual(await page.textContent('#c-left'), '1:25 left', 'paused time does not advance');
    await page.click('#c-pp'); // resume
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'white');
    assert.strictEqual(await page.evaluate(() => window.__noise.starts), 2);

    // Finish at 90s stops noise and shows after-screen with Note for autopilot button
    await page.clock.runFor(86000);
    await page.waitForSelector('#c-after:not([hidden])');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
    await page.click('#c-after [data-wl-note]');
    await page.waitForSelector('#wl-note-modal');
    assert.ok((await page.textContent('#wl-note-sheet')).includes('#calm/s/timer'));
    await page.fill('#wl-note-in', 'Loved the white noise on a 1:30 timer');
    await page.click('#wl-note-save');
    await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
    const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes);
    assert.strictEqual(notes[0].text, 'Loved the white noise on a 1:30 timer');
    assert.strictEqual(notes[0].where, '#calm/s/timer');
    await page.click('#c-save');
  });

  await t.step('Meditation-path sit: exact custom minutes (12 min), switch to brown noise on screen, exact mm:ss left', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-exact-m');
    await page.fill('#c-exact-m', '12');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 12 min');
    await page.click('#c-noise-pick [data-noise="brown"]');
    await page.click('#c-pp');
    await page.clock.runFor(3000);
    const left = await page.textContent('#c-left');
    assert.ok(/^11:5\d left$/.test(left), 'exact mm:ss on path sit: ' + left);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'brown');
    await page.click('#c-end');
    await page.waitForSelector('#c-today');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off', 'ending sit stops noise');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm noise & exact timer');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
