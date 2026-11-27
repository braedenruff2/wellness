/* Accessibility of the newest bits (Move rest days, 2-a-week offer & area filter, Faith prayer search/undo, Calm recent
   sessions, Tagalog review recap, word search & build chips, Parenting search & worked tips, #me-sheet): tap targets
   at least 44 px at text size 1.0 and 1.3, nothing wider than the phone, AA text contrast in light and dark
   (night is dim on purpose: >= 3). */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 23, 10, 0) });
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__drive = {
      configured: true, name: 'wellness-sync.json', lastSync: Date.UTC(2026, 10, 22, 15, 0),
      error: 'Google Drive refused writes', answersConfigured: false, answersName: '',
      answersError: 'Could not read wellness-answers'
    };
    window.__pcPaired = false;
    window.__voice = {
      english: 'nice', tagalog: 'nice', kokoro: 'missing', tagalogVoice: 'missing', downloading: '',
      sid: 0, pcVoice: false, last: 'Phone voice', error: 'Could not reach your PC for the Filipino voice',
      speakers: [{ sid: 0, name: 'Nicole (soft, calm)' }, { sid: 1, name: 'Heart (warm)' }]
    };
    window.__update = {
      version: '0.1.20261124.1648', checked: Date.UTC(2026, 10, 23, 9, 0),
      allowed: false, ready: true, readyName: '0.1.20261125.0700', busy: false, error: 'GitHub timed out earlier'
    };
    window.FCAndroid = {
      pcStatus: () => JSON.stringify(window.__pcPaired ? { paired: true, host: '192.168.1.20', name: 'Home PC' } : { paired: false }),
      pcRequest: (id) => Promise.resolve().then(() => window.FCPcDone && window.FCPcDone(id, false, 'offline')),
      voiceStatus: () => JSON.stringify(window.__voice),
      voiceSet: () => {}, voiceDownload: () => {},
      updateStatus: () => JSON.stringify(window.__update),
      updateCheck: () => {}, updateAllow: () => {}, updateInstall: () => {},
      syncStatus: () => JSON.stringify({
        configured: window.__drive.configured, name: window.__drive.name, lastSync: window.__drive.lastSync,
        error: window.__drive.error, busy: false,
        answersConfigured: window.__drive.answersConfigured, answersName: window.__drive.answersName,
        answersError: window.__drive.answersError
      }),
      syncPick: () => {}, syncPickRestore: () => {}, syncPickAnswers: () => {},
      syncForgetAnswers: () => {}, syncForget: () => {},
      syncRead: (id) => Promise.resolve().then(() => window.FCSyncDone && window.FCSyncDone(id, true, '')),
      syncReadAnswers: (id) => Promise.resolve().then(() => window.FCSyncDone && window.FCSyncDone(id, false, window.__drive.answersError)),
      syncWrite: (id) => Promise.resolve().then(() => window.FCSyncDone && window.FCSyncDone(id, false, window.__drive.error))
    };
  });
  await page.goto(base + '#home');
  const look = (ts, theme) => page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts, since: '2026-10-01T12:00:00.000Z' })), [ts, theme]);
  const seed = () => page.evaluate(() => {
    localStorage.setItem('wl.workout.v1', JSON.stringify({
      equipment: 'fixed10', weights: {}, history: [], next: {},
      sessions: [{
        id: 's1', date: '2026-11-20', day: 'A', start: '2026-11-20T12:00:00.000Z', end: '2026-11-20T12:25:00.000Z',
        sets: [
          { i: 0, ex: 'Bulgarian Split Squats', n: 1, val: 12, w: 10, at: '2026-11-20T12:05:00.000Z' },
          { i: 1, ex: 'Pushups', n: 1, val: 10, w: null, at: '2026-11-20T12:10:00.000Z' }
        ]
      }],
      rest: { '2026-11-04': { why: 'Busy day', at: '2026-11-04T12:00:00.000Z' }, '2026-11-11': { why: 'Busy day', at: '2026-11-11T12:00:00.000Z' } }
    }));
    const words = [
      ['salamat', 'thank you', 1, 1], ['tubig', 'water', 1, 1], ['opo', 'yes (polite)', 3, 0],
      ['kumusta', 'how are you', 2, 0], ['mahal', 'love', 3, 0], ['bata', 'child', 2, 0],
      ['nanay', 'mother', 3, 0], ['tatay', 'father', 3, 0], ['kain', 'eat', 1, 0], ['tulog', 'sleep', 2, 0]
    ];
    const cards = {};
    words.forEach(([tl, en, box, wrong]) => {
      cards[tl] = { en, box, due: wrong ? '2026-11-17' : '2026-11-28', seen: 2, right: wrong ? 0 : 2, wrong, from: '2026-11-11/1' };
    });
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({
      packs: {}, done: {}, cards, answers: [], reviews: [],
      source: 'https://raw.githubusercontent.com/braedenruff2/wellness/main/modules/tagalog/packs/',
      lastCheck: '2026-11-23T08:00:00.000Z', settings: { slow: true }
    }));
    localStorage.setItem('wl.todo.v1', JSON.stringify({
      tasks: [
        { id: 't1', text: 'Call dentist', due: '2026-11-20', repeat: null, at: '09:00', done: null, created: '2026-11-18T12:00:00.000Z' },
        { id: 't2', text: 'Send forms', due: '2026-11-21', repeat: null, at: null, done: null, created: '2026-11-18T13:00:00.000Z' },
        { id: 't3', text: 'Order filters', due: '2026-11-22', repeat: null, at: null, done: null, created: '2026-11-18T14:00:00.000Z' },
        { id: 't4', text: 'Take bins out', due: '2026-11-23', repeat: 'weekly', at: '19:00', done: null, created: '2026-11-19T12:00:00.000Z' },
        { id: 't5', text: 'Buy diapers', due: '2026-11-22', repeat: null, at: null, done: '2026-11-22T14:00:00.000Z', created: '2026-11-21T12:00:00.000Z' }
      ]
    }));
    localStorage.setItem('fc.v1', JSON.stringify({
      done: { 1: '2026-11-23' },
      journal: [
        { id: 'j1', at: '2026-11-22T09:00:00.000Z', kind: 'journal', text: 'Quiet morning before everyone woke up.' },
        { id: 'j2', at: '2026-11-21T20:00:00.000Z', kind: 'awe', text: 'Clear stars over the bay on the evening walk.' },
        { id: 'j3', at: '2026-11-20T12:00:00.000Z', kind: 'gratitude', text: 'A warm mug of coffee and a long nap.' },
        { id: 'j4', at: '2026-11-19T18:00:00.000Z', kind: 'journal', text: 'Good talk with family after dinner.' },
        { id: 'j5', at: '2026-11-18T08:00:00.000Z', kind: 'gratitude', text: 'Friends dropping by with soup.' },
        { id: 'j6', at: '2026-11-17T15:00:00.000Z', kind: 'awe', text: 'Her first real belly laugh.' }
      ],
      sessions: [],
      prayers: [
        { id: 'p1', at: '2026-11-18T10:00:00.000Z', text: 'Patience on hard mornings', answered: null },
        { id: 'p2', at: '2026-11-17T10:00:00.000Z', text: 'Safe drive home', answered: '2026-11-20T10:00:00.000Z', note: 'Arrived safely' },
        { id: 'p3', at: '2026-11-16T10:00:00.000Z', text: 'Good sleep tonight', answered: null },
        { id: 'p4', at: '2026-11-15T10:00:00.000Z', text: 'Strength for the week', answered: null },
        { id: 'p5', at: '2026-11-14T10:00:00.000Z', text: 'Peace at dinner', answered: null },
        { id: 'p6', at: '2026-11-13T10:00:00.000Z', text: 'Gratitude for friends', answered: null }
      ],
      settings: { minutes: 5, bell: true, voice: true, rate: 0.9, daily: false }
    }));
    localStorage.setItem('wl.calm.v1', JSON.stringify({
      sessions: [
        { id: 'reset', date: '2026-11-22', mins: 1, before: 4, after: 2, at: '2026-11-22T20:00:00.000Z' },
        { id: 'slow', date: '2026-11-21', mins: 5, before: 3, after: 2, at: '2026-11-21T20:00:00.000Z' }
      ],
      settings: { minutes: 5, voice: true, tick: false }
    }));
    const hist = Array.from({ length: 21 }, (_, i) => ({
      id: 'h' + i, at: new Date(Date.UTC(2026, 10, 12, 12 + i * 11, 0)).toISOString(), skill: 'Staying calm', age: '15 months',
      title: 'Moment ' + (i + 1), scenario: 'Scenario ' + (i + 1), answer: 'My answer',
      result: { score: 8, verdict: 'Steady', good: ['Calm'], improve: [], better: '', why: '', practice: i === 20 ? 'Pause and name the feeling' : '', sources: [] }
    }));
    localStorage.setItem('wl.coach.v1', JSON.stringify({
      child: { name: 'Baby', birth: '2025-08-01', can: [] }, current: null, history: hist, pending: null, realDraft: ''
    }));
    localStorage.setItem('wl.me.v1', JSON.stringify({
      checkins: {
        '2026-11-19': { at: '2026-11-19T12:00:00.000Z', sleep: '7 h+', wakes: '0', energy: 'Good', mood: 'Good', day: 'Good' },
        '2026-11-20': { at: '2026-11-20T12:00:00.000Z', sleep: '5–6 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'Mixed' },
        '2026-11-21': { at: '2026-11-21T12:00:00.000Z', sleep: '6–7 h', wakes: '1', energy: 'Good', mood: 'Good', day: 'Good' },
        '2026-11-22': { at: '2026-11-22T12:00:00.000Z', sleep: '4–5 h', wakes: '3+', energy: 'Low', mood: 'OK', day: 'Hard', note: 'Teething night' }
      },
      skipped: {},
      plan: { at: '2026-11-22T12:00:00.000Z', headline: 'Steady week', parts: { home: { focus: 'Protect one nap-time rest', why: 'short sleep' } }, check: 'How did your energy feel?' },
      feedback: [
        { id: 'f1', at: '2026-11-22T12:00:00.000Z', date: '2026-11-22', part: 'coach', kind: 'after', about: 'tip:h20', a: { tried: 'It worked' } },
        { id: 'calm/after/slow@a', at: new Date(2026, 10, 21, 14, 0).toISOString(), date: '2026-11-21', part: 'calm', kind: 'after', about: 'slow@a', a: { helped: 'A bit' } },
        { id: 'calm/after/slow@b', at: new Date(2026, 10, 21, 15, 0).toISOString(), date: '2026-11-21', part: 'calm', kind: 'after', about: 'slow@b', a: { helped: 'Not really' } },
        { id: 'calm/after/sleep@r', at: new Date(2026, 10, 22, 22, 20).toISOString(), date: '2026-11-22', part: 'calm', kind: 'after', about: 'sleep@r', a: { helped: 'Not really', block: ['Mind racing'] } }
      ]
    }));
    localStorage.setItem('wl.sync.v1', JSON.stringify({
      requests: [{ id: 'q1', task: 'advice', input: { question: 'How to pace workouts this week?' }, at: '2026-11-23T12:00:00.000Z' }],
      answers: {}, acked: []
    }));
    localStorage.setItem('wl.pc.v1', JSON.stringify({
      sent: {}, lastSync: '2026-11-22T18:00:00.000Z', lastSent: 4,
      lastError: 'PC did not answer', lastErrorAt: '2026-11-23T09:00:00.000Z',
      journalText: false, cloud: { q1: { task: 'advice', at: '2026-11-23T12:00:00.000Z' } }
    }));
    if (window.WL && WL.modules) Object.keys(WL.modules).forEach((k) => { if (WL.modules[k].reload) WL.modules[k].reload(); });
  });
  const small = async (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || e.placeholder || e.id || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
  const contrast = (root = '#view') => page.evaluate((rootSel) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
    const sels = ['p', '.meta', '.no', '.ok', 'b', 'a', 'button', 'summary', '.wk4-rest', '.trow .tl', 'input[type="search"]', 'input[type="text"]', 'input[type="date"]', 'input[type="time"]', 'textarea', 'select', 'label'].map((s) => rootSel + ' ' + s).join(', ');
    return Array.from(document.querySelectorAll(sels)).filter((e) => {
      if (e.offsetParent === null) return false;
      if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT') return true;
      return !!e.textContent.trim();
    }).map((e) => {
      const cs = getComputedStyle(e);
      const a = lum(rgb(cs.color)), b = lum(bg(e));
      return { t: (e.textContent || e.id || e.placeholder || '').trim().slice(0, 25), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
    });
  }, root);
  // SVG chart labels: their colour is `fill`, against the card behind the chart
  const svgContrast = (sel) => page.evaluate((s) => {
    const rgb = (x) => (x.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
    return Array.from(document.querySelectorAll(s)).filter((e) => e.textContent.trim()).map((e) => {
      const a = lum(rgb(getComputedStyle(e).fill)), b = lum(bg(e.closest('svg').parentElement));
      return { t: e.textContent.trim().slice(0, 20), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
    });
  }, sel);
  async function openBuildExercise() {
    await page.goto(base + '#tagalog/l/2026-11-18/1'); await page.reload(); await page.waitForSelector('#tl-ex');
    for (let step = 0; step < 8; step++) {
      if (await page.locator('#tl-built').count()) break;
      if (await page.locator('#tl-ex .opt').count()) await page.click('#tl-ex .opt');
      else if (await page.locator('#tl-in').count()) { await page.fill('#tl-in', 'opo'); await page.click('#tl-check'); }
      await page.click('#tl-next');
    }
    await page.waitForSelector('#tl-built');
    await page.locator('#tl-ex .word').first().click();
    await page.waitForSelector('#tl-built .built-w');
  }
  for (const ts of [1, 1.3]) {
    await t.step('text size ' + ts + ': Move sore card, rest chips, 2-a-week offer, rest card Undo', async () => {
      await look(ts, 'light'); await seed(); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-two'); await page.waitForSelector('#wo-sore');
      assert.deepStrictEqual(await small('#wo-sore button, #wo-two button'), []);
      await page.click('#wo-rest summary');
      assert.deepStrictEqual(await small('[data-rest]'), []);
      const sh = await page.$eval('#wo-rest summary', (e) => Math.round(e.getBoundingClientRect().height));
      assert.ok(sh >= 44, 'the "Not training today?" opener is easy to tap: ' + sh);
      await page.click('[data-rest="Tired"]');
      assert.deepStrictEqual(await small('#wo-rest button'), []);
      await t.noOverflow(['#workout']);
    });
    await t.step('text size ' + ts + ': Move Progress #wo-4w, #wo-areas & Setup checkboxes', async () => {
      await page.goto(base + '#workout/history'); await page.waitForSelector('#wo-areas'); await page.waitForSelector('#wo-4w'); await page.waitForSelector('#wo-chart-card');
      assert.deepStrictEqual(await small('#wo-areas button, #wo-chart-ex, #wo-chart-card button, #wo-chart-card a, .wo-ex button'), []);
      await t.noOverflow(['#workout/history']);
      await page.goto(base + '#workout/settings'); await page.waitForSelector('[data-hard]'); await page.waitForSelector('#wo-age');
      assert.deepStrictEqual(await small('#wo-age, #wo-age-save, label.row'), []);
      assert.deepStrictEqual(await small('[data-eq], [data-target], label[for="wo-csv"]'), []);
      const hardSideBySide = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hard]')).every((cb) => {
        const sp = cb.nextElementSibling;
        return !!(sp && sp.getBoundingClientRect().left > cb.getBoundingClientRect().left);
      }));
      assert.ok(hardSideBySide, '#workout/settings [data-hard] checkboxes sit beside their label text');
      await t.noOverflow(['#workout/settings']);
    });
    await t.step('text size ' + ts + ': Faith journal tabs/#j-search/.del, #p-search/.p-undo & #faith/settings', async () => {
      await page.goto(base + '#faith/journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual(await small('.tabs2 button, #add-entry, #j-search, #j-list .del'), []);
      await t.noOverflow(['#faith/journal']);
      await page.goto(base + '#journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual(await small('.tabs2 button, #add-entry, #j-search, #j-list .del, #j-export-text, a[href="#faith/prayers"]'), []);
      await t.noOverflow(['#journal']);
      await page.goto(base + '#faith/prayers'); await page.waitForSelector('#p-search');
      assert.deepStrictEqual(await small('#p-search, .p-undo, .answered, .pdel'), []);
      await t.noOverflow(['#faith/journal/prayers']);
      await page.goto(base + '#faith/settings'); await page.waitForSelector('#fc-export-text');
      assert.deepStrictEqual(await small('[data-set], #test-voice, #fc-export-text, a[href="#settings"]'), []);
      await t.noOverflow(['#faith/settings']);
      await page.goto(base + '#faith/day/2'); await page.waitForSelector('a[href="#faith/path"]');
      assert.deepStrictEqual(await small('a[href="#faith/path"]'), []);
      await t.noOverflow(['#faith/day/2']);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#faith/today'); await page.waitForSelector('.done-banner a'); await page.waitForSelector('#fc-ahead');
      assert.deepStrictEqual(await small('.done-banner a'), []);
      await t.noOverflow(['#faith/today']);
      await page.goto(base + '#faith/day/2'); await page.waitForSelector('#fc-short-wrap'); await page.waitForSelector('#fc-short');
      assert.deepStrictEqual(await small('#fc-short-wrap a, #fc-short-wrap button, #pray-card a, #pray-card summary, a[href="#faith/path"]'), []);
      await t.noOverflow(['#faith/day/2']);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      // Post-day-120 completion screen: Pray now, Read the path, and Walk the path again
      const savedFc = await page.evaluate(() => localStorage.getItem('fc.v1'));
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('fc.v1'));
        s.done = {}; for (let k = 1; k <= 120; k++) s.done[k] = '2026-11-22';
        localStorage.setItem('fc.v1', JSON.stringify(s));
        if (window.WL && WL.modules.faith) WL.modules.faith.reload();
      });
      await page.goto(base + '#faith/today'); await page.waitForSelector('#fc-post-links'); await page.waitForSelector('#walk-again');
      assert.deepStrictEqual(await small('#fc-post-links a, #walk-again'), []);
      await t.noOverflow(['#faith/today']);
      await page.evaluate((raw) => { localStorage.setItem('fc.v1', raw); if (window.WL && WL.modules.faith) WL.modules.faith.reload(); }, savedFc);
    });
    await t.step('text size ' + ts + ': Calm #c-recent, #c-racing, #me-sheet, and session start/after chips', async () => {
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#calm'); await page.waitForSelector('#c-recent'); await page.waitForSelector('#c-racing'); await page.waitForSelector('#c-goal');
      assert.deepStrictEqual(await small('#c-goal button, #c-recent summary, #c-racing a, a[href="#faith/pray"]'), []);
      await page.click('#c-recent summary');
      await page.click('[data-me-fit]');
      await page.waitForSelector('#me-sheet');
      assert.deepStrictEqual(await small('#me-sheet button, #me-note'), []);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, '#calm with #c-recent, #c-racing and #me-sheet overflow ' + overflow + 'px');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      await page.goto(base + '#calm/s/slow'); await page.waitForSelector('#c-len'); await page.waitForSelector('#c-before');
      assert.deepStrictEqual(await small('#c-len button, #c-before button, #c-pp, #c-end'), []);
      const startOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(startOverflow <= 2, '#calm/s/slow start overflow ' + startOverflow + 'px');
      await page.click('#c-len [data-len="10"]');
      await page.click('#c-before [data-r="4"]');
      await page.click('#c-pp');
      await page.clock.fastForward(10 * 60000 + 2000); await page.clock.runFor(1000);
      await page.waitForSelector('#c-after:not([hidden])');
      assert.deepStrictEqual(await small('#c-after button'), []);
      const afterOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(afterOverflow <= 2, '#calm/s/slow after overflow ' + afterOverflow + 'px');
      await page.click('#c-save');
      await page.waitForSelector('#c-today a.link');
      assert.deepStrictEqual(await small('#c-today a.link, a[href="#faith/pray"]'), []);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
    });
    await t.step('text size ' + ts + ': Tagalog #tl-voice-nudge, review recap, #tl-word-search, and #tl-built .built-w', async () => {
      await page.goto(base + '#tagalog'); await page.waitForSelector('#tl-voice-nudge');
      assert.deepStrictEqual(await small('#tl-voice-nudge a'), []);
      await t.noOverflow(['#tagalog']);
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('#tl-word-search');
      assert.deepStrictEqual(await small('#tl-word-search, #tl-hard button, #tl-all button, #tl-practise-hard'), []);
      await t.noOverflow(['#tagalog/words']);
      await openBuildExercise();
      assert.deepStrictEqual(await small('#tl-built .built-w, #tl-ex .word, #tl-clear, #tl-check'), []);
      const buildOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(buildOverflow <= 2, 'Tagalog build overflow ' + buildOverflow + 'px');
      await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
      for (let n = 0; n < 2; n++) { await page.click('#tl-show'); await page.clock.runFor(450); await page.click('#tl-no'); }
      await page.waitForSelector('#tl-missed');
      assert.deepStrictEqual(await small('#tl-missed button'), []);
      await t.noOverflow(['#tagalog/review']);
      await page.goto(base + '#tagalog/settings'); await page.waitForSelector('#tl-src'); await page.waitForSelector('#tl-slow');
      assert.deepStrictEqual(await small('#tl-src, #tl-save-src, #tl-fetch, #tl-send, #tl-slow'), []);
      await t.noOverflow(['#tagalog/settings']);
    });
    await t.step('text size ' + ts + ': To-do #td-new, #td-move, #td-showdone & #td-sheet controls', async () => {
      await page.goto(base + '#todo'); await page.waitForSelector('#td-new'); await page.waitForSelector('#td-move'); await page.waitForSelector('#td-showdone');
      assert.deepStrictEqual(await small('#td-new, #td-form button, #td-move, #td-showdone, [data-tick], [data-more]'), []);
      await page.click('[data-more="t1"]'); await page.waitForSelector('#td-sheet');
      assert.deepStrictEqual(await small('#td-sheet input, #td-sheet button'), []);
      const tdOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(tdOverflow <= 2, '#todo with #td-sheet overflow ' + tdOverflow + 'px');
      await page.click('#td-cancel');
      await t.noOverflow(['#todo']);
    });
    await t.step('text size ' + ts + ': Parenting #co-can-nudge, #co-cloud, #co-teach, #co-hist-search, #co-hist-more, #co-worked, #coach/setup & #coach/h/:id Back', async () => {
      await page.goto(base + '#coach'); await page.waitForSelector('#co-can-nudge'); await page.waitForSelector('#co-cloud'); await page.waitForSelector('#co-teach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked'); await page.waitForSelector('#co-hist-more');
      assert.deepStrictEqual(await small('#co-can-nudge a, #co-cloud a, a[href="#coach/setup"], #co-teach button, #co-teach summary, #co-hist-search, #co-hist-more'), []);
      await t.noOverflow(['#coach']);
      await page.goto(base + '#coach/setup'); await page.waitForSelector('#co-name'); await page.waitForSelector('#co-birth'); await page.waitForSelector('#co-can'); await page.waitForSelector('#co-can-note'); await page.waitForSelector('#co-save');
      assert.deepStrictEqual(await small('#co-name, #co-birth, #co-can button, #co-can-note, #co-save, a[href="#coach"]'), []);
      await t.noOverflow(['#coach/setup']);
      await page.goto(base + '#coach/h/h20'); await page.waitForSelector('a[href="#coach"]');
      assert.deepStrictEqual(await small('a[href="#coach"]'), []);
      await t.noOverflow(['#coach/h/h20']);
    });
    await t.step('text size ' + ts + ': #me check-in, weekly plan, failed-plan retry & 14-day trend bars', async () => {
      await page.goto(base + '#me'); await page.waitForSelector('#me-ck'); await page.waitForSelector('#me-plan'); await page.waitForSelector('#me-trend');
      assert.deepStrictEqual(await small('#me-ck button, #me-ck-note, #me-plan'), []);
      await t.noOverflow(['#me']);
      // Weekly-plan failed retry state on #me
      await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('wl.me.v1'));
        m.plan = null; m.planTried = '2026-11-23';
        localStorage.setItem('wl.me.v1', JSON.stringify(m));
        WL.modules.me.reload();
      });
      await page.goto(base + '#home'); await page.goto(base + '#me');
      await page.waitForSelector('#me-plan-failed'); await page.waitForSelector('#me-plan');
      assert.deepStrictEqual(await small('#me-ck button, #me-ck-note, #me-plan'), []);
      await t.noOverflow(['#me']);
      await seed();
    });
    await t.step('text size ' + ts + ': Settings Voice, App updates, Drive sync errors, Home #wl-sync-nudge & Link unpaired #lk-advice-card', async () => {
      await page.evaluate(() => { window.__update.allowed = false; window.__update.ready = true; });
      await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err'); await page.waitForSelector('#wl-sync-ans-err');
      await page.waitForSelector('#wl-voice'); await page.waitForSelector('#wl-update');
      assert.deepStrictEqual(await small('#wl-sync button, #wl-voice button, #wl-sid, #wl-voice label.row, #wl-update button, #view > p a.link'), []);
      const pcvSideBySide = await page.evaluate(() => {
        const cb = document.getElementById('wl-pcv'), sp = cb && cb.nextElementSibling;
        return !!(cb && sp && sp.getBoundingClientRect().left > cb.getBoundingClientRect().left);
      });
      assert.ok(pcvSideBySide, '#wl-pcv checkbox sits beside its label text without wrapping onto a separate line');
      await t.noOverflow(['#settings']);
      await page.evaluate(() => { window.__update.allowed = true; window.FCUpdateState && window.FCUpdateState(); });
      await page.waitForSelector('#wl-install');
      assert.deepStrictEqual(await small('#wl-update button'), []);
      await t.noOverflow(['#settings']);
      await page.evaluate(() => { window.__update.allowed = false; });
      await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-nudge');
      assert.deepStrictEqual(await small('#wl-sync-nudge a, #wl-sync-nudge button'), []);
      await t.noOverflow(['#home']);
      // Also check #wl-sync-nudge with 0 waiting requests (includes the "Not now" link button)
      await page.evaluate(() => { WL.driveSync.cancelRequest('q1'); });
      await page.goto(base + '#settings'); await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-later');
      assert.deepStrictEqual(await small('#wl-sync-nudge a, #wl-sync-nudge button'), []);
      await t.noOverflow(['#home']);
      // Also check #wl-backup nudge on Home (Drive sync stopped 20 days ago, answers sheet configured)
      await page.evaluate(() => {
        window.__drive.answersConfigured = true;
        window.__drive.lastSync = Date.UTC(2026, 10, 1, 12, 0);
      });
      await page.goto(base + '#settings'); await page.goto(base + '#home'); await page.waitForSelector('#wl-backup');
      assert.deepStrictEqual(await small('#wl-backup a'), []);
      await t.noOverflow(['#home']);
      await page.evaluate(() => { window.__drive.answersConfigured = false; window.__drive.lastSync = Date.UTC(2026, 10, 22, 15, 0); });
      // Restore queued request and check unpaired Drive-sync #lk-advice-card on #link
      await page.evaluate(() => { window.__pcPaired = false; WL.driveSync.enqueue('advice', { question: 'How to pace workouts this week?' }, 'q1'); });
      await page.goto(base + '#link'); await page.waitForSelector('#lk-advice-card'); await page.waitForSelector('#lk-queued');
      assert.deepStrictEqual(await small('#lk-advice-card button, #lk-advice-card textarea'), []);
      await t.noOverflow(['#link']);
      // Paired #link controls: #lk-sync, #lk-test, #lk-more, #lk-forget
      await page.evaluate(() => { window.__pcPaired = true; });
      await page.goto(base + '#home'); await page.goto(base + '#link');
      await page.waitForSelector('#lk-sync'); await page.waitForSelector('#lk-test'); await page.waitForSelector('#lk-more'); await page.waitForSelector('#lk-forget');
      assert.deepStrictEqual(await small('#lk-sync, #lk-test, #lk-more, #lk-forget, #lk-advice-card button, label.row'), []);
      const jtSideBySide = await page.evaluate(() => {
        const cb = document.getElementById('lk-jt'), sp = cb && cb.nextElementSibling;
        return !!(cb && sp && sp.getBoundingClientRect().left > cb.getBoundingClientRect().left);
      });
      assert.ok(jtSideBySide, '#lk-jt checkbox sits beside its label text without wrapping');
      await t.noOverflow(['#link']);
      await page.evaluate(() => { window.__pcPaired = false; });
    });
  }
  for (const theme of ['light', 'dark', 'night']) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step(theme + ': text contrast on Move, Progress, Faith prayers, Calm/#me-sheet, Tagalog words/build, Parenting, Settings/Home/Link sync states', async () => {
      await look(1, theme); await seed(); await page.goto(base + '#workout'); await page.reload(); await page.waitForSelector('#wo-two'); await page.waitForSelector('#wo-sore');
      await page.click('#wo-rest summary');
      assert.deepStrictEqual((await contrast('#wo-sore')).filter((x) => x.r < min), [], theme + ' #wo-sore');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #workout');
      await page.goto(base + '#workout/history'); await page.waitForSelector('#wo-areas'); await page.waitForSelector('#wo-4w');
      assert.deepStrictEqual((await contrast('#wo-4w')).filter((x) => x.r < min), [], theme + ' #wo-4w');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #workout/history');
      for (const sel of ['#wo-weekly-chart text', '#wo-ex-svg text']) {
        const lbl = await svgContrast(sel);
        if (sel.startsWith('#wo-weekly')) assert.ok(lbl.length >= 8, 'weekly chart has its labels: ' + lbl.length);
        assert.deepStrictEqual(lbl.filter((x) => x.r < min), [], theme + ' ' + sel);
      }
      assert.deepStrictEqual((await contrast('#wo-chart-card')).filter((x) => x.r < min), [], theme + ' #wo-chart-card (incl. #wo-bench-note)');
      await page.goto(base + '#workout/settings'); await page.waitForSelector('[data-hard]');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #workout/settings');
      await page.goto(base + '#faith/journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/journal');
      await page.goto(base + '#journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #journal');
      await page.goto(base + '#faith/prayers'); await page.waitForSelector('#p-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/prayers');
      await page.goto(base + '#faith/settings'); await page.waitForSelector('#fc-export-text');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/settings');
      await page.goto(base + '#faith/day/2'); await page.waitForSelector('a[href="#faith/path"]');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/day/2');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#faith/today'); await page.waitForSelector('.done-banner');
      assert.deepStrictEqual((await contrast('.done-banner')).filter((x) => x.r < min), [], theme + ' .done-banner');
      await page.goto(base + '#faith/day/2'); await page.waitForSelector('#fc-short-wrap');
      assert.deepStrictEqual((await contrast('#fc-short-wrap')).filter((x) => x.r < min), [], theme + ' #fc-short-wrap');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      const savedFc = await page.evaluate(() => localStorage.getItem('fc.v1'));
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('fc.v1'));
        s.done = {}; for (let k = 1; k <= 120; k++) s.done[k] = '2026-11-22';
        localStorage.setItem('fc.v1', JSON.stringify(s));
        if (window.WL && WL.modules.faith) WL.modules.faith.reload();
      });
      await page.goto(base + '#faith/today'); await page.waitForSelector('#fc-post-links');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' post-day-120 #faith/today');
      await page.evaluate((raw) => { localStorage.setItem('fc.v1', raw); if (window.WL && WL.modules.faith) WL.modules.faith.reload(); }, savedFc);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#calm'); await page.waitForSelector('#c-recent'); await page.waitForSelector('#c-racing');
      await page.click('#c-recent summary');
      await page.click('[data-me-fit]'); await page.waitForSelector('#me-sheet');
      assert.deepStrictEqual((await contrast('#c-recent')).filter((x) => x.r < min), [], theme + ' #c-recent');
      assert.deepStrictEqual((await contrast('#c-racing')).filter((x) => x.r < min), [], theme + ' #c-racing');
      assert.ok((await page.textContent('.c-helped')).includes('Helped 1 of 2 times'));
      assert.deepStrictEqual((await contrast('.c-helped')).filter((x) => x.r < min), [], theme + ' .c-helped');
      assert.deepStrictEqual((await contrast('#me-sheet')).filter((x) => x.r < min), [], theme + ' #me-sheet');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      await page.goto(base + '#calm/s/slow'); await page.waitForSelector('#c-len'); await page.waitForSelector('#c-before');
      assert.deepStrictEqual((await contrast('#c-len')).filter((x) => x.r < min), [], theme + ' #c-len');
      assert.deepStrictEqual((await contrast('#c-before')).filter((x) => x.r < min), [], theme + ' #c-before');
      await page.click('#c-len [data-len="3"]');
      await page.click('#c-pp');
      await page.clock.fastForward(3 * 60000 + 2000); await page.clock.runFor(1000);
      await page.waitForSelector('#c-after:not([hidden])');
      assert.deepStrictEqual((await contrast('#c-after')).filter((x) => x.r < min), [], theme + ' #c-after');
      await page.click('#c-save');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      await page.goto(base + '#tagalog'); await page.waitForSelector('#tl-voice-nudge');
      assert.deepStrictEqual((await contrast('#tl-voice-nudge')).filter((x) => x.r < min), [], theme + ' #tl-voice-nudge');
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('#tl-word-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #tagalog/words');
      await page.goto(base + '#tagalog/settings'); await page.waitForSelector('#tl-src'); await page.waitForSelector('#tl-slow');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #tagalog/settings');
      await openBuildExercise();
      assert.deepStrictEqual((await contrast('#tl-ex')).filter((x) => x.r < min), [], theme + ' #tl-built');
      await page.goto(base + '#todo'); await page.waitForSelector('#td-new'); await page.waitForSelector('#td-move'); await page.waitForSelector('#td-showdone');
      await page.click('[data-more="t1"]'); await page.waitForSelector('#td-sheet');
      assert.deepStrictEqual((await contrast('#td-sheet')).filter((x) => x.r < min), [], theme + ' #td-sheet');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #todo');
      await page.goto(base + '#coach'); await page.waitForSelector('#co-can-nudge'); await page.waitForSelector('#co-cloud'); await page.waitForSelector('#co-teach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked');
      assert.deepStrictEqual((await contrast('#co-can-nudge')).filter((x) => x.r < min), [], theme + ' #co-can-nudge');
      assert.deepStrictEqual((await contrast('#co-cloud')).filter((x) => x.r < min), [], theme + ' #co-cloud');
      assert.deepStrictEqual((await contrast('#co-teach')).filter((x) => x.r < min), [], theme + ' #co-teach');
      assert.deepStrictEqual((await contrast('#co-worked')).filter((x) => x.r < min), [], theme + ' #co-worked');
      assert.deepStrictEqual((await contrast('#co-hist')).filter((x) => x.r < min), [], theme + ' #co-hist');
      await page.goto(base + '#coach/setup'); await page.waitForSelector('#co-name'); await page.waitForSelector('#co-birth'); await page.waitForSelector('#co-can');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #coach/setup');
      await page.goto(base + '#coach/h/h20'); await page.waitForSelector('a[href="#coach"]');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #coach/h/h20');
      await page.goto(base + '#me'); await page.waitForSelector('#me-ck'); await page.waitForSelector('#me-plan'); await page.waitForSelector('#me-trend'); await page.waitForSelector('#me-trend-wakes');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #me');
      const wakeBarsOk = await page.evaluate((minRatio) => {
        const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
        const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const card = document.getElementById('me-trend');
        const bgLum = lum(rgb(getComputedStyle(card).backgroundColor));
        const bars = Array.from(document.querySelectorAll('#me-trend-wakes .tb:not(.none)'));
        return bars.length > 0 && bars.every((b) => {
          const bl = lum(rgb(getComputedStyle(b).backgroundColor));
          return (Math.max(bl, bgLum) + 0.05) / (Math.min(bl, bgLum) + 0.05) >= minRatio;
        });
      }, min);
      assert.ok(wakeBarsOk, theme + ' #me-trend-wakes bars contrast >= ' + min);
      await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('wl.me.v1'));
        m.plan = null; m.planTried = '2026-11-23';
        localStorage.setItem('wl.me.v1', JSON.stringify(m));
        WL.modules.me.reload();
      });
      await page.goto(base + '#home'); await page.goto(base + '#me');
      await page.waitForSelector('#me-plan-failed');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #me failed plan');
      await seed();
      await page.evaluate(() => { window.__update.allowed = false; window.__update.ready = true; });
      await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err'); await page.waitForSelector('#wl-sync-ans-err');
      await page.waitForSelector('#wl-voice'); await page.waitForSelector('#wl-update');
      assert.deepStrictEqual((await contrast('#wl-voice')).filter((x) => x.r < min), [], theme + ' #wl-voice');
      assert.deepStrictEqual((await contrast('#wl-update')).filter((x) => x.r < min), [], theme + ' #wl-update (allow)');
      await page.evaluate(() => { window.__update.allowed = true; window.FCUpdateState && window.FCUpdateState(); });
      await page.waitForSelector('#wl-install');
      assert.deepStrictEqual((await contrast('#wl-update')).filter((x) => x.r < min), [], theme + ' #wl-update (install)');
      await page.evaluate(() => { window.__update.allowed = false; });
      assert.deepStrictEqual((await contrast('#wl-sync')).filter((x) => x.r < min), [], theme + ' #wl-sync');
      await page.evaluate(() => { window.__drive.configured = false; });
      await page.goto(base + '#home'); await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err');
      assert.deepStrictEqual((await contrast('#wl-sync')).filter((x) => x.r < min), [], theme + ' #wl-sync unconfigured');
      await page.evaluate(() => { window.__drive.configured = true; });
      await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-nudge');
      assert.deepStrictEqual((await contrast('#wl-sync-nudge')).filter((x) => x.r < min), [], theme + ' #wl-sync-nudge');
      await page.evaluate(() => {
        window.__drive.answersConfigured = true;
        window.__drive.lastSync = Date.UTC(2026, 10, 1, 12, 0);
      });
      await page.goto(base + '#settings'); await page.goto(base + '#home'); await page.waitForSelector('#wl-backup');
      assert.deepStrictEqual((await contrast('#wl-backup')).filter((x) => x.r < min), [], theme + ' #wl-backup');
      await page.evaluate(() => { window.__drive.answersConfigured = false; window.__drive.lastSync = Date.UTC(2026, 10, 22, 15, 0); });
      await page.evaluate(() => { window.__pcPaired = false; });
      await page.goto(base + '#link'); await page.waitForSelector('#lk-advice-card'); await page.waitForSelector('#lk-queued');
      assert.deepStrictEqual((await contrast('#lk-advice-card')).filter((x) => x.r < min), [], theme + ' #lk-advice-card');
      await page.evaluate(() => { window.__pcPaired = true; });
      await page.goto(base + '#home'); await page.goto(base + '#link');
      await page.waitForSelector('#lk-sync'); await page.waitForSelector('#lk-test'); await page.waitForSelector('#lk-more'); await page.waitForSelector('#lk-forget');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' paired #link');
      await page.evaluate(() => { window.__pcPaired = false; });
    });
  }
  // 25 Nov UI: Tagalog hints (#tl-linker, #tl-alt), review example, Your words scores + Practise these, slow line, Calm #c-flat / .c-helped
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('25 Nov UI at ' + ts + 'x ' + theme + ': targets, overflow, contrast', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.goto(base + '#tagalog/l/2026-11-25/1'); await page.reload(); await page.waitForSelector('#tl-ex');
      assert.deepStrictEqual(await small('.dlg [data-say-slow], .dlg [data-say]'), []);
      await t.noOverflow(['#tagalog/l/2026-11-25/1']);
      await page.click('#tl-ex .opt'); await page.click('#tl-next');
      await page.click('#tl-check'); await page.click('#tl-next');
      await page.fill('#tl-in', 'gusto ko mag-aral ng Tagalog'); await page.click('#tl-check'); await page.waitForSelector('#tl-linker');
      assert.deepStrictEqual(await bad('#tl-fb'), [], theme + ' #tl-linker');
      const o1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o1 <= 2, '#tl-linker overflow ' + o1);
      for (let k = 0; k < 12 && !(await page.$('#tl-watch')); k++) {
        if (await page.$('#tl-next')) { await page.click('#tl-next'); continue; }
        if (await page.$('#tl-ex .opt:not(.word)')) await page.click('#tl-ex .opt:not(.word)');
        else if (await page.$('#tl-in')) { await page.fill('#tl-in', 'x'); await page.click('#tl-check'); }
        else await page.click('#tl-check');
      }
      assert.deepStrictEqual(await small('#tl-watch [data-say], #tl-again, #tl-ex a.btn'), []);
      assert.deepStrictEqual(await bad('#tl-watch'), [], theme + ' #tl-watch');
      const o2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o2 <= 2, '#tl-watch overflow ' + o2);
      await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/l/2026-11-18/5'); await page.waitForSelector('#tl-ex');
      await page.click('#tl-ex .opt'); await page.click('#tl-next'); await page.click('#tl-ex .opt'); await page.click('#tl-next');
      await page.fill('#tl-in', 'Masarap ang adobo'); await page.click('#tl-check'); await page.waitForSelector('#tl-alt');
      assert.deepStrictEqual(await bad('#tl-fb'), [], theme + ' #tl-alt');
      await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem('wl.tagalog.v1') || '{}');
        st.cards = { ngayon: { en: 'now', box: 1, due: '2000-01-01', seen: 5, right: 2, wrong: 3, from: '' }, opo: { en: 'yes', box: 3, due: '2099-01-01', seen: 4, right: 4, wrong: 0, from: '' } };
        localStorage.setItem('wl.tagalog.v1', JSON.stringify(st)); window.WL.modules.tagalog.reload();
      });
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('.tl-score');
      assert.deepStrictEqual(await small('#tl-practise-hard'), []);
      assert.deepStrictEqual(await bad('#tl-hard'), [], theme + ' .tl-score');
      await t.noOverflow(['#tagalog/words']);
      await page.click('#tl-practise-hard'); await page.waitForSelector('#tl-show'); await page.click('#tl-show'); await page.waitForSelector('#tl-example');
      assert.deepStrictEqual(await bad('#tl-card'), [], theme + ' #tl-example');
      assert.deepStrictEqual(await small('#tl-example [data-say], #tl-no, #tl-yes'), []);
      await page.evaluate(() => {
        const me = JSON.parse(localStorage.getItem('wl.me.v1'));
        [20, 21, 22].forEach((d) => me.feedback.push({ id: 'calm/after/ground@x' + d, at: new Date(2026, 10, d, 21, 0).toISOString(), part: 'calm', kind: 'after', about: 'ground@x' + d, a: { helped: 'Not really', block: ['Nothing'] } }));
        localStorage.setItem('wl.me.v1', JSON.stringify(me)); window.WL.modules.me && window.WL.modules.me.reload && window.WL.modules.me.reload();
      });
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-flat'); await page.waitForSelector('.c-helped');
      assert.deepStrictEqual(await bad('#c-today'), [], theme + ' #c-flat');
      await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[]}'); c.sessions = (c.sessions || []).filter((x) => x.id !== 'shuffle'); localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-today');
      assert.ok(await page.$('#c-how'), 'the shuffle explainer shows at 22:30 with a racing mind'); assert.deepStrictEqual(await bad('#c-today'), [], theme + ' #c-how');
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      assert.deepStrictEqual(await bad('.list'), [], theme + ' .c-helped');
      await t.noOverflow(['#calm']);
    });
  }
  // Calm's meditation path: the aim card, the path card (status, tip, move on, stages), a sit's start and after chips
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('meditation path at ' + ts + 'x ' + theme + ': targets, overflow, contrast', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 10, 25, 19, 0));
      await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[]}'); c.settings = Object.assign(c.settings || {}, { aim: null }); localStorage.setItem('wl.calm.v1', JSON.stringify(c)); });
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-aim');
      assert.deepStrictEqual(await small('#c-aim [data-aim], #c-aim-set [data-aim]'), []);
      assert.deepStrictEqual(await bad('#c-aim'), [], theme + ' #c-aim');
      await t.noOverflow(['#calm']);
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
        c.settings.aim = 'train'; c.settings.stage = 'count';
        for (let d = 16; d <= 17; d++) c.sessions.push({ id: 'count', date: '2026-11-' + d, at: new Date(2026, 10, d, 7).toISOString(), mins: 20, focus: 1, hind: ['Sleepy'] }); // #c-path-when
        for (let d = 18; d <= 23; d++) c.sessions.push({ id: 'count', date: '2026-11-' + d, at: new Date(2026, 10, d, 21).toISOString(), mins: 20, focus: 3, hind: d === 23 ? ['Restless'] : ['Nothing much'] });
        localStorage.setItem('wl.calm.v1', JSON.stringify(c));
        const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.checkins = me.checkins || {};
        me.checkins['2026-11-25'] = { sleep: '4–5 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'OK' }; // #c-rough on the sit screen
        localStorage.setItem('wl.me.v1', JSON.stringify(me));
      });
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-path-ready'); await page.waitForSelector('#c-path-tip');
      assert.deepStrictEqual(await small('#c-path summary, #c-path [data-stage], #c-stages a, #c-today a.btn'), []);
      assert.deepStrictEqual(await bad('#c-path'), [], theme + ' #c-path');
      assert.ok(await page.$('#c-path-when'), 'the time-of-day line is there to check');
      assert.deepStrictEqual(await bad('#c-today'), [], theme + ' #c-today (path)');
      // task 148: the sit settings (dark screen, soft bell)
      assert.deepStrictEqual(await small('#cdk, #c-iv [data-iv]'), []);
      assert.deepStrictEqual(await bad('.card:has(#cdk)'), [], theme + ' Calm settings (#cdk, #c-iv)');
      await t.noOverflow(['#calm']);
      await page.goto(base + '#calm/s/open'); await page.waitForSelector('#c-len');
      assert.deepStrictEqual(await small('#c-len [data-len], #c-pp, #c-quiet'), []);
      assert.ok(await page.$('#c-rough'), 'rough-day line shown');
      assert.deepStrictEqual(await bad('#c-rough'), [], theme + ' #c-rough'); // (#c-dark-hint, same .meta style, shows only for the first 3 sits)
      assert.deepStrictEqual(await bad('#c-quiet-row'), [], theme + ' #c-quiet');
      await t.noOverflow(['#calm/s/open']);
      await page.click('#c-pp');
      await page.clock.runFor(11000);
      assert.strictEqual(await page.getAttribute('#c-dark', 'role'), 'button');
      assert.ok(/Tap to show the time/.test(await page.getAttribute('#c-dark', 'aria-label')));
      await page.click('#c-dark'); await page.click('#c-end');
      await page.goto(base + '#calm/s/open'); await page.waitForSelector('#c-len');
      await page.evaluate(() => { document.getElementById('c-after').hidden = false; });
      assert.deepStrictEqual(await small('#c-focus [data-f], #c-hind [data-h], #c-save'), []);
      assert.deepStrictEqual(await bad('#c-after'), [], theme + ' #c-focus/#c-hind');
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 2, 'sit questions overflow ' + o);
    });
  }
  // Task 138: newest 25 Nov cards (#me-working-home, #me-working, #wo-pain, #fc-read-open, #tl-hard-link, #c-recent-avg)
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('25 Nov cards at ' + ts + 'x ' + theme + ': #me-working-home, #me-working, #wo-pain, #fc-read-open, #tl-hard-link, #c-recent-avg', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      await page.evaluate(() => {
        const me = JSON.parse(localStorage.getItem('wl.me.v1'));
        me.skipped['2026-11-23'] = 1;
        me.feedback.push(
          { id: 'workout/after/p1', at: new Date(2026, 10, 19, 18, 0).toISOString(), part: 'workout', about: 'p1', kind: 'after', a: { hard: 'Just right', pain: 'A little' } },
          { id: 'workout/after/p2', at: new Date(2026, 10, 21, 18, 0).toISOString(), part: 'workout', about: 'p2', kind: 'after', a: { hard: 'Hard', pain: 'A little' } },
          { id: 'faith/after/day:1@late1', at: new Date(2026, 10, 21, 22, 30).toISOString(), part: 'faith', about: 'day:1@late1', kind: 'after', a: { felt: 'Hard to focus' } },
          { id: 'faith/after/day:1@late2', at: new Date(2026, 10, 22, 22, 15).toISOString(), part: 'faith', about: 'day:1@late2', kind: 'after', a: { felt: 'Hard to focus' } }
        );
        localStorage.setItem('wl.me.v1', JSON.stringify(me));
        const fc = JSON.parse(localStorage.getItem('fc.v1'));
        fc.done = { 1: '2026-11-22' };
        localStorage.setItem('fc.v1', JSON.stringify(fc));
        const tl = JSON.parse(localStorage.getItem('wl.tagalog.v1'));
        const card = (en) => ({ en, box: 1, due: '2026-11-17', seen: 1, right: 0, wrong: 1, from: '2026-11-11/1' });
        tl.cards = { salamat: card('thank you'), tubig: card('water'), 'kain na': card('let’s eat') };
        localStorage.setItem('wl.tagalog.v1', JSON.stringify(tl));
        if (window.WL && WL.modules) Object.keys(WL.modules).forEach((k) => { if (WL.modules[k].reload) WL.modules[k].reload(); });
      });
      await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#me-working-home');
      assert.deepStrictEqual(await small('.home-card[data-module="me"] a, .home-card[data-module="me"] button'), []);
      assert.deepStrictEqual(await bad('.home-card[data-module="me"]'), [], theme + ' #me-working-home');
      await t.noOverflow(['#home']);
      await page.goto(base + '#me'); await page.waitForSelector('#me-working');
      assert.deepStrictEqual(await bad('#me-working'), [], theme + ' #me-working');
      await t.noOverflow(['#me']);
      await page.goto(base + '#workout'); await page.waitForSelector('#wo-pain');
      assert.deepStrictEqual(await small('#wo-pain button'), []);
      assert.deepStrictEqual(await bad('#view'), [], theme + ' #wo-pain');
      await t.noOverflow(['#workout']);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 22, 30));
      await page.goto(base + '#faith/today'); await page.waitForSelector('#fc-read-open[open]');
      assert.deepStrictEqual(await small('#fc-read-open summary'), []);
      assert.deepStrictEqual(await bad('#fc-read-open'), [], theme + ' #fc-read-open');
      await t.noOverflow(['#faith/today']);
      await page.clock.setSystemTime(new Date(2026, 10, 23, 10, 0));
      await page.goto(base + '#calm'); await page.waitForSelector('#c-recent');
      await page.click('#c-recent summary'); await page.waitForSelector('#c-recent-avg');
      assert.deepStrictEqual(await small('#c-recent summary'), []);
      assert.deepStrictEqual(await bad('#c-recent'), [], theme + ' #c-recent-avg');
      const co = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(co <= 2, '#calm #c-recent-avg overflow ' + co);
      await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
      for (let n = 0; n < 3; n++) { await page.click('#tl-show'); await page.clock.runFor(450); await page.click('#tl-no'); }
      await page.waitForSelector('#tl-hard-link');
      assert.deepStrictEqual(await small('#tl-hard-link a, #tl-missed button'), []);
      assert.deepStrictEqual(await bad('#tl-hard-link'), [], theme + ' #tl-hard-link');
      assert.deepStrictEqual(await bad('#tl-card'), [], theme + ' #tl-card recap');
      const to = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(to <= 2, '#tagalog/review #tl-hard-link overflow ' + to);
    });
  }
  // Task 173: Faith Pray now "Dark screen late at night" and the late-night dark cover
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('faith dark screen at ' + ts + 'x ' + theme + ': #dark-toggle, #fc-dark', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 10, 24, 22, 30));
      await page.goto(base + '#home'); await page.goto(base + '#faith/pray'); await page.reload(); await page.waitForSelector('#dark-toggle');
      assert.deepStrictEqual(await small('#dark-toggle, #voice-toggle'), []);
      assert.deepStrictEqual(await bad('.card:has(#dark-toggle)'), [], theme + ' Pray now settings');
      await t.noOverflow(['#faith/pray']);
      await page.goto(base + '#faith/session/day/1'); await page.waitForSelector('#pp');
      await page.click('#pp'); await page.clock.runFor(21000);
      assert.strictEqual(await page.getAttribute('#fc-dark', 'role'), 'button');
      assert.ok(/Tap to see the words/.test(await page.getAttribute('#fc-dark', 'aria-label')));
      await page.click('#fc-dark'); await page.click('#end');
    });
  }
  // Tasks 182 & 207: Home's Move card on a rough day ("Rest today (tired)"), Calm's rough-day card line, and "Check-in ✓ · change" (#me-ci-change)
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('rough-day Home cards & #me-ci-change at ' + ts + 'x ' + theme + ': #wo-rough-rest, #c-card-rough, #me-ci-change', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 10, 24, 8, 0));
      await page.evaluate(() => {
        const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.checkins = me.checkins || {};
        me.checkins['2026-11-24'] = { sleep: 'Under 4 h', wakes: '3+', energy: 'Low', mood: 'OK', day: 'OK' };
        localStorage.setItem('wl.me.v1', JSON.stringify(me));
        const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}'); c.settings = Object.assign(c.settings || {}, { aim: 'train', sitMinutes: 20 });
        c.sessions = (c.sessions || []).filter((x) => x.date !== '2026-11-24'); localStorage.setItem('wl.calm.v1', JSON.stringify(c));
        const w = JSON.parse(localStorage.getItem('wl.workout.v1') || '{}'); if (w.rest) delete w.rest['2026-11-24']; localStorage.setItem('wl.workout.v1', JSON.stringify(w));
      });
      await page.goto(base + '#calm'); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#wo-rough-rest'); await page.waitForSelector('#me-ci-change');
      assert.deepStrictEqual(await small('#wo-rough-rest, .home-card[data-module="workout"] .me-fit, #me-ci-change'), []);
      assert.deepStrictEqual(await bad('.home-card[data-module="workout"]'), [], theme + ' Move card');
      assert.deepStrictEqual(await bad('.home-card[data-module="me"]'), [], theme + ' About-you card (#me-ci-change)');
      if (await page.$('#c-card-rough')) assert.deepStrictEqual(await bad('.home-card[data-module="calm"]'), [], theme + ' Calm card');
      await t.noOverflow(['#home']);
    });
  }
  // Task 183: Tagalog review "Go through these again"
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('review repeat at ' + ts + 'x ' + theme + ': #tl-repeat, #tl-again-done', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.evaluate(() => {
        const card = (en) => ({ en, box: 1, due: '2026-11-17', seen: 1, right: 0, wrong: 1, from: '2026-11-11/1' });
        const s = JSON.parse(localStorage.getItem('wl.tagalog.v1') || '{}');
        s.cards = { salamat: card('thank you'), tubig: card('water') }; localStorage.setItem('wl.tagalog.v1', JSON.stringify(s));
      });
      await page.goto(base + '#home'); await page.goto(base + '#tagalog/review'); await page.reload(); await page.waitForSelector('#tl-show');
      for (let n = 0; n < 2; n++) { await page.click('#tl-show'); await page.clock.runFor(450); await page.click('#tl-no'); }
      await page.waitForSelector('#tl-repeat');
      assert.deepStrictEqual(await small('#tl-repeat'), []);
      assert.deepStrictEqual(await bad('#tl-card'), [], theme + ' review end');
      await page.click('#tl-repeat');
      for (let n = 0; n < 2; n++) { await page.click('#tl-show'); await page.clock.runFor(450); await page.click(n ? '#tl-yes' : '#tl-no'); }
      await page.waitForSelector('#tl-again-done');
      assert.deepStrictEqual(await bad('#tl-card'), [], theme + ' #tl-again-done');
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 2, 'overflow ' + o);
    });
  }
  // Task 145: the path's "Back to <stage>" offer
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('path "back" offer at ' + ts + 'x ' + theme + ': #c-path-back', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 10, 25, 19, 0));
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}');
        c.settings = Object.assign(c.settings || {}, { aim: 'train', stage: 'follow' });
        c.sessions = (c.sessions || []).filter((x) => x.id !== 'follow');
        for (let d = 21; d <= 24; d++) c.sessions.push({ id: 'follow', date: '2026-11-' + d, at: new Date(2026, 10, d, 21).toISOString(), mins: 20, focus: 1, hind: ['Sleepy'] });
        localStorage.setItem('wl.calm.v1', JSON.stringify(c));
      });
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-path-back');
      assert.deepStrictEqual(await small('#c-path-back [data-stage]'), []);
      assert.deepStrictEqual(await bad('#c-path-back'), [], theme + ' #c-path-back');
      await t.noOverflow(['#calm']);
    });
  }
  // Task 220: the verb-form hint (#tl-aspect, the longest hint text) and Your words' "Slips to watch" (#tl-slips)
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('verb-form hint and slips at ' + ts + 'x ' + theme + ': #tl-aspect, #tl-slips', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/l/2026-11-25/1'); await page.reload(); await page.waitForSelector('#tl-ex');
      await page.click('#tl-ex .opt'); await page.click('#tl-next');
      await page.click('#tl-check'); await page.click('#tl-next');
      await page.fill('#tl-in', 'gusto kong magaaral ng tagalog'); await page.click('#tl-check'); await page.waitForSelector('#tl-aspect');
      assert.deepStrictEqual(await bad('#tl-fb'), [], theme + ' #tl-aspect');
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o <= 2, '#tl-aspect overflow ' + o);
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('#tl-slips');
      assert.deepStrictEqual(await small('#tl-slips [data-say]'), []);
      assert.deepStrictEqual(await bad('#tl-slips'), [], theme + ' #tl-slips');
      await t.noOverflow(['#tagalog/words']);
      // Task 234: "Practise these" (#tl-practise-slips) and the run it starts (#tagalog/slips), and its finish screen
      assert.deepStrictEqual(await small('#tl-practise-slips'), []);
      await page.click('#tl-practise-slips'); await page.waitForSelector('#tl-slip-run #tl-in');
      assert.deepStrictEqual(await small('#tl-slip-run button, #tl-slip-run input'), []);
      assert.deepStrictEqual(await bad('#tl-slip-run'), [], theme + ' #tl-slip-run');
      let o2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o2 <= 0, '#tagalog/slips overflow ' + o2);
      await page.fill('#tl-in', 'gusto kong magaaral'); await page.click('#tl-check'); await page.waitForSelector('#tl-fb .no');
      assert.deepStrictEqual(await bad('#tl-fb'), [], theme + ' #tagalog/slips feedback');
      await page.click('#tl-next'); await page.waitForSelector('#tl-again');
      assert.deepStrictEqual(await small('#tl-slip-run a.btn, #tl-slip-run button'), []);
      assert.deepStrictEqual(await bad('#tl-slip-run'), [], theme + ' #tagalog/slips finish');
      o2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(o2 <= 0, '#tagalog/slips finish overflow ' + o2);
    });
  }
  // Task 226: Home's Calm aim question (#c-aim-home) until it's answered
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('Calm aim on Home at ' + ts + 'x ' + theme + ': #c-aim-home', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}');
        c.settings = c.settings || {}; delete c.settings.aim; c.sessions = []; localStorage.setItem('wl.calm.v1', JSON.stringify(c));
      });
      await page.goto(base + '#calm'); await page.goto(base + '#home'); await page.reload(); await page.waitForSelector('#c-aim-home');
      assert.deepStrictEqual(await small('#c-aim-home [data-aim], .home-card[data-module="calm"] a.btn'), []);
      assert.deepStrictEqual(await bad('.home-card[data-module="calm"]'), [], theme + ' #c-aim-home');
      await t.noOverflow(['#home']);
    });
  }
  // Task 212: newest 26 Nov UI: #c-path-late (+ Not for me), #c-first-tip, Settings #wl-space / #wl-space-parts, #tl-walkdark
  for (const [ts, theme] of [[1, 'light'], [1.3, 'light'], [1, 'dark'], [1, 'night']]) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step('26 Nov UI at ' + ts + 'x ' + theme + ': #c-path-late, #c-first-tip, #wl-space, #tl-walkdark', async () => {
      await look(ts, theme); await seed();
      const bad = async (sel) => (await contrast(sel)).filter((x) => x.r < min);
      await page.clock.setSystemTime(new Date(2026, 11, 3, 12, 0));
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}');
        c.settings = Object.assign(c.settings || {}, { aim: 'train', stage: 'count' }); c.sessions = [];
        localStorage.setItem('wl.calm.v1', JSON.stringify(c));
      });
      // first sit: the tip on the sit screen
      await page.goto(base + '#home'); await page.goto(base + '#calm/s/count'); await page.reload(); await page.waitForSelector('#c-first-tip');
      assert.deepStrictEqual(await bad('.session'), [], theme + ' #c-first-tip');
      await t.noOverflow(['#calm/s/count']);
      // two late sleepy sits: the path card's line and its Not for me
      await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
        for (const d of [1, 2]) c.sessions.push({ id: 'count', date: '2026-12-0' + d, at: new Date(2026, 11, d, 23, 10).toISOString(), mins: 20, focus: 1, hind: ['Sleepy'] });
        localStorage.setItem('wl.calm.v1', JSON.stringify(c));
        const m = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[]}'); m.feedback = (m.feedback || []).filter((f) => f.about !== 'path:late'); localStorage.setItem('wl.me.v1', JSON.stringify(m));
      });
      await page.goto(base + '#home'); await page.goto(base + '#calm'); await page.reload(); await page.waitForSelector('#c-path-late');
      assert.deepStrictEqual(await small('#c-path-late button, #c-path-late a'), []);
      assert.deepStrictEqual(await bad('#c-path'), [], theme + ' #c-path-late');
      await t.noOverflow(['#calm']);
      // Settings > Backup: the space line and its parts
      await page.goto(base + '#settings'); await page.waitForSelector('#wl-space');
      await page.evaluate(() => { const d = document.querySelector('#wl-space-parts'); const det = d && d.closest('details'); if (det) det.open = true; });
      assert.deepStrictEqual(await bad('#wl-space'), [], theme + ' #wl-space');
      const sp = await contrast('#wl-space-parts'); assert.deepStrictEqual(sp.filter((x) => x.r < min), [], theme + ' #wl-space-parts');
      assert.deepStrictEqual(await small('#wl-space summary, #wl-space-parts summary'), []);
      await t.noOverflow(['#settings']);
      // Tagalog settings: Dark screen while listening
      await page.goto(base + '#tagalog/settings'); await page.waitForSelector('#tl-walkdark');
      assert.deepStrictEqual(await small('#tl-walkdark'), []);
      assert.deepStrictEqual(await bad('#view'), [], theme + ' #tagalog/settings');
      await t.noOverflow(['#tagalog/settings']);
    });
  }
  for (const theme of ['light', 'dark', 'night']) {
    const min = theme === 'night' ? 3 : 4.5;
    await t.step(theme + ': Cooking tabs (incl. the "What did Mama cook?" field) text contrast, 44 px at 1.3', async () => {
      await look(1.3, theme); await page.goto(base + '#cook'); await page.reload(); await page.waitForSelector('[data-ck-meal]');
      const m = await page.$('[data-ck-mama]');
      if (m) { await m.click(); await page.waitForSelector('.ck-mama-form'); }
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #cook');
      assert.deepStrictEqual(await small('.ck-mama-form input, .ck-mama-form button, [data-ck-made], [data-ck-mama], [data-ck-reset]'), [], theme + ' #cook targets');
      for (const h of ['#cook/week', '#cook/log', '#cook/pantry']) {
        await page.goto(base + h); await page.waitForTimeout(80);
        assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' ' + h);
      }
      await t.noOverflow(['#cook', '#cook/week', '#cook/log', '#cook/pantry']);
    });
  }
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y of new UI');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
