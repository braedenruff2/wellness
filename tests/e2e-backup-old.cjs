/* A backup saved by an older version of the app (before newer settings and fields existed: no walking dark screen,
   no Calm aim or sit settings, no undone rest days, no "missed again" counts, no Settings store at all) restores
   without any part being called unreadable, and the app then works with it. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const W = require('./lib/web.cjs');
const { simulate } = require('./lib/year.cjs');
(async () => {
  const st = simulate(10);
  const tg = st['wl.tagalog.v1']; delete tg.settings.walkDark; delete tg.reviews; delete tg.packHash;
  Object.values(tg.cards).forEach((c) => { delete c.againMiss; delete c.last; });
  tg.answers.forEach((a) => { delete a.hint; delete a.given; });
  const wk = st['wl.workout.v1']; delete wk.restRemoved; delete wk.sore; delete wk.rest; delete wk.target; delete wk.twoAsked;
  wk.sessions.forEach((s) => { delete s.removed; });
  const ca = st['wl.calm.v1']; ca.settings = { voice: true, rate: 0.9, minutes: 5 };
  ca.sessions.forEach((s) => { delete s.focus; delete s.hind; delete s.quiet; });
  const me = st['wl.me.v1']; delete me.plan; delete me.planTried; delete me.skipped;
  // before 26 Nov there was no Cooking and no "Note for autopilot"
  delete st['wl.cook.v1']; delete st['wl.notes.v1'];
  const stores = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, JSON.stringify(v)]));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wl-old-')), 'wellness-backup-2026-11-20.json');
  fs.writeFileSync(file, JSON.stringify({ app: 'wellness', exported: '2026-11-20T10:00:00.000Z', stores }, null, 1));
  const t = await W.open({ time: new Date(2026, 10, 28, 18, 0) });
  const { page, base } = t;
  await page.addInitScript(() => { window.confirm = () => true; });
  await t.step('an older backup restores with nothing called unreadable', async () => {
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-import');
    // the phone already has Cooking logs and a note: a backup without those parts leaves them as they are
    await page.evaluate(() => {
      localStorage.setItem('wl.cook.v1', JSON.stringify({ pantry: [], plan: null, bought: {}, logs: [{ id: 'lm1', at: '2026-11-27T12:00:00.000Z', date: '2026-11-27', who: 'me', meal: 'lunch', text: 'rice and egg', portion: 'Regular', tags: [] }], aiRecipes: {}, lastPhoto: null }));
      localStorage.setItem('wl.notes.v1', JSON.stringify({ notes: [{ id: 'n1', at: '2026-11-27T12:00:00.000Z', where: '#home', tag: 'Idea', text: 'keep this' }] }));
    });
    await page.reload(); await page.waitForSelector('#wl-import');
    await page.setInputFiles('#wl-import', file);
    await page.waitForFunction(() => /Backup restored/.test(document.body.textContent), null, { timeout: 10000 });
    assert.ok(!/except/.test(await page.textContent('body')), await page.textContent('body'));
    for (const k of Object.keys(stores)) assert.ok(await page.evaluate((k) => !!localStorage.getItem(k), k), 'restored: ' + k);
    const t2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')));
    assert.strictEqual(Object.keys(t2.cards).length, Object.keys(tg.cards).length, 'every Tagalog word kept');
    assert.strictEqual(t2.settings.walkDark, true, 'a newer setting gets its default');
    const ck = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')));
    assert.deepStrictEqual(ck.logs.map((x) => x.text), ['rice and egg'], 'Cooking kept (not in that backup)');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.map((x) => x.text)), ['keep this']);
  });
  await t.step('the app works with it: Home and each part open without errors', async () => {
    for (const h of ['#home', '#calm', '#workout', '#tagalog', '#tagalog/words', '#faith', '#todo', '#coach', '#me', '#cook', '#cook/week', '#cook/log', '#cook/pantry', '#journal']) {
      await page.goto(base + h); await page.waitForTimeout(80);
      assert.ok((await page.textContent('#view')).trim().length > 20, 'drawn: ' + h);
    }
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('older backup');
})().catch((e) => { console.error(e); process.exit(1); });
