/* Accessibility of the newest bits (Move rest days and the 2-a-week offer, Tagalog review recap, the save-failure
   card): tap targets at least 44 px at text size 1.0 and 1.3, nothing wider than the phone, AA text contrast in
   light and dark (night is dim on purpose: >= 3). */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 23, 10, 0) });
  const { page, base } = t;
  await page.goto(base + '#home');
  const look = (ts, theme) => page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts })), [ts, theme]);
  const seed = () => page.evaluate(() => {
    localStorage.setItem('wl.workout.v1', JSON.stringify({ equipment: 'fixed10', weights: {}, sessions: [], history: [], next: {},
      rest: { '2026-11-04': { why: 'Busy day', at: '2026-11-04T12:00:00.000Z' }, '2026-11-11': { why: 'Busy day', at: '2026-11-11T12:00:00.000Z' } } }));
    const card = (en) => ({ en, box: 1, due: '2026-11-17', seen: 1, right: 0, wrong: 1, from: '2026-11-11/1' });
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: {}, cards: { salamat: card('thank you'), tubig: card('water') }, answers: [], reviews: [] }));
  });
  const small = async (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
  const contrast = () => page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
    return Array.from(document.querySelectorAll('#view p, #view .meta, #view b, #view button')).filter((e) => e.offsetParent !== null && e.textContent.trim())
      .map((e) => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e)); return { t: e.textContent.trim().slice(0, 25), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) }; });
  });
  for (const ts of [1, 1.3]) {
    await t.step('text size ' + ts + ': Move rest chips, 2-a-week offer, rest card Undo', async () => {
      await look(ts, 'light'); await seed(); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-two');
      assert.deepStrictEqual(await small('#wo-two button'), []);
      await page.click('#wo-rest summary');
      assert.deepStrictEqual(await small('[data-rest]'), []);
      const sh = await page.$eval('#wo-rest summary', (e) => Math.round(e.getBoundingClientRect().height));
      assert.ok(sh >= 44, 'the "Not training today?" opener is easy to tap: ' + sh);
      await page.click('[data-rest="Tired"]');
      assert.deepStrictEqual(await small('#wo-rest button'), []);
      await t.noOverflow(['#workout']);
    });
    await t.step('text size ' + ts + ': Tagalog review recap hear buttons', async () => {
      await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
      for (let n = 0; n < 2; n++) { await page.click('#tl-show'); await page.clock.runFor(450); await page.click('#tl-no'); }
      await page.waitForSelector('#tl-missed');
      assert.deepStrictEqual(await small('#tl-missed button'), []);
      await t.noOverflow(['#tagalog/review']);
    });
  }
  for (const theme of ['light', 'dark', 'night']) {
    await t.step(theme + ': text contrast on the Move screen with the rest card and the offer', async () => {
      await look(1, theme); await seed(); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-two');
      await page.click('#wo-rest summary');
      const low = (await contrast()).filter((x) => x.r < (theme === 'night' ? 3 : 4.5));
      assert.deepStrictEqual(low, []);
    });
  }
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y of new UI');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
