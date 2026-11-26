/* Tagalog logic (no DOM): lesson packs (one week of 7 lessons, written each Wednesday by the scheduled Claude run),
   answer checking, spaced review of every word met (Leitner boxes), progress and the weekly summary that the next
   Wednesday's run uses to tailor the following week.
   Storage 'wl.tagalog.v1': { packs:{id: pack} (downloaded), done:{'packId/day': ISO}, cards:{tl:{en, box, due, seen, right, wrong}},
                              answers:[{at, pack, day, ok, prompt}], source, lastCheck } */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');
  var INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until the next review, by box
  // where new weeks come from (the PC pushes the wellness folder to this GitHub repo; changeable in the app)
  var DEFAULT_SOURCE = 'https://raw.githubusercontent.com/braedenruff2/wellness/main/modules/tagalog/packs/';
  function defaults() { return { packs: {}, done: {}, cards: {}, answers: [], reviews: [], source: DEFAULT_SOURCE, lastCheck: null, settings: { slow: true, walkDark: true } }; }
  var iso = WLD.iso;
  var addDays = WLD.addDays;

  /* Pack format check (used by the build tool, the tests, and before accepting a downloaded pack). */
  function checkPack(p) {
    var e = [];
    if (!p || typeof p !== 'object') return ['not an object'];
    if (!WLD.isDate(p.id || '')) e.push('id must be a YYYY-MM-DD date');
    if (!p.title) e.push('title missing');
    if (!Array.isArray(p.lessons) || !p.lessons.length) return e.concat('lessons missing');
    p.lessons.forEach(function (l, i) {
      var w = 'lesson ' + (i + 1) + ': ';
      if (l.day !== i + 1) e.push(w + 'day should be ' + (i + 1));
      ['title', 'intro'].forEach(function (k) { if (typeof l[k] !== 'string' || !l[k].trim()) e.push(w + k + ' missing'); });
      if (!Array.isArray(l.words) || l.words.length < 3) e.push(w + 'needs 3+ words');
      (l.words || []).forEach(function (x) { if (!x || !x.tl || !x.en) e.push(w + 'word without tl/en'); });
      var seen = (l.words || []).map(function (x) { return x && norm(x.tl); });
      if (seen.some(function (t, k) { return t && seen.indexOf(t) !== k; })) e.push(w + 'a word is listed twice');
      (l.dialogue || []).forEach(function (x) { if (!x || !x.tl || !x.en) e.push(w + 'dialogue line without tl/en'); });
      if (!Array.isArray(l.exercises) || l.exercises.length < 3) e.push(w + 'needs 3+ exercises');
      (l.exercises || []).forEach(function (x, j) {
        var v = w + 'exercise ' + (j + 1) + ': ';
        if (['mc', 'listen', 'build', 'type'].indexOf(x.type) < 0) { e.push(v + 'unknown type ' + x.type); return; }
        if (typeof x.answer !== 'string' || !x.answer) e.push(v + 'answer missing');
        if ((x.type === 'mc' || x.type === 'listen') && (!Array.isArray(x.options) || x.options.indexOf(x.answer) < 0)) e.push(v + 'options must include the answer');
        if (x.type === 'listen' && !x.say) e.push(v + 'listen needs say');
        if (Array.isArray(x.options)) { var on = x.options.map(norm); if (on.some(function (o, k) { return !o || on.indexOf(o) !== k; })) e.push(v + 'options must be different from each other'); }
        if (x.accept !== undefined && (!Array.isArray(x.accept) || x.accept.some(function (a) { return typeof a !== 'string' || !a.trim(); }))) e.push(v + 'accept must be a list of answers');
        if (x.type === 'build' && (!Array.isArray(x.words) || norm(x.words.slice().sort().join(' ')) !== norm(x.answer.split(/\s+/).sort().join(' ')))) e.push(v + 'build words must be exactly the answer’s words');
        if (x.type !== 'listen' && !x.prompt) e.push(v + 'prompt missing');
        if (x.poOptional !== undefined && (x.poOptional !== true || x.type !== 'type' || !/\b(po|ho)\b/.test(norm(x.answer)))) e.push(v + 'poOptional: only true, on a type exercise whose answer has po');
      });
    });
    return e;
  }

  /* Compare typed answers kindly: case, punctuation, extra spaces, accents a keyboard adds (é, ñ), a hyphen or a space
     ("araw-araw" / "araw araw") and the ho/po variant don't matter. */
  function norm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[’‘`´']/g, "'").replace(/[-‐‑–—_/]/g, ' ').replace(/[.,!?;:"“”…()¿¡]/g, '').replace(/\s+/g, ' ').trim();
  }
  function check(ex, given) {
    var g = norm(given);
    if (!g) return false;
    var ok = [ex.answer].concat(ex.accept || []).map(norm);
    if (ok.indexOf(g) >= 0 || ok.indexOf(g.replace(/\bho\b/g, 'po')) >= 0) return true;
    // a missing "po"/"ho" only where the lesson marks it optional (poOptional), never by default
    return !!ex.poOptional && ok.map(noPo).indexOf(noPo(g)) >= 0;
  }
  function noPo(s) { return s.replace(/\b(po|ho)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  /* Right, but in other words than the lesson's own answer (an accepted variant): the lesson's version, to see it too.
     '' when he typed the lesson's answer itself (or it only differs by po/ho, case, accents or punctuation). */
  function altOf(ex, given) {
    if (!ex || ex.type !== 'type' || !check(ex, given)) return '';
    var g = normHo(given), a = normHo(ex.answer);
    return g === a || noPo(g) === noPo(a) ? '' : ex.answer;
  }
  function normHo(s) { return norm(s).replace(/\bho\b/g, 'po'); }
  function sortedWords(s) { return s ? s.split(' ').sort().join(' ') : ''; }
  /* Right, but without the "po" the answer has: a gentle note (only on poOptional exercises). */
  function missedPo(ex, given) {
    var g = norm(given);
    return !!ex.poOptional && check(ex, given) && !/\b(po|ho)\b/.test(g);
  }
  /* The little words that follow a sentence's first word (pronouns and na, pa, ba, po...): the run of them at index 1+. */
  var PRON = ['ako', 'ka', 'siya', 'kami', 'tayo', 'sila', 'kayo', 'ko', 'mo', 'niya', 'namin', 'natin', 'nila', 'ninyo'];
  var ENC = PRON.concat(['na', 'pa', 'ba', 'po', 'din', 'rin', 'lang', 'daw', 'raw', 'naman', 'nga']);
  function cluster(words) { var out = []; for (var i = 1; i < words.length && ENC.indexOf(words[i]) >= 0; i++) out.push(words[i]); return out; }
  /* Same words as the answer (or an accepted answer) in a different order: a specific word-order hint instead of plain
     wrong, when a short pronoun is out of second place or on an ang/ng/si/ni sentence. */
  function orderHint(ex, given) {
    if (!ex || !ex.answer || ex.type === 'mc' || ex.type === 'listen') return '';
    if (check(ex, given)) return '';
    var g = normHo(given);
    if (!g) return '';
    var gw = g.split(' ');
    if (gw.length < 3) return '';
    var gKey = sortedWords(g), gNoPo = ex.poOptional ? sortedWords(noPo(g)) : '';
    var cands = [ex.answer].concat(ex.accept || []);
    for (var i = 0; i < cands.length; i++) {
      var c = normHo(cands[i]), cw = c.split(' ');
      // short words (siya, ako, kami, ko...) sit right after the first word: "Bakit siya umiiyak?", not "Bakit umiiyak siya?"
      if (cw.length === gw.length && sortedWords(c) === gKey) {
        var pron = cluster(cw).filter(function (w) { return PRON.indexOf(w) >= 0; }), gc = cluster(gw);
        var off = pron.filter(function (w) { return gc.indexOf(w) < 0; })[0];
        if (off) return 'Right words; short words like ' + off + ' go right after the first word: ' + (i === 0 ? ex.answer : cands[i]);
      }
      if (!/\b(ang|ng|si|ni)\b/.test(c)) continue;
      var match = (c.split(' ').length === gw.length && sortedWords(c) === gKey) ||
        (!!ex.poOptional && noPo(c).split(' ').length >= 3 && sortedWords(noPo(c)) === gNoPo);
      if (match) return 'Right words; in Tagalog the doer comes after the verb: ' + (i === 0 ? ex.answer : cands[i]);
    }
    return '';
  }

  /* Right except a missing linker: "gusto ko bumili" for "gusto kong bumili", "apat buwan" for "apat na buwan". */
  function linkerHint(ex, given) {
    if (!ex || !ex.answer || ex.type !== 'type' || check(ex, given)) return '';
    var gw = normHo(given).split(' ').filter(Boolean);
    if (gw.length < 2) return '';
    var cands = [ex.answer].concat(ex.accept || []);
    for (var i = 0; i < cands.length; i++) {
      var cw = normHo(cands[i]).split(' '), show = i === 0 ? ex.answer : cands[i];
      // -ng joined to the word: same number of words, one differs only by its -ng ending
      if (cw.length === gw.length) {
        var diff = [];
        for (var k = 0; k < cw.length; k++) if (cw[k] !== gw[k]) diff.push(k);
        if (diff.length === 1 && cw[diff[0]] === gw[diff[0]] + 'ng' && gw[diff[0]].length >= 2) return 'Almost: add the linker -ng (' + cw[diff[0]] + '): ' + show;
      }
      // na between two words
      if (cw.length === gw.length + 1) {
        for (var j = 1; j < cw.length - 1; j++) {
          if (cw[j] === 'na' && cw.slice(0, j).concat(cw.slice(j + 1)).join(' ') === gw.join(' ')) return 'Almost: add the linker na (' + cw[j - 1] + ' na ' + cw[j + 1] + '): ' + show;
        }
      }
    }
    return '';
  }

  /* A sentence from the lessons (dialogue line or grammar example) that uses this word, for a word he keeps missing:
     {tl, en} or null. Whole words only; never the word on its own. */
  function exampleFor(packs, tl) {
    var w = ' ' + norm(tl) + ' ';
    if (w.trim().length < 2) return null;
    for (var i = 0; i < (packs || []).length; i++) {
      var ls = (packs[i] && packs[i].lessons) || [];
      for (var j = 0; j < ls.length; j++) {
        var l = ls[j], lines = (l.dialogue || []).concat((l.grammar && l.grammar.examples) || []);
        for (var k = 0; k < lines.length; k++) {
          var x = lines[k]; if (!x || !x.tl || !x.en) continue;
          var t = ' ' + norm(x.tl) + ' ';
          if (t !== w && t.indexOf(w) >= 0) return { tl: x.tl, en: x.en };
        }
      }
    }
    return null;
  }

  /* Which specific hint a wrong answer got: 'pronoun' (short word out of second place), 'order' (ang/ng word order),
     'linker' (missing -ng / na), or ''. */
  function hintKind(ex, given) {
    var o = orderHint(ex, given);
    if (o) return /short words like/.test(o) ? 'pronoun' : 'order';
    return linkerHint(ex, given) ? 'linker' : '';
  }
  var HINT_KINDS = ['order', 'pronoun', 'linker'];

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

  /* given: what he typed or picked (kept short), so a wrong answer can be looked at later. */
  function recordAnswer(state, pack, lesson, ex, ok, now, given) {
    var a = { at: (now || new Date()).toISOString(), pack: pack.id, day: lesson.day, ok: !!ok, prompt: String(ex.prompt || ex.say || '').slice(0, 120), type: ex.type };
    if (given != null && String(given).trim()) a.given = String(given).slice(0, 200);
    var hk = ok ? '' : hintKind(ex, given);
    if (hk) a.hint = hk;
    state.answers.push(a);
    if (state.answers.length > 2000) state.answers.splice(0, state.answers.length - 2000);
  }

  function dueCards(state, now) {
    var t = iso(now || new Date());
    return Object.keys(state.cards).filter(function (k) { return state.cards[k].due <= t; })
      .sort(function (a, b) { return state.cards[a].box - state.cards[b].box || (state.cards[a].due < state.cards[b].due ? -1 : 1); });
  }

  /* Which way a review card is asked: a word recognised once (box 2+) is asked the other way round, English first,
     so he practises SAYING it (he understands more Tagalog than he speaks). A miss sends it back to box 1: meaning first. */
  function direction(card) { return card && card.box >= 2 ? 'say' : 'meaning'; }

  /* Review answer: right moves the card up a box (longer wait), wrong sends it back to box 1 (tomorrow). */
  function review(state, tl, right, now) {
    var c = state.cards[tl]; if (!c) return null;
    var t = iso(now || new Date()), dir = direction(c);
    c.seen++;
    if (right) { c.right++; c.box = Math.min(INTERVALS.length - 1, c.box + 1); }
    else { c.wrong++; c.box = 1; }
    c.due = addDays(t, INTERVALS[c.box]);
    c.last = t;
    if (!Array.isArray(state.reviews)) state.reviews = [];
    state.reviews.push({ at: (now || new Date()).toISOString(), tl: tl, right: !!right, dir: dir });
    if (state.reviews.length > 2000) state.reviews.splice(0, state.reviews.length - 2000);
    return c;
  }

  /* Mixed practice from finished lessons (any time, e.g. while waiting for Wednesday's new week): the exercises he
     got wrong most often first, then the ones he hasn't answered for longest. [{pack, lesson, ex}], at most n. */
  function practiceSet(state, packs, n) {
    var last = {}, wrong = {};
    state.answers.forEach(function (a) {
      var k = a.pack + '/' + a.day + '/' + a.prompt;
      var ms = Date.parse(a.at);
      if (!isNaN(ms) && (last[k] == null || ms > last[k])) last[k] = ms;
      if (!a.ok) wrong[k] = (wrong[k] || 0) + 1;
    });
    var pool = [];
    (packs || []).forEach(function (p) {
      ((p && p.lessons) || []).forEach(function (l) {
        if (!state.done[p.id + '/' + l.day]) return;
        (l.exercises || []).forEach(function (ex) {
          var k = p.id + '/' + l.day + '/' + String(ex.prompt || ex.say || '').slice(0, 120);
          pool.push({ pack: p, lesson: l, ex: ex, wrong: wrong[k] || 0, last: last[k] == null ? -Infinity : last[k], order: pool.length });
        });
      });
    });
    pool.sort(function (a, b) { return b.wrong - a.wrong || (a.last < b.last ? -1 : a.last > b.last ? 1 : a.order - b.order); });
    return pool.slice(0, n || 8).map(function (x) { return { pack: x.pack, lesson: x.lesson, ex: x.ex }; });
  }

  function stats(state, now) {
    now = now || new Date();
    var today = iso(now);
    var from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    var keys = Object.keys(state.cards);
    var known = keys.filter(function (k) { return state.cards[k].box >= 3; }).length;
    var weekAns = state.answers.filter(function (a) { var d = iso(new Date(a.at)); return d >= from && d <= today; }); // local days, like the rest
    var days = {}; Object.keys(state.done).forEach(function (k) { var d = iso(new Date(state.done[k])); if (d >= from && d <= today) days[d] = 1; });
    weekAns.forEach(function (a) { days[iso(new Date(a.at))] = 1; });
    return { words: keys.length, known: known, due: dueCards(state, now).length, lessonsDone: Object.keys(state.done).length,
      weekLessons: Object.keys(state.done).filter(function (k) { var d = iso(new Date(state.done[k])); return d >= from && d <= today; }).length,
      weekDays: Object.keys(days).length, weekAccuracy: weekAns.length ? weekAns.filter(function (a) { return a.ok; }).length / weekAns.length : null };
  }

  /* Hard words: missed most often (a word still missed when he went through the misses again, card.againMiss,
     counts too; that extra practice never changes its box or due date). */
  function missCount(c) { return (c.wrong || 0) + (c.againMiss || 0); }
  function againMiss(state, k) { var c = state.cards[k]; if (c) c.againMiss = Math.min(999, (c.againMiss || 0) + 1); return c; }
  function weakWords(state, n) {
    return Object.keys(state.cards).filter(function (k) { return missCount(state.cards[k]) > 0; })
      .sort(function (a, b) { var A = state.cards[a], B = state.cards[b]; return (missCount(B) / ((B.seen || 0) + (B.againMiss || 0) || 1)) - (missCount(A) / ((A.seen || 0) + (A.againMiss || 0) || 1)) || missCount(B) - missCount(A); })
      .slice(0, n || 10);
  }

  function advice(state, packs, now) {
    var st = stats(state, now), nx = nextLesson(state, packs);
    if (st.due >= 15) return st.due + ' words are waiting for review. Do those before a new lesson: reviewing is how they stick.';
    if (!st.lessonsDone) return 'Ten minutes a day is plenty. Start with lesson 1, and say every phrase out loud.';
    if (st.weekAccuracy != null && st.weekAccuracy < 0.6) return 'This week was hard (' + Math.round(st.weekAccuracy * 100) + '% right). Redo yesterday’s lesson before moving on.';
    if (!nx) return 'All lessons done. New ones arrive on Wednesday; until then, mixed practice, review, and try a phrase on the family.';
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
      // the specific slips the app recognised (word order, a short word out of second place, a missing linker), newest last
      hints: state.answers.slice(-300).filter(function (a) { return a.hint; }).slice(-20).map(function (a) { return { kind: a.hint, prompt: a.prompt, given: a.given || '' }; }),
      packs: packs.map(function (p) { return p.id; }) };
  }

  /* Claude's check of a typed answer, kept to the fields the app shows (text only, cut to size). */
  function cleanCheck(a) {
    a = a && typeof a === 'object' ? a : {};
    var t = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }, o = { ok: a.ok === true };
    [['corrected', 300], ['meaning', 300], ['explain', 800], ['tip', 300], ['text', 800]].forEach(function (f) { var v = t(a[f[0]], f[1]); if (v) o[f[0]] = v; });
    return o;
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || typeof s.cards !== 'object' || !s.cards) return null;
    var d = defaults();
    Object.keys(s.done || {}).forEach(function (k) { if (/^\d{4}-\d\d-\d\d\/\d+$/.test(k) && WLD.isDate(k.slice(0, 10)) && !isNaN(new Date(s.done[k]).getTime())) d.done[k] = new Date(s.done[k]).toISOString(); });
    Object.keys(s.cards).forEach(function (k) {
      var c = s.cards[k];
      if (c && typeof c.en === 'string' && WLD.isDate(c.due) && k.length < 120) {
        d.cards[k] = { en: c.en, box: Math.max(0, Math.min(INTERVALS.length - 1, +c.box || 1)), due: c.due, seen: +c.seen || 0, right: +c.right || 0, wrong: +c.wrong || 0, from: String(c.from || '') };
        if (isFinite(+c.againMiss) && +c.againMiss > 0) d.cards[k].againMiss = Math.min(999, Math.floor(+c.againMiss));
      }
    });
    (Array.isArray(s.answers) ? s.answers : []).slice(-2000).forEach(function (a) {
      if (!a || isNaN(new Date(a.at).getTime())) return; // a damaged entry is dropped, not the whole Tagalog backup
      var x = { at: new Date(a.at).toISOString(), pack: String(a.pack || ''), day: +a.day || 0, ok: !!a.ok, prompt: String(a.prompt || '').slice(0, 120), type: String(a.type || '') };
      if (typeof a.given === 'string') x.given = a.given.slice(0, 200);
      if (HINT_KINDS.indexOf(a.hint) >= 0) x.hint = a.hint;
      d.answers.push(x);
    });
    (Array.isArray(s.reviews) ? s.reviews : []).slice(-2000).forEach(function (r) {
      if (r && typeof r.tl === 'string' && r.tl.length < 120 && !isNaN(new Date(r.at).getTime())) d.reviews.push({ at: new Date(r.at).toISOString(), tl: r.tl, right: !!r.right, dir: r.dir === 'say' ? 'say' : 'meaning' });
    });
    Object.keys(s.packs || {}).forEach(function (k) { if (!checkPack(s.packs[k]).length) d.packs[k] = s.packs[k]; });
    if (s.settings && typeof s.settings.slow === 'boolean') d.settings.slow = s.settings.slow;
    if (s.settings && typeof s.settings.walkDark === 'boolean') d.settings.walkDark = s.settings.walkDark;
    if (s.packHash && typeof s.packHash === 'object') Object.keys(s.packHash).forEach(function (k) { if (d.packs[k] && /^[0-9a-f]{12}$/.test(s.packHash[k])) (d.packHash = d.packHash || {})[k] = s.packHash[k]; });
    (Array.isArray(s.checks) ? s.checks : []).slice(-20).forEach(function (c) {
      if (c && !isNaN(new Date(c.at).getTime())) (d.checks = d.checks || []).push({ at: new Date(c.at).toISOString(), prompt: String(c.prompt || '').slice(0, 300), given: String(c.given || '').slice(0, 300), a: cleanCheck(c.a) });
    });
    if (typeof s.source === 'string' && /^https:\/\/raw\.githubusercontent\.com\//.test(s.source)) d.source = s.source;
    return d;
  }

  var api = { INTERVALS: INTERVALS, defaults: defaults, cleanCheck: cleanCheck, checkPack: checkPack, norm: norm, check: check, missedPo: missedPo, altOf: altOf, orderHint: orderHint, linkerHint: linkerHint, hintKind: hintKind, exampleFor: exampleFor, allPacks: allPacks, nextLesson: nextLesson,
    finishLesson: finishLesson, recordAnswer: recordAnswer, dueCards: dueCards, direction: direction, practiceSet: practiceSet, review: review, stats: stats, weakWords: weakWords,
    advice: advice, againMiss: againMiss, weeklySummary: weeklySummary, validate: validate, iso: iso, addDays: addDays };
  root.TagalogCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
