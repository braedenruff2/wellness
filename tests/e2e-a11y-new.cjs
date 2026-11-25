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
    localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: {}, cards, answers: [], reviews: [] }));
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
    const sels = ['p', '.meta', '.no', '.ok', 'b', 'a', 'button', 'summary', '.wk4-rest', '.trow .tl', 'input[type="search"]', 'input[type="text"]', 'textarea', 'select', 'label'].map((s) => rootSel + ' ' + s).join(', ');
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
    await t.step('text size ' + ts + ': Parenting #co-can-nudge, #co-cloud, #co-teach, #co-hist-search, #co-hist-more, #co-worked & #coach/h/:id Back', async () => {
      await page.goto(base + '#coach'); await page.waitForSelector('#co-can-nudge'); await page.waitForSelector('#co-cloud'); await page.waitForSelector('#co-teach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked'); await page.waitForSelector('#co-hist-more');
      assert.deepStrictEqual(await small('#co-can-nudge a, #co-cloud a, a[href="#coach/setup"], #co-teach button, #co-teach summary, #co-hist-search, #co-hist-more'), []);
      await t.noOverflow(['#coach']);
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
      await openBuildExercise();
      assert.deepStrictEqual((await contrast('#tl-ex')).filter((x) => x.r < min), [], theme + ' #tl-built');
      await page.goto(base + '#coach'); await page.waitForSelector('#co-can-nudge'); await page.waitForSelector('#co-cloud'); await page.waitForSelector('#co-teach'); await page.waitForSelector('#co-hist-search'); await page.waitForSelector('#co-worked');
      assert.deepStrictEqual((await contrast('#co-can-nudge')).filter((x) => x.r < min), [], theme + ' #co-can-nudge');
      assert.deepStrictEqual((await contrast('#co-cloud')).filter((x) => x.r < min), [], theme + ' #co-cloud');
      assert.deepStrictEqual((await contrast('#co-teach')).filter((x) => x.r < min), [], theme + ' #co-teach');
      assert.deepStrictEqual((await contrast('#co-worked')).filter((x) => x.r < min), [], theme + ' #co-worked');
      assert.deepStrictEqual((await contrast('#co-hist')).filter((x) => x.r < min), [], theme + ' #co-hist');
      await page.goto(base + '#coach/h/h20'); await page.waitForSelector('a[href="#coach"]');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #coach/h/h20');
      await page.goto(base + '#me'); await page.waitForSelector('#me-ck'); await page.waitForSelector('#me-plan'); await page.waitForSelector('#me-trend');
      assert.deepStrictEqual((await contrast()).filter((x) => x.r < min), [], theme + ' #me');
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
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('a11y of new UI');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
