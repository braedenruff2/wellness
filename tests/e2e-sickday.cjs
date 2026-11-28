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
    const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}'); // the meditation path, 20-min sits
    c.settings = Object.assign(c.settings || {}, { aim: 'train', sitMinutes: 20 }); localStorage.setItem('wl.calm.v1', JSON.stringify(c));
  });
  const state = () => page.evaluate(() => ({
    rest: !!document.querySelector('#wo-rough-rest') && /sick/i.test(document.querySelector('#wo-rough-rest').textContent),
    soup: !!document.querySelector('#ck-sick-soup'),
    coach: !!document.querySelector('#co-sick'),
    guide: /A sick or teething day/.test((document.querySelector('.home-card[data-module="me"]') || {}).textContent || ''),
    calm: /Sick today/.test((document.querySelector('.home-card[data-module="calm"]') || {}).textContent || ''),
  }));
  const ALL = { rest: true, soup: true, coach: true, guide: true, calm: true }, NONE = { rest: false, soup: false, coach: false, guide: false, calm: false };

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
    assert.deepStrictEqual({ rest: s.rest, soup: s.soup, coach: s.coach, calm: s.calm }, { rest: true, soup: true, coach: true, calm: true }, JSON.stringify(s));
    // 462: the check-in card says which day of it this is, straight after the tap, and For you too once checked in
    assert.ok(/^Day 2 of feeling unwell/.test(await page.textContent('#me-sick-line')), await page.textContent('#me-sick-line'));
    await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); // off: the line goes
    assert.strictEqual(await page.isVisible('#me-sick-line'), false);
    await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); // on again
    assert.strictEqual(await page.isVisible('#me-sick-line'), true);
    // after "Still unwell?" redrew them, the cards' buttons still answer once
    await page.evaluate(() => { window.__toasts = []; const t = WL.toast; WL.toast = (m) => { window.__toasts.push(m); return t(m); }; });
    await page.click('#wo-rough-rest');
    await page.waitForFunction(() => !document.querySelector('#wo-rough-rest'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 1, JSON.stringify(await page.evaluate(() => window.__toasts)));
    await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); await page.click('#me-still-unwell [data-me-unwell][data-v="Yes"]'); // off and on again
    await page.click('#ck-sick-soup');
    await page.waitForFunction(() => !document.querySelector('#ck-sick-soup'));
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 2, 'still once after two more redraws: ' + JSON.stringify(await page.evaluate(() => window.__toasts)));    for (const [k, v] of [['sleep', '6–7 h'], ['wakes', '1'], ['energy', 'Low'], ['mood', 'OK'], ['day', 'Good']]) await page.click(`[data-me-ck][data-k="${k}"][data-v="${v}"]`);
    await page.clock.runFor(1000);
    const fy = await page.textContent('.home-card[data-module="me"]');
    assert.ok(/For you/.test(fy) && /Day 2 of feeling unwell/.test(fy), fy.slice(0, 400));
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
    // once the soup is marked made, Undo goes (putting the old dinner back would drop the made mark)
    await page.click('#ck-sick-card [data-sick-soup]'); await page.waitForSelector('#ck-sick-undo');
    await page.click('[data-ck-made="dinner"]');
    await page.waitForFunction(() => !document.querySelector('#ck-sick-undo'), null, { timeout: 3000 });
    const made = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-30'].dinner);
    assert.strictEqual(made.status, 'made');
    await page.goto(base + '#home'); await page.waitForSelector('.home-card[data-module="cook"]');
    assert.strictEqual(await page.$('#ck-sick-undo'), null, 'not on Home either');
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.cook.v1')); c.plan.days['2026-11-30'].dinner = Object.assign({}, c.plan.days['2026-11-30'].dinner, { status: 'planned', recipeId: 'sheet-chicken' }); localStorage.setItem('wl.cook.v1', JSON.stringify(c)); });
    await page.goto(base + '#cook'); await page.reload(); await page.waitForSelector('#ck-sick-card');
    // after 10 minutes the Undo is gone (the swap stays)
    await page.click('#ck-sick-card [data-sick-soup]'); await page.waitForSelector('#ck-sick-undo');
    await page.clock.fastForward(11 * 60 * 1000);
    await page.goto(base + '#home'); await page.waitForSelector('.home-card[data-module="cook"]');
    assert.strictEqual(await page.$('#ck-sick-undo'), null);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.step('457: with the soup offer on Home, "Mama cooked" and "Not making" for tonight are one tap there too', async () => {
    await page.clock.setSystemTime(new Date(2026, 11, 2, 9, 0));
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#me-ck-note');
    await page.fill('#me-ck-note', 'sick again, sore throat'); await page.press('#me-ck-note', 'Tab');
    await page.clock.runFor(800);
    await page.goto(base + '#cook'); await page.waitForSelector('#view h1'); // a new week: Cooking makes and saves its plan
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.cook.v1')); c.plan.days['2026-12-02'].dinner = { recipeId: 'salmon-tray', title: '20-minute baked salmon, spinach & potatoes', status: 'planned', note: '' }; localStorage.setItem('wl.cook.v1', JSON.stringify(c)); });
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#ck-sick-soup');
    assert.ok(await page.isVisible('#ck-home-mama') && await page.isVisible('#ck-home-skip'));
    await page.evaluate(() => { window.__toasts = []; const t = WL.toast; WL.toast = (m) => { window.__toasts.push(m); return t(m); }; });
    await page.click('#ck-home-skip');
    await page.waitForFunction(() => !document.querySelector('#ck-home-skip'));
    let din = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-12-02'].dinner);
    assert.strictEqual(din.status, 'skipped');
    assert.strictEqual((await page.evaluate(() => window.__toasts)).length, 1, 'answered once');
    // tonight is settled, so the soup offer moves to tomorrow, without tonight's buttons
    if (await page.$('#ck-sick-soup')) assert.ok(/tomorrow’s/.test(await page.textContent('#ck-sick-soup')));
    assert.strictEqual(await page.$('#ck-home-mama'), null);
    // back to planned: Mama cooked
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.cook.v1')); c.plan.days['2026-12-02'].dinner.status = 'planned'; localStorage.setItem('wl.cook.v1', JSON.stringify(c)); });
    await page.reload(); await page.waitForSelector('#ck-home-mama');
    await page.click('#ck-home-mama');
    await page.waitForFunction(() => !document.querySelector('#ck-home-mama'));
    din = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-12-02'].dinner);
    assert.strictEqual(din.status, 'mama');
    assert.deepStrictEqual(t.errors, []);
  });

  await t.step('451: "Rest today (sick)" tapped, then check-in note edited to fine: rest day stays, Home stops calling it a sick day', async () => {
    await page.clock.setSystemTime(new Date(2026, 11, 1, 9, 0));
    await page.goto(base + '#home'); await page.reload();
    await page.waitForSelector('#me-ck-note');
    await page.fill('#me-ck-note', 'We are all sick with a cold');
    await page.press('#me-ck-note', 'Tab');
    await page.waitForSelector('#wo-rough-rest');
    await page.click('#wo-rough-rest');
    await page.waitForFunction(() => !document.querySelector('#wo-rough-rest'));
    assert.ok(/Move: rest day \(sick\)/.test(await page.textContent('#wl-today')), 'Home today list calls it sick while note is sick');
    assert.ok(/Rest until you’re better/.test(await page.textContent('.home-card[data-module="workout"]')), 'Move card says sick rest');
    // Edit the check-in note live on Home to say they are fine
    await page.fill('#me-ck-note', 'Actually feeling totally fine today');
    await page.press('#me-ck-note', 'Tab');
    const todayText = await page.textContent('#wl-today');
    const moveText = await page.textContent('.home-card[data-module="workout"]');
    assert.ok(/Move: rest day\b/.test(todayText) && !/sick/i.test(todayText), 'Home today list keeps Move rest day without calling it sick: ' + todayText);
    assert.ok(/Rest day logged/.test(moveText) && !/Rest until you’re better/i.test(moveText), 'Move card keeps rest day without sick wording: ' + moveText);
    assert.strictEqual(await page.$('#wo-rough-rest'), null, 'rest button stays gone');
    assert.deepStrictEqual(await state(), NONE, 'all Home sick-day banners/cards are off');
    const savedRest = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.workout.v1')).rest['2026-12-01']);
    assert.ok(savedRest && savedRest.why === 'Sick' && savedRest.fromCheckin === true, 'rest day stayed saved: ' + JSON.stringify(savedRest));
    assert.deepStrictEqual(t.errors, []);
  });
  await t.step('465/470: the day after a sick rest day, no sick note: Move says go lighter for the first workout back', async () => {
    await page.clock.setSystemTime(new Date(2026, 11, 3, 9, 0));
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('.home-card[data-module="workout"]');
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('wl.workout.v1')); delete w.rest['2026-11-27']; delete w.rest['2026-11-28']; localStorage.setItem('wl.workout.v1', JSON.stringify(w)); }); // only 1 Dec's rest left in the week
    await page.reload(); await page.waitForSelector('.home-card[data-module="workout"]');
    // 470: 1 Dec's sick rest was tapped from a note later changed to fine: not a sick day after all
    assert.ok(!/First workout after being sick/.test(await page.textContent('.home-card[data-module="workout"]')));
    // 2 Dec's note said sick and he rested from Home: the first workout back goes lighter
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('wl.workout.v1')); w.rest['2026-12-02'] = { why: 'Sick', at: '2026-12-02T14:00:00.000Z', fromCheckin: true }; localStorage.setItem('wl.workout.v1', JSON.stringify(w)); });
    await page.reload(); await page.waitForSelector('.home-card[data-module="workout"]');
    const mv = await page.textContent('.home-card[data-module="workout"]');
    assert.ok(/First workout after being sick: go lighter/.test(mv), mv);
    await page.goto(base + '#workout'); await page.waitForSelector('#view h1');
    assert.ok(/First workout after being sick/.test(await page.textContent('#view')));
    assert.deepStrictEqual(t.errors, []);
  });
  await t.step('466: Sunday\'s "Your week" names the sick days plainly', async () => {
    await page.clock.setSystemTime(new Date(2026, 11, 6, 13, 0));
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-week');
    const w = await page.textContent('#wl-week');
    const n = await page.evaluate(() => MeCore.sickDaysIn(JSON.parse(localStorage.getItem('wl.me.v1')), new Date(), 7));
    assert.ok(n >= 1 && new RegExp(n + ' sick days?\\b \\(rest counted\\)').test(w) && !/missed/i.test(w), n + ': ' + w);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('sick stretch');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
