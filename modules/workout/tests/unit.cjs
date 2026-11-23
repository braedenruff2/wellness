/* Workout logic tests. node modules/workout/tests/unit.cjs */
'use strict';
const assert = require('assert');
const W = require('../../../app/www/modules/workout/workout-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const at = (d, h, m) => new Date(2026, 10, d, h, m || 0);

t('program: every exercise is defined, sets 1-4, superset partners agree', () => {
  for (const d of W.ORDER) for (const it of W.PROGRAM[d].items) {
    assert.ok(W.EX[it.ex], it.ex); assert.ok(it.sets >= 1 && it.sets <= 4);
  }
  // each main muscle area is trained on at least 2 of the 3 days
  const legs = W.ORDER.filter((d) => W.PROGRAM[d].items.some((i) => /Squat|Lunge|RDL/.test(i.ex))).length;
  const push = W.ORDER.filter((d) => W.PROGRAM[d].items.some((i) => /Push|Press/.test(i.ex))).length;
  const pull = W.ORDER.filter((d) => W.PROGRAM[d].items.some((i) => /Row|Fly|Pullover|Curl/.test(i.ex))).length;
  assert.ok(legs >= 2 && push >= 2 && pull >= 2, [legs, push, pull].join());
});

t('rest rules match the sheet: transition to partner, rest between rounds, then next group', () => {
  const r1 = W.restInfo('A', 0, 1);
  assert.strictEqual(r1.secs, 20); assert.ok(/Pushups \(set 1\)/.test(r1.label)); assert.strictEqual(r1.next, 1);
  const r2 = W.restInfo('A', 1, 1);
  assert.strictEqual(r2.secs, 75); assert.ok(/Bulgarian Split Squats set 2/.test(r2.label));
  const r3 = W.restInfo('A', 1, 3);
  assert.ok(/One-Arm Rows/.test(r3.label)); assert.strictEqual(r3.next, 2);
  // Day B group B: Reverse Lunges 2 sets, Rear Delt Flys 3 sets -> round 3 has only the flys
  const b = W.restInfo('B', 3, 2); assert.ok(/Rear Delt Flys set 3/.test(b.label), b.label);
  const lastWalk = W.PROGRAM.A.items.length - 1; assert.strictEqual(W.restInfo('A', lastWalk, 1).secs, 0);
});

t('rotation: next day follows the last day logged; skipped days do not matter', () => {
  const s = W.defaults();
  assert.strictEqual(W.nextDay(s, at(18, 9)), 'A');
  W.logSet(s, 'A', 0, 12, 10, at(18, 9)); W.endSession(s, at(18, 9, 30));
  assert.strictEqual(W.nextDay(s, at(25, 9)), 'B', 'a week later it is still B');
  W.logSet(s, 'C', 0, 12, 10, at(26, 9)); W.endSession(s, at(26, 9, 30));
  assert.strictEqual(W.nextDay(s, at(27, 9)), 'A');
});

t('a workout stays open all day until Finish (it used to close after 45 min: his 19 Nov workout was cut in two)', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 17, 10, at(19, 11, 29)); W.logSet(s, 'A', 1, 19, null, at(19, 13, 0));
  assert.ok(W.openSession(s, at(19, 13, 50)), '50 min after the last set: still open');
  assert.strictEqual(W.nextDay(s, at(19, 13, 50)), 'A', 'and still Day A');
  W.logSet(s, 'A', 2, 10, 10, at(19, 17, 0));
  assert.strictEqual(s.sessions.length, 1, 'hours later: the same workout');
  assert.strictEqual(s.sessions[0].sets.length, 3);
  // past midnight, late sets still count (within 6 h of the last one)
  const n = W.defaults();
  W.logSet(n, 'B', 0, 10, 10, at(19, 23, 30));
  assert.ok(W.openSession(n, at(20, 0, 30)), 'just past midnight');
  assert.strictEqual(W.openSession(n, at(20, 9, 0)), null, 'next morning: a new day');
  W.logSet(n, 'C', 0, 10, 10, at(20, 9, 0));
  assert.strictEqual(n.sessions.length, 2); assert.ok(n.sessions[0].end, "yesterday's unfinished one is closed at its last set");
  assert.strictEqual(n.sessions[0].end, at(19, 23, 30).toISOString());
});

t('finished by mistake: carry on with it', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 17, 10, at(19, 11)); W.endSession(s, at(19, 11, 5));
  assert.strictEqual(W.openSession(s, at(19, 12)), null);
  const f = W.finishedToday(s, at(19, 12));
  assert.ok(f && f.day === 'A');
  assert.strictEqual(W.finishedToday(s, at(20, 12)), null, 'only the same day');
  W.reopen(s, f.id);
  W.logSet(s, 'A', 0, 16, 10, at(19, 12));
  assert.strictEqual(s.sessions.length, 1); assert.strictEqual(s.sessions[0].sets[1].n, 2);
});

t('logging for an earlier day: its own session, in date order, and today\'s open workout is left alone', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 17, 10, at(19, 11));                 // today's workout, still open
  W.logSet(s, 'C', 0, 12, 10, at(18, 11, 5));              // logging yesterday's
  assert.strictEqual(s.sessions.length, 2);
  assert.deepStrictEqual(s.sessions.map((x) => x.date), ['2026-11-18', '2026-11-19'], 'kept in date order');
  assert.strictEqual(W.openSession(s, at(19, 11, 10)).day, 'A', "today's is still the open one");
  assert.strictEqual(W.openSession(s, at(18, 11, 10)).day, 'C');
  W.endSession(s, at(18, 11, 20));
  assert.ok(s.sessions[0].end && !s.sessions[1].end, 'finishing yesterday leaves today open');
  assert.strictEqual(W.nextDay(s, at(18, 12)), 'A', 'for yesterday the rotation looks only at that day and before');
  W.logSet(s, 'A', 1, 19, null, at(19, 11, 30));
  assert.strictEqual(s.sessions[1].sets.length, 2);
});

t('fixing a mistyped set: new number, or removed with the later sets renumbered', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 71, 10, at(19, 11)); W.logSet(s, 'A', 1, 19, null, at(19, 11, 2)); W.logSet(s, 'A', 0, 17, 10, at(19, 11, 5));
  const f = W.editSet(s, 0, 0, 17, undefined, at(19, 11, 6));
  assert.strictEqual(f.val, 17); assert.ok(f.edited); assert.strictEqual(f.w, 10, 'weight untouched');
  W.editSet(s, 0, 1, 16, '12.5', at(19, 11, 7));
  assert.strictEqual(s.sessions[0].sets[2].w, 12.5); assert.strictEqual(s.weights['Bulgarian Split Squats'], 12.5, 'the latest set\'s weight is remembered');
  W.editSet(s, 0, 0, 0, undefined, at(19, 11, 8));
  const sq = s.sessions[0].sets.filter((x) => x.i === 0);
  assert.deepStrictEqual(sq.map((x) => [x.n, x.val]), [[1, 16]], 'removed, the other one is now set 1');
  assert.strictEqual(s.sessions[0].removed.length, 1);
  assert.strictEqual(W.editSet(s, 0, 5, 3, undefined, at(19, 11, 9)), null, 'no such set');
  const v = W.validate(JSON.parse(JSON.stringify(s)));
  assert.ok(v.sessions[0].sets.find((x) => x.i === 0).edited && v.sessions[0].removed.length === 1, 'kept through backup');
  W.endSession(s, at(19, 12));
  assert.strictEqual(W.editSet(s, 1, 0, 20, undefined, at(19, 12, 1)), null, 'a finished workout is not changed (Carry on first)');
});

t('set numbers, weights remembered, undo', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 12, 10, at(18, 9)); const r = W.logSet(s, 'A', 0, 11, '15', at(18, 9, 3));
  assert.strictEqual(r.set.n, 2); assert.strictEqual(s.weights['Bulgarian Split Squats'], 15);
  assert.strictEqual(W.undoSet(s, at(18, 9, 5)).val, 11); assert.strictEqual(s.sessions[0].sets.length, 1);
  W.endSession(s, at(18, 9, 6)); assert.strictEqual(W.undoSet(s, at(18, 9, 7)), null, 'no undo after finishing');
  const e = W.defaults(); W.startSession(e, 'A', at(18, 9)); W.endSession(e, at(18, 9, 1)); assert.strictEqual(e.sessions.length, 0, 'empty sessions are not kept');
});

t('advice: progression with the 10 lb pair vs adjustable dumbbells', () => {
  const s = W.defaults(), it = W.PROGRAM.A.items[0]; // Bulgarian 3 x 8-15
  assert.ok(/Start comfortably/.test(W.advice(s, it, null)));
  const top = { sets: [15, 15, 15], w: 10 };
  assert.ok(/Ready for harder: 3-sec lowering/.test(W.advice(s, it, top)));
  s.next['Bulgarian Split Squats'] = W.EX['Bulgarian Split Squats'].hard;
  assert.ok(/add a set or slow/.test(W.advice(s, it, top)), 'already switched: other suggestion');
  s.equipment = 'adjustable';
  assert.ok(/go up to 15 lb/.test(W.advice(s, it, top)));
  assert.ok(/beat it by one rep/.test(W.advice(s, it, { sets: [12, 12, 10], w: 10 })));
  assert.ok(/Below the range/.test(W.advice(s, it, { sets: [6, 5, 5], w: 10 })));
  assert.ok(!W.ready(it, { sets: [15, 15], w: 10 }), 'missing a set is not ready');
});

t('week stats and coaching', () => {
  const s = W.defaults();
  assert.ok(/30 minutes/.test(W.coach(s, at(18, 9))));
  W.logSet(s, 'A', 0, 12, 10, at(16, 9)); W.endSession(s);
  W.logSet(s, 'B', 0, 12, 10, at(18, 9)); W.endSession(s);
  const st = W.weekStats(s, at(19, 9)); // week of Mon 16 Nov
  assert.strictEqual(st.thisWeek, 2);
  assert.ok(/Done for today/.test(W.coach(s, at(18, 20))));
  W.logSet(s, 'C', 0, 12, 10, at(19, 9));
  assert.ok(/In progress: 1 set so far/.test(W.coach(s, at(19, 9, 5))), 'not "done" mid-workout');
  W.undoSet(s); W.endSession(s);
  assert.strictEqual(W.weekStats(s, at(24, 9)).streak, 1, 'last week had 2 -> streak 1');
  assert.ok(/Start easy/.test(W.coach(s, at(30, 9))), '12 days later');
});

t('weekly sets per area and the balance advice', () => {
  const s = W.defaults();
  assert.strictEqual(W.volumeAdvice(s, at(18, 9)), '', 'nothing logged: no advice');
  Object.keys(W.EX).filter((e) => e !== 'Walk').forEach((e) => assert.ok(W.AREAS.includes(W.AREA[e]), e + ' has an area'));
  W.logSet(s, 'A', 0, 12, 10, at(10, 9)); // last week (Mon 9 Nov - Sun 15)
  for (let i = 0; i < 3; i++) { W.logSet(s, 'A', 0, 12, 10, at(16, 9, i)); W.logSet(s, 'A', 1, 15, null, at(16, 9, i + 1)); }
  W.logSet(s, 'A', 2, 0, 10, at(16, 9, 10)); // a 0 (skipped) set does not count
  W.endSession(s);
  s.history.push({ date: '2026-11-17', ex: 'One-Arm Rows', sets: [12, 12], w: 10, from: 'sheet' }, { date: '2026-11-17', ex: 'Walk', sets: [20], w: null, from: 'sheet' });
  const v = W.weekVolume(s, at(19, 9));
  assert.deepStrictEqual(v.thisWeek, { legs: 3, push: 3, pull: 2, core: 0 });
  assert.deepStrictEqual(v.lastWeek, { legs: 1, push: 0, pull: 0, core: 0 });
  assert.strictEqual(W.volumeAdvice(s, at(19, 9)), 'Core has 0 of about 3 sets this week: Day A gives it the most.');
  ['Plank', 'Dead Bug', 'Plank'].forEach((e) => s.history.push({ date: '2026-11-18', ex: e, sets: [40], w: null }));
  assert.ok(/^Pull has 2 of about 6/.test(W.volumeAdvice(s, at(19, 9))), W.volumeAdvice(s, at(19, 9)));
  assert.deepStrictEqual(W.weekVolume(s, at(30, 9)).thisWeek, { legs: 0, push: 0, pull: 0, core: 0 }, 'a new week starts at 0');
});

t('import the sheet’s Log CSV (quoted notes, speed in Weight for walks, Rest rows, duplicates)', () => {
  const csv = 'Date,Day,Exercise,Set 1,Set 2,Set 3,Set 4,Weight,Notes,240,My Body Weight\r\n' +
    '2026-11-02,Monday,Pushups,17,16,10,,,"A · 3 x 8–20 reps  |  Last: 15/15, again",43,\r\n' +
    '2026-11-03,Tuesday,Bulgarian Split Squats,15,15,15,,10 lbs,x,45,\r\n' +
    '2026-11-03,Tuesday,Treadmill Walk,54,48,,,2.6 mph,x,4,\r\n' +
    '2026-11-14,Saturday,Rest,,,,,,,,\r\n2026-11-16,Monday,Pushups,,,,,,,0,\r\n';
  const s = W.defaults();
  assert.strictEqual(W.importSheetCsv(s, csv), 3);
  assert.strictEqual(W.importSheetCsv(s, csv), 0, 'importing twice adds nothing');
  assert.deepStrictEqual(W.last(s, 'Pushups').sets, [17, 16, 10]);
  assert.strictEqual(W.last(s, 'Bulgarian Split Squats').w, 10);
  assert.deepStrictEqual(W.last(s, 'Walk').sets, [102]);
  assert.strictEqual(W.last(s, 'Walk').w, null, 'speed is not a weight');
  assert.throws(() => W.importSheetCsv(s, 'a,b\n1,2'));
  assert.ok(W.ready(W.PROGRAM.A.items[0], W.last(s, 'Bulgarian Split Squats')), 'sheet history drives progression');
});

t('validate a backup: drops unknown exercises, bad dates and junk', () => {
  const v = W.validate({ equipment: 'x', sessions: [{ date: '2026-11-18', day: 'A', sets: [{ ex: 'Pushups', val: 10 }, { ex: '<img>', val: 3 }, { ex: 'Pushups', val: '9' }] }, { date: 'bad', day: 'A', sets: [] }], history: [{ date: '2026-11-01', ex: 'Pushups', sets: [1, 'x'] }] });
  assert.strictEqual(v.equipment, 'fixed10'); assert.strictEqual(v.sessions.length, 1); assert.strictEqual(v.sessions[0].sets.length, 1);
  assert.deepStrictEqual(v.history[0].sets, [1]);
  assert.strictEqual(W.validate({}), null);
});

t('undo tells the PC the set is gone (it may have been sent already)', () => {
  const s = W.defaults(), at = (h, m) => new Date(2026, 10, 19, h, m);
  W.logSet(s, 'A', 1, 12, null, at(9, 0)); W.logSet(s, 'A', 1, 15, null, at(9, 2));
  const x = W.undoSet(s, at(9, 3));
  assert.strictEqual(x.val, 15);
  assert.deepStrictEqual(s.sessions[0].removed, [{ at: x.at, i: 1 }]);
  assert.deepStrictEqual(W.validate(JSON.parse(JSON.stringify(s))).sessions[0].removed, [{ at: x.at, i: 1 }], 'kept through a backup');
});
t('today line for Home: done, planned rest, in progress, next', () => {
  const s = W.defaults(), d = (day, h, m) => new Date(2026, 10, day, h || 9, m || 0); // Mon 16 Nov 2026
  assert.deepStrictEqual(W.today(s, d(16)), { done: false, text: 'Full body A (about 30 min)' });
  W.logSet(s, 'A', 0, 12, 10, d(16, 9)); 
  assert.ok(/in progress/.test(W.today(s, d(16, 9, 5)).text));
  W.endSession(s, d(16, 9, 30));
  assert.deepStrictEqual(W.today(s, d(16, 20)), { done: true, text: 'workout done' });
  assert.ok(W.today(s, d(17)).done && /rest day/.test(W.today(s, d(17)).text), 'the day after: rest');
  assert.ok(!W.today(s, d(18)).done && /Full body B/.test(W.today(s, d(18)).text));
  W.logSet(s, 'B', 0, 12, 10, d(18)); W.endSession(s, d(18, 9, 30));
  W.logSet(s, 'C', 0, 12, 10, d(20)); W.endSession(s, d(20, 9, 30));
  assert.ok(W.today(s, d(22)).done && /3 this week/.test(W.today(s, d(22)).text), 'three done: Sunday is rest');
  // late in the week with an area behind: named
  const b = W.defaults();
  W.logSet(b, 'B', 1, 10, null, d(17)); W.endSession(b, d(17, 9, 30)); // pike pushups only (push)
  assert.ok(!/light on/.test(W.today(b, d(19)).text), 'Thursday: not yet');
  assert.ok(/light on (legs|pull) this week/.test(W.today(b, d(20)).text), W.today(b, d(20)).text);
});
t('every set undone: no workout "in progress", the day can change, removed sets still reach the PC', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 12, 10, at(18, 9)); W.undoSet(s, at(18, 9, 1));
  assert.strictEqual(W.openSession(s, at(18, 9, 2)), null);
  assert.ok(!/in progress/.test(W.today(s, at(18, 9, 2)).text));
  W.logSet(s, 'B', 0, 10, 10, at(18, 9, 5));
  assert.strictEqual(W.openSession(s, at(18, 9, 6)).day, 'B', 'switched to B');
  const s2 = W.defaults(); W.logSet(s2, 'A', 0, 12, 10, at(18, 9)); W.editSet(s2, 0, 0, 0, null, at(18, 9, 1));
  W.endSession(s2, at(18, 9, 2));
  assert.ok(s2.sessions.some((x) => x.removed && x.removed.length), 'kept (closed) for the PC');
});
t('after Christmas: ask once about adjustable dumbbells, again a week after "Not yet", never once switched', () => {
  const s = W.defaults();
  assert.ok(!W.askDumbbells(s, new Date(2026, 11, 25, 12)));
  assert.ok(W.askDumbbells(s, new Date(2026, 11, 26, 9)));
  s.dbAsked = '2026-12-26';
  assert.ok(!W.askDumbbells(s, new Date(2027, 0, 1, 9)));
  assert.ok(W.askDumbbells(s, new Date(2027, 0, 2, 9)));
  assert.strictEqual(W.validate(JSON.parse(JSON.stringify(s))).dbAsked, '2026-12-26', 'kept through a backup');
  s.equipment = 'adjustable'; assert.ok(!W.askDumbbells(s, new Date(2027, 0, 9, 9)));
});
t('logging for an earlier week: weekStats, weekVolume and coach ignore sessions in later weeks', () => {
  const s = W.defaults();
  // Monday 23 Nov workout already logged; now looking at Sunday 22 Nov (previous week)
  W.logSet(s, 'A', 0, 12, 10, at(23, 9)); W.endSession(s, at(23, 9, 30));
  assert.strictEqual(W.weekStats(s, at(22, 18)).thisWeek, 0, 'Monday workout not counted in previous week');
  assert.strictEqual(W.weekVolume(s, at(22, 18)).thisWeek.legs, 0, 'Monday sets not counted in previous week');
  assert.ok(/0 of 3|busy week/.test(W.coach(s, at(22, 18))), 'coach does not treat future session as today');
  // Imported history newer than last in-app session counts for coach()
  W.logSet(s, 'A', 0, 12, 10, at(10, 9)); W.endSession(s, at(10, 9, 30));
  s.history.push({ date: '2026-11-22', ex: 'Pushups', sets: [15, 15], w: null, from: 'sheet' });
  assert.ok(/Done for today/.test(W.coach(s, at(22, 18))), 'newer imported history recognised');
});
t('rest days with a reason: done for the day, kind coach line, not a workout, undo, validate', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 12, 10, at(19, 9)); W.endSession(s, at(19, 10)); // Thursday
  // Sunday 22 Nov: busy, no workout
  W.logRest(s, '2026-11-22', 'Busy day', at(22, 20));
  assert.deepStrictEqual(W.today(s, at(22, 21)), { done: true, text: 'rest day (busy day)' });
  assert.ok(/busy day isn’t a missed workout/.test(W.coach(s, at(22, 21))), W.coach(s, at(22, 21)));
  assert.strictEqual(W.weekStats(s, at(22, 21)).thisWeek, 1, 'a rest day is not a workout');
  assert.deepStrictEqual(W.restThisWeek(s, at(22, 21)), [{ date: '2026-11-22', why: 'Busy day' }]);
  // the next day it's in the past: today() is the next workout again
  assert.strictEqual(W.today(s, at(23, 9)).done, false);
  // Sore: the line says normal + pain caveat; next day "two sets"
  W.logRest(s, '2026-11-23', 'Sore', at(23, 9));
  assert.ok(/normal/.test(W.coach(s, at(23, 10))) && /doctor or physio/.test(W.coach(s, at(23, 10))));
  assert.ok(/two sets of each/.test(W.coach(s, at(24, 9))), W.coach(s, at(24, 9)));
  // changing the reason replaces it and remembers the old one as removed (so the PC drops it)
  const first = s.rest['2026-11-23'].at;
  W.logRest(s, '2026-11-23', 'Tired', at(23, 11));
  assert.strictEqual(W.restOn(s, '2026-11-23'), 'Tired');
  assert.deepStrictEqual(s.restRemoved, [{ date: '2026-11-23', at: first }]);
  assert.ok(W.clearRest(s, '2026-11-23')); assert.strictEqual(W.restOn(s, '2026-11-23'), null);
  assert.ok(!W.clearRest(s, '2026-11-23'));
  assert.throws(() => W.logRest(s, '2026-11-23', 'Lazy'));
  // a busy week names the rest days
  const b = W.defaults(); W.logRest(b, '2026-11-26', 'Busy day', at(26, 9)); W.logRest(b, '2026-11-27', 'Sick', at(27, 9));
  assert.ok(/rest days logged/.test(W.coach(b, at(28, 18))) || /Rest until/.test(W.coach(b, at(28, 18))), W.coach(b, at(28, 18)));
  assert.ok(/2 rest days logged/.test(W.coach(b, at(29, 9))), W.coach(b, at(29, 9)));
  // a workout on the same day wins over a rest day
  W.logSet(b, 'A', 0, 12, 10, at(27, 18)); W.endSession(b, at(27, 18, 30));
  assert.deepStrictEqual(W.restThisWeek(b, at(29, 9)), [{ date: '2026-11-26', why: 'Busy day' }]);
  // validate keeps good entries, drops bad ones; old saves without rest still load
  const v = W.validate(JSON.parse(JSON.stringify(Object.assign(s, { rest: { '2026-11-22': { why: 'Busy day', at: at(22, 20).toISOString() }, 'x': { why: 'Sore', at: 'y' }, '2026-11-21': { why: 'Nope', at: at(21, 1).toISOString() } } }))));
  assert.deepStrictEqual(Object.keys(v.rest), ['2026-11-22']);
  assert.strictEqual(v.restRemoved.length, 2, "the Sore and Tired entries were undone");
  const old = W.validate({ sessions: [] }); assert.strictEqual(old.rest, undefined); assert.strictEqual(W.restOn(old, '2026-11-22'), null);
  assert.deepStrictEqual(W.restThisWeek(old, at(22, 9)), []);
});
t('early days back: after the first 1-2 workouts in 4 weeks, leave reps in reserve; then the usual line', () => {
  const s = W.defaults();
  assert.ok(!/Early days/.test(W.coach(s, at(19, 9))), 'nothing logged yet: no early-days line');
  W.logSet(s, 'A', 0, 17, 10, at(19, 9)); W.endSession(s, at(19, 10));
  assert.ok(/Done for today/.test(W.coach(s, at(19, 12))));
  assert.ok(/Early days back/.test(W.coach(s, at(20, 9))) && /normal/.test(W.coach(s, at(20, 9))));
  W.logRest(s, '2026-11-21', 'Sore', at(21, 9));
  assert.ok(/Still sore/.test(W.coach(s, at(22, 9))), 'the day after "Sore" wins');
  W.logSet(s, 'B', 0, 10, 10, at(24, 9)); W.endSession(s, at(24, 10));
  assert.ok(/Early days back/.test(W.coach(s, at(25, 9))), 'second workout back');
  W.logSet(s, 'C', 0, 10, 10, at(26, 9)); W.endSession(s, at(26, 10));
  assert.ok(!/Early days back/.test(W.coach(s, at(27, 9))), W.coach(s, at(27, 9)));
  // a long gap still says "start easy" first
  assert.ok(/It’s been/.test(W.coach(s, new Date(2026, 11, 10, 9))));
});
console.log(n + ' workout unit tests passed');
