/* Accessibility: every main screen at the largest text size fits the phone width, and tap targets (buttons, chips,
   Home's today list) are at least 40 px tall. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const SCREENS = ['#home', '#faith/today', '#faith/day/3', '#faith/pray', '#faith/journal', '#calm', '#calm/s/body', '#workout',
  '#tagalog', '#tagalog/l/2026-11-18/1', '#tagalog/review', '#coach', '#todo', '#me', '#settings', '#link'];
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 20, 9, 30) });
  const { page, base } = t;
  await page.goto(base + '#home');
  await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: null, textSize: 1.3 })); });
  await page.reload();
  await t.step('largest text size: nothing wider than the phone', async () => {
    await t.noOverflow(SCREENS);
  });
  await t.step('tap targets at least 40 px tall', async () => {
    const small = [];
    for (const h of SCREENS) {
      await page.goto(base + h); await page.waitForTimeout(50);
      const s = await page.evaluate(() => Array.from(document.querySelectorAll('#view button, #view .btn, #view .chip, #wl-today a'))
        .filter((e) => e.offsetParent !== null && !e.classList.contains('link'))
        .map((e) => ({ t: (e.textContent || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 40));
      s.forEach((x) => small.push(h + ' "' + x.t + '" ' + x.h + 'px'));
    }
    assert.deepStrictEqual(small, []);
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y browser');
})().catch((e) => { console.error(e); process.exit(1); });
