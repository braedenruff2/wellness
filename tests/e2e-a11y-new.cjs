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
    window.FCAndroid = {
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
  const look = (ts, theme) => page.evaluate(([ts, theme]) => localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: ts })), [ts, theme]);
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
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: {}, cards, answers: [], reviews: [] }));
    localStorage.setItem('fc.v1', JSON.stringify({
      done: {},
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
      id: 'h' + i, at: new Date(Date.UTC(2026, 10, 1 + i, 12, 0)).toISOString(), skill: 'Staying calm', age: '15 months',
      title: 'Moment ' + (i + 1), scenario: 'Scenario ' + (i + 1), answer: 'My answer',
      result: { score: 8, verdict: 'Steady', good: ['Calm'], improve: [], better: '', why: '', practice: i === 20 ? 'Pause and name the feeling' : '', sources: [] }
    }));
    localStorage.setItem('wl.coach.v1', JSON.stringify({
      child: { name: 'Baby', birth: '2025-08-01', can: ['walks'] }, current: null, history: hist, pending: null, realDraft: ''
    }));
    localStorage.setItem('wl.me.v1', JSON.stringify({
      checkins: {}, skipped: {}, plan: null,
      feedback: [{ id: 'f1', at: '2026-11-22T12:00:00.000Z', date: '2026-11-22', part: 'coach', kind: 'after', about: 'tip:h20', a: { tried: 'It worked' } }]
    }));
    localStorage.setItem('wl.sync.v1', JSON.stringify({
      requests: [{ id: 'q1', task: 'advice', input: { question: 'How to pace workouts this week?' }, at: '2026-11-23T12:00:00.000Z' }],
      answers: {}, acked: []
    }));
    localStorage.setItem('wl.pc.v1', JSON.stringify({ sent: {}, journalText: false, cloud: { q1: { task: 'advice', at: '2026-11-23T12:00:00.000Z' } } }));
    if (window.WL && WL.modules) Object.keys(WL.modules).forEach((k) => { if (WL.modules[k].reload) WL.modules[k].reload(); });
  });
  const small = async (sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || e.placeholder || e.id || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
  const contrast = (root = '#view') => page.evaluate((rootSel) => {
    const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
    const sels = ['p', '.meta', '.no', 'b', 'a', 'button', 'summary', '.wk4-rest', 'input[type="search"]', 'textarea'].map((s) => rootSel + ' ' + s).join(', ');
    return Array.from(document.querySelectorAll(sels)).filter((e) => {
      if (e.offsetParent === null) return false;
      if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return true;
      return !!e.textContent.trim();
    }).map((e) => {
      const cs = getComputedStyle(e);
      const a = lum(rgb(cs.color)), b = lum(bg(e));
      return { t: (e.textContent || e.id || e.placeholder || '').trim().slice(0, 25), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
    });
  }, root);
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
    await t.step('text size ' + ts + ': Move Progress #wo-4w and #wo-areas filter chips', async () => {
      await page.goto(base + '#workout/history'); await page.waitForSelector('#wo-areas'); await page.waitForSelector('#wo-4w');
      assert.deepStrictEqual(await small('#wo-areas button'), []);
      await t.noOverflow(['#workout/history']);
    });
    await t.step('text size ' + ts + ': Faith journal tabs/#j-search/.del, #p-search/.p-undo & #faith/settings', async () => {
      await page.goto(base + '#faith/journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual(await small('.tabs2 button, #add-entry, #j-search, #j-list .del'), []);
      await t.noOverflow(['#faith/journal']);
      await page.goto(base + '#faith/journal/prayers'); await page.waitForSelector('#p-search');
      assert.deepStrictEqual(await small('#p-search, .p-undo, .answered, .pdel'), []);
      await t.noOverflow(['#faith/journal/prayers']);
      await page.goto(base + '#faith/settings'); await page.waitForSelector('#fc-export-text');
      assert.deepStrictEqual(await small('[data-set], #test-voice, #fc-export-text'), []);
      await t.noOverflow(['#faith/settings']);
    });
    await t.step('text size ' + ts + ': Calm #c-recent & #me-sheet', async () => {
      await page.goto(base + '#calm'); await page.waitForSelector('#c-recent');
      assert.deepStrictEqual(await small('#c-recent summary'), []);
      await page.click('#c-recent summary');
      await page.click('[data-me-fit]');
      await page.waitForSelector('#me-sheet');
      assert.deepStrictEqual(await small('#me-sheet button, #me-note'), []);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, '#calm with #c-recent and #me-sheet overflow ' + overflow + 'px');
    });
    await t.step('text size ' + ts + ': Tagalog review recap, #tl-word-search, and #tl-built .built-w', async () => {
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('#tl-word-search');
      assert.deepStrictEqual(await small('#tl-word-search, #tl-hard button, #tl-all button'), []);
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
    });
    await t.step('text size ' + ts + ': Parenting #co-hist-search, #co-hist-more & #co-worked', async () => {
      await page.goto(base + '#coach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked'); await page.waitForSelector('#co-hist-more');
      assert.deepStrictEqual(await small('#co-hist-search, #co-hist-more'), []);
      await t.noOverflow(['#coach']);
    });
    await t.step('text size ' + ts + ': Settings Drive sync errors, Home #wl-sync-nudge & Link unpaired #lk-advice-card', async () => {
      await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err'); await page.waitForSelector('#wl-sync-ans-err');
      assert.deepStrictEqual(await small('#wl-sync button'), []);
      await t.noOverflow(['#settings']);
      await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-nudge');
      assert.deepStrictEqual(await small('#wl-sync-nudge a, #wl-sync-nudge button'), []);
      await t.noOverflow(['#home']);
      // Also check #wl-sync-nudge with 0 waiting requests (includes the "Not now" link button)
      await page.evaluate(() => { WL.driveSync.cancelRequest('q1'); });
      await page.goto(base + '#settings'); await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-later');
      assert.deepStrictEqual(await small('#wl-sync-nudge a, #wl-sync-nudge button'), []);
      await t.noOverflow(['#home']);
      // Restore queued request and check unpaired Drive-sync #lk-advice-card on #link
      await page.evaluate(() => { WL.driveSync.enqueue('advice', { question: 'How to pace workouts this week?' }, 'q1'); });
      await page.goto(base + '#link'); await page.waitForSelector('#lk-advice-card'); await page.waitForSelector('#lk-queued');
      assert.deepStrictEqual(await small('#lk-advice-card button, #lk-advice-card textarea'), []);
      await t.noOverflow(['#link']);
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
      await page.goto(base + '#faith/journal'); await page.waitForSelector('#j-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/journal');
      await page.goto(base + '#faith/journal/prayers'); await page.waitForSelector('#p-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/journal/prayers');
      await page.goto(base + '#faith/settings'); await page.waitForSelector('#fc-export-text');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #faith/settings');
      await page.goto(base + '#calm'); await page.waitForSelector('#c-recent');
      await page.click('#c-recent summary');
      await page.click('[data-me-fit]'); await page.waitForSelector('#me-sheet');
      assert.deepStrictEqual((await contrast('#c-recent')).filter((x) => x.r < min), [], theme + ' #c-recent');
      assert.deepStrictEqual((await contrast('#me-sheet')).filter((x) => x.r < min), [], theme + ' #me-sheet');
      await page.goto(base + '#tagalog/words'); await page.waitForSelector('#tl-word-search');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #tagalog/words');
      await openBuildExercise();
      assert.deepStrictEqual((await contrast('#tl-ex')).filter((x) => x.r < min), [], theme + ' #tl-built');
      await page.goto(base + '#coach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked');
      assert.deepStrictEqual((await contrast('#co-worked')).filter((x) => x.r < min), [], theme + ' #co-worked');
      assert.deepStrictEqual((await contrast('#co-hist')).filter((x) => x.r < min), [], theme + ' #co-hist');
      await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err'); await page.waitForSelector('#wl-sync-ans-err');
      assert.deepStrictEqual((await contrast('#wl-sync')).filter((x) => x.r < min), [], theme + ' #wl-sync');
      await page.evaluate(() => { window.__drive.configured = false; });
      await page.goto(base + '#home'); await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-err');
      assert.deepStrictEqual((await contrast('#wl-sync')).filter((x) => x.r < min), [], theme + ' #wl-sync unconfigured');
      await page.evaluate(() => { window.__drive.configured = true; });
      await page.goto(base + '#home'); await page.waitForSelector('#wl-sync-nudge');
      assert.deepStrictEqual((await contrast('#wl-sync-nudge')).filter((x) => x.r < min), [], theme + ' #wl-sync-nudge');
      await page.goto(base + '#link'); await page.waitForSelector('#lk-advice-card'); await page.waitForSelector('#lk-queued');
      assert.deepStrictEqual((await contrast('#lk-advice-card')).filter((x) => x.r < min), [], theme + ' #lk-advice-card');
    });
  }
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y of new UI');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
