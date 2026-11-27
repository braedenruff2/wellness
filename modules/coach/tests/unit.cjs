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
  assert.strictEqual(K.ageMonths('2024-01-31', new Date(2024, 1, 28)), 0, 'not yet');
  assert.strictEqual(K.ageMonths('2024-01-31', new Date(2024, 1, 29)), 1, 'born on the 31st: a month old on the last day of February');
  assert.strictEqual(K.ageMonths('2025-10-31', new Date(2026, 10, 30)), 13, 'end of a 30-day month');
  assert.strictEqual(K.ageText('2024-02-29', new Date(2026, 1, 28)), K.ageText('2024-02-29', new Date(2026, 2, 1)), '29 Feb birthday: 2 on 28 Feb');
  // spring-forward DST (2026-03-08 in North America): 23-hour day still counts as 1 full calendar day
  assert.strictEqual(K.ageText('2026-03-08', new Date(2026, 2, 9, 0, 30)), '1 day old');
  assert.strictEqual(K.ageText('2026-03-07', new Date(2026, 2, 9, 0, 30)), '2 days old');
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
  { // scores over time, oldest first, the last 10 kept
    const q = K.defaults();
    for (let i = 1; i <= 12; i++) { K.setScenario(q, { skill: 'Sleep', scenario: 'S' }, now); K.grade(q, 'answer here', { score: (i % 10) + 1 }, now); }
    const sl = K.skillStats(q).find((x) => x.skill === 'Sleep');
    assert.strictEqual(sl.n, 12); assert.deepStrictEqual(sl.scores, [4, 5, 6, 7, 8, 9, 10, 1, 2, 3]);
    assert.ok(K.skillStats(q).filter((x) => x.skill !== 'Sleep').every((x) => Array.isArray(x.scores) && !x.scores.length));
  }
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
t('what she can do now: chips toggle in list order, a note, sent with scenario requests, kept by a restore', () => {
  const s = K.defaults(); s.child.birth = '2025-06-10';
  assert.strictEqual(K.canText(s), '');
  assert.strictEqual(K.scenarioInput(s, null, new Date(2026, 5, 10)).can, '');
  K.toggleCan(s, 'Climbs'); K.toggleCan(s, 'Walks'); K.toggleCan(s, 'Gets down by herself');
  assert.deepStrictEqual(s.child.can, ['Walks', 'Gets down by herself', 'Climbs'], 'list order');
  K.toggleCan(s, 'Climbs');
  assert.deepStrictEqual(s.child.can, ['Walks', 'Gets down by herself'], 'tap again: off');
  assert.strictEqual(K.toggleCan(s, 'Flies'), null, 'unknown chip');
  K.setCanNote(s, '  says mama and dada  ');
  assert.strictEqual(K.canText(s), 'walks; gets down by herself. Also: says mama and dada');
  assert.strictEqual(K.scenarioInput(s, 'Sleep', new Date(2026, 5, 10)).can, 'walks; gets down by herself. Also: says mama and dada');
  K.setCanNote(s, ''); assert.strictEqual(s.child.canNote, undefined);
  K.setCanNote(s, 'x'.repeat(500)); assert.strictEqual(s.child.canNote.length, 300);
  const v = K.validate({ child: { name: 'K', birth: '2025-06-10', can: ['Points', 'Walks', 'Walks', 'Hacks', 5], canNote: 'only note' }, history: [] });
  assert.deepStrictEqual(v.child.can, ['Walks', 'Points']);
  assert.strictEqual(v.child.canNote, 'only note');
  const w = K.validate({ child: { name: 'K', birth: '2025-06-10' }, history: [] });
  assert.strictEqual(w.child.can, undefined); assert.strictEqual(K.canText(w), '');
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
t('a grade that comes back after he moved on is saved for the scenario he answered', () => {
  const s = K.defaults(); s.child.birth = '2025-06-10';
  K.setScenario(s, { title: 'X', skill: 'Crying and comfort', scenario: 'scenario X text here', question: 'What do you do?' });
  const x = s.current;
  K.setScenario(s, { title: 'Y', skill: 'Sleep', scenario: 'scenario Y text here', question: 'What do you do?' });
  const h = K.grade(s, 'my answer to X, long enough', { score: 7, verdict: 'ok' }, null, x);
  assert.strictEqual(h.title, 'X'); assert.strictEqual(s.current.title, 'Y', 'the new scenario stays');
});
t('tipNotes: his "Did you try it?" and "Not for me?" answers on tips, newest last, with the tip text', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  K.setScenario(s, { scenario: 'x', skill: 'Safety' }, new Date(2026, 10, 18));
  const h = K.grade(s, 'my answer', { score: 7, practice: 'Pause one beat after a wobble' }, new Date(2026, 10, 18, 12));
  K.setScenario(s, { scenario: 'y', skill: 'Sleep' }, new Date(2026, 10, 19));
  const h2 = K.grade(s, 'my answer', { score: 6, practice: 'Same bedtime song' }, new Date(2026, 10, 19, 12));
  const me = { feedback: [
    { part: 'coach', kind: 'after', about: 'tip:' + h2.id, a: { tried: 'Didn’t work' } },
    { part: 'coach', kind: 'after', about: 'tip:' + h.id, a: { tried: 'Not yet' } },
    { part: 'calm', kind: 'notfit', about: 'tip:' + h.id, a: { reasons: ['Too long'] } },
    { part: 'coach', kind: 'notfit', about: 'tip:' + h.id, a: { reasons: ['I know this already', 5] }, shown: 'Pause one beat after a wobble', note: ' She already does this ' },
    { part: 'coach', kind: 'notfit', about: 'tip:gone', a: { reasons: [] }, shown: 'An old tip', note: '' },
    { part: 'coach', kind: 'notfit', about: 'tip:gone2', a: { reasons: [] } },
    { part: 'coach', kind: 'notfit', about: 'advice:x', a: { reasons: [] }, shown: 'not a tip' }
  ] };
  assert.deepStrictEqual(K.tipNotes(s, me), [
    { tip: 'Same bedtime song', skill: 'Sleep', tried: 'Didn’t work' },
    { tip: 'Pause one beat after a wobble', skill: 'Safety', notForMe: true, reasons: ['I know this already'], note: 'She already does this' },
    { tip: 'An old tip', notForMe: true }
  ]);
  assert.strictEqual(K.tipNotes(s, me, 1).length, 1);
  assert.strictEqual(K.tipNotes(s, me, 1)[0].tip, 'An old tip', 'keeps the newest');
  assert.deepStrictEqual(K.tipNotes(s, null), []);
  assert.deepStrictEqual(K.tipNotes(s, { feedback: 'x' }), []);
});
t('workedTips: tips rated "It worked", newest first, deduped, survives past 7 days, excludes Not for me', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  const add = (day, practice, skill) => {
    K.setScenario(s, { scenario: 'x', skill: skill || 'Sleep' }, new Date(2026, 9, day));
    return K.grade(s, 'my answer', { score: 8, practice }, new Date(2026, 9, day, 12));
  };
  const hOld = add(1, 'Sing the same quiet song', 'Sleep');
  const hDup = add(5, 'sing the same quiet song ', 'Routines');
  const hMid = add(10, 'Offer two safe choices', 'Connection');
  const hNotFit = add(12, 'Count to three', 'Safety');
  const hOther = add(14, 'Use a calm whisper', 'Crying and comfort');
  const me = { feedback: [
    { part: 'coach', kind: 'after', about: 'tip:' + hOld.id, at: '2026-10-02T12:00:00Z', a: { tried: 'It worked' } },
    { part: 'coach', kind: 'after', about: 'tip:' + hDup.id, at: '2026-10-06T12:00:00Z', a: { tried: 'It worked' } },
    { part: 'coach', kind: 'after', about: 'tip:' + hMid.id, at: '2026-10-11T12:00:00Z', edited: '2026-10-20T12:00:00Z', a: { tried: 'It worked' } },
    { part: 'coach', kind: 'after', about: 'tip:' + hNotFit.id, at: '2026-10-13T12:00:00Z', a: { tried: 'It worked' } },
    { part: 'coach', kind: 'notfit', about: 'tip:' + hNotFit.id, at: '2026-10-14T12:00:00Z', a: { reasons: ['Doesn’t fit my situation'] } },
    { part: 'coach', kind: 'after', about: 'tip:' + hOther.id, at: '2026-10-15T12:00:00Z', a: { tried: 'Sort of' } },
    { part: 'coach', kind: 'after', about: 'tip:missing', at: '2026-10-16T12:00:00Z', a: { tried: 'It worked' } }
  ] };
  const w = K.workedTips(s, me);
  assert.deepStrictEqual(w.map((x) => [x.id, x.text, x.skill]), [
    [hMid.id, 'Offer two safe choices', 'Connection'],
    [hDup.id, 'sing the same quiet song', 'Routines']
  ], 'edited timestamp newest first, deduped to newest, excludes Sort of / notfit / missing');
  assert.strictEqual(K.workedTips(s, me, 1).length, 1);
  assert.deepStrictEqual(K.workedTips(s, null), []);
  assert.deepStrictEqual(K.workedTips(s, { feedback: 'bad' }), []);
});
t('tipNotes orders feedback chronologically by timestamp and validate/ageMonths reject impossible calendar dates', () => {
  const s = K.defaults(); s.child = { name: 'Kid', birth: '2025-11-24' };
  const me = { feedback: [
    { part: 'coach', kind: 'notfit', about: 'tip:newer', at: '2026-11-20T12:00:00Z', shown: 'Newer tip', a: { reasons: ['I know this already'] } },
    { part: 'coach', kind: 'notfit', about: 'tip:older', at: '2026-11-18T12:00:00Z', shown: 'Earlier-day logged tip', a: { reasons: ['Too long'] } }
  ] };
  assert.deepStrictEqual(K.tipNotes(s, me, 1).map((x) => x.tip), ['Newer tip'], 'earlier-day entry appended later does not displace newer tip');
  assert.strictEqual(K.ageMonths('2025-02-30', new Date(2026, 10, 20)), null);
  assert.strictEqual(K.ageText('2025-13-01', new Date(2026, 10, 20)), '');
  assert.strictEqual(K.validate({ child: { name: 'Kid', birth: '2025-02-30' }, history: [] }).child.birth, '');
  assert.strictEqual(K.validate({ child: { name: 'Kid', birth: '2024-02-29' }, history: [] }).child.birth, '2024-02-29');
});
t('teachForAge, setTeach, doneToday, doneInLast, and validate persistence', () => {
  const s = K.defaults();
  assert.strictEqual(K.teachForAge(s, new Date(2026, 10, 20)), null, 'no birthday -> null');
  assert.ok(K.TEACH.some((x) => x.id === 'opencup' && x.from === 6), 'open cup starts at 6 months');
  assert.ok(K.TEACH.some((x) => x.id === 'sleepnear' && x.from <= 12 && x.to >= 15), 'falling asleep in the crib is offered at 12-15 months');
  // 11-month-old: open cup is in "now", bottle transition/spoon are in "next" (12m), tummy time (0-6m) is in "earlier"
  s.child.birth = '2025-12-15';
  const now11 = new Date(2026, 10, 20); // 11 months
  const t11 = K.teachForAge(s, now11);
  assert.strictEqual(t11.ageMonths, 11);
  assert.ok(t11.now.some((x) => x.id === 'opencup'), 'open cup shown in now at 11m');
  assert.ok(t11.next.some((x) => x.id === 'nobottle' && x.from === 12), 'bottle transition previewed in coming up next');
  assert.ok(t11.earlier.some((x) => x.id === 'tummy'), 'unfinished earlier skill listed gently');
  // At 14 months, open cup (6-12m) moves to "earlier" catch-up unless marked done
  const now14 = new Date(2027, 1, 20);
  assert.ok(K.teachForAge(s, now14).earlier.some((x) => x.id === 'opencup'), 'missed 6-12m open cup shows in catch-up at 14m');
  K.setTeach(s, 'opencup', 'doing');
  assert.strictEqual(s.teach.opencup, 'doing');
  assert.deepStrictEqual(K.scenarioInput(s, null, now14).practising, ['Drink from an open cup'], 'practising skills included in scenario input');
  K.setTeach(s, 'opencup', 'done');
  assert.ok(!K.teachForAge(s, now14).earlier.some((x) => x.id === 'opencup'), 'marked done drops out of catch-up');
  assert.strictEqual(K.setTeach(s, 'unknown-id', 'done'), null);
  K.setTeach(s, 'opencup', '');
  assert.strictEqual(s.teach.opencup, undefined);
  // validate keeps valid teach statuses and drops unknown ids/values
  const v = K.validate({ child: { birth: '2025-12-15' }, history: [], teach: { opencup: 'doing', backwards: 'done', bad: 'done', spoon: 'maybe' } });
  assert.deepStrictEqual(v.teach, { opencup: 'doing', backwards: 'done' });
  // doneToday & doneInLast ignore real-situation advice and count only graded scenarios
  const today = new Date(2026, 10, 20, 15, 0);
  assert.strictEqual(K.doneToday(s, today), false);
  K.addReal(s, 'Car seat crying', { steps: ['Sing'] }, today);
  assert.strictEqual(K.doneToday(s, today), false, 'real advice is not the daily scenario');
  assert.strictEqual(K.doneInLast(s, 7, today), 0);
  K.setScenario(s, { skill: 'Feeding', scenario: 'Refuses cup' }, today);
  K.grade(s, 'Offer a small open cup with a splash of water', { score: 8 }, today);
  assert.strictEqual(K.doneToday(s, today), true);
  assert.strictEqual(K.doneToday(s, new Date(2026, 10, 21, 9, 0)), false, 'next day resets');
  assert.strictEqual(K.doneInLast(s, 7, new Date(2026, 10, 26, 9, 0)), 1);
  assert.strictEqual(K.doneInLast(s, 7, new Date(2026, 10, 28, 9, 0)), 0);
});
t('scenarioDue & validate persistence for daily auto-generated scenarios', () => {
  const day1 = new Date(2026, 10, 20, 10, 0), day2 = new Date(2026, 10, 21, 10, 0);
  const s = K.defaults();
  assert.strictEqual(K.scenarioDue(s, day1), false, 'not due without child birthday');
  s.child.birth = '2025-11-24';
  assert.strictEqual(K.scenarioDue(s, day1), true, 'due once birthday set');
  s.autoTried = '2026-11-20';
  assert.strictEqual(K.scenarioDue(s, day1), false, 'not due again same day after autoTried');
  assert.strictEqual(K.scenarioDue(s, day2), true, 'due again next day');
  s.autoCancelled = '2026-11-21';
  assert.strictEqual(K.scenarioDue(s, day2), false, 'not due same day after cancel');
  delete s.autoTried; delete s.autoCancelled;
  K.setScenario(s, { skill: 'Sleep', scenario: 'Crying at nap' }, day1);
  assert.strictEqual(K.scenarioDue(s, day1), false, 'not due when scenario already active');
  K.grade(s, 'Hold calmly and sing', { score: 8 }, day1);
  assert.strictEqual(K.scenarioDue(s, day1), false, 'not due when already graded today');
  assert.strictEqual(K.scenarioDue(s, day2), true, 'due next day after yesterday graded');
  const v = K.validate({ child: { birth: '2025-11-24' }, history: [], autoTried: '2026-11-20', autoCancelled: '2026-02-30' });
  assert.strictEqual(v.autoTried, '2026-11-20');
  assert.strictEqual(v.autoCancelled, undefined, 'invalid calendar date dropped');
});
t('validate keeps the automatic scenario back-off ({day, n 1-3, next}) and drops a bad one', () => {
  const base = { child: { name: 'M', birth: '2025-11-24' }, history: [], current: null, pending: null };
  assert.deepStrictEqual(K.validate({ ...base, autoFail: { day: '2026-11-22', n: 2, next: 1795000000000 } }).autoFail, { day: '2026-11-22', n: 2, next: 1795000000000 });
  assert.strictEqual(K.validate({ ...base, autoFail: { day: 'x', n: 2, next: 1 } }).autoFail, undefined);
  assert.strictEqual(K.validate({ ...base, autoFail: { day: '2026-11-22', n: 9, next: 1 } }).autoFail, undefined);
});
console.log(n + ' coach tests passed');
