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
  // the meditation path's sits keep the same words: the instructions are the technique being practised
  for (const p of K.PRACTICES.filter((x) => x.kind === 'guided' && !x.path)) {
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
t('stats and suggest: earlier-day bounds ignore future sessions and compare timestamps chronologically across timezone offsets', () => {
  const s = K.defaults();
  K.record(s, 'slow', 5, 4, 2, new Date(2026, 10, 20, 9));
  K.record(s, 'box', 3, 5, 1, new Date(2026, 10, 22, 9)); // later date
  K.record(s, 'box', 3, 5, 1, new Date(2026, 10, 23, 9)); // later date
  const st = K.stats(s, new Date(2026, 10, 20, 18));
  assert.strictEqual(st.weekMins, 5); assert.strictEqual(st.weekDays, 1);
  assert.strictEqual(st.total, 1, 'total ignores later-date sessions');
  assert.strictEqual(st.rated, 1, 'rated ignores later-date sessions');
  assert.strictEqual(st.avgDrop, 2, 'avgDrop ignores later-date ratings');
  assert.deepStrictEqual(K.feltScores(s, new Date(2026, 10, 20, 18)), {}, 'feltScores bounded at now ignores later sessions');

  // suggest() ignores future sessions for 2-day rotation and first-ever check
  const f = K.defaults();
  K.record(f, 'body', 8, 3, 2, new Date(2026, 10, 22, 12)); // future relative to Nov 20
  assert.strictEqual(K.suggest(f, new Date(2026, 10, 20, 14)), 'sigh', 'no sessions on or before Nov 20 -> first-ever reset');
  K.record(f, 'slow', 5, 3, 2, new Date(2026, 10, 15, 12));
  assert.strictEqual(K.suggest(f, new Date(2026, 10, 20, 14), { score: { body: 5 } }), 'body', 'future body session does not trigger 2-day penalty on Nov 20');

  // mixed timezone offsets: 2026-11-10T22:00-04:00 (Nov 11 02:00Z) is NEWER than 2026-11-11T01:00Z
  const tz = K.defaults();
  tz.sessions.push(
    { id: 'sleep', date: '2026-11-10', at: '2026-11-10T22:00:00-04:00', mins: 8, before: null, after: null },
    { id: 'body', date: '2026-11-11', at: '2026-11-11T01:00:00Z', mins: 8, before: null, after: null },
    { id: 'shuffle', date: '2026-11-15', at: '2026-11-15T12:00:00Z', mins: 5, before: null, after: null },
    { id: 'slow', date: '2026-11-15', at: '2026-11-15T13:00:00Z', mins: 5, before: null, after: null }
  );
  assert.strictEqual(K.suggest(tz, new Date(2026, 10, 20, 23, 0)), 'body', 'chronologically older UTC session beats lexicographically earlier -04:00 session');

  // stats().rated takes the true newest 20 sessions chronologically even if an older session was logged later
  const many = K.defaults();
  for (let i = 0; i < 20; i++) {
    many.sessions.push({ id: 'slow', date: '2026-11-18', at: new Date(Date.UTC(2026, 10, 18, 12, i)).toISOString(), mins: 5, before: 4, after: 3 });
  }
  many.sessions.push({ id: 'slow', date: '2026-11-01', at: '2026-11-01T12:00:00Z', mins: 5, before: 5, after: 1 }); // older, appended last
  const mst = K.stats(many, new Date(2026, 10, 20, 12));
  assert.strictEqual(mst.rated, 20);
  assert.strictEqual(mst.avgDrop, 1, 'chronologically older appended session falls outside newest 20');
});
t('mind racing at night lately: picture-word shuffle at bedtime, back-to-sleep after midnight; daytime unchanged', () => {
  const s = K.defaults();
  const d = (h) => new Date(2026, 10, 23, h, 0);
  assert.strictEqual(K.suggest(s, d(22), { racing: true }), 'shuffle');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 24, 2, 0), { racing: true }), 'night');
  assert.notStrictEqual(K.suggest(s, d(22), {}), 'ground');
  assert.strictEqual(K.suggest(s, d(14), { racing: true }), K.suggest(s, d(14), {}));
  K.record(s, 'slow', 5, 3, 2, new Date(2026, 10, 20, 12, 0)); // (with no sessions at all, before 22:00 the first one is the reset)
  assert.strictEqual(K.suggest(s, d(21), { racing: true }), 'shuffle', '9 pm too, though it is not in the evening list');
  // done today already: not suggested again; grounding is next
  K.record(s, 'shuffle', 5, 3, 2, d(21));
  assert.strictEqual(K.suggest(s, d(22), { racing: true }), 'ground');
});
t('mind racing, and grounding "Not really" three nights running: it stops being suggested; the shuffle takes over', () => {
  const s = K.defaults();
  [20, 21, 22].forEach((day) => K.record(s, 'ground', 3.2, 3, 3, new Date(2026, 10, day, 21, 30)));
  const at = new Date(2026, 10, 23, 21, 30);
  assert.strictEqual(K.suggest(s, at, { racing: true, score: { ground: -3 } }), 'shuffle');
  // the shuffle didn't help either (twice): grounding isn't back; something else that fits the evening is
  K.record(s, 'shuffle', 5, 3, 3, new Date(2026, 10, 19, 22, 0));
  const r = K.suggest(s, at, { racing: true, score: { ground: -3, shuffle: -2 } });
  assert.ok(['ground', 'shuffle'].indexOf(r) < 0, r);
  // after midnight with a racing mind: back-to-sleep first, the shuffle when that was done tonight
  const n = new Date(2026, 10, 24, 2, 30);
  assert.strictEqual(K.suggest(s, n, { racing: true }), 'night');
  K.record(s, 'night', 5, 3, 2, new Date(2026, 10, 24, 2, 0));
  assert.strictEqual(K.suggest(s, n, { racing: true }), 'shuffle');
});
t('validate rejects impossible calendar dates (2026-02-30, 2026-99-99) and keeps leap day', () => {
  const v = K.validate({ sessions: [
    { id: 'slow', date: '2026-02-30', mins: 5 },
    { id: 'box', date: '2026-99-99', mins: 3 },
    { id: 'sigh', date: '2028-02-29', mins: 1 }
  ] });
  assert.deepStrictEqual(v.sessions.map((x) => x.date), ['2028-02-29']);
});
t('feltScores: his own before/after ratings nudge suggestions (2+ rated sessions; last 10)', () => {
  const s = K.defaults(), d = (day, h) => new Date(2026, 10, day, h || 21, 30);
  K.record(s, 'ground', 3, 3, 3, d(20)); K.record(s, 'ground', 3, 3, 3, d(21)); // stressed, no change: -1
  K.record(s, 'body', 8, 2, 1, d(15)); K.record(s, 'body', 8, 1, 1, d(16)); // 0.5 calmer on average: +1
  K.record(s, 'slow', 5, 4, 2, d(17)); // one rating: nothing
  K.record(s, 'sigh', 1, 2, 2, d(18)); K.record(s, 'sigh', 1, 2, 2, d(19)); // no change but not stressed: nothing
  K.record(s, 'box', 3, null, null, d(18)); K.record(s, 'box', 3, null, null, d(19)); // unrated: nothing
  assert.deepStrictEqual(K.feltScores(s), { ground: -1, body: 1 });
  // eleven old good ones, then ten flat ones: only the last ten count
  const m = K.defaults();
  for (let i = 0; i < 11; i++) K.record(m, 'kind', 6, 4, 1, new Date(2026, 9, 1 + i, 12));
  for (let i = 0; i < 10; i++) K.record(m, 'kind', 6, 3, 3, new Date(2026, 10, 1 + i, 12));
  assert.deepStrictEqual(K.feltScores(m), { kind: -1 });
  // in suggest: at 10 pm body (felt +1) leads sleep and the never-done shuffle; ground (-1) never leads
  const r = K.suggest(s, new Date(2026, 10, 22, 22, 0));
  assert.strictEqual(r, 'body');
});
t('five "Not really" in a row: the daytime suggestion is the mindful walk; evenings and fewer misses unchanged', () => {
  const s = K.defaults();
  K.record(s, 'slow', 5, 3, 3, new Date(2026, 10, 20, 12));
  const noon = new Date(2026, 10, 23, 12, 0);
  assert.strictEqual(K.suggest(s, noon, { flat: 5 }), 'walk');
  assert.strictEqual(K.suggest(s, noon, { flat: 4 }), K.suggest(s, noon, {}));
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 23, 22, 0), { flat: 5 }), K.suggest(s, new Date(2026, 10, 23, 22, 0), {}));
  K.record(s, 'walk', 6, 3, 3, new Date(2026, 10, 23, 10, 0));
  assert.notStrictEqual(K.suggest(s, noon, { flat: 5 }), 'walk', 'done today already');
});
t('stressByPractice: average stress change per practice (both ratings only), best first', () => {
  const s = K.defaults();
  K.record(s, 'body', 8, 3, 2, new Date(2026, 10, 18, 12));
  K.record(s, 'body', 8, 3, 3, new Date(2026, 10, 19, 12)); // avgChange -0.5 over 2
  K.record(s, 'sigh', 1, 4, 2, new Date(2026, 10, 19, 14)); // avgChange -2.0 over 1
  K.record(s, 'box', 3, null, 1, new Date(2026, 10, 19, 15)); // missing before -> ignored
  K.record(s, 'slow', 5, 2, 3, new Date(2026, 10, 19, 16)); // avgChange +1.0 over 1
  K.record(s, 'walk', 6, 5, 1, new Date(2026, 10, 22, 12)); // future relative to Nov 20
  assert.deepStrictEqual(K.stressByPractice(s, new Date(2026, 10, 20, 12)), [
    { id: 'sigh', avgChange: -2, n: 1 },
    { id: 'body', avgChange: -0.5, n: 2 },
    { id: 'slow', avgChange: 1, n: 1 }
  ]);
  assert.strictEqual(K.stressByPractice(s)[0].id, 'walk', 'unbounded includes all rated sessions');
});
t('meditation path: five stages in order, long sits with sparse words, scaled to 10-30 min', () => {
  const G = require('../../../app/www/lib/guided.js');
  assert.deepStrictEqual(K.PATH, ['count', 'follow', 'note', 'change', 'open']);
  for (const id of K.PATH) {
    const p = K.PRACTICES.find((q) => q.id === id);
    assert.strictEqual(p.kind, 'guided'); assert.ok(p.blurb && p.when.startsWith('Stage ' + p.path + ':'));
    for (const m of K.SIT_LENGTHS) {
      const len = G.scriptLength(G.scaleScript(K.scriptFor(p, 0), m, 0.9), 0.9);
      assert.ok(Math.abs(len - m * 60) < 45, id + ' ' + m + ' min -> ' + len + ' s');
    }
    // sparse: at 20 min no stretch of talk-free time under 2 minutes in the middle of the sit
    const sc = G.scaleScript(K.scriptFor(p, 0), 20, 0.9);
    assert.ok(sc.slice(3, -2).every((x) => x.wait >= 120), id + ' waits ' + sc.map((x) => x.wait));
  }
});
t('meditation path: stage, readiness after 6 sits with 3 of the last 5 steady, never past the last stage', () => {
  const s = K.defaults();
  assert.strictEqual(K.stageOf(s), 'count');
  let st = K.pathStatus(s);
  assert.deepStrictEqual([st.n, st.of, st.sits, st.ready, st.next, st.prev], [1, 5, 0, false, 'follow', null]);
  const sit = (id, d, focus, hind) => K.rateSit(K.record(s, id, 20, null, null, new Date(2026, 10, d, 21)), focus, hind);
  sit('count', 1, 3); sit('count', 2, 3); sit('count', 3, 3); sit('count', 4, 1); sit('count', 5, 2);
  st = K.pathStatus(s);
  assert.strictEqual(st.sits, 5); assert.strictEqual(st.steady, 3); assert.strictEqual(st.ready, false, '5 sits is not yet 6');
  sit('count', 6, 1, ['Sleepy']);
  st = K.pathStatus(s);
  assert.strictEqual(st.rated, 5); assert.strictEqual(st.steady, 2, 'the oldest steady one fell out of the last 5'); assert.strictEqual(st.ready, false);
  assert.ok(/sleepy/i.test(st.tip), 'a tip from the last sit');
  sit('count', 7, 3, ['Nothing much']); sit('count', 8, 3);
  st = K.pathStatus(s);
  assert.strictEqual(st.steady, 2, 'last 5: 1, 2, 1, 3, 3'); assert.strictEqual(st.ready, false); assert.strictEqual(st.tip, null);
  sit('count', 9, 3);
  st = K.pathStatus(s);
  assert.strictEqual(st.steady, 3); assert.strictEqual(st.ready, true);
  assert.strictEqual(K.pathStatus(s, new Date(2026, 10, 5, 12)).sits, 5, 'an earlier day does not count later sits');
  assert.strictEqual(K.setStage(s, 'follow'), 'follow');
  assert.strictEqual(K.pathStatus(s).sits, 0); assert.strictEqual(K.pathStatus(s).prev, 'count');
  assert.strictEqual(K.setStage(s, 'nope'), 'follow', 'unknown ids are ignored');
  K.setStage(s, 'open'); st = K.pathStatus(s);
  assert.strictEqual(st.next, null); assert.strictEqual(st.ready, false);
});
t('rateSit: focus 1-3 (null clears), hindrances known and unique, "Nothing much" alone', () => {
  const r = {};
  K.rateSit(r, 2, ['Sleepy', 'Sleepy', 'Bored', 'Restless']);
  assert.deepStrictEqual(r, { focus: 2, hind: ['Sleepy', 'Restless'] });
  K.rateSit(r, 7, ['Sleepy', 'Nothing much']); assert.deepStrictEqual(r.hind, ['Nothing much'], 'tapping Nothing much last clears the rest'); assert.strictEqual(r.focus, 2, '7 ignored');
  K.rateSit(r, undefined, ['Nothing much', 'Restless']); assert.deepStrictEqual(r.hind, ['Restless']);
  K.rateSit(r, null, []); assert.deepStrictEqual(r, {});
});
t('aim "train": the stage sit leads once a day from 05:00; after a night wake and once done, the usual practices', () => {
  const s = K.defaults();
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 20)), 'sigh', 'no aim: unchanged');
  s.settings.aim = 'calm';
  assert.notStrictEqual(K.PATH.indexOf(K.suggest(s, new Date(2026, 10, 18, 20), {})), 0);
  s.settings.aim = 'train'; s.settings.stage = 'note';
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 7)), 'note');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 22, 30)), 'note');
  assert.ok(K.PATH.indexOf(K.suggest(s, new Date(2026, 10, 18, 2))) < 0, 'after a night wake: not a 20-min sit');
  K.record(s, 'count', 20, null, null, new Date(2026, 10, 18, 8));
  assert.ok(K.PATH.indexOf(K.suggest(s, new Date(2026, 10, 18, 20))) < 0, 'a sit is done today');
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 19, 20)), 'note', 'next day');
});
t('validate keeps aim, stage, sit length and sit answers; drops junk', () => {
  const v = K.validate({ sessions: [
    { id: 'count', date: '2026-11-20', at: '2026-11-20T01:00:00.000Z', mins: 20, focus: 3, hind: ['Sleepy', 'x'] },
    { id: 'slow', date: '2026-11-20', at: '2026-11-20T02:00:00.000Z', mins: 5, focus: 3, hind: ['Sleepy'] },
    { id: 'open', date: '2026-11-21', at: '2026-11-21T02:00:00.000Z', mins: 20, focus: 9 }
  ], settings: { aim: 'train', stage: 'change', sitMinutes: 30 } });
  assert.deepStrictEqual([v.sessions[0].focus, v.sessions[0].hind], [3, ['Sleepy']]);
  assert.ok(!('focus' in v.sessions[1]) && !('hind' in v.sessions[1]), 'only path sits keep sit answers');
  assert.ok(!('focus' in v.sessions[2]));
  assert.deepStrictEqual([v.settings.aim, v.settings.stage, v.settings.sitMinutes], ['train', 'change', 30]);
  const w = K.validate({ sessions: [], settings: { aim: 'zen', stage: 'x', sitMinutes: 7 } });
  assert.deepStrictEqual([w.settings.aim, w.settings.stage, w.settings.sitMinutes], [null, 'count', 20]);
  // null/invalid sessions neither crash validate nor overwrite the previous valid path sit's focus/hind
  const bad = K.validate({ sessions: [
    null,
    { id: 'count', date: '2026-11-20', at: '2026-11-20T01:00:00.000Z', mins: 20, focus: 3, hind: ['Nothing much'] },
    { id: 'count', date: '2026-02-30', at: '2026-02-30T01:00:00.000Z', mins: 20, focus: 1, hind: ['Sleepy'] },
    undefined
  ] });
  assert.strictEqual(bad.sessions.length, 1);
  assert.deepStrictEqual([bad.sessions[0].focus, bad.sessions[0].hind], [3, ['Nothing much']]);
});
t('meditation path: "back" after 3 of the last 5 rated sits mostly lost (never at stage 1); pathWeek counts 7 days', () => {
  const s = K.defaults();
  const sit = (id, d, focus) => K.rateSit(K.record(s, id, 20, null, null, new Date(2026, 10, d, 21)), focus);
  sit('count', 1, 1); sit('count', 2, 1); sit('count', 3, 1);
  assert.strictEqual(K.pathStatus(s).back, false, 'nowhere to go back to from stage 1');
  K.setStage(s, 'follow');
  sit('follow', 4, 1); sit('follow', 5, 3); sit('follow', 6, 1);
  assert.strictEqual(K.pathStatus(s).back, false, '2 of 3');
  sit('follow', 7, 1);
  let st = K.pathStatus(s);
  assert.deepStrictEqual([st.lost, st.back, st.prev], [3, true, 'count']);
  sit('follow', 8, 3); sit('follow', 9, 3);
  assert.strictEqual(K.pathStatus(s).back, false, 'last 5: 3, 1, 1, 3, 3');
  K.record(s, 'slow', 5, 3, 2, new Date(2026, 10, 9, 8));
  assert.deepStrictEqual(K.pathWeek(s, new Date(2026, 10, 9, 22)), { sits: 7, mins: 140 }, '3..9 Nov, sits only (not the slow breathing)');
  assert.deepStrictEqual(K.pathWeek(s, new Date(2026, 10, 20, 12)), { sits: 0, mins: 0 });
});
t('sit settings: dark screen on by default, interval bells 0/5/10 kept, junk dropped', () => {
  assert.strictEqual(K.defaults().settings.dark, true);
  assert.strictEqual(K.defaults().settings.interval, 0);
  const v = K.validate({ sessions: [], settings: { dark: false, interval: 10 } });
  assert.deepStrictEqual([v.settings.dark, v.settings.interval], [false, 10]);
  const j = K.validate({ sessions: [], settings: { dark: 'no', interval: 7 } });
  assert.deepStrictEqual([j.settings.dark, j.settings.interval], [true, 0]);
  assert.strictEqual(K.validate({ sessions: [], settings: {} }).settings.dark, true, 'older saves keep the default');
});
t('interval bell number: none at the start, one per interval, none in the last 30 s or off', () => {
  assert.strictEqual(K.intervalBell(5, 0, 1200), 0);
  assert.strictEqual(K.intervalBell(5, 299, 1200), 0);
  assert.strictEqual(K.intervalBell(5, 300, 1200), 1);
  assert.strictEqual(K.intervalBell(5, 901, 1200), 3);
  assert.strictEqual(K.intervalBell(5, 1175, 1200), 0, 'the end bell is close: none');
  assert.strictEqual(K.intervalBell(10, 600, 600), 0, 'a 10-min sit with 10-min bells: only the end bell');
  assert.strictEqual(K.intervalBell(0, 600, 1200), 0, 'off');
  assert.strictEqual(K.intervalBell(5, NaN, 1200), 0);
});
t('pathWhen: steadiest time of day from 4+ rated sits in 30 days, by local hour; a sit just after midnight is late at night', () => {
  const s = K.defaults();
  const sit = (d, h, m, focus, id) => { const r = K.record(s, id || 'count', 20, null, null, new Date(2026, 10, d, h, m)); K.rateSit(r, focus); return r; };
  sit(20, 6, 30, 3); sit(21, 7, 0, 3);
  sit(20, 23, 10, 1);
  assert.strictEqual(K.pathWhen(s, new Date(2026, 10, 22, 12)), null, '3 rated sits: too few');
  sit(22, 0, 20, 1); // just after midnight: late at night, dated the 22nd
  sit(22, 9, 0, 2);
  const w = K.pathWhen(s, new Date(2026, 10, 22, 12));
  assert.deepStrictEqual([w.best, w.worst], ['morning', 'late'], JSON.stringify(w));
  assert.strictEqual(w.text, 'Your steadiest sits have been in the morning (2 of 3 mostly steady; late at night 0 of 2).');
  assert.strictEqual(w.bestIn, 'in the morning');
  assert.strictEqual(K.pathStatus(s, new Date(2026, 10, 22, 12)).when.best, 'morning', 'pathStatus carries it');
  assert.strictEqual(K.pathWhen(s, new Date(2026, 11, 25, 12)), null, 'older than 30 days: none');
  assert.strictEqual(K.pathWhen(s, new Date(2026, 10, 21, 12)), null, 'sits after "now" are left out');
  const u = K.defaults(); // no part of the day stands out
  [[6, 3], [7, 1], [23, 3], [22, 1]].forEach(([h, f], i) => { const r = K.record(u, 'follow', 20, null, null, new Date(2026, 10, 10 + i, h)); K.rateSit(r, f); });
  assert.strictEqual(K.pathWhen(u, new Date(2026, 10, 20)), null, '1 of 2 vs 1 of 2');
  const v = K.defaults(); // one part only
  [6, 7, 8, 9].forEach((h, i) => { const r = K.record(v, 'count', 20, null, null, new Date(2026, 10, 10 + i, h)); K.rateSit(r, 3); });
  assert.strictEqual(K.pathWhen(v, new Date(2026, 10, 20)), null, 'nothing to compare with');
  const x = K.defaults(); // unrated sits and other practices don't count
  [6, 7, 23, 22].forEach((h, i) => K.record(x, 'count', 20, null, null, new Date(2026, 10, 10 + i, h)));
  [6, 7, 23, 22].forEach((h, i) => { const r = K.record(x, 'slow', 5, 3, 2, new Date(2026, 10, 10 + i, h)); r.focus = 3; });
  assert.strictEqual(K.pathWhen(x, new Date(2026, 10, 20)), null);
});
t('quietScript: opening lines up to the main instruction, one long silence, the two closing lines; same quiet time; nothing changed in place', () => {
  const G = require('../../../app/www/lib/guided.js');
  for (const id of K.PATH) {
    const p = K.PRACTICES.find((x) => x.id === id), full = K.scriptFor(p, 0), before = JSON.stringify(p.steps);
    const q = K.quietScript(full);
    assert.ok(q.length >= 4 && q.length < full.length, id + ' ' + q.length);
    assert.strictEqual(q[q.length - 1].say, full[full.length - 1].say, id + ': ends with the closing line');
    assert.strictEqual(q[0].say, full[0].say);
    const sum = (a) => a.reduce((t, x) => t + (x.wait || 0), 0);
    assert.strictEqual(sum(q), sum(full), id + ': same silence in total');
    assert.ok(q.some((x) => x.wait >= 300), id + ': one long silence');
    assert.strictEqual(JSON.stringify(p.steps), before, 'practice untouched');
    const len = G.scriptLength(G.scaleScript(q, 20, 0.9), 0.9);
    assert.ok(Math.abs(len - 1200) < 60, id + ': still fills 20 min (' + len + ' s)');
  }
  assert.deepStrictEqual(K.quietScript([{ say: 'a', wait: 5 }, { say: 'b', wait: 0 }]).map((x) => x.say), ['a', 'b'], 'short scripts kept');
  assert.strictEqual(K.validate({ sessions: [], settings: { sitQuiet: true } }).settings.sitQuiet, true);
  assert.strictEqual(K.validate({ sessions: [], settings: { sitQuiet: 'y' } }).settings.sitQuiet, false);
});
t('going back a stage and returning: earlier sits at the later stage still count toward "Move on"', () => {
  const s = K.defaults();
  const sit = (d, id, f) => { const r = K.record(s, id, 20, null, null, new Date(2026, 10, d, 7)); K.rateSit(r, f); };
  K.setStage(s, 'follow');
  sit(1, 'follow', 3); sit(2, 'follow', 3); sit(3, 'follow', 1); sit(4, 'follow', 1); sit(5, 'follow', 1);
  assert.strictEqual(K.pathStatus(s, new Date(2026, 10, 5, 12)).back, true);
  K.setStage(s, 'count'); sit(6, 'count', 3); sit(7, 'count', 3);
  K.setStage(s, 'follow'); sit(8, 'follow', 3); sit(9, 'follow', 3); sit(10, 'follow', 3);
  const st = K.pathStatus(s, new Date(2026, 10, 10, 12));
  assert.strictEqual(st.sits, 8, 'all 8 follow sits, before and after going back');
  assert.deepStrictEqual([st.steady, st.lost, st.ready, st.back], [3, 2, true, false], JSON.stringify(st));
});
t('path across DST changes (8 Mar / 1 Nov 2026) and sits saved with other UTC offsets', () => {
  // sits a day apart around both changes, at 7 am local: one per day, in order, the week counts them all
  for (const [y, m, d0] of [[2026, 2, 5], [2026, 9, 29]]) {
    const s = K.defaults();
    for (let i = 0; i < 7; i++) { const r = K.record(s, 'count', 20, null, null, new Date(y, m, d0 + i, 7)); K.rateSit(r, i < 4 ? 1 : 3); }
    const dates = s.sessions.map((x) => x.date);
    assert.strictEqual(new Set(dates).size, 7, 'one date per sit: ' + dates);
    const st = K.pathStatus(s, new Date(y, m, d0 + 6, 20));
    assert.deepStrictEqual([st.sits, st.steady, st.lost], [7, 3, 2], JSON.stringify(st));
    const wk = K.pathWeek(s, new Date(y, m, d0 + 6, 20));
    assert.ok(wk.sits >= 1 && wk.mins === wk.sits * 20, JSON.stringify(wk));
  }
  // a sit saved by a phone in another zone: its date is the one it was saved with, its time an absolute instant
  const s = K.defaults();
  s.sessions.push({ id: 'count', date: '2026-11-20', at: '2026-11-20T06:30:00-04:00', mins: 20, focus: 3 });
  s.sessions.push({ id: 'count', date: '2026-11-21', at: '2026-11-21T19:30:00+08:00', mins: 20, focus: 1 }); // Manila evening
  s.sessions.push({ id: 'count', date: '2026-11-22', at: '2026-11-22T10:00:00Z', mins: 20, focus: 3 });
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.sessions.length, 3, 'mixed offsets all kept');
  const st = K.pathStatus(v, new Date(2026, 10, 22, 23));
  assert.deepStrictEqual([st.sits, st.steady, st.lost], [3, 2, 1]);
  assert.deepStrictEqual(K.pathWeek(v, new Date(2026, 10, 22, 23)).mins, K.pathWeek(v, new Date(2026, 10, 22, 23)).sits * 20);
});
t('pathLate: two late, sleepy, wandering sits in a row -> suggest earlier (or his best time); otherwise nothing', () => {
  const s = K.defaults();
  const sit = (d, h, f, hind) => { const r = K.record(s, 'count', 20, null, null, new Date(2026, 10, d, h, 15)); K.rateSit(r, f, hind); };
  sit(20, 7, 3, []); sit(21, 7, 3, []); // two good mornings
  sit(22, 23, 1, ['Sleepy']);
  assert.strictEqual(K.pathLate(s, new Date(2026, 10, 23, 12)), null, 'one late sleepy sit');
  sit(23, 23, 1, ['Sleepy', 'Restless']);
  const l = K.pathLate(s, new Date(2026, 10, 24, 12));
  assert.ok(/steadiest sits have been in the morning/.test(l), l);
  assert.strictEqual(K.pathStatus(s, new Date(2026, 10, 24, 12)).late, l);
  sit(24, 7, 2, []);
  assert.strictEqual(K.pathLate(s, new Date(2026, 10, 25, 12)), null, 'the latest sit was in the morning');
  const u = K.defaults();
  [[20, 0], [21, 1]].forEach(([d, h]) => { const r = K.record(u, 'follow', 20, null, null, new Date(2026, 10, d, h)); K.rateSit(r, 1, ['Sleepy']); });
  assert.ok(/earlier in the day/.test(K.pathLate(u, new Date(2026, 10, 21, 12))), 'no best time known: earlier in the day');
  const v = K.defaults();
  [[20, 23], [21, 23]].forEach(([d, h]) => { const r = K.record(v, 'follow', 20, null, null, new Date(2026, 10, d, h)); K.rateSit(r, 1, ['Restless']); });
  assert.strictEqual(K.pathLate(v, new Date(2026, 10, 22)), null, 'restless, not sleepy');
});
t('ambient noise setting: off by default, valid kinds kept, unknown values reset to off', () => {
  assert.deepStrictEqual(K.NOISE_KINDS, ['off', 'brown', 'pink', 'white', 'fan', 'ocean']);
  assert.deepStrictEqual(K.NOISE_KINDS, require('../../../app/www/lib/noise.js').KINDS, 'the same list as the sound player');
  assert.strictEqual(K.defaults().settings.noise, 'off');
  for (const kind of ['brown', 'pink', 'white', 'fan', 'ocean']) {
    assert.strictEqual(K.validate({ sessions: [], settings: { noise: kind } }).settings.noise, kind);
  }
  assert.strictEqual(K.validate({ sessions: [], settings: { noise: 'thunder' } }).settings.noise, 'off');
  assert.strictEqual(K.validate({ sessions: [] }).settings.noise, 'off');
  assert.strictEqual(K.defaults().settings.noiseVol, 'medium', '411: volume medium by default');
  assert.strictEqual(K.validate({ sessions: [], settings: { noiseVol: 'soft' } }).settings.noiseVol, 'soft');
  assert.strictEqual(K.validate({ sessions: [], settings: { noiseVol: 'max' } }).settings.noiseVol, 'medium');
  const N = require('../../../app/www/lib/noise.js');
  assert.deepStrictEqual(Object.keys(N.VOLS), K.NOISE_VOLS);
  assert.strictEqual(N.setVolume('soft'), 0.5); assert.strictEqual(N.setVolume('nope'), 1); assert.strictEqual(N.setVolume('medium'), 1);
});
t('background sounds loop with no seam and no beat (his note: the brown noise had a drum sound)', () => {
  const N = require('../../../app/www/lib/noise.js');
  let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const kind of ['brown', 'pink', 'fan', 'ocean']) {
    const rate = 8000, x = N.samples(kind, rate, undefined, rand), len = x.length;
    assert.ok(len / rate >= 15, kind + ': a loop long enough not to be heard repeating (' + (len / rate) + ' s)');
    // the loop point is like any two neighbouring samples: the jump there is within the normal spread of steps
    const steps = []; for (let i = 1; i < len; i++) steps.push(Math.abs(x[i] - x[i - 1]));
    steps.sort((a, b) => a - b);
    const p999 = steps[Math.floor(steps.length * 0.999)], seam = Math.abs(x[0] - x[len - 1]);
    assert.ok(seam <= p999, kind + ': seam jump ' + seam.toFixed(4) + ' vs 99.9th pct step ' + p999.toFixed(4));
    // no level dip at the seam (the old cross-fade dipped every 3 s): the 50 ms either side of the loop point as loud as the rest
    const win = Math.floor(rate * 0.05), rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const around = Array.from(x.slice(len - win)).concat(Array.from(x.slice(0, win))), all = rms(Array.from(x));
    if (kind !== 'ocean') assert.ok(rms(around) > all * 0.5, kind + ': no dip at the loop point');
    // no slow drift (a thump): 1-second averages stay near zero
    for (let s = 0; s + rate <= len; s += rate) {
      let m = 0; for (let i = s; i < s + rate; i++) m += x[i];
      assert.ok(Math.abs(m / rate) < all * 0.35, kind + ': 1 s mean ' + (m / rate).toFixed(3) + ' near zero');
    }
    assert.ok(x.every((v) => v >= -1 && v <= 1 && Number.isFinite(v)), kind + ': in range');
  }
  // the same random numbers: the same sound (pure), and white noise keeps its old level
  seed = 3; const a = N.samples('brown', 4000, 2, rand); seed = 3; const b = N.samples('brown', 4000, 2, rand);
  assert.deepStrictEqual(Array.from(a), Array.from(b));
  assert.deepStrictEqual(Object.keys(N.LABELS), N.KINDS);
});
t('422: a phone that can\'t make the long loop gets a shorter one, never an error; no copyToChannel is fine', () => {
  const N = require('../../../app/www/lib/noise.js');
  let asked = [];
  const fake = { sampleRate: 8000, createBuffer: (ch, len, rate) => { asked.push(len); if (len > 8000 * 15) throw new Error('out of memory'); const d = new Float32Array(len); return { length: len, getChannelData: () => d }; } };
  const b = N.makeBuffer(fake, 'ocean');
  assert.strictEqual(b.length, 8000 * 11, 'fell back to 11 s');
  assert.strictEqual(asked.length, 2);
  assert.ok(b.getChannelData(0).some((v) => v !== 0), 'filled without copyToChannel');
  const again = N.makeBuffer(fake, 'ocean');
  assert.strictEqual(again, b, 'kept for next time');
});
t('425: his own words after a path sit: kept (600 max, spaces tidied), cleared, through a restore; not on other practices', () => {
  const s = K.defaults();
  const r = K.record(s, 'count', 20, null, null, new Date(2026, 10, 27, 19));
  K.sitNote(r, '  calmer   than last time ');
  assert.strictEqual(r.note, 'calmer than last time');
  K.sitNote(r, 'x'.repeat(900)); assert.strictEqual(r.note.length, 600);
  K.sitNote(r, 'calmer'); const back = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(back.sessions[0].note, 'calmer');
  K.sitNote(r, ''); assert.strictEqual(r.note, undefined);
  const o = K.record(s, 'slow', 3, 2, 1, new Date(2026, 10, 27, 20)); o.note = 'x';
  assert.strictEqual(K.validate(JSON.parse(JSON.stringify(s))).sessions[1].note, undefined, 'only path sits keep words');
  const A = require('../../../app/www/lib/activity.js');
  K.sitNote(r, 'woke at minute 12'); r.rated = new Date(2026, 10, 27, 19, 30).toISOString();
  const ev = A.collect({ 'wl.calm.v1': s }, {}, new Date(2026, 10, 28)).find((e) => e.part === 'calm' && e.data && e.data.practice === 'count');
  assert.strictEqual(ev.data.note, 'woke at minute 12');
  assert.ok(/\/e\d+$/.test(ev.id), 'a new id when words are added later (newest wins on the PC)');
});
console.log(n + ' calm unit tests passed');
