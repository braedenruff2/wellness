/* Home's Calm card asks "What do you want from Calm?" until it's answered (he may never open the Calm tab first):
   one tap saves the aim, the card redraws with today's practice (the path sit for "Training my mind"), and the
   question is gone on Home and in Calm. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 13, 0) });
  const { page, base } = t;
  const calm = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1') || 'null'));
  const card = '.home-card[data-module="calm"]';
  await t.step('no aim yet: Home asks, "Training my mind" saves it and the card offers the 20-min sit', async () => {
    await page.goto(base + '#home'); await page.waitForSelector(card + ' #c-aim-home');
    assert.ok((await page.textContent(card)).includes('What do you want from Calm?'));
    assert.strictEqual(await page.$(card + ' a.primary'), null, 'no Begin until answered');
    const hs = await page.$$eval(card + ' #c-aim-home [data-aim]', (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
    assert.ok(hs.length === 2 && hs.every((h) => h >= 44), 'tap targets ' + hs);
    await page.click(card + ' [data-aim="train"]');
    assert.strictEqual((await calm()).settings.aim, 'train');
    await page.waitForSelector(card + ' a.primary');
    assert.strictEqual(await page.$(card + ' #c-aim-home'), null);
    assert.ok(/Counting breaths · 20 min/.test(await page.textContent(card)), await page.textContent(card));
    assert.strictEqual(await page.getAttribute(card + ' a.primary', 'href'), '#calm/s/count');
    assert.ok(/Calm: 20-min sit, counting breaths/.test(await page.textContent('#wl-today')), 'today list follows');
    await page.goto(base + '#calm'); await page.waitForSelector('#c-path[open]');
    assert.strictEqual(await page.$('#c-aim'), null, 'not asked again in Calm');
  });
  await t.step('"Feeling calmer": the usual practice card, nothing about the path', async () => {
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1')); delete c.settings.aim; localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector(card + ' #c-aim-home');
    await page.click(card + ' [data-aim="calm"]');
    assert.strictEqual((await calm()).settings.aim, 'calm');
    await page.waitForSelector(card + ' a.primary');
    assert.ok(!/Counting breaths/.test(await page.textContent(card)));
    await page.reload(); await page.waitForSelector(card);
    assert.strictEqual(await page.$(card + ' #c-aim-home'), null, 'stays answered');
  });
  await t.step('no overflow, no errors', async () => {
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1')); delete c.settings.aim; localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
    await t.noOverflow(['#home']); assert.deepStrictEqual(t.errors, []);
  });
  await t.close('calm aim on Home');
})().catch((e) => { console.error(e); process.exit(1); });
