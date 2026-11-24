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
    await page.goto(base + '#todo'); await page.fill('#td-new', 'call the clinic today'); await page.press('#td-new', 'Enter');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.ok(/To do: call the clinic/.test(await page.textContent('#wl-today')), await page.textContent('#wl-today'));
    await page.click('#wl-today a[href^="#faith"]'); await page.waitForSelector('.subnav');
    // in the evening what's left isn't nagging
    await page.clock.setSystemTime(new Date(new Date().setHours(21, 0, 0, 0))); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(/Tomorrow is fine/.test(await page.textContent('#wl-today')), await page.textContent('#wl-today'));
  });
  await t.step('Sunday afternoon: a plain "Your week" line across parts; not on other days', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-week'), null, 'not on a Friday');
    await page.clock.setSystemTime(new Date(2026, 10, 22, 15, 0)); await page.reload(); await page.waitForSelector('#wl-today');
    const w = await page.textContent('#wl-week');
    assert.ok(/Your week/.test(w) && /day of calm|days of calm/.test(w), w);
  });
  await t.step('backup nudge: after 14 days without one, on Home one day a week and in Settings; gone after saving', async () => {
    const at = (d) => page.clock.setSystemTime(new Date(2026, 11, d, 10, 0));
    await at(10); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(/haven’t saved a backup/.test(await page.textContent('#wl-backup')));
    await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(await page.$('#wl-backup'), 'still there the same day');
    await at(11); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'not every day');
    // calendar-day 7-day cadence regardless of time of day / UTC offset
    await page.clock.setSystemTime(new Date(2026, 11, 16, 23, 30)); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'still hidden on day 6 late evening');
    await page.clock.setSystemTime(new Date(2026, 11, 17, 0, 30)); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(await page.$('#wl-backup'), 'reappears on day 7 early morning');
    await page.goto(base + '#settings');
    assert.ok(/It’s been a while/.test(await page.textContent('#view')));
    await Promise.all([page.waitForEvent('download'), page.click('#wl-export')]);
    await at(20); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'saved 9 days ago: no nudge');
  });
  await t.step('cancelling backup restore confirm resets #wl-import so picking the same file again works', async () => {
    await page.goto(base + '#settings');
    const payload = JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': JSON.stringify({ theme: 'dark', textSize: 1.15 }) } });
    const file = { name: 'same-backup.json', mimeType: 'application/json', buffer: Buffer.from(payload) };
    let confirms = 0;
    const handler = async (dialog) => { confirms++; if (confirms === 1) await dialog.dismiss(); else await dialog.accept(); };
    page.on('dialog', handler);
    await page.setInputFiles('#wl-import', file);
    await page.waitForFunction(() => document.getElementById('wl-import').value === '');
    assert.notStrictEqual(await page.getAttribute('html', 'data-theme'), 'dark', 'cancelled first confirm');
    await page.setInputFiles('#wl-import', file);
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    page.off('dialog', handler);
    assert.strictEqual(confirms, 2, 'same file triggered onchange a second time');
  });
  await t.step('restoreText validates wl.shell.v1 (sanitizes bad theme/textSize, skips corrupt JSON)', async () => {
    const res = await page.evaluate(() => {
      const skipped1 = WL.restoreText(JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': JSON.stringify({ theme: 'purple', textSize: 99, nudged: 'bad' }) } }));
      WL.applyLook();
      const sh1 = JSON.parse(localStorage.getItem('wl.shell.v1'));
      const skipped2 = WL.restoreText(JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': '{not json' } }));
      return { skipped1, sh1, skipped2 };
    });
    assert.deepStrictEqual(res.skipped1, []);
    assert.deepStrictEqual(res.sh1, { theme: 'auto', textSize: 1 });
    assert.deepStrictEqual(res.skipped2, ['Settings']);
  });
  await t.step('failed Android saveFile does not record lastBackup', async () => {
    const p2 = await page.context().newPage();
    await p2.addInitScript(() => { window.FCAndroid = { saveFile: () => '' }; });
    await p2.goto(base + '#settings');
    await p2.evaluate(() => {
      const sh = JSON.parse(localStorage.getItem('wl.shell.v1') || '{}');
      delete sh.lastBackup;
      localStorage.setItem('wl.shell.v1', JSON.stringify(sh));
    });
    await p2.reload();
    await p2.click('#wl-export');
    const sh = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.shell.v1') || '{}'));
    assert.strictEqual(sh.lastBackup, undefined, 'failed export must not set lastBackup');
    await p2.close();
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('shell browser');
})().catch((e) => { console.error(e); process.exit(1); });
