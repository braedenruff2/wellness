/* Accessibility: every main screen at the largest text size fits the phone width, and tap targets (buttons, chips,
   subnav tabs, Home's today list, to-do checkboxes) are at least 44 px tall at both normal and larger text sizes. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const SCREENS = ['#home', '#faith/today', '#faith/day/3', '#faith/pray', '#faith/journal', '#calm', '#calm/s/body', '#workout',
  '#tagalog', '#tagalog/l/2026-11-18/1', '#tagalog/review', '#coach', '#todo', '#me', '#settings', '#link'];
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 20, 9, 30) });
  const { page, base } = t;
  await page.goto(base + '#todo');
  await page.fill('#td-new', 'buy milk today'); await page.press('#td-new', 'Enter');

  async function checkTargets(label) {
    const small = [];
    for (const h of SCREENS) {
      await page.goto(base + h); await page.waitForTimeout(50);
      const s = await page.evaluate(() => Array.from(document.querySelectorAll('#view button, #view .btn, #view .chip, #view .subnav a, #wl-today a'))
        .filter((e) => e.offsetParent !== null && !e.classList.contains('link'))
        .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 44));
      s.forEach((x) => small.push(label + ' ' + h + ' "' + x.t + '" ' + x.h + 'px'));
    }
    assert.deepStrictEqual(small, []);
  }

  await t.step('normal text size (1.0): tap targets at least 44 px tall', async () => {
    await checkTargets('1.0');
  });

  await page.goto(base + '#home');
  await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: null, textSize: 1.3 })); });
  await page.reload();
  await t.step('largest text size (1.3): nothing wider than the phone', async () => {
    await t.noOverflow(SCREENS);
  });
  await t.step('largest text size (1.3): tap targets at least 44 px tall', async () => {
    await checkTargets('1.3');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y browser');
})().catch((e) => { console.error(e); process.exit(1); });
