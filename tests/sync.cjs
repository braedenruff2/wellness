/* Unit tests for app/www/lib/sync-core.js (Google Drive sync merge, acks, 30-min throttle, payload). */
'use strict';
const assert = require('assert');
const C = require('../app/www/lib/sync-core.js');

let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

t('autoDue: at most every 30 minutes (sync or failed attempt), safe on backward clock', () => {
  const s = C.defaults();
  const t0 = new Date('2026-11-21T10:00:00Z');
  assert.strictEqual(C.autoDue(s, t0), true, 'never synced');
  s.lastSync = t0.toISOString();
  assert.strictEqual(C.autoDue(s, new Date('2026-11-21T10:15:00Z')), false, '15 min later');
  assert.strictEqual(C.autoDue(s, new Date('2026-11-21T10:29:59Z')), false, '29m59s later');
  assert.strictEqual(C.autoDue(s, new Date('2026-11-21T10:30:00Z')), true, 'at 30 min');
  assert.strictEqual(C.autoDue(s, new Date('2026-11-21T09:50:00Z')), true, 'clock moved back');
  const s2 = C.defaults();
  s2.lastAuto = t0.toISOString();
  assert.strictEqual(C.autoDue(s2, new Date('2026-11-21T10:10:00Z')), false, 'throttled after failed auto-sync too');
  assert.strictEqual(C.autoDue(s2, new Date('2026-11-21T10:30:01Z')), true, 'due again after 30 min');
});

t('enqueue, mergeRemote (answers -> kept until taken, acked written, answered request dropped)', () => {
  const s = C.defaults();
  const now = new Date('2026-11-21T10:00:00Z');
  const r1 = C.enqueue(s, 'coach-scenario', { child: 'Kid', skill: 'Sleep' }, now, 'req-1');
  const r2 = C.enqueue(s, 'advice', { question: 'sleep?' }, now, 'req-2');
  assert.strictEqual(s.requests.length, 2);
  assert.strictEqual(r1.id, 'req-1'); assert.strictEqual(r2.task, 'advice');

  // empty brand-new file or junk JSON never breaks merge
  assert.deepStrictEqual(C.mergeRemote(s, ''), { fresh: [], badRemote: false });
  assert.deepStrictEqual(C.mergeRemote(s, '{not json'), { fresh: [], badRemote: true });
  assert.strictEqual(s.requests.length, 2);

  // cloud answers req-1
  const remote = JSON.stringify({
    app: 'wellness',
    answers: { 'req-1': { at: '2026-11-21T12:00:00Z', answer: { title: 'Bedtime', scenario: 'S' } } }
  });
  const m = C.mergeRemote(s, remote);
  assert.deepStrictEqual(m, { fresh: ['req-1'], badRemote: false });
  assert.deepStrictEqual(s.acked, ['req-1']);
  assert.deepStrictEqual(s.requests.map((r) => r.id), ['req-2'], 'answered request removed from queue');
  assert.strictEqual(s.answers['req-1'].answer.title, 'Bedtime', 'answer kept until shown');

  // show/consume the answer
  const taken = C.takeAnswer(s, 'req-1');
  assert.strictEqual(taken.answer.title, 'Bedtime');
  assert.strictEqual(C.takeAnswer(s, 'req-1'), null, 'taken once');

  // if Drive still holds the old answer on the next read, it is NOT re-added
  const m2 = C.mergeRemote(s, remote);
  assert.deepStrictEqual(m2, { fresh: [], badRemote: false });
  assert.strictEqual(s.answers['req-1'], undefined);
  assert.deepStrictEqual(s.acked, ['req-1']);
});

t('buildPayload: backup JSON + requests + acked, merges external queue without duplicates or acked ids', () => {
  const s = C.defaults();
  const now = new Date('2026-11-21T11:00:00Z');
  C.enqueue(s, 'weekly-plan', { days: 14 }, now, 'r1');
  s.acked = ['r0'];
  const backup = { app: 'wellness', exported: '2026-11-21T10:00:00Z', stores: { 'wl.todo.v1': '{"tasks":[]}' } };
  const extra = [
    { id: 'r0', task: 'advice', input: {}, at: now.toISOString() }, // already acked: excluded
    { id: 'r1', task: 'weekly-plan', input: {}, at: now.toISOString() }, // duplicate: excluded
    { id: 'r2', task: 'tagalog-check', input: { given: 'po' }, at: now.toISOString() }
  ];
  const out = JSON.parse(C.buildPayload(backup, s, now, extra));
  assert.strictEqual(out.app, 'wellness');
  assert.strictEqual(out.exported, now.toISOString());
  assert.deepStrictEqual(out.stores, backup.stores);
  assert.deepStrictEqual(out.requests.map((r) => r.id), ['r1', 'r2']);
  assert.deepStrictEqual(out.acked, ['r0']);
});

t('validate cleans corrupt stored state and caps acked/requests', () => {
  const many = {};
  const acked = [];
  for (let i = 0; i < 250; i++) { acked.push('a' + i); many['x' + i] = i; }
  const v = C.validate({
    requests: [null, { id: '', task: 'x' }, { id: 'ok1', task: 'advice', input: { q: 'hi' }, at: '2026-11-21T00:00:00Z' }],
    answers: { ok0: { v: 1 } },
    acked: acked,
    lastSync: 'not-a-date',
    lastAuto: '2026-11-21T01:00:00Z',
    lastError: 'err'
  });
  assert.strictEqual(v.requests.length, 1);
  assert.strictEqual(v.requests[0].id, 'ok1');
  assert.strictEqual(v.acked.length, 200);
  assert.strictEqual(v.acked[0], 'a50');
  assert.strictEqual(v.lastSync, null);
  assert.strictEqual(v.lastAuto, '2026-11-21T01:00:00Z');
  assert.strictEqual(v.lastError, 'err');
  assert.deepStrictEqual(C.validate(null), C.defaults());
});

console.log(n + ' sync tests passed');
