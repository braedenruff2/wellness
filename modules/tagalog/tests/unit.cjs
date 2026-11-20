/* Tagalog logic + every pack's format. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const T = require('../../../app/www/modules/tagalog/tagalog-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const DIR = path.join(__dirname, '..', 'packs');
const packs = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

t('every pack passes the format check (7 lessons, answers in options, build words match)', () => {
  assert.ok(packs.length >= 1);
  for (const p of packs) { assert.deepStrictEqual(T.checkPack(p), [], p.id); assert.strictEqual(p.lessons.length, 7, p.id); }
  const bad = JSON.parse(JSON.stringify(packs[0])); bad.lessons[0].exercises[0].answer = 'nope'; bad.lessons[1].exercises[2].words.pop();
  const e = T.checkPack(bad); assert.ok(e.some((x) => /options must include/.test(x)) && e.some((x) => /build words/.test(x)), e.join('\n'));
});
t('packs are listed in index.json and bundled (build-packs --check)', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  assert.deepStrictEqual(idx.packs, packs.map((p) => p.id));
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-packs.cjs'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});
t('answer checking is forgiving about case, punctuation, ho/po', () => {
  const ex = { type: 'type', answer: 'Salamat po', accept: ['maraming salamat po'] };
  for (const g of ['salamat po', 'Salamat po!', '  SALAMAT   PO.', 'salamat ho', 'Maraming salamat po']) assert.ok(T.check(ex, g), g);
  for (const g of ['', 'salamat', 'salamat po po']) assert.ok(!T.check(ex, g), g);
});
t('next lesson walks through packs in order, never skipping', () => {
  const s = T.defaults();
  assert.strictEqual(T.nextLesson(s, packs).lesson.day, 1);
  T.finishLesson(s, packs[0], packs[0].lessons[1], new Date(2026, 10, 18));
  assert.strictEqual(T.nextLesson(s, packs).lesson.day, 1, 'lesson 1 still first');
  for (const l of packs[0].lessons) T.finishLesson(s, packs[0], l, new Date(2026, 10, 18));
  assert.strictEqual(T.nextLesson(s, [packs[0]]), null);
});
t('spaced review: words due tomorrow, right moves up, wrong resets', () => {
  const s = T.defaults(), d = new Date(2026, 10, 18, 9);
  T.finishLesson(s, packs[0], packs[0].lessons[0], d);
  assert.strictEqual(T.dueCards(s, d).length, 0);
  const tomorrow = new Date(2026, 10, 19, 9), due = T.dueCards(s, tomorrow);
  assert.strictEqual(due.length, packs[0].lessons[0].words.length);
  const c = T.review(s, 'opo', true, tomorrow); assert.strictEqual(c.box, 2); assert.strictEqual(c.due, '2026-11-21');
  T.review(s, 'opo', false, tomorrow); assert.strictEqual(s.cards.opo.box, 1); assert.strictEqual(s.cards.opo.due, '2026-11-20');
  assert.deepStrictEqual(T.weakWords(s, 3), ['opo']);
  for (let i = 0; i < 10; i++) T.review(s, 'po', true, tomorrow);
  assert.strictEqual(s.cards.po.box, T.INTERVALS.length - 1, 'box is capped');
});
t('two-way review: a word recognised once is asked English first; a miss goes back to meaning first', () => {
  const s = T.defaults(), d = new Date(2026, 10, 18, 9), d2 = new Date(2026, 10, 19, 9), d4 = new Date(2026, 10, 21, 9);
  T.finishLesson(s, packs[0], packs[0].lessons[0], d);
  assert.strictEqual(T.direction(s.cards.opo), 'meaning');
  T.review(s, 'opo', true, d2);
  assert.strictEqual(T.direction(s.cards.opo), 'say');
  T.review(s, 'opo', false, d4);
  assert.strictEqual(T.direction(s.cards.opo), 'meaning');
  assert.deepStrictEqual(s.reviews.map((r) => r.dir), ['meaning', 'say'], 'each review records the way it was asked');
  const v = T.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(v.reviews.map((r) => r.dir), ['meaning', 'say'], 'kept through backup/restore');
  assert.strictEqual(T.validate({ cards: {}, reviews: [{ at: d.toISOString(), tl: 'x', right: true, dir: '<b>' }] }).reviews[0].dir, 'meaning');
});
t('practiceSet: exercises from finished lessons only, most-missed first, then least recently answered', () => {
  const s = T.defaults(), d = new Date(2026, 10, 18, 9), p = packs[0], l1 = p.lessons[0], l2 = p.lessons[1];
  assert.deepStrictEqual(T.practiceSet(s, packs, 8), [], 'nothing done: nothing to practise');
  T.finishLesson(s, p, l1, d); T.finishLesson(s, p, l2, d);
  l1.exercises.forEach((ex, i) => T.recordAnswer(s, p, l1, ex, i !== 2, new Date(2026, 10, 18, 9, i)));
  T.recordAnswer(s, p, l1, l1.exercises[2], false, new Date(2026, 10, 18, 10));
  T.recordAnswer(s, p, l2, l2.exercises[1], false, new Date(2026, 10, 18, 10));
  const set = T.practiceSet(s, packs, 8);
  assert.strictEqual(set.length, Math.min(8, l1.exercises.length + l2.exercises.length));
  assert.strictEqual(set[0].ex, l1.exercises[2], 'missed twice first');
  assert.strictEqual(set[1].ex, l2.exercises[1], 'missed once next');
  assert.ok(set.every((x) => x.lesson === l1 || x.lesson === l2), 'only finished lessons');
  assert.strictEqual(set[2].lesson, l2, 'never-answered before answered: ' + set[2].ex.prompt);
  assert.strictEqual(T.practiceSet(s, packs, 3).length, 3);
});
t('stats, advice and the weekly summary for the Wednesday run', () => {
  const s = T.defaults(), d = new Date(2026, 10, 18, 9);
  assert.ok(/lesson 1/.test(T.advice(s, packs, d)));
  const l = packs[0].lessons[0];
  T.recordAnswer(s, packs[0], l, l.exercises[0], false, d); T.recordAnswer(s, packs[0], l, l.exercises[1], true, d);
  T.finishLesson(s, packs[0], l, d);
  const st = T.stats(s, d);
  assert.strictEqual(st.weekLessons, 1); assert.strictEqual(st.weekAccuracy, 0.5); assert.strictEqual(st.weekDays, 1);
  const sum = T.weeklySummary(s, packs, d);
  assert.strictEqual(sum.app, 'wellness-tagalog-summary'); assert.deepStrictEqual(sum.missed, ["What does 'opo' mean?"]);
  assert.ok(sum.lessonsDone[0].startsWith(packs[0].id));
});
t('validate keeps good data, drops bad packs, odd sources and junk', () => {
  const v = T.validate({ cards: { opo: { en: 'yes', due: '2026-11-19', box: 99 }, x: { en: 1 } }, done: { '2026-11-18/1': '2026-11-18T10:00:00Z', bad: 'x' }, packs: { '2026-11-25': { id: 'x' } }, source: 'https://evil.example/', answers: [{ at: 'no' }] });
  assert.deepStrictEqual(Object.keys(v.cards), ['opo']); assert.strictEqual(v.cards.opo.box, T.INTERVALS.length - 1);
  assert.deepStrictEqual(Object.keys(v.done), ['2026-11-18/1']); assert.deepStrictEqual(v.packs, {}); assert.strictEqual(v.source, T.defaults().source, 'a bad address falls back to the default'); assert.strictEqual(v.answers.length, 0);
});
t('week stats count local days (answers late in the evening, any time zone)', () => {
  const s = T.defaults();
  // one answer at 8 pm local on each of 8 days, the oldest one wrong: only the last 7 count
  for (let d = 13; d <= 20; d++) s.answers.push({ at: new Date(2026, 10, d, 20, 0).toISOString(), ok: d !== 13, pack: 'p', day: 1, prompt: 'x', type: 'mc' });
  const st = T.stats(s, new Date(2026, 10, 20, 21, 0));
  assert.strictEqual(st.weekDays, 7); assert.strictEqual(st.weekAccuracy, 1);
  // 7 am local on the first day of the window still counts (UTC+ zones used to drop it)
  const m = T.defaults(); m.answers.push({ at: new Date(2026, 10, 14, 7, 0).toISOString(), ok: true });
  assert.strictEqual(T.stats(m, new Date(2026, 10, 20, 12)).weekDays, 1);
});

t('restore keeps the slow-voice setting and drops only a damaged answer', () => {
  const v = T.validate({ cards: {}, settings: { slow: false }, answers: [{ at: 'nope', given: 'x', ok: true }, { at: '2026-11-19T10:00:00Z', given: 'kumusta', ok: true }] });
  assert.ok(v, 'not thrown away'); assert.strictEqual(v.settings.slow, false);
  assert.strictEqual(v.answers.length, 1); assert.strictEqual(v.answers[0].given, 'kumusta');
  assert.strictEqual(T.validate({ cards: {} }).settings.slow, true, 'default stays slow');
});
console.log(n + ' tagalog unit tests passed');
