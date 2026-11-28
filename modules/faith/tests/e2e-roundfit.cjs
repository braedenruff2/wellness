/* Faith (task 332): "Not for me" on a day's Think / Practice is for that walk of the path. In round 2 ("Walk the path
   again") a mark from round 1 no longer hides it; a mark made in round 2 does. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 11, 10, 10, 0) });
  const { page, base } = t;
  const ctx = page.context();
  const open = async (round, marks) => {
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 11, 10, 10, 0) });
    await p.addInitScript(([round, marks]) => {
      const done = {}; for (let k = 1; k <= 120; k++) done[k] = '2026-12-01';
      localStorage.setItem('fc.v1', JSON.stringify({ version: 1, started: '2026-08-01', done: round > 1 ? {} : done, journal: [], prayers: [],
        settings: { theme: 'auto', textSize: 1, voice: false, rate: 0.9, minutes: 5, bell: true, darkPray: true }, resume: null,
        round, pastRounds: round > 1 ? [{ done, ended: '2026-12-02' }] : [], sessions: [], lastOpen: null }));
      localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: marks.map((about, i) => ({ id: 'faith/notfit/' + about + '/' + i, at: new Date(2026, 10, 20 + i).toISOString(), part: 'faith', about, kind: 'notfit', a: { reasons: [] }, shown: 'x' })), checkins: {} }));
    }, [round, marks]);
    await p.goto(base + '#faith/day/1'); await p.waitForSelector('#reading');
    return p;
  };
  await t.step('round 1: a round-1 mark hides Think', async () => {
    const p = await open(1, ['day:1:think']);
    assert.strictEqual(await p.locator('#reflect').count(), 0);
    await p.close();
  });
  await t.step('round 2: the round-1 mark no longer hides it, and its Not for me? is offered again', async () => {
    const p = await open(2, ['day:1:think']);
    assert.strictEqual(await p.locator('#reflect').count(), 1);
    assert.strictEqual(await p.getAttribute('#reflect [data-me-fit]', 'data-about'), 'day:1:think@r2');
    await p.close();
  });
  await t.step('round 2: a mark made in round 2 hides it', async () => {
    const p = await open(2, ['day:1:think', 'day:1:think@r2']);
    assert.strictEqual(await p.locator('#reflect').count(), 0);
    await p.close();
  });
  await t.step('419: later walk shows "Last time you wrote: ..." from quick-answer own words, quiet and dismissible', async () => {
    const openNote = async (round, dayNum, fb) => {
      const p = await ctx.newPage();
      await p.clock.install({ time: new Date(2026, 11, 10, 10, 0) });
      await p.addInitScript(([round, fb]) => {
        const done = {}; for (let k = 1; k <= 120; k++) done[k] = '2026-12-01';
        localStorage.setItem('fc.v1', JSON.stringify({ version: 1, started: '2026-08-01', done: round > 1 ? {} : done, journal: [], prayers: [],
          settings: { theme: 'auto', textSize: 1, voice: false, rate: 0.9, minutes: 5, bell: true, darkPray: true }, resume: null,
          round, pastRounds: round > 1 ? [{ done, ended: '2026-12-02' }] : [], sessions: [], lastOpen: null }));
        localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: fb, checkins: {} }));
      }, [round, fb]);
      await p.goto(base + '#faith/day/' + dayNum); await p.waitForSelector('#reading');
      return p;
    };
    const fb = [
      { id: 'faith/after/day:1@2026-11-20T09:00', at: new Date(2026, 10, 20, 9).toISOString(), part: 'faith', about: 'day:1@2026-11-20T09:00', kind: 'after', a: { felt: 'Peaceful' }, note: 'The stillness verse stayed with me' },
      { id: 'faith/after/day:10@2026-11-25T09:00', at: new Date(2026, 10, 25, 9).toISOString(), part: 'faith', about: 'day:10@2026-11-25T09:00', kind: 'after', a: { felt: 'Peaceful' }, note: 'Day ten words' }
    ];
    // Round 1: not shown
    const p1 = await openNote(1, 1, fb);
    assert.strictEqual(await p1.locator('#fc-prev-note').count(), 0, 'not shown in round 1');
    await p1.close();
    // Round 2, Day 1: shown with Day 1's own words (not Day 10's), dismissible, >= 44 px target
    const p2 = await openNote(2, 1, fb);
    await p2.waitForSelector('#fc-prev-note');
    const txt = await p2.textContent('#fc-prev-note');
    assert.ok(txt.includes('Last time you wrote:') && txt.includes('The stillness verse stayed with me') && !txt.includes('Day ten words'), txt);
    const btnH = await p2.$eval('#fc-prev-dismiss', (e) => Math.round(e.getBoundingClientRect().height));
    assert.ok(btnH >= 44, 'Dismiss button >= 44 px: ' + btnH);
    await p2.click('#fc-prev-dismiss');
    assert.strictEqual(await p2.locator('#fc-prev-note').count(), 0, 'dismissed');
    // Returning to Day 1 stays dismissed in this session; Day 2 has no note
    await p2.goto(base + '#faith/day/2'); await p2.waitForSelector('#reading');
    assert.strictEqual(await p2.locator('#fc-prev-note').count(), 0, 'day 2 has no prior note');
    await p2.goto(base + '#faith/day/1'); await p2.waitForSelector('#reading');
    assert.strictEqual(await p2.locator('#fc-prev-note').count(), 0, 'day 1 stays dismissed');
    await p2.close();
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('faith round marks');
})().catch((e) => { console.error(e); process.exit(1); });
