/* Calm sits: the screen goes dark 10 s into a meditation-path sit or the quiet timer (setting, on by default; tap to
   show the time, dark again 10 s later; pause, end and finish light it up), and the optional soft bell every 5 or
   10 min (never in the last 30 s, where the end bell rings). */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 25, 21, 0) });
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__dim = [];
    window.__oscs = 0;
    window.FCAndroid = { keepAwake: () => {}, calmAlarm: () => {}, dimScreen: (on) => window.__dim.push(!!on) };
    const AC = window.AudioContext;
    window.AudioContext = function () {
      const c = new AC();
      const orig = c.createOscillator.bind(c);
      c.createOscillator = function () { window.__oscs++; return orig(); };
      return c;
    };
  });
  const dark = () => page.evaluate(() => !!document.getElementById('c-dark'));
  const dims = () => page.evaluate(() => window.__dim.slice());

  await t.step('a path sit goes dark after 10 s; a tap shows the time and it goes dark again; pause and End light it up', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-len');
    assert.ok(await page.isVisible('#c-dark-hint'), 'the hint says the screen will go dark');
    await page.click('[data-len="10"]');
    await page.click('#c-pp');
    await page.clock.runFor(5000);
    assert.strictEqual(await dark(), false, 'not dark yet at 5 s');
    await page.clock.runFor(6000);
    assert.strictEqual(await dark(), true, 'dark after 10 s');
    assert.deepStrictEqual(await dims(), [true]);
    const box = await page.evaluate(() => { const r = document.getElementById('c-dark').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; });
    assert.ok(box[0] >= box[2] && box[1] >= box[3], 'covers the whole screen ' + box);
    await page.click('#c-dark');
    assert.strictEqual(await dark(), false, 'a tap shows the time');
    assert.deepStrictEqual(await dims(), [true, false]);
    assert.ok(await page.isVisible('#c-pp'));
    await page.clock.runFor(11000);
    assert.strictEqual(await dark(), true, 'dark again 10 s after the tap');
    await page.click('#c-dark');
    await page.click('#c-pp'); // pause
    await page.clock.runFor(20000);
    assert.strictEqual(await dark(), false, 'stays lit while paused');
    await page.click('#c-pp'); // resume
    await page.clock.runFor(11000);
    assert.strictEqual(await dark(), true, 'dark again after resuming');
    await page.keyboard.press('Space');
    assert.strictEqual(await dark(), false, 'Space lights the dark screen');
    assert.strictEqual(await page.getAttribute('#c-pp', 'data-state'), 'playing', 'and does not pause the sit');
    await page.clock.runFor(11000);
    await page.focus('#c-dark');
    await page.keyboard.press('Enter');
    assert.strictEqual(await dark(), false, 'Enter lights it too');
    await page.clock.runFor(11000);
    assert.strictEqual(await dark(), true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.strictEqual(await dark(), false, 'coming back to the app shows the time');
    await page.clock.runFor(11000);
    assert.strictEqual(await dark(), true, 'and goes dark again');
    await page.click('#c-dark');
    await page.click('#c-end');
    await page.waitForSelector('#c-today');
    await page.clock.runFor(15000);
    assert.strictEqual(await dark(), false);
    const d = await dims();
    assert.strictEqual(d[d.length - 1], false, 'brightness given back after the sit');
  });

  await t.step('the quiet timer goes dark and the end of it lights the screen for the questions', async () => {
    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-len');
    await page.click('[data-len="3"]');
    await page.click('#c-pp');
    await page.clock.runFor(11000);
    assert.strictEqual(await dark(), true);
    await page.clock.runFor(181000);
    await page.waitForSelector('#c-after:not([hidden])');
    assert.strictEqual(await dark(), false, 'the end lights the screen');
    const d = await dims();
    assert.strictEqual(d[d.length - 1], false);
    await page.click('#c-save');
  });

  await t.step('other practices never go dark (the voice or circle is the point)', async () => {
    await page.goto(base + '#calm/s/body');
    await page.waitForSelector('#c-pp');
    assert.strictEqual(await page.$('#c-dark-hint'), null);
    await page.click('#c-pp');
    await page.clock.runFor(15000);
    assert.strictEqual(await dark(), false);
    await page.click('#c-end');
    await page.waitForSelector('#c-today');
  });

  await t.step('setting Off: no dark screen, no hint; soft bell every 5 min rings once in a 10-min timer, then the end bell', async () => {
    await page.goto(base + '#calm');
    await page.click('#cdk');
    await page.waitForSelector('#cdk[aria-pressed="false"]');
    await page.click('[data-iv="5"]');
    await page.waitForSelector('[data-iv="5"][aria-pressed="true"]');
    await page.reload();
    await page.waitForSelector('#cdk[aria-pressed="false"]');
    assert.strictEqual(await page.getAttribute('[data-iv="5"]', 'aria-pressed'), 'true', 'interval kept after reload');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings);
    assert.strictEqual(st.dark, false); assert.strictEqual(st.interval, 5);

    await page.goto(base + '#calm/s/timer');
    await page.waitForSelector('#c-len');
    assert.strictEqual(await page.$('#c-dark-hint'), null, 'no hint when off');
    await page.click('[data-len="10"]');
    const o0 = await page.evaluate(() => window.__oscs);
    await page.click('#c-pp');
    const o1 = await page.evaluate(() => window.__oscs);
    assert.strictEqual(o1 - o0, 3, 'start bell');
    await page.clock.runFor(15000);
    assert.strictEqual(await dark(), false, 'never dark with the setting off');
    await page.clock.runFor(4 * 60000);
    assert.strictEqual(await page.evaluate(() => window.__oscs), o1, 'no bell before 5 min');
    await page.clock.runFor(50000);
    assert.strictEqual(await page.evaluate(() => window.__oscs) - o1, 1, 'one soft bell at 5 min');
    await page.clock.runFor(5 * 60000);
    await page.waitForSelector('#c-after:not([hidden])');
    assert.strictEqual(await page.evaluate(() => window.__oscs) - o1, 4, 'no interval bell at the end, just the end bell (3 tones)');
    await page.click('#c-save');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm dark screen');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
