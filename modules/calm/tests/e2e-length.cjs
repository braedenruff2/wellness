/* Calm start screens: length chips for this session only (breathing/timer: 3-20 min; guided: shorter/usual/longer),
   none on fixed ones; the pick sets the Begin label and the real length, hides once begun, and the saved default
   (and the next visit) stay as they were. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 18, 14, 0) });
  const { page, base } = t;
  const chips = () => page.$$eval('#c-len [data-len]', (b) => b.map((x) => [+x.dataset.len, x.getAttribute('aria-pressed') === 'true']));
  await t.step('fixed practices (one-minute reset, grounding) have no length chips', async () => {
    await page.goto(base + '#calm/s/sigh'); await page.waitForSelector('#c-pp');
    assert.strictEqual(!!(await page.$('#c-len')), false);
    await page.goto(base + '#calm/s/ground'); await page.waitForSelector('#c-pp');
    assert.strictEqual(!!(await page.$('#c-len')), false);
  });
  await t.step('Slow breathing: 3-20 min, the saved 5 is pressed; picking 3 changes Begin and the real length', async () => {
    await page.goto(base + '#calm/s/slow'); await page.waitForSelector('#c-len');
    assert.deepStrictEqual(await chips(), [[3, false], [5, true], [10, false], [15, false], [20, false]]);
    await page.click('[data-len="3"]');
    assert.ok(/Begin · 3 min/.test(await page.textContent('#c-pp')));
    await page.click('#c-pp');
    assert.ok(await page.isHidden('#c-len'), 'chips hide once begun');
    await page.clock.fastForward(3 * 60000 + 2000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'), 'ended after 3 minutes');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')));
    assert.ok(st.sessions[0].mins >= 3 && st.sessions[0].mins < 3.3, st.sessions[0].mins);
    assert.strictEqual(st.settings.minutes, 5, 'the saved default is unchanged');
    await page.click('#c-save'); await page.waitForSelector('.list');
  });
  await t.step('back on the list, the next visit starts at the usual length again', async () => {
    await page.goto(base + '#calm/s/slow'); await page.waitForSelector('#c-len');
    assert.deepStrictEqual((await chips()).find((c) => c[1]), [5, true]);
  });
  await t.step('Body scan (8 min): 5 / 8 / 12; the longer one makes the guided session longer, and leaving straight to Home clears the pick', async () => {
    await page.goto(base + '#calm/s/body'); await page.waitForSelector('#c-len');
    assert.deepStrictEqual((await chips()).map((c) => c[0]), [5, 8, 12]);
    await page.click('[data-len="12"]');
    assert.ok(/Begin · 12 min/.test(await page.textContent('#c-pp')));
    // leaving straight to #home (without visiting #calm list) clears the one-session pick
    await page.goto(base + '#home');
    await page.goto(base + '#calm/s/body'); await page.waitForSelector('#c-len');
    assert.ok(/Begin · 8 min/.test(await page.textContent('#c-pp')), 'default 8 min restored after leaving to Home');
  });
  await t.step('10 pm after a night answer "Mind racing": today card suggests grounding and links to the journal', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
      me.feedback.push({ id: 'calm/after/sleep@r', at: new Date(2026, 10, 17, 22, 20).toISOString(), part: 'calm', about: 'sleep@r', kind: 'after', a: { helped: 'Not really', block: ['Mind racing'] } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.clock.setSystemTime(new Date(2026, 10, 18, 22, 0));
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.strictEqual(await page.getAttribute('#c-racing a', 'href'), '#journal/journal', 'also on the done card');
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1')); c.sessions = []; localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.ok((await page.textContent('#c-today h3')).includes('5-4-3-2-1 grounding'), await page.textContent('#c-today h3'));
    assert.strictEqual(await page.getAttribute('#c-racing a', 'href'), '#journal/journal');
  });
  await t.step('no overflow at 1.0, no errors', async () => { await t.noOverflow(['#calm/s/slow', '#calm/s/body']); assert.deepStrictEqual(t.errors, []); });
  await t.close('calm lengths');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
