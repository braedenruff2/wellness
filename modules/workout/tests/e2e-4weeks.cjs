/* Move > Progress: the last 4 weeks as a row of days per week (workout filled, a rest day he chose outlined with
   its reason in the label, nothing faint), no streak counting; readable in light, dark and night, fits at 1.3. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 24, 9, 0) });
  const { page, base } = t;
  const look = (ts, theme) => page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts })), [ts, theme]);
  const set = (date, ex) => ({ id: 's' + date, date, day: 'A', start: date + 'T14:00:00.000Z', end: date + 'T14:30:00.000Z', sets: [{ i: 0, ex: ex || 'Pushups', n: 1, val: 10, w: null, at: date + 'T14:01:00.000Z' }] });
  await page.goto(base + '#home');
  await t.step('nothing logged: no 4-week row', async () => {
    await page.goto(base + '#workout/history');
    assert.ok(!(await page.$('#wo-4w')));
  });
  await t.step('workouts and rest days land on their days, with labels', async () => {
    await page.evaluate((s) => localStorage.setItem('wl.workout.v1', JSON.stringify(s)), { equipment: 'fixed10', weights: {}, history: [], next: {},
      sessions: [set('2026-11-02'), set('2026-11-19')], rest: { '2026-11-21': { why: 'Busy day', at: '2026-11-21T23:00:00.000Z' } } });
    await page.reload(); await page.waitForSelector('#wo-4w');
    const rows = await page.$$eval('#wo-4w .wk4-row[role=list]', (rs) => rs.map((r) => ({ name: r.getAttribute('aria-label'), kinds: Array.from(r.children).map((c) => c.className.replace(/wk4-d |wk4-/g, '')) })));
    assert.deepStrictEqual(rows.map((r) => r.name), ['3 weeks ago', '2 weeks ago', 'Last week', 'This week']);
    assert.deepStrictEqual(rows[0].kinds, ['workout', 'none', 'none', 'none', 'none', 'none', 'none'], 'Mon 2 Nov');
    assert.deepStrictEqual(rows[2].kinds, ['none', 'none', 'none', 'workout', 'none', 'rest', 'none'], 'Thu 19 workout, Sat 21 rest');
    assert.deepStrictEqual(rows[3].kinds, ['none', 'none', 'future', 'future', 'future', 'future', 'future'], 'today is Tuesday');
    const rest = await page.$eval('#wo-4w .wk4-rest', (e) => e.getAttribute('aria-label'));
    assert.ok(/rest day \(busy day\)/.test(rest), rest);
    const main = await page.textContent('main');
    assert.ok(!/in a row/.test(main.split('workout days logged')[1] || ''), 'the 4-week row counts no streaks');
  });
  for (const theme of ['light', 'dark', 'night']) {
    await t.step(theme + ': the R and the filled squares stand out from the card', async () => {
      await look(1, theme); await page.reload(); await page.waitForSelector('#wo-4w');
      const r = await page.evaluate(() => {
        const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
        const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const ratio = (a, b) => { a = lum(a); b = lum(b); return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2); };
        const card = rgb(getComputedStyle(document.querySelector('#wo-4w').closest('.card')).backgroundColor);
        return { text: ratio(rgb(getComputedStyle(document.querySelector('#wo-4w .wk4-rest')).color), card),
          fill: ratio(rgb(getComputedStyle(document.querySelector('#wo-4w .wk4-workout')).backgroundColor), card) };
      });
      const min = theme === 'night' ? 3 : 4.5;
      assert.ok(r.text >= min && r.fill >= 3, JSON.stringify(r));
    });
  }
  await t.step('fits the phone at text size 1.3; no errors', async () => {
    await look(1.3, 'light'); await page.reload();
    await t.noOverflow(['#workout/history']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('workout 4 weeks');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
