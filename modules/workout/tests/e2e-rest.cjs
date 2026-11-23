/* Rest days with a reason: "Not training today?" on Move > Today logs one, Home's today list shows it as done,
   Undo takes it back, and it isn't offered once a workout is logged that day. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 22, 19, 0) });
  const { page, base } = t;
  await page.goto(base + '#workout');
  await t.step('"Not training today?" lists the reasons', async () => {
    await page.click('#wo-rest summary');
    const chips = await page.$$eval('[data-rest]', (b) => b.map((x) => x.textContent));
    assert.deepStrictEqual(chips, ['Busy day', 'Sore', 'Tired', 'Sick', 'Planned rest']);
  });
  await t.step('Sore: saved, the coach line explains soreness and pain, Home counts the day as done', async () => {
    await page.click('[data-rest="Sore"]');
    assert.ok((await page.textContent('#wo-rest')).includes('Rest day logged: Sore'));
    const meta = await page.textContent('main');
    assert.ok(/normal when you’re getting back into it/.test(meta) && /doctor or physio/.test(meta));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')).rest);
    assert.strictEqual(saved['2026-11-22'].why, 'Sore');
    await page.goto(base + '#home');
    const li = await page.textContent('.today-list');
    assert.ok(/Move: rest day \(sore\)/.test(li), li);
  });
  await t.step('Sunday afternoon "Your week" names the rest day he chose', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 22, 15, 0)); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-week');
    const w = await page.textContent('#wl-week');
    assert.ok(/1 rest day you chose/.test(w), w);
    await page.clock.setSystemTime(new Date(2026, 10, 22, 19, 0));
  });
  await t.step('it survives a reload; Undo brings the choice back', async () => {
    await page.goto(base + '#workout'); await page.reload();
    await page.click('#wo-rest-undo');
    assert.ok(await page.isVisible('#wo-rest summary'));
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.ok(!st.rest || !st.rest['2026-11-22']); assert.strictEqual(st.restRemoved.length, 1);
  });
  await t.step('the next day after "Sore": two sets of each', async () => {
    await page.click('#wo-rest summary'); await page.click('[data-rest="Sore"]');
    await page.clock.setSystemTime(new Date(2026, 10, 23, 9, 0)); await page.reload();
    assert.ok(/two sets of each/.test(await page.textContent('main')));
    assert.ok(await page.isVisible('#wo-rest summary'), 'a new day offers the choice again');
  });
  await t.step('not offered once a set is logged today', async () => {
    await page.fill('#ex-0 .val', '10'); await page.click('#ex-0 .logbtn');
    assert.strictEqual(await page.$('#wo-rest'), null);
  });
  await t.step('no overflow, no errors', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.workout.v1')); s.sessions = []; s.rest = {}; localStorage.setItem('wl.workout.v1', JSON.stringify(s)); });
    await t.noOverflow(['#workout']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('workout rest days');
})().catch((e) => { console.error(e); process.exit(1); });
