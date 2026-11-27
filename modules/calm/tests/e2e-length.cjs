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
    await page.click('#c-save'); await page.waitForSelector('#c-today');
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
  await t.step('10 pm after a night answer "Mind racing": today card suggests the picture-word shuffle and links to the journal', async () => {
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
    assert.ok((await page.textContent('#c-today h3')).includes('Picture-word shuffle'), await page.textContent('#c-today h3'));
    assert.strictEqual(await page.getAttribute('#c-racing a', 'href'), '#journal/journal');
    assert.ok((await page.textContent('#c-how')).includes('cognitive shuffle'), 'first time: how it works');
    assert.ok(!(await page.$('#c-flat')), 'one "Not really" is no streak');
  });
  await t.step('three "Not really" in a row: the today card says so; the shuffle plays through with its guided lines', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      [[19, 'ground'], [20, 'ground'], [21, 'ground']].forEach(([d, id]) => me.feedback.push({ id: 'calm/after/' + id + '@' + d, at: new Date(2026, 10, d - 3, 21, 40).toISOString(), part: 'calm', about: id + '@' + d, kind: 'after', a: { helped: 'Not really', block: ['Nothing'] } }));
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    const flat = await page.textContent('#c-flat');
    assert.ok(/Your last 4 practices didn’t help much/.test(flat) && /works differently/.test(flat), flat);
    assert.ok((await page.textContent('#c-today h3')).includes('Picture-word shuffle'));
    await page.click('#c-today a.btn.primary'); await page.waitForSelector('#c-pp');
    assert.ok(/Begin · 5 min/.test(await page.textContent('#c-pp')), await page.textContent('#c-pp'));
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1')); c.sessions.push({ id: 'shuffle', date: '2026-11-10', at: new Date(2026, 10, 10, 22).toISOString(), mins: 5 }); localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.ok(!(await page.$('#c-how')), 'done once: no explainer');
    // a newer answer that helped ends the streak
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'calm/after/slow@x', at: new Date(2026, 10, 18, 21, 50).toISOString(), part: 'calm', about: 'slow@x', kind: 'after', a: { helped: 'A bit' } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.ok(!(await page.$('#c-flat')));
  });
  await t.step('the weekly plan\'s Calm pick leads until he taps "Not for me?" on that plan line', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 19, 14, 0));
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback = []; me.plan = { at: new Date(2026, 10, 18, 9, 0).toISOString(), headline: 'h', parts: { calm: { focus: 'Try the quiet timer', why: 'w', prefer: ['timer'] } } };
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
      const c = JSON.parse(localStorage.getItem('wl.calm.v1')); c.sessions = [{ id: 'slow', date: '2026-11-17', at: new Date(2026, 10, 17, 12).toISOString(), mins: 5 }]; localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.ok((await page.textContent('#c-today h3')).includes('Quiet timer'), await page.textContent('#c-today h3'));
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'calm/notfit/plan', at: new Date(2026, 10, 19, 13, 0).toISOString(), part: 'calm', about: 'plan:' + me.plan.at.slice(0, 10), kind: 'notfit', a: { reasons: [] } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
    assert.ok(!(await page.textContent('#c-today h3')).includes('Quiet timer'), await page.textContent('#c-today h3'));
  });
  await t.step('Calm list: "Helped N of M"; a practice at 0 of 3+ says it hasn\'t helped and moves to the end', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback = [];
      const f = (id, d, helped) => me.feedback.push({ id: 'calm/after/' + id + d, at: new Date(2026, 10, d, 12).toISOString(), part: 'calm', about: id + '@' + d, kind: 'after', a: { helped } });
      f('ground', 10, 'Not really'); f('ground', 11, 'Not really'); f('ground', 12, 'Not really'); f('body', 10, 'A bit'); f('body', 11, 'Not really');
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-all-open');
    await page.click('#c-all-open'); await page.waitForSelector('#c-all-list li');
    const items = await page.$$eval('#c-all-list > li', (ls) => ls.map((l) => l.textContent)); // the practices, not the meditation path's stages
    assert.ok(items[items.length - 1].includes('5-4-3-2-1 grounding') && items[items.length - 1].includes('Hasn’t helped you so far'), items[items.length - 1]);
    assert.ok(items.some((x) => x.includes('Body scan') && x.includes('Helped 1 of 2 times')));
    await page.click('#c-all-x');
  });
  await t.step('no overflow at 1.0, no errors', async () => { await t.noOverflow(['#calm/s/slow', '#calm/s/body', '#calm/s/shuffle']); assert.deepStrictEqual(t.errors, []); });
  await t.close('calm lengths');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
