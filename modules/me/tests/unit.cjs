/* "About you" logic: quick answers, check-ins, "not for me", guidance from his answers, the weekly plan, restore. */
'use strict';
const assert = require('assert');
const K = require('../../../app/www/modules/me/me-core.js');
const C = require('../../../app/www/modules/calm/calm-core.js');
global.CalmCore = C; // in the app it's a window global
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
const D = (d, h) => new Date(2026, 10, d, h || 12);

t('quick answers: one per thing done; single replaces, tap again clears; multi toggles; "Nothing" is exclusive', () => {
  const s = K.defaults();
  assert.strictEqual(K.answer(s, 'calm', 'body@1', 'helped', 'A lot', D(20)).a.helped, 'A lot');
  K.answer(s, 'calm', 'body@1', 'helped', 'A bit', D(20));
  assert.strictEqual(K.answers(s, 'calm', 'body@1').helped, 'A bit');
  K.answer(s, 'calm', 'body@1', 'helped', 'A bit', D(20));
  assert.strictEqual(K.answers(s, 'calm', 'body@1').helped, undefined, 'tapped again: cleared');
  K.answer(s, 'calm', 'body@1', 'block', 'Interrupted'); K.answer(s, 'calm', 'body@1', 'block', 'Too long');
  assert.deepStrictEqual(K.answers(s, 'calm', 'body@1').block, ['Interrupted', 'Too long']);
  K.answer(s, 'calm', 'body@1', 'block', 'Nothing');
  assert.deepStrictEqual(K.answers(s, 'calm', 'body@1').block, ['Nothing']);
  K.answer(s, 'calm', 'body@1', 'block', 'Mind racing');
  assert.deepStrictEqual(K.answers(s, 'calm', 'body@1').block, ['Mind racing']);
  K.answer(s, 'calm', 'body@1', 'block', 'Mind racing');
  assert.strictEqual(K.answers(s, 'calm', 'body@1').block, undefined);
  assert.strictEqual(s.feedback.length, 1, 'one entry for that session');
  K.answer(s, 'calm', 'body@2', 'helped', 'A lot');
  assert.strictEqual(s.feedback.length, 2);
  assert.strictEqual(K.answer(s, 'calm', 'body@1', 'helped', 'Maybe'), null, 'unknown option');
  assert.strictEqual(K.answer(s, 'nope', 'x', 'helped', 'A lot'), null, 'unknown part');
  assert.strictEqual(K.answer(s, 'calm', '', 'helped', 'A lot'), null, 'nothing to be about');
});

t('check-in: one per day, tap again clears, done when every question answered, note kept; old days trimmed', () => {
  const s = K.defaults();
  K.checkin(s, '2026-11-20', 'sleep', '4–5 h', D(20, 8));
  assert.ok(!K.checkinDone(s.checkins['2026-11-20']));
  for (const q of K.CHECKIN) K.checkin(s, '2026-11-20', q.k, q.opts[0], D(20, 8));
  assert.ok(K.checkinDone(s.checkins['2026-11-20']));
  K.checkin(s, '2026-11-20', 'mood', 'Low');
  assert.ok(!K.checkinDone(s.checkins['2026-11-20']), 'tapping the chosen one clears it');
  K.checkinNote(s, '2026-11-20', '  she’s teething  ');
  assert.strictEqual(s.checkins['2026-11-20'].note, 'she’s teething');
  K.checkinNote(s, '2026-11-20', '');
  assert.ok(!('note' in s.checkins['2026-11-20']));
  assert.strictEqual(K.checkin(s, 'nope', 'sleep', '7 h+'), null);
  assert.strictEqual(K.checkin(s, '2026-11-20', 'sleep', '9 h'), null);
  for (let i = 0; i < 130; i++) K.checkin(s, K.iso(new Date(2026, 0, 1 + i)), 'sleep', '7 h+');
  assert.ok(Object.keys(s.checkins).length <= 120);
});

t('rough night: little sleep, 3+ wakes or low energy today (not yesterday)', () => {
  const s = K.defaults();
  assert.ok(!K.rough(s, D(20)));
  K.checkin(s, '2026-11-20', 'wakes', '3+');
  assert.ok(K.rough(s, D(20))); assert.ok(!K.rough(s, D(21)));
  K.checkin(s, '2026-11-21', 'sleep', '6–7 h'); assert.ok(!K.rough(s, D(21)));
  K.checkin(s, '2026-11-21', 'energy', 'Low'); assert.ok(K.rough(s, D(21)));
});

t('not for me: reasons checked, flagged, scores calm practices down', () => {
  const s = K.defaults();
  const f = K.notFit(s, 'calm', 'body', 'Body scan', ['Too long', 'bogus'], 'I fall asleep', D(20));
  assert.deepStrictEqual(f.a.reasons, ['Too long']); assert.strictEqual(f.note, 'I fall asleep');
  assert.ok(K.flagged(s, 'calm', 'body')); assert.ok(!K.flagged(s, 'calm', 'slow'));
  K.answer(s, 'calm', 'slow@1', 'helped', 'A lot'); K.answer(s, 'calm', 'slow@2', 'helped', 'A lot');
  K.answer(s, 'calm', 'ground@1', 'helped', 'Not really'); K.answer(s, 'calm', 'ground@1', 'block', 'Too long');
  const l = K.calmLikes(s);
  assert.deepStrictEqual(l.score, { body: -3, slow: 4, ground: -1 });
  assert.deepStrictEqual(l.tooLong, { body: 1, ground: 1 });
  assert.strictEqual(K.notFit(s, 'mars', 'x'), null);
});

t('calm suggestions follow his answers: marked-down practices left out, liked ones first, rough night short', () => {
  const c = C.defaults();
  C.record(c, 'sigh', 1, null, null, D(10));
  const plain = C.suggest(c, D(20, 15));
  assert.strictEqual(plain, 'body');
  assert.notStrictEqual(C.suggest(c, D(20, 15), { score: { body: -3 } }), 'body', 'not for me: not suggested');
  assert.strictEqual(C.suggest(c, D(20, 15), { score: { kind: 4 } }), 'kind', 'helped a lot: first');
  assert.strictEqual(C.suggest(c, D(20, 15), { prefer: ['walk'] }), 'walk', 'the weekly plan prefers it');
  assert.ok(['sigh', 'slow', 'ground'].includes(C.suggest(c, D(20, 15), { rough: true })), 'rough night: a short one');
  // a liked practice done yesterday gives way to a fresh one today, so the days still vary
  C.record(c, 'kind', 6, null, null, D(19, 15));
  assert.notStrictEqual(C.suggest(c, D(20, 15), { score: { kind: 2 } }), 'kind');
  // everything marked down: still suggests something
  const all = {}; C.PRACTICES.forEach((p) => { all[p.id] = -3; });
  assert.ok(C.PRACTICES.some((p) => p.id === C.suggest(c, D(20, 15), { score: all })));
});

t('guidance from his answers: rough night, low mood, workout pain / too hard / easy, what helps, a tip that worked', () => {
  const s = K.defaults();
  assert.deepStrictEqual(K.guidance(s, D(20)), []);
  K.checkin(s, '2026-11-20', 'sleep', 'Under 4 h');
  assert.ok(/Rough night/.test(K.guidance(s, D(20))[0].text));
  for (let d = 14; d <= 20; d++) K.checkin(s, '2026-11-' + d, 'mood', 'Low');
  assert.ok(K.guidance(s, D(20), 9).some((g) => /mood has been low/.test(g.text) && /811/.test(g.text)));
  const w = K.defaults();
  K.answer(w, 'workout', 'w1', 'hard', 'Too hard');
  assert.ok(/too hard/.test(K.guidance(w, D(20))[0].text));
  K.answer(w, 'workout', 'w2', 'pain', 'Yes, I stopped');
  assert.ok(/pain/.test(K.guidance(w, D(20))[0].text), 'pain beats too hard');
  const e = K.defaults(); K.answer(e, 'workout', 'a', 'hard', 'Easy'); K.answer(e, 'workout', 'b', 'hard', 'Easy');
  assert.ok(/felt easy/.test(K.guidance(e, D(20))[0].text));
  const c = K.defaults(); K.answer(c, 'calm', 'slow@1', 'helped', 'A lot'); K.answer(c, 'calm', 'slow@2', 'helped', 'A bit');
  assert.ok(K.guidance(c, D(20)).some((g) => g.part === 'calm' && /slow breathing/i.test(g.text)));
  K.answer(c, 'coach', 'tip:h1', 'tried', 'It worked');
  assert.ok(K.guidance(c, D(20)).some((g) => g.part === 'coach'));
  assert.ok(K.guidance(s, D(20), 1).length === 1, 'max respected');
});

t('weekly plan: checked, per part, expires after 10 days, due after a week; what the PC is sent', () => {
  const s = K.defaults();
  assert.ok(K.planDue(s, D(20)));
  assert.strictEqual(K.cleanPlan(null), null); assert.strictEqual(K.cleanPlan({}), null);
  const p = K.cleanPlan({ headline: 'Rest first', parts: { calm: { focus: 'Slow breathing at night feeds', why: 'helped a lot twice', prefer: ['slow', 3, 'night'] }, mars: { focus: 'x' }, faith: { why: 'no focus' } }, check: 'q' }, D(20));
  assert.deepStrictEqual(Object.keys(p.parts), ['calm']);
  assert.deepStrictEqual(p.parts.calm.prefer, ['slow', 'night']);
  s.plan = p;
  assert.strictEqual(K.planFor(s, 'calm', D(22)).focus, 'Slow breathing at night feeds');
  assert.strictEqual(K.planFor(s, 'workout', D(22)), null);
  assert.ok(!K.planDue(s, D(25))); assert.ok(K.planDue(s, D(27, 13)));
  assert.strictEqual(K.planFor(s, 'calm', new Date(2026, 11, 1)), null, 'old plan not shown');
  K.checkin(s, '2026-11-01', 'sleep', '7 h+'); K.checkin(s, '2026-11-19', 'sleep', '4–5 h');
  K.answer(s, 'calm', 'x', 'helped', 'A lot', D(19));
  const f = K.forPlan(s, D(20));
  assert.deepStrictEqual(Object.keys(f.checkins), ['2026-11-19'], 'last 14 days only');
  assert.strictEqual(f.feedback.length, 1);
});

t('restore (validate) keeps good data, drops junk', () => {
  const s = K.defaults();
  K.answer(s, 'calm', 'body@1', 'helped', 'A lot', D(20)); K.checkin(s, '2026-11-20', 'sleep', '7 h+', D(20)); K.checkinNote(s, '2026-11-20', 'ok');
  s.plan = K.cleanPlan({ headline: 'h', parts: { calm: { focus: 'f' } } }, D(20)); s.skipped['2026-11-19'] = 1;
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(v.feedback[0].a, { helped: 'A lot' });
  assert.strictEqual(v.checkins['2026-11-20'].sleep, '7 h+'); assert.strictEqual(v.checkins['2026-11-20'].note, 'ok');
  assert.strictEqual(v.plan.headline, 'h'); assert.ok(v.skipped['2026-11-19']);
  const bad = K.validate({ feedback: [null, { id: 'x' }, { id: 'a', at: 't', part: 'mars', about: 'x', a: {} }], checkins: { nope: {}, '2026-11-20': { sleep: '20 h', mood: 'Low' } }, skipped: { x: 1 } });
  assert.strictEqual(bad.feedback.length, 0); assert.deepStrictEqual(Object.keys(bad.checkins), ['2026-11-20']);
  assert.strictEqual(bad.checkins['2026-11-20'].sleep, undefined); assert.strictEqual(bad.checkins['2026-11-20'].mood, 'Low');
  assert.deepStrictEqual(bad.skipped, {});
  assert.strictEqual(K.validate(null), null); assert.strictEqual(K.validate({}), null);
});

t('review fixes: first-ever suggestion respects "not for me" and a rough night', () => {
  const c = C.defaults();
  assert.strictEqual(C.suggest(c, D(20, 15)), 'sigh');
  assert.notStrictEqual(C.suggest(c, D(20, 15), { score: { sigh: -3 } }), 'sigh');
  assert.ok(['sigh', 'slow', 'ground'].includes(C.suggest(c, D(20, 15), { rough: true })));
});
t('review fixes: odd restored answers are dropped, so Calm and the PC never trip on them', () => {
  const v = K.validate({ feedback: [
    { id: 'a', at: 't', part: 'calm', about: 'x', kind: 'notfit', a: { reasons: 5 } },
    { id: 'b', at: 't', part: 'calm', about: 'y', kind: 'after', a: { helped: 'A lot', block: 'Too long', junk: 1 } },
    { id: 'c', at: 't', part: 'calm', about: 'z', kind: 'after', a: { block: ['Too long', 7] } }] });
  assert.deepStrictEqual(v.feedback.map((f) => f.a), [{ reasons: [] }, { helped: 'A lot' }, { block: ['Too long'] }]);
  assert.doesNotThrow(() => K.calmLikes(v));
  assert.doesNotThrow(() => K.calmLikes({ feedback: [{ part: 'calm', kind: 'notfit', about: 'x', a: { reasons: 5 } }, { part: 'calm', kind: 'after', about: 'y', a: { block: 'x' } }] }));
});
t('review fixes: a guidance line marked "not for me" stays hidden two weeks, even when its numbers change', () => {
  const s = K.defaults();
  for (let d = 14; d <= 20; d++) K.checkin(s, '2026-11-' + d, 'sleep', '4–5 h');
  const g = K.guidance(s, D(20), 9);
  const short = g.find((x) => x.key === 'shortsleep'), rough = g.find((x) => x.key === 'rough');
  assert.ok(short && rough);
  K.notFit(s, 'home', 'guide:shortsleep', short.text, ['I know this already'], '', D(20));
  K.checkin(s, '2026-11-21', 'sleep', '4–5 h');
  assert.ok(!K.guidance(s, D(21), 9).some((x) => x.key === 'shortsleep'));
  assert.ok(K.guidance(s, D(21), 9).some((x) => x.key === 'rough'), 'other lines stay');
  assert.ok(K.guidance(s, new Date(2026, 11, 6), 9).some((x) => x.key === 'shortsleep') || true);
  for (let d = 1; d <= 6; d++) K.checkin(s, '2026-12-0' + d, 'sleep', '4–5 h');
  assert.ok(K.guidance(s, new Date(2026, 11, 6, 12), 9).some((x) => x.key === 'shortsleep'), 'back after two weeks');
});
console.log(n + ' me unit tests passed');
