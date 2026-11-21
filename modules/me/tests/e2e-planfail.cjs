/* The weekly plan when Claude fails (task F): the try is used up for the day, but Home and About you keep a visible
   "Couldn't make your plan this time" with "Try again" instead of nothing; trying again makes the plan. Without the
   PC link the line stays and says it tries again when the PC answers. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
const FAKE = `
  (function () {
    var pc = window.__pc = { asks: 0, fail: true, paired: localStorage.getItem('test.unpaired') !== '1' };
    var PLAN = { headline: 'Rest is the priority this week', parts: { home: { focus: 'One nap-time rest a day', why: 'short sleep' } }, check: 'When do you feel best?' };
    window.FCAndroid = {
      pcStatus: function () { return pc.paired ? '{"paired":true,"host":"192.168.1.20","name":"PC"}' : '{"paired":false}'; },
      pcRequest: function (id, op, a, b) {
        var out = '{}';
        if (op === 'post' && a === '/v1/activity') out = '{"saved":1}';
        else if (op === 'post' && a === '/v1/ask') { pc.asks++; out = '{"job":"j' + pc.asks + '"}'; }
        else if (op === 'get' && a.indexOf('/v1/job') === 0) out = pc.fail ? JSON.stringify({ state: 'error', error: 'Claude: error_max_turns' }) : JSON.stringify({ state: 'done', answer: PLAN });
        Promise.resolve().then(function () { window.FCPcDone(id, true, out); });
      }
    };
  })();
`;
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 20, 13, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE);
  await page.goto(base + '#home');
  await page.evaluate(() => localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: [], checkins: { '2026-11-20': { at: '2026-11-20T12:00:00Z', sleep: '6–7 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'Good' } }, plan: null, skipped: {} })));
  await page.reload();
  const card = () => page.textContent('.home-card[data-module="me"]');
  await t.step('Claude fails: Home says so and offers Try again (not nothing)', async () => {
    await page.click('#me-plan');
    await page.clock.runFor(4000);
    assert.strictEqual(await page.evaluate(() => window.__pc.asks), 1);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1')));
    assert.strictEqual(st.planTried, '2026-11-20'); assert.strictEqual(st.plan, null);
    const txt = await card();
    assert.ok(/Couldn’t make your plan this time/.test(txt), txt);
    assert.strictEqual((await page.textContent('#me-plan')).trim(), 'Try again');
  });
  await t.step('still there after the app reopens; About you says it too', async () => {
    await page.reload();
    assert.ok(/Couldn’t make your plan/.test(await card()));
    await page.goto(base + '#me');
    assert.ok(/Couldn’t make your plan this time/.test(await page.textContent('#view')));
    assert.strictEqual((await page.textContent('#me-plan')).trim(), 'Try again');
  });
  await t.step('Try again works once Claude answers; the failure line goes', async () => {
    await page.evaluate(() => { window.__pc.fail = false; });
    await page.click('#me-plan');
    await page.clock.runFor(4000);
    assert.ok(/Rest is the priority/.test(await page.textContent('#view')));
    assert.ok(!(await page.$('#me-plan-failed')));
    await page.goto(base + '#home');
    assert.ok(!/Couldn’t make your plan/.test(await card()));
  });
  await t.step('without the PC link the line stays and explains, with no button', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.me.v1')); s.plan = null; localStorage.setItem('wl.me.v1', JSON.stringify(s)); localStorage.setItem('test.unpaired', '1'); });
    await page.reload();
    const txt = await card();
    assert.ok(/Couldn’t make your plan this time\. It tries again when your PC answers\./.test(txt), txt);
    assert.ok(!(await page.$('#me-plan')));
  });
  await t.step('no errors', async () => { await t.noOverflow(['#home', '#me']); assert.deepStrictEqual(t.errors, []); });
  await t.close('me plan failure browser');
})().catch((e) => { console.error(e); process.exit(1); });
