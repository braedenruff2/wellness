/* Parenting coach logic tests. node modules/coach/tests/unit.cjs */
'use strict';
const assert = require('assert');
const K = require('../../../app/www/modules/coach/coach-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

t('age in words', () => {
  const b = '2025-11-24';
  assert.strictEqual(K.ageMonths(b, new Date(2026, 10, 23)), 11, 'the day before her birthday');
  assert.strictEqual(K.ageMonths(b, new Date(2026, 10, 24)), 12);
  assert.strictEqual(K.ageText(b, new Date(2026, 10, 23)), '11 months old');
  assert.strictEqual(K.ageText(b, new Date(2027, 10, 24)), '24 months old'.replace('24 months', '2 years'));
  assert.strictEqual(K.ageText(b, new Date(2028, 0, 25)), '2 years and 2 months old');
  assert.strictEqual(K.ageText(b, new Date(2025, 11, 3)), '9 days old');
  assert.strictEqual(K.ageText(b, new Date(2025, 11, 12)), '2 weeks old');
  assert.strictEqual(K.ageText(b, new Date(2025, 11, 24)), '1 month old');
  assert.strictEqual(K.ageText('2026-12-25', new Date(2026, 10, 19)), '', 'not born yet');
  assert.strictEqual(K.ageText('', new Date()), '');
  assert.strictEqual(K.ageMonths('2024-01-31', new Date(2024, 1, 29)), 0, 'end of month');
});

t('scenario, grade, skills and what to practise next', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  assert.strictEqual(K.suggestSkill(s), K.SKILLS[0]);
  const now = new Date(2026, 10, 19);
  const inp = K.scenarioInput(s, null, now);
  assert.deepStrictEqual([inp.child, inp.age, inp.skill], ['Kid', '11 months old', 'Connection']);
  assert.throws(() => K.setScenario(s, { title: 'x' }, now), /scenario/);
  K.setScenario(s, { title: 'T', skill: 'Made up skill', scenario: 'S <b>', question: 7 }, now);
  assert.strictEqual(s.current.skill, 'Connection', 'unknown skill falls back');
  assert.strictEqual(s.current.question, 'What do you do and say?');
  const h = K.grade(s, 'I would hug her', { score: '8', good: ['a', 5], sources: [{ title: 'AAP', url: 'https://healthychildren.org' }, { url: 'javascript:alert(1)' }] }, now);
  assert.strictEqual(h.result.score, 8);
  assert.deepStrictEqual(h.result.good, ['a']);
  assert.strictEqual(h.result.sources.length, 1, 'only https links');
  assert.strictEqual(s.current, null);
  assert.strictEqual(K.suggestSkill(s), K.SKILLS[1], 'next untried skill');
  K.SKILLS.slice(1).forEach((sk, i) => { K.setScenario(s, { skill: sk, scenario: 'S' }, now); K.grade(s, 'answer here', { score: 9 - (i % 3) }, now); });
  const st = K.skillStats(s);
  assert.ok(st.every((x) => x.n === 1));
  const low = st.slice().sort((a, b) => a.avg - b.avg)[0].skill;
  assert.strictEqual(K.suggestSkill(s), low, 'then the weakest');
  assert.strictEqual(K.scenarioInput(s, 'Sleep', now).recent.length, 10);
  assert.strictEqual(K.grade(K.defaults(), 'x', {}), null, 'nothing to grade');
  const bad = K.cleanResult({ score: 42 });
  assert.strictEqual(bad.score, null);
});

t('validate: a damaged backup can not break it', () => {
  assert.strictEqual(K.validate(null), null);
  const v = K.validate({ child: { name: 'K'.repeat(100), birth: 'yesterday' }, history: [null, { at: 'x', scenario: 's' }, { at: '2026-11-19T10:00:00Z', scenario: 's', skill: 'Sleep', result: { score: 5 } }] });
  assert.strictEqual(v.child.name.length, 40);
  assert.strictEqual(v.child.birth, '');
  assert.strictEqual(v.history.length, 1);
  assert.strictEqual(v.history[0].result.score, 5);
});
console.log(n + ' coach tests passed');
