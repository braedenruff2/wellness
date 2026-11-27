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
  const b2 = JSON.parse(JSON.stringify(packs[0])), l2 = b2.lessons[2];
  const mc = l2.exercises.find((x) => x.options); mc.options.push(mc.options[0].toUpperCase() + '!');
  const ty = l2.exercises.find((x) => x.type === 'type'); if (ty) ty.accept = ['ok', ''];
  l2.words.push(Object.assign({}, l2.words[0]));
  const e2 = T.checkPack(b2);
  assert.ok(e2.some((x) => /different from each other/.test(x)), 'same option twice (case and punctuation aside)');
  assert.ok(!ty || e2.some((x) => /accept must be/.test(x)), 'an empty accepted answer');
  assert.ok(e2.some((x) => /listed twice/.test(x)), 'a word twice in one lesson');
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
t('linkerHint: an extra -ng on a short word ("Hindi akong pagod") gets "no linker here"; real -ng words and right answers get nothing', () => {
  const h = { type: 'type', prompt: "I'm not tired.", answer: 'Hindi ako pagod.', accept: ['hindi ako pagod', 'hindi po ako pagod', 'di ako pagod'] };
  const m = T.linkerHint(h, 'Hindi akong pagod');
  assert.ok(/^Almost: no linker here \(ako, not akong, after hindi\)/.test(m), m);
  assert.ok(/palagi siyang masaya\): Hindi ako pagod\.$/.test(m), m);
  assert.strictEqual(T.hintKind(h, 'Hindi akong pagod'), 'extralinker');
  assert.strictEqual(T.HINT_LABEL.extralinker, 'No linker after hindi');
  assert.ok(/hindi ako pagod/.test(T.HINT_ABOUT.extralinker));
  // kept by validate, counted as a rule slip first in mixed practice
  const st = T.defaults(), pk = { id: '2026-11-25' }, ls = { day: 2, words: [] };
  T.recordAnswer(st, pk, ls, h, false, new Date(2026, 10, 26, 17), 'Hindi akong pagod');
  assert.strictEqual(st.answers[0].hint, 'extralinker');
  assert.strictEqual(T.validate(JSON.parse(JSON.stringify(st))).answers[0].hint, 'extralinker');
  assert.strictEqual(T.linkerHint(h, 'Hindi ako pagod'), '', 'right');
  assert.strictEqual(T.linkerHint(h, 'Hindi po akong pagod').indexOf('after hindi') > 0, true, 'po between: still after hindi');
  const s = { type: 'type', prompt: "She hasn't slept yet.", answer: 'Hindi pa siya natutulog.', accept: ['hindi pa siya natutulog', 'hindi pa siya tulog'] };
  assert.ok(/siya, not siyang, after hindi/.test(T.linkerHint(s, 'Hindi pa siyang tulog')), 'matches the accepted "tulog" form');
  // a different verb too ("tulog" for "natutulog", no accept for it): the linker slip is still named
  const s2 = { type: 'type', prompt: "She hasn't slept yet.", answer: 'Hindi pa siya natutulog.', accept: ['hindi pa siya natutulog'] };
  assert.ok(/^Almost: no linker here \(siya, not siyang, after hindi\).*Hindi pa siya natutulog\.$/.test(T.linkerHint(s2, 'Hindi pa siyang tulog')));
  assert.strictEqual(T.linkerHint(s2, 'hindi pa siya tulog'), '', 'no linker slip: nothing specific');
  // the word really takes -ng here: no "extra" hint (and the missing-linker hint still works)
  const k = { type: 'type', prompt: 'p', answer: 'Palagi kaming naglalaro.' };
  assert.strictEqual(T.linkerHint(k, 'Palagi kaming naglalaro'), '');
  assert.ok(/add the linker -ng/.test(T.linkerHint(k, 'palagi kami naglalaro')));
  // not a short word: no hint ("bahayng" is just wrong)
  const b = { type: 'type', prompt: 'p', answer: 'Malaki ang bahay.' };
  assert.strictEqual(T.linkerHint(b, 'malaki ang bahayng'), '');
  // not after hindi: the hint leaves out "after hindi"
  const d = { type: 'type', prompt: 'p', answer: 'Pagod ako ngayon.' };
  assert.ok(/^Almost: no linker here \(ako, not akong\)\./.test(T.linkerHint(d, 'pagod akong ngayon')));
});
t('stats / dueCards / weeklySummary across Halifax DST (1 Nov 2026, 8 Mar 2027) and on an earlier day', () => {
  const pk = { id: '2026-10-28' }, L = (day) => ({ day, words: [{ tl: 'w' + day, en: 'e' + day }] }), ex = { prompt: 'p', type: 'mc' };
  for (const [y, m, d] of [[2026, 10, 1], [2027, 2, 14]]) { // the Sunday the clocks change, and the Sunday after spring-forward week
    const s = T.defaults(), at = (dd, h, mi) => new Date(y, m, d + dd, h, mi || 0);
    T.finishLesson(s, pk, L(1), at(-7, 23, 50)); // the day before the 7-day window: not this week
    T.finishLesson(s, pk, L(2), at(-6, 0, 10));  // first minute of the window
    T.finishLesson(s, pk, L(3), at(0, 1, 30));   // the change night, 01:30
    T.finishLesson(s, pk, L(4), at(0, 23, 59));
    T.finishLesson(s, pk, L(5), at(1, 0, 5));    // tomorrow: not yet on this day
    T.recordAnswer(s, pk, L(3), ex, true, at(0, 1, 30));
    T.recordAnswer(s, pk, L(3), ex, false, at(-7, 23, 59)); // outside the window
    const st = T.stats(s, at(0, 12));
    assert.strictEqual(st.weekLessons, 3, 'window ' + y + '-' + (m + 1) + '-' + d);
    assert.strictEqual(st.lessonsDone, 4, 'done by the end of that day (lesson 5 is tomorrow)');
    assert.strictEqual(st.weekAccuracy, 1);
    assert.strictEqual(st.weekDays, 2, 'days -6 and 0 (lesson 1 day is outside, lesson 5 is tomorrow)');
    // an earlier day: nothing after it counts
    const early = T.stats(s, at(-6, 9));
    assert.strictEqual(early.lessonsDone, 2); assert.strictEqual(early.weekLessons, 2, 'its own 7 days hold lessons 1 and 2');
    // cards made on the change day are due the next local day, not before
    const c4 = s.cards.w4;
    assert.strictEqual(c4.due, T.iso ? T.iso(at(1, 12)) : c4.due);
    assert.ok(!T.dueCards(s, at(0, 23, 59)).includes('w4'));
    assert.ok(T.dueCards(s, at(1, 0, 1)).includes('w4'));
    const sum = T.weeklySummary(s, [pk], at(0, 12));
    assert.strictEqual(sum.stats.weekLessons, 3); assert.strictEqual(sum.lessonsDone.length, 5);
  }
});
t('weeklySummary.slipKinds: per kind, slips in the last 14 days and exercises still wrong on the newest answer', () => {
  const s = T.defaults(), pk = { id: '2026-11-25' }, L = { day: 2, words: [] };
  const h = { type: 'type', prompt: "I'm not tired.", answer: 'Hindi ako pagod.', accept: ['hindi ako pagod'] };
  const g = { type: 'type', prompt: 'I want to study Tagalog.', answer: 'Gusto kong mag-aral ng Tagalog.' };
  const d = (dd, hh) => new Date(2026, 10, dd, hh);
  T.recordAnswer(s, pk, L, h, false, d(26, 17), 'Hindi akong pagod');
  T.recordAnswer(s, pk, L, h, true, d(27, 9), 'Hindi ako pagod');   // fixed since
  T.recordAnswer(s, pk, L, g, false, d(26, 18), 'gusto ko mag-aral ng tagalog');
  T.recordAnswer(s, pk, L, g, false, d(1, 18), 'gusto ko mag-aral ng tagalog'); // over 14 days before: not counted
  const k = T.weeklySummary(s, [pk], d(28, 12)).slipKinds;
  assert.deepStrictEqual(Object.keys(k).sort(), ['extralinker', 'linker']);
  assert.strictEqual(k.extralinker.slips, 1); assert.strictEqual(k.extralinker.stillWrong, 0);
  assert.strictEqual(k.linker.slips, 1); assert.strictEqual(k.linker.stillWrong, 1);
  assert.ok(/missing linker/.test(k.linker.about));
  // earlier-day lookup ignores future answers logged after `now`
  const cut = new Date(2026, 10, 26, 17, 30);
  const earlier = T.weeklySummary(s, [pk], cut);
  assert.deepStrictEqual(Object.keys(earlier.slipKinds), ['extralinker']);
  assert.strictEqual(earlier.slipKinds.extralinker.stillWrong, 1, 'tomorrow fix not yet visible on earlier day');
  const pkFull = { id: '2026-11-25', lessons: [{ day: 2, exercises: [h, g] }] };
  assert.deepStrictEqual(T.slips(s, [pkFull], cut).map((x) => x.kind), ['extralinker'], 'slips upper-bounded at now');
});
t('check: a dropped hyphen is forgiven ("magaral" for "mag-aral"), a changed verb form is not', () => {
  const g = { type: 'type', prompt: 'I want to study Tagalog.', answer: 'Gusto kong mag-aral ng Tagalog.', accept: ['gusto kong mag aral ng tagalog'] };
  assert.strictEqual(T.check(g, 'gusto kong magaral ng tagalog'), true);
  assert.strictEqual(T.check(g, 'Gusto kong mag aral ng Tagalog'), true);
  assert.strictEqual(T.check(g, 'gusto kong magaaral ng tagalog'), false, 'mag-aaral is another form');
  assert.strictEqual(T.check({ type: 'type', prompt: 'p', answer: 'Araw-araw.' }, 'arawaraw'), false, 'a doubled word keeps its break');
  assert.strictEqual(T.check({ type: 'type', prompt: 'p', answer: 'Mahal ko ang pag-ibig.' }, 'mahal ko ang pagibig'), true);
  assert.strictEqual(T.check({ type: 'type', prompt: 'p', answer: 'Apat na buwan akong naka-leave.' }, 'apat na buwan akong nakaleave'), false, 'only before a vowel');
  assert.strictEqual(T.check({ type: 'type', prompt: 'p', answer: 'Salamat po.' }, 'salamatpo'), false, 'only a hyphen may go, not a space');
  assert.strictEqual(T.altOf(g, 'gusto kong magaral ng tagalog'), '', 'the lesson\'s own words: no "lesson\'s version" note');
});
t('typed as a phone keyboard sends it: capital, trailing space or stop, double space, smart or dropped apostrophe (task 223)', () => {
  const ex = { type: 'type', prompt: 'p', answer: 'Gusto kong mag-aral ng Tagalog.' };
  for (const g of ['Gusto kong magaral ng Tagalog. ', 'Gusto  kong mag-aral ng Tagalog.', 'gusto kong mag\u2011aral ng tagalog!', ' Gusto kong mag aral ng Tagalog\n']) assert.ok(T.check(ex, g), JSON.stringify(g));
  const e2 = { type: 'type', prompt: 'p', answer: 'Ma\'am, salamat po.' };
  for (const g of ['Ma\u2019am, salamat po.', 'Maam salamat po', 'ma`am salamat po']) assert.ok(T.check(e2, g), g);
  const e3 = { type: 'type', prompt: 'p', answer: '\'Di ko alam.' };
  assert.ok(T.check(e3, 'di ko alam') && T.check(e3, '’di ko alam'));
  assert.ok(!T.check(e3, 'hindi ko alam'), 'other words are not the same answer');
  assert.strictEqual(T.altOf(e2, 'Maam salamat po'), '', 'same words: no "lesson\'s version" note');
});
t('aspectHint: the verb with or without its repeated syllable gets "Almost" and the right form; anything else nothing', () => {
  const g = { type: 'type', prompt: 'I want to study Tagalog.', answer: 'Gusto kong mag-aral ng Tagalog.', accept: ['gusto kong mag aral ng tagalog'] };
  assert.strictEqual(T.aspectHint(g, 'gusto kong magaaral ng tagalog'), 'Almost: after gusto the verb stays plain: mag-aral, without the repeated syllable (that means "is doing" or "will do"): Gusto kong mag-aral ng Tagalog.');
  assert.ok(/after gusto .*mag-aral/.test(T.aspectHint(g, 'gusto kong mag-aaral ng tagalog')));
  const b = { type: 'type', prompt: 'p', answer: 'Kailangan kong bumili ng gatas.' };
  assert.ok(/after kailangan the verb stays plain: bumili,/.test(T.aspectHint(b, 'kailangan kong bumibili ng gatas')));
  const k = { type: 'type', prompt: 'p', answer: 'Kumakain ako ngayon.' };
  assert.strictEqual(T.aspectHint(k, 'kumain ako ngayon'), 'Almost: the verb here is kumakain, with the repeated syllable (it is happening, or will): Kumakain ako ngayon.');
  assert.ok(/nagluluto/.test(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Nagluluto si Mama.' }, 'nagluto si mama')));
  assert.strictEqual(T.aspectHint(k, 'Kumakain ako ngayon'), '', 'right');
  assert.strictEqual(T.aspectHint(k, 'umiinom ako ngayon'), '', 'another verb');
  assert.strictEqual(T.aspectHint(k, 'kumakain na ako'), '', 'other words');
  assert.strictEqual(T.aspectHint(k, 'kumain ako'), '', 'two words differ (one missing)');
  assert.strictEqual(T.aspectHint({ type: 'build', answer: 'Kumakain ako ngayon.', words: [] }, 'kumain ako ngayon'), '', 'type exercises only');
  assert.strictEqual(T.hintKind(g, 'gusto kong magaaral ng tagalog'), 'aspect');
  // a doubled letter from the keyboard is a typo, not a verb form (review 26 Nov)
  assert.strictEqual(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Salamat po.' }, 'sallamat po'), '');
  assert.strictEqual(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Kumain ako.' }, 'kumainn ako'), '');
  assert.strictEqual(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Magandang umaga po.' }, 'magandang umagaa po'), '');
  assert.strictEqual(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Salamat po.' }, 'salamamat po'), '', 'a syllable typed twice mid-word');
  assert.ok(/nagluluto/.test(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Nagluluto ako.' }, 'nagluto ako')));
  assert.ok(/Aalis/i.test(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Aalis na kami.' }, 'alis na kami')));
  // -in- verbs (task 224)
  const ia = (a, g) => T.aspectHint({ type: 'type', prompt: 'p', answer: a }, g);
  assert.ok(/kinakain, with the repeated/.test(ia('Kinakain niya ang mangga.', 'kinain niya ang mangga')));
  assert.ok(/kinain, without the repeated/.test(ia('Kinain niya ang mangga.', 'kinakain niya ang mangga')));
  assert.ok(/binabasa/.test(ia('Binabasa ko ang libro.', 'binasa ko ang libro')));
  assert.ok(/sinusulat/.test(ia('Sinusulat ko ito.', 'sinulat ko ito')));
  assert.ok(/iniinom/.test(ia('Iniinom niya ang gatas.', 'ininom niya ang gatas')));
  assert.strictEqual(ia('Kinain niya ang mangga.', 'kinaain niya ang mangga'), '', 'a doubled vowel mid-word is a typo');
  // the linker on the word before: "after kailangan"
  assert.ok(/after kailangan the verb stays plain: mag-aral/.test(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Kailangang mag-aral ng anak ko.' }, 'kailangang mag-aaral ng anak ko')));
  assert.ok(/after puwede /.test(T.aspectHint({ type: 'type', prompt: 'p', answer: 'Puwedeng kumain na tayo?' }, 'puwedeng kumakain na tayo')));
  assert.strictEqual(T.hintKind(g, 'gusto ko mag-aral ng tagalog'), 'linker', 'a linker slip stays a linker hint');
  const st = T.defaults();
  T.recordAnswer(st, { id: '2026-11-25' }, { day: 1 }, g, false, new Date(2026, 10, 25, 20), 'gusto kong magaaral ng tagalog');
  assert.strictEqual(T.validate(st).answers[0].hint, 'aspect', 'kept by validate');
});
t('every bundled pack: accepted answers are right and get no hint; another exercise\'s answer never gets the verb-form hint', () => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'packs');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const all = p.lessons.flatMap((l) => l.exercises).filter((e) => e.answer);
    for (const ex of all.filter((e) => e.type === 'type')) {
      for (const a of [ex.answer].concat(ex.accept || [])) {
        if (!T.check(ex, a)) bad.push(f + ' not right: ' + a);
        const h = T.aspectHint(ex, a) || T.linkerHint(ex, a) || T.orderHint(ex, a);
        if (h) bad.push(f + ' hint on an accepted answer: ' + a + ' -> ' + h);
      }
      for (const o of all) if (o !== ex && !T.check(ex, o.answer) && T.aspectHint(ex, o.answer)) bad.push(f + ' verb-form hint between "' + ex.answer + '" and "' + o.answer + '"');
    }
  }
  assert.deepStrictEqual(bad, []);
});
t('slips: last 14 days of hinted answers, newest first, one per exercise, with the lesson sentence', () => {
  const pk = { id: '2026-11-25', lessons: [{ day: 1, exercises: [
    { type: 'type', prompt: 'I want to study Tagalog.', answer: 'Gusto kong mag-aral ng Tagalog.' },
    { type: 'type', prompt: 'Why is she crying?', answer: 'Bakit siya umiiyak?' }] }] };
  const st = T.defaults(), l = pk.lessons[0];
  T.recordAnswer(st, pk, l, l.exercises[1], false, new Date(2026, 10, 1, 20), 'bakit umiiyak siya'); // too old
  T.recordAnswer(st, pk, l, l.exercises[0], false, new Date(2026, 10, 25, 20), 'gusto kong magaaral ng tagalog');
  T.recordAnswer(st, pk, l, l.exercises[1], false, new Date(2026, 10, 25, 20, 5), 'bakit umiiyak siya');
  T.recordAnswer(st, pk, l, l.exercises[1], false, new Date(2026, 10, 25, 20, 9), 'bakit umiiyak siya');
  T.recordAnswer(st, pk, l, l.exercises[0], true, new Date(2026, 10, 25, 20, 10), 'gusto kong mag-aral ng tagalog');
  st.answers.push({ at: new Date(2026, 10, 25, 21).toISOString(), pack: 'gone', day: 1, ok: false, prompt: 'x', hint: 'order' }); // pack no longer there
  const out = T.slips(st, [pk], new Date(2026, 10, 26, 12));
  assert.deepStrictEqual(out.map((x) => [x.kind, x.answer, x.given]), [['pronoun', 'Bakit siya umiiyak?', 'bakit umiiyak siya'], ['aspect', 'Gusto kong mag-aral ng Tagalog.', 'gusto kong magaaral ng tagalog']]);
  assert.strictEqual(T.slips(st, [pk], new Date(2026, 10, 26, 12), 1).length, 1, 'at most n');
  assert.deepStrictEqual(T.slips(T.defaults(), [pk], new Date()), []);
  const set = T.slipSet(st, [pk], new Date(2026, 10, 26, 12));
  assert.strictEqual(set.length, out.length, 'slipSet: one exercise per slip');
  set.forEach((x, i) => { assert.strictEqual(x.pack, pk); assert.strictEqual(x.ex.answer, out[i].answer); assert.ok(x.lesson && x.lesson.day); });
  assert.deepStrictEqual(T.slipSet(T.defaults(), [pk], new Date()), []);
  // the pack was corrected later (same id, the sentence reworded): the old slip has no exercise any more and is left out
  const fixed = JSON.parse(JSON.stringify(pk));
  fixed.lessons.forEach((l) => (l.exercises || []).forEach((e) => { if (e.prompt) e.prompt = e.prompt + ' (reworded)'; if (e.say) e.say = e.say + ' na'; }));
  assert.deepStrictEqual(T.slipSet(st, [fixed], new Date(2026, 10, 26, 12)), [], 'replaced pack: nothing broken offered');
  assert.deepStrictEqual(T.slips(st, [fixed], new Date(2026, 10, 26, 12)), []);
  assert.deepStrictEqual(T.slipSet(st, [], new Date(2026, 10, 26, 12)), [], 'pack gone');
});
t('practiceSet: among equally missed exercises, a verb-form or linker slip comes first (until answered right)', () => {
  const pk = { id: '2026-11-25', lessons: [{ day: 1, exercises: [
    { type: 'type', prompt: 'A', answer: 'Kumakain ako ngayon.' },
    { type: 'type', prompt: 'B', answer: 'Gusto kong mag-aral ng Tagalog.' },
    { type: 'type', prompt: 'C', answer: 'Bakit siya umiiyak?' }] }] };
  const st = T.defaults(), l = pk.lessons[0]; st.done['2026-11-25/1'] = '2026-11-25T20:00:00Z';
  T.recordAnswer(st, pk, l, l.exercises[0], false, new Date(2026, 10, 25, 20, 1), 'hindi ko alam'); // plain miss, oldest
  T.recordAnswer(st, pk, l, l.exercises[1], false, new Date(2026, 10, 25, 20, 2), 'gusto kong magaaral ng tagalog'); // verb form
  T.recordAnswer(st, pk, l, l.exercises[2], false, new Date(2026, 10, 25, 20, 3), 'bakit umiiyak siya'); // pronoun: not a rule slip
  assert.strictEqual(st.answers[1].hint, 'aspect');
  assert.deepStrictEqual(T.practiceSet(st, [pk], 3).map((x) => x.ex.prompt), ['B', 'A', 'C']);
  T.recordAnswer(st, pk, l, l.exercises[1], true, new Date(2026, 10, 25, 21), 'gusto kong mag-aral ng tagalog');
  assert.deepStrictEqual(T.practiceSet(st, [pk], 3).map((x) => x.ex.prompt), ['A', 'C', 'B'], 'got it right since: no longer first (and answered most recently)');
  // an earlier-day slip logged AFTER a newer right answer (or mixed timezone offsets) must not override newer mastery
  const st2 = T.defaults(); st2.done['2026-11-25/1'] = '2026-11-25T20:00:00Z';
  T.recordAnswer(st2, pk, l, l.exercises[0], false, new Date(2026, 10, 25, 19, 0), 'hindi ko alam'); // 1 plain miss (oldest)
  st2.answers.push({ at: '2026-11-25T20:00:00-04:00', pack: pk.id, day: 1, ok: true, prompt: 'B', type: 'type' }); // Nov 26 00:00Z: newer mastery
  st2.answers.push({ at: '2026-11-25T23:00:00Z', pack: pk.id, day: 1, ok: false, prompt: 'B', type: 'type', hint: 'aspect' }); // Nov 25 23:00Z: older slip logged later
  assert.deepStrictEqual(T.practiceSet(st2, [pk], 3).map((x) => x.ex.prompt), ['A', 'B', 'C'], 'older slip appended after newer right answer does not outrank older plain miss');
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
  assert.deepStrictEqual(sum.hints, [{ kind: 'pronoun', about: T.HINT_ABOUT.pronoun, prompt: 'Why is she crying?', given: 'bakit umiiyak siya' }]);
  for (const k of T.HINT_KINDS) assert.ok(T.HINT_ABOUT[k] && T.HINT_ABOUT[k].length > 20, 'every hint kind is explained for the lesson writer: ' + k);
  for (const k of T.HINT_KINDS) assert.ok(T.HINT_LABEL[k], 'every hint kind has a label: ' + k);
  assert.deepStrictEqual(Object.keys(T.HINT_LABEL).sort(), T.HINT_KINDS.slice().sort());
});
t('a word still missed in a review repeat counts toward Hard words; no box or due change; kept by validate', () => {
  const s = T.defaults();
  s.cards = { salamat: { en: 'thank you', box: 2, due: '2026-11-30', seen: 4, right: 3, wrong: 1, from: 'x' }, tubig: { en: 'water', box: 3, due: '2026-12-02', seen: 4, right: 4, wrong: 0, from: 'x' } };
  assert.deepStrictEqual(T.weakWords(s), ['salamat']);
  T.againMiss(s, 'tubig'); T.againMiss(s, 'tubig'); T.againMiss(s, 'nope');
  assert.deepStrictEqual([s.cards.tubig.box, s.cards.tubig.due, s.cards.tubig.wrong], [3, '2026-12-02', 0], 'schedule untouched');
  assert.deepStrictEqual(T.weakWords(s), ['tubig', 'salamat'], '2 misses in 6 tries beats 1 in 4');
  const v = T.validate(Object.assign({}, JSON.parse(JSON.stringify(s)), {
    cards: Object.assign({}, JSON.parse(JSON.stringify(s)).cards, {
      ghost: null,
      badDue: { en: 'broken', due: '2026-02-30', againMiss: 3 },
      infMiss: { en: 'water', due: '2026-12-02', againMiss: Infinity }
    })
  }));
  assert.strictEqual(v.cards.tubig.againMiss, 2);
  assert.strictEqual(v.cards.salamat.againMiss, undefined);
  assert.strictEqual(v.cards.ghost, undefined, 'null card dropped without throwing');
  assert.strictEqual(v.cards.badDue, undefined, 'invalid card with againMiss dropped without throwing');
  assert.strictEqual(v.cards.infMiss.againMiss, undefined, 'non-finite againMiss ignored');
});
t('validate keeps the day a card was last reviewed (card.last); drops a bad one', () => {
  const s = T.defaults();
  s.cards.tubig = { en: 'water', box: 2, due: '2026-11-30', seen: 3, right: 2, wrong: 1, from: '2026-11-18/1', last: '2026-11-26' };
  s.cards.gatas = { en: 'milk', box: 1, due: '2026-11-27', seen: 1, right: 0, wrong: 1, from: '2026-11-18/1', last: 'yesterday' };
  const v = T.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.cards.tubig.last, '2026-11-26');
  assert.ok(!('last' in v.cards.gatas));
});
t('linkerHint parity: split helpers match original three-branch behaviour across every bundled pack and fixtures', () => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'packs');
  const PRON = ['ako', 'ka', 'siya', 'kami', 'tayo', 'sila', 'kayo', 'ko', 'mo', 'niya', 'namin', 'natin', 'nila', 'ninyo'];
  const normHo = (s) => T.norm(s).replace(/\bho\b/g, 'po');
  // Reference copy of the original monolithic linkerHint for exact parity verification
  function refLinkerHint(ex, given) {
    if (!ex || !ex.answer || ex.type !== 'type' || T.check(ex, given)) return '';
    const gw = normHo(given).split(' ').filter(Boolean);
    if (gw.length < 2) return '';
    const cands = [ex.answer].concat(ex.accept || []);
    for (let i = 0; i < cands.length; i++) {
      const cw = normHo(cands[i]).split(' '), show = i === 0 ? ex.answer : cands[i];
      if (cw.length === gw.length) {
        const diff = [];
        for (let k = 0; k < cw.length; k++) if (cw[k] !== gw[k]) diff.push(k);
        if (diff.length === 1 && cw[diff[0]] === gw[diff[0]] + 'ng' && gw[diff[0]].length >= 2) return 'Almost: add the linker -ng (' + cw[diff[0]] + '): ' + show;
        if (diff.length === 1 && gw[diff[0]] === cw[diff[0]] + 'ng' && PRON.indexOf(cw[diff[0]]) >= 0) {
          const w0 = cw[diff[0]], prev = cw.slice(0, diff[0]).filter((w) => ['pa', 'na', 'po'].indexOf(w) < 0).pop();
          return 'Almost: no linker here (' + w0 + ', not ' + w0 + 'ng' + (prev === 'hindi' || prev === 'di' ? ', after hindi' : '') +
            '). The -ng only links a describing word like palagi or gusto to what follows (palagi siyang masaya): ' + show;
        }
      }
      if (cw.length === gw.length + 1) {
        for (let j = 1; j < cw.length - 1; j++) {
          if (cw[j] === 'na' && cw.slice(0, j).concat(cw.slice(j + 1)).join(' ') === gw.join(' ')) return 'Almost: add the linker na (' + cw[j - 1] + ' na ' + cw[j + 1] + '): ' + show;
        }
      }
    }
    const hi = gw.indexOf('hindi') >= 0 ? gw.indexOf('hindi') : gw.indexOf('di');
    if (hi >= 0) {
      let j2 = hi + 1; while (j2 < gw.length && ['pa', 'na', 'po'].indexOf(gw[j2]) >= 0) j2++;
      const gp = gw[j2] || '', base = gp.replace(/ng$/, '');
      if (gp !== base && PRON.indexOf(base) >= 0) {
        const ans = normHo(ex.answer).split(' ');
        if (ans.indexOf(base) >= 0 && (ans.indexOf('hindi') >= 0 || ans.indexOf('di') >= 0) && ans.indexOf(gp) < 0)
          return 'Almost: no linker here (' + base + ', not ' + gp + ', after hindi). The -ng only links a describing word like palagi or gusto to what follows (palagi siyang masaya): ' + ex.answer;
      }
    }
    return '';
  }
  const cases = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d\d-\d\d\.json$/.test(x))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const l of p.lessons) for (const ex of l.exercises) {
      if (ex.type !== 'type' || !ex.answer) continue;
      for (const a of [ex.answer].concat(ex.accept || [])) {
        cases.push([ex, a]);
        const ws = normHo(a).split(' ');
        ws.forEach((w, idx) => {
          if (w.endsWith('ng') && w.length >= 4) { const m = ws.slice(); m[idx] = w.slice(0, -2); cases.push([ex, m.join(' ')]); }
          if (w === 'na' && idx > 0 && idx < ws.length - 1) { const m = ws.slice(0, idx).concat(ws.slice(idx + 1)); cases.push([ex, m.join(' ')]); }
          if (PRON.indexOf(w) >= 0) {
            const m = ws.slice(); m[idx] = w + 'ng'; cases.push([ex, m.join(' ')]);
            const m2 = m.slice(); m2[m2.length - 1] = 'ibangsalita'; cases.push([ex, m2.join(' ')]);
          }
        });
      }
    }
  }
  // Fixture cases covering all three branches + non-triggers
  const fixtures = [
    [{ type: 'type', answer: 'Gusto kong mag-aral ng Tagalog.' }, 'gusto ko mag-aral ng tagalog'],
    [{ type: 'type', answer: 'Apat na buwan akong naka-leave.' }, 'apat buwan akong naka leave'],
    [{ type: 'type', answer: 'Hindi ako pagod.', accept: ['hindi po ako pagod', 'di ako pagod'] }, 'Hindi akong pagod'],
    [{ type: 'type', answer: 'Hindi ako pagod.', accept: ['hindi po ako pagod', 'di ako pagod'] }, 'di akong pagod'],
    [{ type: 'type', answer: 'Hindi ako pagod.', accept: ['hindi po ako pagod', 'di ako pagod'] }, 'Hindi po akong pagod'],
    [{ type: 'type', answer: 'Hindi pa siya natutulog.' }, 'Hindi pa siyang tulog'],
    [{ type: 'type', answer: 'Pagod ako ngayon.' }, 'pagod akong ngayon'],
    [{ type: 'type', answer: 'Malaki ang bahay.' }, 'malaki ang bahayng'],
    [{ type: 'type', answer: 'Palagi kaming naglalaro.' }, 'palagi kami naglalaro'],
    [{ type: 'type', answer: 'Salamat po.' }, 'salamat']
  ];
  let hits = 0;
  for (const [ex, g] of cases.concat(fixtures)) {
    const got = T.linkerHint(ex, g), exp = refLinkerHint(ex, g);
    assert.strictEqual(got, exp, 'mismatch for "' + g + '" on "' + ex.answer + '"');
    if (got) hits++;
  }
  assert.ok(cases.length >= 20 && hits >= 10, 'tested real pack mutations + fixtures: ' + cases.length + ' cases, ' + hits + ' hints');
});
console.log(n + ' tagalog unit tests passed');
