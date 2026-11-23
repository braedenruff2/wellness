/* Calm module: #calm (list + progress), #calm/s/ID (a session: breathing pacer, guided voice, or quiet timer). */
(function () {
  'use strict';
  var K = window.CalmCore, G = window.WLGuided, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.calm.v1', K.defaults);
  var S = store.load(), view = null;
  var run = null; // {p, start, end, raf, timer, player, paused, pausedAt, before}
  function save() { store.save(S); }
  function practice(id) { return K.PRACTICES.filter(function (p) { return p.id === id; })[0]; }
  /* What he told the app (modules/me): practices that helped or didn't, too long, a rough night, the weekly plan. */
  function sopts() {
    var M = window.WLMe; if (!M) return {};
    var l = M.calmLikes(), pl = M.planFor('calm');
    return { score: l.score, tooLong: l.tooLong, rough: M.rough(), racing: !!l.racing, prefer: pl && pl.prefer ? pl.prefer : [] };
  }
  function fit(id, text) { return window.WLMe ? ' ' + WLMe.fitLink('calm', id, text) : ''; }
  /* pick: a length chosen on the practice's own start screen, for that session only (the saved default stays). */
  var pick = null;
  function mins(p) {
    if (!p.fixed && pick && pick.id === p.id) return pick.m;
    return p.fixed ? p.minutes : (p.kind === 'pacer' || p.kind === 'timer' ? S.settings.minutes : p.minutes);
  }
  /* Lengths offered on the start screen: the list's lengths for breathing and the timer; for a guided practice its
     usual length with a shorter and a longer one (the quiet stretches; the words stay the same). */
  function lengths(p) {
    if (p.fixed) return [];
    if (p.kind === 'pacer' || p.kind === 'timer') return [3, 5, 10, 15, 20];
    var a = Math.max(2, Math.round(p.minutes * 0.6)), c = Math.round(p.minutes * 1.5);
    return a < p.minutes ? [a, p.minutes, c] : [p.minutes, c];
  }
  function lengthChips(p) {
    var ls = lengths(p); if (!ls.length) return '';
    return '<div class="chips" id="c-len" role="group" aria-label="Length" style="justify-content:center;margin:6px 0">' + ls.map(function (m) {
      return '<button class="chip" data-len="' + m + '" aria-pressed="' + (mins(p) === m) + '">' + m + ' min</button>'; }).join('') + '</div>';
  }

  /* The top of Calm: what to do today. One short practice a day is the goal; once it's done, say so plainly and
     offer a different one only as an extra. */
  function racingLine() {
    var hr = new Date().getHours(), o = sopts();
    return o.racing && (hr >= 21 || hr < 5) ? '<p class="meta ui" id="c-racing">Your mind has been racing at night lately. Write down what’s on it first: <a href="#faith/journal/journal">a few lines in your journal</a>, then the practice.</p>' : '';
  }
  function todayCard() {
    var t = K.today(S), sug = practice(K.suggest(S, null, sopts()));
    if (!t.done) {
      return '<div class="card" id="c-today"><div class="meta ui">Today’s practice · not done yet</div><h3 style="margin:.2em 0">' + esc(sug.title) + ' · ' + mins(sug) + ' min</h3>' +
        '<p class="meta ui">' + esc(sug.when) + '. One short practice a day is all Calm asks; ' + (window.WLMe && WLMe.rough() ? 'after a rough night, a short one.' : 'this one fits the time of day.') + '</p>' +
        '<div class="row ui"><a class="btn primary" href="#calm/s/' + sug.id + '">Begin</a><span class="grow"></span>' + fit(sug.id, sug.title) + '</div>' + racingLine() + '</div>';
    }
    var names = t.ids.map(function (id) { return practice(id).title; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    return '<div class="card" id="c-today"><div class="meta ui">Today</div><h3 style="margin:.2em 0">✓ Done for today</h3>' +
      '<p class="ui">' + esc(names.join(', ')) + ' · ' + Math.max(1, t.mins) + ' min. That’s today’s practice. Nothing else you need to do; come back tomorrow.</p>' +
      '<p class="meta ui">If things get hard later, the one-minute reset helps. Want more now? <a href="#calm/s/' + sug.id + '">' + esc(sug.title) + ' (' + mins(sug) + ' min)</a> is a different one.</p>' + racingLine() + '</div>';
  }

  function list() {
    var st = K.stats(S);
    var h = '<h1>Calm</h1>' + (window.WLMe ? WLMe.planLine('calm') : '') + todayCard();
    h += '<details class="card ui"><summary>How Calm works</summary><p>Do one short practice a day; the card above picks one for the time of day and changes from day to day. ' +
      'Press Begin, rate how stressed you are if you like, then follow the voice (or the breathing circle). At the end, rate again and press Done. ' +
      'Guided practices are worded a little differently each time. Any practice below works any time; the one-minute reset is for hard moments.</p></details>';
    h += '<p class="meta ui">' + esc(K.advice(S)) + '</p>';
    h += '<div class="card ui"><div class="row"><span class="grow">Length for breathing and the quiet timer</span></div><div class="chips">' + [3, 5, 10, 15, 20].map(function (m) {
      return '<button class="chip" data-min="' + m + '" aria-pressed="' + (S.settings.minutes === m) + '">' + m + ' min</button>';
    }).join('') + '</div><div class="row" style="margin-top:8px"><span class="grow">Voice guidance</span><button class="chip" id="cv" aria-pressed="' + S.settings.voice + '">' + (S.settings.voice ? 'On' : 'Off') + '</button></div>' +
      '<div class="row" style="margin-top:8px"><span class="grow">Soft tick when breathing changes</span><button class="chip" id="ctk" aria-pressed="' + !!S.settings.tick + '">' + (S.settings.tick ? 'On' : 'Off') + '</button></div></div>';
    h += '<h2 class="ui" style="font-size:1em;margin:1em 0 .3em">All practices</h2><ul class="list">' + K.PRACTICES.map(function (p) {
      return '<li><a href="#calm/s/' + p.id + '"><h3>' + esc(p.title) + '</h3><div class="meta ui">' + esc(p.when) + ' · ' + mins(p) + ' min</div>' +
        (p.blurb || (p.pacer && K.PACERS[p.pacer].blurb) ? '<p style="margin:.3em 0 0">' + esc(p.blurb || K.PACERS[p.pacer].blurb) + '</p>' : '') + '</a>' +
        (window.WLMe && WLMe.state().feedback.some(function (f) { return f.part === 'calm' && f.kind === 'notfit' && f.about === p.id; }) ? '<div class="meta ui">Marked not for you: suggested less</div>' : '') + '</li>';
    }).join('') + '</ul>';
    h += '<div class="card ui"><b>' + st.weekMins + '</b> min this week on ' + st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') + ' · ' + st.total + ' sessions in all' +
      (st.avgDrop != null ? '<br><span class="meta">Stress before → after, average change: ' + (st.avgDrop >= 0 ? '−' : '+') + Math.abs(st.avgDrop).toFixed(1) + ' (from ' + st.rated + ' rated sessions)</span>' : '') + '</div>';
    h += '<p class="meta ui">Christian meditation (breath prayer, Lectio Divina, quiet prayer) is in <a href="#faith/pray">Faith › Pray</a>.</p>';
    return h;
  }

  function rating(id, label) {
    return '<div class="ui rate" id="' + id + '"><div class="meta">' + label + '</div><div class="chips">' + [1, 2, 3, 4, 5].map(function (v) {
      return '<button class="chip" data-r="' + v + '">' + v + '</button>';
    }).join('') + '</div><div class="meta" style="font-size:.75em">1 = calm · 5 = very stressed (optional)</div></div>';
  }

  function sessionHtml(p) {
    document.body.classList.add('in-session');
    return '<div class="session ui"><div class="row"><button class="link" id="c-end">✕ End</button><div class="grow meta" style="text-align:right">' + esc(p.title) + '</div></div>' +
      '<div class="progress"><div id="c-prog"></div></div>' +
      (p.kind === 'pacer' ? '<div class="pacer"><div class="ring"><div class="ball" id="c-ball"></div></div><div class="pacer-label" id="c-label">Ready</div></div>'
        : '<div class="line" id="c-line">' + esc(p.blurb || '') + '</div>') +
      '<div class="meta" id="c-left" style="text-align:center;min-height:1.4em"></div>' +
      rating('c-before', 'How stressed are you right now?') +
      lengthChips(p) +
      '<div class="controls" style="grid-template-columns:1fr"><button class="primary main" id="c-pp">▶ Begin · ' + mins(p) + ' min</button></div>' +
      '<div id="c-after" hidden>' + rating('c-after-r', 'And now?') + '<div class="row" style="justify-content:center;margin-top:10px"><button class="primary" id="c-save">Done</button></div></div></div>';
  }

  function stopRun() {
    if (!run) return;
    cancelAnimationFrame(run.raf); clearTimeout(run.timer); clearInterval(run.tick);
    if (run.player) run.player.stop();
    WL.speech.stop(); WL.keepAwake(false);
    run = null;
  }

  function elapsed() { return run ? ((run.paused ? run.pausedAt : Date.now()) - run.start - run.pausedFor) / 1000 : 0; }

  function finish() {
    if (!run) return;
    var p = run.p, m = elapsed() / 60, before = run.before;
    stopRun(); WL.bell();
    var rec = K.record(S, p.id, m, before, null, WL.logNow ? WL.logNow() : null); save(); // saved straight away; "Done" only adds the after rating
    run = { p: p, done: true, mins: m, before: before, rec: rec };
    $('#c-pp').hidden = true; $('#c-before').hidden = true; $('#c-after').hidden = false;
    if (window.WLMe) $('#c-after').insertAdjacentHTML('afterbegin', WLMe.askHtml('calm', p.id + '@' + rec.at));
    var l = $('#c-label') || $('#c-line'); if (l) l.textContent = K.today(S).count > 1 ? 'Well done. That’s another one today.' : 'Well done. That’s today’s practice done ✓';
    $('#c-prog').style.width = '100%'; $('#c-left').textContent = '';
  }

  function begin(p) {
    var total = mins(p) * 60, before = run && run.before;
    stopRun();
    run = { p: p, start: Date.now(), pausedFor: 0, paused: false, before: before };
    WL.keepAwake(true); WL.bell();
    var pp = $('#c-pp'); pp.textContent = '⏸ Pause'; pp.dataset.state = 'playing';
    var lc = $('#c-len'); if (lc) lc.hidden = true;
    $('#c-before').hidden = true;
    var progress = function () {
      var e = elapsed();
      $('#c-prog').style.width = Math.min(100, 100 * e / total) + '%';
      if (p.kind !== 'guided') $('#c-left').textContent = Math.max(0, Math.ceil((total - e) / 60)) + ' min left';
      if (p.kind !== 'guided' && e >= total) finish();
    };
    run.tick = setInterval(progress, 500);
    if (p.kind === 'pacer') {
      var lastPhase = -1;
      var frame = function () {
        if (!run || run.done || run.paused) return; // paused: no frames (resume restarts the loop)
        var a = K.pacerAt(p.pacer, elapsed());
        var ball = $('#c-ball'); if (ball) ball.style.transform = 'scale(' + (0.35 + 0.65 * a.scale).toFixed(3) + ')';
        if (a.phase !== lastPhase) {
          $('#c-label').textContent = a.label;
          if (lastPhase >= 0 && S.settings.tick && WL.tick) WL.tick(K.tickFor(a.phase)); // the start already has the bell
          lastPhase = a.phase;
        }
        run.raf = requestAnimationFrame(frame);
      };
      run.frame = frame;
      frame();
    } else if (p.kind === 'guided') {
      // a different wording each time through (counted before this session is saved)
      var steps = G.scaleScript(K.scriptFor(p, K.timesDone(S, p.id)), mins(p), S.settings.rate);
      run.player = new G.Player(steps, {
        speak: function (t, done) { WL.speech.speak(t, done, { voice: S.settings.voice, rate: S.settings.rate }); },
        stopSpeech: function () { WL.speech.stop(); },
        setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (t) { clearTimeout(t); },
        now: function () { return Date.now(); },
        onStep: function (i, s) { var l = $('#c-line'); if (l) l.textContent = s.say; $('#c-prog').style.width = Math.round(100 * i / steps.length) + '%'; },
        onEnd: function () { finish(); }
      });
      run.player.from = 0;
      run.timer = setTimeout(function () { if (run && run.player && run.player.phase === 'idle') run.player.start(); }, 1200);
    } else {
      $('#c-line').textContent = 'Sit quietly. If your mind wanders, gently come back to your breath.';
    }
  }

  function wireSession(p) {
    $$('#c-len [data-len]').forEach(function (b) { b.onclick = function () {
      pick = { id: p.id, m: +b.dataset.len };
      $$('#c-len [data-len]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      $('#c-pp').textContent = '▶ Begin · ' + pick.m + ' min';
    }; });
    $$('#c-before [data-r]').forEach(function (b) { b.onclick = function () { run = run || { p: p }; run.before = +b.dataset.r; $$('#c-before [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    var after = null;
    $$('#c-after-r [data-r]').forEach(function (b) { b.onclick = function () {
      after = +b.dataset.r;
      $$('#c-after-r [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      // save straight away so tapping Back or closing the app never drops the after-stress rating
      if (run && run.done && run.rec) { run.rec.after = after; run.rec.rated = new Date().toISOString(); save(); }
    }; });
    $('#c-pp').onclick = function () {
      var b = this, st = b.dataset.state;
      if (!st) return begin(p);
      if (st === 'playing') {
        run.paused = true; run.pausedAt = Date.now(); if (run.player) run.player.pause(); WL.keepAwake(false);
        b.textContent = '▶ Resume'; b.dataset.state = 'paused';
      } else {
        run.pausedFor += Date.now() - run.pausedAt; run.paused = false; if (run.player) run.player.resume(); if (run.frame) run.frame(); WL.keepAwake(true);
        b.textContent = '⏸ Pause'; b.dataset.state = 'playing';
      }
    };
    $('#c-save').onclick = function () {
      if (run && run.done) { if (after) { run.rec.after = after; run.rec.rated = new Date().toISOString(); } save(); WL.toast('Saved. ' + Math.max(1, Math.round(run.mins)) + ' min.'); }
      stopRun(); location.hash = '#calm';
    };
    $('#c-end').onclick = function () { saveEarly(); stopRun(); location.hash = '#calm'; };
  }

  // ending early (✕, Android back, another tab) still counts the minutes you did, if at least half a minute
  function saveEarly() {
    if (run && !run.done && run.start && elapsed() >= 30) {
      K.record(S, run.p.id, elapsed() / 60, run.before, null, WL.logNow ? WL.logNow() : null); save();
      WL.toast('Saved ' + Math.max(1, Math.round(elapsed() / 60)) + ' min');
    }
  }
  function leave() { saveEarly(); stopRun(); }

  function route(parts, v) {
    if (v) view = v;
    leave();
    if (parts && parts[0] === 's' && practice(parts[1])) { var p = practice(parts[1]); if (pick && pick.id !== p.id) pick = null; view.innerHTML = sessionHtml(p); wireSession(p); return; }
    pick = null; // back on the list: the next session starts at the usual length
    view.innerHTML = list();
    $$('[data-min]').forEach(function (b) { b.onclick = function () { S.settings.minutes = +b.dataset.min; save(); route([]); }; });
    $('#cv').onclick = function () { S.settings.voice = !S.settings.voice; save(); route([]); };
    $('#ctk').onclick = function () { S.settings.tick = !S.settings.tick; save(); route([]); };
  }

  function card() {
    var t = K.today(S), sug = practice(K.suggest(S, null, sopts()));
    if (t.done) return '<div class="meta ui">Calm</div><h3>✓ Done for today</h3><p class="meta ui">' + esc(practice(t.ids[0]).title) + (t.count > 1 ? ' and ' + (t.count - 1) + ' more' : '') + ' · ' + Math.max(1, t.mins) + ' min. Nothing else needed today.</p>' +
      '<div class="row ui"><a class="btn" href="#calm">Calm</a></div>';
    return '<div class="meta ui">Calm · today’s practice</div><h3>' + esc(sug.title) + ' · ' + mins(sug) + ' min</h3><p class="meta ui">' + esc(K.advice(S)) + '</p>' +
      '<div class="row ui"><a class="btn primary" href="#calm/s/' + sug.id + '">Begin</a><a class="btn" href="#calm">All practices</a></div>';
  }

  WL.register({
    id: 'calm', title: 'Calm', short: 'Calm', icon: '○', nav: true, storageKeys: [store.key],
    route: route, leave: leave, card: card,
    week: function () { var st = K.stats(S); return st.weekDays ? st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') + ' of calm (' + st.weekMins + ' min)' : ''; },
    today: function () { var t = K.today(S); if (t.done) return { label: 'Calm: done', done: true, href: '#calm' }; var sug = practice(K.suggest(S, null, sopts())); return { label: 'Calm: ' + sug.title.toLowerCase() + ' (' + mins(sug) + ' min)', done: false, href: '#calm/s/' + sug.id }; },
    pause: function () { var b = $('#c-pp'); if (b && b.dataset.state === 'playing') b.click(); },
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
