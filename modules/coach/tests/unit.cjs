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

t('a real situation: advice kept (no score), practised as a scenario, kept through backup', () => {
  const s = K.defaults(); s.child.birth = '2025-11-24';
  assert.throws(() => K.addReal(s, 'x', {}), /advice/);
  const h = K.addReal(s, 'She screams in the car seat', { title: 'Car seat', skill: 'Nope', steps: ['a', 5, 'b'], say: ['hi'], summary: 'S', sources: [{ title: 'x', url: 'javascript:alert(1)' }] }, new Date(2026, 10, 19));
  assert.strictEqual(h.kind, 'real'); assert.strictEqual(h.skill, 'Connection'); assert.deepStrictEqual(h.advice.steps, ['a', 'b']);
  assert.deepStrictEqual(h.advice.sources, [], 'only https links');
  assert.deepStrictEqual(K.skillStats(s).filter((x) => x.n), [], 'not a score');
  const c = K.practiseReal(s, h.id, new Date(2026, 10, 19));
  assert.strictEqual(c.scenario, 'She screams in the car seat'); assert.ok(/Next time/.test(c.question));
  assert.strictEqual(K.practiseReal(s, 'nope'), null);
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.history[0].kind, 'real'); assert.deepStrictEqual(v.history[0].advice.steps, ['a', 'b']);
});
t('validate: a damaged backup can not break it', () => {
  assert.strictEqual(K.validate(null), null);
  const v = K.validate({ child: { name: 'K'.repeat(100), birth: 'yesterday' }, history: [null, { at: 'x', scenario: 's' }, { at: '2026-11-19T10:00:00Z', scenario: 's', skill: 'Sleep', result: { score: 5 } }] });
  assert.strictEqual(v.child.name.length, 40);
  assert.strictEqual(v.child.birth, '');
  assert.strictEqual(v.history.length, 1);
  assert.strictEqual(v.history[0].result.score, 5);
});
t('tips: "Try this week" lines from the last 7 days, newest first, no repeats', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  const add = (day, practice, skill) => { K.setScenario(s, { scenario: 'x', skill: skill || 'Sleep' }, new Date(2026, 10, day)); K.grade(s, 'my answer', { score: 7, practice: practice }, new Date(2026, 10, day, 12)); };
  add(10, 'Too old');
  add(15, 'Name her feelings.', 'Connection');
  add(16, '');
  add(17, 'Same bedtime song');
  add(18, 'name her feelings. ');
  add(19, 'Pause before you answer');
  const now = new Date(2026, 10, 19, 20);
  assert.deepStrictEqual(K.tips(s, now).map((x) => x.text), ['Pause before you answer', 'name her feelings.', 'Same bedtime song']);
  assert.deepStrictEqual(K.tips(s, now, 5).map((x) => x.text), ['Pause before you answer', 'name her feelings.', 'Same bedtime song']);
  assert.strictEqual(K.tips(s, new Date(2026, 11, 30)).length, 0, 'all older than a week');
  assert.strictEqual(K.tips(K.defaults(), now).length, 0);
  K.addReal(s, 'She bites', { steps: ['a'] }, new Date(2026, 10, 19, 13));
  assert.strictEqual(K.tips(s, now).length, 3, 'advice for a real situation has no "try this week" line');
});
t('validate keeps the scenario he was answering and his drafts', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  K.setScenario(s, { title: 'T', skill: 'Sleep', scenario: 'S' }, new Date(2026, 10, 19));
  s.current.answer = 'half an answer'; s.realDraft = 'she bites';
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual([v.current.scenario, v.current.answer, v.current.skill, v.realDraft], ['S', 'half an answer', 'Sleep', 'she bites']);
  assert.strictEqual(K.validate({ history: [], current: { scenario: '  ' } }).current, null);
  assert.strictEqual(K.validate({ history: [], current: 'x', realDraft: 5 }).realDraft, undefined);
});
console.log(n + ' coach tests passed');
