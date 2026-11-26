/* Speed guard for the Your words page and Mixed practice on an old phone: TagalogCore.slips and practiceSet with
   2000 answers and 4 lesson packs (every lesson done) stay under 20 ms each in node after a warm-up (median of 9 runs,
   so one slow tick on a busy test machine doesn't fail it). Most answers carry a hint; slips is also timed with none
   matching an exercise (the worst case: it reads all of them). */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const T = require('../../../app/www/modules/tagalog/tagalog-core.js');
const dir = path.join(__dirname, '..', 'packs');
const real = fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
assert.ok(real.length >= 1, 'bundled packs found');
const packs = [];
for (let i = 0; packs.length < 4; i++) {
  const p = JSON.parse(JSON.stringify(real[i % real.length]));
  if (i >= real.length) p.id = '2027-0' + (i + 1) + '-01';
  packs.push(p);
}
const now = new Date(2026, 10, 26, 13, 0);
const S = T.defaults();
const exs = [];
packs.forEach((p) => p.lessons.forEach((l) => {
  S.done[p.id + '/' + l.day] = now.toISOString();
  l.exercises.forEach((ex) => exs.push({ p, l, ex }));
}));
const kinds = T.HINT_KINDS;
for (let i = 0; i < 2000; i++) {
  const x = exs[i % exs.length], at = new Date(now.getTime() - (i % 13) * 864e5 - i * 1000).toISOString();
  const miss = i % 3 !== 0;
  S.answers.push({
    at, pack: x.p.id, day: x.l.day, ok: !miss, type: x.ex.type,
    prompt: i % 10 === 0 ? String(x.ex.prompt || x.ex.say || '').slice(0, 120) : 'no such prompt ' + i,
    given: 'something typed ' + i, hint: miss ? kinds[i % kinds.length] : undefined
  });
}
S.answers.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const time = (f) => {
  for (let i = 0; i < 20; i++) f(); // warm-up
  const ms = [];
  for (let i = 0; i < 9; i++) { const t0 = process.hrtime.bigint(); f(); ms.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  return ms.sort((a, b) => a - b)[4];
};
let passed = 0;
const step = (name, f) => { console.log('..', name); f(); passed++; console.log('ok', name); };
step('slips: 2000 answers, 4 packs, under 20 ms', () => {
  const r = T.slips(S, packs, now, 6);
  assert.ok(r.length >= 1 && r.length <= 6, 'finds the real slips: ' + r.length);
  const ms = time(() => T.slips(S, packs, now, 6));
  console.log('   slips median ' + ms.toFixed(2) + ' ms');
  assert.ok(ms < 20, 'slips took ' + ms.toFixed(1) + ' ms');
  // worst case: no hinted answer matches an exercise any more (packs replaced), so every answer is read
  const none = Object.assign({}, S, { answers: S.answers.map((a) => Object.assign({}, a, { prompt: 'gone ' + a.at })) });
  assert.deepStrictEqual(T.slips(none, packs, now, 6), []);
  const ms2 = time(() => T.slips(none, packs, now, 6));
  console.log('   slips (nothing matches) median ' + ms2.toFixed(2) + ' ms');
  assert.ok(ms2 < 20, 'slips (nothing matches) took ' + ms2.toFixed(1) + ' ms');
});
step('practiceSet: 2000 answers, 4 packs, under 20 ms', () => {
  const r = T.practiceSet(S, packs, 8);
  assert.strictEqual(r.length, 8);
  const ms = time(() => T.practiceSet(S, packs, 8));
  console.log('   practiceSet median ' + ms.toFixed(2) + ' ms');
  assert.ok(ms < 20, 'practiceSet took ' + ms.toFixed(1) + ' ms');
});
console.log(passed + ' tagalog perf tests passed');
