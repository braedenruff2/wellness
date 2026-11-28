/* Unit tests for app/www/modules/calm/calm-sit.js (CalmSit helpers: sessionTime across midnight vs logNow,
   darkHint 3-sit cutoff, firstSitTip, darkOn/scheduleDark, intervalEvery/ringInterval, roughDay/roughLine). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const K = require('../../../app/www/modules/calm/calm-core.js');
const SRC = fs.readFileSync(path.join(__dirname, '../../../app/www/modules/calm/calm-sit.js'), 'utf8');

function loadSit(opts) {
  opts = opts || {};
  let nowMs = opts.nowMs != null ? opts.nowMs : new Date(2026, 10, 26, 12, 0).getTime();
  let logNowFn = opts.logNow || (() => new Date(nowMs));
  let rough = !!opts.rough;
  const calls = { softBell: 0, darkStart: [], darkStop: 0, alarm: [] };
  const FakeDate = function (...args) {
    if (!(this instanceof FakeDate)) return new Date(nowMs).toString();
    return args.length ? new Date(...args) : new Date(nowMs);
  };
  FakeDate.now = () => nowMs;
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;

  const sandbox = {
    Date: FakeDate,
    CalmCore: K,
    WLMe: { rough: () => rough },
    WL: {
      esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      logNow: () => logNowFn(),
      softBell: () => { calls.softBell++; },
      darkScreen: {
        start: (cfg) => calls.darkStart.push(cfg),
        stop: () => { calls.darkStop++; }
      },
      native: {
        calmAlarm: (ms, label) => calls.alarm.push([ms, label])
      }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox, { filename: 'calm-sit.js' });
  return {
    Sit: sandbox.CalmSit,
    calls,
    setNow: (d) => { nowMs = d instanceof Date ? d.getTime() : d; },
    setLogNow: (fn) => { logNowFn = fn; },
    setRough: (v) => { rough = !!v; }
  };
}

let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

const pCount = K.PRACTICES.find((p) => p.id === 'count');
const pFollow = K.PRACTICES.find((p) => p.id === 'follow');
const pTimer = K.PRACTICES.find((p) => p.id === 'timer');
const pBody = K.PRACTICES.find((p) => p.id === 'body');

t('sessionTime: same-day, midnight crossing (< 6 h vs > 6 h), DST days, and earlier-day logNow', () => {
  const env = loadSit({ nowMs: new Date(2026, 10, 26, 12, 20).getTime() });
  const { Sit, setNow, setLogNow } = env;

  // Same-day sit returns current time
  const startSame = new Date(2026, 10, 26, 12, 0).getTime();
  assert.strictEqual(Sit.sessionTime(startSame).getTime(), new Date(2026, 10, 26, 12, 20).getTime());
  assert.strictEqual(Sit.sessionTime(0).getTime(), new Date(2026, 10, 26, 12, 20).getTime());

  // Started 23:50, finished 00:10 (< 6 h across midnight): filed under start evening
  setNow(new Date(2026, 10, 27, 0, 10));
  const startLate = new Date(2026, 10, 26, 23, 50).getTime();
  const resLate = Sit.sessionTime(startLate);
  assert.strictEqual(resLate.getTime(), startLate);
  assert.strictEqual(K.iso(resLate), '2026-11-26');

  // Across spring-forward (8 Mar 2026) and fall-back (1 Nov 2026) midnights: still keeps start evening
  for (const [y, m, d1, d2, want] of [[2026, 2, 7, 8, '2026-03-07'], [2026, 9, 31, 1, '2026-10-31']]) {
    const start = new Date(y, m, d1, 23, 50).getTime();
    const end = d2 === 1 ? new Date(y, m + 1, 1, 0, 10) : new Date(y, m, d2, 0, 10);
    setNow(end);
    const got = Sit.sessionTime(start);
    assert.strictEqual(got.getTime(), start, 'midnight crossing on ' + want);
    assert.strictEqual(K.iso(got), want);
  }

  // Started > 6 hours earlier across midnight: does not backdate
  setNow(new Date(2026, 10, 27, 0, 10));
  const startOld = new Date(2026, 10, 26, 17, 0).getTime();
  assert.strictEqual(K.iso(Sit.sessionTime(startOld)), '2026-11-27');

  // Earlier-day logNow active: keeps the picked earlier day even across midnight
  const picked = new Date(2026, 10, 24, 12, 0);
  setLogNow(() => picked);
  assert.strictEqual(Sit.sessionTime(startLate).getTime(), picked.getTime());
  assert.strictEqual(K.iso(Sit.sessionTime(startLate)), '2026-11-24');
});

t('darkHint: shown for the first 3 path sits or quiet timers only (ignores other practices and nulls)', () => {
  const { Sit } = loadSit();
  const s = K.defaults();
  assert.strictEqual(Sit.darkHint(s), true, '0 sits');
  s.sessions.push(null, { id: 'body', date: '2026-11-20', mins: 8 }, { id: 'slow', date: '2026-11-20', mins: 5 });
  assert.strictEqual(Sit.darkHint(s), true, 'non-sit practices do not count');
  s.sessions.push({ id: 'count', date: '2026-11-21', mins: 20 });
  s.sessions.push({ id: 'timer', date: '2026-11-22', mins: 10 });
  assert.strictEqual(Sit.darkHint(s), true, '2 sits/timers: still shown');
  s.sessions.push({ id: 'follow', date: '2026-11-23', mins: 20 });
  assert.strictEqual(Sit.darkHint(s), false, '3 sits/timers: hidden');
});

t('firstSitTip: shown once on path sits before any path sit is logged (timers/other practices do not hide it)', () => {
  const { Sit } = loadSit();
  const s = K.defaults();
  s.sessions.push(null, { id: 'timer', date: '2026-11-20', mins: 10 }, { id: 'body', date: '2026-11-20', mins: 8 });
  const tip = Sit.firstSitTip(s, pCount);
  assert.ok(tip.includes('id="c-first-tip"') && /Quiet sit/.test(tip) && /soft bell/.test(tip), tip);
  assert.strictEqual(Sit.firstSitTip(s, pTimer), '', 'not shown on quiet timer');
  assert.strictEqual(Sit.firstSitTip(s, pBody), '', 'not shown on non-path guided practice');
  assert.strictEqual(Sit.firstSitTip(s, null), '', 'safe on null practice');
  s.sessions.push({ id: 'open', date: '2026-11-21', mins: 20 });
  assert.strictEqual(Sit.firstSitTip(s, pCount), '', 'gone once any path sit exists');
  assert.strictEqual(Sit.firstSitTip(s, pFollow), '', 'gone across all path stages');
});

t('usesAlarm, darkOn, scheduleDark/lightUp, intervalEvery/ringInterval, roughDay/roughLine, calmAlarm', () => {
  const env = loadSit({ rough: false });
  const { Sit, calls, setRough } = env;
  const s = K.defaults();

  assert.strictEqual(Sit.usesAlarm(pCount), true);
  assert.strictEqual(Sit.usesAlarm(pTimer), true);
  assert.strictEqual(Sit.usesAlarm(pBody), false);
  assert.strictEqual(Sit.usesAlarm(null), false);

  assert.strictEqual(Sit.darkOn(s, pCount), true);
  assert.strictEqual(Sit.darkOn(s, pBody), false);
  s.settings.dark = false;
  assert.strictEqual(Sit.darkOn(s, pCount), false);
  s.settings.dark = true;

  Sit.scheduleDark(s, { p: pCount, done: false, paused: true });
  Sit.scheduleDark(s, { p: pCount, done: true, paused: false });
  Sit.scheduleDark(s, { p: pBody, done: false, paused: false });
  assert.strictEqual(calls.darkStart.length, 0, 'skipped when paused, done, or non-dark practice');
  Sit.scheduleDark(s, { p: pCount, done: false, paused: false });
  assert.strictEqual(calls.darkStart.length, 1);
  assert.strictEqual(calls.darkStart[0].id, 'c-dark');
  assert.strictEqual(calls.darkStart[0].after, 10000);
  Sit.lightUp();
  assert.strictEqual(calls.darkStop, 1);

  s.settings.interval = 5;
  assert.strictEqual(Sit.intervalEvery(s, pCount), 5);
  assert.strictEqual(Sit.intervalEvery(s, pBody), 0);
  const run = { iv: 0, paused: false, total: 1200 };
  assert.strictEqual(Sit.ringInterval(run, 5, 299), false);
  assert.strictEqual(Sit.ringInterval(run, 5, 300), true);
  assert.strictEqual(Sit.ringInterval(run, 5, 305), false, 'does not double-ring same interval');
  run.paused = true;
  assert.strictEqual(Sit.ringInterval(run, 5, 600), false, 'never rings while paused');
  run.paused = false;
  assert.strictEqual(Sit.ringInterval(run, 5, 905), true, 'jumps straight to 3rd mark with a single bell');
  assert.strictEqual(run.iv, 3);
  assert.strictEqual(Sit.ringInterval(run, 5, 1180), false, 'none in last 30 s');
  assert.strictEqual(calls.softBell, 2);

  assert.strictEqual(Sit.roughDay(s, pCount), false);
  setRough(true);
  assert.strictEqual(Sit.roughDay(s, pCount), true);
  assert.ok(Sit.roughLine(s, pCount).includes('id="c-rough"'));
  assert.strictEqual(Sit.roughDay(s, pTimer), false);
  s.settings.sitMinutes = 10;
  assert.strictEqual(Sit.roughDay(s, pCount), false, 'already 10 min');
  assert.strictEqual(Sit.roughLine(s, pCount), '');

  Sit.calmAlarm(1234.6, Sit.alarmLabel(pCount, 20));
  Sit.calmAlarm(-5, '');
  assert.deepStrictEqual(calls.alarm, [[1235, 'Counting breaths · 20 min'], [0, '']]);
  assert.strictEqual(Sit.alarmLabel({ title: 'Quiet timer' }, 100 / 60), 'Quiet timer · 1:40', 'exact time with seconds');
  assert.strictEqual(Sit.alarmLabel({ title: 'Quiet timer' }, 5 / 60), 'Quiet timer · 0:05');
  assert.strictEqual(Sit.alarmLabel({ title: 'Quiet timer' }, 3), 'Quiet timer · 3 min');
});

t('418: longPauseOffer triggers for path sits paused 10+ min after >= 30 s elapsed', () => {
  const t0 = new Date(2026, 10, 26, 20, 0).getTime();
  const { Sit, setNow } = loadSit({ nowMs: t0 });
  const run = { p: pCount, start: t0, pausedFor: 0, paused: true, pausedAt: t0 + 6 * 60000, done: false };
  // Under 10 min paused -> null
  setNow(t0 + 15 * 60000 + 59000);
  assert.strictEqual(Sit.longPauseOffer(run), null, '9m59s paused: null');
  // 10+ min paused -> offers Finish here (6 min counts)
  setNow(t0 + 18 * 60000);
  const o = Sit.longPauseOffer(run);
  assert.deepStrictEqual(Object.assign({}, o), { mins: 6, pausedMins: 12, label: 'Finish here (6 min counts)' });
  // Earlier pausedFor subtracted cleanly from elapsed minutes
  const run2 = { p: pCount, start: t0, pausedFor: 2 * 60000, paused: true, pausedAt: t0 + 6 * 60000, done: false };
  assert.strictEqual(Sit.longPauseOffer(run2).label, 'Finish here (4 min counts)');
  // Non-path practices (timer, body), unpaused, done, or < 30 s elapsed -> null
  assert.strictEqual(Sit.longPauseOffer({ p: pTimer, start: t0, pausedFor: 0, paused: true, pausedAt: t0 + 6 * 60000 }), null, 'timer: null');
  assert.strictEqual(Sit.longPauseOffer({ p: pBody, start: t0, pausedFor: 0, paused: true, pausedAt: t0 + 6 * 60000 }), null, 'body: null');
  assert.strictEqual(Sit.longPauseOffer({ p: pCount, start: t0, pausedFor: 0, paused: false, pausedAt: t0 + 6 * 60000 }), null, 'not paused: null');
  assert.strictEqual(Sit.longPauseOffer({ p: pCount, start: t0, pausedFor: 0, paused: true, pausedAt: t0 + 15000 }), null, '< 30 s sat: null');
});

console.log(n + ' calm-sit unit tests passed');
