/* 441: a sick stretch across modules, the way he lives it: he types "we're all sick" in the check-in note on Home,
   and Home (For you), Move, Cooking and Parenting all switch to a sick day without a reload; the next day "Still
   unwell? Yes" keeps all four on; "Better now" turns all four off; the day after nothing is asked. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 27, 15, 0) });
  const { page, base } = t;
  const seed = () => page.evaluate(() => {
    const co = JSON.parse(localStorage.getItem('wl.coach.v1') || '{}');
    co.child = Object.assign({ name: '', birth: '2025-09-01', can: [] }, co.child || {});
    localStorage.setItem('wl.coach.v1', JSON.stringify(co));
  });
  const state = () => page.evaluate(() => ({
    rest: !!document.querySelector('#wo-rough-rest') && /sick/i.test(document.querySelector('#wo-rough-rest').textContent),
    soup: !!document.querySelector('#ck-sick-soup'),
    coach: !!document.querySelector('#co-sick'),
    guide: /A sick or teething day/.test((document.querySelector('.home-card[data-module="me"]') || {}).textContent || ''),
  }));
  const ALL = { rest: true, soup: true, coach: true, guide: true }, NONE = { rest: false, soup: false, coach: false, guide: false };

  await t.step('day 1: typing the note on Home switches Home, Move, Cooking and Parenting to a sick day (no reload)', async () => {
    await page.goto(base + '#home'); await seed(); await page.reload();
    await page.waitForSelector('#me-ck-note');
    assert.deepStrictEqual(await state(), NONE, 'a normal day first');
    for (const [k, v] of [['sleep', '7 h+'], ['wakes', '0'], ['energy', 'OK'], ['mood', 'Good'], ['day', 'Good']]) await page.click(`[data-me-ck][data-k="${k}"][data-v="${v}"]`);
    await page.fill('#me-ck-note', 'I think we\'re all sick. My throat hurts');
    await page.press('#me-ck-note', 'Tab'); // done typing
    await page.clock.runFor(1500);
    assert.deepStrictEqual(await state(), ALL, JSON.stringify(await state()));
    // the redrawn cards' buttons work at once (they were dead until Home was drawn again)
    await page.evaluate(() => { window.__toasts = []; const t = WL.toast; WL.toast = (m) => { window.__toasts.push(m); return t(m); }; });
    await page.click('#ck-sick-soup');
    await page.waitForFunction(() => !document.querySelector('#ck-sick-soup'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 1, 'one tap, one answer (not twice): ' + JSON.stringify(await page.evaluate(() => window.__toasts)));
    const din = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-27'].dinner);
    assert.ok(['tinola', 'arroz-caldo', 'lentil-soup'].includes(din.recipeId), JSON.stringify(din));
    await page.click('#wo-rough-rest');
    await page.waitForFunction(() => !document.querySelector('#wo-rough-rest'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 2, 'the rest tap answered once');
    const rest = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')).rest || {});
    assert.ok(rest['2026-11-27'], 'rest day saved: ' + JSON.stringify(rest));
  });

  await t.step('day 2: "Still unwell? Yes" keeps all four', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 28, 9, 0));
    await page.reload(); await page.waitForSelector('#me-still-unwell');
    await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]');
    await page.clock.runFor(1000);
    const s = await state();
    assert.deepStrictEqual({ rest: s.rest, soup: s.soup, coach: s.coach }, { rest: true, soup: true, coach: true }, JSON.stringify(s));
    // after "Still unwell?" redrew them, the cards' buttons still answer once
    await page.evaluate(() => { window.__toasts = []; const t = WL.toast; WL.toast = (m) => { window.__toasts.push(m); return t(m); }; });
    await page.click('#wo-rough-rest');
    await page.waitForFunction(() => !document.querySelector('#wo-rough-rest'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 1, JSON.stringify(await page.evaluate(() => window.__toasts)));
    await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); // off and on again
    await page.click('#ck-sick-soup');
    await page.waitForFunction(() => !document.querySelector('#ck-sick-soup'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 2, 'still once after two more redraws: ' + JSON.stringify(await page.evaluate(() => window.__toasts)));
  });

  await t.step('day 3: "Better now" turns them all off; day 4 nothing is asked', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 29, 9, 0));
    await page.reload(); await page.waitForSelector('#me-still-unwell');
    await page.click('#me-still-unwell [data-me-unwell][data-v="Better now"]');
    await page.clock.runFor(1000);
    assert.deepStrictEqual(await state(), NONE, JSON.stringify(await state()));
    await page.clock.setSystemTime(new Date(2026, 10, 30, 9, 0));
    await page.reload(); await page.waitForSelector('#me-ck');
    assert.strictEqual(await page.$('#me-still-unwell'), null);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.step('445: right after a soup swap, one tap puts the planned dinner back (Home and Cooking)', async () => {
    await page.fill('#me-ck-note', 'she threw up, all sick again'); await page.press('#me-ck-note', 'Tab');
    await page.clock.runFor(800);
    await page.goto(base + '#cook'); await page.waitForSelector('#ck-sick-card'); // a new week: Cooking makes and saves its plan
    await page.goto(base + '#home'); await page.waitForSelector('#ck-sick-soup');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-30'].dinner);
    await page.click('#ck-sick-soup');
    await page.waitForSelector('#ck-sick-undo');
    assert.ok((await page.textContent('#ck-sick-undo')).includes(before.title), await page.textContent('#ck-sick-undo'));
    await page.click('#ck-sick-undo');
    await page.waitForFunction(() => !document.querySelector('#ck-sick-undo'));
    const back = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-30'].dinner);
    assert.deepStrictEqual(back, before, 'exactly as planned');
    assert.ok(await page.$('#ck-sick-soup'), 'the offer is back');
    // on Cooking's Today: a chip, then Undo there
    await page.goto(base + '#cook'); await page.waitForSelector('#ck-sick-card');
    await page.click('#ck-sick-card [data-sick-soup]');
    await page.waitForSelector('#ck-sick-undo');
    await page.click('#ck-sick-undo');
    await page.waitForSelector('#ck-sick-card');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-30'].dinner), before);
    // after 10 minutes the Undo is gone (the swap stays)
    await page.click('#ck-sick-card [data-sick-soup]'); await page.waitForSelector('#ck-sick-undo');
    await page.clock.fastForward(11 * 60 * 1000);
    await page.goto(base + '#home'); await page.waitForSelector('.home-card[data-module="cook"]');
    assert.strictEqual(await page.$('#ck-sick-undo'), null);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('sick stretch');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
