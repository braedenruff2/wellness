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

t('parseCsv + rowsToAnswers + mergeRemote handle wellness-answers sheet CSV and Java {"rows":[...]} JSON', () => {
  const s = C.defaults();
  const now = new Date('2026-11-21T10:00:00Z');
  C.enqueue(s, 'advice', { question: 'sleep?' }, now, 'req-a');
  C.enqueue(s, 'coach-scenario', { child: 'Kid' }, now, 'req-b');
  C.enqueue(s, 'weekly-plan', {}, now, 'req-c');

  // 1) Raw CSV with BOM, header, doubled quotes, commas, multiline JSON, wrapped/bare/error objects, and one corrupt JSON row
  const csv = '\uFEFFid,task,answer-json,at\r\n'
    + 'req-a,advice,"{""headline"":""Steady, calm week"",""points"":[""p1"",""p2""],""next"":""Nap""}",2026-11-21T12:00:00Z\r\n'
    + 'req-bad,advice,"{broken json",2026-11-21T12:01:00Z\r\n'
    + 'req-b,coach-scenario,"{\n""error"":""Could not answer this one""\n}",2026-11-21T12:02:00Z\r\n';
  const m1 = C.mergeRemote(s, csv);
  assert.deepStrictEqual(m1, { fresh: ['req-a', 'req-b'], badRemote: false });
  assert.strictEqual(s.answers['req-a'].task, 'advice');
  assert.strictEqual(s.answers['req-a'].answer.headline, 'Steady, calm week');
  assert.strictEqual(s.answers['req-a'].at, '2026-11-21T12:00:00Z');
  assert.strictEqual(s.answers['req-b'].task, 'coach-scenario');
  assert.strictEqual(s.answers['req-b'].error, 'Could not answer this one');
  assert.strictEqual(s.answers['req-bad'], undefined, 'corrupt JSON row skipped safely');
  assert.deepStrictEqual(s.acked, ['req-a', 'req-b']);
  assert.deepStrictEqual(s.requests.map((r) => r.id), ['req-c'], 'answered requests removed');

  // 2) Java Sync.answersFromCsv output: {"rows":[...]} with wrapped {task, answer}
  const javaOut = JSON.stringify({
    rows: [
      { id: 'req-a', task: 'advice', raw: JSON.stringify({ headline: 'Duplicate ignored' }), at: '2026-11-21T12:00:00Z' },
      { id: 'req-c', task: 'weekly-plan', raw: JSON.stringify({ task: 'weekly-plan', answer: { headline: 'Rest first' } }), at: '2026-11-21T12:05:00Z' }
    ]
  });
  const m2 = C.mergeRemote(s, javaOut);
  assert.deepStrictEqual(m2, { fresh: ['req-c'], badRemote: false });
  assert.strictEqual(s.answers['req-c'].task, 'weekly-plan');
  assert.strictEqual(s.answers['req-c'].answer.headline, 'Rest first');
  assert.strictEqual(s.answers['req-a'].answer.headline, 'Steady, calm week', 'acked answer not overwritten');
  assert.deepStrictEqual(s.requests, []);
  assert.deepStrictEqual(s.acked, ['req-a', 'req-b', 'req-c']);
});

t('describeBackup validates wellness-sync.json and legacy backups before confirm restore', () => {
  const ok = C.describeBackup('\uFEFF' + JSON.stringify({
    app: 'wellness', exported: '2026-11-21T10:00:00Z',
    stores: { 'wl.todo.v1': '{}', 'wl.calm.v1': '{}' }, requests: [], acked: []
  }));
  assert.deepStrictEqual(ok, { app: 'wellness', exported: '2026-11-21T10:00:00Z', storeCount: 2 });

  const old = C.describeBackup(JSON.stringify({ app: 'faith-companion', exported: '2026-11-18T00:00:00Z' }));
  assert.strictEqual(old.app, 'faith-companion');

  assert.throws(() => C.describeBackup('not json'), /not a backup/);
  assert.throws(() => C.describeBackup(JSON.stringify({ app: 'other', stores: {} })), /not a backup/);
  assert.throws(() => C.describeBackup(JSON.stringify({ app: 'wellness', stores: [] })), /not a backup/);
});

t('440: unchanged: an auto-sync whose payload differs from Drive\'s file only in "exported" skips the write', () => {
  const st = C.defaults();
  const bk = { app: 'wellness', stores: { 'wl.todo.v1': '{"tasks":[]}' } };
  const p1 = C.buildPayload(bk, st, new Date('2026-11-28T05:00:00Z'));
  const p2 = C.buildPayload(bk, st, new Date('2026-11-28T05:31:00Z'));
  assert.notStrictEqual(p1, p2, 'the exported time differs');
  assert.strictEqual(C.unchanged(p1, p2), true, 'same data as Drive: skip');
  assert.strictEqual(C.unchanged('\uFEFF' + p1, p2), true, 'a BOM from the provider is fine');
  assert.strictEqual(C.unchanged(p1.replace('"requests"', '"requests" '), p2), false, 'Drive file changed: write');
  assert.strictEqual(C.unchanged('', p2), false, 'Drive file empty: write');
  assert.strictEqual(C.unchanged(null, p2), false);
  assert.strictEqual(C.unchanged('{"app":"x"}', p2), false, 'not our file: write');
  const p3 = C.buildPayload({ app: 'wellness', stores: { 'wl.todo.v1': '{"tasks":[1]}' } }, st, new Date('2026-11-28T06:00:00Z'));
  assert.strictEqual(C.unchanged(p1, p3), false, 'data changed: write');
  C.enqueue(st, 'weekly-plan', {}, new Date('2026-11-28T06:00:00Z'));
  assert.strictEqual(C.unchanged(p1, C.buildPayload(bk, st, new Date('2026-11-28T06:01:00Z'))), false, 'a new request: write');
  // a year-sized payload compares quickly
  const big = C.buildPayload({ app: 'wellness', stores: { a: 'x'.repeat(4e6) } }, st, new Date('2026-11-28T07:00:00Z'));
  const big2 = C.buildPayload({ app: 'wellness', stores: { a: 'x'.repeat(4e6) } }, st, new Date('2026-11-28T07:30:00Z'));
  const t0 = Date.now(); assert.strictEqual(C.unchanged(big, big2), true); assert.ok(Date.now() - t0 < 100, 'took ' + (Date.now() - t0) + ' ms');
});

console.log(n + ' sync tests passed');
