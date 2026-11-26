/* A rough night (today's check-in: sleep under 4 h, or energy Low): Home's Move card offers "Rest today (tired)";
   one tap keeps today as a rest day with the reason Tired (never a missed workout). Not without that check-in, not
   once a rest is logged, and not after "Not for me". */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 9, 0) });
  const { page, base } = t;
  const checkin = (c) => page.evaluate((c) => {
    const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
    me.checkins = me.checkins || {}; me.checkins['2026-11-26'] = c;
    localStorage.setItem('wl.me.v1', JSON.stringify(me));
  }, c);
  const home = async () => { await page.goto(base + '#calm'); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('.home-card[data-module="workout"]'); };

  await t.step('a 6-7 h night: no rest button', async () => {
    await page.goto(base + '#home');
    await checkin({ sleep: '6–7 h', wakes: '1', energy: 'OK', mood: 'OK', day: 'OK' });
    await home();
    assert.strictEqual(await page.$('#wo-rough-rest'), null);
  });

  await t.step('under 4 h: "Rest today (tired)" keeps today as a rest day', async () => {
    await checkin({ sleep: 'Under 4 h', wakes: '3+', energy: 'OK', mood: 'OK', day: 'OK' });
    await home();
    await page.waitForSelector('#wo-rough-rest');
    await page.click('#wo-rough-rest');
    const w = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.strictEqual(w.rest['2026-11-26'].why, 'Tired', JSON.stringify(w.rest));
    assert.strictEqual(await page.$('#wo-rough-rest'), null, 'gone once rested');
    await home();
    assert.strictEqual(await page.$('#wo-rough-rest'), null, 'and after a reload');
  });

  await t.step('energy Low counts too; "Not for me" hides it', async () => {
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('wl.workout.v1')); delete w.rest['2026-11-26']; localStorage.setItem('wl.workout.v1', JSON.stringify(w)); });
    await checkin({ sleep: '6–7 h', wakes: '0', energy: 'Low', mood: 'OK', day: 'OK' });
    await home();
    await page.waitForSelector('#wo-rough-rest');
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'workout/notfit/roughrest', at: new Date().toISOString(), part: 'workout', about: 'roughrest', kind: 'notfit', a: {} });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await home();
    assert.strictEqual(await page.$('#wo-rough-rest'), null);
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('workout rough night');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
