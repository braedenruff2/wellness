/* To-do logic tests. node modules/todo/tests/unit.cjs */
'use strict';
const assert = require('assert');
const T = require('../../../app/www/modules/todo/todo-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const wed = new Date(2026, 10, 18, 9); // Wednesday 18 Nov 2026

t('quickParse: dates and repeats at the end of the line', () => {
  assert.deepStrictEqual(T.quickParse('call Mom tomorrow', wed), { text: 'call Mom', due: '2026-11-19', repeat: null, at: null });
  assert.deepStrictEqual(T.quickParse('bins fri', wed), { text: 'bins', due: '2026-11-20', repeat: null, at: null });
  assert.strictEqual(T.quickParse('groceries on Wednesday', wed).due, '2026-11-25', 'same weekday = next week');
  assert.strictEqual(T.quickParse('pay bill 3/12', wed).due, '2026-12-03', 'day/month');
  assert.strictEqual(T.quickParse('renew 10/11', wed).due, '2027-11-10', 'a past date means next year');
  assert.strictEqual(T.quickParse('x 31/2', wed).due, null, 'impossible date is left as text');
  assert.deepStrictEqual(T.quickParse('stretch every day', wed), { text: 'stretch', due: '2026-11-18', repeat: 'daily', at: null });
  assert.strictEqual(T.quickParse('today', wed).text, 'today', 'a lone word stays the task');
  assert.strictEqual(T.quickParse('read Monday notes', wed).due, null, 'only at the end');
});

t('groups: overdue / today / upcoming / any time / done', () => {
  const s = T.defaults();
  T.add(s, 'a', { due: '2026-11-17' }, wed); T.add(s, 'b today', null, wed); T.add(s, 'c sat', null, wed); T.add(s, 'd', null, wed);
  const done = T.add(s, 'e', null, wed); T.complete(s, done.id, wed);
  const g = T.groups(s, wed);
  assert.deepStrictEqual([g.overdue.length, g.today.length, g.upcoming.length, g.someday.length, g.done.length], [1, 1, 1, 1, 1]);
  assert.strictEqual(T.moveOverdueToToday(s, wed), 1);
  assert.strictEqual(T.groups(s, wed).today.length, 2);
});

t('repeating tasks: ticking logs it and moves it on; weekdays skip the weekend', () => {
  const s = T.defaults();
  const d = T.add(s, 'stretch every day', null, wed);
  T.complete(s, d.id, wed);
  assert.strictEqual(d.due, '2026-11-19'); assert.strictEqual(d.done, null);
  assert.strictEqual(T.doneInLast(s, 1, wed), 1);
  const fri = new Date(2026, 10, 20, 9);
  const w = T.add(s, 'walk weekdays', { due: '2026-11-20' }, fri);
  T.complete(s, w.id, fri); assert.strictEqual(w.due, '2026-11-23', 'Fri -> Mon');
  const k = T.add(s, 'bins weekly', { due: '2026-11-04' }, wed);
  T.complete(s, k.id, wed); assert.strictEqual(k.due, '2026-11-25', 'weekly keeps its weekday and lands in the future');
  const late = T.add(s, 'meds every day', { due: '2026-11-10' }, wed);
  T.complete(s, late.id, wed); assert.strictEqual(late.due, '2026-11-19', 'a long-missed daily task comes back tomorrow, not in the past');
});

t('tidy drops done tasks after 30 days; doneInLast counts by local date', () => {
  const s = T.defaults();
  const a = T.add(s, 'old', null, wed); T.complete(s, a.id, new Date(2026, 9, 1));
  const b = T.add(s, 'new', null, wed); T.complete(s, b.id, new Date(2026, 10, 17, 23, 30));
  T.tidy(s, wed);
  assert.deepStrictEqual(s.tasks.map((x) => x.text), ['new']);
  assert.strictEqual(T.doneInLast(s, 2, wed), 1);
  assert.strictEqual(T.doneInLast(s, 1, wed), 0);
});

t('advice is kind and only when useful', () => {
  const s = T.defaults();
  assert.ok(/Nothing on the list/.test(T.advice(s, wed)));
  for (let i = 0; i < 3; i++) T.add(s, 'x' + i, { due: '2026-11-1' + i }, wed);
  assert.ok(/slipped/.test(T.advice(s, wed)));
});

t('quickParse: a time at the end sets a reminder', () => {
  const q = (x) => { const r = T.quickParse(x, wed); return [r.text, r.due, r.at, r.repeat]; };
  assert.deepStrictEqual(q('call Mom tomorrow at 3pm'), ['call Mom', '2026-11-19', '15:00', null]);
  assert.deepStrictEqual(q('call Mom at 3pm tomorrow'), ['call Mom', '2026-11-19', '15:00', null], 'time before the date');
  assert.deepStrictEqual(q('meds 8:30 pm'), ['meds', '2026-11-18', '20:30', null], 'no date: today');
  assert.deepStrictEqual(q('bins at 7am'), ['bins', '2026-11-19', '07:00', null], 'already past today (it is 9 am): tomorrow');
  assert.deepStrictEqual(q('nap check at 2'), ['nap check', '2026-11-18', '14:00', null], '1-6 without am/pm = afternoon');
  assert.deepStrictEqual(q('lunch at noon'), ['lunch', '2026-11-18', '12:00', null]);
  assert.deepStrictEqual(q('call at 17:45'), ['call', '2026-11-18', '17:45', null]);
  assert.deepStrictEqual(q('midnight feed 12am'), ['midnight feed', '2026-11-19', '00:00', null]);
  assert.deepStrictEqual(q('stretch every day at 7am'), ['stretch', '2026-11-18', '07:00', 'daily']);
  assert.deepStrictEqual(q('stretch at 7am every day'), ['stretch', '2026-11-18', '07:00', 'daily']);
  assert.deepStrictEqual(q('bins fri at 6.30pm'), ['bins', '2026-11-20', '18:30', null]);
  assert.strictEqual(T.quickParse('buy 2 apples', wed).at, null, 'a plain number is not a time');
  assert.strictEqual(T.quickParse('x at 25', wed).at, null);
  assert.strictEqual(T.quickParse('x 13pm', wed).at, null);
  assert.strictEqual(T.quickParse('x at 9:75', wed).at, null);
  assert.deepStrictEqual(q('at 3pm'), ['at 3pm', null, null, null], 'a lone time stays the task');
});

t('reminders: open tasks with a time, soonest first, repeats expanded', () => {
  const s = T.defaults();
  const a = T.add(s, 'call Mom tomorrow at 3pm', null, wed);
  T.add(s, 'no time tomorrow', null, wed);
  const st = T.add(s, 'stretch every day at 7am', null, wed);
  const r = T.reminders(s, wed, 3);
  // stretch today 7am has passed (it's 9am): Thu, Fri, Sat 7am, + Mom Thu 3pm
  assert.deepStrictEqual(r.map((x) => x.text + ' ' + new Date(x.when).getDate() + ' ' + new Date(x.when).getHours()),
    ['stretch 19 7', 'call Mom 19 15', 'stretch 20 7', 'stretch 21 7']);
  assert.ok(r.every((x, i) => !i || r[i - 1].when <= x.when));
  assert.strictEqual(new Set(r.map((x) => x.id)).size, r.length, 'each occurrence has its own id');
  T.complete(s, a.id, wed);
  assert.ok(!T.reminders(s, wed, 3).some((x) => x.text === 'call Mom'), 'done: no reminder');
  T.complete(s, st.id, wed); // ticking today's stretch moves it to tomorrow; the done copy has no reminder
  assert.strictEqual(T.reminders(s, wed, 3).filter((x) => x.text === 'stretch').length, 3);
  const wk = T.defaults(); T.add(wk, 'walk weekdays', { at: '10:00' }, wed);
  const days = T.reminders(wk, wed, 7).map((x) => new Date(x.when).getDay());
  assert.ok(days.length === 6 && !days.includes(0) && !days.includes(6), 'weekdays only: ' + days);
});

t('alarmLines: one tab-separated line each, no tabs or newlines inside', () => {
  const l = T.alarmLines([{ id: 'a\tb', when: 5, text: 'x\ny\tz' }, { id: 'c', when: 6, text: 'w' }]).split('\n');
  assert.deepStrictEqual(l, ['5\ta b\tx y z', '6\tc\tw']);
  assert.strictEqual(T.alarmLines([]), '');
  assert.deepStrictEqual(['07:00', '12:00', '00:05', '15:30'].map(T.fmtTime), ['7 am', '12 pm', '12:05 am', '3:30 pm']);
});

t('alarmLines: "#open" names open tasks with a time (Android keeps a snoozed reminder only for those)', () => {
  const s = T.defaults();
  const a = T.add(s, 'bins fri at 7pm', null, wed), b = T.add(s, 'call Mom', null, wed), c = T.add(s, 'meds every day at 8am', null, wed);
  T.add(s, 'old 9am', { due: '2026-11-10' }, wed); // overdue with a time: still open, still snoozable
  T.complete(s, a.id, wed);
  assert.deepStrictEqual(T.openTimed(s).length, 2); assert.ok(T.openTimed(s).includes(c.id) && !T.openTimed(s).includes(b.id));
  const l = T.alarmLines(T.reminders(s, wed), T.openTimed(s)).split('\n');
  assert.ok(/^#open\t[^,\t]+,[^,\t]+$/.test(l[l.length - 1]), l[l.length - 1]);
  assert.ok(l.slice(0, -1).every((x) => /^\d+\t/.test(x)), 'every other line is a reminder');
  assert.strictEqual(T.alarmLines([], []), '', 'nothing open: nothing sent');
  assert.strictEqual(T.alarmLines([], ['a,b']), '#open\ta b', 'commas in ids cannot split the list');
});

t('remindIn: an hour from now, rounded up to 5 minutes; tomorrow late at night; never for repeating tasks', () => {
  const s = T.defaults(), x = T.add(s, 'call back', null, wed);
  T.remindIn(s, x.id, 60, new Date(2026, 10, 18, 14, 2, 30));
  assert.deepStrictEqual([x.due, x.at], ['2026-11-18', '15:05']);
  T.remindIn(s, x.id, 60, new Date(2026, 10, 18, 14, 10));
  assert.strictEqual(x.at, '15:10', 'already on 5: unchanged');
  T.remindIn(s, x.id, 60, new Date(2026, 10, 18, 23, 58));
  assert.deepStrictEqual([x.due, x.at], ['2026-11-19', '01:00'], 'past midnight: tomorrow');
  T.remindIn(s, x.id, 60, new Date(2026, 11, 31, 23, 30));
  assert.deepStrictEqual([x.due, x.at], ['2027-01-01', '00:30'], 'new year');
  const r = T.add(s, 'stretch every day at 7am', null, wed);
  assert.strictEqual(T.remindIn(s, r.id, 60, wed), null); assert.strictEqual(r.at, '07:00');
  T.complete(s, x.id, wed); assert.strictEqual(T.remindIn(s, x.id, 60, wed), null, 'done: nothing');
  assert.strictEqual(T.remindIn(s, 'nope', 60, wed), null);
});

t('validate keeps good tasks, drops junk and markup-y fields', () => {
  const v = T.validate({ tasks: [{ id: 'a', text: 'ok', due: '2026-11-18', repeat: 'daily', at: '07:30' }, { text: '' }, null, { text: 'x', due: '<b>', repeat: 'hourly', done: 'nope', at: '7pm' }] });
  assert.strictEqual(v.tasks.length, 2); assert.strictEqual(v.tasks[1].due, null); assert.strictEqual(v.tasks[1].repeat, null); assert.strictEqual(v.tasks[1].done, null);
  assert.strictEqual(v.tasks[0].at, '07:30'); assert.strictEqual(v.tasks[1].at, null);
  assert.strictEqual(T.validate({}), null);
});

console.log(n + ' to-do unit tests passed');
