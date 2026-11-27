/* What a phone call does to a sit (MainActivity audio focus -> window.FCPauseSession): the Quiet timer pauses, the
   background sound stops, the dark cover lifts, the phone's end bell is cancelled; Resume carries on with the time
   that was left, sound and bell back. A guided Faith prayer pauses the same way. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 26, 21, 30) });
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__alarm = [];
    window.FCAndroid = Object.assign(window.FCAndroid || {}, { calmAlarm: (ms, label) => window.__alarm.push(ms), keepAwake: () => {}, setBusy: () => {} });
  });
  await page.goto(base + '#calm');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}'); s.settings = Object.assign(s.settings || {}, { noise: 'brown', aim: 'calm' }); localStorage.setItem('wl.calm.v1', JSON.stringify(s)); });
  await page.reload();
  await t.step('a call pauses the Quiet timer: sound off, cover lifted, bell cancelled; Resume carries on', async () => {
    await page.goto(base + '#calm/s/timer'); await page.waitForSelector('#c-pp');
    await page.click('#c-len [data-len="5"]');
    await page.click('#c-pp');
    assert.strictEqual(await page.evaluate(() => WLNoise.current()), 'brown');
    await page.clock.runFor(70000); // a minute in: the dark cover is up
    assert.ok(await page.$('#c-dark'), 'dark cover up');
    const leftBefore = await page.textContent('#c-left');
    await page.evaluate(() => window.FCPauseSession());
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Resume');
    assert.strictEqual(await page.evaluate(() => WLNoise.current()), 'off', 'sound off');
    assert.ok(!(await page.$('#c-dark')), 'cover lifted');
    assert.strictEqual(await page.evaluate(() => window.__alarm[window.__alarm.length - 1]), 0, 'end bell cancelled');
    await page.clock.runFor(120000); // the call lasts two minutes: the timer doesn't move
    assert.strictEqual(await page.textContent('#c-left'), leftBefore);
    await page.click('#c-pp');
    assert.strictEqual(await page.textContent('#c-pp'), '⏸ Pause');
    assert.strictEqual(await page.evaluate(() => WLNoise.current()), 'brown', 'sound back');
    const ms = await page.evaluate(() => window.__alarm[window.__alarm.length - 1]);
    assert.ok(ms > 225000 && ms <= 231000, 'bell re-armed for the ~3:50 left: ' + ms);
    await page.evaluate(() => window.FCPauseSession()); await page.goto(base + '#calm');
  });
  await t.step('a call pauses a guided Faith prayer too', async () => {
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
    if ((await page.getAttribute('#pp', 'data-state')) !== 'playing') await page.click('#pp');
    await page.waitForFunction(() => document.getElementById('pp').dataset.state === 'playing');
    await page.evaluate(() => window.FCPauseSession());
    assert.notStrictEqual(await page.getAttribute('#pp', 'data-state'), 'playing');
    await page.goto(base + '#home');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('call pause');
})().catch((e) => { console.error(e); process.exit(1); });
