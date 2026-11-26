/* Calm screen-off bell & wake catch-up: meditation-path sits and Quiet timer keep the screen awake and arm
   FCAndroid.calmAlarm for the end, cancel on pause/end, re-arm remaining time on resume, and catch up cleanly on
   wake after the alarm already rang (no duplicate Web Audio bell; minutes capped at the sit length). */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 25, 20, 0) });
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__calmAlarms = [];
    window.__awake = [];
    window.__oscs = 0;
    window.FCAndroid = {
      keepAwake: (on) => window.__awake.push(!!on),
      calmAlarm: (ms, label) => window.__calmAlarms.push([Math.round(ms / 1000), label])
    };
    const AC = window.AudioContext;
    window.AudioContext = function () {
      const c = new AC();
      const orig = c.createOscillator.bind(c);
      c.createOscillator = function () { window.__oscs++; return orig(); };
      return c;
    };
  });

  await t.step('meditation-path sit arms calmAlarm and keepAwake; Pause cancels, Resume re-arms remaining time, End cancels', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-len');
    await page.click('[data-len="10"]');
    await page.click('#c-pp');
    let alarms = await page.evaluate(() => window.__calmAlarms);
    let awake = await page.evaluate(() => window.__awake);
    assert.deepStrictEqual(alarms[alarms.length - 1], [600, 'Counting breaths · 10 min'], JSON.stringify(alarms));
    assert.strictEqual(awake[awake.length - 1], true);

    await page.clock.fastForward(2 * 60000);
    if (await page.$('#c-dark')) await page.click('#c-dark'); // the screen went dark during the sit (e2e-dark.cjs): a tap shows it
    await page.click('#c-pp'); // Pause
    alarms = await page.evaluate(() => window.__calmAlarms);
    awake = await page.evaluate(() => window.__awake);
    assert.deepStrictEqual(alarms[alarms.length - 1], [0, ''], 'pause cancels alarm');
    assert.strictEqual(awake[awake.length - 1], false, 'pause releases keepAwake');

    await page.clock.fastForward(60000); // paused for 1 min (should not count toward elapsed)
    await page.click('#c-pp'); // Resume -> 8 min left
    alarms = await page.evaluate(() => window.__calmAlarms);
    awake = await page.evaluate(() => window.__awake);
    assert.strictEqual(alarms[alarms.length - 1][0], 480, 'resume re-arms remaining 8 min');
    assert.strictEqual(awake[awake.length - 1], true);

    await page.click('#c-end');
    await page.waitForSelector('#c-today');
    alarms = await page.evaluate(() => window.__calmAlarms);
    awake = await page.evaluate(() => window.__awake);
    assert.deepStrictEqual(alarms[alarms.length - 1], [0, ''], 'ending cancels alarm');
    assert.strictEqual(awake[awake.length - 1], false);
  });

  await t.step('screen locked past a sit’s end: waking finishes sit cleanly with 0 duplicate bells and capped minutes', async () => {
    await page.goto(base + '#calm/s/follow');
    await page.waitForSelector('#c-len');
    await page.click('[data-len="10"]');
    await page.click('#c-pp');
    const oscsAfterStart = await page.evaluate(() => window.__oscs);
    assert.ok(oscsAfterStart >= 3, 'start bell rang');

    // Simulate locking the phone (hidden = true, timers frozen), then unlocking 12 min later
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const nowMs = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(nowMs + 12 * 60000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });

    await page.waitForSelector('#c-after:not([hidden])');
    assert.ok(await page.$('#c-focus'), 'sit after-questions shown on wake');
    assert.strictEqual(await page.evaluate(() => window.__oscs), oscsAfterStart, 'no duplicate Web Audio bell after native screen-off alarm');
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions);
    const last = sessions[sessions.length - 1];
    assert.strictEqual(last.id, 'follow');
    assert.strictEqual(last.mins, 10, 'logged minutes capped at the 10-min sit length');
    const alarms = await page.evaluate(() => window.__calmAlarms);
    assert.deepStrictEqual(alarms[alarms.length - 1], [0, '']);
  });

  await t.step('Quiet timer: arms calmAlarm, rings Web Audio bell when on screen, skips duplicate bell on screen-off wake', async () => {
    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-len');
    await page.click('[data-len="3"]');
    await page.click('#c-pp');
    let alarms = await page.evaluate(() => window.__calmAlarms);
    assert.deepStrictEqual(alarms[alarms.length - 1], [180, 'Quiet timer · 3 min']);

    // On-screen completion plays the end bell
    const oscsBefore = await page.evaluate(() => window.__oscs);
    await page.clock.runFor(181 * 1000);
    await page.waitForSelector('#c-after:not([hidden])');
    assert.strictEqual(await page.evaluate(() => window.__oscs) - oscsBefore, 3, 'on-screen timer plays end bell');
    await page.click('#c-save');

    // Screen-off wake past end plays 0 duplicate bells
    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-len');
    await page.click('[data-len="3"]');
    await page.click('#c-pp');
    const oscs2 = await page.evaluate(() => window.__oscs);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const nowMs = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(nowMs + 5 * 60000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForSelector('#c-after:not([hidden])');
    assert.strictEqual(await page.evaluate(() => window.__oscs), oscs2, 'no duplicate bell when Quiet timer ended with screen off');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm alarm');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
