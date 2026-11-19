/* Parenting coach (#coach): practise real moments with your daughter at her age. Claude on your PC writes a scenario,
   you answer in your own words, Claude checks current guidance and grades it (what went well, what to change, what an
   expert would do, why), and your scores per skill show progress. Needs the PC link. */
(function () {
  'use strict';
  var K = window.CoachCore, esc = WL.esc, $ = WL.$, $$ = WL.$$, pc = WL.pc;
  var store = WL.store('wl.coach.v1', K.defaults);
  var S = store.load(), view = null, waiting = null, err = null, pickSkill = '';
  function save() { store.save(S); }
  function here() { return view && location.hash.indexOf('#coach') === 0; }

  function setupHtml() {
    return '<div class="card ui"><h3>About your little one</h3><p class="meta">So every scenario fits her exact age. This stays on your phone and goes only to your own PC when you ask for a scenario.</p>' +
      '<label for="co-name">Her name</label><input type="text" id="co-name" value="' + esc(S.child.name) + '" autocomplete="off">' +
      '<label for="co-birth">Her birthday</label><input type="date" id="co-birth" value="' + esc(S.child.birth) + '">' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="co-save">Save</button>' + (S.child.birth ? '<a class="btn" href="#coach">Cancel</a>' : '') + '</div></div>';
  }

  function resultHtml(h) {
    var r = h.result || {};
    return '<div class="card"><div class="meta ui">' + esc(h.skill) + (h.age ? ' · ' + esc(h.age) : '') + '</div><h2>' + esc(h.title) + '</h2><p>' + esc(h.scenario) + '</p>' +
      '<p class="meta ui">Your answer</p><blockquote>' + esc(h.answer) + '</blockquote>' +
      (r.score != null ? '<p class="score ui"><b>' + r.score + '/10</b> ' + esc(r.verdict) + '</p>' : '') +
      (r.good.length ? '<h3>What you did well</h3><ul>' + r.good.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (r.improve.length ? '<h3>What to change</h3><ul>' + r.improve.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (r.better ? '<h3>What an expert would do</h3><p>' + esc(r.better) + '</p>' : '') + (r.why ? '<h3>Why</h3><p>' + esc(r.why) + '</p>' : '') +
      (r.practice ? '<h3>Try this week</h3><p>' + esc(r.practice) + '</p>' : '') + (r.text ? '<p>' + esc(r.text) + '</p>' : '') +
      (r.sources.length ? '<p class="meta ui">Sources: ' + r.sources.map(function (x) { return '<a href="' + esc(x.url) + '">' + esc(x.title) + '</a>'; }).join(' · ') + '</p>' : '') +
      '<p class="meta ui">General guidance, not medical advice. For health worries, call your doctor or 811.</p></div>';
  }

  function progressHtml() {
    var st = K.skillStats(S).filter(function (s) { return s.n; });
    if (!st.length) return '';
    return '<div class="card ui"><h3>Your progress</h3><ul class="list">' + st.map(function (s) {
      return '<li><span class="grow">' + esc(s.skill) + '</span><span class="meta">' + s.n + ' practised · recent ' + s.avg + '/10</span></li>';
    }).join('') + '</ul></div>';
  }

  function mainHtml() {
    var h = '<h1>Parenting practice</h1><p class="ui meta">' + esc(S.child.name || 'Your daughter') + ' is ' + esc(K.ageText(S.child.birth)) + '. <a href="#coach/setup">Change</a></p>';
    if (!pc.ready()) h += '<div class="card ui"><p>Scenarios and feedback come from Claude on your PC. <a href="#link">Pair the PC link</a> first (home Wi-Fi).</p></div>';
    if (err) h += '<p class="no ui">' + esc(err) + '</p>';
    if (waiting) h += '<div class="card ui"><p>' + (waiting.kind === 'grade' ? 'Claude is checking current guidance and grading your answer…' : 'Claude is writing a scenario for her age…') +
      ' <span id="co-secs">' + (waiting.secs || 0) + ' s</span></p><p class="meta">This can take a minute or two. You can leave this screen; it carries on.</p></div>';
    var c = S.current;
    if (c && !waiting) {
      h += '<div class="card"><div class="meta ui">' + esc(c.skill) + (c.age ? ' · ' + esc(c.age) : '') + '</div><h2>' + esc(c.title) + '</h2><p>' + esc(c.scenario) + '</p>' +
        '<p><b>' + esc(c.question) + '</b></p><label class="sr" for="co-answer">Your answer</label><textarea id="co-answer" rows="6" placeholder="In your own words: what you would do and say, step by step.">' + esc(c.answer || '') + '</textarea>' +
        '<div class="row ui" style="margin-top:8px"><button class="primary" id="co-grade">Get feedback</button><button class="link" id="co-skip">Different scenario</button></div></div>';
    } else if (!waiting) {
      var sug = K.suggestSkill(S);
      h += '<div class="card ui"><h3>Practise a moment</h3><p class="meta">Pick a skill, or let it choose (suggested: ' + esc(sug) + ').</p><div class="chips">' +
        [''].concat(K.SKILLS).map(function (s) { return '<button class="chip" data-skill="' + esc(s) + '" aria-pressed="' + (pickSkill === s) + '">' + esc(s || 'Suggested') + '</button>'; }).join('') +
        '</div><div class="row" style="margin-top:10px"><button class="primary" id="co-new"' + (pc.ready() ? '' : ' disabled') + '>New scenario</button></div></div>';
    }
    var last = S.history.slice().reverse();
    if (last.length) {
      h += '<div class="card ui"><h3>Past practice</h3><ul class="list">' + last.slice(0, 20).map(function (x) {
        return '<li><a class="grow" href="#coach/h/' + esc(x.id) + '">' + esc(x.title) + '</a><span class="meta">' + (x.result && x.result.score != null ? x.result.score + '/10' : '') + '</span></li>';
      }).join('') + '</ul></div>';
    }
    return h + progressHtml();
  }

  function render(parts) {
    parts = parts || [];
    if (!S.child.birth || parts[0] === 'setup') { view.innerHTML = '<h1>Parenting practice</h1>' + setupHtml(); wireSetup(); return; }
    if (parts[0] === 'h') {
      var h = S.history.filter(function (x) { return x.id === parts[1]; })[0];
      view.innerHTML = h ? resultHtml(h) + '<p class="ui"><a href="#coach">Back</a></p>' : '<p>Not found. <a href="#coach">Back</a></p>';
      return;
    }
    view.innerHTML = mainHtml();
    wire();
  }

  function wireSetup() {
    $('#co-save').onclick = function () {
      var b = $('#co-birth').value;
      if (!/^\d{4}-\d\d-\d\d$/.test(b) || K.ageMonths(b) == null || K.ageMonths(b) < 0) { WL.toast('Pick her birthday'); return; }
      S.child.name = $('#co-name').value.trim().slice(0, 40); S.child.birth = b; save();
      location.hash = '#coach'; render([]);
    };
  }

  function wire() {
    $$('[data-skill]').forEach(function (b) { b.onclick = function () { pickSkill = b.dataset.skill; render([]); }; });
    var n = $('#co-new'); if (n) n.onclick = newScenario;
    var g = $('#co-grade'); if (g) g.onclick = function () { gradeIt($('#co-answer').value); };
    var a = $('#co-answer'); if (a) a.oninput = function () { S.current.answer = a.value.slice(0, 4000); save(); };
    var sk = $('#co-skip'); if (sk) sk.onclick = function () { S.current = null; save(); newScenario(); };
  }

  function tick(secs) { if (waiting) waiting.secs = secs; var e = $('#co-secs'); if (e) e.textContent = secs + ' s'; }
  function finish() { waiting = null; if (here()) render([]); else { var c = document.querySelector('.home-card[data-module="coach"]'); if (c) c.innerHTML = card(); } }

  function newScenario() {
    err = null; waiting = { kind: 'scenario', secs: 0 }; render([]);
    var input = K.scenarioInput(S, pickSkill || null);
    start('coach-scenario', input, function (a) { K.setScenario(S, a); save(); });
  }
  function gradeIt(answer) {
    answer = String(answer || '').trim();
    if (answer.length < 15) { WL.toast('Write a little more: what would you do and say?'); return; }
    var c = S.current; c.answer = answer; save();
    err = null; waiting = { kind: 'grade', secs: 0 }; render([]);
    start('coach-grade', { child: S.child.name, age: c.age, scenario: c.scenario, question: c.question, answer: answer }, function (a) {
      var h = K.grade(S, answer, a); save();
      if (here()) location.hash = '#coach/h/' + h.id;
      pc.sync().catch(function () {});
    });
  }
  /* Starts a Claude request; its job id is saved so leaving the app and coming back carries on waiting for it. */
  function start(task, input, onAnswer) {
    pc.post('/v1/ask', { task: task, input: input }).then(function (r) {
      S.pending = { job: r.job, task: task, at: Date.now(), answer: input.answer || '' }; save();
      return pc.poll(r.job, Date.now(), tick);
    }).then(function (a) { S.pending = null; onAnswer(a); save(); finish(); },
      function (e) { S.pending = null; save(); err = e.message || String(e); finish(); });
  }
  function resume() {
    var p = S.pending;
    if (!p || waiting || !pc.ready()) return;
    if (Date.now() - p.at > 15 * 60000) { S.pending = null; save(); return; }
    waiting = { kind: p.task === 'coach-grade' ? 'grade' : 'scenario', secs: Math.round((Date.now() - p.at) / 1000) };
    pc.poll(p.job, p.at, tick).then(function (a) {
      S.pending = null;
      if (p.task === 'coach-grade') { var h = K.grade(S, p.answer, a); save(); if (here()) location.hash = '#coach/h/' + h.id; }
      else { K.setScenario(S, a); save(); }
      finish();
    }, function (e) { S.pending = null; save(); err = e.message; finish(); });
  }

  function card() {
    if (!S.child.birth && !pc.ready()) return '';
    var st = K.skillStats(S).filter(function (s) { return s.n; }), last = S.history[S.history.length - 1];
    return '<div class="meta ui">Parenting practice</div><h3>' + (S.current ? esc(S.current.title) : waiting ? 'Claude is on it…' : 'Practise a moment with ' + esc(S.child.name || 'her')) + '</h3>' +
      (last && last.result && last.result.score != null ? '<p class="meta ui">Last: ' + last.result.score + '/10 in ' + esc(last.skill) + ' · ' + st.length + ' skill' + (st.length === 1 ? '' : 's') + ' practised</p>' : '') +
      '<div class="row ui"><a class="btn primary" href="#coach">' + (S.current ? 'Answer it' : 'Open') + '</a></div>';
  }

  WL.register({
    id: 'coach', title: 'Parenting', short: 'Parent', icon: '🧸', nav: true, storageKeys: [store.key], settingsLink: '#coach/setup',
    route: function (parts, v) { view = v; resume(); render(parts); },
    card: card,
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
  setTimeout(resume, 1500);
})();
