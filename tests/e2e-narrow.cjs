/* Home on the narrowest phones (320 px wide) at text size 1.3, with every card showing its fullest state: Calm asks
   "What do you want from Calm?", Move offers "Rest today (tired)" after a very short night, Tagalog, Faith, To-do
   (with a reminder time) and About you. Nothing may be wider than the screen, no button may be cut off at the right
   edge or have its label clipped, and every tap target stays 44 px tall. Light, dark and night themes. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 26, 13, 0) });
  const { page, base } = t;
  await page.setViewportSize({ width: 320, height: 640 });
  const seed = (theme) => page.evaluate((theme) => {
    localStorage.clear();
    localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: 1.3, since: '2026-10-01T12:00:00.000Z' }));
    localStorage.setItem('wl.me.v1', JSON.stringify({
      feedback: [], skipped: {}, plan: null,
      checkins: { '2026-11-26': { at: '2026-11-26T11:00:00.000Z', sleep: 'Under 4 h', wakes: '3+', energy: 'Low', mood: 'Low', day: 'Hard' } }
    }));
    localStorage.setItem('wl.todo.v1', JSON.stringify({
      tasks: [
        { id: 't1', text: 'Call the pharmacy about the long prescription refill before they close', due: '2026-11-26', repeat: null, at: '16:30', done: null, created: '2026-11-25T12:00:00.000Z' },
        { id: 't2', text: 'Take bins out', due: '2026-11-26', repeat: 'weekly', at: '19:00', done: null, created: '2026-11-19T12:00:00.000Z' },
        { id: 't3', text: 'Order filters', due: '2026-11-27', repeat: null, at: null, done: null, created: '2026-11-25T14:00:00.000Z' }
      ]
    }));
  }, theme);
  const CARDS = ['calm', 'workout', 'tagalog', 'faith', 'todo', 'me'];
  for (const theme of ['light', 'dark', 'night']) {
    await t.step(theme + ': 320 px, text 1.3: every card present, nothing overflows or is clipped', async () => {
      await page.goto(base + '#home'); await seed(theme); await page.reload();
      await page.waitForSelector('.home-card[data-module="calm"] #c-aim-home');
      await page.waitForSelector('.home-card[data-module="workout"] #wo-rough-rest');
      const have = await page.$$eval('.home-card', (els) => els.map((e) => e.getAttribute('data-module')));
      for (const c of CARDS) assert.ok(have.includes(c), theme + ': no ' + c + ' card (have ' + have + ')');
      assert.ok(/Call the pharmacy/.test(await page.textContent('.home-card[data-module="todo"]')), 'to-do card names the task');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.strictEqual(over, 0, theme + ': Home overflows by ' + over + 'px');
      const bad = await page.$$eval('#view button, #view a.btn, #view .chips [data-aim], #view summary', (els) => els
        .filter((e) => e.offsetParent !== null)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            t: (e.textContent || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 40),
            right: Math.round(r.right), h: Math.round(r.height),
            clipped: e.scrollWidth > e.clientWidth + 1
          };
        })
        .filter((x) => x.right > window.innerWidth || x.clipped || x.h < 44));
      assert.deepStrictEqual(bad, [], theme + ': cut-off, clipped or small buttons');
      // every card's own content stays inside the card
      const spill = await page.$$eval('.home-card', (els) => els.map((c) => {
        const cr = c.getBoundingClientRect();
        const out = Array.from(c.querySelectorAll('*')).filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > cr.right + 1);
        return out.length ? c.getAttribute('data-module') + ': ' + out.slice(0, 3).map((e) => e.tagName + '#' + e.id + '.' + e.className).join(', ') : '';
      }).filter(Boolean));
      assert.deepStrictEqual(spill, [], theme + ': content wider than its card');
    });
  }
  await t.step('the today list and the check-in link fit too; no errors', async () => {
    assert.ok(await page.$('#wl-today'), 'today list shown');
    const over = await page.$$eval('#wl-today *', (els) => els.filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth).length);
    assert.strictEqual(over, 0);
    assert.deepStrictEqual(t.errors, []);
  });
  // Task 241: every page at 320 px, text 1.3, with a year of data in every store (long lists, long words)
  await t.step('every page at 320 px / 1.3 with a year of data: no sideways scroll, no button cut off', async () => {
    const { simulate } = require('./lib/year.cjs');
    const stores = simulate(365);
    const json = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, JSON.stringify(v)]));
    await page.clock.setSystemTime(new Date(2027, 10, 17, 18, 0));
    await page.goto(base + '#home');
    await page.evaluate((json) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(json)) localStorage.setItem(k, v);
      localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1.3, since: '2026-11-18T12:00:00.000Z' }));
      localStorage.setItem('wl.todo.v1', JSON.stringify({ tasks: [{ id: 'x', text: 'Ring the insurance company about the claim reference number before Friday afternoon', due: '2027-11-17', repeat: 'weekly', at: '16:30', done: null, created: '2027-11-01T12:00:00.000Z' }] }));
    }, json);
    await page.reload(); await page.waitForSelector('.home-card');
    const bad = [];
    for (const h of ['#home', '#calm', '#workout', '#workout/history', '#workout/settings', '#tagalog', '#tagalog/words', '#tagalog/review', '#tagalog/settings', '#faith', '#faith/journal', '#faith/pray', '#faith/settings', '#todo', '#coach', '#coach/setup', '#me', '#journal', '#cook', '#cook/week', '#cook/log', '#cook/pantry', '#settings', '#link']) {
      await page.goto(base + h); await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const over = document.documentElement.scrollWidth - window.innerWidth;
        const cut = Array.from(document.querySelectorAll('#view button, #view a.btn')).filter((e) => e.offsetParent !== null)
          .filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 0.5 || e.scrollWidth > e.clientWidth + 1; })
          .map((e) => (e.id || e.textContent.trim()).slice(0, 30));
        return { over, cut };
      });
      if (r.over > 0 || r.cut.length) bad.push(h + ' ' + JSON.stringify(r));
    }
    assert.deepStrictEqual(bad, [], 'pages too wide at 320 px');
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('narrow-screen');
})().catch((e) => { console.error(e); process.exit(1); });
