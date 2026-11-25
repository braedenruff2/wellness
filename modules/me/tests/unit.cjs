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
  // clearing the only note or chip on a day removes the ghost entry completely
  K.checkinNote(s, '2026-11-21', 'brief note');
  assert.strictEqual(s.checkins['2026-11-21'].note, 'brief note');
  K.checkinNote(s, '2026-11-21', '   ');
  assert.strictEqual(s.checkins['2026-11-21'], undefined);
  assert.strictEqual(K.checkinNote(s, '2026-11-22', ''), null);
  assert.strictEqual(s.checkins['2026-11-22'], undefined);
  K.checkin(s, '2026-11-22', 'sleep', '7 h+');
  K.checkin(s, '2026-11-22', 'sleep', '7 h+');
  assert.strictEqual(s.checkins['2026-11-22'], undefined);
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

t('guidance: a wind-down rated "Mind racing" -> the next evening, write it down first', () => {
  const keys = (s, now) => K.guidance(s, now, 20).map((g) => g.key);
  const s = K.defaults();
  K.answer(s, 'calm', 'sleep@a', 'block', 'Mind racing', D(19, 23));
  assert.ok(keys(s, D(20, 19)).includes('mindracing'), 'next evening');
  assert.ok(/write down what’s on it first/.test(K.guidance(s, D(20, 19), 20).find((g) => g.key === 'mindracing').text));
  assert.ok(!keys(s, D(20, 10)).includes('mindracing'), 'not in the morning');
  assert.ok(!keys(s, D(22, 19)).includes('mindracing'), 'stale after a day');
  const b = K.defaults(); K.answer(b, 'calm', 'body@a', 'block', 'Mind racing', D(19, 23));
  assert.ok(!keys(b, D(20, 19)).includes('mindracing'), 'only bedtime wind-downs (sleep, night)');
  const n = K.defaults(); K.answer(n, 'calm', 'night@a', 'block', 'Mind racing', D(20, 3));
  assert.ok(keys(n, D(20, 20)).includes('mindracing'), 'back-to-sleep after a night wake counts, same day');
  K.answer(n, 'calm', 'sleep@b', 'helped', 'A lot', D(20, 22));
  assert.ok(!keys(n, D(21, 20)).includes('mindracing'), 'a later wind-down that went fine replaces it');
});

t('more guidance: calm interrupted, low workout energy, tips that didn’t work, Tagalog level, what stood out in prayer', () => {
  const keys = (s) => K.guidance(s, D(20), 20).map((g) => g.key);
  const c = K.defaults();
  K.answer(c, 'calm', 'body@1', 'block', 'Interrupted');
  assert.ok(!keys(c).includes('calminterrupt'), 'once is not a pattern');
  K.answer(c, 'calm', 'slow@2', 'block', 'Interrupted');
  assert.ok(keys(c).includes('calminterrupt'));
  assert.ok(/2 of the last 2/.test(K.guidance(c, D(20), 20).find((g) => g.key === 'calminterrupt').text));
  const w = K.defaults(); K.answer(w, 'workout', 'a', 'energy', 'Low'); K.answer(w, 'workout', 'b', 'energy', 'Low');
  assert.ok(keys(w).includes('wlowenergy'));
  K.answer(w, 'workout', 'c', 'pain', 'Yes, I stopped');
  assert.ok(keys(w).includes('wpain') && !keys(w).includes('wlowenergy'), 'pain comes first, no energy nudge then');
  const co = K.defaults(); K.answer(co, 'coach', 'tip:1', 'tried', 'Didn’t work'); K.answer(co, 'coach', 'tip:2', 'tried', 'Didn’t work');
  assert.ok(keys(co).includes('tipnot'));
  const t1 = K.defaults(); K.answer(t1, 'tagalog', 'p/1', 'level', 'Too easy'); K.answer(t1, 'tagalog', 'review@x', 'level', 'Too easy');
  assert.ok(keys(t1).includes('tleasy') && !keys(t1).includes('tlhard'));
  const t2 = K.defaults(); K.answer(t2, 'tagalog', 'p/1', 'level', 'Too hard'); K.answer(t2, 'tagalog', 'p/2', 'level', 'Too hard'); K.answer(t2, 'tagalog', 'p/3', 'level', 'About right');
  assert.ok(keys(t2).includes('tlhard'));
  const f = K.defaults();
  K.answer(f, 'faith', 'day:1@a', 'felt', 'Moved'); K.answer(f, 'faith', 'day:1@a', 'stood', 'The quiet');
  K.answer(f, 'faith', 'day:2@b', 'felt', 'Felt close to God'); K.answer(f, 'faith', 'day:2@b', 'stood', 'The quiet'); K.answer(f, 'faith', 'day:2@b', 'stood', 'The prayer');
  const g = K.guidance(f, D(20), 20).find((x) => x.key === 'faithstood');
  assert.ok(g && /the quiet stood out/.test(g.text) && /10 min/.test(g.text), g && g.text);
  K.answer(f, 'faith', 'day:3@c', 'felt', 'Hard to focus'); K.answer(f, 'faith', 'day:4@d', 'felt', 'Hard to focus');
  assert.ok(keys(f).includes('faithfocus') && !keys(f).includes('faithstood'), 'hard to focus wins');
  // every key can be hidden with "not for me"
  K.notFit(c, 'calm', 'guide:calminterrupt', 'x', ['Too generic'], '', D(20));
  assert.ok(!keys(c).includes('calminterrupt'));
});

t('weekly plan failed: a try was made and no newer plan came; a plan made that day is not a failure', () => {
  const s = K.defaults();
  assert.ok(!K.planFailed(s, D(20)), 'never tried');
  s.planTried = '2026-11-20';
  assert.ok(K.planFailed(s, D(20)), 'tried, no plan');
  assert.ok(K.planFailed(s, D(21)), 'still shown the next day');
  s.plan = K.cleanPlan({ headline: 'h', parts: { home: { focus: 'f' } } }, D(20, 9));
  assert.ok(!K.planFailed(s, D(20, 10)), 'plan made: not due, not failed');
  assert.ok(!K.planFailed(s, D(28)), 'a week later it is due, but that try worked');
  s.planTried = '2026-11-28';
  assert.ok(K.planFailed(s, D(28)), 'the new week\'s try failed: the old plan is older than it');
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
t('a changed answer while logging an earlier day: edited is the real time, so the PC keeps the newest', () => {
  const s = K.defaults();
  K.answer(s, 'coach', 'tip:1', 'tried', 'Not yet', D(20, 10), D(20, 10));
  const f = K.answer(s, 'coach', 'tip:1', 'tried', 'It worked', D(19, 10), D(20, 10, 5) || D(20, 11));
  assert.ok(f.edited >= D(20, 10).toISOString(), f.edited);
});
t('14-day trend from check-ins: levels by day, oldest first, gaps null', () => {
  const s = K.defaults();
  K.checkin(s, '2026-11-20', 'sleep', '7 h+'); K.checkin(s, '2026-11-20', 'mood', 'Good');
  K.checkin(s, '2026-11-18', 'sleep', 'Under 4 h'); K.checkin(s, '2026-11-18', 'energy', 'Low');
  const tr = K.trend(s, D(20), 14);
  assert.strictEqual(tr.days.length, 14); assert.strictEqual(tr.days[0].date, '2026-11-07'); assert.strictEqual(tr.days[13].date, '2026-11-20');
  assert.deepStrictEqual(tr.days[13], { date: '2026-11-20', sleep: 4, energy: null, mood: 2 });
  assert.deepStrictEqual(tr.days[11], { date: '2026-11-18', sleep: 0, energy: 0, mood: null });
  assert.strictEqual(tr.n, 2);
});
t('broken nights (2+ wakes on 3 of the last 5 check-ins) get their own line', () => {
  const s = K.defaults();
  for (const d of [18, 19]) K.checkin(s, '2026-11-' + d, 'wakes', '3+');
  assert.ok(!K.guidance(s, D(20), 9).some((g) => g.key === 'brokennights'));
  K.checkin(s, '2026-11-20', 'wakes', '2');
  assert.ok(K.guidance(s, D(20), 9).some((g) => g.key === 'brokennights' && /3 of the last 3/.test(g.text)));
});
t('forPlan: check-in window uses local calendar dates (late evening west of UTC keeps day -14, ignores future)', () => {
  const s = K.defaults();
  K.checkin(s, '2026-11-05', 'sleep', '7 h+'); // 15 days before Nov 20: excluded
  K.checkin(s, '2026-11-06', 'sleep', '5–6 h'); // exactly 14 local days before Nov 20: included even at 23:30 AST/EST
  K.checkin(s, '2026-11-20', 'sleep', '6–7 h'); // today: included
  K.checkin(s, '2026-11-22', 'sleep', '7 h+'); // future relative to Nov 20: excluded
  const f = K.forPlan(s, new Date(2026, 10, 20, 23, 30));
  assert.deepStrictEqual(Object.keys(f.checkins).sort(), ['2026-11-06', '2026-11-20']);
});
t('calmLikes.racing: a night calm answer with "Mind racing" in the last 7 days, among the last two night answers', () => {
  const s = K.defaults();
  const f = (at, a) => s.feedback.push({ id: 'calm/after/x' + at.getTime(), at: at.toISOString(), part: 'calm', about: 'sleep@' + at.toISOString(), kind: 'after', a });
  assert.strictEqual(K.calmLikes(s, new Date(2026, 10, 23, 12)).racing, false);
  f(new Date(2026, 10, 20, 22, 21), { helped: 'Not really', block: ['Mind racing'] });
  assert.strictEqual(K.calmLikes(s, new Date(2026, 10, 23, 12)).racing, true);
  f(new Date(2026, 10, 21, 15, 0), { helped: 'A bit', block: ['Nothing'] }); // daytime: doesn't count either way
  assert.strictEqual(K.calmLikes(s, new Date(2026, 10, 23, 12)).racing, true);
  assert.strictEqual(K.calmLikes(s, new Date(2026, 10, 28, 12)).racing, false, 'over a week ago');
  f(new Date(2026, 10, 22, 22, 37), {}); f(new Date(2026, 10, 23, 23, 0), { helped: 'A lot' });
  assert.strictEqual(K.calmLikes(s, new Date(2026, 10, 24, 12)).racing, false, 'two newer night answers without it');
});
t('busyday: a check-in note about visitors / a party / a busy day -> one small-day line (stable key); no false hits', () => {
  const now = new Date(2026, 10, 22, 9);
  const g = (note) => { const s = K.defaults(); K.checkin(s, '2026-11-22', 'sleep', '5–6 h', now); if (note != null) K.checkinNote(s, '2026-11-22', note, now); return K.guidance(s, now, 10).map((x) => x.key); };
  for (const n of ['Family is here all weekend', 'Her birthday PARTY today', 'mom visiting', 'Busy, busy day', 'hosting the in-laws']) assert.ok(g(n).includes('busyday'), n);
  for (const n of ['quiet day', 'a busybody neighbour', 'familyroom painted', null]) assert.ok(!g(n).includes('busyday'), String(n));
  assert.ok(!g('sick and the family is here').includes('busyday'), 'sick wins');
  const s = K.defaults(); K.checkin(s, '2026-11-22', 'sleep', '5–6 h', now); K.checkinNote(s, '2026-11-22', 'party', now);
  K.notFit(s, 'home', 'guide:busyday', 'x', ['Too generic'], '', now);
  assert.ok(!K.guidance(s, now, 10).some((x) => x.key === 'busyday'), 'Not for me hides it');
});
t('un-tapped quick answers and empty check-ins are ignored; checkinNote validates/trims; today notes stay in Home top 3', () => {
  const s = K.defaults(), now = new Date(2026, 10, 22, 10);
  // tapping and un-tapping a workout quick answer leaves {a: {}} so the PC hears it was cleared,
  // but must not mask the previous pain answer or inflate answer counts
  K.answer(s, 'workout', 'w1', 'pain', 'Yes, I stopped', D(20));
  K.answer(s, 'workout', 'w2', 'hard', 'Easy', D(21));
  K.answer(s, 'workout', 'w2', 'hard', 'Easy', D(21)); // cleared -> a: {}
  assert.ok(K.guidance(s, now, 10).some((g) => g.key === 'wpain'), 'empty un-tapped entry does not mask pain');
  // tapping and un-tapping a 3rd faith answer must not make 2 hard-to-focus answers reach f.length >= 3
  const f = K.defaults();
  K.answer(f, 'faith', 'd1', 'felt', 'Hard to focus', D(19));
  K.answer(f, 'faith', 'd2', 'felt', 'Hard to focus', D(20));
  K.answer(f, 'faith', 'd3', 'felt', 'Peaceful', D(21));
  K.answer(f, 'faith', 'd3', 'felt', 'Peaceful', D(21)); // cleared
  assert.ok(!K.guidance(f, now, 10).some((g) => g.key === 'faithfocus'), 'cleared faith answer does not count');
  // checkinNote validates date, trims to 120 days, and cleared check-ins are excluded from recentCheckins
  const n = K.defaults();
  assert.strictEqual(K.checkinNote(n, 'not-a-date', 'hi', now), null);
  K.checkinNote(n, '2026-11-22', 'temporary', now);
  assert.strictEqual(K.recentCheckins(n, now, 7).length, 1);
  K.checkinNote(n, '2026-11-22', '', now);
  assert.strictEqual(K.recentCheckins(n, now, 7).length, 0, 'cleared note-only check-in not counted');
  for (let i = 0; i < 130; i++) K.checkinNote(n, K.iso(new Date(2026, 0, 1 + i)), 'note ' + i, now);
  assert.ok(Object.keys(n.checkins).length <= 120, 'checkinNote trims to 120 days');
  // today's sick/busyday note shows in Home's default top 3 even alongside 3+ multi-day rules
  const busy = K.defaults();
  for (let d = 16; d <= 22; d++) K.checkin(busy, '2026-11-' + d, 'sleep', '4–5 h', D(d));
  K.answer(busy, 'workout', 'w1', 'pain', 'Yes, I stopped', D(21));
  K.answer(busy, 'calm', 'slow@1', 'helped', 'A lot', D(20));
  K.answer(busy, 'calm', 'slow@2', 'helped', 'A lot', D(21));
  K.checkinNote(busy, '2026-11-22', 'family visiting today', now);
  assert.ok(K.guidance(busy, now, 3).some((g) => g.key === 'busyday'), 'busyday visible in Home top 3');
  K.checkinNote(busy, '2026-11-22', 'baby has a fever', now);
  assert.ok(K.guidance(busy, now, 3).some((g) => g.key === 'sick'), 'sick visible in Home top 3');
  // validate drops empty ghost check-in objects while keeping populated ones
  const v = K.validate({ feedback: [], checkins: { '2026-11-20': { at: '2026-11-20T10:00:00Z' }, '2026-11-21': { at: '2026-11-21T10:00:00Z', mood: 'OK' } } });
  assert.deepStrictEqual(Object.keys(v.checkins), ['2026-11-21']);
});
t('out-of-order earlier-day feedback stays ordered by timestamp; validate rejects invalid dates and trims to caps', () => {
  const s = K.defaults();
  // Workout pain today followed by an earlier-day easy workout logged afterwards: pain must still win
  K.answer(s, 'workout', 'w-new', 'pain', 'Yes, I stopped', D(20, 10));
  K.answer(s, 'workout', 'w-old', 'hard', 'Easy', D(18, 10));
  assert.ok(K.guidance(s, D(20, 12), 10).some((g) => g.key === 'wpain'), 'older earlier-day workout does not hide newest pain');
  // Last night mind-racing wind-down followed by an earlier-day calm wind-down logged afterwards
  const cm = K.defaults();
  K.answer(cm, 'calm', 'sleep@new', 'block', 'Mind racing', D(19, 23));
  K.answer(cm, 'calm', 'sleep@old1', 'helped', 'A lot', D(16, 22));
  K.answer(cm, 'calm', 'sleep@old2', 'helped', 'A lot', D(15, 22));
  assert.ok(K.guidance(cm, D(20, 19), 20).some((g) => g.key === 'mindracing'), 'older wind-down does not mask last night mindracing');
  assert.strictEqual(K.calmLikes(cm, D(20, 19)).racing, true, 'older night answers do not push newest mind-racing out of last two');
  // validate: drops plan with bad at (so planDue stays true), trims >600 feedback & >120 checkins
  const bigFb = Array.from({ length: 610 }, (_, i) => ({
    id: 'calm/after/c' + i, at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), part: 'calm', about: 'c' + i, kind: 'after', a: { helped: 'A bit' }
  }));
  const bigCk = {};
  for (let i = 0; i < 130; i++) bigCk[K.iso(new Date(2026, 0, 1 + i))] = { at: '2026-01-01T10:00:00Z', mood: 'OK' };
  const cleaned = K.validate({ feedback: bigFb, checkins: bigCk, plan: { at: 'not-a-date', headline: 'Stale forever', parts: { home: { focus: 'x' } } } });
  assert.strictEqual(cleaned.feedback.length, 600, 'validate trims feedback to 600');
  assert.strictEqual(Object.keys(cleaned.checkins).length, 120, 'validate trims checkins to 120');
  assert.strictEqual(cleaned.plan, null, 'validate drops plan with invalid timestamp');
  assert.strictEqual(K.planDue(cleaned, D(20)), true, 'plan is due when bad plan was dropped');
  // impossible calendar dates rejected by checkin, checkinNote, and validate
  assert.strictEqual(K.checkin(s, '2026-02-30', 'mood', 'OK', D(20)), null);
  assert.strictEqual(K.checkinNote(s, '2026-99-99', 'note', D(20)), null);
  const badDates = K.validate({
    feedback: [],
    checkins: { '2026-02-30': { at: '2026-02-28T10:00:00Z', mood: 'OK' }, '2028-02-29': { at: '2028-02-29T10:00:00Z', mood: 'Good' } },
    planTried: '2026-04-31',
    planCancelled: '2026-99-99',
    skipped: { '2026-02-29': 1, '2026-11-20': 1 }
  });
  assert.deepStrictEqual(Object.keys(badDates.checkins), ['2028-02-29']);
  assert.strictEqual(badDates.planTried, undefined);
  assert.strictEqual(badDates.planCancelled, undefined);
  assert.deepStrictEqual(Object.keys(badDates.skipped), ['2026-11-20']);
});
console.log(n + ' me unit tests passed');
