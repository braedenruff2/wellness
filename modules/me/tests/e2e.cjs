/* "About you" in the browser: Home check-in, then "For you"; quick questions after a calm practice and a workout;
   "Not for me?" sheet; the About you page; the calm suggestion follows his answers; nothing overflows. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 20, 9, 30) });
  const { page, base } = t;
  const me = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1') || 'null'));
  await page.goto(base + '#home');
  await t.step('Home starts with the check-in; tapping every question turns it into "For you"', async () => {
    const card = page.locator('.home-card[data-module="me"]');
    assert.ok(/How are you today/.test(await card.textContent()));
    assert.strictEqual(await page.locator('.home-card').first().getAttribute('data-module'), 'me', 'first on Home');
    await page.click('[data-me-ck][data-k="sleep"][data-v="4–5 h"]');
    assert.strictEqual(await page.getAttribute('[data-me-ck][data-k="sleep"][data-v="4–5 h"]', 'aria-pressed'), 'true');
    await page.fill('#me-ck-note', 'she is teething'); await page.dispatchEvent('#me-ck-note', 'change');
    for (const [k, v] of [['wakes', '3+'], ['energy', 'Low'], ['mood', 'OK'], ['day', 'Mixed']]) await page.click(`[data-me-ck][data-k="${k}"][data-v="${v}"]`);
    await page.clock.runFor(600);
    const txt = await card.textContent();
    assert.ok(/For you/.test(txt) && /Rough night/.test(txt) && /teething/.test(txt), txt);
    const s = await me();
    assert.deepStrictEqual([s.checkins['2026-11-20'].sleep, s.checkins['2026-11-20'].note], ['4–5 h', 'she is teething']);
  });
  await t.step('Calm, after a rough night, suggests a short practice; its end screen asks if it helped', async () => {
    await page.goto(base + '#calm');
    const top = await page.textContent('#c-today');
    assert.ok(/One-minute reset|Slow breathing|grounding/.test(top) && /rough night/.test(top), top);
    await page.goto(base + '#calm/s/sigh');
    await page.click('#c-pp'); await page.clock.fastForward(62000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after .me-ask'));
    await page.click('#c-after [data-me-a][data-k="helped"][data-v="A lot"]');
    await page.click('#c-after [data-me-a][data-k="block"][data-v="Interrupted"]');
    await page.click('#c-save');
    const s = await me(), f = s.feedback.find((x) => x.part === 'calm');
    assert.ok(/^sigh@2026-11-20/.test(f.about), f.about);
    assert.deepStrictEqual(f.a, { helped: 'A lot', block: ['Interrupted'] });
  });
  await t.step('"Not for me?" opens reasons, saves them with the words shown, and Calm stops suggesting it', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 21, 15, 0)); await page.goto(base + '#calm'); await page.reload();
    const id = await page.getAttribute('#c-today [data-me-fit]', 'data-about');
    await page.click('#c-today [data-me-fit]');
    assert.ok(await page.isVisible('#me-sheet'));
    await page.click('#me-send');
    assert.ok(await page.isVisible('#me-sheet'), 'nothing chosen: stays open');
    await page.click('#me-sheet [data-r="Too long"]'); await page.fill('#me-note', 'shorter please');
    await page.click('#me-send');
    assert.ok(!(await page.isVisible('#me-sheet')));
    const f = (await me()).feedback.find((x) => x.kind === 'notfit');
    assert.deepStrictEqual([f.part, f.about, f.a.reasons, f.note], ['calm', id, ['Too long'], 'shorter please']);
    assert.ok(f.shown.length > 3);
    await page.goto(base + '#home'); await page.goto(base + '#calm');
    assert.notStrictEqual(await page.getAttribute('#c-today [data-me-fit]', 'data-about'), id);
  });
  await t.step('a finished workout asks how hard it was; answers saved', async () => {
    await page.goto(base + '#workout');
    await page.click('#ex-0 .logbtn'); await page.click('#wo-finish');
    assert.ok(await page.isVisible('.me-ask[data-part="workout"]'));
    await page.click('[data-me-a][data-k="hard"][data-v="Too hard"]');
    await page.click('[data-me-a][data-k="pain"][data-v="None"]');
    const f = (await me()).feedback.find((x) => x.part === 'workout');
    assert.deepStrictEqual(f.a, { hard: 'Too hard', pain: 'None' });
    await page.goto(base + '#workout');
    assert.strictEqual(await page.getAttribute('[data-me-a][data-k="hard"][data-v="Too hard"]', 'aria-pressed'), 'true', 'kept after leaving');
  });
  await t.step('About you page lists check-ins, flags and the plan state; activity log carries it all', async () => {
    await page.goto(base + '#me');
    const txt = await page.textContent('#view');
    assert.ok(/Last 7 check-ins/.test(txt) && /teething/.test(txt) && /not for me/.test(txt) && /PC link/.test(txt), txt);
    const ev = await page.evaluate(() => window.WLActivity.collect({ 'wl.me.v1': JSON.parse(localStorage.getItem('wl.me.v1')) }, {}, new Date()));
    assert.ok(ev.some((e) => e.part === 'checkin') && ev.some((e) => e.kind === 'feedback' && e.part === 'workout') && ev.some((e) => e.kind === 'not-for-me'));
  });
  await t.step('backup and restore keep it', async () => {
    const txt = await page.evaluate(() => WL.backupText());
    await page.evaluate(() => localStorage.removeItem('wl.me.v1'));
    await page.evaluate((x) => WL.restoreText(x), txt);
    assert.strictEqual((await me()).checkins['2026-11-20'].sleep, '4–5 h');
    // an unreadable part in the backup is named (it used to be skipped silently under "Backup restored")
    const bad = await page.evaluate((x) => { const o = JSON.parse(x); o.stores['wl.tagalog.v1'] = '{"nope":1}'; return WL.restoreText(JSON.stringify(o)); }, txt);
    assert.deepStrictEqual(bad, ['Tagalog']);
  });
  await t.step('"Log for an earlier day" doesn’t move the check-in, and Home doesn’t keep that mode alive', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 22, 9, 0)); await page.goto(base + '#home'); await page.reload();
    await page.selectOption('#wl-logday', '2026-11-21');
    await page.click('[data-me-ck][data-k="sleep"][data-v="7 h+"]');
    const s = await me();
    assert.strictEqual(s.checkins['2026-11-22'].sleep, '7 h+'); assert.ok(!s.checkins['2026-11-21']);
    await page.clock.runFor(2.1 * 3600e3);
    await page.goto(base + '#calm'); await page.goto(base + '#home');
    await page.clock.runFor(100);
    assert.strictEqual(await page.evaluate(() => WL.logDay()), null, 'ran out after 2 h');
  });
  await t.step('Faith day: "Not for me?" on Think and the practice, saved with the day', async () => {
    await page.goto(base + '#faith/day/1');
    assert.strictEqual(await page.locator('#reflect [data-me-fit][data-about="day:1:think"]').count(), 1);
    await page.click('#practice [data-me-fit][data-about="day:1:practice"]');
    await page.click('#me-sheet [data-r="Doesn’t fit my situation"]'); await page.click('#me-send');
    const f = (await me()).feedback.filter((x) => x.kind === 'notfit' && x.part === 'faith')[0];
    assert.ok(f && f.about === 'day:1:practice' && f.shown.length > 10, JSON.stringify(f));
    assert.ok(/Noted/.test(await page.textContent('#practice [data-me-fit]')));
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#home', '#me', '#calm', '#workout', '#coach']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('me browser');
})().catch((e) => { console.error(e); process.exit(1); });
