/* Calm background sound: fast taps never leave two sounds playing at once (task 432).
   Counts every buffer source started and every stop() call on it, through a wrapped AudioContext. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 28, 19, 0) });
  const { page, base } = t;

  await page.addInitScript(() => {
    window.__src = { live: 0, max: 0, starts: 0 };
    const AC = window.AudioContext;
    window.AudioContext = function () {
      const c = new AC();
      const orig = c.createBufferSource.bind(c);
      c.createBufferSource = function () {
        const s = orig();
        let on = false;
        const oStart = s.start.bind(s), oStop = s.stop.bind(s);
        s.start = function (...a) {
          window.__src.starts++;
          if (!on) { on = true; window.__src.live++; window.__src.max = Math.max(window.__src.max, window.__src.live); }
          return oStart(...a);
        };
        s.stop = function (...a) { if (on) { on = false; window.__src.live--; } return oStop(...a); };
        return s;
      };
      return c;
    };
  });
  const counts = () => page.evaluate(() => Object.assign({}, window.__src));
  const reset = () => page.evaluate(() => { window.__src.max = window.__src.live; window.__src.starts = 0; });

  await t.step('Begin tapped twice fast during a preview: one source at most, and the pause leaves none', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="brown"]');
    assert.strictEqual(await page.evaluate(() => window.WLNoise.previewing()), true, 'the tap plays a preview');
    await page.dblclick('#c-pp'); // Begin, then at once the same button again (pause)
    await page.clock.runFor(1500);
    const c = await counts();
    assert.ok(c.max <= 1, 'never two sources at once: ' + JSON.stringify(c));
    const st = await page.evaluate(() => ({ cur: window.WLNoise.current(), pp: document.querySelector('#c-pp').textContent }));
    if (st.cur === 'off') assert.strictEqual(c.live, 0, 'paused: nothing left playing');
    else assert.strictEqual(c.live, 1, 'running: exactly one');
    await page.click('#c-end').catch(() => {});
    await page.goto(base + '#calm');
    await page.waitForFunction(() => window.WLNoise.current() === 'off');
    assert.strictEqual((await counts()).live, 0, 'leaving stops it');
  });

  await t.step('chips tapped quickly during the 1 s fade-in, then Begin: one source, the last chip\'s sound', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-noise-pick');
    await reset();
    for (const k of ['pink', 'fan', 'ocean', 'white', 'brown', 'fan']) {
      await page.click('#c-noise-pick [data-noise="' + k + '"]');
      await page.clock.runFor(120);
      assert.ok((await counts()).live <= 1, 'one at a time after ' + k);
    }
    await page.click('#c-pp');
    await page.clock.runFor(300);
    await page.click('#c-noise-pick [data-noise="ocean"]'); // switched during the sit's fade-in
    await page.click('#c-noise-pick [data-noise="ocean"]'); // and the same chip again
    await page.clock.runFor(5000); // past the preview's own 4 s stop
    const c = await counts();
    assert.ok(c.max <= 1, 'never two at once: ' + JSON.stringify(c));
    assert.strictEqual(c.live, 1);
    assert.strictEqual(await page.evaluate(() => window.WLNoise.current()), 'ocean', 'the sit keeps the chosen sound (the preview timer does not stop it)');
    await page.click('#c-end');
    await page.waitForSelector('#c-today');
    assert.strictEqual((await counts()).live, 0);
  });

  await t.step('volume chips and pause/resume tapped fast: still one source, and Resume brings exactly one back', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-noise-pick');
    await page.click('#c-noise-pick [data-noise="brown"]');
    await page.click('#c-pp');
    await page.clock.runFor(200);
    await reset();
    const vols = await page.$$('[data-noise-vol]:visible');
    assert.ok(vols.length >= 3, 'volume chips on the sit screen');
    for (const v of vols) { await v.click(); await page.clock.runFor(50); }
    for (let i = 0; i < 5; i++) { await page.click('#c-pp'); await page.clock.runFor(60); }
    const c = await counts();
    assert.ok(c.max <= 1, 'never two at once: ' + JSON.stringify(c));
    const cur = await page.evaluate(() => window.WLNoise.current());
    assert.strictEqual(c.live, cur === 'off' ? 0 : 1, 'live sources match what is playing (' + cur + ')');
    await page.click('#c-end').catch(() => {});
    await page.goto(base + '#calm');
    await page.waitForFunction(() => window.WLNoise.current() === 'off');
    assert.strictEqual((await counts()).live, 0);
  });

  await t.close('calm noise races');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
