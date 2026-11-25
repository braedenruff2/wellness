/* Calm logic tests. */
'use strict';
const assert = require('assert');
const K = require('../../../app/www/modules/calm/calm-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
t('pacer phases: box 4-4-4-4, slow skips zero-length holds, circle grows on in and shrinks on out', () => {
  assert.strictEqual(K.pacerAt('box', 0).label, 'Breathe in');
  assert.strictEqual(K.pacerAt('box', 5).label, 'Hold');
  assert.strictEqual(K.pacerAt('box', 9).label, 'Breathe out');
  assert.strictEqual(K.pacerAt('box', 13).phase, 3);
  assert.strictEqual(K.pacerAt('box', 16).phase, 0, 'wraps');
  assert.strictEqual(K.pacerAt('slow', 5.5).label, 'Breathe out', 'no hold in slow breathing');
  assert.strictEqual(K.pacerAt('slow', 10.9).phase, 2);
  assert.strictEqual(K.pacerAt('slow', 11.1).phase, 0);
  assert.ok(Math.abs(K.pacerAt('slow', 2.5).scale - 0.5) < 1e-9);
  assert.strictEqual(K.pacerAt('box', 6).scale, 1); assert.ok(K.pacerAt('box', 11).scale < 0.3);
});
t('every practice is complete; guided scripts end without quiet', () => {
  const ids = new Set();
  for (const p of K.PRACTICES) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(p.title && p.when && p.minutes);
    if (p.kind === 'pacer') assert.ok(K.PACERS[p.pacer]);
    if (p.kind === 'guided') { assert.ok(p.steps.length >= 4); assert.strictEqual(p.steps[p.steps.length - 1].wait, 0); }
  }
});
t('stats, stress change, advice and suggestions', () => {
  const s = K.defaults(), now = new Date(2026, 10, 18, 14);
  assert.ok(/one-minute reset/i.test(K.advice(s, now)));
  K.record(s, 'slow', 5, 4, 2, new Date(2026, 10, 18, 9));
  K.record(s, 'box', 3.04, 3, 2, new Date(2026, 10, 17, 9));
  K.record(s, 'sigh', 1, 5, 3, new Date(2026, 10, 10, 9));
  K.record(s, 'body', 8, 9, 0, new Date(2026, 10, 16, 9)); // out-of-range ratings ignored
  const st = K.stats(s, now);
  assert.strictEqual(st.weekMins, 16); assert.strictEqual(st.weekDays, 3); assert.strictEqual(st.rated, 3);
  assert.ok(Math.abs(st.avgDrop - 5 / 3) < 1e-9);
  assert.ok(/calmer afterwards/.test(K.advice(s, now)));
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 23)), 'sleep');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 3)), 'night');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 7)), 'walk', 'slow breathing was done today; walk never done');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 19, 7)), 'walk');
});
t('validate drops unknown practices and bad numbers', () => {
  const v = K.validate({ sessions: [
    { id: 'slow', date: '2026-11-18', mins: 5, before: 3 },
    { id: 'x', date: '2026-11-18', mins: 5 },
    { id: 'box', date: 'no', mins: 1 },
    { id: 'box', date: '2026-11-18', mins: 9999 },
    { id: 'box', date: '2026-11-18', mins: NaN },
    { id: 'box', date: '2026-11-18', mins: Infinity }
  ], settings: { minutes: 7 } });
  assert.strictEqual(v.sessions.length, 2); assert.strictEqual(v.sessions[1].mins, 240); assert.strictEqual(v.settings.minutes, 5);
  assert.strictEqual(K.validate(null), null);
  const s = K.defaults();
  assert.strictEqual(K.record(s, 'slow', NaN).mins, 0);
});
t('his report: after finishing the body scan, today is done and the suggestion is a different practice', () => {
  const s = K.defaults(), at = new Date(2026, 10, 19, 15);
  assert.strictEqual(K.suggest(s, at), 'sigh', 'first time ever: the one-minute reset');
  K.record(s, 'sigh', 1, null, null, new Date(2026, 10, 18, 10));
  assert.strictEqual(K.today(s, at).done, false);
  const first = K.suggest(s, at);
  assert.strictEqual(first, 'body');
  K.record(s, 'body', 10, 3, 2, new Date(2026, 10, 19, 14, 30));
  const t = K.today(s, at);
  assert.deepStrictEqual([t.done, t.count, t.mins, t.ids], [true, 1, 10, ['body']]);
  assert.notStrictEqual(K.suggest(s, at), 'body', 'never suggests what was just done');
  assert.strictEqual(K.suggest(s, at), 'ground');
  // daily goal: default 10 min; a 1-min reset counts as partial progress until the goal is met
  const g = K.defaults();
  assert.strictEqual(K.goalOf(g), 10);
  K.record(g, 'sigh', 1, null, null, at);
  assert.strictEqual(K.today(g, at).any, true);
  assert.strictEqual(K.today(g, at).done, false, '1 min does not finish a 10 min daily goal');
  assert.strictEqual(K.today(g, at).goal, 10);
  g.settings.dailyGoal = 1;
  assert.strictEqual(K.today(g, at).done, true, '1 min finishes a 1 min rough-day goal');
  g.settings.dailyGoal = 20;
  K.record(g, 'slow', 10, null, null, at);
  assert.strictEqual(K.today(g, at).done, false, '11 of 20 min still in progress');
  K.record(g, 'body', 9, null, null, at);
  assert.strictEqual(K.today(g, at).done, true, '20 of 20 min meets goal');
  assert.strictEqual(K.validate({ sessions: [], settings: { dailyGoal: 20 } }).settings.dailyGoal, 20);
  assert.strictEqual(K.validate({ sessions: [], settings: { dailyGoal: 99 } }).settings.dailyGoal, 10);
  // the next days rotate through the daytime practices rather than repeating
  const seen = new Set();
  for (let d = 20; d < 27; d++) { const when = new Date(2026, 10, d, 15); const id = K.suggest(s, when); seen.add(id); K.record(s, id, 3, null, null, when); }
  assert.ok(seen.size >= 6, [...seen].join(','));
  assert.strictEqual(K.today(s, new Date(2026, 10, 27, 15)).done, false, 'a new day starts not done');
});
t('every practice done today: still suggests something (no crash)', () => {
  const s = K.defaults(), at = new Date(2026, 10, 19, 15);
  K.PRACTICES.forEach((p) => K.record(s, p.id, 1, null, null, at));
  assert.ok(K.PRACTICES.some((p) => p.id === K.suggest(s, at)));
  assert.ok(K.PRACTICES.some((p) => p.id === K.suggest(s, new Date(2026, 10, 19, 3))));
});
t('guided wording changes each time through; timing stays the same', () => {
  for (const p of K.PRACTICES.filter((x) => x.kind === 'guided')) {
    const v = K.VARIANTS[p.id];
    assert.ok(v, p.id + ' has other wordings');
    assert.strictEqual(v.length, p.steps.length, p.id);
    const a = K.scriptFor(p, 0), b = K.scriptFor(p, 1), c = K.scriptFor(p, K.variantCount(p));
    assert.deepStrictEqual(a.map((x) => x.say), p.steps.map((x) => x.say), 'first time: the original');
    assert.deepStrictEqual(a.map((x) => x.wait), b.map((x) => x.wait));
    assert.ok(a.every((x, i) => x.say !== b[i].say), p.id + ': every line differs the second time');
    assert.deepStrictEqual(c, a, 'wraps around');
    for (const x of K.scriptFor(p, 2)) { assert.ok(typeof x.say === 'string' && x.say.length > 10); assert.ok(!/\{|\}/.test(x.say)); }
  }
  const s = K.defaults(); K.record(s, 'body', 8); K.record(s, 'body', 8); K.record(s, 'slow', 5);
  assert.strictEqual(K.timesDone(s, 'body'), 2);
});
t('2-day rotation uses local dates (a session 3 evenings ago no longer counts as recent, in any time zone)', () => {
  const s = K.defaults();
  K.record(s, 'body', 8, 3, 2, new Date(2026, 10, 17, 21, 0)); // 9 pm local, three days ago
  const r = K.suggest(s, new Date(2026, 10, 20, 21, 30), { score: { body: 5 } });
  assert.strictEqual(r, 'body', 'liked and not recent: suggested (was skipped west of UTC)');
  const m = K.defaults();
  K.record(m, 'body', 8, 3, 2, new Date(2026, 10, 18, 7, 0)); // 7 am two days ago: still recent
  assert.notStrictEqual(K.suggest(m, new Date(2026, 10, 20, 21, 30), { score: { body: 2 } }), 'body');
});
t('pacer tick: off by default, kept by a backup, pitch follows the phase', () => {
  assert.strictEqual(K.defaults().settings.tick, false);
  assert.strictEqual(K.validate({ sessions: [], settings: { tick: true } }).settings.tick, true);
  assert.strictEqual(K.validate({ sessions: [], settings: { tick: 'yes' } }).settings.tick, false);
  assert.strictEqual(K.validate({ sessions: [] }).settings.tick, false);
  assert.deepStrictEqual([0, 1, 2, 3].map(K.tickFor), ['up', 'hold', 'down', 'hold']);
  // box: 4 phases a cycle; slow has no holds, so only in and out
  const phases = (id, secs) => { const out = []; let last = -1; for (let t = 0; t < secs; t += 0.25) { const a = K.pacerAt(id, t); if (a.phase !== last) { out.push(a.phase); last = a.phase; } } return out; };
  assert.deepStrictEqual(phases('box', 16), [0, 1, 2, 3]);
  assert.deepStrictEqual(phases('slow', 22), [0, 2, 0, 2]);
});
t('stats: logging for an earlier day ignores sessions on later dates', () => {
  const s = K.defaults();
  K.record(s, 'slow', 5, 4, 2, new Date(2026, 10, 20, 9));
  K.record(s, 'box', 3, 3, 2, new Date(2026, 10, 22, 9)); // later date
  const st = K.stats(s, new Date(2026, 10, 20, 18));
  assert.strictEqual(st.weekMins, 5); assert.strictEqual(st.weekDays, 1);
});
t('mind racing at night lately: grounding at bedtime, back-to-sleep after midnight; daytime unchanged', () => {
  const s = K.defaults();
  const d = (h) => new Date(2026, 10, 23, h, 0);
  assert.strictEqual(K.suggest(s, d(22), { racing: true }), 'ground');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 24, 2, 0), { racing: true }), 'night');
  assert.notStrictEqual(K.suggest(s, d(22), {}), 'ground');
  assert.strictEqual(K.suggest(s, d(14), { racing: true }), K.suggest(s, d(14), {}));
  // done today already: not suggested again
  K.record(s, 'ground', 3, 3, 2, d(21));
  assert.notStrictEqual(K.suggest(s, d(22), { racing: true }), 'ground');
});
t('validate rejects impossible calendar dates (2026-02-30, 2026-99-99) and keeps leap day', () => {
  const v = K.validate({ sessions: [
    { id: 'slow', date: '2026-02-30', mins: 5 },
    { id: 'box', date: '2026-99-99', mins: 3 },
    { id: 'sigh', date: '2028-02-29', mins: 1 }
  ] });
  assert.deepStrictEqual(v.sessions.map((x) => x.date), ['2028-02-29']);
});
console.log(n + ' calm unit tests passed');
