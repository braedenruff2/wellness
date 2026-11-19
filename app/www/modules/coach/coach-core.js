/* Parenting coach, the pure part: the child's age in words, scores per skill, which skill to practise next,
   checking saved data. Scenarios and grading come from Claude on his PC (pc/wellness_pc.py, tasks coach-scenario
   and coach-grade). His child's name and birthday stay on the phone (never in the app's code or repo). */
(function (root) {
  'use strict';
  var SKILLS = ['Connection', 'Calm under stress', 'Sleep', 'Feeding', 'Play and learning', 'Safety', 'Routines',
    'Crying and comfort', 'Looking after yourself', 'Family and partner'];

  function defaults() { return { child: { name: '', birth: '' }, history: [], current: null, pending: null }; }
  function parse(d) { var p = String(d || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }

  /* Whole months between birth and now (a month counts once its day of the month comes round). */
  function ageMonths(birth, now) {
    var b = parse(birth); if (!b || isNaN(b)) return null;
    now = now || new Date();
    var m = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
    if (now.getDate() < b.getDate()) m--;
    return m;
  }
  function ageText(birth, now) {
    var m = ageMonths(birth, now); if (m == null || m < 0) return '';
    if (m < 1) {
      var d = Math.floor(((now || new Date()) - parse(birth)) / 864e5);
      return d < 14 ? d + ' day' + (d === 1 ? '' : 's') + ' old' : Math.floor(d / 7) + ' weeks old';
    }
    if (m < 24) return m + ' month' + (m === 1 ? '' : 's') + ' old';
    var y = Math.floor(m / 12), r = m % 12;
    return y + ' years' + (r ? ' and ' + r + ' month' + (r === 1 ? '' : 's') : '') + ' old';
  }

  function scored(state) { return state.history.filter(function (h) { return h.result && typeof h.result.score === 'number'; }); }

  /* Per skill: {skill, n, avg (last 5), last}. */
  function skillStats(state) {
    var by = {};
    scored(state).forEach(function (h) { (by[h.skill] = by[h.skill] || []).push(h.result.score); });
    return SKILLS.map(function (s) {
      var v = by[s] || [], l5 = v.slice(-5);
      return { skill: s, n: v.length, avg: l5.length ? Math.round(10 * l5.reduce(function (a, b) { return a + b; }, 0) / l5.length) / 10 : null, last: v.length ? v[v.length - 1] : null };
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
      skill: skill || suggestSkill(state),
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

  /* The graded current scenario goes into the history. */
  function grade(state, answer, a, now) {
    var c = state.current; if (!c) return null;
    var h = { id: c.id, at: (now || new Date()).toISOString(), title: c.title, skill: c.skill, scenario: c.scenario, question: c.question, age: c.age,
      answer: String(answer).slice(0, 4000), result: cleanResult(a || {}) };
    state.history.push(h);
    if (state.history.length > 300) state.history.splice(0, state.history.length - 300);
    state.current = null; state.pending = null;
    return h;
  }

  function validate(s) {
    if (!s || typeof s !== 'object') return null;
    var d = defaults();
    if (s.child && typeof s.child.name === 'string') d.child.name = s.child.name.slice(0, 40);
    if (s.child && /^\d{4}-\d\d-\d\d$/.test(s.child.birth)) d.child.birth = s.child.birth;
    (Array.isArray(s.history) ? s.history : []).slice(-300).forEach(function (h) {
      if (!h || typeof h.scenario !== 'string' || isNaN(new Date(h.at).getTime())) return;
      d.history.push({ id: String(h.id || newId()).slice(0, 40), at: new Date(h.at).toISOString(), title: String(h.title || '').slice(0, 120),
        skill: SKILLS.indexOf(h.skill) >= 0 ? h.skill : 'Connection', scenario: h.scenario.slice(0, 3000), question: String(h.question || '').slice(0, 400),
        age: String(h.age || '').slice(0, 60), answer: String(h.answer || '').slice(0, 4000), result: h.result ? cleanResult(h.result) : null });
    });
    return d;
  }

  var api = { SKILLS: SKILLS, defaults: defaults, ageMonths: ageMonths, ageText: ageText, skillStats: skillStats, suggestSkill: suggestSkill,
    scenarioInput: scenarioInput, setScenario: setScenario, grade: grade, cleanResult: cleanResult, validate: validate };
  root.CoachCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
