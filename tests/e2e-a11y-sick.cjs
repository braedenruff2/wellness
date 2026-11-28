/* 446: accessibility of the sick-day screens (Home's sick line, Move "Rest today (sick)", Cooking's soup swap and its
   Undo, Parenting's sick note, "Still unwell?" chips, Calm's sick-day line): 44 px tap targets at text size 1.0 and
   1.3, nothing wider than a 320 px phone, AA text contrast in light and dark (night is dim on purpose: >= 3). */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 28, 9, 0) });
  const { page, base } = t;
  const look = (ts, theme) => page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts, since: '2026-10-01T12:00:00.000Z' })), [ts, theme]);
  const seed = () => page.evaluate(() => {
    const co = JSON.parse(localStorage.getItem('wl.coach.v1') || '{}');
    co.child = Object.assign({ name: '', birth: '2025-09-01', can: [] }, co.child || {});
    localStorage.setItem('wl.coach.v1', JSON.stringify(co));
    const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
    me.checkins = me.checkins || {};
    me.checkins['2026-11-27'] = { sleep: '7 h+', wakes: '0', energy: 'OK', mood: 'Good', day: 'Good', note: 'I think we\'re all sick. My throat hurts', at: '2026-11-27T19:49:00.000Z' };
    me.checkins['2026-11-28'] = { stillUnwell: 'Yes', at: '2026-11-28T12:00:00.000Z' };
    localStorage.setItem('wl.me.v1', JSON.stringify(me));
    const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}');
    c.settings = Object.assign(c.settings || {}, { aim: 'train', sitMinutes: 20 });
    localStorage.setItem('wl.calm.v1', JSON.stringify(c));
  });
  const small = (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
  const contrast = (root) => page.evaluate((rootSel) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
    const sels = ['p', '.meta', 'b', 'a', 'button', 'h3', 'span'].map((s) => rootSel + ' ' + s).join(', ');
    return Array.from(document.querySelectorAll(sels)).filter((e) => e.offsetParent !== null && e.textContent.trim() && !e.children.length).map((e) => {
      const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e));
      return { t: e.textContent.trim().slice(0, 25), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
    });
  }, root);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const SICK = '#me-still-unwell [data-me-unwell], #wo-rough-rest, #ck-sick-soup, #ck-home-mama, #ck-home-skip, #tl-card-listen, .home-card[data-module="coach"] [data-co-daily], #ck-sick-undo, #ck-sick-card [data-sick-soup], .home-card[data-module="calm"] a.btn';

  await page.goto(base + '#home');
  for (const [ts, theme, w] of [[1, 'light', 360], [1.3, 'light', 320], [1, 'dark', 360], [1, 'night', 320]]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step(theme + ' at ' + ts + 'x, ' + w + ' px: sick-day Home, the soup Undo, Cooking and Calm', async () => {
      await page.setViewportSize({ width: w, height: 760 });
      await look(ts, theme); await seed(); await page.reload();
      await page.waitForSelector('#ck-sick-soup'); await page.waitForSelector('#wo-rough-rest'); await page.waitForSelector('#co-sick');
      assert.ok(await page.$('#me-still-unwell'), 'Still unwell? chips on Home');
      assert.ok(await page.$('#ck-home-mama') && await page.$('#ck-home-skip'), '457: Mama cooked / Not making on Home');
      assert.ok(await page.$('#tl-card-listen') && await page.$('#co-sick-tips') && await page.isVisible('#me-sick-line'), '460-462 on Home');
      assert.deepStrictEqual(await small(SICK), [], 'tap targets');
      assert.ok((await overflow()) <= 2, 'Home overflow ' + (await overflow()));
      for (const card of ['me', 'workout', 'cook', 'coach', 'calm', 'tagalog']) {
        const cs = await contrast('.home-card[data-module="' + card + '"]');
        assert.ok(cs.length >= 2, card + ' card: text measured (' + cs.length + ')');
        assert.deepStrictEqual(cs.filter((x) => x.r < min), [], theme + ' ' + card + ' card');
      }
      await page.click('#ck-sick-soup'); await page.waitForSelector('#ck-sick-undo');
      assert.deepStrictEqual(await small('#ck-sick-undo'), [], 'Undo target');
      assert.ok((await overflow()) <= 2, 'Undo row overflow ' + (await overflow()));
      assert.deepStrictEqual((await contrast('#ck-sick-undo-row')).filter((x) => x.r < min), [], theme + ' Undo row');
      await page.click('#ck-sick-undo'); await page.waitForSelector('#ck-sick-soup');
      await page.goto(base + '#cook'); await page.waitForSelector('#ck-sick-card');
      assert.deepStrictEqual(await small('#ck-sick-card [data-sick-soup]'), [], 'soup chips');
      assert.ok((await overflow()) <= 2, '#cook overflow ' + (await overflow()));
      assert.deepStrictEqual((await contrast('#ck-sick-card')).filter((x) => x.r < min), [], theme + ' #ck-sick-card');
      await page.goto(base + '#tagalog'); await page.waitForSelector('#tl-sick');
      assert.deepStrictEqual(await small('#tl-sick a'), [], '#tl-sick targets');
      assert.ok((await overflow()) <= 2, '#tagalog overflow ' + (await overflow()));
      assert.deepStrictEqual((await contrast('#tl-sick')).filter((x) => x.r < min), [], theme + ' #tl-sick');
      await page.click('#tl-sick a.link'); await page.waitForSelector('#tl-walk');
      assert.deepStrictEqual(await small('#tl-walk'), [], 'Listen while resting chip');
      await page.goto(base + '#calm'); await page.waitForSelector('#c-path-sick');
      assert.ok((await overflow()) <= 2, '#calm overflow ' + (await overflow()));
      assert.deepStrictEqual((await contrast('#c-path')).filter((x) => x.r < min), [], theme + ' #c-path');
      await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-rough');
      assert.deepStrictEqual((await contrast('#c-rough')).filter((x) => x.r < min), [], theme + ' #c-rough');
      await page.goto(base + '#home');
    });
  }
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('sick-day a11y');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
