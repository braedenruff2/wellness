/* Calm meditation path (task 328): after a sit, the path card gives the tip for what got in the way last time, for
   every obstacle; on counting breaths "Restless" gets the counting version (not "go back to counting"). */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
const K = require('../../../app/www/modules/calm/calm-core.js');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 27, 18, 0) });
  const { page, base } = t;
  const seed = (id, hind) => page.evaluate(([id, hind]) => {
    localStorage.setItem('wl.calm.v1', JSON.stringify({ sessions: [{ id, date: '2026-11-26', at: '2026-11-26T22:03:38.523Z', mins: 20, before: null, after: null, focus: 2, hind, rated: '2026-11-26T22:03:51.648Z' }],
      settings: { voice: true, rate: 0.9, minutes: 5, tick: false, aim: 'train', stage: id } }));
  }, [id, hind]);
  const tip = async () => { await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); const e = await page.$('#c-path-tip'); return e ? (await e.textContent()).trim() : null; };
  await page.goto(base + '#home');
  for (const h of K.HIND) {
    await t.step('counting breaths, in the way: ' + h, async () => {
      await seed('count', [h]);
      const x = await tip();
      if (h === 'Nothing much') assert.strictEqual(x, null, 'no tip when nothing got in the way');
      else assert.ok(x && x.startsWith('Last time you'), h + ': ' + x);
      if (h === 'Restless') assert.ok(/count to four/.test(x) && !/go back to counting/.test(x), x);
    });
  }
  await t.step('following the breath, Restless: may go back to counting', async () => {
    await seed('follow', ['Restless']);
    const x = await tip();
    assert.ok(x && /go back to counting/.test(x), String(x));
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm path tips');
})().catch((e) => { console.error(e); process.exit(1); });
