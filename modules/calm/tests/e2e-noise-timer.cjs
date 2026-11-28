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
    await page.click('#c-settings summary');
    await page.waitForSelector('#c-noise');
    await page.click('#c-noise [data-noise="white"]');
    await page.waitForSelector('#c-noise [data-noise="white"][aria-pressed="true"]');
    await page.reload();
    await page.click('#c-settings summary');
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
    assert.strictEqual(await page.textContent('#c-pp'), before, 'too short: back to the chosen length, never a time it won\'t run');
    await page.fill('#c-exact-s', '');
    assert.strictEqual(await page.textContent('#c-pp'), before, 'cleared: back to the length chips');
    assert.strictEqual(await page.isHidden('#c-exact-note'), true);
    await page.fill('#c-exact-m', '200');
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · 120 min', 'at most 120 minutes');
    await page.fill('#c-exact-m', '');
    // a chip, then an exact time, then cleared: back to that chip; a chip tap also clears the note
    const chip = await page.$('#c-len [data-len]:not([aria-pressed="true"])');
    if (chip) {
      const len = await chip.getAttribute('data-len');
      await chip.click();
      await page.fill('#c-exact-s', '5');
      assert.strictEqual(await page.isVisible('#c-exact-note'), true);
      await page.fill('#c-exact-s', '');
      assert.strictEqual(await page.textContent('#c-pp'), '▶ Begin · ' + len + ' min', 'back to the chip just tapped');
      await page.fill('#c-exact-s', '75');
      await page.click('#c-len [data-len="' + len + '"]');
      assert.strictEqual(await page.isHidden('#c-exact-note'), true, 'chip tap clears the note');
    }
    // the note never stays up once the timer runs
    await page.fill('#c-exact-s', '75');
    assert.strictEqual(await page.isVisible('#c-exact-note'), true);
    await page.click('#c-pp');
    assert.strictEqual(await page.isHidden('#c-exact-note'), true, 'hidden during the session');
    await page.goto(base + '#calm');
    await page.waitForFunction(() => window.WLNoise.current() === 'off');
    await page.evaluate(() => { window.__noise.starts = 0; window.__noise.stops = 0; window.__noise.loops = []; }); // the next step counts its own
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

  await t.step('during a sit the sound can be switched or turned off (the row stays), paused it waits, gone on the questions', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="brown"]');
    await page.click('#c-pp');
    await page.clock.runFor(2000);
    assert.strictEqual(await page.isVisible('#c-noise-row'), true, 'sound choice still on screen during the sit');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'brown');
    const names = await page.$$eval('#c-noise-pick [data-noise]', (bs) => bs.map((b) => b.textContent));
    assert.deepStrictEqual(names, ['Off', 'Warm brown', 'Soft rain', 'White noise', 'Fan', 'Slow waves']);
    await page.click('#c-noise-pick [data-noise="fan"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'fan', 'switched at once');
    assert.strictEqual(await page.getAttribute('#c-noise-pick [data-noise="fan"]', 'aria-pressed'), 'true');
    await page.click('#c-noise-pick [data-noise="off"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off', 'turned off mid-sit');
    await page.click('#c-noise-pick [data-noise="ocean"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'ocean');
    await page.click('#c-pp'); // pause
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
    await page.click('#c-noise-pick [data-noise="pink"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off', 'paused: no sound until Resume');
    await page.click('#c-pp'); // resume
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'pink', 'Resume plays the newly picked sound');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.noise);
    assert.strictEqual(saved, 'pink', 'kept for the next sit');
    // the dark screen comes over it after 10 s; a tap lights it again and the row is there to tap
    await page.clock.runFor(11000);
    await page.waitForSelector('#c-dark');
    await page.click('#c-dark');
    await page.click('#c-noise-pick [data-noise="brown"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'brown');
    await page.click('#c-end');
    await page.waitForSelector('#c-today');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
  });

  await t.step('410: before a sit, tapping a sound plays a few seconds of it; Begin keeps it going; leaving stops it; Off is silent', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-noise-pick');
    assert.ok((await page.textContent('#c-noise-row')).includes('tap one to hear it'));
    await page.click('#c-noise-pick [data-noise="ocean"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'ocean', 'heard at once');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.previewing()), true);
    await page.clock.runFor(4500);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off', 'stops by itself after ~4 s');
    await page.click('#c-noise-pick [data-noise="fan"]');
    await page.clock.runFor(1000);
    await page.click('#c-pp'); // Begin during the preview
    await page.clock.runFor(6000);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'fan', 'the sit keeps the sound');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.previewing()), false);
    await page.click('#c-end'); await page.waitForSelector('#c-today');
    // leaving mid-preview stops it
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="pink"]');
    await page.goto(base + '#home'); await page.waitForSelector('.home-card');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off', 'left the sit screen: silent');
    // a sound picked, then Off before Begin: nothing plays in the sit
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="brown"]');
    await page.click('#c-noise-pick [data-noise="off"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
    await page.click('#c-pp'); await page.clock.runFor(5000);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
    await page.click('#c-end'); await page.waitForSelector('#c-today');
    // Calm settings: a sound chip plays a sample too
    await page.click('#c-settings summary'); await page.waitForSelector('#c-noise');
    await page.click('#c-noise [data-noise="white"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'white');
    await page.clock.runFor(4500);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'off');
  });

  await t.step('411: Soft / Medium / Louder for the sound, live during a sit, kept, hidden when the sound is Off', async () => {
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="brown"]');
    assert.strictEqual(await page.isVisible('#c-noise-pick-vol'), true);
    assert.strictEqual(await page.getAttribute('#c-noise-pick-vol [data-noise-vol="medium"]', 'aria-pressed'), 'true', 'medium by default');
    await page.click('#c-pp'); await page.clock.runFor(2000);
    await page.click('#c-noise-pick-vol [data-noise-vol="soft"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.volume()), 0.5, 'softer at once');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'brown', 'still playing');
    await page.click('#c-noise-pick-vol [data-noise-vol="loud"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.volume()), 1.7);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.noiseVol), 'loud');
    await page.click('#c-noise-pick [data-noise="off"]');
    assert.strictEqual(await page.isHidden('#c-noise-pick-vol'), true, 'no volume for no sound');
    await page.click('#c-end'); await page.waitForSelector('#c-today');
    await page.reload();
    await page.click('#c-settings summary'); await page.waitForSelector('#c-noise');
    assert.strictEqual(await page.isHidden('#c-noise-vol'), true);
    await page.click('#c-noise [data-noise="pink"]');
    await page.waitForSelector('#c-noise-vol [data-noise-vol="loud"][aria-pressed="true"]');
    await page.click('#c-noise-vol [data-noise-vol="medium"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.volume()), 1);
    await page.clock.runFor(5000);
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.step('the soft interval bell dips the background sound so it is heard; nothing to dip when the sound is off', async () => {
    await page.goto(base + '#calm');
    const r = await page.evaluate(() => {
      const out = {}; out.offDuck = WLNoise.duck(2.5);
      WLNoise.start('brown');
      const orig = WLNoise.duck; let calls = 0; WLNoise.duck = (s) => { calls++; return orig(s); };
      WL.softBell(); out.calls = calls; out.onDuck = orig(2.5);
      WLNoise.duck = orig; WLNoise.stop();
      return out;
    });
    assert.deepStrictEqual(r, { offDuck: false, calls: 1, onDuck: true });
  });
  await t.close('calm noise & exact timer');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
