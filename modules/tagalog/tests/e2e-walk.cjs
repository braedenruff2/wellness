/* Listen while walking keeps the screen awake and dark (WL.darkScreen); leaving the lesson mid-way gives the
   screen back: no dark cover appears on another screen and keepAwake is released. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 8, 0) });
  const { page, base } = t;
  await page.addInitScript(() => { window.__awake = []; window.FCAndroid = { keepAwake: (on) => window.__awake.push(!!on), dimScreen: () => {} }; });
  const dark = () => page.evaluate(() => !!document.querySelector('.wl-dark'));
  await t.step('walking: awake; leaving to Home: released, never dark there', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/1'); await page.waitForSelector('#tl-walk');
    await page.click('#tl-walk');
    let aw = await page.evaluate(() => window.__awake);
    assert.strictEqual(aw[aw.length - 1], true, 'screen kept on while listening');
    for (let i = 0; i < 5; i++) await page.clock.runFor(1000);
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForSelector('#wl-today');
    for (let i = 0; i < 20; i++) await page.clock.runFor(1000);
    assert.strictEqual(await dark(), false, 'no dark cover on Home');
    aw = await page.evaluate(() => window.__awake);
    assert.strictEqual(aw[aw.length - 1], false, 'keepAwake released');
  });
  await t.step('the end of the lesson audio gives the screen back', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/1'); await page.waitForSelector('#tl-walk');
    await page.click('#tl-walk');
    for (let i = 0; i < 400 && (await page.getAttribute('#tl-walk', 'aria-pressed')) === 'true'; i++) await page.clock.runFor(1000);
    assert.ok(/Listen again/.test(await page.textContent('#tl-walk')));
    assert.strictEqual(await dark(), false);
    const aw = await page.evaluate(() => window.__awake);
    assert.strictEqual(aw[aw.length - 1], false);
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('tagalog walk screen');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
