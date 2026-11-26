/* The weekly plan in the browser, with a stand-in PC link: Home's button asks Claude (task weekly-plan, with his
   check-ins and answers), the plan shows on Home, on the About you page and on each part's screen, and Calm's
   suggestion follows it. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
const FAKE = `
  (function () {
    var pc = window.__pc = { asks: [], posts: 0 };
    var PLAN = { headline: 'Rest is the priority this week', parts: { calm: { focus: 'Walk with the stroller after lunch', why: 'you rated walks a lot', prefer: ['walk'] },
      workout: { focus: 'Same weights, bottom of the range', why: 'last workout felt too hard' }, home: { focus: 'One nap-time rest a day', why: 'short sleep 4 nights' } }, check: 'When do you feel best?' };
    window.FCAndroid = {
      pcStatus: function () { return '{"paired":true,"host":"192.168.1.20","name":"PC"}'; },
      pcRequest: function (id, op, a, b) {
        var out = '{}';
        if (op === 'post' && a === '/v1/activity') { pc.posts++; out = '{"saved":1}'; }
        else if (op === 'post' && a === '/v1/ask') { pc.asks.push(JSON.parse(b)); out = '{"job":"j1"}'; }
        else if (op === 'get' && a.indexOf('/v1/job') === 0) out = JSON.stringify({ state: 'done', answer: PLAN });
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
  await page.evaluate(() => localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: [], checkins: { '2026-11-20': { at: '2026-11-20T12:00:00Z', sleep: '6–7 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'Good', note: 'tired' } }, plan: null, skipped: {} })));
  await page.reload();
  await t.step('Home offers the weekly plan; Claude gets his check-ins; the plan shows', async () => {
    await page.click('#me-plan');
    await page.clock.runFor(4000);
    const asks = await page.evaluate(() => window.__pc.asks);
    assert.strictEqual(asks.length, 1); assert.strictEqual(asks[0].task, 'weekly-plan');
    assert.strictEqual(asks[0].input.checkins['2026-11-20'].note, 'tired');
    const txt = await page.textContent('.home-card[data-module="me"]');
    assert.ok(/Rest is the priority/.test(txt) && /nap-time rest/.test(txt), txt);
    assert.ok(!(await page.isVisible('#me-plan')), 'not due again for a week');
  });
  await t.step('each part shows its line of the plan, with why; Calm suggests the planned practice', async () => {
    await page.goto(base + '#calm');
    const c = await page.textContent('#view');
    assert.ok(/This week, for you/.test(c) && /Walk with the stroller/.test(c) && /rated walks/.test(c), c);
    assert.ok(/Mindful walk/.test(await page.textContent('#c-today')));
    await page.goto(base + '#workout');
    assert.ok(/bottom of the range/.test(await page.textContent('#view')));
    await page.goto(base + '#me');
    assert.ok(/When do you feel best/.test(await page.textContent('#view')));
  });
  await t.step('making a plan from #me/checkin (via Home Check-in change link) redraws the page when it arrives', async () => {
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('wl.me.v1'));
      m.plan = null; delete m.planTried;
      localStorage.setItem('wl.me.v1', JSON.stringify(m));
      window.WL.modules.me.reload();
    });
    await page.goto(base + '#me/checkin'); await page.waitForSelector('#me-plan');
    await page.click('#me-plan');
    await page.clock.runFor(4000);
    const txt = await page.textContent('#view');
    assert.ok(/Rest is the priority/.test(txt) && /When do you feel best/.test(txt), txt);
  });
  await t.step('no errors', async () => { await t.noOverflow(['#home', '#calm', '#me']); assert.deepStrictEqual(t.errors, []); });
  await t.close('me plan browser');
})().catch((e) => { console.error(e); process.exit(1); });
