/* Home today list and "Your week" across midnight boundaries (23:59 -> 00:00) and DST end (Sun 1 Nov 2026 in
   America/Halifax, when 01:00-02:00 happens twice and the day is 25 hours long). Checks every module's today()
   and week() in Halifax time, including late-evening items that are already "tomorrow" in UTC. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

// UTC instants corresponding to exact America/Halifax wall-clock times around DST end (1 Nov 2026 02:00 ADT -> 01:00 AST)
const T = {
  sunPrev2355: '2026-10-26T02:55:00.000Z', // Sun 25 Oct 23:55 ADT (already Mon in UTC; PREVIOUS week)
  mon0005:     '2026-10-26T03:05:00.000Z', // Mon 26 Oct 00:05 ADT (start of this week)
  wed1200:     '2026-10-28T15:00:00.000Z', // Wed 28 Oct 12:00 ADT
  sat2355:     '2026-11-01T02:55:00.000Z', // Sat 31 Oct 23:55 ADT (already Sun Nov 1 in UTC)
  sat2359:     '2026-11-01T02:59:00.000Z', // Sat 31 Oct 23:59 ADT
  sun0000:     '2026-11-01T03:00:00.000Z', // Sun 1 Nov 00:00 ADT (midnight into DST end day)
  sun0130a:    '2026-11-01T04:30:00.000Z', // Sun 1 Nov 01:30 ADT (first 01:30, before fall-back)
  sun0130b:    '2026-11-01T05:30:00.000Z', // Sun 1 Nov 01:30 AST (second 01:30, after fall-back)
  sun1159:     '2026-11-01T15:59:00.000Z', // Sun 1 Nov 11:59 AST (1 min before Your week)
  sun1200:     '2026-11-01T16:00:00.000Z', // Sun 1 Nov 12:00 AST (Your week appears)
  sun2358:     '2026-11-02T03:58:00.000Z', // Sun 1 Nov 23:58 AST (already Mon Nov 2 in UTC)
  sun2359:     '2026-11-02T03:59:00.000Z', // Sun 1 Nov 23:59 AST
  mon0000:     '2026-11-02T04:00:00.000Z'  // Mon 2 Nov 00:00 AST (new week starts)
};

(async () => {
  const t = await W.open({ timezoneId: 'America/Halifax', time: new Date(T.sat2359) });
  const { page, base } = t;

  await page.goto(base + '#home');
  await page.waitForSelector('#wl-today');

  // Seed data across every module:
  // - Previous week Sun 25 Oct 23:55 ADT (must NOT count in Mon 26 Oct - Sun 1 Nov week)
  // - Mon 26 Oct 00:05 ADT (must count in this week)
  // - Wed 28 Oct rest day (must count in Move week)
  // - Sat 31 Oct 23:55 ADT (must count for Sat today() and this week, NOT Sun today())
  // - Sun 1 Nov open to-do (must NOT be due at Sat 23:59, MUST be due at Sun 00:00)
  await page.evaluate((ts) => {
    const fc = JSON.parse(localStorage.getItem('fc.v1') || '{}');
    fc.done = { 1: '2026-10-25', 2: '2026-10-26', 3: '2026-10-31' };
    localStorage.setItem('fc.v1', JSON.stringify(fc));

    const calm = {
      sessions: [
        { id: 'sigh', date: '2026-10-25', at: ts.sunPrev2355, mins: 1, before: null, after: null },
        { id: 'slow', date: '2026-10-26', at: ts.mon0005, mins: 5, before: null, after: null },
        { id: 'box', date: '2026-10-31', at: ts.sat2355, mins: 3, before: null, after: null }
      ],
      settings: { voice: true, rate: 0.9, minutes: 5, tick: false }
    };
    localStorage.setItem('wl.calm.v1', JSON.stringify(calm));

    const wo = {
      equipment: 'fixed10', weights: {}, history: [], next: {},
      rest: { '2026-10-28': { why: 'Busy day', at: ts.wed1200 } },
      sessions: [
        { id: 's0', date: '2026-10-25', day: 'A', start: ts.sunPrev2355, end: ts.sunPrev2355, sets: [{ i: 0, ex: 'Pushups', n: 1, val: 12, w: null, at: ts.sunPrev2355 }] },
        { id: 's1', date: '2026-10-26', day: 'B', start: ts.mon0005, end: ts.mon0005, sets: [{ i: 0, ex: 'Pushups', n: 1, val: 12, w: null, at: ts.mon0005 }] },
        { id: 's2', date: '2026-10-31', day: 'C', start: ts.sat2355, end: ts.sat2355, sets: [{ i: 0, ex: 'Pushups', n: 1, val: 12, w: null, at: ts.sat2355 }] }
      ]
    };
    localStorage.setItem('wl.workout.v1', JSON.stringify(wo));

    const tl = {
      packs: {},
      done: { '2026-11-18/1': ts.sunPrev2355, '2026-11-18/2': ts.mon0005, '2026-11-18/3': ts.sat2355 },
      cards: { opo: { en: 'yes (polite)', box: 1, due: '2026-11-01', seen: 0, right: 0, wrong: 0, from: '2026-11-18/3' } },
      answers: [], reviews: [], source: '', lastCheck: null, settings: { slow: true }
    };
    localStorage.setItem('wl.tagalog.v1', JSON.stringify(tl));

    const td = {
      tasks: [
        { id: 't0', text: 'prev week task', due: '2026-10-25', done: ts.sunPrev2355, created: ts.sunPrev2355, repeat: null, at: null },
        { id: 't1', text: 'monday task', due: '2026-10-26', done: ts.mon0005, created: ts.mon0005, repeat: null, at: null },
        { id: 't2', text: 'saturday task', due: '2026-10-31', done: ts.sat2355, created: ts.sat2355, repeat: null, at: null },
        { id: 't3', text: 'sunday dst task', due: '2026-11-01', done: null, created: ts.sat2355, repeat: null, at: null }
      ]
    };
    localStorage.setItem('wl.todo.v1', JSON.stringify(td));

    const me = {
      feedback: [], plan: null, skipped: {},
      checkins: { '2026-10-31': { at: ts.sat2355, sleep: '7 h+', wakes: '0', energy: 'Good', mood: 'Good', day: 'Good' } }
    };
    localStorage.setItem('wl.me.v1', JSON.stringify(me));
    Object.values(WL.modules).forEach((m) => m.reload && m.reload());
  }, T);

  const gotoHomeAt = async (isoTime) => {
    await page.clock.setSystemTime(new Date(isoTime));
    await page.reload();
    await page.waitForSelector('#wl-today');
  };

  await t.step('Sat 31 Oct 23:59 ADT (already Sun Nov 1 in UTC): all 5 done today, Sun to-do not due yet, no Your week', async () => {
    await gotoHomeAt(T.sat2359);
    const txt = await page.textContent('#wl-today');
    assert.ok(/All done for today ✓/.test(txt), txt);
    assert.ok(/Check-in/.test(txt) && /Faith: day 3 done/.test(txt) && /Calm: done/.test(txt) && /Move: workout done/.test(txt) && /Tagalog: lesson done/.test(txt), txt);
    assert.ok(!/sunday dst task/.test(txt), 'Sun Nov 1 to-do must not appear at Sat 23:59: ' + txt);
    assert.strictEqual(await page.$('#wl-week'), null, 'Your week hidden on Saturday night');
  });

  await t.step('Sun 1 Nov 00:00 ADT (midnight into DST end day): day flips cleanly across all modules', async () => {
    await gotoHomeAt(T.sun0000);
    const txt = await page.textContent('#wl-today');
    assert.ok(/1 of 6 done today/.test(txt), txt);
    assert.ok(/Check-in \(20 seconds/.test(txt), txt);
    assert.ok(/Faith: day 4/.test(txt), txt);
    assert.ok(/Calm: back to sleep/.test(txt), '00:00 suggests night practice: ' + txt);
    assert.ok(/Move: rest day \(worked out yesterday\)/.test(txt), txt);
    assert.ok(/Tagalog: lesson 4 \+ 1 to review/.test(txt), 'review card due on Nov 1: ' + txt);
    assert.ok(/To do: sunday dst task/.test(txt), 'Sun Nov 1 to-do appears at 00:00: ' + txt);
    assert.ok(!/Tomorrow is fine/.test(txt), 'evening line gone after midnight: ' + txt);
    assert.strictEqual(await page.$('#wl-week'), null, 'Your week hidden before noon');
  });

  await t.step('DST repeated hour (01:30 ADT and 01:30 AST): both record on 2026-11-01 and count once for the day', async () => {
    // 1st 01:30 (ADT): record a Calm session
    await page.clock.setSystemTime(new Date(T.sun0130a));
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      CalmCore.record(s, 'night', 5, null, null, new Date());
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
    });
    // 2nd 01:30 (AST, after clocks fell back): finish Faith day 4 + another Calm session
    await page.clock.setSystemTime(new Date(T.sun0130b));
    await page.evaluate(() => {
      const fc = JSON.parse(localStorage.getItem('fc.v1'));
      FCCore.finishDay(fc, 4, new Date());
      localStorage.setItem('fc.v1', JSON.stringify(fc));
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      CalmCore.record(s, 'sigh', 1, null, null, new Date());
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
      Object.values(WL.modules).forEach((m) => m.reload && m.reload());
    });
    await page.reload();
    await page.waitForSelector('#wl-today');
    const txt = await page.textContent('#wl-today');
    assert.ok(/3 of 6 done today/.test(txt), txt);
    assert.ok(/Faith: day 4 done/.test(txt) && /Calm: done/.test(txt) && /Move: rest day \(worked out yesterday\)/.test(txt), txt);
    const dates = await page.evaluate(() => ({
      faith: JSON.parse(localStorage.getItem('fc.v1')).done[4],
      calm: JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.slice(-2).map((x) => x.date)
    }));
    assert.strictEqual(dates.faith, '2026-11-01');
    assert.deepStrictEqual(dates.calm, ['2026-11-01', '2026-11-01']);
  });

  await t.step('Sun 1 Nov 11:59 AST -> 12:00 AST: Your week appears at noon and every module agrees on Mon-Sun', async () => {
    await gotoHomeAt(T.sun1159);
    assert.strictEqual(await page.$('#wl-week'), null, 'hidden at 11:59 AST');
    await gotoHomeAt(T.sun1200);
    const w = await page.textContent('#wl-week');
    assert.ok(/3 faith days/.test(w), 'Mon + Sat + Sun (not prev Sun 23:55): ' + w);
    assert.ok(/3 days of calm \(14 min\)/.test(w), 'Mon 5 + Sat 3 + Sun (5+1) = 14 min across 3 days: ' + w);
    assert.ok(/2 workouts, 1 rest day you chose/.test(w), 'Mon + Sat workouts, Wed rest (not prev Sun 23:55): ' + w);
    assert.ok(/2 Tagalog lessons/.test(w), 'Mon + Sat (not prev Sun 23:55): ' + w);
    assert.ok(/2 to-dos done/.test(w), 'Mon + Sat (not prev Sun 23:55): ' + w);
  });

  await t.step('Sun 1 Nov 23:59 AST (already Mon Nov 2 in UTC): late items still count for Sunday today() and Your week', async () => {
    await page.clock.setSystemTime(new Date(T.sun2358));
    await page.evaluate(() => {
      const tl = JSON.parse(localStorage.getItem('wl.tagalog.v1'));
      tl.done['2026-11-18/4'] = new Date().toISOString();
      localStorage.setItem('wl.tagalog.v1', JSON.stringify(tl));
      const td = JSON.parse(localStorage.getItem('wl.todo.v1'));
      TodoCore.complete(td, 't3', new Date());
      localStorage.setItem('wl.todo.v1', JSON.stringify(td));
    });
    await gotoHomeAt(T.sun2359);
    const txt = await page.textContent('#wl-today');
    assert.ok(/4 of 5 done today/.test(txt), txt);
    assert.ok(/Tagalog: lesson done/.test(txt), txt);
    assert.ok(!/sunday dst task/.test(txt), 'completed to-do removed from today list: ' + txt);
    assert.ok(/Tomorrow is fine/.test(txt), 'evening line present at 23:59 AST: ' + txt);
    const w = await page.textContent('#wl-week');
    assert.ok(/3 Tagalog lessons/.test(w) && /3 to-dos done/.test(w), '23:58 AST items included in Sunday Your week: ' + w);
  });

  await t.step('Mon 2 Nov 00:00 AST: midnight resets today() across every module and hides Your week', async () => {
    await gotoHomeAt(T.mon0000);
    const txt = await page.textContent('#wl-today');
    assert.ok(/0 of 5 done today/.test(txt), txt);
    assert.ok(/Check-in \(20 seconds/.test(txt), txt);
    assert.ok(/Faith: day 5/.test(txt), txt);
    assert.ok(/Calm:/.test(txt) && !/Calm: done/.test(txt), txt);
    assert.ok(/Move: Full body A/.test(txt), 'Sat workout is 2 days ago, no longer rest day: ' + txt);
    assert.ok(/Tagalog: lesson 5/.test(txt), txt);
    assert.ok(!/Tomorrow is fine/.test(txt), 'evening line gone at 00:00 Monday: ' + txt);
    assert.strictEqual(await page.$('#wl-week'), null, 'Your week hidden at 00:00 Monday');
  });

  await t.step('Home left open across midnight and Sunday noon refreshes on visibilitychange when returning to foreground', async () => {
    await gotoHomeAt(T.sat2359);
    assert.ok(/All done for today ✓/.test(await page.textContent('#wl-today')));
    await page.clock.setSystemTime(new Date(T.sun0000));
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const txt = await page.textContent('#wl-today');
    assert.ok(/4 of 5 done today/.test(txt) && /Check-in \(20 seconds/.test(txt), 'Home refreshed for Sunday on resume: ' + txt);
    assert.strictEqual(await page.$('#wl-week'), null);
    // Crossing Sunday noon while open on Home also reveals Your week on resume
    await page.clock.setSystemTime(new Date(T.sun1200));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.ok(await page.$('#wl-week'), 'Your week appeared on Sunday noon resume');
    // Crossing Sunday 23:59 -> Monday 00:00 on resume resets today() and hides Your week
    await page.clock.setSystemTime(new Date(T.mon0000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const monTxt = await page.textContent('#wl-today');
    assert.ok(/0 of 5 done today/.test(monTxt), 'Home refreshed for Monday on resume: ' + monTxt);
    assert.strictEqual(await page.$('#wl-week'), null, 'Your week hidden on Monday resume');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('midnight-dst browser');
})().catch((e) => { console.error(e); process.exit(1); });
