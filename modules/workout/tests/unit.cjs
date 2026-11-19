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

t('a session stays open for 45 min between sets, then a new one starts', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 12, 10, at(18, 9));
  assert.ok(W.openSession(s, at(18, 9, 40)));
  assert.strictEqual(W.nextDay(s, at(18, 9, 40)), 'A', 'mid-session it stays on the same day');
  assert.strictEqual(W.openSession(s, at(18, 10, 0)), null);
  W.logSet(s, 'A', 0, 13, 10, at(18, 10, 0));
  assert.strictEqual(s.sessions.length, 2);
  assert.strictEqual(s.sessions[1].sets[0].n, 1);
});

t('set numbers, weights remembered, undo', () => {
  const s = W.defaults();
  W.logSet(s, 'A', 0, 12, 10, at(18, 9)); const r = W.logSet(s, 'A', 0, 11, '15', at(18, 9, 3));
  assert.strictEqual(r.set.n, 2); assert.strictEqual(s.weights['Bulgarian Split Squats'], 15);
  assert.strictEqual(W.undoSet(s).val, 11); assert.strictEqual(s.sessions[0].sets.length, 1);
  W.endSession(s); assert.strictEqual(W.undoSet(s), null, 'no undo after finishing');
  const e = W.defaults(); W.startSession(e, 'A', at(18, 9)); W.endSession(e); assert.strictEqual(e.sessions.length, 0, 'empty sessions are not kept');
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

console.log(n + ' workout unit tests passed');
