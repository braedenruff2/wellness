/* Tagalog logic (no DOM): lesson packs (one week of 7 lessons, written each Wednesday by the scheduled Claude run),
   answer checking, spaced review of every word met (Leitner boxes), progress and the weekly summary that the next
   Wednesday's run uses to tailor the following week.
   Storage 'wl.tagalog.v1': { packs:{id: pack} (downloaded), done:{'packId/day': ISO}, cards:{tl:{en, box, due, seen, right, wrong}},
                              answers:[{at, pack, day, ok, prompt}], source, lastCheck } */
(function (root) {
  'use strict';
  var INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until the next review, by box
  // where new weeks come from (the PC pushes the wellness folder to this GitHub repo; changeable in the app)
  var DEFAULT_SOURCE = 'https://raw.githubusercontent.com/braedenruff2/wellness/main/modules/tagalog/packs/';
  function defaults() { return { packs: {}, done: {}, cards: {}, answers: [], source: DEFAULT_SOURCE, lastCheck: null, settings: { slow: true } }; }
  function iso(d) { var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }
  function addDays(s, n) { var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] + n); return iso(d); }

  /* Pack format check (used by the build tool, the tests, and before accepting a downloaded pack). */
  function checkPack(p) {
    var e = [];
    if (!p || typeof p !== 'object') return ['not an object'];
    if (!/^\d{4}-\d\d-\d\d$/.test(p.id || '')) e.push('id must be a YYYY-MM-DD date');
    if (!p.title) e.push('title missing');
    if (!Array.isArray(p.lessons) || !p.lessons.length) return e.concat('lessons missing');
    p.lessons.forEach(function (l, i) {
      var w = 'lesson ' + (i + 1) + ': ';
      if (l.day !== i + 1) e.push(w + 'day should be ' + (i + 1));
      ['title', 'intro'].forEach(function (k) { if (typeof l[k] !== 'string' || !l[k].trim()) e.push(w + k + ' missing'); });
      if (!Array.isArray(l.words) || l.words.length < 3) e.push(w + 'needs 3+ words');
      (l.words || []).forEach(function (x) { if (!x || !x.tl || !x.en) e.push(w + 'word without tl/en'); });
      (l.dialogue || []).forEach(function (x) { if (!x || !x.tl || !x.en) e.push(w + 'dialogue line without tl/en'); });
      if (!Array.isArray(l.exercises) || l.exercises.length < 3) e.push(w + 'needs 3+ exercises');
      (l.exercises || []).forEach(function (x, j) {
        var v = w + 'exercise ' + (j + 1) + ': ';
        if (['mc', 'listen', 'build', 'type'].indexOf(x.type) < 0) { e.push(v + 'unknown type ' + x.type); return; }
        if (typeof x.answer !== 'string' || !x.answer) e.push(v + 'answer missing');
        if ((x.type === 'mc' || x.type === 'listen') && (!Array.isArray(x.options) || x.options.indexOf(x.answer) < 0)) e.push(v + 'options must include the answer');
        if (x.type === 'listen' && !x.say) e.push(v + 'listen needs say');
        if (x.type === 'build' && (!Array.isArray(x.words) || norm(x.words.slice().sort().join(' ')) !== norm(x.answer.split(/\s+/).sort().join(' ')))) e.push(v + 'build words must be exactly the answer’s words');
        if (x.type !== 'listen' && !x.prompt) e.push(v + 'prompt missing');
      });
    });
    return e;
  }

  /* Compare typed answers kindly: case, punctuation, extra spaces and the ho/po variant don't matter. */
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[.,!?;:"“”]/g, '').replace(/\s+/g, ' ').trim(); }
  function check(ex, given) {
    var g = norm(given);
    if (!g) return false;
    var ok = [ex.answer].concat(ex.accept || []).map(norm);
    return ok.indexOf(g) >= 0 || ok.indexOf(g.replace(/\bho\b/g, 'po')) >= 0;
  }

  function allPacks(state, bundled) {
    var m = {};
    (bundled || []).forEach(function (p) { m[p.id] = p; });
    Object.keys(state.packs || {}).forEach(function (k) { m[k] = state.packs[k]; });
    return Object.keys(m).sort().map(function (k) { return m[k]; });
  }

  /* Today's lesson: the first unfinished lesson, oldest pack first (nothing is ever skipped). */
  function nextLesson(state, packs) {
    for (var i = 0; i < packs.length; i++) for (var j = 0; j < packs[i].lessons.length; j++) {
      if (!state.done[packs[i].id + '/' + packs[i].lessons[j].day]) return { pack: packs[i], lesson: packs[i].lessons[j] };
    }
    return null;
  }

  /* Finishing a lesson puts its words into review (due tomorrow). */
  function finishLesson(state, pack, lesson, now) {
    now = now || new Date();
    var k = pack.id + '/' + lesson.day;
    if (!state.done[k]) state.done[k] = now.toISOString();
    lesson.words.forEach(function (w) {
      if (!state.cards[w.tl]) state.cards[w.tl] = { en: w.en, box: 1, due: addDays(iso(now), 1), seen: 0, right: 0, wrong: 0, from: k };
    });
  }

  function recordAnswer(state, pack, lesson, ex, ok, now) {
    state.answers.push({ at: (now || new Date()).toISOString(), pack: pack.id, day: lesson.day, ok: !!ok, prompt: String(ex.prompt || ex.say || '').slice(0, 120), type: ex.type });
    if (state.answers.length > 2000) state.answers.splice(0, state.answers.length - 2000);
  }

  function dueCards(state, now) {
    var t = iso(now || new Date());
    return Object.keys(state.cards).filter(function (k) { return state.cards[k].due <= t; })
      .sort(function (a, b) { return state.cards[a].box - state.cards[b].box || (state.cards[a].due < state.cards[b].due ? -1 : 1); });
  }

  /* Review answer: right moves the card up a box (longer wait), wrong sends it back to box 1 (tomorrow). */
  function review(state, tl, right, now) {
    var c = state.cards[tl]; if (!c) return null;
    var t = iso(now || new Date());
    c.seen++;
    if (right) { c.right++; c.box = Math.min(INTERVALS.length - 1, c.box + 1); }
    else { c.wrong++; c.box = 1; }
    c.due = addDays(t, INTERVALS[c.box]);
    c.last = t;
    return c;
  }

  function stats(state, now) {
    now = now || new Date();
    var from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    var keys = Object.keys(state.cards);
    var known = keys.filter(function (k) { return state.cards[k].box >= 3; }).length;
    var weekAns = state.answers.filter(function (a) { return a.at.slice(0, 10) >= from; });
    var days = {}; Object.keys(state.done).forEach(function (k) { var d = iso(new Date(state.done[k])); if (d >= from) days[d] = 1; });
    weekAns.forEach(function (a) { days[iso(new Date(a.at))] = 1; });
    return { words: keys.length, known: known, due: dueCards(state, now).length, lessonsDone: Object.keys(state.done).length,
      weekLessons: Object.keys(state.done).filter(function (k) { return iso(new Date(state.done[k])) >= from; }).length,
      weekDays: Object.keys(days).length, weekAccuracy: weekAns.length ? weekAns.filter(function (a) { return a.ok; }).length / weekAns.length : null };
  }

  function weakWords(state, n) {
    return Object.keys(state.cards).filter(function (k) { return state.cards[k].wrong > 0; })
      .sort(function (a, b) { var A = state.cards[a], B = state.cards[b]; return (B.wrong / (B.seen || 1)) - (A.wrong / (A.seen || 1)) || B.wrong - A.wrong; })
      .slice(0, n || 10);
  }

  function advice(state, packs, now) {
    var st = stats(state, now), nx = nextLesson(state, packs);
    if (st.due >= 15) return st.due + ' words are waiting for review. Do those before a new lesson: reviewing is how they stick.';
    if (!st.lessonsDone) return 'Ten minutes a day is plenty. Start with lesson 1, and say every phrase out loud.';
    if (st.weekAccuracy != null && st.weekAccuracy < 0.6) return 'This week was hard (' + Math.round(st.weekAccuracy * 100) + '% right). Redo yesterday’s lesson before moving on.';
    if (!nx) return 'All lessons done. New ones arrive on Wednesday; until then, review and try a phrase on the family.';
    return st.known + ' words you know well, ' + st.words + ' met so far. Try one new phrase on the family this week.';
  }

  /* What the next Wednesday's run reads to tailor the next week (shared through the "Send my week" file). */
  function weeklySummary(state, packs, now) {
    var st = stats(state, now);
    var wrongPrompts = {};
    state.answers.slice(-300).forEach(function (a) { if (!a.ok) wrongPrompts[a.prompt] = (wrongPrompts[a.prompt] || 0) + 1; });
    return { app: 'wellness-tagalog-summary', made: (now || new Date()).toISOString(), stats: st,
      lessonsDone: Object.keys(state.done).sort(), weakWords: weakWords(state, 15).map(function (k) { var c = state.cards[k]; return { tl: k, en: c.en, right: c.right, wrong: c.wrong }; }),
      missed: Object.keys(wrongPrompts).sort(function (a, b) { return wrongPrompts[b] - wrongPrompts[a]; }).slice(0, 15),
      packs: packs.map(function (p) { return p.id; }) };
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || typeof s.cards !== 'object' || !s.cards) return null;
    var d = defaults();
    Object.keys(s.done || {}).forEach(function (k) { if (/^\d{4}-\d\d-\d\d\/\d+$/.test(k) && !isNaN(new Date(s.done[k]).getTime())) d.done[k] = new Date(s.done[k]).toISOString(); });
    Object.keys(s.cards).forEach(function (k) {
      var c = s.cards[k];
      if (c && typeof c.en === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.due) && k.length < 120)
        d.cards[k] = { en: c.en, box: Math.max(0, Math.min(INTERVALS.length - 1, +c.box || 1)), due: c.due, seen: +c.seen || 0, right: +c.right || 0, wrong: +c.wrong || 0, from: String(c.from || '') };
    });
    (Array.isArray(s.answers) ? s.answers : []).slice(-2000).forEach(function (a) {
      if (a && !isNaN(new Date(a.at).getTime())) d.answers.push({ at: new Date(a.at).toISOString(), pack: String(a.pack || ''), day: +a.day || 0, ok: !!a.ok, prompt: String(a.prompt || '').slice(0, 120), type: String(a.type || '') });
    });
    Object.keys(s.packs || {}).forEach(function (k) { if (!checkPack(s.packs[k]).length) d.packs[k] = s.packs[k]; });
    if (typeof s.source === 'string' && /^https:\/\/raw\.githubusercontent\.com\//.test(s.source)) d.source = s.source;
    return d;
  }

  var api = { INTERVALS: INTERVALS, defaults: defaults, checkPack: checkPack, norm: norm, check: check, allPacks: allPacks, nextLesson: nextLesson,
    finishLesson: finishLesson, recordAnswer: recordAnswer, dueCards: dueCards, review: review, stats: stats, weakWords: weakWords,
    advice: advice, weeklySummary: weeklySummary, validate: validate, iso: iso, addDays: addDays };
  root.TagalogCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
