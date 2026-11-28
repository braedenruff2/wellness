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
  await t.step('469: on day 30 of a sick stretch (every card sick-aware), Home still draws under 300 ms', async () => {
    const calls = await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.checkins = me.checkins || {};
      for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = MeCore.iso(d); me.checkins[k] = Object.assign({}, me.checkins[k] || { at: new Date().toISOString() }, i ? { stillUnwell: 'Yes' } : { note: 'we are all sick, sore throat' }); }
      localStorage.setItem('wl.me.v1', JSON.stringify(me)); WL.modules.me.reload();
      let n = 0; const u = WLMe.unwell; WLMe.unwell = function () { n++; return u.apply(this, arguments); };
      history.replaceState(null, '', '#settings'); window.dispatchEvent(new HashChangeEvent('hashchange'));
      history.replaceState(null, '', '#home'); window.dispatchEvent(new HashChangeEvent('hashchange'));
      WLMe.unwell = u;
      return { n, sick: WLMe.unwell(), day: MeCore.sickDayNo(JSON.parse(localStorage.getItem('wl.me.v1')), new Date()) };
    });
    assert.ok(calls.sick && calls.day >= 30, JSON.stringify(calls));
    await homeMs();
    const ms = []; for (let i = 0; i < 5; i++) ms.push(await homeMs());
    ms.sort((a, b) => a - b);
    console.log('   sick-day Home draw median ' + ms[2].toFixed(0) + ' ms, WLMe.unwell calls per draw: ' + calls.n);
    assert.ok(ms[2] < 300, 'sick-day Home took ' + ms[2].toFixed(0) + ' ms');
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
  await t.step('Drive sync of a heavy year: Home first draw stays under 200 ms at CPU 4x and 30-min throttle skips repeats', async () => {
    const p2 = await page.context().newPage();
    const cdp2 = await p2.context().newCDPSession(p2);
    await p2.clock.install({ time: end });
    await p2.addInitScript((json) => {
      if (!sessionStorage.getItem('seeded2')) {
        for (const [k, v] of Object.entries(json)) localStorage.setItem(k, v);
        localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1, since: '2026-11-18T12:00:00.000Z' }));
        sessionStorage.setItem('seeded2', '1');
      }
      window.__drivePerf = { reads: 0, writes: 0, bytes: 0, writeStartAt: 0 };
      window.FCAndroid = {
        syncStatus: () => JSON.stringify({ configured: true, name: 'wellness-sync.json', lastSync: 0, error: '', busy: false, answersConfigured: true, answersName: 'wellness-answers', answersError: '' }),
        syncRead: (id) => { window.__drivePerf.reads++; Promise.resolve().then(() => window.FCSyncDone(id, true, '')); },
        syncReadAnswers: (id) => { Promise.resolve().then(() => window.FCSyncDone(id, true, '')); },
        syncWrite: (id, text) => {
          window.__drivePerf.writes++;
          window.__drivePerf.bytes = String(text || '').length;
          window.__drivePerf.writeStartAt = performance.now();
          Promise.resolve().then(() => window.FCSyncDone(id, true, ''));
        }
      };
    }, json);
    await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p2.goto(base + '#home');
    await p2.waitForSelector('.home-card');
    // Home's first draw must not be blocked by Drive sync (autoSync is deferred 1.5s after start)
    const beforeSync = await p2.evaluate(() => ({
      writes: window.__drivePerf.writes,
      drawMs: (() => {
        history.replaceState(null, '', '#settings'); window.dispatchEvent(new HashChangeEvent('hashchange'));
        history.replaceState(null, '', '#home');
        const t0 = performance.now(); window.dispatchEvent(new HashChangeEvent('hashchange'));
        return performance.now() - t0;
      })()
    }));
    assert.strictEqual(beforeSync.writes, 0, 'Drive sync deferred past initial Home draw');
    assert.ok(beforeSync.drawMs < 200, 'Home draw with Drive sync configured took ' + beforeSync.drawMs.toFixed(0) + ' ms');
    // Let the 1.5 s autoSync fire and measure the synchronous payload build + Home draw responsiveness
    const syncTiming = await p2.evaluate(async () => {
      const t0 = performance.now();
      await WL.driveSync.sync({ auto: true });
      const syncMs = performance.now() - t0;
      // Throttled autoSync immediately after must skip with 0 extra writes
      const t1 = performance.now();
      const skipped = await WL.driveSync.sync({ auto: true });
      const skipMs = performance.now() - t1;
      return { syncMs, skipMs, skipped: !!(skipped && skipped.skipped), writes: window.__drivePerf.writes, bytes: window.__drivePerf.bytes };
    });
    console.log('   Drive sync (year, CPU 4x): Home ' + beforeSync.drawMs.toFixed(0) + ' ms, sync ' + syncTiming.syncMs.toFixed(0) + ' ms (' + (syncTiming.bytes / 1e6).toFixed(2) + ' MB), throttled skip ' + syncTiming.skipMs.toFixed(1) + ' ms');
    assert.strictEqual(syncTiming.writes, 1, 'wrote once, second autoSync throttled');
    assert.strictEqual(syncTiming.skipped, true, '30-min throttle skipped repeat write');
    assert.ok(syncTiming.bytes > 1000000, 'heavy year sync payload built: ' + syncTiming.bytes);
    assert.ok(syncTiming.syncMs < 200, 'building + dispatching Drive sync payload took ' + syncTiming.syncMs.toFixed(0) + ' ms');
    await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p2.close();
  });
  await t.step('no errors', async () => { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); assert.deepStrictEqual(t.errors, []); });
  await t.close('performance');
})().catch((e) => { console.error(e); process.exit(1); });
