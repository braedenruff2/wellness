/* Late at night (21:00-05:00) a guided prayer goes dark after 20 s (WL.darkScreen, shared with Calm sits): a tap
   shows the words and it goes dark again; pause and End light it; never in the daytime; "Dark screen late at night"
   in Pray now turns it off (kept). */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 22, 22, 30) });
  const { page, base } = t;
  await page.addInitScript(() => { window.__dim = []; window.FCAndroid = { keepAwake: () => {}, dimScreen: (on) => window.__dim.push(!!on) }; });
  const dark = () => page.evaluate(() => !!document.getElementById('fc-dark'));

  await t.step('10:30 pm: dark after 20 s; a tap shows the words; dark again; pause and End light it', async () => {
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(15000);
    assert.strictEqual(await dark(), false, 'not yet at 15 s');
    await page.clock.runFor(6000);
    assert.strictEqual(await dark(), true, 'dark after 20 s');
    assert.ok(/Tap to see the words/.test(await page.getAttribute('#fc-dark', 'aria-label')));
    assert.deepStrictEqual(await page.evaluate(() => window.__dim), [true]);
    await page.click('#fc-dark');
    assert.strictEqual(await dark(), false);
    assert.ok((await page.textContent('#line')).trim().length > 0, 'the words are there');
    await page.clock.runFor(21000);
    assert.strictEqual(await dark(), true, 'dark again');
    await page.keyboard.press('Space');
    assert.strictEqual(await dark(), false, 'Space lights it');
    assert.strictEqual(await page.getAttribute('#pp', 'data-state'), 'playing', 'without pausing the prayer');
    await page.click('#pp'); // pause
    await page.clock.runFor(30000);
    assert.strictEqual(await dark(), false, 'stays lit while paused');
    await page.click('#pp'); // resume
    await page.clock.runFor(21000);
    assert.strictEqual(await dark(), true);
    await page.click('#fc-dark');
    const d = await page.evaluate(() => window.__dim);
    assert.strictEqual(d[d.length - 1], false, 'brightness given back when lit');
    await page.click('#end');
    await page.clock.runFor(25000);
    assert.strictEqual(await dark(), false, 'gone after End');
  });

  await t.step('a Pray now practice at 11:30 pm goes dark too', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 22, 23, 30));
    await page.goto(base + '#faith/pray'); await page.goto(base + '#faith/session/p/night'); await page.reload(); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(21000);
    assert.strictEqual(await dark(), true);
    await page.click('#fc-dark'); await page.click('#end');
  });

  await t.step('daytime: never dark', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 23, 14, 0));
    await page.goto(base + '#faith/today'); await page.goto(base + '#faith/session/day/1'); await page.reload(); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(30000);
    assert.strictEqual(await dark(), false);
    await page.click('#end');
    await page.goto(base + '#faith/pray'); await page.goto(base + '#faith/session/p/night'); await page.waitForSelector('#pp');
    await page.click('#pp'); await page.clock.runFor(30000);
    assert.strictEqual(await dark(), false, 'a practice in the daytime: no');
    await page.click('#end');
  });

  await t.step('setting off: never dark at night, and kept', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 23, 23, 0));
    await page.goto(base + '#faith/pray'); await page.reload(); await page.waitForSelector('#dark-toggle');
    assert.strictEqual(await page.getAttribute('#dark-toggle', 'aria-pressed'), 'true', 'on by default');
    await page.click('#dark-toggle');
    await page.waitForSelector('#dark-toggle[aria-pressed="false"]');
    await page.reload(); await page.waitForSelector('#dark-toggle[aria-pressed="false"]');
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(30000);
    assert.strictEqual(await dark(), false);
    await page.click('#end');
  });

  await t.step('Faith settings has the same choice and updates late-night sessions', async () => {
    await page.goto(base + '#faith/settings'); await page.waitForSelector('[data-set="darkPray"]');
    assert.strictEqual(await page.getAttribute('[data-set="darkPray"][data-val="false"]', 'aria-pressed'), 'true', 'Off from Pray now shows here');
    await page.click('[data-set="darkPray"][data-val="true"]');
    await page.waitForSelector('[data-set="darkPray"][data-val="true"][aria-pressed="true"]');
    await page.goto(base + '#faith/pray'); await page.waitForSelector('#dark-toggle');
    assert.strictEqual(await page.getAttribute('#dark-toggle', 'aria-pressed'), 'true', 'and back on in Pray now');
    // verify turning it on from #faith/settings actually enables late-night dark screen on #faith/session/day/1
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(21000);
    assert.strictEqual(await dark(), true, 'dark screen active after enabling in Faith settings');
    await page.click('#fc-dark'); await page.click('#end');
    // and turning it off from #faith/settings disables late-night dark screen on #faith/session/day/1
    await page.goto(base + '#faith/settings'); await page.waitForSelector('[data-set="darkPray"][data-val="false"]');
    await page.click('[data-set="darkPray"][data-val="false"]');
    await page.waitForSelector('[data-set="darkPray"][data-val="false"][aria-pressed="true"]');
    await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
    await page.click('#pp');
    await page.clock.runFor(30000);
    assert.strictEqual(await dark(), false, 'no dark screen after disabling in Faith settings');
    await page.click('#end');
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('faith dark screen');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
