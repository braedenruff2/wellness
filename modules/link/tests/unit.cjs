/* Activity log tests (app/www/lib/activity.js): events from every part's saved data. node modules/link/tests/unit.cjs */
'use strict';
const assert = require('assert');
const A = require('../../../app/www/lib/activity.js');
const FC = require('../../../app/www/modules/faith/core.js');
const CK = require('../../../app/www/modules/calm/calm-core.js');
const WK = require('../../../app/www/modules/workout/workout-core.js');
const TG = require('../../../app/www/modules/tagalog/tagalog-core.js');
const TD = require('../../../app/www/modules/todo/todo-core.js');
const CO = require('../../../app/www/modules/coach/coach-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const now = new Date(2026, 10, 19, 20, 0);
const at = (h, m) => new Date(2026, 10, 19, h, m || 0);

function states() {
  const f = FC.defaults();
  FC.finishDay(f, 1, at(7)); FC.finishDay(f, 2, at(7));
  FC.addEntry(f, 'awe', 'The sunrise over the bay', null, at(7, 5));
  FC.setDayJournal(f, 2, 'Grateful for the baby laughing', at(7, 10));
  const p = FC.addPrayer(f, 'For my wife', at(7, 12)); p.answered = at(19).toISOString();
  FC.logSession(f, 'day', 2, 'Day 2: Known', 5.2, at(7, 9));
  const c = CK.defaults(); CK.record(c, 'box', 4, 4, 2, at(8));
  const w = WK.defaults();
  const day = WK.nextDay(w, at(9));
  WK.logSet(w, day, 0, 18, null, at(9, 1)); WK.logSet(w, day, 0, 16, null, at(9, 4)); WK.endSession(w, at(9, 30));
  WK.setSore(w, '2026-11-18', 'A bit', at(8)); WK.setSore(w, '2026-11-18', 'Very', at(8, 5));
  WK.logRest(w, '2026-11-17', 'Busy day', at(10, 20)); WK.logRest(w, '2026-11-18', 'Sore', at(11, 8)); WK.clearRest(w, '2026-11-18');
  const g = TG.defaults();
  const pack = { id: '2026-11-18' }, lesson = { day: 1, words: [{ tl: 'salamat', en: 'thank you' }] };
  TG.finishLesson(g, pack, lesson, at(12));
  TG.recordAnswer(g, pack, lesson, { prompt: 'Thank you', type: 'type' }, false, at(12, 1), 'salamt');
  TG.review(g, 'salamat', true, at(13));
  const d = TD.defaults();
  const task = TD.add(d, 'call Mom', null, at(10)); TD.complete(d, task.id, at(11));
  const rep = TD.add(d, 'stretch every day', null, at(10)); TD.complete(d, rep.id, at(11, 30));
  const co = CO.defaults(); co.child = { name: 'Kid', birth: '2025-11-24' };
  CO.setScenario(co, { title: 'Teething', skill: 'Crying and comfort', scenario: 'S', question: 'Q' }, at(14));
  CO.grade(co, 'I hold her', { score: 7 }, at(14, 5));
  return { 'fc.v1': f, 'wl.calm.v1': c, 'wl.workout.v1': w, 'wl.tagalog.v1': g, 'wl.todo.v1': d, 'wl.coach.v1': co };
}

t('workout target: once a day (3 by default, 2 when he chose it), not before anything is logged, described plainly', () => {
  const W0 = require('../../../app/www/modules/workout/workout-core.js');
  const w = W0.defaults();
  assert.strictEqual(A.collect({ 'wl.workout.v1': w }, {}, now).filter((e) => e.kind === 'target').length, 0, 'nothing logged yet');
  W0.logSet(w, 'A', 0, 10, 10, new Date(2026, 10, 18, 9)); W0.endSession(w, new Date(2026, 10, 18, 10));
  let ev = A.collect({ 'wl.workout.v1': w }, {}, now).filter((e) => e.kind === 'target');
  assert.deepStrictEqual(ev.map((e) => [e.id, e.data.perWeek]), [['workout/target/2026-11-19/3', 3]]);
  w.target = 2;
  ev = A.collect({ 'wl.workout.v1': w }, {}, now).filter((e) => e.kind === 'target');
  assert.deepStrictEqual(ev.map((e) => [e.id, e.data.perWeek]), [['workout/target/2026-11-19/2', 2]]);
  assert.strictEqual(A.describe(ev[0]), 'Move: aiming for 2 workouts a week');
  const next = A.collect({ 'wl.workout.v1': w }, {}, new Date(now.getTime() + 864e5)).filter((e) => e.kind === 'target');
  assert.strictEqual(next[0].id, 'workout/target/2026-11-20/2', 'sent again the next day');
});
t('collect: every part, oldest first, unique ids', () => {
  const ev = A.collect(states(), {}, now);
  const kinds = ev.map((e) => e.part + '/' + e.kind);
  for (const k of ['faith/day-done', 'faith/guided-prayer', 'faith/awe', 'faith/journal', 'faith/prayer-added', 'faith/prayer-answered', 'calm/session',
    'workout/set', 'workout/workout-done', 'tagalog/lesson', 'tagalog/answer', 'tagalog/review', 'todo/added', 'todo/done', 'coach/graded']) assert.ok(kinds.includes(k), k + ' missing: ' + kinds);
  assert.strictEqual(new Set(ev.map((e) => e.id)).size, ev.length);
  const rd = ev.filter((e) => e.kind === 'rest-day'), rx = ev.filter((e) => e.kind === 'rest-removed');
  assert.deepStrictEqual(rd.map((e) => [e.data.date, e.data.why]), [['2026-11-17', 'Busy day']]);
  const so = ev.filter((e) => e.kind === 'sore');
  assert.deepStrictEqual(so.map((e) => e.data.level), ['Very']); assert.ok(/^workout\/sore\/2026-11-18\/e\d+$/.test(so[0].id), so[0].id);
  // the undone one: only its /x goes (the PC drops the rest day it may already have)
  assert.strictEqual(rx.length, 1); assert.ok(/^workout\/rest\/2026-11-18\/.+\/x$/.test(rx[0].id), rx[0].id);
  assert.strictEqual(A.describe ? A.describe(rd[0]).indexOf('Move: rest day (') : 0, 0);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].at <= ev[i].at, 'sorted');
  assert.strictEqual(ev.filter((e) => e.kind === 'set').length, 2);
  assert.deepStrictEqual(ev.find((e) => e.kind === 'session').data, { practice: 'box', mins: 4, before: 4, after: 2 });
  assert.strictEqual(ev.find((e) => e.kind === 'answer').data.given, 'salamt');
  assert.strictEqual(ev.filter((e) => e.part === 'todo' && e.kind === 'done').length, 2, 'a repeating task logs each time it is done');
  assert.strictEqual(ev.filter((e) => e.part === 'todo' && e.kind === 'added').length, 2, 'the repeat copies are not "added" again');
  assert.strictEqual(ev.find((e) => e.kind === 'graded').data.score, 7);
});

t('journal and prayer text only when he turns it on (and then with new ids)', () => {
  const s = states();
  const off = A.collect(s, {}, now), on = A.collect(s, { journalText: true }, now);
  const txt = (ev) => JSON.stringify(ev.filter((e) => e.part === 'faith'));
  assert.ok(!txt(off).includes('sunrise') && !txt(off).includes('Grateful') && !txt(off).includes('my wife'));
  assert.ok(txt(on).includes('sunrise') && txt(on).includes('Grateful') && txt(on).includes('my wife'));
  assert.strictEqual(off.find((e) => e.kind === 'awe').data.chars, 'The sunrise over the bay'.length);
  const offIds = new Set(off.map((e) => e.id));
  assert.ok(on.filter((e) => e.part === 'faith' && /^(journal|awe|gratitude|prayer-added|prayer-answered)$/.test(e.kind)).every((e) => !offIds.has(e.id)), 'resent with text');
  assert.ok(on.filter((e) => e.kind === 'day-done').every((e) => offIds.has(e.id)), 'other events keep their ids');
});

t('unsent / markSent; old ids are forgotten', () => {
  const ev = A.collect(states(), {}, now), sent = {};
  assert.strictEqual(A.unsent(ev, sent).length, ev.length);
  A.markSent(sent, ev.slice(0, 5));
  assert.strictEqual(A.unsent(ev, sent).length, ev.length - 5);
  sent['old/one'] = 1;
  A.markSent(sent, [], ev);
  assert.ok(!sent['old/one'] && Object.keys(sent).length === 5);
});

t('only the last 60 days, nothing from the future, odd data never breaks it', () => {
  const s = states();
  CK.record(s['wl.calm.v1'], 'box', 3, null, null, new Date(2026, 7, 1));
  CK.record(s['wl.calm.v1'], 'box', 3, null, null, new Date(2027, 0, 1));
  s['wl.workout.v1'].sessions.push(null, { id: 'x', sets: [null, { at: 'garbage' }] });
  s['wl.todo.v1'] = { tasks: 'not a list' };
  s['fc.v1'].journal.push({ id: 'z', at: 'nope', text: 'x' });
  const ev = A.collect(s, {}, now);
  assert.strictEqual(ev.filter((e) => e.kind === 'session' && e.part === 'calm').length, 1);
  assert.ok(ev.length > 10);
  assert.deepStrictEqual(A.collect({}, {}, now), []);
});

t('describe: one readable line for each kind', () => {
  const ev = A.collect(states(), { journalText: true }, now);
  for (const e of ev) { const d = A.describe(e); assert.ok(d && !/undefined|null|\[object/.test(d), e.kind + ': ' + d); }
  assert.strictEqual(A.describe(ev.find((e) => e.kind === 'set')), 'Move: ' + ev.find((e) => e.kind === 'set').data.ex + ' set 1: 18');
  assert.ok(A.describe(ev.find((e) => e.kind === 'session')).includes('stress 4→2'));
});

t('faith: guided sessions survive a backup round trip; tagalog keeps reviews and typed answers', () => {
  const s = states();
  const back = FC.importData(FC.exportData(s['fc.v1']));
  assert.strictEqual(back.sessions.length, 1);
  assert.strictEqual(back.sessions[0].mins, 5.2);
  const g = TG.validate(JSON.parse(JSON.stringify(s['wl.tagalog.v1'])));
  assert.strictEqual(g.reviews.length, 1);
  assert.strictEqual(g.answers[0].given, 'salamt');
  const bad = TG.validate({ cards: {}, reviews: [{ at: 'x', tl: 'a' }, { at: now.toISOString(), tl: 5 }] });
  assert.strictEqual(bad.reviews.length, 0);
});
t('a calm session rated after it was sent gets a new id (/e<ms>), so the rating reaches the PC', () => {
  const st = states(); const c = st['wl.calm.v1'];
  const id0 = A.collect(st, {}, now).find((e) => e.kind === 'session').id;
  c.sessions[0].rated = new Date(2026, 10, 19, 19, 0).toISOString();
  const id1 = A.collect(st, {}, now).find((e) => e.kind === 'session').id;
  assert.ok(id1 === id0 + '/e' + Date.parse(c.sessions[0].rated), id1);
  assert.strictEqual(CK.validate(c).sessions[0].rated, c.sessions[0].rated, 'kept through a backup');
});
t('faith: days finished earlier in the week stay in activity log with the same ids after walkAgain', () => {
  const f = FC.defaults();
  FC.finishDay(f, 119, new Date(2026, 10, 17, 12));
  FC.finishDay(f, 120, new Date(2026, 10, 18, 12));
  const before = A.collect({ 'fc.v1': f }, {}, now).filter((e) => e.kind === 'day-done');
  assert.deepStrictEqual(before.map((e) => e.id), ['faith/day/1/119', 'faith/day/1/120']);
  FC.walkAgain(f, new Date(2026, 10, 19, 8));
  FC.finishDay(f, 1, new Date(2026, 10, 19, 9));
  f.pastRounds.push(null, { done: null }); // odd entries skipped safely
  const after = A.collect({ 'fc.v1': f }, {}, now).filter((e) => e.kind === 'day-done');
  assert.deepStrictEqual(after.map((e) => e.id), ['faith/day/1/119', 'faith/day/1/120', 'faith/day/2/1']);
  assert.strictEqual(after[0].data.round, 1);
  assert.strictEqual(after[2].data.round, 2);
});
t('check-ins: empty legacy check-in objects without answers or notes are not emitted', () => {
  const me = {
    checkins: {
      '2026-11-18': { at: '2026-11-18T12:00:00.000Z', edited: '2026-11-18T12:05:00.000Z' },
      '2026-11-19': { at: '2026-11-19T12:00:00.000Z', sleep: '6–7 h' }
    },
    feedback: []
  };
  const ev = A.collect({ 'wl.me.v1': me }, {}, now).filter((e) => e.part === 'checkin');
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].id, 'checkin/2026-11-19');
});
t('collect: sorts mixed timezone offsets strictly chronologically (timestamp order, not string order)', () => {
  const fc = FC.defaults();
  // 2026-11-19T10:00:00-04:00 is 14:00Z (AFTER 12:00Z, even though lexicographically smaller)
  fc.journal.push({ id: 'later', at: '2026-11-19T10:00:00-04:00', kind: 'journal', text: 'Afternoon UTC' });
  fc.journal.push({ id: 'earlier', at: '2026-11-19T12:00:00.000Z', kind: 'journal', text: 'Noon UTC' });
  const ev = A.collect({ 'fc.v1': fc }, {}, now).filter((e) => e.part === 'faith' && e.kind === 'journal');
  assert.deepStrictEqual(ev.map((e) => e.id), ['faith/j/earlier', 'faith/j/later']);
});
t('a meditation-path sit carries attention and obstacles (new id when answered later); the Calm aim goes once a day', () => {
  const c = CK.defaults();
  const r = CK.record(c, 'count', 20, null, null, at(6));
  assert.deepStrictEqual(A.collect({ 'wl.calm.v1': c }, {}, now).map((e) => e.kind), ['session'], 'no aim chosen: no aim event');
  const id0 = A.collect({ 'wl.calm.v1': c }, {}, now)[0].id;
  CK.rateSit(r, 2, ['Sleepy']); r.rated = at(6, 30).toISOString();
  c.settings.aim = 'train'; c.settings.stage = 'follow';
  const ev = A.collect({ 'wl.calm.v1': c }, {}, now);
  const s1 = ev.find((e) => e.kind === 'session'), aim = ev.find((e) => e.kind === 'target');
  assert.strictEqual(s1.id, id0 + '/e' + Date.parse(r.rated));
  assert.deepStrictEqual([s1.data.focus, s1.data.hind], [2, ['Sleepy']]);
  assert.deepStrictEqual([aim.id, aim.part, aim.data], ['calm/aim/2026-11-19/train/follow', 'calm', { aim: 'train', stage: 'follow' }]);
  assert.ok(/attention some steady stretches \(Sleepy\)/.test(A.describe(s1)), A.describe(s1));
  assert.ok(/meditation path, stage follow/.test(A.describe(aim)), A.describe(aim));
  c.settings.aim = 'calm';
  assert.deepStrictEqual(A.collect({ 'wl.calm.v1': c }, {}, now).find((e) => e.kind === 'target').data, { aim: 'calm', stage: null });
});
t('workout-done: reports active training minutes (excludes breaks > 90 min, clamps inverted clock, null on bad start)', () => {
  const w = WK.defaults();
  // Normal 29-min workout
  WK.logSet(w, 'A', 0, 12, 10, at(9, 0)); WK.logSet(w, 'A', 0, 12, 10, at(9, 10)); WK.endSession(w, at(9, 29));
  // Split workout with a 5-hour break (10 min morning + 15 min afternoon = 25 min, not 325 min)
  w.sessions.push({
    id: 'split-1', date: '2026-11-18', day: 'B',
    start: new Date(2026, 10, 18, 9, 0).toISOString(),
    end: new Date(2026, 10, 18, 14, 25).toISOString(),
    sets: [
      { i: 0, ex: 'Single Leg RDL', n: 1, val: 10, w: 10, at: new Date(2026, 10, 18, 9, 5).toISOString() },
      { i: 0, ex: 'Single Leg RDL', n: 2, val: 10, w: 10, at: new Date(2026, 10, 18, 9, 10).toISOString() },
      { i: 1, ex: 'Pike Pushups', n: 1, val: 8, w: null, at: new Date(2026, 10, 18, 14, 10).toISOString() },
      { i: 1, ex: 'Pike Pushups', n: 2, val: 8, w: null, at: new Date(2026, 10, 18, 14, 20).toISOString() }
    ]
  });
  // Inverted clock (end before start -> 0) and missing start (-> null)
  w.sessions.push({
    id: 'inv-1', date: '2026-11-17', day: 'C',
    start: new Date(2026, 10, 17, 10, 0).toISOString(),
    end: new Date(2026, 10, 17, 9, 0).toISOString(),
    sets: [{ i: 0, ex: 'Split Squats', n: 1, val: 10, w: 10, at: new Date(2026, 10, 17, 9, 30).toISOString() }]
  });
  w.sessions.push({
    id: 'bad-1', date: '2026-11-16', day: 'A',
    start: '', end: new Date(2026, 10, 16, 10, 0).toISOString(),
    sets: [{ i: 0, ex: 'Pushups', n: 1, val: 10, w: null, at: new Date(2026, 10, 16, 9, 50).toISOString() }]
  });
  const done = A.collect({ 'wl.workout.v1': w }, {}, now).filter((e) => e.kind === 'workout-done');
  const byDay = Object.fromEntries(done.map((e) => [e.id.split('/')[2], e.data.mins]));
  assert.strictEqual(byDay['split-1'], 25, '5-hour break excluded: ' + JSON.stringify(byDay));
  assert.strictEqual(byDay['inv-1'], 0, 'inverted end < start clamped to 0');
  assert.strictEqual(byDay['bad-1'], null, 'missing start stays null');
  assert.strictEqual(done.find((e) => e.text === 'Day A' && e.data.sets === 2).data.mins, 29);
});
t('autopilot notes (wl.notes.v1) and cooking logs (wl.cook.v1) emit activity events with readable descriptions', () => {
  const N = require('../../../app/www/lib/notes.js');
  const CK2 = require('../../../app/www/modules/cook/cook-core.js');
  const ns = N.defaults();
  N.add(ns, 'Add white noise to sits', '#calm/s/count', 'Feature', at(8, 30));
  const cs = CK2.defaults();
  CK2.logMe(cs, { meal: 'dinner', text: 'Baked salmon & spinach', portion: 'Large', tags: ['High protein'] }, at(18, 0));
  CK2.logChild(cs, { meal: 'lunch', offered: 'Soft egg & banana', ate: 'Most of it', note: 'liked banana' }, at(12, 30));
  const ev = A.collect({ 'wl.notes.v1': ns, 'wl.cook.v1': cs }, {}, now);
  assert.deepStrictEqual(ev.map((e) => e.part + '/' + e.kind), ['app/autopilot-note', 'cook/child-meal', 'cook/me-meal']);
  assert.ok(A.describe(ev[0]).includes('Add white noise to sits') && A.describe(ev[0]).includes('#calm/s/count'), A.describe(ev[0]));
  assert.ok(A.describe(ev[1]).includes('Soft egg & banana') && A.describe(ev[1]).includes('Most of it'), A.describe(ev[1]));
  assert.ok(A.describe(ev[2]).includes('Baked salmon & spinach') && A.describe(ev[2]).includes('Large'), A.describe(ev[2]));
  // once the autopilot has read it, the note goes again under a new id with read set (the PC keeps both, the summary marks it)
  assert.strictEqual(ev[0].data.read, null);
  N.markRead(ns, [ns.notes[0].id], '2026-11-27T01:00:00.000Z');
  const e2 = A.collect({ 'wl.notes.v1': ns }, {}, now)[0];
  assert.strictEqual(e2.id, ev[0].id + '/r'); assert.strictEqual(e2.data.read, '2026-11-27T01:00:00.000Z'); assert.strictEqual(e2.data.nid, ns.notes[0].id);
});
t('a "not for me" brought back is sent as removed (fb/<id>/x) so the PC drops the old mark', () => {
  const me = { checkins: {}, feedback: [], unfitted: [{ id: 'calm/notfit/ground/1795', part: 'calm', at: '2026-11-19T10:00:00.000Z' }, { id: 'x', part: 'calm', at: 'bad' }] };
  const ev = A.collect({ 'wl.me.v1': me }, {}, now).filter((e) => /^fb\//.test(e.id));
  assert.deepStrictEqual(ev.map((e) => [e.id, e.kind, e.part]), [['fb/calm/notfit/ground/1795/x', 'not-for-me-removed', 'calm']]);
});
console.log(n + ' activity tests passed');
