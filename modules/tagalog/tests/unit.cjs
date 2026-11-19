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
console.log(n + ' tagalog unit tests passed');
