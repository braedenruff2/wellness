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
  await t.step('modals (#co-teach-modal, #c-all-modal, #ck-food-modal): every control has a TalkBack name and fits 320 px', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    const checkModal = async (sel) => page.evaluate((rootSel) => {
      const nameOf = (e) => {
        const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
        const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
        if (e.labels && e.labels.length) { const t = Array.from(e.labels).map((l) => l.textContent).join(' ').trim(); if (t) return t; }
        if ((e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && e.placeholder) return e.placeholder;
        if (e.title && e.title.trim()) return e.title.trim();
        const walk = (n) => n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' && getComputedStyle(n).display !== 'none' ? Array.from(n.childNodes).map(walk).join('') : '';
        return walk(e).trim();
      };
      const words = (s) => /[A-Za-zÀ-ɏ0-9]/.test(s);
      const root = document.querySelector(rootSel);
      if (!root) return { missing: true };
      const unnamed = Array.from(root.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]'))
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ e, n: nameOf(e) }))
        .filter((x) => !words(x.n))
        .map((x) => x.e.tagName.toLowerCase() + (x.e.id ? '#' + x.e.id : '') + ' "' + x.n + '"');
      const box = root.querySelector('.wl-modal-box');
      const over = box ? Math.max(0, Math.round(box.scrollWidth - box.clientWidth)) : 0;
      const docOver = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      return { unnamed, over, docOver };
    }, sel);

    // 1. Parenting milestones modal (#co-teach-modal)
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-teach-open');
    await page.click('#co-teach-open');
    await page.waitForSelector('#co-teach-modal');
    assert.deepStrictEqual(await checkModal('#co-teach-modal'), { unnamed: [], over: 0, docOver: 0 }, '#co-teach-modal a11y names & 320 px fit');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('co-teach-modal'));

    // 2. Calm all practices modal (#c-all-modal)
    await page.goto(base + '#calm');
    await page.waitForSelector('#c-all-open');
    await page.click('#c-all-open');
    await page.waitForSelector('#c-all-modal');
    assert.deepStrictEqual(await checkModal('#c-all-modal'), { unnamed: [], over: 0, docOver: 0 }, '#c-all-modal a11y names & 320 px fit');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('c-all-modal'));

    // 3. Cooking food picker modal (#ck-food-modal) with picked tray, custom food Remove, and custom food form open
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-m-pick');
    await page.click('#ck-m-pick');
    await page.waitForSelector('#ck-food-modal');
    await page.click('#ck-food-results [data-fadd]');
    await page.waitForSelector('#ck-food-picked');
    await page.click('#ck-cf-add summary');
    assert.deepStrictEqual(await checkModal('#ck-food-modal'), { unnamed: [], over: 0, docOver: 0 }, '#ck-food-modal a11y names & 320 px fit');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ck-food-modal'));
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('accessible names');
})().catch((e) => { console.error(e); process.exit(1); });
