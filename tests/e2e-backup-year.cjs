/* A new phone after a year of use: "Save a backup" on the old one, "Restore a backup" on a fresh one, and every saved
   part comes back exactly as it was (each part's validate() must keep everything real data has, not tidy it away). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const W = require('./lib/web.cjs');
const { simulate } = require('./lib/year.cjs');
(async () => {
  const DAYS = 365;
  const stores = simulate(DAYS);
  stores['wl.todo.v1'].tasks.push(...[
    { id: 't1', text: 'Bins', due: '2027-11-18', repeat: 'weekly', at: '19:00', done: null, created: '2027-01-01T10:00:00.000Z' },
    { id: 't2', text: 'Rent', due: '2027-11-30', repeat: 'monthly', mday: 31, at: null, done: null, created: '2027-01-01T10:00:00.000Z' },
    { id: 't3', text: 'Done one', due: '2027-11-10', repeat: null, at: null, done: '2027-11-10T10:00:00.000Z', created: '2027-01-01T10:00:00.000Z', fromRepeat: 't1' }
  ]); // on top of a year of to-dos from simulate(): a month-end repeat and an old done copy
  const end = new Date(2026, 10, 18 + DAYS - 1, 18, 0);
  const t = await W.open({ time: end });
  const { page, base, ctx } = t;
  const json = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, JSON.stringify(v)]));
  json['wl.shell.v1'] = JSON.stringify({ theme: 'dark', textSize: 1.15, since: '2026-11-18T12:00:00.000Z' });
  await page.goto(base + '#home');
  await page.evaluate((json) => { localStorage.clear(); for (const [k, v] of Object.entries(json)) localStorage.setItem(k, v); }, json);
  await page.reload(); await page.waitForSelector('.home-card');
  const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /^(wl|fc)\./.test(k)).map((k) => [k, localStorage.getItem(k)])));
  let file;
  await t.step('Save a backup with a year of data', async () => {
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-export');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#wl-export')]);
    file = await dl.path();
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(o.app, 'wellness');
    for (const k of Object.keys(json)) assert.ok(typeof o.stores[k] === 'string', 'in the backup: ' + k);
    console.log('   backup ' + fs.statSync(file).size + ' bytes');
  });
  await t.step('Restore it on a fresh phone: every part back exactly', async () => {
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => t.errors.push(String(e)));
    await p2.addInitScript(() => { window.confirm = () => true; });
    await p2.clock.install({ time: end });
    await p2.goto(base + '#settings'); await p2.evaluate(() => localStorage.clear()); await p2.reload(); await p2.waitForSelector('#wl-import');
    await p2.setInputFiles('#wl-import', file);
    await p2.waitForFunction(() => !!localStorage.getItem('wl.tagalog.v1'), null, { timeout: 15000 });
    await p2.waitForTimeout(300);
    const after = await p2.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /^(wl|fc)\./.test(k)).map((k) => [k, localStorage.getItem(k)])));
    const differ = [];
    for (const k of Object.keys(json)) {
      const a = JSON.parse(before[k]), b = after[k] == null ? null : JSON.parse(after[k]);
      if (k === 'wl.shell.v1') { if (!b || b.theme !== a.theme || b.textSize !== a.textSize || b.since !== a.since) differ.push(k); continue; } // lastBackup is new
      try { assert.deepStrictEqual(b, a); } catch (e) {
        const keys = b && a && typeof a === 'object' ? Object.keys(a).filter((x) => JSON.stringify(a[x]) !== JSON.stringify(b[x])) : ['(whole)'];
        differ.push(k + ' [' + keys.slice(0, 6).join(', ') + ']');
        // say where: the first array item (or value) that differs
        keys.slice(0, 2).forEach((x) => { const A = a[x], B = b && b[x]; if (Array.isArray(A) && Array.isArray(B)) { const i = A.findIndex((v, j) => !require("util").isDeepStrictEqual(v, B[j])); console.log('   ' + k + '.' + x + ' (' + A.length + ' / ' + B.length + ') #' + i + ': ' + JSON.stringify(A[i]) + ' -> ' + JSON.stringify(B[i])); } });
      }
    }
    assert.deepStrictEqual(differ, [], 'parts that came back different');
    const toast = await p2.textContent('body');
    assert.ok(/Backup restored/.test(toast) && !/except/.test(toast), 'no part skipped');
    await p2.close();
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('backup of a year');
})().catch((e) => { console.error(e); process.exit(1); });
