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

t('quickParse: weekday words only match real day names', () => {
  for (const s of ['call friend', 'go to the wedding', 'plan the month', 'fix the sundeck', 'buy satellite dish', 'wash the satin'])
    assert.deepStrictEqual(T.quickParse(s, wed), { text: s, due: null, repeat: null, at: null }, s);
  assert.strictEqual(T.quickParse('x tues', wed).due, '2026-11-24');
  assert.strictEqual(T.quickParse('x thurs', wed).due, '2026-11-19');
  assert.strictEqual(T.quickParse('x this friday', wed).due, '2026-11-20');
});

t('quickParse: "every monday" repeats weekly from the next one (today counts)', () => {
  assert.deepStrictEqual(T.quickParse('bins every thursday', wed), { text: 'bins', due: '2026-11-19', repeat: 'weekly', at: null });
  assert.deepStrictEqual(T.quickParse('laundry every wednesday', wed), { text: 'laundry', due: '2026-11-18', repeat: 'weekly', at: null });
  assert.deepStrictEqual(T.quickParse('call Mom every sunday at 7pm', wed), { text: 'call Mom', due: '2026-11-22', repeat: 'weekly', at: '19:00' });
  assert.deepStrictEqual(T.quickParse('call Mom at 7pm every sunday', wed), { text: 'call Mom', due: '2026-11-22', repeat: 'weekly', at: '19:00' });
  assert.strictEqual(T.quickParse('gym every mondays', wed).repeat, 'weekly');
  assert.deepStrictEqual(T.quickParse('recycling every other friday', wed), { text: 'recycling', due: '2026-11-20', repeat: 'biweekly', at: null });
  assert.strictEqual(T.quickParse('x every 2nd tuesday', wed).due, '2026-11-24');
  assert.strictEqual(T.quickParse('x every other week', wed).repeat, 'biweekly', 'still works');
  assert.strictEqual(T.quickParse('rent every month', wed).repeat, 'monthly', '"month" is not Monday');
  const s = T.defaults(), b = T.add(s, 'bins every thursday', null, wed);
  T.complete(s, b.id, new Date(2026, 10, 19, 8));
  assert.strictEqual(b.due, '2026-11-26', 'stays on Thursdays');
});

t('quickParse: "in 3 days", "next week", "this weekend", month names', () => {
  assert.deepStrictEqual(T.quickParse('water plants in 3 days', wed), { text: 'water plants', due: '2026-11-21', repeat: null, at: null });
  assert.strictEqual(T.quickParse('plant in 2 weeks', wed).due, '2026-12-02');
  assert.strictEqual(T.quickParse('x in a week', wed).due, '2026-11-25');
  assert.strictEqual(T.quickParse('x in two days', wed).due, '2026-11-20');
  assert.strictEqual(T.quickParse('x in 0 days', wed).due, null, '0 is left as text');
  assert.strictEqual(T.quickParse('x in 900 days', wed).due, null, 'more than a year is left as text');
  assert.strictEqual(T.quickParse('dentist next week', wed).due, '2026-11-23', 'next Monday');
  assert.strictEqual(T.quickParse('dentist next week', new Date(2026, 10, 22, 9)).due, '2026-11-23', 'from Sunday: the next day');
  assert.strictEqual(T.quickParse('dentist next week', new Date(2026, 10, 23, 9)).due, '2026-11-30', 'from Monday: a week on');
  assert.strictEqual(T.quickParse('garage this weekend', wed).due, '2026-11-21');
  assert.strictEqual(T.quickParse('garage on the weekend', new Date(2026, 10, 22, 9)).due, '2026-11-22', 'on a Sunday: today');
  assert.strictEqual(T.quickParse('plan weekend', wed).due, null, 'a bare "weekend" is part of the task');
  assert.deepStrictEqual(T.quickParse('pay rent dec 1', wed), { text: 'pay rent', due: '2026-12-01', repeat: null, at: null });
  assert.strictEqual(T.quickParse('party 3 december', wed).due, '2026-12-03');
  assert.strictEqual(T.quickParse('book flights jan 15th', wed).due, '2027-01-15', 'a past month means next year');
  assert.strictEqual(T.quickParse('x the 24th of december', wed).due, '2026-12-24');
  assert.strictEqual(T.quickParse('x on Sept 2', wed).due, '2027-09-02');
  assert.strictEqual(T.quickParse('x feb 30', wed).due, null, 'impossible date is left as text');
  assert.strictEqual(T.quickParse('chapter 3', wed).due, null);
  assert.deepStrictEqual(T.quickParse('call at 3pm next week', wed), { text: 'call', due: '2026-11-23', repeat: null, at: '15:00' });
  assert.strictEqual(T.quickParse('next week', wed).text, 'next week', 'a lone phrase stays the task');
});

t('quickParse: "tonight at 7" is 7 pm; a stated am or a 24-hour time is kept', () => {
  const at = (s) => T.quickParse(s, wed).at;
  assert.strictEqual(at('dinner tonight at 7'), '19:00');
  assert.strictEqual(at('call at 8 tonight'), '20:00');
  assert.strictEqual(at('bath at 7:30 tonight'), '19:30');
  assert.deepStrictEqual(T.quickParse('x this evening at 6', wed), { text: 'x', due: '2026-11-18', repeat: null, at: '18:00' });
  assert.strictEqual(at('meds tonight at 9am'), '09:00');
  assert.strictEqual(at('x tonight at 07:00'), '07:00');
  assert.strictEqual(at('x tonight at 22:00'), '22:00');
  assert.strictEqual(at('x today at 7'), '07:00', 'only tonight / this evening move it');
  assert.strictEqual(at('x at 7'), '07:00');
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
  assert.strictEqual(T.alarmLines([], []), '#open\t', 'nothing open: still said, so a snoozed reminder stops');
  assert.strictEqual(T.alarmLines([]), '', 'no list given: no line (as before)');
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

t('applyTicked: "Done" on a notification ticks a one-off once, a repeating task only for its current day', () => {
  const s = T.defaults(), a = T.add(s, 'bins fri at 7pm', null, wed), r = T.add(s, 'stretch every day at 7am', null, wed);
  const fri7 = new Date(2026, 10, 20, 19, 1).getTime();
  let got = T.applyTicked(s, fri7 + '\t' + a.id + '\nnope\n\tx\n' + fri7 + '\tmissing-id');
  assert.deepStrictEqual(got.map((t) => t.id), [a.id]);
  assert.strictEqual(new Date(a.done).getTime(), fri7, 'done at the moment it was tapped');
  assert.deepStrictEqual(T.applyTicked(s, (fri7 + 5) + '\t' + a.id), [], 'already done: once only');
  const thu7 = new Date(2026, 10, 19, 7, 0).getTime(), due0 = r.due;
  got = T.applyTicked(s, thu7 + '\t' + r.id);
  assert.strictEqual(got.length, 1); assert.ok(r.due > due0, 'repeating task moved on: ' + due0 + ' -> ' + r.due);
  const before = r.due;
  assert.deepStrictEqual(T.applyTicked(s, thu7 + '\t' + r.id), [], 'the same tap again (or ticked in the app first) does nothing');
  assert.strictEqual(r.due, before);
  assert.deepStrictEqual(T.applyTicked(s, ''), []); assert.deepStrictEqual(T.applyTicked(s, null), []);
});

t('validate keeps good tasks, drops junk and markup-y fields', () => {
  const v = T.validate({ tasks: [{ id: 'a', text: 'ok', due: '2026-11-18', repeat: 'daily', at: '07:30' }, { text: '' }, null, { text: 'x', due: '<b>', repeat: 'hourly', done: 'nope', at: '7pm' }] });
  assert.strictEqual(v.tasks.length, 2); assert.strictEqual(v.tasks[1].due, null); assert.strictEqual(v.tasks[1].repeat, null); assert.strictEqual(v.tasks[1].done, null);
  assert.strictEqual(v.tasks[0].at, '07:30'); assert.strictEqual(v.tasks[1].at, null);
  assert.strictEqual(T.validate({}), null);
});

t('a weekdays task never starts on a weekend', () => {
  const s = T.defaults(), sat = new Date(2026, 10, 21, 6);
  const x = T.add(s, 'stretch every weekday at 7am', null, sat);
  assert.strictEqual(x.due, '2026-11-23', 'Saturday -> Monday');
  assert.ok(T.reminders(s, sat).every((r) => !/@2026-11-2[12]$/.test(r.id)), 'no weekend reminder');
  assert.strictEqual(T.add(s, 'plan every weekday', null, wed).due, '2026-11-18', 'a weekday stays');
  assert.strictEqual(T.firstDue({ repeat: 'weekdays', due: '2026-11-22' }), '2026-11-23');
  assert.strictEqual(T.firstDue({ repeat: 'daily', due: '2026-11-22' }), '2026-11-22');
});
t('openTimed: a repeating task ticked for today is no longer "open" (its snooze stops)', () => {
  const s = T.defaults(), x = T.add(s, 'meds every day at 8am', null, wed);
  assert.deepStrictEqual(T.openTimed(s, wed), [x.id]);
  T.complete(s, x.id, new Date(2026, 10, 18, 8, 20));
  assert.deepStrictEqual(T.openTimed(s, new Date(2026, 10, 18, 8, 21)), [], 'moved to tomorrow');
  assert.deepStrictEqual(T.openTimed(s, new Date(2026, 10, 19, 7)), [x.id], 'tomorrow it is open again');
});
t('Done on yesterday\'s reminder of a daily task (already ticked in the app) does not tick today\'s', () => {
  const s = T.defaults(), x = T.add(s, 'meds every day at 8am', null, new Date(2026, 10, 18, 7));
  T.complete(s, x.id, new Date(2026, 10, 18, 8, 10)); // ticked in the app yesterday: now due the 19th
  const tap = new Date(2026, 10, 19, 7, 30).getTime();
  assert.strictEqual(T.applyTicked(s, tap + '\t' + x.id + '\t2026-11-18').length, 0, 'yesterday\'s notification');
  assert.strictEqual(T.applyTicked(s, tap + '\t' + x.id + '\t2026-11-19').length, 1, 'today\'s notification ticks today');
});
t('times: "at 2:30" is afternoon like "at 2"; "at 02:30" stays night', () => {
  assert.strictEqual(T.quickParse('nap at 2:30', wed).at, '14:30');
  assert.strictEqual(T.quickParse('nap at 3.15', wed).at, '15:15');
  assert.strictEqual(T.quickParse('feed at 02:30', wed).at, '02:30');
  assert.strictEqual(T.quickParse('meds at 2', wed).at, '14:00');
});

t('Done on a reminder after midnight: the next date counts from the day it rang for', () => {
  const s = T.defaults();
  const m = T.add(s, 'meds every day at 11pm', { due: '2026-11-16' }, new Date(2026, 10, 16, 9));
  T.applyTicked(s, new Date(2026, 10, 17, 0, 15).getTime() + '\t' + m.id + '\t2026-11-16');
  assert.strictEqual(m.due, '2026-11-17', 'Tuesday still due (was moved to Wednesday)');
});

t('a daily reminder left unticked for weeks keeps ringing', () => {
  const s = T.defaults();
  T.add(s, 'vitamins every day at 9pm', { due: '2026-10-01' }, new Date(2026, 9, 1, 9));
  const r = T.reminders(s, new Date(2026, 10, 20, 12), 8);
  assert.ok(r.length >= 8, r.length + ' reminders (was 0 after ~45 days)');
  assert.ok(r[0].id.endsWith('@2026-11-20'), r[0].id);
});
t('every 2 weeks and every month (the 31st -> last day of shorter months, then the 31st again; Feb 29)', () => {
  assert.strictEqual(T.quickParse('pay rent every month', wed).repeat, 'monthly');
  assert.strictEqual(T.quickParse('recycling every 2 weeks', wed).repeat, 'biweekly');
  assert.strictEqual(T.quickParse('recycling every other week', wed).repeat, 'biweekly');
  const s = T.defaults();
  const b = T.add(s, 'recycling every 2 weeks', null, wed);
  T.complete(s, b.id, wed); assert.strictEqual(b.due, '2026-12-02');
  const m = T.add(s, 'bill', { due: '2027-01-31', repeat: 'monthly' }, new Date(2027, 0, 5));
  assert.strictEqual(m.mday, 31);
  const seq = [];
  for (let i = 0; i < 4; i++) { T.complete(s, m.id, new Date(m.due.slice(0, 4), +m.due.slice(5, 7) - 1, +m.due.slice(8), 12)); seq.push(m.due); }
  assert.deepStrictEqual(seq, ['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
  const leap = T.add(s, 'x', { due: '2028-01-30', repeat: 'monthly' }, new Date(2028, 0, 2));
  T.complete(s, leap.id, new Date(2028, 0, 30, 12)); assert.strictEqual(leap.due, '2028-02-29');
  // ticked late (3 months behind): next one is after today
  const late = T.add(s, 'y', { due: '2026-08-15', repeat: 'monthly' }, new Date(2026, 7, 1));
  T.complete(s, late.id, wed); assert.strictEqual(late.due, '2026-12-15');
  const v = T.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.tasks.find((x) => x.id === m.id).mday, 31); assert.strictEqual(v.tasks.find((x) => x.id === m.id).repeat, 'monthly');
  // reminders walk monthly too
  const r = T.defaults(); T.add(r, 'pay at 9am', { due: '2026-11-30', repeat: 'monthly' }, wed);
  assert.ok(T.reminders(r, wed, 45).some((x) => x.id.endsWith('@2026-12-30')));
});
t('every 2 months / every 3 months / every year (month ends and Feb 29 like monthly)', () => {
  const q = (x) => T.quickParse(x, wed);
  assert.deepStrictEqual([q('haircut every 2 months').repeat, q('haircut every two months').repeat, q('haircut every other month').repeat, q('x bimonthly').repeat], ['month2', 'month2', 'month2', 'month2']);
  assert.deepStrictEqual([q('furnace filter every 3 months').repeat, q('taxes quarterly').repeat], ['month3', 'month3']);
  assert.deepStrictEqual([q('car insurance every year').repeat, q('x yearly').repeat, q('x annually').repeat], ['yearly', 'yearly', 'yearly']);
  assert.strictEqual(q('furnace filter every 3 months').text, 'furnace filter');
  assert.strictEqual(q('rent every month').repeat, 'monthly', 'monthly unchanged');
  const s = T.defaults();
  const two = T.add(s, 'b', { due: '2026-12-31', repeat: 'month2' }, wed);
  const seq = [];
  for (let i = 0; i < 4; i++) { T.complete(s, two.id, new Date(two.due.slice(0, 4), +two.due.slice(5, 7) - 1, +two.due.slice(8), 12)); seq.push(two.due); }
  assert.deepStrictEqual(seq, ['2027-02-28', '2027-04-30', '2027-06-30', '2027-08-31'], 'the 31st, every 2 months, across a year end');
  const three = T.add(s, 'c', { due: '2026-11-30', repeat: 'month3' }, wed);
  T.complete(s, three.id, new Date(2026, 10, 30, 12)); assert.strictEqual(three.due, '2027-02-28');
  T.complete(s, three.id, new Date(2027, 1, 28, 12)); assert.strictEqual(three.due, '2027-05-30', 'back to the 30th');
  const y = T.add(s, 'leap', { due: '2028-02-29', repeat: 'yearly' }, new Date(2028, 0, 2));
  const ys = [];
  for (let i = 0; i < 4; i++) { T.complete(s, y.id, new Date(y.due.slice(0, 4), +y.due.slice(5, 7) - 1, +y.due.slice(8), 12)); ys.push(y.due); }
  assert.deepStrictEqual(ys, ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'], 'Feb 29 yearly');
  const late = T.add(s, 'late', { due: '2025-06-10', repeat: 'yearly' }, new Date(2025, 5, 1));
  T.complete(s, late.id, wed); assert.strictEqual(late.due, '2027-06-10', 'ticked late: next one after today');
  const added = T.add(s, 'filter every 3 months', null, wed);
  assert.strictEqual(added.mday, 18); assert.strictEqual(added.due, '2026-11-18');
  const v = T.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(['month2', 'month3', 'yearly'].map((r) => v.tasks.filter((x) => x.repeat === r).length > 0), [true, true, true]);
  assert.strictEqual(v.tasks.find((x) => x.id === y.id).mday, 29);
  const r = T.defaults(); T.add(r, 'pay at 9am', { due: '2026-11-20', repeat: 'yearly' }, wed);
  const rem = T.reminders(r, wed, 400).map((x) => x.id.split('@')[1]);
  assert.ok(rem.includes('2026-11-20') && rem.includes('2027-11-20') && rem.length === 2, rem.join(','));
});
t('doneInLast: bounded at now so an earlier-day window ignores later completions', () => {
  const s = T.defaults();
  const a = T.add(s, 'a', null, new Date(2026, 10, 15, 9));
  const b = T.add(s, 'b', null, new Date(2026, 10, 18, 9));
  const c = T.add(s, 'c', null, new Date(2026, 10, 21, 9));
  T.complete(s, a.id, new Date(2026, 10, 15, 10));
  T.complete(s, b.id, new Date(2026, 10, 18, 10));
  T.complete(s, c.id, new Date(2026, 10, 21, 10));
  assert.strictEqual(T.doneInLast(s, 7, new Date(2026, 10, 18, 12)), 2);
  assert.strictEqual(T.doneInLast(s, 7, new Date(2026, 10, 21, 12)), 3);
});
console.log(n + ' to-do unit tests passed');
