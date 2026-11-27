/* "Log for an earlier day" (Home): every part records on the picked day (workout, faith, to-do), a banner shows it
   on every screen, and "Back to today" (or 2 hours) ends it. Test clock: Wed 18 Nov 2026 10:00. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  const st = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), k);
  await page.goto(base + '#home');
  await t.step('Home offers the last 7 days; picking yesterday shows the banner on every screen', async () => {
    assert.ok(await page.isHidden('#logday'));
    const opts = await page.$$eval('#wl-logday option', (o) => o.map((x) => x.value));
    assert.strictEqual(opts.length, 8); assert.strictEqual(opts[0], ''); assert.strictEqual(opts[1], '2026-11-17');
    await page.selectOption('#wl-logday', '2026-11-17');
    assert.ok((await page.textContent('#logday')).includes('yesterday'));
    await page.goto(base + '#workout');
    assert.ok(await page.isVisible('#logday'), 'banner on the workout screen');
  });
  await t.step('a workout set goes on yesterday; today is untouched', async () => {
    await page.fill('#ex-0 .val', '12'); await page.click('#ex-0 .logbtn');
    await page.click('#rest-skip');
    await page.click('#wo-finish');
    const s = await st('wl.workout.v1');
    assert.strictEqual(s.sessions.length, 1); assert.strictEqual(s.sessions[0].date, '2026-11-17');
    assert.ok(s.sessions[0].sets[0].at.startsWith('2026-11-17') || new Date(s.sessions[0].sets[0].at).getDate() === 17);
  });
  await t.step('a rest day logged while yesterday is picked goes on yesterday; today is still open', async () => {
    await page.goto(base + '#home'); await page.selectOption('#wl-logday', '2026-11-16');
    await page.goto(base + '#workout'); await page.click('#wo-rest summary'); await page.click('[data-rest="Busy day"]');
    const s = await st('wl.workout.v1');
    assert.deepStrictEqual(Object.keys(s.rest), ['2026-11-16']);
    assert.ok((await page.textContent('#wo-rest')).includes('Rest day logged: Busy day'));
    await page.goto(base + '#home'); await page.selectOption('#wl-logday', '2026-11-17');
    await page.goto(base + '#workout');
    assert.strictEqual(!!(await page.$('#wo-rest')), false, 'yesterday has a workout: no rest choice');
  });
  await t.step('a to-do ticked counts as done yesterday', async () => {
    await page.goto(base + '#todo');
    await page.fill('#td-new', 'call the bank'); await page.press('#td-new', 'Enter');
    await page.click('li:has-text("call the bank") [data-tick]');
    const s = await st('wl.todo.v1');
    assert.strictEqual(new Date(s.tasks.find((x) => x.text === 'call the bank').done).getDate(), 17);
  });
  await t.step('a faith day marked done and prayer added go on yesterday', async () => {
    await page.goto(base + '#faith/today');
    await page.click('#finish');
    await page.goto(base + '#faith/journal/prayers');
    await page.fill('#new-prayer', 'Strength for the week'); await page.click('#add-prayer');
    await page.click('.answered'); await page.click('.ans-save');
    const s = await st('fc.v1') || await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/faith|fc/.test(k)) return JSON.parse(localStorage.getItem(k)); return null; });
    assert.ok(s && Object.values(s.done || {}).includes('2026-11-17'), JSON.stringify(s && s.done));
    assert.strictEqual(new Date(s.prayers[0].at).getDate(), 17, 'prayer added on yesterday');
    assert.strictEqual(new Date(s.prayers[0].answered).getDate(), 17, 'prayer answered on yesterday');
  });
  await t.step('a Tagalog lesson, answers and review go on yesterday; today is untouched on Home', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/1');
    const exs = await page.evaluate(() => window.TL_PACKS[0].lessons[0].exercises);
    for (const ex of exs) {
      if (ex.type === 'mc' || ex.type === 'listen') await page.click(`#tl-ex [data-o="${ex.answer.replace(/"/g, '\\"')}"]`);
      else if (ex.type === 'type') { await page.fill('#tl-in', ex.answer); await page.click('#tl-check'); }
      else if (ex.type === 'build') { const bw = (w) => String(w || '').toLowerCase().replace(/[.,!?;:"“”‘’…()¿¡]/g, '').trim(); for (const w of ex.answer.split(' ')) await page.click(`#tl-ex .word:not([disabled]):text-is("${bw(w)}")`); await page.click('#tl-check'); }
      await page.click('#tl-next');
    }
    let s = await st('wl.tagalog.v1');
    assert.strictEqual(new Date(s.done['2026-11-18/1']).getDate(), 17, 'lesson done recorded on yesterday');
    assert.ok(s.answers.every((a) => new Date(a.at).getDate() === 17), 'answers recorded on yesterday');
    assert.ok(Object.values(s.cards).every((c) => c.due === '2026-11-18'), 'cards due next day (today)');
    await page.goto(base + '#home');
    assert.ok(!/Tagalog: lesson done/.test(await page.textContent('#wl-today')), 'Home today list still asks for today’s Tagalog');
    // reviewing a due card while yesterday is picked records the review on yesterday
    await page.goto(base + '#tagalog/review');
    await page.click('#tl-show'); await page.clock.runFor(450); await page.click('#tl-yes');
    s = await st('wl.tagalog.v1');
    assert.strictEqual(new Date(s.reviews[0].at).getDate(), 17, 'review recorded on yesterday');
  });
  await t.step('"Back to today" ends it; after that everything is today again', async () => {
    await page.click('#logday-back');
    assert.ok(await page.isHidden('#logday'));
    await page.goto(base + '#workout');
    await page.fill('#ex-0 .val', '13'); await page.click('#ex-0 .logbtn');
    const s = await st('wl.workout.v1');
    assert.deepStrictEqual(s.sessions.map((x) => x.date), ['2026-11-17', '2026-11-18']);
  });
  await t.step('it ends by itself after 2 hours', async () => {
    await page.goto(base + '#home');
    await page.selectOption('#wl-logday', '2026-11-16');
    assert.ok(await page.isVisible('#logday'));
    await page.clock.runFor(2 * 3600e3 + 60000);
    await page.goto(base + '#todo');
    assert.ok(await page.isHidden('#logday'));
  });
  await t.step('the 2 hours count from the last entry; when they run out the banner goes at once', async () => {
    await page.goto(base + '#home');
    await page.selectOption('#wl-logday', '2026-11-15');
    await page.goto(base + '#workout');
    await page.fill('#ex-0 .val', '11'); await page.click('#ex-0 .logbtn'); await page.click('#rest-skip');
    await page.clock.runFor(90 * 60000);
    await page.fill('#ex-0 .val', '12'); await page.click('#ex-0 .logbtn'); await page.click('#rest-skip');
    await page.clock.runFor(90 * 60000);
    await page.fill('#ex-0 .val', '13'); await page.click('#ex-0 .logbtn'); await page.click('#rest-skip');
    let s = await st('wl.workout.v1');
    const d15 = s.sessions.filter((x) => x.date === '2026-11-15')[0];
    assert.deepStrictEqual(d15.sets.map((x) => x.val), [11, 12, 13], 'a workout with long breaks stays on that day');
    assert.ok(await page.isVisible('#logday'));
    await page.clock.runFor(2 * 3600e3 + 60000);
    await page.fill('#ex-1 .val', '14'); await page.click('#ex-1 .logbtn');
    await page.waitForFunction(() => document.getElementById('logday').hidden, null, { timeout: 2000 });
    s = await st('wl.workout.v1');
    assert.ok(!s.sessions.filter((x) => x.date === '2026-11-15')[0].sets.some((x) => x.val === 14), 'after it ran out: today');
  });
  await t.step('no overflow, no errors', async () => {
    await page.goto(base + '#home'); await page.selectOption('#wl-logday', '2026-11-17');
    await t.noOverflow(['#home', '#workout', '#faith/today', '#todo']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('log for an earlier day');
})().catch((e) => { console.error(e); process.exit(1); });
