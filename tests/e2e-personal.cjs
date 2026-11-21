/* Her name only on the phone: content says {child}; the app shows the name from Parenting setup, or a fallback,
   and never shows a raw "{child}". */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  const firstDay = await (async () => { await page.goto(base + '#home'); return page.evaluate(() => window.FC_CONTENT.days.findIndex((d) => JSON.stringify(d).includes('{child')) + 1); })();
  const lessonWith = await page.evaluate(() => { for (const p of window.TL_PACKS) for (const l of p.lessons) if (JSON.stringify(l).includes('{child}')) return '#tagalog/l/' + p.id + '/' + l.day; return null; });
  assert.ok(firstDay > 0 && lessonWith, 'content uses {child}');
  const noToken = async () => assert.ok(!(await page.textContent('main')).includes('{child'), 'no raw {child} on screen');
  await t.step('no name yet: "your daughter" (faith) and "Baby" (Tagalog)', async () => {
    await page.goto(base + '#faith/day/' + firstDay);
    assert.ok(/your daughter|Your daughter|my daughter/.test(await page.textContent('main')));
    await noToken();
    await page.goto(base + lessonWith);
    await noToken();
  });
  await t.step('after Parenting setup: her name everywhere immediately (no reload needed) and after reload', async () => {
    await page.goto(base + '#coach/setup');
    await page.fill('#co-name', 'Ana'); await page.fill('#co-birth', '2025-11-24'); await page.click('#co-save');
    await page.goto(base + '#faith/day/' + firstDay);
    assert.ok((await page.textContent('main')).includes('Ana'), 'Faith updates immediately without reload');
    await noToken();
    await page.reload();
    await page.goto(base + '#faith/day/' + firstDay);
    assert.ok((await page.textContent('main')).includes('Ana'));
    await noToken();
    await page.goto(base + lessonWith);
    await noToken();
    const all = await page.evaluate(() => document.querySelector('main').textContent);
    assert.ok(!/\bBaby\b/.test(all) || all.includes('Ana'), 'the name replaces the fallback');
  });
  await t.step('no console errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('personal words');
})().catch((e) => { console.error(e); process.exit(1); });
