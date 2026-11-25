/* Accessibility: every main screen at the largest text size fits the phone width, and tap targets (buttons, chips,
   subnav tabs, Home's today list, to-do checkboxes) are at least 44 px tall at both normal and larger text sizes. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const SCREENS = ['#home', '#faith/today', '#faith/day/3', '#faith/pray', '#faith/prayers', '#faith/journal', '#faith/settings', '#journal', '#calm', '#calm/s/body',
  '#workout', '#workout/history', '#workout/settings', '#tagalog', '#tagalog/l/2026-11-18/1', '#tagalog/review', '#tagalog/words', '#tagalog/settings', '#coach', '#todo', '#me', '#settings', '#link'];
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 20, 9, 30) });
  const { page, base } = t;
  await page.goto(base + '#todo');
  await page.fill('#td-new', 'buy milk today'); await page.press('#td-new', 'Enter');

  async function checkTargets(label) {
    const small = [];
    for (const h of SCREENS) {
      await page.goto(base + h); await page.waitForTimeout(50);
      const s = await page.evaluate(() => Array.from(document.querySelectorAll('#view button, #view .btn, #view .chip, #view .subnav a, #wl-today a'))
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 44));
      s.forEach((x) => small.push(label + ' ' + h + ' "' + x.t + '" ' + x.h + 'px'));
    }
    assert.deepStrictEqual(small, []);
  }

  await t.step('normal text size (1.0): tap targets at least 44 px tall (including link buttons)', async () => {
    await checkTargets('1.0');
  });

  await t.step('themes: Home done tick follows --good (not bright fallback in dark/night) and contrast meets AA', async () => {
    // mark Faith day 1 done so Home shows a done item in #wl-today
    await page.goto(base + '#faith/today');
    await page.click('#finish');
    await page.goto(base + '#home');
    const checks = await page.evaluate(() => {
      function parseRgb(s) { const m = s.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
      function lum(rgb) {
        const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      }
      function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
      const out = {};
      for (const th of ['light', 'dark', 'night']) {
        document.documentElement.dataset.theme = th;
        const tk = document.querySelector('#wl-today li.done .tk');
        const card = document.querySelector('#wl-today');
        const meta = document.querySelector('#wl-today .meta') || document.querySelector('.meta');
        const cardBg = parseRgb(getComputedStyle(card).backgroundColor);
        const ink = parseRgb(getComputedStyle(document.body).color);
        const soft = parseRgb(getComputedStyle(meta).color);
        // resolve --good via a probe element
        const probe = document.createElement('span'); probe.style.color = 'var(--good)'; document.body.appendChild(probe);
        const good = getComputedStyle(probe).color; probe.remove();
        out[th] = {
          tkColor: tk ? getComputedStyle(tk).color : null,
          goodColor: good,
          inkContrast: +ratio(ink, cardBg).toFixed(2),
          metaContrast: +ratio(soft, cardBg).toFixed(2)
        };
      }
      return out;
    });
    for (const th of ['light', 'dark', 'night']) {
      assert.strictEqual(checks[th].tkColor, checks[th].goodColor, th + ' done tick uses --good');
      assert.ok(checks[th].inkContrast >= 4.5, th + ' body ink contrast ' + checks[th].inkContrast);
    }
    assert.ok(checks.light.metaContrast >= 4.5, 'light .meta contrast ' + checks.light.metaContrast);
    assert.ok(checks.dark.metaContrast >= 4.5, 'dark .meta contrast ' + checks.dark.metaContrast);
    assert.ok(checks.night.metaContrast >= 3.0, 'night .meta readable while dim at 3am: ' + checks.night.metaContrast);
  });

  await page.goto(base + '#home');
  await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: null, textSize: 1.3 })); });
  await page.reload();
  await t.step('largest text size (1.3): nothing wider than the phone', async () => {
    await t.noOverflow(SCREENS);
  });
  await t.step('largest text size (1.3): tap targets at least 44 px tall', async () => {
    await checkTargets('1.3');
  });
  await t.step('form inputs (search, date, time, number): >= 44 px tall, themed in dark/night, no overflow', async () => {
    // Seed 6 journal entries so #j-search is rendered on #faith/journal
    await page.evaluate(() => {
      const fc = JSON.parse(localStorage.getItem('fc.v1') || '{}');
      fc.journal = Array.from({ length: 6 }, (_, i) => ({ id: 'j' + i, at: '2026-11-20T10:0' + i + ':00.000Z', kind: 'journal', text: 'Entry ' + i }));
      localStorage.setItem('fc.v1', JSON.stringify(fc));
      if (window.FC) window.FC.reload();
      localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'night', textSize: 1.3 }));
    });
    await page.reload();
    const checkInput = async (hash, sel, prep) => {
      await page.goto(base + hash); await page.waitForTimeout(50);
      if (prep) await prep();
      await page.waitForSelector(sel);
      const info = await page.$eval(sel, (e) => {
        const cs = getComputedStyle(e), bg = getComputedStyle(document.body).backgroundColor;
        return { h: Math.round(e.getBoundingClientRect().height), bg: cs.backgroundColor, bodyBg: bg };
      });
      assert.ok(info.h >= 44, hash + ' ' + sel + ' height ' + info.h + ' < 44');
      assert.strictEqual(info.bg, info.bodyBg, hash + ' ' + sel + ' uses theme --bg in night mode (' + info.bg + ' vs ' + info.bodyBg + ')');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, hash + ' overflow ' + overflow + 'px');
    };
    await checkInput('#faith/journal', '#j-search');
    await checkInput('#coach/setup', '#co-birth');
    await checkInput('#workout', '.logrow .val');
    await checkInput('#todo', '#td-date', () => page.click('[data-more]'));
    await checkInput('#todo', '#td-time', () => page.click('[data-more]'));
  });
  await t.step('workout logged-set chips (.sc.on): at least 44x44 px tap target and no overflow at 1.3x', async () => {
    await page.goto(base + '#workout');
    await page.click('#ex-0 .logbtn');
    await page.waitForSelector('#ex-0 .sc.on');
    const box = await page.$eval('#ex-0 .sc.on', (e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert.ok(box.w >= 44 && box.h >= 44, '.sc.on tap target too small: ' + box.w + 'x' + box.h);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, '#workout active session overflow ' + overflow + 'px');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y browser');
})().catch((e) => { console.error(e); process.exit(1); });
