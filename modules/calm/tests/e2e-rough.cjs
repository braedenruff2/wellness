/* The path card's time-of-day line, and a meditation-path sit on a rough day (today's check-in: short sleep / broken night / low energy) says a 10-minute
   sit counts just as much; picking 10 min then is for that sit only (the saved 20 min stays). */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 7, 30) });
  const { page, base } = t;
  const checkin = (c) => page.evaluate((c) => {
    const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
    me.checkins = me.checkins || {};
    me.checkins['2026-11-26'] = c;
    localStorage.setItem('wl.me.v1', JSON.stringify(me));
  }, c);
  const saved = () => page.evaluate(() => (JSON.parse(localStorage.getItem('wl.calm.v1') || '{"settings":{}}').settings || {}).sitMinutes);

  await t.step('no check-in, or a good night: no line', async () => {
    await page.goto(base + '#calm/s/count');
    await page.waitForSelector('#c-len');
    assert.strictEqual(await page.$('#c-rough'), null);
    await checkin({ sleep: '7 h+', wakes: '0', energy: 'OK', mood: 'Good', day: 'Good' });
    await page.reload(); await page.waitForSelector('#c-len');
    assert.strictEqual(await page.$('#c-rough'), null);
  });

  await t.step('a 4-5 h night: the line shows; 10 min is for this sit only', async () => {
    await checkin({ sleep: '4–5 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'OK' });
    await page.reload(); await page.waitForSelector('#c-rough');
    assert.ok((await page.textContent('#c-rough')).includes('10-minute sit'));
    assert.ok(/Begin · 20 min/.test(await page.textContent('#c-pp')), 'still offers his usual 20');
    await page.click('[data-len="10"]');
    assert.ok(/Begin · 10 min/.test(await page.textContent('#c-pp')));
    assert.notStrictEqual(await saved(), 10, 'the shorter sit is not saved as his length');
    await page.click('[data-len="15"]');
    assert.strictEqual(await saved(), 15, 'another length is still kept');
    await page.click('[data-len="20"]');
    assert.strictEqual(await saved(), 20);
  });

  await t.step('a 10-minute default already: no line; other practices: no line', async () => {
    await page.click('[data-len="10"]'); // rough day, not saved
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1')); c.settings.sitMinutes = 10; localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
    await page.goto(base + '#calm'); await page.reload();
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-len');
    assert.strictEqual(await page.$('#c-rough'), null);
    await page.goto(base + '#calm/s/timer'); await page.waitForSelector('#c-pp');
    assert.strictEqual(await page.$('#c-rough'), null);
  });

  await t.step('the path card says which time of day his sits have gone best', async () => {
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
      c.settings.aim = 'train';
      const at = (d, h) => new Date(2026, 10, d, h, 0);
      [[20, 6, 3], [21, 7, 3], [23, 8, 2], [20, 23, 1], [21, 23, 1]].forEach(([d, h, f]) => {
        const t = at(d, h);
        c.sessions.push({ id: 'count', date: '2026-11-' + d, at: t.toISOString(), mins: 20, before: null, after: null, focus: f, hind: [] });
      });
      localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-path');
    assert.strictEqual((await page.textContent('#c-path-when')).trim(), 'Your steadiest sits have been in the morning (2 of 3 mostly steady; late at night 0 of 2).');
    await page.click('#c-recent summary');
    const rec = await page.textContent('#c-recent');
    assert.ok(/Nov 20 · 6:00\s?AM · 20 min · Mostly steady/i.test(rec) && /Nov 21 · 11:00\s?PM/i.test(rec), rec);
  });

  await t.step('Home with aim "training the mind": the Calm line is the sit, then what he sat', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('.today-list');
    assert.ok(/Calm: 10-min sit, counting breaths/.test(await page.textContent('.today-list')), await page.textContent('.today-list'));
  });

  await t.step('Quiet sit: remembered, and the voice gives only the opening and the close', async () => {
    const spoken = async (on) => {
      await page.goto(base + '#calm'); await page.reload();
      await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-quiet');
      if ((await page.getAttribute('#c-quiet', 'aria-pressed')) !== String(on)) await page.click('#c-quiet');
      assert.strictEqual(await page.getAttribute('#c-quiet', 'aria-pressed'), String(on));
      await page.click('[data-len="10"]');
      await page.evaluate(() => { window.__spoken = []; });
      await page.click('#c-pp');
      assert.ok(await page.isHidden('#c-quiet-row'), 'the choice hides once begun');
      for (let i = 0; i < 70; i++) await page.clock.runFor(10000);
      await page.waitForSelector('#c-after:not([hidden])');
      const n = await page.evaluate(() => window.__spoken.length);
      await page.click('#c-save');
      return n;
    };
    const full = await spoken(false), quiet = await spoken(true);
    assert.ok(full >= 8, 'guided: every line (' + full + ')');
    assert.ok(quiet >= 4 && quiet <= 5, 'quiet: opening and close only (' + quiet + ')');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.sitQuiet), true, 'kept');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.slice(-1)[0]);
    await page.goto(base + '#home'); await page.waitForSelector('.today-list');
    assert.ok(/Calm: sat (1[7-9]|2[01]) min \(Counting breaths\)/.test(await page.textContent('.today-list')), await page.textContent('.today-list'));
    assert.ok(s.mins >= 8.5 && s.mins <= 10.6, 'a quiet sit still lasts about its length (the fake voice speaks in 50 ms): ' + s.mins);
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm rough day');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
