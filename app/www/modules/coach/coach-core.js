/* Parenting coach, the pure part: the child's age in words, scores per skill, which skill to practise next,
   checking saved data. Scenarios and grading come from Claude on his PC (pc/wellness_pc.py, tasks coach-scenario
   and coach-grade). His child's name and birthday stay on the phone (never in the app's code or repo). */
(function (root) {
  'use strict';
  var SKILLS = ['Connection', 'Calm under stress', 'Sleep', 'Feeding', 'Play and learning', 'Safety', 'Routines',
    'Crying and comfort', 'Looking after yourself', 'Family and partner'];

  function defaults() { return { child: { name: '', birth: '' }, history: [], current: null, pending: null }; }

  /* What she can do now (his own picks, saved on the phone): sent with every Claude request so scenarios and advice
     fit her, not a typical child of her age. */
  var CAN = ['Walks', 'Gets down by herself', 'Climbs', 'Waves or does “bless”', 'First words', 'Points', 'Feeds herself finger food', 'Drinks from a cup'];
  function toggleCan(state, v) {
    if (CAN.indexOf(v) < 0) return null;
    var c = state.child.can = Array.isArray(state.child.can) ? state.child.can : [], i = c.indexOf(v);
    if (i >= 0) c.splice(i, 1); else c.push(v);
    c.sort(function (a, b) { return CAN.indexOf(a) - CAN.indexOf(b); });
    return c;
  }
  function setCanNote(state, text) { var t = String(text || '').trim().slice(0, 300); if (t) state.child.canNote = t; else delete state.child.canNote; }
  /* In words for the prompt ('' when he hasn't said): "walks; climbs; first words. Also: says mama". */
  function canText(state) {
    var c = (Array.isArray(state.child.can) ? state.child.can : []).map(function (x) { return x.charAt(0).toLowerCase() + x.slice(1); });
    var t = c.join('; ');
    if (state.child.canNote) t += (t ? '. Also: ' : '') + state.child.canNote;
    return t;
  }
  function parse(d) { var p = String(d || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }

  /* Whole months between birth and now (a month counts once its day of the month comes round). */
  function ageMonths(birth, now) {
    var b = parse(birth); if (!b || isNaN(b)) return null;
    now = now || new Date();
    var m = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
    // born on the 31st (or 29 Feb): the month counts on the last day of a shorter month
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() < b.getDate() && now.getDate() !== lastDay) m--;
    return m;
  }
  function ageText(birth, now) {
    var m = ageMonths(birth, now); if (m == null || m < 0) return '';
    if (m < 1) {
      var n = now || new Date(), b = parse(birth);
      var d = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);
      return d < 14 ? d + ' day' + (d === 1 ? '' : 's') + ' old' : Math.floor(d / 7) + ' weeks old';
    }
    if (m < 24) return m + ' month' + (m === 1 ? '' : 's') + ' old';
    var y = Math.floor(m / 12), r = m % 12;
    return y + ' years' + (r ? ' and ' + r + ' month' + (r === 1 ? '' : 's') : '') + ' old';
  }

  function scored(state) { return state.history.filter(function (h) { return h.result && typeof h.result.score === 'number'; }); }

  /* Per skill: {skill, n, avg (last 5), last, scores (last 10, oldest first)}. */
  function skillStats(state) {
    var by = {};
    scored(state).forEach(function (h) { (by[h.skill] = by[h.skill] || []).push(h.result.score); });
    return SKILLS.map(function (s) {
      var v = by[s] || [], l5 = v.slice(-5);
      return { skill: s, n: v.length, avg: l5.length ? Math.round(10 * l5.reduce(function (a, b) { return a + b; }, 0) / l5.length) / 10 : null, last: v.length ? v[v.length - 1] : null, scores: v.slice(-10) };
    });
  }

  /* What to practise: a skill never tried yet first (in list order), else the lowest recent average. */
  function suggestSkill(state) {
    var st = skillStats(state), untried = st.filter(function (s) { return !s.n; });
    if (untried.length) return untried[0].skill;
    return st.slice().sort(function (a, b) { return a.avg - b.avg || a.n - b.n; })[0].skill;
  }

  /* What the PC is sent with a scenario request. */
  function scenarioInput(state, skill, now) {
    return { child: state.child.name || 'your daughter', age: ageText(state.child.birth, now) || 'about one year old',
      skill: skill || suggestSkill(state), can: canText(state),
      recent: scored(state).slice(-10).map(function (h) { return { skill: h.skill, score: h.result.score }; }),
      avoid: state.history.slice(-15).map(function (h) { return h.title; }) };
  }

  function newId(now) { return (now || new Date()).getTime().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* Claude's scenario becomes the current one (checked: only strings, sensible lengths). */
  function setScenario(state, a, now) {
    if (!a || typeof a.scenario !== 'string' || !a.scenario.trim()) throw new Error('Claude didn’t send a scenario. Try again.');
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    state.current = { id: newId(now), at: (now || new Date()).toISOString(), title: s(a.title, 120) || 'A moment with ' + (state.child.name || 'her'),
      skill: SKILLS.indexOf(a.skill) >= 0 ? a.skill : 'Connection', scenario: s(a.scenario, 3000), question: s(a.question, 400) || 'What do you do and say?',
      age: ageText(state.child.birth, now), answer: '' };
    return state.current;
  }

  function cleanResult(a) {
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var list = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, 5).map(function (x) { return x.slice(0, 600); }) : []; };
    var sc = Math.round(+a.score);
    return { score: sc >= 1 && sc <= 10 ? sc : null, verdict: s(a.verdict, 400), good: list(a.good), improve: list(a.improve), better: s(a.better, 3000),
      why: s(a.why, 1500), practice: s(a.practice, 600), text: s(a.text, 3000),
      sources: Array.isArray(a.sources) ? a.sources.filter(function (x) { return x && typeof x.url === 'string' && /^https:\/\//.test(x.url); }).slice(0, 6)
        .map(function (x) { return { title: s(x.title, 200) || x.url, url: x.url.slice(0, 500) }; }) : [] };
  }

  /* His own real situation and Claude's advice (no score): kept in the history as kind "real". */
  function cleanAdvice(a) {
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var list = function (v, k) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, k || 6).map(function (x) { return x.slice(0, 600); }) : []; };
    return { summary: s(a.summary, 1500), steps: list(a.steps), say: list(a.say, 3), avoid: list(a.avoid, 3), why: s(a.why, 1500), watch: s(a.watch, 1000),
      text: s(a.text, 3000), sources: cleanResult(a).sources };
  }
  function addReal(state, situation, a, now) {
    a = a || {};
    if (!a.steps && !a.summary && !a.text) throw new Error('Claude didn’t send advice. Try again.');
    var h = { id: newId(now), at: (now || new Date()).toISOString(), kind: 'real', title: (typeof a.title === 'string' && a.title.slice(0, 120)) || 'Your situation',
      skill: SKILLS.indexOf(a.skill) >= 0 ? a.skill : 'Connection', scenario: String(situation).slice(0, 3000), question: '', age: ageText(state.child.birth, now),
      answer: '', result: null, advice: cleanAdvice(a) };
    state.history.push(h);
    if (state.history.length > 300) state.history.splice(0, state.history.length - 300);
    state.pending = null;
    return h;
  }
  /* "Practise this": his real situation becomes the scenario to answer and get graded on. */
  function practiseReal(state, id, now) {
    var h = state.history.filter(function (x) { return x.id === id && x.kind === 'real'; })[0]; if (!h) return null;
    state.current = { id: newId(now), at: (now || new Date()).toISOString(), title: h.title, skill: h.skill, scenario: h.scenario,
      question: 'Next time this happens, what do you do and say, step by step?', age: ageText(state.child.birth, now), answer: '', from: h.id };
    return state.current;
  }

  /* What to try this week: the "Try this week" lines from graded practice in the last 7 days (newest first, no
     repeats, up to 3), so a tip from a scenario isn't forgotten once the next one comes. */
  function tips(state, now, max) {
    var t = (now || new Date()).getTime(), seen = {}, out = [];
    for (var i = state.history.length - 1; i >= 0 && out.length < (max || 3); i--) {
      var h = state.history[i], p = h.result && h.result.practice, at = new Date(h.at).getTime();
      if (!p || !(t - at < 7 * 864e5) || at > t + 6e4) continue;
      var key = p.trim().toLowerCase(); if (!key || seen[key]) continue;
      seen[key] = 1; out.push({ text: p.trim(), skill: h.skill, id: h.id, at: h.at });
    }
    return out;
  }

  /* The graded current scenario goes into the history. */
  /* scn: the scenario that was answered (the request may come back after he moved on to another one). */
  function grade(state, answer, a, now, scn) {
    var c = scn || state.current; if (!c) return null;
    var h = { id: c.id, at: (now || new Date()).toISOString(), title: c.title, skill: c.skill, scenario: c.scenario, question: c.question, age: c.age,
      answer: String(answer).slice(0, 4000), result: cleanResult(a || {}) };
    state.history.push(h);
    if (state.history.length > 300) state.history.splice(0, state.history.length - 300);
    if (state.current && state.current.id === c.id) state.current = null;
    state.pending = null;
    return h;
  }

  function validate(s) {
    if (!s || typeof s !== 'object') return null;
    var d = defaults();
    if (s.child && typeof s.child.name === 'string') d.child.name = s.child.name.slice(0, 40);
    if (s.child && /^\d{4}-\d\d-\d\d$/.test(s.child.birth)) d.child.birth = s.child.birth;
    if (s.child && Array.isArray(s.child.can)) s.child.can.forEach(function (v) { if (CAN.indexOf(v) >= 0 && (d.child.can || []).indexOf(v) < 0) toggleCan(d, v); });
    if (s.child && typeof s.child.canNote === 'string') setCanNote(d, s.child.canNote);
    (Array.isArray(s.history) ? s.history : []).slice(-300).forEach(function (h) {
      if (!h || typeof h.scenario !== 'string' || isNaN(new Date(h.at).getTime())) return;
      d.history.push({ id: String(h.id || newId()).slice(0, 40), at: new Date(h.at).toISOString(), title: String(h.title || '').slice(0, 120),
        skill: SKILLS.indexOf(h.skill) >= 0 ? h.skill : 'Connection', scenario: h.scenario.slice(0, 3000), question: String(h.question || '').slice(0, 400),
        age: String(h.age || '').slice(0, 60), answer: String(h.answer || '').slice(0, 4000), result: h.result ? cleanResult(h.result) : null });
      if (h.kind === 'real' && h.advice) { var x = d.history[d.history.length - 1]; x.kind = 'real'; x.advice = cleanAdvice(h.advice); }
    });
    // the scenario he was answering (and his half-written answers) survive a restore too
    var c = s.current;
    if (c && typeof c.scenario === 'string' && c.scenario.trim()) {
      d.current = { id: String(c.id || newId()).slice(0, 40), at: isNaN(new Date(c.at).getTime()) ? new Date().toISOString() : new Date(c.at).toISOString(),
        title: String(c.title || '').slice(0, 120), skill: SKILLS.indexOf(c.skill) >= 0 ? c.skill : 'Connection', scenario: c.scenario.slice(0, 3000),
        question: String(c.question || 'What do you do and say?').slice(0, 400), age: String(c.age || '').slice(0, 60), answer: String(c.answer || '').slice(0, 4000) };
      if (typeof c.from === 'string') d.current.from = c.from.slice(0, 40);
    }
    if (typeof s.realDraft === 'string') d.realDraft = s.realDraft.slice(0, 3000);
    return d;
  }

  var api = { SKILLS: SKILLS, CAN: CAN, toggleCan: toggleCan, setCanNote: setCanNote, canText: canText, defaults: defaults, ageMonths: ageMonths, ageText: ageText, skillStats: skillStats, suggestSkill: suggestSkill,
    scenarioInput: scenarioInput, setScenario: setScenario, grade: grade, addReal: addReal, practiseReal: practiseReal, tips: tips, cleanResult: cleanResult, validate: validate };
  root.CoachCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
