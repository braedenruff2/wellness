/* Late at night the Faith day offers a shorter guided prayer for that one session (same words, shorter silences);
   the saved length doesn't change, and it isn't offered in the daytime or when the length is already 2 min. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 22, 14, 0) });
  const { page, base } = t;
  const secs = () => page.getAttribute('.session', 'data-secs').then(Number);
  await t.step('daytime: no shorter option', async () => {
    await page.goto(base + '#faith/today'); await page.waitForSelector('#pray-card');
    assert.strictEqual(!!(await page.$('#fc-short')), false);
  });
  let normal;
  await t.step('10:30 pm: "Tired? A shorter one tonight" -> a shorter session; settings unchanged', async () => {
    await page.click('#pray-card a.btn'); await page.waitForSelector('.session'); normal = await secs();
    await page.clock.setSystemTime(new Date(2026, 10, 22, 22, 30)); await page.goto(base + '#faith/today'); await page.reload(); await page.waitForSelector('#fc-short');
    assert.ok(/Tired\?/.test(await page.textContent('#fc-short-wrap')));
    await page.click('#fc-short'); await page.waitForSelector('.session');
    const short = await secs();
    assert.ok(short < normal - 60, JSON.stringify({ short, normal }));
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1') || '{}').settings || {});
    assert.ok(!st.minutes || st.minutes === 5, JSON.stringify(st));
  });
  await t.step('leaving straight to Home after a shorter session still returns to the normal length next time', async () => {
    await page.goto(base + '#faith/today'); await page.waitForSelector('#fc-short');
    await page.click('#fc-short'); await page.waitForSelector('.session');
    assert.ok((await secs()) < normal - 60);
    await page.goto(base + '#home');
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('.session');
    assert.strictEqual(await secs(), normal, 'normal length restored even when leaving via #home');
  });
  await t.step('back to Today, the normal button is the normal length again', async () => {
    await page.click('#end').catch(() => {});
    await page.goto(base + '#faith/today'); await page.waitForSelector('#pray-card');
    await page.click('#pray-card a.btn'); await page.waitForSelector('.session');
    assert.strictEqual(await secs(), normal);
  });
  await t.step('after a late prayer rated "Hard to focus", it says why (even if an older late prayer was logged afterwards)', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
      me.feedback.push({ id: 'faith/after/day:1@x', at: new Date(2026, 10, 21, 22, 40).toISOString(), part: 'faith', about: 'day:1@x', kind: 'after', a: { felt: 'Hard to focus' } });
      me.feedback.push({ id: 'faith/after/day:1@older', at: new Date(2026, 10, 19, 22, 15).toISOString(), part: 'faith', about: 'day:1@older', kind: 'after', a: { felt: 'Peaceful' } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#faith/today'); await page.reload(); await page.waitForSelector('#fc-short');
    assert.ok(/Focus was hard last time this late/.test(await page.textContent('#fc-short-wrap')));
    assert.strictEqual(await page.$('#fc-read-open'), null, 'one hard night: the written prayer stays closed');
  });
  await t.step('two late "Hard to focus" in a row: the written prayer opens by itself, with why; not in the daytime', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'faith/after/day:1@y', at: new Date(2026, 10, 22, 21, 30).toISOString(), part: 'faith', about: 'day:1@y', kind: 'after', a: { felt: 'Hard to focus' } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#faith/today'); await page.reload(); await page.waitForSelector('#pray-card');
    assert.ok(await page.$('#fc-read-open[open]'));
    assert.ok((await page.textContent('#fc-read-open')).includes('Reading it can be easier'));
    await page.clock.setSystemTime(new Date(2026, 10, 23, 14, 0)); await page.goto(base + '#faith/today'); await page.reload(); await page.waitForSelector('#pray-card');
    assert.strictEqual(await page.$('#fc-read-open'), null);
    await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
  });
  await t.step('with the length set to 2 min there is nothing shorter', async () => {
    await page.goto(base + '#faith/pray'); await page.click('[data-min="2"]');
    await page.goto(base + '#faith/today'); await page.waitForSelector('#pray-card');
    assert.strictEqual(!!(await page.$('#fc-short')), false);
  });
  await t.step('Faith settings: "Save my journal as text" saves a .txt with the entries', async () => {
    await page.goto(base + '#faith/journal'); await page.fill('#new-entry', 'Grateful for a quiet evening.'); await page.click('#add-entry');
    await page.goto(base + '#faith/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fc-export-text')]);
    assert.ok(/^faith-journal-2026-11-2\d\.txt$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const txt = require('fs').readFileSync(await dl.path(), 'utf8');
    assert.ok(/^My journal \(Wellness app\)/.test(txt) && txt.includes('Grateful for a quiet evening.'), txt.slice(0, 300));
  });
  await t.step('no overflow, no errors', async () => { await t.noOverflow(['#faith/today', '#faith/settings']); assert.deepStrictEqual(t.errors, []); });
  await t.close('faith short tonight');
})().catch((e) => { console.error(e); process.exit(1); });
