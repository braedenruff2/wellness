/* A year (or any number of days) of heavy daily use, made through the real cores: every store the phone keeps.
   Used by tests/storage-size.cjs (how big it gets) and tests/e2e-perf.cjs (how fast Home draws with it). */
'use strict';
const TG = require('../../app/www/modules/tagalog/tagalog-core.js');
const CO = require('../../app/www/modules/coach/coach-core.js');
const FC = require('../../app/www/modules/faith/core.js');
const CA = require('../../app/www/modules/calm/calm-core.js');
const WK = require('../../app/www/modules/workout/workout-core.js');
const ME = require('../../app/www/modules/me/me-core.js');
const TD = require('../../app/www/modules/todo/todo-core.js');
const CK = require('../../app/www/modules/cook/cook-core.js');
const NT = require('../../app/www/lib/notes.js');
const WS = require('../../app/www/modules/journal/wisdom-core.js');
const words = (n) => Array.from({ length: n }, (_, i) => 'word' + (i % 50)).join(' ');
function simulate(days) {
  const tg = TG.defaults(), co = CO.defaults(), fc = FC.defaults ? FC.defaults() : { journal: [], sessions: [] }, ca = CA.defaults(), wk = WK.defaults(), me = ME.defaults();
  if (!Array.isArray(fc.journal)) fc.journal = [];
  const td = TD.defaults(), ck = CK.defaults(), nt = NT.defaults(), ws = WS.defaults();
  co.child = { name: '{child}', birth: '2025-01-15' };
  const start = new Date(2026, 10, 18, 8, 0);
  const bins = TD.add(td, 'bins every thursday at 7pm', null, start), rent = TD.add(td, 'rent every month', { due: '2026-11-30' }, start);
  const pack = { id: '2026-11-18' };
  for (let d = 0; d < days; d++) {
    const at = (h, m) => new Date(2026, 10, 18 + d, h, m || 0);
    const lesson = { day: 1 + (d % 7), words: Array.from({ length: 8 }, (_, i) => ({ tl: 'salita ' + d + '-' + i, en: 'word ' + i })) };
    TG.finishLesson(tg, { id: WK.iso(new Date(2026, 10, 18 + 7 * Math.floor(d / 7))) }, lesson, at(9)); // a weekly pack id is its Wednesday's date
    for (let i = 0; i < 25; i++) TG.recordAnswer(tg, pack, lesson, { prompt: 'Translate this sentence please ' + i, type: 'type' }, i % 5 !== 0, at(9, i), 'Umiinom ng gatas ang baby ' + i);
    Object.keys(tg.cards).slice(0, 15).forEach((k, i) => TG.review(tg, k, i % 4 !== 0, at(10, i)));
    CO.setScenario(co, { title: 'A moment ' + d, skill: 'Connection', scenario: words(110), question: words(15) }, at(11));
    CO.grade(co, words(70), { score: 7, verdict: words(30), good: [words(25), words(25), words(25)], improve: [words(25), words(25)], better: words(100), why: words(60), practice: words(40) }, at(11, 20));
    FC.addEntry(fc, 'journal', words(130), null, at(21));
    CA.record(ca, 'body', 8, 3, 2, at(20)); CA.record(ca, 'sigh', 1, 4, 3, at(15));
    const sit = CA.rateSit(CA.record(ca, 'count', 20, null, null, at(6)), 1 + (d % 3), ['Sleepy', 'Restless']); // a meditation-path sit every morning
    CA.sitNote(sit, 'sit ' + d + ' ' + words(120)); CA.trimNotes(ca); // and his own words after it, every day, at the 600-character limit (calm.js trims as it saves)
    if (d % 2 === 0) { for (let i = 0; i < 5; i++) for (let n = 0; n < 3; n++) WK.logSet(wk, 'A', i, 12, 10, at(13, i * 5 + n)); WK.endSession(wk, at(14)); }
    else WK.logRest(wk, WK.iso(at(9)), 'Busy day', at(9));
    ['calm', 'faith', 'tagalog', 'workout'].forEach((p) => { const q = ME.questions(p)[0]; ME.answer(me, p, p + '@' + d, q.k, q.opts[1], at(22)); ME.afterNote(me, p, p + '@' + d, p + ' ' + d + ' ' + words(120), at(22, 1)); });
    ME.CHECKIN.forEach((q) => ME.checkin(me, WK.iso(at(8)), q.k, q.opts[1], at(8)));
    ME.checkinNote(me, WK.iso(at(8)), 'day ' + d + ' ' + words(120), at(8, 5)); // a full check-in note every day
    if (d % 5 === 1) ME.setStillUnwell(me, WK.iso(at(8)), 'Yes', at(8, 6));
    // to-dos: a few one-offs a day (most ticked), the weekly bins ticked each Thursday, rent each month
    for (let i = 0; i < 3; i++) { const x = TD.add(td, 'errand ' + d + '-' + i + ' ' + words(4), null, at(7, i)); if (i < 2) TD.complete(td, x.id, at(17, i)); }
    if (at(19).getDay() === 4) TD.complete(td, bins.id, at(19, 30));
    if (rent.due === WK.iso(at(9))) TD.complete(td, rent.id, at(9, 30));
    // Parenting: his answer on each graded scenario's "This week, try" tip, and now and then "Not for me"
    const hid = co.history[co.history.length - 1].id;
    ME.answer(me, 'coach', 'tip:' + hid, 'tried', ['It worked', 'Sort of', 'Didn’t work'][d % 3], at(21, 30));
    if (d % 10 === 0) ME.notFit(me, 'coach', 'tip:' + hid, words(25), ['I know this already'], words(20), at(21, 31));
    // Cooking: meals logged for him and {child}, the fridge topped up weekly, a plan slot marked
    ['breakfast', 'lunch', 'dinner'].forEach((m, i) => { CK.logMe(ck, { text: words(6), meal: m, portion: 'Regular', tags: ['Veggies'] }, at(8 + 5 * i)); CK.logChild(ck, { offered: words(5), meal: m, ate: 'Most of it', note: words(4) }, at(8 + 5 * i, 10)); });
    if (d % 7 === 0) ['chicken', 'milk', 'spinach', 'rice'].forEach((n) => CK.addPantryItem(ck, { name: n, qty: 2, unit: 'pcs' }, at(12)));
    if (d < 150) CK.addPantryItem(ck, { name: 'pantry item ' + d, qty: 1, unit: 'pcs', cat: 'pantry', expiresInDays: 30 }, at(12)); // a full pantry (150)
    // an AI week plan now and then (the newest 40 AI recipes are kept)
    if (d % 7 === 0) CK.applyAiPlan(ck, { note: words(20), days: CK.weekDays(at(12)).map((date) => ({ date, dinner: { title: 'AI dinner ' + date, mins: 25, protein: '~30 g', babyNote: words(10), tip: words(10), ingredients: [{ name: 'chicken thighs', qty: 4, unit: 'pcs', cat: 'meat' }, { name: 'rice', qty: 1, unit: 'cup', cat: 'pantry' }], steps: [words(12), words(12), words(12)] } })) }, at(12));
    CK.markSlot(ck, WK.iso(at(18)), 'dinner', 'made', '', at(19));
    if (d % 4 === 0) CK.markSlot(ck, WK.iso(at(12)), 'lunch', 'skipped', '', at(12));
    if (d === 0) {
      CK.addCustomFood(ck, { name: 'Sopas (bowl)', serving: '1 bowl', kcal: 360, pro: 26, carb: 38, fat: 10 });
      CK.setTargets(ck, 'me', { kcal: 2300, pro: 130 });
    }
    if (d % 3 === 0) NT.add(nt, 'note ' + d + ' ' + words(30), '#home', 'Idea', at(22, 10));
    if (d % 3 === 1) NT.markRead(nt, nt.notes.map((x) => x.id), at(23).toISOString(), Object.fromEntries(nt.notes.map((x) => [x.id, 'reply to ' + x.id + ' ' + words(60)]))); // a cloud run reads and answers every note (300 characters each)
    if (d % 7 === 0) {
      WS.addPrinciple(ws, { text: 'Principle ' + d + ' ' + words(8), context: words(10), tag: WS.TAGS[d % WS.TAGS.length] }, at(20, 0));
      const dec = WS.addDecision(ws, { choice: 'Decision ' + d, why: words(6), expect: words(8), reviewDays: 30 }, at(20, 5));
      if (d >= 30 && ws.decisions.length > 4) WS.reviewDecision(ws, ws.decisions[ws.decisions.length - 1].id, { outcome: 'As expected', actual: words(8), lesson: words(6) }, at(20, 10));
      if (d % 14 === 0 && dec) WS.addZoomOut(ws, { situation: 'Zoom ' + d + ' ' + words(12), assuming: words(6), nextStep: words(5) }, at(20, 15));
    }
  }
  return { 'wl.tagalog.v1': tg, 'wl.coach.v1': co, 'fc.v1': fc, 'wl.calm.v1': ca, 'wl.workout.v1': wk, 'wl.me.v1': me, 'wl.todo.v1': td, 'wl.cook.v1': ck, 'wl.notes.v1': nt, 'wl.wisdom.v1': ws };
}
module.exports = { simulate };
