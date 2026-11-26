/* At the end of a review, "Go through these again" re-asks only the words he said "Not yet" to, as extra practice:
   the repeat changes no box or due date (the first pass already rescheduled them); it can be repeated until all are
   got; no button when nothing was missed. */
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
  const reveal = async () => { await page.click('#tl-show'); await page.clock.runFor(450); };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')));
  await page.goto(base + '#home'); await seed();
  await t.step('two missed: "Go through these 2 again" asks just those, rescheduling nothing', async () => {
    await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
    const missed = [];
    for (const ok of [false, true, false]) {
      const w = await page.textContent('#tl-card .big');
      if (!ok) missed.push(w);
      await reveal(); await page.click(ok ? '#tl-yes' : '#tl-no');
    }
    const after1 = await store();
    assert.ok(/these 2 again/.test(await page.textContent('#tl-repeat')));
    await page.click('#tl-repeat');
    await page.waitForSelector('#tl-show');
    assert.ok(/Once more · 1 \/ 2/.test(await page.textContent('#tl-card .meta')));
    const seen = [];
    for (const ok of [true, false]) { seen.push(await page.textContent('#tl-card .big')); await reveal(); await page.click(ok ? '#tl-yes' : '#tl-no'); }
    assert.deepStrictEqual(seen, missed, 'the missed ones, in order');
    const after2 = await store();
    const sched = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [v.box, v.due, v.seen, v.right, v.wrong]]));
    assert.deepStrictEqual(sched(after2.cards), sched(after1.cards), 'no box, due date or count changed by the repeat');
    const am = Object.values(after2.cards).map((c) => c.againMiss || 0).sort();
    assert.deepStrictEqual(am, [0, 0, 1], 'the one still missed on the second go counts as a hard word; the rest nothing');
    assert.strictEqual(after2.reviews.length, after1.reviews.length, 'no extra review logged');
    assert.ok(/1 of 2 this time/.test(await page.textContent('#tl-again-done')));
    assert.ok(/that one again/.test(await page.textContent('#tl-repeat')), 'one left: again');
    await page.click('#tl-repeat'); await page.waitForSelector('#tl-show');
    await reveal(); await page.click('#tl-yes');
    assert.strictEqual(await page.$('#tl-repeat'), null, 'all got: no more repeats');
    assert.ok(/1 of 1 this time/.test(await page.textContent('#tl-again-done')));
  });
  await t.step('keys still work in the repeat (Space shows, 2 = got it)', async () => {
    await seed(); await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
    for (let n = 0; n < 3; n++) { await reveal(); await page.click('#tl-no'); }
    await page.click('#tl-repeat'); await page.waitForSelector('#tl-show');
    await page.keyboard.press('Space'); await page.clock.runFor(450);
    await page.waitForSelector('#tl-yes');
    await page.keyboard.press('2');
    assert.ok(/2 \/ 3/.test(await page.textContent('#tl-card .meta')));
  });
  await t.step('nothing missed: no button', async () => {
    await seed(); await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
    for (let n = 0; n < 3; n++) { await reveal(); await page.click('#tl-yes'); }
    assert.strictEqual(await page.$('#tl-repeat'), null);
  });
  await t.step('no overflow, no errors', async () => { await t.noOverflow(['#tagalog/review']); assert.deepStrictEqual(t.errors, []); });
  await t.close('tagalog review repeat');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
