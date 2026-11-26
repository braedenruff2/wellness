/* A year (or any number of days) of heavy daily use, made through the real cores: every store the phone keeps.
   Used by tests/storage-size.cjs (how big it gets) and tests/e2e-perf.cjs (how fast Home draws with it). */
'use strict';
const TG = require('../../app/www/modules/tagalog/tagalog-core.js');
const CO = require('../../app/www/modules/coach/coach-core.js');
const FC = require('../../app/www/modules/faith/core.js');
const CA = require('../../app/www/modules/calm/calm-core.js');
const WK = require('../../app/www/modules/workout/workout-core.js');
const ME = require('../../app/www/modules/me/me-core.js');
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
module.exports = { simulate };
