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
    assert.ok(/Quiet sit/.test(await page.textContent('#c-why-quiet')), 'the path note points long sitters to Quiet sit');
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

  await t.step('a sit from 11:50 pm to 12:10 am counts for the evening it began', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 26, 23, 50));
    await page.goto(base + '#calm'); await page.reload();
    await page.goto(base + '#calm/s/timer'); await page.waitForSelector('#c-len');
    await page.click('[data-len="20"]');
    await page.click('#c-pp');
    for (let i = 0; i < 25; i++) { await page.clock.runFor(60000); if (await page.isVisible('#c-after')) break; }
    await page.waitForSelector('#c-after:not([hidden])');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.slice(-1)[0]);
    assert.strictEqual(s.id, 'timer');
    assert.strictEqual(s.date, '2026-11-26', 'dated the evening it began: ' + JSON.stringify(s));
    assert.strictEqual(new Date(s.at).getHours(), 23);
    await page.click('#c-save');
    // ended early after midnight (End): the same
    await page.goto(base + '#calm/s/timer'); await page.waitForSelector('#c-len');
    await page.clock.setSystemTime(new Date(2026, 10, 27, 23, 59));
    await page.click('#c-pp');
    await page.clock.runFor(3 * 60000);
    await page.click('#c-dark'); // the screen went dark
    await page.click('#c-end'); await page.waitForSelector('#c-today');
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.slice(-1)[0]);
    assert.strictEqual(e.date, '2026-11-27', JSON.stringify(e));
  });

  await t.step('Home on a rough day: the Calm card offers the sit at 10 min, for that sit only', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 28, 8, 0));
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('wl.calm.v1')); Object.assign(c.settings, { aim: 'train', sitMinutes: 20 }); localStorage.setItem('wl.calm.v1', JSON.stringify(c));
      const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.checkins['2026-11-28'] = { sleep: '4–5 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'OK' }; localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#calm'); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#c-card-rough');
    const card = page.locator('.home-card[data-module="calm"]');
    assert.ok(/· 10 min/.test(await card.locator('h3').textContent()));
    assert.ok((await card.locator('a.btn.primary').getAttribute('href')).endsWith('/10'));
    await card.locator('a.btn.primary').click();
    await page.waitForSelector('#c-pp');
    assert.ok(/Begin · 10 min/.test(await page.textContent('#c-pp')));
    assert.strictEqual(await page.getAttribute('[data-len="10"]', 'aria-pressed'), 'true');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.sitMinutes), 20, 'his length stays 20');
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-pp');
    assert.ok(/Begin · 20 min/.test(await page.textContent('#c-pp')), 'opened another way: his usual 20');
    await page.evaluate(() => { const me = JSON.parse(localStorage.getItem('wl.me.v1')); delete me.checkins['2026-11-28']; localStorage.setItem('wl.me.v1', JSON.stringify(me)); });
    await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('.home-card[data-module="calm"]');
    assert.strictEqual(await page.$('#c-card-rough'), null, 'no check-in: as usual');
  });

  await t.step('#calm/s/<id>/<minutes>: only a real length for that practice counts', async () => {
    for (const [hash, want] of [['#calm/s/count/7', 20], ['#calm/s/count/abc', 20], ['#calm/s/count/9999', 20], ['#calm/s/count/30', 30], ['#calm/s/timer/15', 15]]) {
      await page.goto(base + '#calm'); await page.goto(base + hash); await page.waitForSelector('#c-pp');
      assert.ok(new RegExp('Begin · ' + want + ' min').test(await page.textContent('#c-pp')), hash + ': ' + await page.textContent('#c-pp'));
    }
    for (const hash of ['#calm/s/sigh/10', '#calm/s/pickup/10']) {
      await page.goto(base + '#calm'); await page.goto(base + hash); await page.waitForSelector('#c-pp');
      assert.strictEqual(await page.$('#c-len'), null, hash + ': fixed length, no chips');
      assert.ok(!/· 10 min/.test(await page.textContent('#c-pp')), hash + ': its own length: ' + await page.textContent('#c-pp'));
    }
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('calm rough day');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
