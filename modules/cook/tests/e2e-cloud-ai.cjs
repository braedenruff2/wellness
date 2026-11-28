/* Cloud answers for Cooking "Estimate with AI" and the Wisdom blind-spot check (task 405): a request queued while
   the PC can't be reached is answered hours later, after the app restarted and other entries were added. The answer
   must land on the meal / Zoom Out it was asked for, never on the newest one; if that one is gone, say so. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

const FAKE = `
  (function () {
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
    var d = window.__drive = { configured: ls('test.drive.off') !== '1', content: ls('test.drive.content') || '', writes: 0 };
    var pc = window.__pc = { asks: 0 };
    window.FCAndroid = {
      pcStatus: function () { return ls('test.pc.unpaired') === '1' ? '{"paired":false}' : '{"paired":true,"host":"192.168.1.20","name":"PC"}'; },
      pcRequest: function (id, op, a) {
        if (op === 'post' && a === '/v1/ask') pc.asks++;
        Promise.resolve().then(function () { window.FCPcDone(id, false, "couldn't reach the PC at 192.168.1.20. Is the PC link running there, and the phone on the same Wi-Fi?"); });
      },
      syncStatus: function () { return JSON.stringify({ configured: d.configured, name: 'wellness-sync.json', lastSync: 0, error: '', busy: false }); },
      syncRead: function (id) { Promise.resolve().then(function () { window.FCSyncDone(id, true, d.content); }); },
      syncWrite: function (id, text) { d.writes++; Promise.resolve().then(function () { d.content = text; ls('test.drive.content', text); window.FCSyncDone(id, true, ''); }); }
    };
  })();
`;

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 26, 12, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE);
  await page.goto(base + '#home');
  const file = () => page.evaluate(() => JSON.parse(window.__drive.content || '{}'));
  const reqs = async (task) => ((await file()).requests || []).filter((r) => r.task === task);
  const cloudAnswers = (answers) => page.evaluate((a) => {
    const f = JSON.parse(window.__drive.content); f.answers = Object.assign(f.answers || {}, a); window.__drive.content = JSON.stringify(f);
    return WL.driveSync.sync();
  }, answers);
  const cook = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')));
  const logMeal = async (text) => {
    await page.fill('#ck-m-text', text); await page.click('#ck-m-save');
    await page.waitForFunction((x) => (JSON.parse(localStorage.getItem('wl.cook.v1')).logs || []).some((l) => l.text === x), text);
    return (await cook()).logs.find((l) => l.text === text).id;
  };
  const ANS = { kcal: 610, pro: 22, carb: 70, fat: 26, fib: 5, iron: 2, ca: 120, vitc: 10, k: 400, breakdown: 'Grandma special: about 610 kcal' };

  await t.step('cooking: the AI estimate asked for lunch (queued, then a restart and a newer dinner) lands on lunch', async () => {
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-m-text');
    const lunch = await logMeal('grandma special casserole');
    await page.click('[data-log-ai="' + lunch + '"]');
    await page.waitForFunction(() => (JSON.parse(window.__drive.content || '{}').requests || []).some((r) => r.task === 'cook-nutri'));
    const r = await reqs('cook-nutri');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].input.logId, lunch);
    await page.reload(); await page.waitForSelector('#ck-m-text');
    const dinner = await logMeal('leftover mystery bake');
    await cloudAnswers({ [r[0].id]: { task: 'cook-nutri', answer: ANS } });
    await page.waitForFunction((id) => { const l = JSON.parse(localStorage.getItem('wl.cook.v1')).logs.find((x) => x.id === id); return l && l.nutriSource === 'ai'; }, lunch);
    const s = await cook(), L = s.logs.find((l) => l.id === lunch), D = s.logs.find((l) => l.id === dinner);
    assert.strictEqual(L.nutri.kcal, 610, 'lunch got its estimate');
    assert.notStrictEqual(D.nutriSource, 'ai', 'dinner (newest) untouched');
    assert.ok(!D.nutri || D.nutri.kcal !== 610, 'dinner keeps its own numbers');
  });

  await t.step('cooking: an answer for a meal he removed meanwhile is not put on another meal, and says so', async () => {
    const gone = await logMeal('weird stew thing');
    await page.click('[data-log-ai="' + gone + '"]');
    await page.waitForFunction((id) => (JSON.parse(window.__drive.content || '{}').requests || []).some((r) => r.task === 'cook-nutri' && r.input.logId === id), gone);
    const r = (await reqs('cook-nutri')).find((x) => x.input.logId === gone);
    await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('wl.cook.v1')); s.logs = s.logs.filter((l) => l.id !== id); localStorage.setItem('wl.cook.v1', JSON.stringify(s)); }, gone);
    await page.reload(); await page.waitForSelector('#ck-m-text');
    const before = JSON.stringify((await cook()).logs);
    await cloudAnswers({ [r.id]: { task: 'cook-nutri', answer: ANS } });
    await page.waitForFunction(() => /isn’t in your food log any more/.test(document.getElementById('view').textContent));
    assert.strictEqual(JSON.stringify((await cook()).logs), before, 'no other meal changed');
  });

  await t.step('wisdom: the blind-spot check for an older Zoom Out lands on it, not on the newest', async () => {
    await page.goto(base + '#journal/wisdom/zoom');
    await page.waitForSelector('#w-z-ai');
    await page.fill('#w-z-sit', 'First situation about bedtime.');
    await page.click('#w-z-ai');
    await page.waitForFunction(() => (JSON.parse(window.__drive.content || '{}').requests || []).some((r) => r.task === 'wisdom-check'));
    const r = await reqs('wisdom-check');
    const first = r[0].input.zoomId;
    assert.ok(first);
    await page.reload(); await page.waitForSelector('#w-z-sit');
    // a second, newer Zoom Out saved straight into storage (as the form would)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.wisdom.v1'));
      WisdomCore.addZoomOut(s, { situation: 'Second, newer situation.' }, new Date());
      localStorage.setItem('wl.wisdom.v1', JSON.stringify(s));
      WL.modules.journal.reload();
    });
    await cloudAnswers({ [r[0].id]: { task: 'wisdom-check', answer: { blindSpots: ['Only one way to see it'], otherSide: 'She is tired too.', reframe: 'A year from now this is small.', nextStep: 'Breathe first.' } } });
    await page.waitForFunction((id) => { const z = JSON.parse(localStorage.getItem('wl.wisdom.v1')).zoomouts.find((x) => x.id === id); return z && JSON.stringify(z).includes('Only one way to see it'); }, first);
    const zs = JSON.parse(await page.evaluate(() => localStorage.getItem('wl.wisdom.v1'))).zoomouts;
    const newer = zs.find((z) => z.id !== first);
    assert.ok(newer && !JSON.stringify(newer).includes('Only one way to see it'), 'newest Zoom Out untouched');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('cloud AI answers find their entry');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
