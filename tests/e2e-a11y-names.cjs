/* TalkBack: every button, link, chip and form field on every page has a name it can read out (visible text,
   aria-label, a <label>, or a title). Icon-only buttons (🔊, ⋯, ✕, ↻, ▶) need an aria-label: "speaker" or nothing at
   all is what TalkBack says otherwise. Checked on 20 pages with a year of data. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const { simulate } = require('./lib/year.cjs');
(async () => {
  const t = await W.open({ time: new Date(2027, 10, 17, 18, 0) });
  const { page, base } = t;
  const json = Object.fromEntries(Object.entries(simulate(60)).map(([k, v]) => [k, JSON.stringify(v)]));
  await page.goto(base + '#home');
  await page.evaluate((json) => {
    for (const [k, v] of Object.entries(json)) localStorage.setItem(k, v);
    localStorage.setItem('wl.todo.v1', JSON.stringify({ tasks: [{ id: 'x', text: 'Bins', due: '2027-11-17', repeat: 'weekly', at: '19:00', done: null, created: '2027-11-01T12:00:00.000Z' }] }));
  }, json);
  await page.reload(); await page.waitForSelector('.home-card');
  await t.step('every control on every page has a name TalkBack can read', async () => {
    const bad = [];
    for (const h of ['#home', '#calm', '#workout', '#workout/history', '#workout/settings', '#tagalog', '#tagalog/words', '#tagalog/review', '#tagalog/settings', '#faith', '#faith/journal', '#faith/pray', '#faith/settings', '#todo', '#coach', '#coach/setup', '#me', '#journal', '#cook', '#cook/week', '#cook/log', '#cook/pantry', '#settings', '#link']) {
      await page.goto(base + h); await page.waitForTimeout(60);
      const found = await page.evaluate(() => {
        const nameOf = (e) => {
          const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
          const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
          if (e.labels && e.labels.length) { const t = Array.from(e.labels).map((l) => l.textContent).join(' ').trim(); if (t) return t; }
          if ((e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && e.placeholder) return e.placeholder;
          if (e.title && e.title.trim()) return e.title.trim();
          const img = e.querySelector('img[alt]'); if (img && img.alt.trim()) return img.alt.trim();
          // visible text, leaving out what's hidden from TalkBack
          const walk = (n) => n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' && getComputedStyle(n).display !== 'none' ? Array.from(n.childNodes).map(walk).join('') : '';
          return walk(e).trim();
        };
        const words = (s) => /[A-Za-zÀ-ɏ0-9]/.test(s); // a name made only of symbols/emoji isn't a name
        return Array.from(document.querySelectorAll('#view button, #view a[href], #view input:not([type="hidden"]), #view select, #view textarea, #view [role="button"], nav#tabs a'))
          .filter((e) => e.offsetParent !== null || e.type === 'file')
          .map((e) => ({ e, n: nameOf(e) }))
          .filter((x) => !words(x.n))
          .map((x) => x.e.tagName.toLowerCase() + (x.e.id ? '#' + x.e.id : '') + (x.e.className ? '.' + String(x.e.className).split(' ')[0] : '') + ' "' + x.n + '"');
      });
      if (found.length) bad.push(h + ': ' + found.slice(0, 8).join(', '));
    }
    assert.deepStrictEqual(bad, [], 'controls without a readable name');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('accessible names');
})().catch((e) => { console.error(e); process.exit(1); });
