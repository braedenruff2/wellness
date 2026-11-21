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

t('collect: every part, oldest first, unique ids', () => {
  const ev = A.collect(states(), {}, now);
  const kinds = ev.map((e) => e.part + '/' + e.kind);
  for (const k of ['faith/day-done', 'faith/guided-prayer', 'faith/awe', 'faith/journal', 'faith/prayer-added', 'faith/prayer-answered', 'calm/session',
    'workout/set', 'workout/workout-done', 'tagalog/lesson', 'tagalog/answer', 'tagalog/review', 'todo/added', 'todo/done', 'coach/graded']) assert.ok(kinds.includes(k), k + ' missing: ' + kinds);
  assert.strictEqual(new Set(ev.map((e) => e.id)).size, ev.length);
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
console.log(n + ' activity tests passed');
