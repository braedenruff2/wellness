/* The rest timer asks the phone for an alarm (so it beeps with the screen off), moves it with +15 s, cancels it on Skip,
   and the page doesn't beep a second time when you come back after the alarm already went. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open();
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__alarms = [];
    window.FCAndroid = { restAlarm: (ms, label) => window.__alarms.push([Math.round(ms / 1000), label]) };
    window.__beeps = 0;
    window.__oscs = 0;
    const AC = window.AudioContext;
    window.AudioContext = function () {
      window.__beeps++;
      const c = new AC();
      const orig = c.createOscillator.bind(c);
      c.createOscillator = function () { window.__oscs++; return orig(); };
      return c;
    };
  });
  await page.goto(base + '#workout');
  await t.step('logging a set sets the phone alarm for the rest', async () => {
    await page.fill('#ex-0 .val', '12'); await page.click('#ex-0 .logbtn');
    const a = await page.evaluate(() => window.__alarms);
    assert.deepStrictEqual(a[0][0], 20); assert.ok(/Pushups/.test(a[0][1]), JSON.stringify(a));
  });
  await t.step('+15 s moves it, Skip cancels it', async () => {
    await page.click('#rest-plus');
    let a = await page.evaluate(() => window.__alarms);
    assert.strictEqual(a[a.length - 1][0], 35, JSON.stringify(a));
    await page.click('#rest-skip');
    a = await page.evaluate(() => window.__alarms);
    assert.deepStrictEqual(a[a.length - 1], [0, ''], JSON.stringify(a));
  });
  await t.step('on screen at the end: the page beeps once', async () => {
    await page.fill('#ex-1 .val', '15'); await page.click('#ex-1 .logbtn');
    const before = await page.evaluate(() => window.__beeps);
    await page.clock.runFor(76000);
    assert.strictEqual(await page.evaluate(() => window.__beeps) - before, 1);
  });
  await t.step('back long after the end (the alarm went): no second beep', async () => {
    await page.fill('#ex-2 .val', '10'); await page.click('#ex-2 .logbtn');
    const before = await page.evaluate(() => window.__oscs);
    // the screen was off (no page timers ran), then it comes back 200 s later: the timer fires once, far past the end
    await page.clock.fastForward(200000);
    await page.clock.runFor(1000);
    assert.strictEqual(await page.evaluate(() => window.__oscs) - before, 0);
  });
  await t.step('a second rest end reuses the same AudioContext (never hits WebView 6-context cap)', async () => {
    const beforeCtx = await page.evaluate(() => window.__beeps);
    const beforeOsc = await page.evaluate(() => window.__oscs);
    await page.fill('#ex-3 .val', '10'); await page.click('#ex-3 .logbtn');
    await page.clock.runFor(61000);
    assert.strictEqual(await page.evaluate(() => window.__beeps), beforeCtx, 'AudioContext reused');
    assert.strictEqual(await page.evaluate(() => window.__oscs) - beforeOsc, 2, 'both tones still played');
  });
  await t.step('no console errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('workout alarm browser');
})().catch((e) => { console.error(e); process.exit(1); });
