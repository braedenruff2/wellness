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
  // finished lessons with missing/empty exercises or a missing pack never crash
  const emptyS = T.defaults();
  emptyS.done['2026-01-01/1'] = d.toISOString();
  emptyS.done['2026-01-01/2'] = d.toISOString();
  emptyS.done['2025-01-01/1'] = d.toISOString();
  const sparsePack = { id: '2026-01-01', title: 'Sparse', lessons: [{ day: 1, title: 'No ex', intro: 'x', words: [] }, { day: 2, title: 'Empty ex', intro: 'x', words: [], exercises: [] }] };
  assert.deepStrictEqual(T.practiceSet(emptyS, [sparsePack], 8), [], 'no exercises -> empty set');
  sparsePack.lessons.push({ day: 3, title: 'One ex', intro: 'x', words: [], exercises: [{ type: 'mc', prompt: 'p', answer: 'a', options: ['a', 'b'] }] });
  emptyS.done['2026-01-01/3'] = d.toISOString();
  assert.strictEqual(T.practiceSet(emptyS, [sparsePack], 8).length, 1, 'minimal 1-exercise lesson');

  // mixed timezone offsets: 2026-11-10T22:00-04:00 (Nov 11 02:00Z) is NEWER than 2026-11-11T01:00Z
  const tzS = T.defaults();
  tzS.done['2026-01-01/1'] = d.toISOString();
  const tzPack = { id: '2026-01-01', title: 'TZ', lessons: [{ day: 1, title: 'L1', intro: 'x', words: [], exercises: [
    { type: 'mc', prompt: 'first', answer: 'a', options: ['a', 'b'] },
    { type: 'mc', prompt: 'second', answer: 'a', options: ['a', 'b'] }
  ] }] };
  tzS.answers.push(
    { at: '2026-11-10T22:00:00-04:00', pack: '2026-01-01', day: 1, ok: true, prompt: 'first', type: 'mc' },
    { at: '2026-11-11T01:00:00Z', pack: '2026-01-01', day: 1, ok: true, prompt: 'second', type: 'mc' }
  );
  const tzSet = T.practiceSet(tzS, [tzPack], 2);
  assert.strictEqual(tzSet[0].ex.prompt, 'second', 'chronologically older UTC answer comes before newer -04:00 answer');
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
t('typed answers: a missing "po" is accepted only where the exercise marks it optional (poOptional)', () => {
  const strict = { type: 'type', prompt: 'Thank you, Lola.', answer: 'Salamat po, Lola.', accept: ['salamat po lola'] };
  assert.ok(T.check(strict, 'salamat po lola') && T.check(strict, 'Salamat ho, Lola'));
  assert.ok(!T.check(strict, 'salamat lola'), 'never by default');
  const opt = Object.assign({}, strict, { prompt: 'Thanks, Lola (po optional here)', poOptional: true });
  assert.ok(T.check(opt, 'Salamat, Lola!'), 'optional: accepted without po');
  assert.ok(T.missedPo(opt, 'salamat lola') && !T.missedPo(opt, 'salamat po lola') && !T.missedPo(opt, 'salamat ho lola'));
  assert.ok(!T.missedPo(strict, 'salamat po lola'));
  assert.ok(!T.check(opt, 'salamat tita'), 'other words still matter');
  assert.ok(!T.check({ type: 'type', prompt: 'p', answer: 'Opo', poOptional: true }, ''), 'empty never right');
  const pk = (ex) => ({ id: '2026-11-25', title: 't', lessons: [{ day: 1, title: 'a', intro: 'b', words: [{ tl: 'a', en: 'a' }, { tl: 'b', en: 'b' }, { tl: 'c', en: 'c' }],
    exercises: [ex, { type: 'mc', prompt: 'p', answer: 'a', options: ['a', 'b'] }, { type: 'mc', prompt: 'p', answer: 'a', options: ['a', 'b'] }] }] });
  assert.deepStrictEqual(T.checkPack(pk(opt)), []);
  assert.strictEqual(T.checkPack(pk(Object.assign({}, opt, { answer: 'Salamat, Lola.' }))).length, 1, 'answer without po');
  assert.strictEqual(T.checkPack(pk(Object.assign({}, opt, { poOptional: 'yes' }))).length, 1, 'only true');
  assert.strictEqual(T.checkPack(pk({ type: 'mc', prompt: 'p', answer: 'Salamat po', options: ['Salamat po', 'x'], poOptional: true })).length, 1, 'type exercises only');
});

t('typed answers: accents from the keyboard and hyphen/space don\'t matter; letters still do', () => {
  const ex = { type: 'type', answer: 'Araw-araw po', accept: ['Kumusta ka'] };
  for (const g of ['araw-araw po', 'araw araw po', 'Araw–araw po…', 'áraw-áraw pó', 'araw - araw po']) assert.ok(T.check(ex, g), g);
  for (const g of ['Kumustá ka?', '(kumusta ka)', 'kumusta ka!']) assert.ok(T.check(ex, g), g);
  for (const g of ['arawaraw po', 'araw po', 'kumusta kayo']) assert.ok(!T.check(ex, g), g);
  assert.ok(T.check({ answer: 'Señora' }, 'senora'), 'ñ typed as n');
  assert.ok(T.check({ answer: 'Senora' }, 'señora'), 'n typed as ñ');
});

t('cloud checks: kept through validate (last 20, text only), damaged ones dropped', () => {
  const c = T.cleanCheck({ ok: 'yes', corrected: 'Umiinom ako ng tubig', explain: 'x'.repeat(2000), evil: '<b>', tip: 5 });
  assert.deepStrictEqual(Object.keys(c).sort(), ['corrected', 'explain', 'ok']); assert.strictEqual(c.ok, false); assert.strictEqual(c.explain.length, 800);
  const s = T.defaults(); s.checks = [];
  for (let i = 0; i < 25; i++) s.checks.push({ at: new Date(2026, 10, 21, 10, i).toISOString(), prompt: 'p' + i, given: 'g', a: { ok: true } });
  s.checks.push({ at: 'nope', prompt: 'bad' });
  const v = T.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.checks.length, 19); assert.strictEqual(v.checks[18].prompt, 'p24'); assert.strictEqual(v.checks[0].a.ok, true);
  assert.strictEqual(T.validate(T.defaults()).checks, undefined, 'no checks, no field');
});

t('stats: weekly counts and accuracy are bounded at now so earlier-day lookups ignore future lessons/answers', () => {
  const s = T.defaults();
  const pack = { id: '2026-11-18' };
  const l1 = { day: 1, words: [{ tl: 'tubig', en: 'water' }] };
  const l2 = { day: 2, words: [{ tl: 'kain', en: 'eat' }] };
  T.finishLesson(s, pack, l1, new Date(2026, 10, 18, 12));
  T.recordAnswer(s, pack, l1, { prompt: 'water', type: 'type' }, true, new Date(2026, 10, 18, 12));
  T.finishLesson(s, pack, l2, new Date(2026, 10, 21, 12));
  T.recordAnswer(s, pack, l2, { prompt: 'eat', type: 'type' }, false, new Date(2026, 10, 21, 12));
  const past = T.stats(s, new Date(2026, 10, 19, 12));
  assert.strictEqual(past.weekLessons, 1);
  assert.strictEqual(past.weekDays, 1);
  assert.strictEqual(past.weekAccuracy, 1);
  const nowSt = T.stats(s, new Date(2026, 10, 21, 20));
  assert.strictEqual(nowSt.weekLessons, 2);
  assert.strictEqual(nowSt.weekDays, 2);
  assert.strictEqual(nowSt.weekAccuracy, 0.5);
});

t('orderHint: real pack sentences with same words in wrong ang/ng/si/ni order get a specific word-order hint', () => {
  const p = packs[0];
  // Lesson 3 build: "Umiinom ng gatas ang baby."
  const l3Drink = p.lessons[2].exercises.find((e) => /Umiinom ng gatas ang baby/.test(e.answer));
  assert.ok(l3Drink, 'found Lesson 3 sentence');
  assert.ok(!T.check(l3Drink, 'Ang baby umiinom ng gatas.'));
  assert.strictEqual(T.orderHint(l3Drink, 'Ang baby umiinom ng gatas.'), 'Right words; in Tagalog the doer comes after the verb: Umiinom ng gatas ang baby.');
  assert.strictEqual(T.orderHint(l3Drink, 'Umiinom ang baby ng gatas'), 'Right words; in Tagalog the doer comes after the verb: Umiinom ng gatas ang baby.');
  assert.strictEqual(T.orderHint(l3Drink, 'Umiinom ng gatas ang baby.'), '', 'already right -> no hint');
  assert.strictEqual(T.orderHint(l3Drink, 'Ang baby umiinom ng tubig.'), '', 'different word -> no hint');

  // Lesson 4 build: "Uminom ng gatas si {child} kanina."
  const l4Drank = p.lessons[3].exercises.find((e) => /Uminom ng gatas si/.test(e.answer));
  assert.ok(l4Drank, 'found Lesson 4 sentence');
  assert.strictEqual(T.orderHint(l4Drank, 'Si {child} uminom ng gatas kanina.'), 'Right words; in Tagalog the doer comes after the verb: ' + l4Drank.answer);

  // Lesson 5 type: "Ang sarap ng adobo!" (accepts "masarap ang adobo") and "Pakiabot po ng kanin."
  const l5Adobo = p.lessons[4].exercises.find((e) => /Ang sarap ng adobo/.test(e.answer));
  const l5Rice = p.lessons[4].exercises.find((e) => /Pakiabot po ng kanin/.test(e.answer));
  assert.ok(l5Adobo && l5Rice, 'found Lesson 5 sentences');
  assert.strictEqual(T.orderHint(l5Adobo, 'ng adobo ang sarap'), 'Right words; in Tagalog the doer comes after the verb: Ang sarap ng adobo!');
  assert.strictEqual(T.orderHint(l5Adobo, 'Ang adobo masarap'), 'Right words; in Tagalog the doer comes after the verb: masarap ang adobo');
  assert.strictEqual(T.orderHint(l5Rice, 'Ng kanin pakiabot ho!'), 'Right words; in Tagalog the doer comes after the verb: Pakiabot po ng kanin.');

  // Lesson 3 dialogue sentence as a type exercise: "Kumakain si Baby ng saging."
  const exEat = { type: 'type', answer: 'Kumakain si Baby ng saging.' };
  assert.strictEqual(T.orderHint(exEat, 'Si Baby kumakain ng saging'), 'Right words; in Tagalog the doer comes after the verb: Kumakain si Baby ng saging.');

  // Non-triggers: 2-word exclamation, no ang/ng/si/ni markers, mc/listen, empty, poOptional
  const l2Cute = p.lessons[1].exercises.find((e) => /Ang cute/.test(e.answer));
  assert.strictEqual(T.orderHint(l2Cute, 'cute ang'), '', '2-word exclamation does not trigger doer-after-verb hint');
  const l7Thanks = p.lessons[6].exercises.find((e) => /Salamat po, Lola/.test(e.answer));
  assert.strictEqual(T.orderHint(l7Thanks, 'Lola salamat po'), '', 'sentence without ang/ng/si/ni does not trigger');
  assert.strictEqual(T.orderHint({ type: 'mc', answer: 'Umiinom ng gatas ang baby.' }, 'Ang baby umiinom ng gatas.'), '', 'mc ignored');
  assert.strictEqual(T.orderHint(l5Rice, ''), '', 'empty ignored');
  const optRice = Object.assign({}, l5Rice, { poOptional: true });
  assert.strictEqual(T.orderHint(optRice, 'ng kanin pakiabot'), 'Right words; in Tagalog the doer comes after the verb: Pakiabot po ng kanin.');
});

t('checkPack and validate reject impossible calendar dates (2026-02-30, 2026-99-99)', () => {
  const badPack = JSON.parse(JSON.stringify(packs[0]));
  badPack.id = '2026-02-30';
  assert.ok(T.checkPack(badPack).some((e) => /YYYY-MM-DD/.test(e)));
  const v = T.validate({
    done: { '2026-02-30/1': '2026-11-20T10:00:00Z', '2028-02-29/1': '2028-02-29T10:00:00Z' },
    cards: { bad1: { en: 'x', due: '2026-02-30' }, bad2: { en: 'y', due: '2026-99-99' }, ok: { en: 'water', due: '2028-02-29' } }
  });
  assert.deepStrictEqual(Object.keys(v.done), ['2028-02-29/1']);
  assert.deepStrictEqual(Object.keys(v.cards), ['ok']);
});

t('altOf: an accepted variant shows the lesson\'s own answer; the answer itself (any case, po/ho, punctuation) does not', () => {
  const ex = { type: 'type', prompt: 'p', answer: 'Kumakain ako ngayon.', accept: ['kumakain na ako', 'kumakain po ako ngayon'] };
  assert.strictEqual(T.altOf(ex, 'kumakain na ako'), 'Kumakain ako ngayon.');
  assert.strictEqual(T.altOf(ex, 'KUMAKAIN AKO NGAYON!'), '');
  assert.strictEqual(T.altOf(ex, 'kumakain po ako ngayon'), '', 'only po added: same sentence');
  assert.strictEqual(T.altOf(ex, 'kumakain ho ako ngayon'), '');
  assert.strictEqual(T.altOf(ex, 'kain'), '', 'wrong: nothing');
  assert.strictEqual(T.altOf({ type: 'mc', answer: 'a', options: ['a'] }, 'a'), '');
});
t('orderHint: a short pronoun out of second place gets its own hint (his "bakit umiiyak siya")', () => {
  const ex = { type: 'type', prompt: 'Why is she crying?', answer: 'Bakit siya umiiyak?', accept: ['bakit siya umiiyak'] };
  assert.strictEqual(T.orderHint(ex, 'bakit umiiyak siya?'), 'Right words; short words like siya go right after the first word: Bakit siya umiiyak?');
  assert.strictEqual(T.orderHint(ex, 'Bakit siya umiiyak'), '', 'right: no hint');
  const ex2 = { type: 'type', prompt: 'p', answer: 'Hindi pa siya kumakain.' };
  assert.ok(/short words like siya/.test(T.orderHint(ex2, 'hindi pa kumakain siya')));
  assert.strictEqual(T.orderHint(ex2, 'siya hindi pa kumakain'), 'Right words; short words like siya go right after the first word: Hindi pa siya kumakain.');
  // ang/ng sentences keep their own hint
  const ex3 = { type: 'type', prompt: 'p', answer: 'Umiinom ng gatas ang baby.' };
  assert.ok(/doer comes after the verb/.test(T.orderHint(ex3, 'umiinom ang gatas ng baby')));
  // different words: no hint
  assert.strictEqual(T.orderHint(ex, 'bakit umiiyak ka'), '');
});
t('linkerHint: a missing -ng or na linker gets "Almost" with the answer; anything else, or a right answer, gets nothing', () => {
  const g = { type: 'type', prompt: 'p', answer: 'Gusto kong mag-aral ng Tagalog.', accept: ['gusto kong mag aral ng tagalog'] };
  assert.strictEqual(T.linkerHint(g, 'gusto ko mag-aral ng tagalog'), 'Almost: add the linker -ng (kong): Gusto kong mag-aral ng Tagalog.');
  const a = { type: 'type', prompt: 'p', answer: 'Apat na buwan akong naka-leave.' };
  assert.strictEqual(T.linkerHint(a, 'apat buwan akong naka leave'), 'Almost: add the linker na (apat na buwan): Apat na buwan akong naka-leave.');
  const k = { type: 'type', prompt: 'p', answer: 'Palagi kaming naglalaro.' };
  assert.ok(/kaming/.test(T.linkerHint(k, 'palagi kami naglalaro')));
  assert.strictEqual(T.linkerHint(k, 'Palagi kaming naglalaro'), '', 'right');
  assert.strictEqual(T.linkerHint(k, 'palagi kami kumakain'), '', 'two words differ');
  assert.strictEqual(T.linkerHint(k, 'palagi naglalaro kami'), '', 'order, not linker');
  assert.strictEqual(T.linkerHint({ type: 'build', answer: 'Palagi kaming naglalaro.', words: [] }, 'palagi kami naglalaro'), '', 'type exercises only');
});
t('exampleFor: a lesson sentence that uses the word (whole words; never the word alone)', () => {
  const packs = [{ lessons: [{ dialogue: [{ tl: 'Opo.', en: 'Yes.' }, { tl: 'Gutom na ba siya?', en: 'Is she hungry already?' }], grammar: { examples: [{ tl: 'Kumakain ako ngayon.', en: 'I\'m eating now.' }] } }] }];
  assert.deepStrictEqual(T.exampleFor(packs, 'ngayon'), { tl: 'Kumakain ako ngayon.', en: 'I\'m eating now.' });
  assert.deepStrictEqual(T.exampleFor(packs, 'gutom'), { tl: 'Gutom na ba siya?', en: 'Is she hungry already?' });
  assert.strictEqual(T.exampleFor(packs, 'opo'), null, 'only the word itself');
  assert.strictEqual(T.exampleFor(packs, 'kain'), null, 'part of a word does not count');
  assert.strictEqual(T.exampleFor([], 'ngayon'), null);
  assert.ok(T.exampleFor(require('../../../app/www/modules/tagalog/tagalog-core.js') && [JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'packs', '2026-11-25.json'), 'utf8'))], 'kasama'));
});
t('tests that serve a fake "new week" use an id far after any real pack (2090+), so a real Wednesday pack never collides', () => {
  const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..', '..', '..');
  const bundled = fs.readdirSync(path.join(__dirname, '..', 'packs')).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map((f) => f.slice(0, 10));
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(p); else if (/\.cjs$/.test(e.name) && /tests/.test(p)) files.push(p);
  });
  walk(path.join(root, 'modules')); walk(path.join(root, 'tests'));
  const bad = [];
  files.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    // a route that serves packs/<id>.json, or a "next week" id set in code
    for (const m of src.matchAll(/endsWith\('(\d{4}-\d\d-\d\d)\.json'\)|(?:\bNX\s*=|next\.id\s*=)\s*'(\d{4}-\d\d-\d\d)'/g)) {
      const id = m[1] || m[2];
      // a served file may be a week that already ships (the "corrected week" test); a "next week" id never may
      if (id < '2090' && (m[2] || bundled.indexOf(id) < 0)) bad.push(path.relative(root, f) + ': ' + id);
    }
  });
  assert.deepStrictEqual(bad, [], 'fake weeks must be 2090+ (or an id that already ships, for "corrected" tests)');
});
t('hintKind is stored with a wrong answer, survives validate, and goes into the weekly summary', () => {
  const st = T.defaults(), pk = { id: '2026-11-25' }, l = { day: 2 };
  const ex = { type: 'type', prompt: 'Why is she crying?', answer: 'Bakit siya umiiyak?' };
  assert.strictEqual(T.hintKind(ex, 'bakit umiiyak siya'), 'pronoun');
  assert.strictEqual(T.hintKind({ type: 'type', prompt: 'p', answer: 'Umiinom ng gatas ang baby.' }, 'umiinom ang gatas ng baby'), 'order');
  assert.strictEqual(T.hintKind({ type: 'type', prompt: 'p', answer: 'Palagi kaming naglalaro.' }, 'palagi kami naglalaro'), 'linker');
  assert.strictEqual(T.hintKind(ex, 'hindi ko alam'), '');
  T.recordAnswer(st, pk, l, ex, false, new Date(2026, 10, 25, 20), 'bakit umiiyak siya');
  T.recordAnswer(st, pk, l, ex, true, new Date(2026, 10, 25, 21), 'bakit siya umiiyak');
  assert.strictEqual(st.answers[0].hint, 'pronoun'); assert.strictEqual(st.answers[1].hint, undefined);
  const v = T.validate(Object.assign({}, st, { answers: st.answers.concat([{ at: '2026-11-25T10:00:00Z', ok: false, prompt: 'x', hint: 'evil' }]) }));
  assert.strictEqual(v.answers[0].hint, 'pronoun'); assert.strictEqual(v.answers[2].hint, undefined);
  const sum = T.weeklySummary(st, [], new Date(2026, 10, 26));
  assert.deepStrictEqual(sum.hints, [{ kind: 'pronoun', prompt: 'Why is she crying?', given: 'bakit umiiyak siya' }]);
});
console.log(n + ' tagalog unit tests passed');
