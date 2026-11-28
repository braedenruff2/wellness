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

  await t.step('414: a check-in note saying he is unwell ("we\'re all sick", "throat hurts") offers "Rest today (sick)" (reason Sick), even after a good night; "sick of" doesn\'t', async () => {
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('wl.workout.v1')); delete w.rest['2026-11-26']; localStorage.setItem('wl.workout.v1', JSON.stringify(w)); });
    await checkin({ sleep: '7 h+', wakes: '0', energy: 'OK', mood: 'Good', day: 'Good', note: 'I think we are all sick of this rain' });
    await home();
    assert.strictEqual(await page.$('#wo-rough-rest'), null, '"sick of": not unwell');
    await checkin({ sleep: '7 h+', wakes: '0', energy: 'OK', mood: 'Good', day: 'Good', note: 'I think we’re all sick. My throat hurts' });
    await home();
    await page.waitForSelector('#wo-rough-rest');
    assert.strictEqual((await page.textContent('#wo-rough-rest')).trim(), 'Rest today (sick)');
    await page.click('#wo-rough-rest');
    const w = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.strictEqual(w.rest['2026-11-26'].why, 'Sick');
    await page.goto(base + '#home'); await page.waitForSelector('.home-card');
    assert.ok(/A sick or teething day/.test(await page.textContent('#view')), 'Home guidance says so too');
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('wl.workout.v1')); delete w.rest['2026-11-26']; localStorage.setItem('wl.workout.v1', JSON.stringify(w)); });
  });

  await t.step('two such days in a week: "Your week" says 2 rest days he chose (never missed)', async () => {
    for (const [d, iso] of [[24, '2026-11-24'], [25, '2026-11-25']]) {
      await page.clock.setSystemTime(new Date(2026, 10, d, 9, 0));
      await page.evaluate((iso) => {
        const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.checkins[iso] = { sleep: 'Under 4 h', wakes: '3+', energy: 'Low', mood: 'OK', day: 'OK' };
        me.feedback = me.feedback.filter((f) => f.about !== 'roughrest'); localStorage.setItem('wl.me.v1', JSON.stringify(me));
      }, iso);
      await home(); await page.waitForSelector('#wo-rough-rest'); await page.click('#wo-rough-rest');
    }
    await page.clock.setSystemTime(new Date(2026, 10, 29, 19, 0)); // Sunday evening
    await home();
    const wk = await page.evaluate(() => WL.modules.workout.week());
    assert.ok(/2 rest days you chose/.test(wk), wk);
    assert.ok(!/miss/i.test(wk), wk);
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('workout rough night');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
