/* Calm module: #calm (list + progress), #calm/s/ID (a session: breathing pacer, guided voice, or quiet timer). */
(function () {
  'use strict';
  var K = window.CalmCore, G = window.WLGuided, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.calm.v1', K.defaults);
  var S = store.load(), view = null;
  var run = null; // {p, start, end, raf, timer, player, paused, pausedAt, before}
  function save() { store.save(S); }
  function practice(id) { return K.PRACTICES.filter(function (p) { return p.id === id; })[0]; }
  function mins(p) { return p.fixed ? p.minutes : (p.kind === 'pacer' || p.kind === 'timer' ? S.settings.minutes : p.minutes); }

  function list() {
    var st = K.stats(S), sug = practice(K.suggest(S));
    var h = '<h1>Calm</h1><p class="meta ui">' + esc(K.advice(S)) + '</p>';
    h += '<div class="card"><div class="meta ui">Right now</div><h3 style="margin:.2em 0">' + esc(sug.title) + '</h3><p class="meta ui">' + esc(sug.when) + '</p>' +
      '<a class="btn primary ui" href="#calm/s/' + sug.id + '">Begin · ' + mins(sug) + ' min</a></div>';
    h += '<div class="card ui"><div class="row"><span class="grow">Length for breathing and the quiet timer</span></div><div class="chips">' + [3, 5, 10, 15, 20].map(function (m) {
      return '<button class="chip" data-min="' + m + '" aria-pressed="' + (S.settings.minutes === m) + '">' + m + ' min</button>';
    }).join('') + '</div><div class="row" style="margin-top:8px"><span class="grow">Voice guidance</span><button class="chip" id="cv" aria-pressed="' + S.settings.voice + '">' + (S.settings.voice ? 'On' : 'Off') + '</button></div></div>';
    h += '<ul class="list">' + K.PRACTICES.map(function (p) {
      return '<li><a href="#calm/s/' + p.id + '"><h3>' + esc(p.title) + '</h3><div class="meta ui">' + esc(p.when) + ' · ' + mins(p) + ' min</div>' +
        (p.blurb || (p.pacer && K.PACERS[p.pacer].blurb) ? '<p style="margin:.3em 0 0">' + esc(p.blurb || K.PACERS[p.pacer].blurb) + '</p>' : '') + '</a></li>';
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
    var rec = K.record(S, p.id, m, before, null); save(); // saved straight away; "Done" only adds the after rating
    run = { p: p, done: true, mins: m, before: before, rec: rec };
    $('#c-pp').hidden = true; $('#c-before').hidden = true; $('#c-after').hidden = false;
    var l = $('#c-label') || $('#c-line'); if (l) l.textContent = 'Well done.';
    $('#c-prog').style.width = '100%'; $('#c-left').textContent = '';
  }

  function begin(p) {
    var total = mins(p) * 60, before = run && run.before;
    stopRun();
    run = { p: p, start: Date.now(), pausedFor: 0, paused: false, before: before };
    WL.keepAwake(true); WL.bell();
    var pp = $('#c-pp'); pp.textContent = '⏸ Pause'; pp.dataset.state = 'playing';
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
        if (a.phase !== lastPhase) { $('#c-label').textContent = a.label; lastPhase = a.phase; }
        run.raf = requestAnimationFrame(frame);
      };
      run.frame = frame;
      frame();
    } else if (p.kind === 'guided') {
      var steps = G.scaleScript(p.steps, p.minutes, S.settings.rate);
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
    $$('#c-before [data-r]').forEach(function (b) { b.onclick = function () { run = run || { p: p }; run.before = +b.dataset.r; $$('#c-before [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    var after = null;
    $$('#c-after-r [data-r]').forEach(function (b) { b.onclick = function () { after = +b.dataset.r; $$('#c-after-r [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
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
      if (run && run.done) { if (after) run.rec.after = after; save(); WL.toast('Saved. ' + Math.max(1, Math.round(run.mins)) + ' min.'); }
      stopRun(); location.hash = '#calm';
    };
    $('#c-end').onclick = function () {
      // ending early still counts the minutes you did (if at least half a minute)
      if (run && !run.done && run.start && elapsed() >= 30) { K.record(S, p.id, elapsed() / 60, run.before, null); save(); WL.toast('Saved ' + Math.max(1, Math.round(elapsed() / 60)) + ' min'); }
      stopRun(); location.hash = '#calm';
    };
  }

  function route(parts, v) {
    if (v) view = v;
    stopRun();
    if (parts && parts[0] === 's' && practice(parts[1])) { var p = practice(parts[1]); view.innerHTML = sessionHtml(p); wireSession(p); return; }
    view.innerHTML = list();
    $$('[data-min]').forEach(function (b) { b.onclick = function () { S.settings.minutes = +b.dataset.min; save(); route([]); }; });
    $('#cv').onclick = function () { S.settings.voice = !S.settings.voice; save(); route([]); };
  }

  function card() {
    var sug = practice(K.suggest(S));
    return '<div class="meta ui">Calm</div><h3>' + esc(sug.title) + ' · ' + mins(sug) + ' min</h3><p class="meta ui">' + esc(K.advice(S)) + '</p>' +
      '<div class="row ui"><a class="btn primary" href="#calm/s/' + sug.id + '">Begin</a><a class="btn" href="#calm">All practices</a></div>';
  }

  WL.register({
    id: 'calm', title: 'Calm', short: 'Calm', icon: '○', nav: true, storageKeys: [store.key],
    route: route, leave: stopRun, card: card,
    pause: function () { var b = $('#c-pp'); if (b && b.dataset.state === 'playing') b.click(); },
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
