/* Your words: "Slips to watch" lists the last two weeks' answers that got a specific hint, with the lesson's own
   sentence and a hear button; search filters it too; nothing older than 14 days, no card without slips. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 13, 0) });
  const { page, base } = t;
  const seed = (answers) => page.evaluate((answers) => {
    const card = (en) => ({ en, box: 1, due: '2026-11-27', seen: 1, right: 1, wrong: 0, from: '2026-11-25/1' });
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: { '2026-11-25/1': '2026-11-25' }, cards: { gatas: card('milk'), tubig: card('water') }, answers, reviews: [] }));
  }, answers);
  const ans = (at, given, hint) => ({ at, pack: '2026-11-25', day: 1, ok: false, prompt: 'I want to study Tagalog.', type: 'type', given, hint });
  await page.goto(base + '#home');
  await t.step('a verb-form slip from yesterday: listed with the lesson sentence; 🔊 says it', async () => {
    await seed([ans('2026-11-25T23:10:00.836Z', 'gusto kong magaaral ng tagalog', 'aspect')]);
    await page.goto(base + '#tagalog/words'); await page.reload(); await page.waitForSelector('#tl-slips');
    const txt = await page.textContent('#tl-slips');
    assert.ok(/Verb form · you wrote “gusto kong magaaral ng tagalog”/.test(txt) && txt.includes('Gusto kong mag-aral ng Tagalog.'), txt);
    await page.click('#tl-slips [data-say]');
    assert.deepStrictEqual(await page.evaluate(() => window.__spoken[window.__spoken.length - 1]), { text: 'Gusto kong mag-aral ng Tagalog.', lang: 'fil-PH' });
  });
  await t.step('older than two weeks, or no hint: no card', async () => {
    await seed([ans('2026-11-01T23:10:00.000Z', 'gusto kong magaaral ng tagalog', 'aspect'), Object.assign(ans('2026-11-25T23:10:00.000Z', 'x'), { hint: undefined })]);
    await page.reload(); await page.waitForSelector('#tl-all');
    assert.strictEqual(await page.$('#tl-slips'), null);
  });
  await t.step('no overflow at 1.3, no errors', async () => {
    await seed([ans('2026-11-25T23:10:00.836Z', 'gusto kong magaaral ng tagalog na talagang mahaba mahaba mahaba', 'aspect')]);
    await page.evaluate(() => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1.3, since: '2026-10-01T12:00:00.000Z' })));
    await page.reload(); await page.waitForSelector('#tl-slips');
    await t.noOverflow(['#tagalog/words']); assert.deepStrictEqual(t.errors, []);
  });
  await t.close('tagalog slips');
})().catch((e) => { console.error(e); process.exit(1); });
