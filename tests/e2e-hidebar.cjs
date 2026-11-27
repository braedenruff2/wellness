/* Guard (task 324): the "Note for autopilot" bar hides during a workout session and Tagalog "Listen while walking",
   and comes back on every other screen (route() resets body classes), never staying hidden after leaving. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 22, 10, 0) });
  const { page, base } = t;
  const barShown = () => page.isVisible('#wl-bar');
  await t.step('an open workout hides the bar; Home, Journal and Cook show it again', async () => {
    await page.goto(base + '#home');
    await page.evaluate(() => localStorage.setItem('wl.workout.v1', JSON.stringify({ sessions: [{ id: 's1', date: '2026-11-22', day: 'A', start: new Date().toISOString(), end: null, sets: [{ i: 0, ex: 'Pushups', n: 1, val: 10, w: null, at: new Date().toISOString() }] }], history: [], next: {} })));
    await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(await barShown(), false, 'hidden in the session');
    for (const tab of ['home', 'journal', 'cook']) {
      await page.click('nav#tabs a[data-tab="' + tab + '"]');
      await page.waitForFunction((id) => location.hash === '#' + id, tab); await page.waitForTimeout(200);
      assert.strictEqual(await barShown(), true, 'shown on ' + tab);
      await page.click('nav#tabs a[data-tab="workout"]'); await page.waitForFunction(() => location.hash === '#workout'); await page.waitForTimeout(200);
      assert.strictEqual(await barShown(), false, 'hidden again on the session');
    }
  });
  await t.step('Tagalog Listen while walking hides it; leaving the lesson shows it', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/1'); await page.waitForSelector('#tl-walk');
    await page.click('#tl-walk');
    assert.strictEqual(await barShown(), false, 'hidden while walking');
    await page.click('nav#tabs a[data-tab="home"]');
    await page.waitForFunction(() => location.hash === '#home'); await page.waitForTimeout(200);
    assert.strictEqual(await barShown(), true, 'shown on Home');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('note bar');
})().catch((e) => { console.error(e); process.exit(1); });
