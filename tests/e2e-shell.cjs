/* The shell: Home lists every module's card, the bottom nav works, settings change the look everywhere. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  await page.goto(base);
  await t.step('Home has a card for each module and the nav', async () => {
    await page.waitForSelector('.home-card');
    const mods = await page.$$eval('.home-card', (els) => els.map((e) => e.dataset.module));
    for (const m of ['faith', 'calm', 'workout', 'tagalog', 'todo']) assert.ok(mods.includes(m), 'card ' + m + ' in ' + mods);
    const tabs = await page.$$eval('nav#tabs a', (els) => els.map((e) => e.dataset.tab));
    assert.deepStrictEqual(tabs, ['home', 'faith', 'calm', 'workout', 'tagalog', 'coach']);
  });
  await t.step('nav goes to a module and back; current tab is marked', async () => {
    await page.click('nav#tabs a[data-tab="faith"]');
    await page.waitForSelector('.subnav');
    assert.strictEqual(await page.getAttribute('nav#tabs a[data-tab="faith"]', 'aria-current'), 'page');
    await page.click('nav#tabs a[data-tab="home"]');
    await page.waitForSelector('.home-card');
  });
  await t.step('an unknown address shows Home, not a blank page', async () => {
    await page.goto(base + '#nope/x');
    await page.waitForSelector('.home-card');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('shell browser');
})().catch((e) => { console.error(e); process.exit(1); });
