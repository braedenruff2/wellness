/* Move's coach line "Not for me?" (task 316): it hides that line only (numbers ignored), for 14 days, so a later,
   different line ("Very sore today…") still shows; an old-style flag keyed by program day hides nothing. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 22, 10, 0) });
  const { page, base } = t;
  const line = () => page.$$eval('main p.meta.ui', (ps) => ps.filter((p) => p.querySelector('[data-about^="guide:coach:"]') || /this week|sore|days\./i.test(p.textContent)).map((p) => p.textContent));
  await t.step('an old-style flag on the program day hides nothing', async () => {
    await page.goto(base + '#home');
    await page.evaluate(() => localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: [{ id: 'workout/notfit/coach:A', at: new Date(2026, 10, 21, 9).toISOString(), part: 'workout', about: 'coach:A', kind: 'notfit', a: { reasons: [] } }], checkins: {} })));
    await page.goto(base + '#home'); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(await page.locator('[data-me-fit][data-about^="guide:coach:"]').count(), 1, 'coach line with its Not for me?');
  });
  let about;
  await t.step('Not for me? hides this line', async () => {
    about = await page.getAttribute('[data-me-fit][data-about^="guide:coach:"]', 'data-about');
    assert.ok(!/[0-9]/.test(about), 'key has no numbers: ' + about);
    await page.click('[data-me-fit][data-about^="guide:coach:"]');
    await page.click('#me-sheet [data-r]');
    await page.click('#me-send');
    await page.goto(base + '#home'); await page.goto(base + '#workout'); await page.waitForSelector('h1');
    assert.strictEqual(await page.locator('[data-about="' + about + '"]').count(), 0, 'hidden');
  });
  await t.step('a different coach line (very sore today) still shows', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.workout.v1') || '{}'); s.sore = { '2026-11-22': { level: 'Very', at: new Date().toISOString() } }; localStorage.setItem('wl.workout.v1', JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('h1');
    const ls = await line();
    assert.ok(ls.some((x) => /Very sore today/.test(x)), 'sore line shown: ' + JSON.stringify(ls));
    const other = await page.getAttribute('[data-me-fit][data-about^="guide:coach:"]', 'data-about');
    assert.notStrictEqual(other, about);
  });
  await t.step('the hidden line comes back after 14 days', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.workout.v1') || '{}'); s.sore = {}; localStorage.setItem('wl.workout.v1', JSON.stringify(s)); });
    await page.clock.setSystemTime(new Date(2026, 11, 7, 10, 0));
    await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(await page.locator('[data-me-fit][data-about^="guide:coach:"]').count(), 1, 'a coach line with Not for me? again');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('workout coach line not for me');
})().catch((e) => { console.error(e); process.exit(1); });
