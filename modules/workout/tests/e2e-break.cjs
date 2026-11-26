/* A workout done in two parts (half after lunch, the rest in the evening): the session clock counts the training,
   not the hours in between, and says so. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 23, 20, 50) });
  const { page, base } = t;
  await t.step('sets 14:56-15:45, then 20:43: "Session 56:00 (not counting the break)"', async () => {
    await page.goto(base + '#home');
    await page.evaluate(() => {
      const at = (h, m) => new Date(2026, 10, 23, h, m).toISOString();
      const w = JSON.parse(localStorage.getItem('wl.workout.v1') || '{}');
      w.sessions = [{ id: 'x1', date: '2026-11-23', day: 'B', start: at(14, 56), end: null,
        sets: [[0, 'Single Leg RDL', 1, at(14, 57)], [1, 'Pike Pushups', 1, at(15, 20)], [0, 'Single Leg RDL', 2, at(15, 45)], [1, 'Pike Pushups', 2, at(20, 43)]]
          .map(([i, ex, n, a]) => ({ i, ex, n, val: 8, w: null, at: a })) }];
      localStorage.setItem('wl.workout.v1', JSON.stringify(w));
    });
    await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#sessclock');
    // 14:56 -> 15:45 (49 min) + 20:43 -> 20:50 (7 min)
    assert.strictEqual(await page.textContent('#sessclock'), 'Session 56:00 (not counting the break)');
    await page.clock.runFor(61000);
    assert.strictEqual(await page.textContent('#sessclock'), 'Session 57:01 (not counting the break)');
    await t.noOverflow(['#workout']);
  });
  await t.step('no break: the plain clock', async () => {
    await page.evaluate(() => {
      const w = JSON.parse(localStorage.getItem('wl.workout.v1'));
      const at = (h, m) => new Date(2026, 10, 23, h, m).toISOString();
      w.sessions[0].start = at(20, 30); w.sessions[0].sets = [{ i: 0, ex: 'Single Leg RDL', n: 1, val: 20, w: 10, at: at(20, 35) }];
      localStorage.setItem('wl.workout.v1', JSON.stringify(w));
    });
    await page.reload(); await page.waitForSelector('#sessclock');
    assert.ok(/^Session 21:\d\d$/.test(await page.textContent('#sessclock')), await page.textContent('#sessclock'));
  });
  await t.step('logging for an earlier day: no session clock (its sets carry that day\'s date; review 26 Nov)', async () => {
    await page.goto(base + '#home'); await page.selectOption('#wl-logday', '2026-11-22');
    await page.evaluate(() => {
      const w = JSON.parse(localStorage.getItem('wl.workout.v1'));
      const at = (h, m) => new Date(2026, 10, 22, h, m).toISOString();
      w.sessions = [{ id: 'y1', date: '2026-11-22', day: 'A', start: at(20, 30), end: null, sets: [{ i: 0, ex: 'Single Leg RDL', n: 1, val: 20, w: 10, at: at(20, 40) }] }];
      localStorage.setItem('wl.workout.v1', JSON.stringify(w)); window.WL.modules.workout.reload();
    });
    await page.goto(base + '#workout'); await page.waitForSelector('#logday');
    assert.strictEqual(await page.$('#sessclock'), null);
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('workout break');
})().catch((e) => { console.error(e); process.exit(1); });
