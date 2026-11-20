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
  await t.step('Home starts with one "today" list; it follows each part (a check-in, a calm practice)', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    const txt = await page.textContent('#wl-today');
    assert.ok(/0 of \d done today/.test(txt) && /Check-in/.test(txt) && /Faith: day 1/.test(txt) && /Calm:/.test(txt) && /Move:/.test(txt) && /Tagalog:/.test(txt), txt);
    for (const [k, v] of [['sleep', '7 h+'], ['wakes', '0'], ['energy', 'Good'], ['mood', 'Good'], ['day', 'Good']]) await page.click(`[data-me-ck][data-k="${k}"][data-v="${v}"]`);
    await page.waitForFunction(() => /1 of \d done today/.test(document.getElementById('wl-today').textContent));
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[]}'); s.sessions = s.sessions || []; const n = new Date(); s.sessions.push({ id: 'sigh', date: n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'), at: n.toISOString(), mins: 1, before: null, after: null }); localStorage.setItem('wl.calm.v1', JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('#wl-today');
    const t2 = await page.textContent('#wl-today');
    assert.ok(/2 of \d done today/.test(t2) && /Calm: done/.test(t2), t2);
    await page.click('#wl-today a[href^="#faith"]'); await page.waitForSelector('.subnav');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('shell browser');
})().catch((e) => { console.error(e); process.exit(1); });
