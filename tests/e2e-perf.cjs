/* Speed on an old phone: with a year of heavy use in every store (tests/lib/year.cjs) and the CPU slowed 4x (roughly a
   budget Android phone), Home draws in under 300 ms, no single Home card takes over 100 ms, and the parts' own pages
   open in under 500 ms. Prints the times so a slow card stands out. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const { simulate } = require('./lib/year.cjs');
(async () => {
  const DAYS = 365;
  const stores = simulate(DAYS);
  stores['wl.todo.v1'] = { tasks: Array.from({ length: 300 }, (_, i) => ({ id: 't' + i, text: 'Task number ' + i, due: '2027-11-' + String(1 + (i % 28)).padStart(2, '0'), repeat: i % 7 === 0 ? 'weekly' : null, at: i % 3 ? null : '09:00', done: i % 2 ? '2027-11-10T10:00:00.000Z' : null, created: '2027-01-01T10:00:00.000Z' })) };
  const end = new Date(2026, 10, 18 + DAYS - 1, 18, 0);
  const t = await W.open({ time: end });
  const { page, base } = t;
  const json = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, JSON.stringify(v)]));
  await page.addInitScript((json) => {
    if (sessionStorage.getItem('seeded')) return;
    for (const [k, v] of Object.entries(json)) localStorage.setItem(k, v);
    localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1, since: '2026-11-18T12:00:00.000Z' }));
    sessionStorage.setItem('seeded', '1');
  }, json);
  await page.goto(base + '#home'); await page.waitForSelector('.home-card');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const homeMs = async () => page.evaluate(() => {
    history.replaceState(null, '', '#settings'); window.dispatchEvent(new HashChangeEvent('hashchange'));
    history.replaceState(null, '', '#home');
    const t0 = performance.now(); window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (!document.querySelector('.home-card')) throw new Error('Home not drawn');
    return performance.now() - t0;
  });
  await t.step('Home with a year of data, CPU 4x slower: under 300 ms', async () => {
    await homeMs(); // warm
    const ms = []; for (let i = 0; i < 5; i++) ms.push(await homeMs());
    ms.sort((a, b) => a - b);
    console.log('   Home draw median ' + ms[2].toFixed(0) + ' ms (all: ' + ms.map((x) => x.toFixed(0)).join(', ') + ')');
    assert.ok(ms[2] < 300, 'Home took ' + ms[2].toFixed(0) + ' ms');
  });
  await t.step('no Home card over 100 ms', async () => {
    const per = await page.evaluate(() => {
      const out = {};
      Object.keys(WL.modules).forEach((k) => {
        const m = WL.modules[k]; if (!m.card) return;
        m.card(); const t0 = performance.now(); for (let i = 0; i < 3; i++) m.card(); out[k] = (performance.now() - t0) / 3;
        if (m.today) { m.today(); const t1 = performance.now(); m.today(); out[k + '.today'] = performance.now() - t1; }
      });
      return out;
    });
    console.log('   per card (ms): ' + Object.entries(per).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
    const slow = Object.entries(per).filter(([, v]) => v > 100);
    assert.deepStrictEqual(slow, [], 'slow cards');
  });
  await t.step('each part opens in under 500 ms', async () => {
    const times = {};
    for (const h of ['#calm', '#workout', '#workout/history', '#tagalog', '#tagalog/words', '#faith', '#faith/journal', '#faith/pray', '#todo', '#coach', '#me', '#journal', '#cook', '#cook/week', '#cook/log', '#cook/pantry', '#settings']) {
      times[h] = await page.evaluate((h) => {
        history.replaceState(null, '', '#home'); window.dispatchEvent(new HashChangeEvent('hashchange'));
        history.replaceState(null, '', h);
        const t0 = performance.now(); window.dispatchEvent(new HashChangeEvent('hashchange'));
        return performance.now() - t0;
      }, h);
    }
    console.log('   pages (ms): ' + Object.entries(times).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', '));
    const slow = Object.entries(times).filter(([, v]) => v > 500);
    assert.deepStrictEqual(slow, [], 'slow pages');
  });
  await t.step('no errors', async () => { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); assert.deepStrictEqual(t.errors, []); });
  await t.close('performance');
})().catch((e) => { console.error(e); process.exit(1); });
