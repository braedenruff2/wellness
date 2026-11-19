/* To-do logic tests. node modules/todo/tests/unit.cjs */
'use strict';
const assert = require('assert');
const T = require('../../../app/www/modules/todo/todo-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const wed = new Date(2026, 10, 18, 9); // Wednesday 18 Nov 2026

t('quickParse: dates and repeats at the end of the line', () => {
  assert.deepStrictEqual(T.quickParse('call Mom tomorrow', wed), { text: 'call Mom', due: '2026-11-19', repeat: null });
  assert.deepStrictEqual(T.quickParse('bins fri', wed), { text: 'bins', due: '2026-11-20', repeat: null });
  assert.strictEqual(T.quickParse('groceries on Wednesday', wed).due, '2026-11-25', 'same weekday = next week');
  assert.strictEqual(T.quickParse('pay bill 3/12', wed).due, '2026-12-03', 'day/month');
  assert.strictEqual(T.quickParse('renew 10/11', wed).due, '2027-11-10', 'a past date means next year');
  assert.strictEqual(T.quickParse('x 31/2', wed).due, null, 'impossible date is left as text');
  assert.deepStrictEqual(T.quickParse('stretch every day', wed), { text: 'stretch', due: '2026-11-18', repeat: 'daily' });
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

t('validate keeps good tasks, drops junk and markup-y fields', () => {
  const v = T.validate({ tasks: [{ id: 'a', text: 'ok', due: '2026-11-18', repeat: 'daily' }, { text: '' }, null, { text: 'x', due: '<b>', repeat: 'hourly', done: 'nope' }] });
  assert.strictEqual(v.tasks.length, 2); assert.strictEqual(v.tasks[1].due, null); assert.strictEqual(v.tasks[1].repeat, null); assert.strictEqual(v.tasks[1].done, null);
  assert.strictEqual(T.validate({}), null);
});

console.log(n + ' to-do unit tests passed');
