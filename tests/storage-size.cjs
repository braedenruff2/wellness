/* How big the phone's saved data gets: 120 days (his parental leave) of heavy daily use through the real cores, all
   stores together, must stay well under the WebView's localStorage quota (about 5 million characters per app), and
   the logs that are capped stay capped after a year. (A refused save is shown on Home: tests/e2e-savefail.cjs.) */
'use strict';
const assert = require('assert');
const TG = require('../app/www/modules/tagalog/tagalog-core.js');
const CO = require('../app/www/modules/coach/coach-core.js');
const FC = require('../app/www/modules/faith/core.js');
const CA = require('../app/www/modules/calm/calm-core.js');
const WK = require('../app/www/modules/workout/workout-core.js');
const ME = require('../app/www/modules/me/me-core.js');
const words = (n) => Array.from({ length: n }, (_, i) => 'word' + (i % 50)).join(' ');
function simulate(days) {
  const tg = TG.defaults(), co = CO.defaults(), fc = FC.defaults ? FC.defaults() : { journal: [], sessions: [] }, ca = CA.defaults(), wk = WK.defaults(), me = ME.defaults();
  if (!Array.isArray(fc.journal)) fc.journal = [];
  co.child = { name: '{child}', birth: '2025-01-15' };
  const pack = { id: '2026-11-18' };
  for (let d = 0; d < days; d++) {
    const at = (h, m) => new Date(2026, 10, 18 + d, h, m || 0);
    const lesson = { day: 1 + (d % 7), words: Array.from({ length: 8 }, (_, i) => ({ tl: 'salita ' + d + '-' + i, en: 'word ' + i })) };
    TG.finishLesson(tg, { id: 'p' + Math.floor(d / 7) }, lesson, at(9));
    for (let i = 0; i < 25; i++) TG.recordAnswer(tg, pack, lesson, { prompt: 'Translate this sentence please ' + i, type: 'type' }, i % 5 !== 0, at(9, i), 'Umiinom ng gatas ang baby ' + i);
    Object.keys(tg.cards).slice(0, 15).forEach((k, i) => TG.review(tg, k, i % 4 !== 0, at(10, i)));
    CO.setScenario(co, { title: 'A moment ' + d, skill: 'Connection', scenario: words(110), question: words(15) }, at(11));
    CO.grade(co, words(70), { score: 7, verdict: words(30), good: [words(25), words(25), words(25)], improve: [words(25), words(25)], better: words(100), why: words(60), practice: words(40) }, at(11, 20));
    FC.addEntry(fc, 'journal', words(130), null, at(21));
    CA.record(ca, 'body', 8, 3, 2, at(20)); CA.record(ca, 'sigh', 1, 4, 3, at(15));
    CA.rateSit(CA.record(ca, 'count', 20, null, null, at(6)), 1 + (d % 3), ['Sleepy', 'Restless']); // a meditation-path sit every morning
    if (d % 2 === 0) { for (let i = 0; i < 5; i++) for (let n = 0; n < 3; n++) WK.logSet(wk, 'A', i, 12, 10, at(13, i * 5 + n)); WK.endSession(wk, at(14)); }
    else WK.logRest(wk, WK.iso(at(9)), 'Busy day', at(9));
    ['calm', 'faith', 'tagalog', 'workout'].forEach((p) => { const q = ME.questions(p)[0]; ME.answer(me, p, p + '@' + d, q.k, q.opts[1], at(22)); });
    ME.CHECKIN.forEach((q) => ME.checkin(me, WK.iso(at(8)), q.k, q.opts[1], at(8)));
  }
  return { 'wl.tagalog.v1': tg, 'wl.coach.v1': co, 'fc.v1': fc, 'wl.calm.v1': ca, 'wl.workout.v1': wk, 'wl.me.v1': me };
}
const sizes = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, JSON.stringify(v).length]));
const total = (z) => Object.values(z).reduce((a, b) => a + b, 0);
const z120 = sizes(simulate(120));
console.log('120 days:', JSON.stringify(z120), 'total', total(z120));
assert.ok(total(z120) < 2500000, 'under half the quota after 120 days: ' + total(z120));
const s365 = simulate(365);
assert.ok(s365['wl.tagalog.v1'].answers.length <= 2000 && s365['wl.tagalog.v1'].reviews.length <= 2000, 'Tagalog logs capped');
assert.ok(s365['wl.coach.v1'].history.length <= 300, 'coach history capped');
assert.ok(s365['wl.me.v1'].feedback.length <= 600, 'quick answers capped');
const z365 = sizes(s365);
console.log('365 days total', total(z365), 'calm', z365['wl.calm.v1']);
assert.ok(z365['wl.calm.v1'] < 400000, 'a year of Calm (3 a day incl. a rated sit) stays small: ' + z365['wl.calm.v1']);
assert.ok(total(z365) < 4000000, 'a year of everything stays under the quota: ' + total(z365));
// the backup / Drive sync file has the same stores as JSON strings: a year must stay well under what the phone reads
// back from Drive (Sync.MAX_READ_BYTES, 16 MB) and quick to write
const backup = JSON.stringify({ app: 'wellness', exported: new Date().toISOString(), stores: Object.fromEntries(Object.entries(s365).map(([k, v]) => [k, JSON.stringify(v)])), requests: [], acked: [] });
console.log('a year as a backup/sync file:', backup.length, 'chars');
assert.ok(Buffer.byteLength(backup, 'utf8') < 4 * 1024 * 1024, 'backup of a year < 4 MB: ' + Buffer.byteLength(backup, 'utf8'));
console.log('storage size checks passed');
