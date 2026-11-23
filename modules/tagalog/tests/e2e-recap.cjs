/* Review's "All done" card lists the words he said "Not yet" to (each once, with a hear button); none -> no list. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open();
  const { page, base } = t;
  const seed = () => page.evaluate(() => {
    const card = (en) => ({ en, box: 1, due: '2026-11-17', seen: 1, right: 0, wrong: 1, from: '2026-11-11/1' });
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: {}, cards: { salamat: card('thank you'), tubig: card('water'), 'kain na': card('let’s eat') }, answers: [], reviews: [] }));
  });
  await page.goto(base + '#home'); await seed();
  const reveal = async () => { await page.click('#tl-show'); await page.clock.runFor(450); };
  await t.step('two "Not yet" -> both listed, in order, with hear buttons', async () => {
    await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
    const seen = [];
    for (const ok of [false, true, false]) {
      seen.push(await page.textContent('#tl-card .big'));
      await reveal(); await page.click(ok ? '#tl-yes' : '#tl-no');
    }
    assert.ok((await page.textContent('#tl-card')).includes('All done'));
    const items = await page.$$eval('#tl-missed li b', (b) => b.map((x) => x.textContent));
    assert.strictEqual(items.length, 2, JSON.stringify(items));
    assert.ok(seen[0].includes(items[0]) && seen[2].includes(items[1]), JSON.stringify([seen, items]));
    await page.click('#tl-missed .hear');
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: items[0], lang: 'fil-PH' });
  });
  await t.step('all "Got it" -> no list', async () => {
    await seed(); await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
    for (let n = 0; n < 3; n++) { await reveal(); await page.click('#tl-yes'); }
    assert.ok((await page.textContent('#tl-card')).includes('All done'));
    assert.strictEqual(await page.$('#tl-missed'), null);
  });
  await t.step('no overflow, no errors', async () => { await t.noOverflow(['#tagalog/review']); assert.deepStrictEqual(t.errors, []); });
  await t.close('tagalog review recap');
})().catch((e) => { console.error(e); process.exit(1); });
