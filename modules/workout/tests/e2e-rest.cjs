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
    assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('#wo-rest summary')), 'Undo restores focus to #wo-rest summary');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.ok(!st.rest || !st.rest['2026-11-22']); assert.strictEqual(st.restRemoved.length, 1);
  });
  await t.step('after Undo, Home plans the workout again (today list and card)', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('.today-list');
    const li = await page.textContent('.today-list');
    assert.ok(!/rest day/.test(li) && /Move/.test(li), li);
    const card = await page.textContent('.home-card[data-module="workout"]');
    assert.ok(/Next: /.test(card) && !/Done for today/.test(card), card);
    assert.strictEqual(await page.getAttribute('.home-card[data-module="workout"] a.primary', 'href'), '#workout');
  });
  await t.step('Home\'s "Rest today (tired)" by mistake: Undo on Move takes it back too', async () => {
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
      m.feedback = m.feedback || []; m.checkins = m.checkins || {};
      m.checkins['2026-11-22'] = { at: '2026-11-22T12:00:00.000Z', sleep: 'Under 4 h', energy: 'Low' };
      localStorage.setItem('wl.me.v1', JSON.stringify(m));
    });
    await page.reload(); await page.waitForSelector('#wo-rough-rest');
    await page.click('#wo-rough-rest');
    assert.ok(/rest day \(tired\)/.test(await page.textContent('.today-list')));
    await page.goto(base + '#workout'); await page.click('#wo-rest-undo');
    await page.goto(base + '#home'); await page.waitForSelector('#wo-rough-rest');
    assert.ok(!/rest day/.test(await page.textContent('.today-list')), 'planned again');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.ok(!st.rest || !st.rest['2026-11-22']);
    await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('wl.me.v1')); delete m.checkins['2026-11-22']; localStorage.setItem('wl.me.v1', JSON.stringify(m)); });
    await page.goto(base + '#workout'); await page.reload();
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
  await t.step('after busy weeks: "Would 2 a week fit better?" -> Yes sets 2 (dots, Setup); Setup can set 3 again', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.workout.v1'));
      s.sessions = []; s.rest = { '2026-11-04': { why: 'Busy day', at: '2026-11-04T12:00:00.000Z' }, '2026-11-11': { why: 'Busy day', at: '2026-11-11T12:00:00.000Z' } };
      localStorage.setItem('wl.workout.v1', JSON.stringify(s));
    });
    await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-two');
    await page.click('#wo-two-yes');
    assert.strictEqual(!!(await page.$('#wo-two')), false);
    assert.ok(/of 2 workouts this week/.test(await page.getAttribute('.dots', 'aria-label')));
    await page.goto(base + '#workout/settings');
    assert.strictEqual(await page.getAttribute('[data-target="2"]', 'aria-pressed'), 'true');
    await page.click('[data-target="3"]');
    assert.strictEqual(await page.getAttribute('[data-target="3"]', 'aria-pressed'), 'true');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')));
    assert.strictEqual(st.target, undefined);
  });
  await t.step('"Not now" hides the offer', async () => {
    await page.goto(base + '#workout'); await page.waitForSelector('#wo-two');
    await page.click('#wo-two-no');
    await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(!!(await page.$('#wo-two')), false);
  });
  await t.step('the day after a workout: "Sore from last time?" -> Very gives the two-sets line; asked once a day', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.workout.v1'));
      s.sessions = [{ id: 'x1', date: '2026-11-22', day: 'A', start: '2026-11-22T14:00:00.000Z', end: '2026-11-22T14:30:00.000Z', sets: [{ i: 0, ex: 'Bulgarian Split Squats', n: 1, val: 12, w: 10, at: '2026-11-22T14:05:00.000Z' }] }];
      s.rest = {}; s.sore = {}; localStorage.setItem('wl.workout.v1', JSON.stringify(s));
    });
    await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-sore');
    await page.click('[data-sore="Very"]');
    assert.strictEqual(!!(await page.$('#wo-sore')), false);
    assert.ok(/Very sore today: do two sets of each/.test(await page.textContent('main')));
    await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(!!(await page.$('#wo-sore')), false, 'not asked again today');
  });
  await t.step('pain after two recent workouts: one general line on Move with "Not for me?"; tapping it away hides it', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
      [18, 20].forEach((d) => me.feedback.push({ id: 'workout/after/p' + d, at: new Date(2026, 10, d, 18).toISOString(), part: 'workout', about: 'p' + d, kind: 'after', a: { hard: 'Hard', pain: 'A little' } }));
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-pain');
    assert.ok(/see a doctor or physio/.test(await page.textContent('#wo-pain')));
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'workout/notfit/guide:pain', at: new Date(2026, 10, 22, 18).toISOString(), part: 'workout', about: 'guide:pain', kind: 'notfit', a: { reasons: [] } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('h1');
    assert.strictEqual(await page.$('#wo-pain'), null);
    // After 14 days pass and pain recurs twice, #wo-pain returns with its "Not for me?" button
    await page.clock.setSystemTime(new Date(2026, 11, 10, 10, 0));
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      [7, 9].forEach((d) => me.feedback.push({ id: 'workout/after/pdec' + d, at: new Date(2026, 11, d, 18).toISOString(), part: 'workout', about: 'pdec' + d, kind: 'after', a: { hard: 'Hard', pain: 'A little' } }));
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-pain');
    assert.ok(await page.$('#wo-pain [data-me-fit="1"]'), '#wo-pain returns after 14 days with Not for me? button');
  });
  await t.step('no overflow, no errors', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.workout.v1')); s.sessions = []; s.rest = {}; localStorage.setItem('wl.workout.v1', JSON.stringify(s)); });
    await t.noOverflow(['#workout']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('workout rest days');
})().catch((e) => { console.error(e); process.exit(1); });
