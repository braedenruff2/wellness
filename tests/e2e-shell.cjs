/* The shell: Home lists every module's card, the bottom nav works, settings change the look everywhere. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  await page.goto(base);
  await t.step('Home has a card for each module and the nav', async () => {
    await page.waitForSelector('.home-card');
    const mods = await page.$$eval('.home-card', (els) => els.map((e) => e.dataset.module));
    for (const m of ['faith', 'calm', 'workout', 'tagalog', 'todo', 'journal', 'cook']) assert.ok(mods.includes(m), 'card ' + m + ' in ' + mods);
    const tabs = await page.$$eval('nav#tabs a', (els) => els.map((e) => e.dataset.tab));
    assert.deepStrictEqual(tabs, ['home', 'faith', 'calm', 'workout', 'tagalog', 'coach']);
  });
  await t.step('nav goes to a module and back; current tab is marked', async () => {
    await page.click('nav#tabs a[data-tab="faith"]');
    await page.waitForSelector('.subnav');
    assert.strictEqual(await page.getAttribute('nav#tabs a[data-tab="faith"]', 'aria-current'), 'page');
    await page.click('nav#tabs a[data-tab="home"]');
    await page.waitForSelector('.home-card');
  });
  await t.step('an unknown address shows Home, not a blank page', async () => {
    await page.goto(base + '#nope/x');
    await page.waitForSelector('.home-card');
  });
  await t.step('Home starts with one "today" list; it follows each part (a check-in, a calm practice)', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    const txt = await page.textContent('#wl-today');
    assert.ok(/0 of \d done today/.test(txt) && /Check-in/.test(txt) && /Faith: day 1/.test(txt) && /Calm:/.test(txt) && /Move:/.test(txt) && /Tagalog:/.test(txt), txt);
    for (const [k, v] of [['sleep', '7 h+'], ['wakes', '0'], ['energy', 'Good'], ['mood', 'Good'], ['day', 'Good']]) await page.click(`[data-me-ck][data-k="${k}"][data-v="${v}"]`);
    await page.waitForFunction(() => /1 of \d done today/.test(document.getElementById('wl-today').textContent));
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[]}'); s.sessions = s.sessions || []; const n = new Date(); s.sessions.push({ id: 'slow', date: n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'), at: n.toISOString(), mins: 10, before: null, after: null }); localStorage.setItem('wl.calm.v1', JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('#wl-today');
    const t2 = await page.textContent('#wl-today');
    assert.ok(/2 of \d done today/.test(t2) && /Calm: done/.test(t2), t2);
    await page.goto(base + '#todo'); await page.fill('#td-new', 'call the clinic today'); await page.press('#td-new', 'Enter');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.ok(/To do: call the clinic/.test(await page.textContent('#wl-today')), await page.textContent('#wl-today'));
    await page.click('#wl-today a[href^="#faith"]'); await page.waitForSelector('.subnav');
    // in the evening what's left isn't nagging
    await page.clock.setSystemTime(new Date(new Date().setHours(21, 0, 0, 0))); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(/Tomorrow is fine/.test(await page.textContent('#wl-today')), await page.textContent('#wl-today'));
  });
  await t.step('Sunday afternoon: a plain "Your week" line across parts; not on other days', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-week'), null, 'not on a Friday');
    await page.clock.setSystemTime(new Date(2026, 10, 22, 15, 0)); await page.reload(); await page.waitForSelector('#wl-today');
    const w = await page.textContent('#wl-week');
    assert.ok(/Your week/.test(w) && /day of calm|days of calm/.test(w), w);
  });
  await t.step('backup nudge: after 14 days without one, on Home one day a week and in Settings; gone after saving', async () => {
    const at = (d) => page.clock.setSystemTime(new Date(2026, 11, d, 10, 0));
    await at(10); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(/haven’t saved a backup/.test(await page.textContent('#wl-backup')));
    await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(await page.$('#wl-backup'), 'still there the same day');
    await at(11); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'not every day');
    // calendar-day 7-day cadence regardless of time of day / UTC offset
    await page.clock.setSystemTime(new Date(2026, 11, 16, 23, 30)); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'still hidden on day 6 late evening');
    await page.clock.setSystemTime(new Date(2026, 11, 17, 0, 30)); await page.reload(); await page.waitForSelector('#wl-today');
    assert.ok(await page.$('#wl-backup'), 'reappears on day 7 early morning');
    await page.goto(base + '#settings');
    assert.ok(/It’s been a while/.test(await page.textContent('#view')));
    await Promise.all([page.waitForEvent('download'), page.click('#wl-export')]);
    const afterExport = await page.textContent('#view');
    assert.ok(!/It’s been a while/.test(afterExport) && /Last saved /.test(afterExport), 'Settings refreshes immediately after saving a backup');
    await at(20); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-backup'), null, 'saved 9 days ago: no nudge');
  });
  await t.step('cancelling backup restore confirm resets #wl-import so picking the same file again works', async () => {
    await page.goto(base + '#settings');
    const payload = JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': JSON.stringify({ theme: 'dark', textSize: 1.15 }) } });
    const file = { name: 'same-backup.json', mimeType: 'application/json', buffer: Buffer.from(payload) };
    let confirms = 0;
    const handler = async (dialog) => { confirms++; if (confirms === 1) await dialog.dismiss(); else await dialog.accept(); };
    page.on('dialog', handler);
    await page.setInputFiles('#wl-import', file);
    await page.waitForFunction(() => document.getElementById('wl-import').value === '');
    assert.notStrictEqual(await page.getAttribute('html', 'data-theme'), 'dark', 'cancelled first confirm');
    await page.setInputFiles('#wl-import', file);
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    page.off('dialog', handler);
    assert.strictEqual(confirms, 2, 'same file triggered onchange a second time');
  });
  await t.step('restoreText validates wl.shell.v1 (sanitizes bad theme/textSize, skips corrupt JSON, handles UTF-8 BOM)', async () => {
    const res = await page.evaluate(() => {
      const skipped1 = WL.restoreText('\uFEFF' + JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': JSON.stringify({ theme: 'purple', textSize: 99, nudged: '2026-02-30' }) } }));
      WL.applyLook();
      const sh1 = JSON.parse(localStorage.getItem('wl.shell.v1'));
      const skipped2 = WL.restoreText(JSON.stringify({ app: 'wellness', stores: { 'wl.shell.v1': '{not json', 'wl.pc.v1': '123' } }));
      WL.restoreText('\uFEFF' + JSON.stringify({ app: 'faith-companion', state: { done: { 1: '2026-11-20' }, journal: [], prayers: [], settings: { minutes: 5 } } }));
      const fcDone = JSON.parse(localStorage.getItem('fc.v1')).done;
      return { skipped1, sh1, skipped2, fcDone };
    });
    assert.deepStrictEqual(res.skipped1, []);
    assert.deepStrictEqual(res.sh1, { theme: 'auto', textSize: 1 });
    assert.deepStrictEqual(res.skipped2, ['Settings', 'PC link']);
    assert.deepStrictEqual(res.fcDone, { 1: '2026-11-20' }, 'legacy faith-companion backup with UTF-8 BOM restores cleanly');
  });
  await t.step('failed Android saveFile does not record lastBackup', async () => {
    const p2 = await page.context().newPage();
    await p2.addInitScript(() => { window.FCAndroid = { saveFile: () => '' }; });
    await p2.goto(base + '#settings');
    await p2.evaluate(() => {
      const sh = JSON.parse(localStorage.getItem('wl.shell.v1') || '{}');
      delete sh.lastBackup;
      localStorage.setItem('wl.shell.v1', JSON.stringify(sh));
    });
    await p2.reload();
    await p2.click('#wl-export');
    const sh = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.shell.v1') || '{}'));
    assert.strictEqual(sh.lastBackup, undefined, 'failed export must not set lastBackup');
    await p2.close();
  });
  await t.step('standalone #journal works from Home card (write, tabs, search, delete) and Faith subnav focuses on Prayers', async () => {
    await page.goto(base + '#home');
    await page.click('.home-card[data-module="journal"] a[href="#journal"]');
    await page.waitForSelector('#new-entry');
    await page.fill('#new-entry', 'General life note outside faith');
    await page.click('#add-entry');
    assert.ok((await page.textContent('#j-list')).includes('General life note outside faith'));
    await page.goto(base + '#journal/gratitude');
    await page.fill('#new-entry', 'Warm coffee this morning');
    await page.click('#add-entry');
    assert.ok((await page.textContent('#j-list')).includes('Warm coffee this morning'));
    assert.ok(!(await page.textContent('#j-list')).includes('General life note'));
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="journal"]')).includes('2 entries'));
    await page.goto(base + '#faith/prayers');
    await page.waitForSelector('#new-prayer');
    assert.strictEqual(await page.getAttribute('.subnav a[href="#faith/prayers"]', 'aria-current'), 'page');
  });
  await t.step('WL.darkScreen: one cover at a time (switching ids too), start and stop idempotent', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    const r = await page.evaluate(async () => {
      const D = window.WL.darkScreen, covers = () => document.querySelectorAll('.wl-dark').length;
      const out = {};
      D.start({ id: 'a-dark', after: 10 }); D.start({ id: 'a-dark', after: 10 });
      await new Promise((r) => setTimeout(r, 30));
      out.one = covers();
      D.start({ id: 'b-dark', after: 10 });
      out.switched = covers();
      await new Promise((r) => setTimeout(r, 30));
      out.afterSwitch = covers(); out.id = document.querySelector('.wl-dark') && document.querySelector('.wl-dark').id;
      D.stop(); D.stop();
      out.stopped = covers();
      await new Promise((r) => setTimeout(r, 30));
      out.staysOff = covers();
      return out;
    });
    await page.clock.runFor(100);
    assert.deepStrictEqual(r, { one: 1, switched: 0, afterSwitch: 1, id: 'b-dark', stopped: 0, staysOff: 0 }, JSON.stringify(r));
    // the wait can be a function, asked each time it arms (Faith: the line being said)
    const asked = await page.evaluate(async () => {
      let n = 0; window.WL.darkScreen.start({ id: 'f-dark', after: () => { n++; return 10; } });
      await new Promise((r) => setTimeout(r, 30)); const d1 = !!document.getElementById('f-dark');
      window.WL.darkScreen.light(); await new Promise((r) => setTimeout(r, 30));
      window.WL.darkScreen.stop(); return [d1, n];
    });
    assert.deepStrictEqual(asked, [true, 2], 'asked on start and again after a tap');
    // a screen reader: while dark the cover has focus and the page under it is out of reach; lit, all back
    const sr = await page.evaluate(async () => {
      window.WL.darkScreen.start({ id: 's-dark', after: 10 }); await new Promise((r) => setTimeout(r, 30));
      const v = document.getElementById('view'), d = document.getElementById('s-dark');
      const during = [document.activeElement === d, v.hasAttribute('inert'), v.getAttribute('aria-hidden')];
      window.WL.darkScreen.stop();
      return during.concat([v.hasAttribute('inert'), v.hasAttribute('aria-hidden')]);
    });
    assert.deepStrictEqual(sr, [true, true, 'true', false, false], JSON.stringify(sr));
    // Android's Back while dark only lights the screen
    const back = await page.evaluate(async () => {
      window.WL.darkScreen.start({ id: 'k-dark', after: 10 }); await new Promise((r) => setTimeout(r, 30));
      const a = window.FCBack(), lit = !document.getElementById('k-dark');
      window.WL.darkScreen.stop(); const b = window.FCBack();
      return [a, lit, b];
    });
    assert.deepStrictEqual(back, [true, true, false], 'Back: light (handled), then nothing to handle');
    // a route change ends it, even if a part forgot to
    await page.evaluate(() => window.WL.darkScreen.start({ id: 'x-dark', after: 10 }));
    await page.clock.runFor(50);
    assert.ok(await page.$('#x-dark'), 'dark');
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForSelector('#view');
    await page.clock.runFor(100);
    assert.strictEqual(await page.$('#x-dark'), null, 'gone after a route change, and not re-armed');
  });
  await t.step('Settings > Backup says how full the phone\'s space for the app is; a warning from 70%', async () => {
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-space');
    assert.ok(/Saved on this phone: about \d+% of the space/.test(await page.textContent('#wl-space')));
    assert.ok(!/getting full/.test(await page.textContent('#wl-space')));
    await page.evaluate(() => localStorage.setItem('wl.test.big', 'x'.repeat(3600000)));
    await page.goto(base + '#home'); await page.goto(base + '#settings'); await page.waitForSelector('#wl-space');
    const txt = await page.textContent('#wl-space');
    assert.ok(/about 7\d% /.test(txt) && /getting full/.test(txt), txt);
    const parts = await page.$$eval('#wl-space-parts li', (l) => l.map((x) => x.textContent));
    assert.ok(parts.length >= 2 && /^App: \d+%$/.test(parts[0]), 'largest first (the test store): ' + parts.join(' | '));
    await page.evaluate(() => localStorage.removeItem('wl.test.big'));
  });
  await t.step('blocked storage: Settings still opens, without the space line, and no errors', async () => {
    await page.goto(base + '#home');
    await page.evaluate(() => { window.__key = Storage.prototype.key; Storage.prototype.key = function () { throw new Error('blocked'); }; });
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-export');
    assert.strictEqual(await page.$('#wl-space'), null);
    await page.evaluate(() => { Storage.prototype.key = window.__key; });
  });
  await t.step('bells: the soft bell is one quiet tone, the bell three', async () => {
    const r = await page.evaluate(() => {
      const made = [];
      const fakeParam = () => { const p = { values: [], setValueAtTime(v) { p.values.push(v); }, exponentialRampToValueAtTime(v) { p.values.push(v); }, value: 0 }; return p; };
      const ctx = { currentTime: 0, destination: {}, state: 'running', resume() { return Promise.resolve(); },
        createOscillator() { const o = { frequency: {}, connect() {}, start() {}, stop(t) { o.stopAt = t; } }; made.push(o); return o; },
        createGain() { const g = { gain: fakeParam(), connect() {} }; made.push(g); return g; } };
      const orig = window.AudioContext; window.AudioContext = function () { return ctx; }; window.webkitAudioContext = window.AudioContext;
      // shell keeps one context: reach it through its own getter by resetting what it may have cached
      try { window.WL.__resetAudio && window.WL.__resetAudio(); } catch (e) {}
      window.WL.softBell(); const soft = made.splice(0);
      window.WL.bell(); const bell = made.splice(0);
      window.AudioContext = orig;
      const osc = (a) => a.filter((x) => x.frequency), gains = (a) => a.filter((x) => x.gain);
      return { softOsc: osc(soft).length, softPeak: Math.max(...gains(soft).map((g) => Math.max(...g.gain.values))), softStop: osc(soft)[0] && osc(soft)[0].stopAt, bellOsc: osc(bell).length };
    });
    if (r.softOsc === 0) { console.log('   (the shell reused an earlier audio context; checked by calm e2e-dark instead)'); return; }
    assert.strictEqual(r.softOsc, 1); assert.ok(r.softPeak <= 0.08, 'quiet: ' + r.softPeak); assert.ok(r.softStop <= 2.6, 'short: ' + r.softStop);
    assert.strictEqual(r.bellOsc, 3);
  });
  await t.step('keyboard with the dark cover up: focus stays on the cover; nav tabs and logday banner are inert; Enter lights it', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    await page.evaluate(() => window.WL.darkScreen.start({ id: 'tab-dark', after: 10 }));
    await page.clock.runFor(50);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    const under = await page.evaluate(() => {
      const ae = document.activeElement;
      const ids = ['view', 'tabs', 'logday'];
      return {
        inUnder: ids.some((id) => { const el = document.getElementById(id); return !!(ae && el && el.contains(ae)); }),
        inert: ids.map((id) => document.getElementById(id).hasAttribute('inert')),
        hidden: ids.map((id) => document.getElementById(id).getAttribute('aria-hidden'))
      };
    });
    assert.deepStrictEqual(under, { inUnder: false, inert: [true, true, true], hidden: ['true', 'true', 'true'] }, JSON.stringify(under));
    await page.focus('#tab-dark'); await page.keyboard.press('Enter');
    assert.strictEqual(await page.$('#tab-dark'), null, 'Enter lights it');
    const restored = await page.evaluate(() => ['view', 'tabs', 'logday'].map((id) => [document.getElementById(id).hasAttribute('inert'), document.getElementById(id).hasAttribute('aria-hidden')]));
    assert.deepStrictEqual(restored, [[false, false], [false, false], [false, false]], 'restored on uncover');
    await page.evaluate(() => window.WL.darkScreen.stop());
  });
  await t.step('WL.keepAwake in browser uses navigator.wakeLock, releases on false, re-requests on visibilitychange', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    const r = await page.evaluate(async () => {
      const log = { reqs: [], releases: 0 };
      let deferred = null;
      const origWL = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
      const makeSentinel = () => {
        const s = { released: false, release() { if (!s.released) { s.released = true; log.releases++; } return Promise.resolve(); } };
        return s;
      };
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request(kind) {
            log.reqs.push(kind);
            if (deferred) return new Promise((res) => { deferred = () => res(makeSentinel()); });
            return Promise.resolve(makeSentinel());
          }
        }
      });
      WL.keepAwake(true); await Promise.resolve();
      WL.keepAwake(true); await Promise.resolve(); // idempotent while already held
      const afterOn = [log.reqs.slice(), log.releases];
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      const afterVis = [log.reqs.slice(), log.releases];
      WL.keepAwake(false); await Promise.resolve();
      const afterOff = [log.reqs.slice(), log.releases];
      // visibilitychange after keepAwake(false) must not re-request
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      const afterOffVis = [log.reqs.slice(), log.releases];
      // async race: keepAwake(false) before request resolves releases the late sentinel
      deferred = true;
      WL.keepAwake(true);
      WL.keepAwake(false);
      deferred();
      await Promise.resolve(); await Promise.resolve();
      const afterRace = [log.reqs.slice(), log.releases];
      if (origWL) Object.defineProperty(navigator, 'wakeLock', origWL); else delete navigator.wakeLock;
      return { afterOn, afterVis, afterOff, afterOffVis, afterRace };
    });
    assert.deepStrictEqual(r.afterOn, [['screen'], 0], JSON.stringify(r));
    assert.deepStrictEqual(r.afterVis, [['screen', 'screen'], 0], JSON.stringify(r));
    assert.deepStrictEqual(r.afterOff, [['screen', 'screen'], 1], JSON.stringify(r));
    assert.deepStrictEqual(r.afterOffVis, [['screen', 'screen'], 1], JSON.stringify(r));
    assert.deepStrictEqual(r.afterRace, [['screen', 'screen', 'screen'], 2], JSON.stringify(r));
  });
  await t.step('everywhere "Note for autopilot" modal + quick Journal/Cook bar & backup round-trip', async () => {
    await page.goto(base + '#home');
    await page.waitForSelector('#wl-quick');
    assert.ok(await page.$('#wl-quick a[href="#journal"]') && await page.$('#wl-quick a[href="#cook"]') && await page.$('#wl-note-open'));
    await page.click('#wl-note-open');
    await page.waitForSelector('#wl-note-modal');
    await page.click('#wl-note-tags [data-ntag="Feature"]');
    await page.fill('#wl-note-in', 'Add a quick timer preset');
    await page.click('#wl-note-save');
    await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
    const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes);
    assert.strictEqual(notes.length, 1);
    assert.strictEqual(notes[0].tag, 'Feature');
    assert.strictEqual(notes[0].text, 'Add a quick timer preset');
    // Footer bar on another screen opens modal scoped to that screen; Escape closes it
    await page.goto(base + '#todo');
    await page.waitForSelector('#wl-bar-note');
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-modal');
    assert.ok((await page.textContent('#wl-note-sheet')).includes('#todo'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('wl-note-modal'));
    // Backup round-trip keeps wl.notes.v1
    const kept = await page.evaluate(() => {
      const txt = WL.backupText();
      localStorage.removeItem('wl.notes.v1');
      WL.restoreText(txt);
      return JSON.parse(localStorage.getItem('wl.notes.v1')).notes[0].text;
    });
    assert.strictEqual(kept, 'Add a quick timer preset');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('shell browser');
})().catch((e) => { console.error(e); process.exit(1); });
