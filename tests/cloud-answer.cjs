/* tools/cloud-answer.cjs: a cloud run turns the phone's queued requests into the same prompts the PC link runs, then
   its answers into wellness-answers sheet rows that the phone reads back (pruning rows the phone already acked). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../tools/cloud-answer.cjs');
const C = require('../app/www/lib/sync-core.js');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-answer-'));
const now = new Date('2026-11-21T15:00:00Z');
const sync = {
  app: 'wellness', exported: now.toISOString(),
  stores: {
    'wl.me.v1': JSON.stringify({ feedback: [], skipped: {}, plan: null, checkins: { '2026-11-20': { at: '2026-11-20T16:12:01.040Z', sleep: '6–7 h', wakes: '2', energy: 'Low', mood: 'OK', day: 'Busy' } } }),
    'wl.calm.v1': JSON.stringify({ sessions: [{ id: 'body', date: '2026-11-19', at: '2026-11-20T01:02:57.519Z', mins: 8.4, before: 1, after: 1 }], settings: {} })
  },
  requests: [
    { id: 'r1', task: 'advice', input: { question: 'Tired lately' }, at: '2026-11-21T12:00:00Z' },
    { id: 'r2', task: 'tagalog-check', input: { task: 'Say: water', expected: 'tubig', answer: 'tubeg' }, at: '2026-11-21T12:01:00Z' },
    { id: 'r3', task: 'coach-scenario', input: { child: 'Test', age: 'about one year old' }, at: '2026-11-21T12:02:00Z' },
    { id: 'r4', task: 'no-such-task', input: {}, at: '2026-11-21T12:03:00Z' },
    { id: 'r0', task: 'advice', input: {}, at: '2026-11-20T12:00:00Z' }
  ],
  acked: ['r0', 'old-acked']
};
const file = path.join(work, 'wellness-sync.json');
fs.writeFileSync(file, JSON.stringify(sync));
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok ' + name); }

test('prepare: one prompt per unacked request, same text as the PC link, summary from the synced data', () => {
  const l = T.prepare(file, work, now);
  assert.deepStrictEqual(l.map((x) => x.id), ['r1', 'r2', 'r3', 'r4']);
  const adv = fs.readFileSync(path.join(work, 'r1.prompt.md'), 'utf8');
  assert.ok(/Active on \d+ of \d+ days/.test(adv), adv.slice(0, 600));
  assert.ok(adv.includes('energy Low') && adv.includes('Tired lately'), 'the check-in and his question are in it');
  const tl = fs.readFileSync(path.join(work, 'r2.prompt.md'), 'utf8');
  assert.ok(tl.includes('"tubeg"') && tl.includes('"tubig"'));
  assert.ok(!/\{\{[a-z]+\}\}/.test(tl + adv), 'every placeholder filled');
  assert.ok(fs.existsSync(path.join(work, 'r3.prompt.md')));
  const bad = l.find((x) => x.id === 'r4');
  assert.ok(bad.error && /unknown task/.test(bad.error) && !bad.prompt);
});

test('rows: answers become sheet rows the phone reads back; acked rows pruned, others kept, old rows blanked', () => {
  fs.writeFileSync(path.join(work, 'answers', 'r1.json'), JSON.stringify({ headline: 'Rest a little', points: ['a, with comma', 'b "quoted"', 'c'], next: 'n' }));
  fs.writeFileSync(path.join(work, 'answers', 'r2.json'), JSON.stringify({ ok: false, corrected: 'tubig', meaning: 'water', explain: 'i, not e', tip: '' }));
  fs.writeFileSync(path.join(work, 'answers', 'r3.json'), JSON.stringify({ error: 'Could not answer this one.' }));
  fs.writeFileSync(path.join(work, 'answers', 'r0.json'), JSON.stringify({ headline: 'already acked' }));
  const csv = path.join(work, 'sheet.csv');
  fs.writeFileSync(csv, 'id,task,answer-json,at\nold-acked,advice,"{""task"":""advice"",""answer"":{}}",2026-11-19T00:00:00Z\n' +
    'still-waiting,advice,"{""task"":""advice"",""answer"":{""headline"":""h""}}",2026-11-20T00:00:00Z\nr2,tagalog-check,"{}",2026-11-20T00:00:00Z\n');
  const r = T.rows(file, work, csv, now);
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(r.rows[0], T.HEADER);
  const ids = r.rows.map((x) => x[0]);
  assert.deepStrictEqual(ids.filter(Boolean), ['id', 'still-waiting', 'r1', 'r2', 'r3'], 'acked dropped, r2 replaced, r0 skipped');
  assert.strictEqual(r.rows.length, 5, 'covers the old 4 rows (header + 3 data) and more');
  assert.ok(r.rows.every((x) => x.length === 4));
  const back = C.rowsToAnswers(r.rows);
  assert.strictEqual(back.r1.task, 'advice'); assert.strictEqual(back.r1.answer.points[1], 'b "quoted"');
  assert.strictEqual(back.r3.error, 'Could not answer this one.');
  assert.ok(!back.r0 && !back['old-acked']);
  // through the phone's own path: CSV text -> mergeRemote
  const state = C.defaults(); state.requests = sync.requests.slice(0, 3);
  const text = r.rows.map((x) => x.map((c) => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\r\n');
  const m = C.mergeRemote(state, text);
  assert.deepStrictEqual(m.fresh.sort(), ['r1', 'r2', 'r3', 'still-waiting']);
  assert.strictEqual(state.requests.length, 0);
});

test('rows: an answer for an id the sync file never asked, or not JSON, is reported, not written', () => {
  fs.writeFileSync(path.join(work, 'answers', 'zz.json'), '{}');
  fs.writeFileSync(path.join(work, 'answers', 'r2.json'), 'not json');
  const r = T.rows(file, work, null, now);
  assert.ok(r.problems.some((p) => /^zz: not a request/.test(p)) && r.problems.some((p) => /^r2: not JSON/.test(p)), r.problems.join('; '));
  assert.ok(!r.rows.some((x) => x[0] === 'zz' || x[0] === 'r2'));
});

test('no requests: nothing to do', () => {
  const f2 = path.join(work, 'empty.json');
  fs.writeFileSync(f2, JSON.stringify(Object.assign({}, sync, { requests: [] })));
  assert.deepStrictEqual(T.prepare(f2, path.join(work, 'e'), now), []);
});

test('prepare with sheet CSV skips already-answered ids (still includes missing or invalid rows) and handles Unicode', () => {
  const csv = path.join(work, 'already.csv');
  fs.writeFileSync(csv, 'id,task,answer-json,at\n' +
    'r1,advice,"{""task"":""advice"",""answer"":{""headline"":""Already answered""}}",2026-11-21T13:00:00Z\n' +
    'r2,tagalog-check,"not-json",2026-11-21T13:00:00Z\n');
  const w2 = path.join(work, 'w2');
  const f3 = path.join(work, 'uni.json');
  const uniSync = JSON.parse(JSON.stringify(sync));
  uniSync.requests[2].input.can = 'waves ✓ and smiles 😊';
  fs.writeFileSync(f3, JSON.stringify(uniSync));
  const l = T.prepare(f3, w2, csv, now);
  assert.deepStrictEqual(l.map((x) => x.id), ['r2', 'r3', 'r4'], 'r1 already validly answered in sheet is skipped; invalid r2 is kept');
  assert.ok(!fs.existsSync(path.join(w2, 'r1.prompt.md')));
  assert.ok(fs.readFileSync(path.join(w2, 'r3.prompt.md'), 'utf8').includes('waves ✓ and smiles 😊'));
});
test('a year of heavy use: the advice and weekly-plan prompts stay small (under 20 KB each)', () => {
  const { simulate } = require('./lib/year.cjs');
  const st = simulate(365);
  const end = new Date(2027, 10, 17, 18, 0);
  const big = { app: 'wellness', exported: end.toISOString(), stores: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, JSON.stringify(v)])),
    requests: [{ id: 'y1', task: 'weekly-plan', input: {}, at: end.toISOString() }, { id: 'y2', task: 'advice', input: { question: 'How is my week going?' }, at: end.toISOString() }], acked: [] };
  const f = path.join(work, 'year-sync.json'); fs.writeFileSync(f, JSON.stringify(big));
  const w = path.join(work, 'year'); const l = T.prepare(f, w, end);
  assert.deepStrictEqual(l.map((x) => x.error), [null, null]);
  for (const id of ['y1', 'y2']) {
    const size = fs.statSync(path.join(w, id + '.prompt.md')).size;
    console.log('   ' + id + ' prompt ' + size + ' bytes');
    assert.ok(size < 20000, id + ' prompt is ' + size + ' bytes');
  }
});
fs.rmSync(work, { recursive: true, force: true });
console.log(n + ' cloud-answer tests passed');
