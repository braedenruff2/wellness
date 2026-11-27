/* The minutes a finished workout reports to the activity log (activity.js workoutMins, for summaries and plans) agree
   with the session clock Move shows (WorkoutCore.activeTime): breaks over 90 min left out of both, the same within a
   minute of rounding, on 200 random sessions incl. ones past midnight and across the DST night. */
'use strict';
const assert = require('assert');
const A = require('../app/www/lib/activity.js');
const WK = require('../app/www/modules/workout/workout-core.js');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0, checked = 0;
const starts = [new Date(2026, 10, 1, 0, 30), new Date(2026, 10, 25, 23, 10), new Date(2027, 2, 14, 1, 0), new Date(2026, 10, 26, 18, 0)];
for (let k = 0; k < 200; k++) {
  const start = new Date(starts[k % starts.length].getTime() + Math.floor(rnd() * 3) * 864e5);
  let t = start.getTime();
  const sets = [];
  const count = 1 + Math.floor(rnd() * 12);
  for (let i = 0; i < count; i++) {
    t += rnd() < 0.12 ? (91 + rnd() * 200) * 60e3 : rnd() * 8 * 60e3; // now and then a long break
    sets.push({ i: i % 5, ex: 'Pushups', n: 1 + i, val: 10, w: null, at: new Date(t).toISOString() });
  }
  const end = new Date(t + rnd() * 5 * 60e3).toISOString();
  const s = { id: 's' + k, date: WK.iso(start), day: 'A', start: start.toISOString(), end, sets };
  const ev = A.collect({ 'wl.workout.v1': { sessions: [s], history: [], equipment: 'none', weights: {}, next: 'A' } }, {}, new Date(t + 864e5)).filter((e) => e.kind === 'workout-done')[0];
  if (!ev) continue; // older than the log window
  const clock = WK.activeTime(s).secs / 60;
  assert.ok(Math.abs(ev.data.mins - clock) <= 1, k + ': activity ' + ev.data.mins + ' min vs clock ' + clock.toFixed(2) + ' min');
  checked++;
}
assert.ok(checked >= 150, 'checked ' + checked);
n++; console.log('ok activity minutes match the session clock on ' + checked + ' random sessions');
// inverted clock (end before start): activity says 0, never negative
const bad = { id: 'b', date: '2026-11-26', day: 'A', start: '2026-11-26T20:00:00.000Z', end: '2026-11-26T19:00:00.000Z', sets: [{ i: 0, ex: 'Pushups', n: 1, val: 5, at: '2026-11-26T19:30:00.000Z' }] };
const be = A.collect({ 'wl.workout.v1': { sessions: [bad], history: [] } }, {}, new Date('2026-11-27T12:00:00Z')).filter((e) => e.kind === 'workout-done')[0];
assert.ok(be && be.data.mins === 0);
n++; console.log('ok an inverted clock reports 0 minutes');
console.log(n + ' active time tests passed');
