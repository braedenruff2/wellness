/* Calm in the browser: pacer animates and finishes, guided voice plays and pauses, ratings saved, early end counts. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 18, 14, 0) });
  const { page, base } = t;
  await page.goto(base + '#calm');
  await t.step('list with a suggestion, every practice and the faith link', async () => {
    assert.strictEqual(await page.locator('.list li').count(), await page.evaluate(() => window.CalmCore.PRACTICES.length));
    assert.ok(await page.isVisible('a[href="#faith/pray"]'));
  });
  await t.step('one-minute reset: rate, breathe, finish, rate again, saved', async () => {
    await page.goto(base + '#calm/s/sigh');
    await page.click('#c-before [data-r="4"]');
    await page.click('#c-pp');
    await page.clock.runFor(2000);
    assert.ok(/Breathe in|Hold|Breathe out|In/.test(await page.textContent('#c-label')));
    const tf = await page.getAttribute('#c-ball', 'style');
    assert.ok(/scale\(/.test(tf), tf);
    // the rest in one jump (the end is worked out from the clock; running every animation frame took over a minute)
    await page.clock.fastForward(60000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'));
    assert.ok(!(await page.isVisible('#c-pp')), 'no Pause button once it has ended');
    await page.click('#c-after-r [data-r="2"]');
    await page.click('#c-save');
    await page.waitForSelector('.list');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions[0]);
    assert.strictEqual(st.before, 4); assert.strictEqual(st.after, 2); assert.ok(st.mins >= 1 && st.mins < 1.2, st.mins);
  });
  await t.step('pause stops the clock', async () => {
    await page.goto(base + '#calm/s/box');
    await page.click('#c-pp'); await page.clock.runFor(10000);
    await page.click('#c-pp'); const left = await page.textContent('#c-left');
    await page.clock.runFor(10 * 60000);
    assert.strictEqual(await page.textContent('#c-left'), left);
    assert.ok(!(await page.isVisible('#c-after')));
    await page.click('#c-pp'); await page.clock.runFor(5000);
    assert.ok(!(await page.isVisible('#c-after')), 'resumed, not over yet');
    await page.clock.fastForward(6 * 60000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'));
  });
  await t.step('guided body scan speaks its lines; ending early after 30 s still counts', async () => {
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(60000);
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    assert.ok(spoken[0].startsWith('Get comfortable'), spoken.join('|'));
    await page.click('#c-end');
    await page.waitForSelector('.list');
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length);
    assert.strictEqual(n, 3, 'a finished session is saved even without tapping Done; the early-ended body scan too');
  });
  await t.step('his report: once a practice is done today, Calm says so (not the same practice again)', async () => {
    await page.goto(base + '#calm');
    const top = await page.textContent('#c-today');
    assert.ok(/Done for today/.test(top), top);
    assert.ok(/One-minute reset/.test(top), top);
    await page.goto(base + '#home');
    assert.ok(/Done for today/.test(await page.textContent('.home-card[data-module="calm"]')));
  });
  await t.step('a new day: today’s practice not done; the body scan speaks different words the second time', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 19, 14, 0));
    await page.goto(base + '#calm'); await page.reload();
    const top = await page.textContent('#c-today');
    assert.ok(/not done yet/.test(top), top);
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(30000);
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    assert.ok(spoken.length && !spoken[0].startsWith('Get comfortable'), spoken.join('|'));
    await page.click('#c-end');
  });
  await t.step('leaving mid-session with the back gesture still saves the minutes (it used to drop them)', async () => {
    const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length);
    await page.goto(base + '#calm'); await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(3 * 60000);
    await page.goBack(); await page.waitForSelector('.list');
    const ss = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions);
    assert.strictEqual(ss.length, n0 + 1); assert.ok(ss[ss.length - 1].mins >= 2.9, JSON.stringify(ss[ss.length - 1]));
    await page.goto(base + '#calm/s/body'); await page.click('#c-pp'); await page.clock.runFor(10000);
    await page.goto(base + '#home');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length), n0 + 1, 'under 30 s: not counted');
  });
  await t.step('soft tick setting: off by default, remembered, ticks on each phase change (not the first)', async () => {
    await page.goto(base + '#calm');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'false');
    await page.evaluate(() => { window.__ticks = []; WL.tick = (p) => window.__ticks.push(p); });
    await page.goto(base + '#calm/s/box'); await page.click('#c-pp'); await page.clock.runFor(17000);
    assert.deepStrictEqual(await page.evaluate(() => window.__ticks), [], 'off: silent');
    await page.click('#c-end');
    await page.goto(base + '#calm'); await page.click('#ctk');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'true');
    await page.reload(); await page.waitForSelector('#ctk');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'true', 'kept after reload');
    await page.evaluate(() => { window.__ticks = []; WL.tick = (p) => window.__ticks.push(p); });
    await page.goto(base + '#calm/s/box'); await page.click('#c-pp'); await page.clock.runFor(16500);
    assert.deepStrictEqual(await page.evaluate(() => window.__ticks), ['hold', 'down', 'hold', 'up']);
    await page.click('#c-pp'); await page.clock.runFor(8000);
    assert.strictEqual((await page.evaluate(() => window.__ticks)).length, 4, 'paused: no ticks');
    await page.click('#c-end');
    await page.goto(base + '#calm'); await page.click('#ctk');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.tick), false);
  });
  await t.step('Home card, no overflow, no errors', async () => {
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="calm"]')).length > 10);
    await t.noOverflow(['#calm', '#calm/s/slow', '#calm/s/body']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('calm browser');
})().catch((e) => { console.error(e); process.exit(1); });
