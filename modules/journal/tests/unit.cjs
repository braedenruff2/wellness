/* Wisdom toolkit logic tests (Zoom Out, Decision Log with 14/30/90-day revisits, Personal Principles, validate).
   Runs across 4 time zones via tests/run-all.cjs. */
'use strict';
const assert = require('assert');
const WC = require('../../../app/www/modules/journal/wisdom-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

const now = new Date(2026, 10, 27, 18, 0); // Fri 2026-11-27

t('Zoom Out: add, chronological order, blind-spot feedback cleaning, and remove', () => {
  const s = WC.defaults();
  assert.strictEqual(WC.addZoomOut(s, { situation: '   ' }, now), null);
  const z1 = WC.addZoomOut(s, {
    situation: 'He is annoyed that the evening schedule shifted.',
    assuming: 'Assuming it ruins the whole evening.',
    otherSide: 'Everyone was tired after a long day.',
    yearView: 'Staying calm matters far more than the schedule.',
    nextStep: 'Take a breath and adapt dinner.'
  }, now);
  assert.ok(z1 && z1.date === '2026-11-27' && !('feedback' in z1));
  const zOld = WC.addZoomOut(s, { situation: 'Older moment' }, new Date(2026, 10, 20, 9, 0));
  assert.deepStrictEqual(s.zoomouts.map((x) => x.id), [z1.id, zOld.id], 'newest first even when backfilled');

  assert.strictEqual(WC.setZoomOutFeedback(s, z1.id, { blindSpots: ['', 7] }), null, 'empty/junk feedback rejected');
  const fb = WC.setZoomOutFeedback(s, z1.id, {
    blindSpots: ['Treating a small delay as disrespect', 'Skipping rest earlier'],
    otherSide: 'They may have been doing their best with low energy.',
    reframe: 'In a year you will remember the warmth, not the clock.',
    nextStep: 'Ask what would make tonight easiest.'
  });
  assert.strictEqual(fb.blindSpots.length, 2);
  assert.strictEqual(s.zoomouts[0].feedback.reframe, fb.reframe);
  assert.strictEqual(WC.removeZoomOut(s, zOld.id), true);
  assert.strictEqual(s.zoomouts.length, 1);
});

t('Decision Log: DST-safe revisit dates, dueDecisions, review, snooze, and remove', () => {
  const s = WC.defaults();
  assert.strictEqual(WC.addDecision(s, { choice: '  ' }, now), null);
  // Across DST fall-back (Oct 20 + 14 days = Nov 3)
  const d1 = WC.addDecision(s, { choice: 'Switch to 2 workouts/wk during busy month', why: 'Sleep was short', expect: 'More consistent sessions', reviewDays: 14 }, new Date(2026, 9, 20, 10, 0));
  assert.strictEqual(d1.reviewOn, '2026-11-03');
  const d2 = WC.addDecision(s, { choice: 'Keep cooking flexible', expect: 'Less food waste', reviewDays: 30 }, now);
  assert.strictEqual(d2.reviewOn, '2026-12-27');

  assert.deepStrictEqual(WC.dueDecisions(s, new Date(2026, 10, 2, 23, 0)), [], 'not due the day before');
  assert.deepStrictEqual(WC.dueDecisions(s, now).map((x) => x.id), [d1.id], 'overdue decision surfaces');

  // Snoozing an overdue decision moves reviewOn 14 days from today (not from old reviewOn)
  const sn = WC.snoozeDecision(s, d1.id, 14, now);
  assert.strictEqual(sn, '2026-12-11');
  assert.deepStrictEqual(WC.dueDecisions(s, now), [], 'snoozed decision no longer due today');
  assert.deepStrictEqual(WC.dueDecisions(s, new Date(2026, 11, 11, 9, 0)).map((x) => x.id), [d1.id], 'due on snoozed date');

  // Reviewing clears it from dueDecisions
  const rev = WC.reviewDecision(s, d1.id, { outcome: 'Better than expected', actual: 'Hit 2/wk every week without guilt', lesson: 'Lower the floor during busy seasons' }, new Date(2026, 11, 12, 9, 0));
  assert.strictEqual(rev.outcome, 'Better than expected');
  assert.deepStrictEqual(WC.dueDecisions(s, new Date(2026, 11, 15, 9, 0)), []);
  assert.strictEqual(WC.removeDecision(s, d2.id), true);
  assert.strictEqual(s.decisions.length, 1);
});

t('Personal Principles & exportText: tags, fromDecisionId, chronological order, plain-text export', () => {
  const s = WC.defaults();
  assert.strictEqual(WC.exportText(s, now), '');
  assert.strictEqual(WC.addPrinciple(s, { text: '' }, now), null);
  const p1 = WC.addPrinciple(s, { text: 'Never solve big problems hungry or after 9 pm', context: 'Late night argument fizzled after sleep', tag: 'Family' }, now);
  const p2 = WC.addPrinciple(s, { text: 'Lower the floor during busy weeks', tag: 'InvalidTag', fromDecisionId: 'dec-1' }, new Date(2026, 10, 25, 9, 0));
  assert.strictEqual(p1.tag, 'Family');
  assert.strictEqual(p2.tag, '');
  assert.strictEqual(p2.fromDecisionId, 'dec-1');
  assert.deepStrictEqual(s.principles.map((x) => x.id), [p1.id, p2.id]);
  WC.addZoomOut(s, { situation: 'Test situation', nextStep: 'Pause first' }, now);
  WC.addDecision(s, { choice: 'Test choice', expect: 'Good outcome', reviewDays: 30 }, now);
  const txt = WC.exportText(s, now);
  assert.ok(txt.includes('Personal Principles') && txt.includes('Never solve big problems') && txt.includes('Decision Log') && txt.includes('Zoom Out Reflections'), txt);
  assert.strictEqual(WC.removePrinciple(s, p2.id), true);
  assert.strictEqual(s.principles.length, 1);
});

t('validate: round-trips clean state, strips corrupt dates/entries, and stays idempotent', () => {
  const s = WC.defaults();
  WC.addZoomOut(s, { situation: 'He paused before replying', assuming: 'Might be tired', feedback: { blindSpots: ['Check tone'], reframe: 'Long view' } }, now);
  WC.addDecision(s, { choice: 'Simplify weeknight dinners', expect: 'Calmer evenings', reviewDays: 30 }, now);
  WC.addPrinciple(s, { text: 'Ask one curious question first', tag: 'Parenting' }, now);
  const raw = JSON.parse(JSON.stringify(s));
  raw.zoomouts.push(null, { situation: '', date: '2026-11-27' }, { situation: 'bad date', at: 'nope', date: '2026-02-30' });
  raw.decisions.push(null, { choice: 'bad', at: 'bad', date: '2026-99-99' });
  raw.principles.push(null, { text: 'bad', at: 'bad', date: '2026-02-29' });
  const v = WC.validate(raw);
  assert.strictEqual(v.zoomouts.length, 1);
  assert.strictEqual(v.decisions.length, 1);
  assert.strictEqual(v.principles.length, 1);
  assert.deepStrictEqual(WC.validate(JSON.parse(JSON.stringify(v))), v, 'idempotent round-trip');
  assert.strictEqual(WC.validate(null), null);
  assert.strictEqual(WC.validate({}), null);
});

t('409: ids from a backup that would break selectors (. : | quotes, spaces) get new safe ids; good ids are kept', () => {
  const at = '2026-11-20T10:00:00.000Z';
  const v = WC.validate({
    zoomouts: [{ id: 'a.b:c', at, situation: 'One' }, { id: 'mx1-2', at, situation: 'Two' }],
    decisions: [{ id: 'x|y', at, choice: 'Choose', reviewDays: 14 }, { id: '"q"', at, choice: 'Other', reviewDays: 30 }],
    principles: [{ id: 'has space', at, text: 'Be kind' }]
  });
  const ids = [].concat(v.zoomouts, v.decisions, v.principles).map((x) => x.id);
  assert.strictEqual(ids.length, 5, 'nothing dropped');
  ids.forEach((id) => assert.ok(/^[A-Za-z0-9_-]+$/.test(id), id));
  assert.ok(ids.includes('mx1-2'), 'a good id is kept');
  assert.strictEqual(new Set(ids).size, ids.length, 'no two the same');
});
console.log(n + ' journal wisdom unit tests passed');
