/* Settings > "Hidden as not for me" (task 317): what he marked "Not for me" stays out of the screens, and a mistaken
   tap can be undone from Settings ("Bring back"); the practice is listed in Calm again. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 21, 15, 0) });
  const { page, base } = t;
  const calmIds = async () => {
    await page.click('#c-all-open');
    await page.waitForSelector('#c-all-list');
    const ids = await page.$$eval('#c-all-list a[href^="#calm/s/"]', (as) => as.map((a) => a.getAttribute('href').slice(8)));
    await page.click('#c-all-x');
    return ids;
  };
  let id;
  await t.step('nothing marked: no section in Settings', async () => {
    await page.goto(base + '#settings');
    assert.strictEqual(await page.locator('#me-hidden').count(), 0);
  });
  await t.step('mark Calm\'s suggestion "Not for me": it leaves All practices and shows in Settings', async () => {
    await page.goto(base + '#calm'); await page.reload();
    id = await page.getAttribute('#c-today [data-me-fit]', 'data-about');
    await page.click('#c-today [data-me-fit]');
    await page.click('#me-sheet [data-r="Too long"]');
    await page.click('#me-send');
    await page.goto(base + '#home'); await page.goto(base + '#calm');
    assert.ok(!(await calmIds()).includes(id), id + ' hidden from All practices');
    await page.goto(base + '#settings');
    assert.ok(/Hidden as “not for me” \(1\)/.test(await page.textContent('#me-hidden summary')));
    assert.strictEqual(await page.getAttribute('#me-hidden', 'open'), null, 'collapsed');
  });
  await t.step('Bring back removes the mark; Calm lists it again', async () => {
    await page.click('#me-hidden summary');
    await page.click('#me-hidden [data-me-unfit]');
    assert.strictEqual(await page.locator('#me-hidden').count(), 0, 'section goes when empty');
    const me = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1')));
    assert.ok(!me.feedback.some((f) => f.kind === 'notfit' && f.about === id));
    await page.goto(base + '#calm');
    assert.ok((await calmIds()).includes(id), id + ' back in All practices');
  });
  await t.step('Settings at 320 px / Larger text with a marked item: nothing cut off; no errors', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback.push({ id: 'workout/notfit/guide:coach:x/1', at: new Date().toISOString(), part: 'workout', about: 'guide:coach:x', kind: 'notfit', a: { reasons: [] }, shown: 'A very long coach line that goes on and on about sets and rest days and what to do when you are sore after a long gap' });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.reload();
    await page.goto(base + '#settings');
    await page.click('#me-hidden summary');
    await t.noOverflow(['#settings']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.step('items saved without their words get a readable name', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      const at = new Date().toISOString();
      const mk = (part, about) => ({ id: part + '/notfit/' + about + '/1', at, part, about, kind: 'notfit', a: { reasons: [] } });
      me.feedback = [mk('calm', 'ground'), mk('tagalog', 'lesson:2026-11-25/3'), mk('tagalog', 'tip:2026-11-25/3'), mk('coach', 'tip:abc'), mk('faith', 'day:4:think'), mk('workout', 'ex:Pushups'), mk('workout', 'balance'), mk('calm', 'plan:2026-11-21T04:19')];
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#settings'); await page.reload();
    await page.click('#me-hidden summary');
    const items = await page.$$eval('#me-hidden li', (ls) => ls.map((l) => l.textContent.replace(/Bring back$/, '').trim()));
    const want = ['Calm: Your weekly plan (Calm)', 'Move: The Move balance note', 'Move: Pushups', 'Faith: Faith day 4 (think)', 'Parenting: A parenting tip', 'Tagalog: A Tagalog lesson tip', 'Tagalog: Tagalog lesson 3 (week of 2026-11-25)'];
    for (const w of want) assert.ok(items.includes(w), w + ' in ' + JSON.stringify(items));
    assert.ok(items.some((x) => /^Calm: Grounding|^Calm: 5-4-3-2-1/i.test(x)) && !items.includes('Calm: ground'), 'Calm practice by its title: ' + JSON.stringify(items));
  });
  await t.step('more than 50 marks: the newest 50, then Show all (N)', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1'));
      me.feedback = Array.from({ length: 60 }, (_, i) => ({ id: 'workout/notfit/ex:E' + i + '/1', at: new Date(2026, 10, 1, 0, i).toISOString(), part: 'workout', about: 'ex:E' + i, kind: 'notfit', a: { reasons: [] }, shown: 'Exercise ' + i }));
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.goto(base + '#home'); await page.goto(base + '#settings'); await page.reload();
    await page.click('#me-hidden summary');
    assert.strictEqual(await page.locator('#me-hidden li:visible').count(), 50);
    assert.ok((await page.locator('#me-hidden li:visible').first().textContent()).includes('Exercise 59'), 'newest first');
    assert.strictEqual(await page.textContent('#me-hidden-all'), 'Show all (60)');
    await page.click('#me-hidden [data-me-unfit]');
    assert.strictEqual(await page.locator('#me-hidden li:visible').count(), 50, 'one brought back: the next one shows');
    assert.strictEqual(await page.textContent('#me-hidden-all'), 'Show all (59)');
    await page.click('#me-hidden-all');
    assert.strictEqual(await page.locator('#me-hidden li:visible').count(), 59);
    assert.strictEqual(await page.locator('#me-hidden-all').count(), 0);
  });
  for (const theme of ['light', 'dark', 'night']) {
    for (const ts of [1, 1.3]) {
      await t.step(theme + ' at text size ' + ts + ': Hidden list readable (AA, 3:1 at night) and its buttons 44 px', async () => {
        await page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts, since: '2026-10-01T12:00:00.000Z' })), [ts, theme]);
        await page.goto(base + '#settings'); await page.reload(); await page.waitForSelector('#me-hidden');
        await page.click('#me-hidden summary');
        const small = await page.$$eval('#me-hidden summary, #me-hidden button', (els) => els.filter((e) => e.offsetParent !== null).map((e) => ({ t: e.textContent.trim().slice(0, 20), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
        assert.deepStrictEqual(small, [], 'tap targets');
        const low = await page.evaluate(() => {
          const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
          const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
          const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
          return Array.from(document.querySelectorAll('#me-hidden summary, #me-hidden p, #me-hidden li, #me-hidden .meta, #me-hidden button')).map((e) => {
            const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e));
            return { t: e.textContent.trim().slice(0, 20), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
          });
        });
        const min = theme === 'night' ? 3 : 4.5;
        assert.deepStrictEqual(low.filter((x) => x.r < min), [], theme + ' contrast');
        await t.noOverflow(['#settings']);
      });
    }
  }
  await t.close('me hidden list');
})().catch((e) => { console.error(e); process.exit(1); });
