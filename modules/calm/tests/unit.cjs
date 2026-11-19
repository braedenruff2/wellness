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
  assert.strictEqual(K.suggest(s, new Date(2026, 10, 18, 7)), 'slow');
});
t('validate drops unknown practices and bad numbers', () => {
  const v = K.validate({ sessions: [{ id: 'slow', date: '2026-11-18', mins: 5, before: 3 }, { id: 'x', date: '2026-11-18', mins: 5 }, { id: 'box', date: 'no', mins: 1 }, { id: 'box', date: '2026-11-18', mins: 9999 }], settings: { minutes: 7 } });
  assert.strictEqual(v.sessions.length, 2); assert.strictEqual(v.sessions[1].mins, 240); assert.strictEqual(v.settings.minutes, 5);
  assert.strictEqual(K.validate(null), null);
});
console.log(n + ' calm unit tests passed');
