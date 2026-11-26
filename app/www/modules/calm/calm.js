/* Calm module: #calm (list + progress), #calm/s/ID (a session: breathing pacer, guided voice, or quiet timer). */
(function () {
  'use strict';
  var K = window.CalmCore, G = window.WLGuided, Sit = window.CalmSit, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.calm.v1', K.defaults);
  var S = store.load(), view = null;
  var run = null, keyHandler = null; // {p, start, end, raf, timer, player, paused, pausedAt, before}
  function save() { store.save(S); }
  function practice(id) { return K.PRACTICES.filter(function (p) { return p.id === id; })[0]; }
  function titleOf(id) { var p = practice(id); return p ? p.title : String(id || ''); }
  /* What he told the app (modules/me): practices that helped or didn't, too long, a rough night, the weekly plan. */
  function sopts() {
    var M = window.WLMe; if (!M) return {};
    var l = M.calmLikes(), pl = M.planFor('calm');
    return { score: l.score, tooLong: l.tooLong, rough: M.rough(), racing: !!l.racing, flat: l.flat || 0, prefer: pl && pl.prefer && !(M.planFlagged && M.planFlagged('calm')) ? pl.prefer : [] };
  }
  function fit(id, text) { return window.WLMe ? ' ' + WLMe.fitLink('calm', id, text) : ''; }
  /* pick: a length chosen on the practice's own start screen, for that session only (the saved default stays).
     pick = { id, m, secs? } where secs (optional) gives exact duration in seconds for custom timer input. */
  var pick = null;
  function mins(p) {
    if (!p.fixed && pick && pick.id === p.id) return pick.m;
    if (p.path) return S.settings.sitMinutes || 20;
    return p.fixed ? p.minutes : (p.kind === 'pacer' || p.kind === 'timer' ? S.settings.minutes : p.minutes);
  }
  function totalSecs(p) {
    if (!p.fixed && pick && pick.id === p.id && pick.secs > 0) return pick.secs;
    return Math.round(mins(p) * 60);
  }
  function fmtTimer(secs) {
    secs = Math.max(0, Math.ceil(secs));
    var m = Math.floor(secs / 60), s = secs % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function beginLabel(p) {
    var s = totalSecs(p);
    if (s % 60 === 0) return '▶ Begin · ' + (s / 60) + ' min';
    return '▶ Begin · ' + fmtTimer(s);
  }
  /* Lengths offered on the start screen: the list's lengths for breathing and the timer; for a guided practice its
     usual length with a shorter and a longer one (the quiet stretches; the words stay the same). */
  function lengths(p) {
    if (p.fixed) return [];
    if (p.path) return K.SIT_LENGTHS;
    if (p.kind === 'pacer' || p.kind === 'timer') return [3, 5, 10, 15, 20];
    var a = Math.max(2, Math.round(p.minutes * 0.6)), c = Math.round(p.minutes * 1.5);
    return a < p.minutes ? [a, p.minutes, c] : [p.minutes, c];
  }
  function roughDay(p) { return Sit.roughDay(S, p); }
  function roughLine(p) { return Sit.roughLine(S, p); }
  function quietChip(p) { return Sit.quietChip(S, p); }
  function noiseChips(idAttr) {
    var cur = (S.settings && S.settings.noise) || 'off';
    var labels = (window.WLNoise && WLNoise.LABELS) || { off: 'Off', brown: 'Warm brown', pink: 'Soft rain', white: 'White noise' };
    return '<div class="chips" id="' + idAttr + '" role="group" aria-label="Background sound">' + K.NOISE_KINDS.map(function (k) {
      return '<button class="chip" type="button" data-noise="' + k + '" aria-pressed="' + (cur === k) + '">' + esc(labels[k] || k) + '</button>';
    }).join('') + '</div>';
  }
  function noiseRow(p) {
    if (!Sit.usesAlarm(p)) return '';
    return '<div id="c-noise-row" style="text-align:center;margin:4px 0 6px"><div class="meta" style="margin-bottom:4px">Background sound</div>' +
      noiseChips('c-noise-pick').replace('class="chips"', 'class="chips" style="justify-content:center"') + '</div>';
  }
  function exactTimerRow(p) {
    if (p.fixed || (!p.path && p.kind !== 'timer' && p.kind !== 'pacer')) return '';
    var withSecs = p.kind === 'timer' || p.kind === 'pacer';
    return '<div class="row" id="c-exact" style="justify-content:center;gap:6px;margin:2px 0 6px">' +
      '<label class="meta" for="c-exact-m">Exact timer</label>' +
      '<input type="number" id="c-exact-m" class="ck-custom-min" min="' + (withSecs ? 0 : 1) + '" max="120" inputmode="numeric" placeholder="min" aria-label="Exact minutes">' +
      (withSecs ? '<span class="meta">:</span><input type="number" id="c-exact-s" class="ck-custom-min" min="0" max="59" inputmode="numeric" placeholder="sec" aria-label="Exact seconds">' : '<span class="meta">min</span>') +
      '</div>';
  }
  function lengthChips(p) {
    var ls = lengths(p); if (!ls.length) return '';
    return '<div class="chips" id="c-len" role="group" aria-label="Length" style="justify-content:center;margin:6px 0">' + ls.map(function (m) {
      return '<button class="chip" data-len="' + m + '" aria-pressed="' + (mins(p) === m && !(pick && pick.id === p.id && pick.secs && pick.secs % 60 !== 0)) + '">' + m + ' min</button>'; }).join('') + '</div>' + exactTimerRow(p);
  }

  /* The top of Calm: what to do today. One short practice a day is the goal; once it's done, say so plainly and
     offer a different one only as an extra. */
  function racingLine() {
    var hr = new Date().getHours(), o = sopts();
    return o.racing && (hr >= 21 || hr < 5) ? '<div class="ui" id="c-racing" style="margin-top:8px"><p class="meta" style="margin:0">Your mind has been racing at night lately. Write down what’s on it first, then do the practice.</p><a class="link" href="#journal/journal">Write a few lines in your journal</a></div>' : '';
  }
  /* His last few practices didn't help ("Not really" 3+ times in a row): say so, and that this one is a different kind. */
  function flatLine(sug) {
    var M = window.WLMe, l = M && M.calmLikes();
    if (!l || (l.flat || 0) < 3) return '';
    var tried = (l.score[sug.id] || 0) < 0;
    return '<p class="meta ui" id="c-flat">Your last ' + l.flat + ' practices didn’t help much. ' + (tried ? 'If this one doesn’t either, skipping a night is fine.' : 'This one works differently, so it’s worth a try.') + ' Tap “Not for me?” on any you’d rather not see again.</p>';
  }
  /* The picture-word shuffle is new and unusual: until he has done it once, one line on what it is. */
  function howLine(sug) {
    if (sug.id !== 'shuffle' || K.timesDone(S, 'shuffle') > 0) return '';
    return '<p class="meta ui" id="c-how">New: a slow game of picturing one ordinary thing after another, so worries have less room. It’s a known trick for falling asleep with a busy mind (sometimes called a “cognitive shuffle”).</p>';
  }
  function todayCard() {
    var t = K.today(S), sug = practice(K.suggest(S, null, sopts()));
    if (!t.done) {
      var left = Math.max(1, Math.round(t.goal - t.rawMins));
      var pct = Math.min(100, Math.round(100 * t.rawMins / t.goal));
      var names0 = t.ids.map(titleOf).filter(function (x, i, a) { return a.indexOf(x) === i; });
      return '<div class="card" id="c-today"><div class="meta ui">' + (t.any ? 'Today · ' + Math.max(1, t.mins) + ' of ' + t.goal + ' min' : 'Today’s practice · goal ' + t.goal + ' min') + '</div>' +
        (t.any ? '<div class="progress" style="margin:6px 0 10px"><div style="width:' + pct + '%"></div></div>' +
          '<p class="meta ui">' + esc(names0.join(', ')) + ' (' + Math.max(1, t.mins) + ' min) logged — good reset. About ' + left + ' min left for today’s goal:</p>' : '') +
        '<h3 style="margin:.2em 0">' + esc(sug.title) + ' · ' + mins(sug) + ' min</h3>' +
        '<p class="meta ui">' + esc(sug.when) + '. ' + (sug.path ? 'Today’s sit on your meditation path.' + (window.WLMe && WLMe.rough() ? ' After a rough night, 10 minutes is plenty.' : '') : (window.WLMe && WLMe.rough() ? 'After a rough night, a short one is plenty.' : 'This one fits the time of day.')) + '</p>' + (sug.path ? '' : flatLine(sug) + howLine(sug)) +
        '<div class="row ui"><a class="btn primary" href="#calm/s/' + sug.id + '">Begin</a><span class="grow"></span>' + fit(sug.id, sug.title) + '</div>' + racingLine() + '</div>';
    }
    var names = t.ids.map(titleOf).filter(function (x, i, a) { return a.indexOf(x) === i; });
    return '<div class="card" id="c-today"><div class="meta ui">Today · ' + Math.max(1, t.mins) + ' of ' + t.goal + ' min</div><h3 style="margin:.2em 0">✓ Done for today</h3>' +
      '<p class="ui">' + esc(names.join(', ')) + ' · ' + Math.max(1, t.mins) + ' min. Today’s ' + t.goal + ' min goal is done. Come back tomorrow.</p>' +
      '<div class="row ui" style="gap:4px 8px"><span class="meta">If things get hard later, the one-minute reset helps. Want more now?</span><a class="link" href="#calm/s/' + sug.id + '">' + esc(sug.title) + ' (' + mins(sug) + ' min)</a></div>' + racingLine() + '</div>';
  }

  /* What Calm is for: feeling calmer (stress, sleep) or training the mind (the meditation path). Asked once. */
  function aimChips() {
    return [['calm', 'Feeling calmer, sleeping better'], ['train', 'Training my mind (meditation path)']].map(function (a) {
      return '<button class="chip" data-aim="' + a[0] + '" aria-pressed="' + (S.settings.aim === a[0]) + '">' + a[1] + '</button>'; }).join('');
  }
  function aimCard() {
    if (S.settings.aim) return '';
    return '<div class="card ui" id="c-aim"><h3 style="margin:.2em 0">What do you want from Calm?</h3>' +
      '<p class="meta">Short practices for stress and sleep, or meditation as a daily training of the mind (attention, then seeing clearly), step by step. You can change this any time.</p>' +
      '<div class="chips">' + aimChips() + '</div></div>';
  }
  /* The meditation path: his stage, how it's going, moving on when he's ready, and all five stages. */
  function pathHtml(open) {
    var ps = K.pathStatus(S), cur = practice(ps.stage), nx = ps.next && practice(ps.next);
    var h = '<details class="card ui" id="c-path"' + (open ? ' open' : '') + '><summary>Meditation path' + (open ? ' · stage ' + ps.n + ' of ' + ps.of + ': ' + esc(cur.title) : ' (training the mind)') + '</summary>';
    if (open) {
      h += '<p class="meta" id="c-path-status">' + (ps.sits ? ps.sits + ' sit' + (ps.sits === 1 ? '' : 's') + ' at this stage (' + ps.mins + ' min)' + (ps.rated ? '; attention mostly steady in ' + ps.steady + ' of the last ' + ps.rated : '') + '.' : 'No sits at this stage yet.') + '</p>';
      if (ps.tip) h += '<p class="meta" id="c-path-tip">' + esc(ps.tip) + '</p>';
      if (ps.when) h += '<p class="meta" id="c-path-when">' + esc(ps.when.text) + '</p>';
      if (ps.late && !(window.WLMe && WLMe.state().feedback.some(function (f) { return f && f.part === 'calm' && f.kind === 'notfit' && f.about === 'path:late'; })))
        h += '<p class="meta" id="c-path-late">' + esc(ps.late) + fit('path:late', ps.late) + '</p>';
      if (ps.back) h += '<div class="row" id="c-path-back" style="gap:4px 8px"><span class="meta">Your mind has wandered a lot in recent sits at this stage. That’s normal; going back a step for a while often helps.</span><button class="chip" data-stage="' + ps.prev + '">Back to ' + esc(practice(ps.prev).title) + '</button></div>';
      if (ps.ready) h += '<div class="row" id="c-path-ready" style="gap:4px 8px"><span class="meta">Your attention has been steady lately. Ready for the next stage?</span><button class="chip" data-stage="' + ps.next + '">Move on to ' + esc(nx.title) + '</button></div>';
      else if (nx) h += '<p class="meta">The next stage (' + esc(nx.title) + ') is offered after ' + K.READY_SITS + ' sits here with your attention mostly steady in 3 of the last 5. There’s no hurry; you can also choose any stage below.</p>';
    }
    h += '<ul class="list" id="c-stages">' + K.PATH.map(function (id) {
      var p = practice(id), here = id === ps.stage && S.settings.aim === 'train';
      return '<li' + (here ? ' aria-current="step"' : '') + '><a href="#calm/s/' + id + '"><h3>' + p.path + '. ' + esc(p.title) + (here ? ' · your stage' : '') + '</h3><div class="meta ui">' + esc(p.when) + ' · ' + mins(p) + ' min</div><p style="margin:.3em 0 0">' + esc(p.blurb) + '</p></a>' +
        (S.settings.aim === 'train' && !here ? '<button class="link" data-stage="' + id + '">Make this my stage</button>' : '') + '</li>';
    }).join('') + '</ul>';
    h += '<details><summary>Why this order</summary><p>Many contemplative traditions teach meditation as a training of the mind, not only a way to relax. First comes steadiness: one simple object (counting, then the breath itself). Then insight: seeing clearly what is happening as it happens (noting what pulls you away, watching sensations and thoughts change and pass). Then open awareness without a focus. Researchers describe the same two broad families, focused attention and open monitoring, and find they train somewhat different skills.</p>' +
      '<p>The skill is noticing that you’ve wandered and coming back, kindly. Sleepiness and restlessness are the two classic obstacles; after each sit you can say which came up, and the next sit gives a tip. Progress isn’t a straight line: going back a stage is normal. Daily and unhurried beats long and rare.</p><p id="c-why-quiet">Used to long silent sits? Turn on “Quiet sit” on the sit screen: just the opening words, silence, and the close.</p></details>';
    return h + '</details>';
  }

  function list() {
    var st = K.stats(S), goal = K.goalOf(S);
    var train = S.settings.aim === 'train';
    var h = '<h1>Calm</h1>' + (window.WLMe ? WLMe.planLine('calm') : '') + aimCard() + todayCard() + (train ? pathHtml(true) : '');
    h += '<details class="card ui"><summary>How Calm works</summary><p>Work toward your daily goal below (one longer practice, or shorter ones that add up). ' +
      'Press Begin, rate how stressed you are if you like, then follow the voice or breathing circle (exhale down to the inner dashed ring). At the end, rate again and press Done. ' +
      'Guided practices are worded a little differently each time; the one-minute reset is always here for hard moments.</p></details>';
    h += '<p class="meta ui">' + esc(K.advice(S)) + '</p>';
    h += '<div class="card ui"><div class="row"><span class="grow">Daily goal</span></div><div class="chips" id="c-goal">' + K.DAILY_GOALS.map(function (g) {
      return '<button class="chip" data-goal="' + g + '" aria-pressed="' + (goal === g) + '">' + (g === 1 ? '1 min (rough days)' : g + ' min') + '</button>';
    }).join('') + '</div><p class="meta" style="margin:.45em 0 8px">Research guide: ~5 min/day of cyclic sighing lowers stress and lifts mood; 10–13 min/day of mindfulness shows measurable focus and mood gains over ~8 weeks; 20 min/day is the classic deeper target. Even a 1-minute reset helps in the moment and counts toward today’s total.</p>' +
      '<div class="row"><span class="grow">Length for breathing and the quiet timer</span></div><div class="chips">' + [3, 5, 10, 15, 20].map(function (m) {
      return '<button class="chip" data-min="' + m + '" aria-pressed="' + (S.settings.minutes === m) + '">' + m + ' min</button>';
    }).join('') + '</div><div class="row" style="margin-top:8px"><span class="grow">Voice guidance</span><button class="chip" id="cv" aria-pressed="' + S.settings.voice + '">' + (S.settings.voice ? 'On' : 'Off') + '</button></div>' +
      '<div class="row" style="margin-top:8px"><span class="grow">Soft tick when breathing changes</span><button class="chip" id="ctk" aria-pressed="' + !!S.settings.tick + '">' + (S.settings.tick ? 'On' : 'Off') + '</button></div>' +
      '<h4 class="meta" id="c-sits-h" style="margin:14px 0 0;font-weight:600">Sits and the quiet timer</h4>' +
      '<div class="row" style="margin-top:6px"><span class="grow">Dark screen (after 10 s; tap to see the time)</span><button class="chip" id="cdk" aria-pressed="' + (S.settings.dark !== false) + '">' + (S.settings.dark !== false ? 'On' : 'Off') + '</button></div>' +
      '<div class="row" style="margin-top:8px"><span class="grow">Soft bell during sits</span></div><div class="chips" id="c-iv">' + K.INTERVALS.map(function (m) {
      return '<button class="chip" data-iv="' + m + '" aria-pressed="' + ((S.settings.interval || 0) === m) + '">' + (m ? 'Every ' + m + ' min' : 'Off') + '</button>';
    }).join('') + '</div>' +
      '<div class="row" style="margin-top:8px"><span class="grow">Background sound during sits</span></div>' + noiseChips('c-noise') +
      '<div class="row" style="margin-top:8px"><span class="grow">Calm is mainly for</span></div><div class="chips" id="c-aim-set">' + aimChips() + '</div></div>';
    var helped = window.WLMe && WLMe.calmHelped ? WLMe.calmHelped() : {};
    // a practice that hasn't helped him in 3+ tries goes to the end of the list
    var never = function (p) { var x = helped[p.id]; return x && x.n >= 3 && x.yes === 0 ? 1 : 0; };
    var order = K.PRACTICES.filter(function (p) { return !p.path; }).map(function (p, i) { return [p, i]; }).sort(function (a, b) { return never(a[0]) - never(b[0]) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    h += '<h2 class="ui" style="font-size:1em;margin:1em 0 .3em">All practices</h2><ul class="list">' + order.map(function (p) {
      var hp = helped[p.id];
      return '<li><a href="#calm/s/' + p.id + '"><h3>' + esc(p.title) + '</h3><div class="meta ui">' + esc(p.when) + ' · ' + mins(p) + ' min' +
        (hp && hp.n >= 2 ? '<span class="c-helped"> · ' + (never(p) ? 'Hasn’t helped you so far' : 'Helped ' + hp.yes + ' of ' + hp.n + ' times') + '</span>' : '') + '</div>' +
        (p.blurb || (p.pacer && K.PACERS[p.pacer].blurb) ? '<p style="margin:.3em 0 0">' + esc(p.blurb || K.PACERS[p.pacer].blurb) + '</p>' : '') + '</a>' +
        (window.WLMe && WLMe.state().feedback.some(function (f) { return f.part === 'calm' && f.kind === 'notfit' && f.about === p.id; }) ? '<div class="meta ui">Marked not for you: suggested less</div>' : '') + '</li>';
    }).join('') + '</ul>';
    h += '<div class="card ui"><b>' + st.weekMins + '</b> min this week on ' + st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') + ' · ' + st.total + ' sessions in all' +
      (st.avgDrop != null ? '<br><span class="meta">Stress before → after, average change: ' + (st.avgDrop >= 0 ? '−' : '+') + Math.abs(st.avgDrop).toFixed(1) + ' (from ' + st.rated + ' rated sessions)</span>' : '') + '</div>';
    if (!train) h += pathHtml(false);
    h += recentHtml();
    h += '<div class="row ui" style="gap:4px 8px"><span class="meta">Christian meditation (breath prayer, Lectio Divina, quiet prayer) is in</span><a class="link" href="#faith/pray">Faith › Pray</a></div>';
    return h;
  }

  function fmtChange(v) {
    var r = Math.round(v * 10) / 10;
    if (r === 0) return '0.0';
    return (r < 0 ? '\u2212' : '+') + Math.abs(r).toFixed(1);
  }
  function recentHtml() {
    if (!S.sessions.length) return '';
    var items = S.sessions.map(function (s, i) {
      var ts = Date.parse(s && s.at);
      if (isNaN(ts)) ts = Date.parse(s && s.date);
      return { s: s, t: isNaN(ts) ? 0 : ts, i: i };
    }).sort(function (a, b) { return b.t - a.t || b.i - a.i; }).slice(0, 10).map(function (x) { return x.s; });
    var byP = K.stressByPractice ? K.stressByPractice(S) : [];
    var avgLine = byP.length ? '<p class="meta" id="c-recent-avg" style="margin:.4em 0 .5em">Average stress change: ' + byP.map(function (x) {
      return esc(titleOf(x.id)) + ': ' + fmtChange(x.avgChange) + ' over ' + x.n;
    }).join(' · ') + '</p>' : '';
    return '<details class="card ui" id="c-recent"><summary>Recent sessions (' + items.length + ')</summary>' + avgLine + '<ul class="me-g">' + items.map(function (s) {
      var d = s.date ? (function () { var p = s.date.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); })() : '';
      var focusLbl = s.focus >= 1 && s.focus <= 3 ? K.FOCUS[s.focus - 1] : '';
      var hindLbl = Array.isArray(s.hind) ? s.hind.filter(function (h) { return h && h !== 'Nothing much'; }).join(', ') : '';
      var sitInfo = focusLbl || hindLbl ? ' · ' + (focusLbl || '') + (hindLbl ? (focusLbl ? ' (' + hindLbl + ')' : hindLbl) : '') : '';
      var rating = s.before && s.after ? ' · stress ' + s.before + '→' + s.after : s.after ? ' · stress now ' + s.after : sitInfo;
      // a path sit says when it was (the path card compares times of day)
      var at = K.PATH.indexOf(s.id) >= 0 && !isNaN(Date.parse(s.at)) ? ' · ' + new Date(Date.parse(s.at)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
      return '<li><b>' + esc(titleOf(s.id)) + '</b> <span class="meta">' + esc(d + at) + ' · ' + Math.max(1, Math.round(s.mins || 0)) + ' min' + esc(rating) + '</span></li>';
    }).join('') + '</ul></details>';
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
      (p.kind === 'pacer' ? '<div class="pacer"><div class="ring"><div class="ball" id="c-ball"></div><div class="ring-min" aria-hidden="true"></div></div><div class="pacer-label" id="c-label">Ready</div></div>'
        : '<div class="line" id="c-line">' + esc(p.blurb || '') + '</div>') +
      '<div class="meta" id="c-left" style="text-align:center;min-height:1.4em;font-variant-numeric:tabular-nums"></div>' +
      (p.path ? '' : rating('c-before', 'How stressed are you right now?')) +
      lengthChips(p) + quietChip(p) + noiseRow(p) + Sit.firstSitTip(S, p) + roughLine(p) +
      '<div class="controls" style="grid-template-columns:1fr"><button class="primary main" id="c-pp">' + beginLabel(p) + '</button></div>' +
      (Sit.darkOn(S, p) && Sit.darkHint(S) ? '<p class="meta" id="c-dark-hint" style="text-align:center">The screen goes dark while you sit, so you needn’t lock the phone. Tap it to see the time.</p>' : '') +
      '<div id="c-after" hidden>' + (p.path ? Sit.sitQuestions() : rating('c-after-r', 'And now?')) + '<div class="row" style="justify-content:center;margin-top:10px"><button class="primary" id="c-save">Done</button><button class="link" type="button" data-wl-note="#calm/s/' + esc(p.id) + '">💡 Note for autopilot</button></div></div></div>';
  }

  function usesAlarm(p) { return Sit.usesAlarm(p); }
  function alarmLabel(p) { return Sit.alarmLabel(p, mins(p)); }
  function calmAlarm(ms, label) { Sit.calmAlarm(ms, label); }
  function scheduleDark() { Sit.scheduleDark(S, run); }
  function lightUp() { Sit.lightUp(); }

  function stopRun() {
    if (!run) return;
    lightUp();
    if (window.WLNoise) WLNoise.stop();
    cancelAnimationFrame(run.raf); clearTimeout(run.timer); clearInterval(run.tick);
    if (run.player) run.player.stop();
    WL.speech.stop(); WL.keepAwake(false); calmAlarm(0, '');
    run = null;
  }

  function elapsed() { return run ? ((run.paused ? run.pausedAt : Date.now()) - run.start - run.pausedFor) / 1000 : 0; }

  function loggedMins() {
    var e = Math.max(0, elapsed());
    if (!run || !run.total) return e / 60;
    var cap = run.p && run.p.kind !== 'guided' ? run.total : Math.max(run.total * 2, 1800);
    return Math.min(e, cap) / 60;
  }

  function sessionTime(started) { return Sit.sessionTime(started); }
  function finish(silent) {
    if (!run) return;
    var p = run.p, m = silent && run.total ? Math.min(loggedMins(), run.total / 60) : loggedMins(), before = run.before, started = run.start;
    stopRun(); if (!silent) WL.bell();
    var rec = K.record(S, p.id, m, before, null, sessionTime(started)); save(); // saved straight away; "Done" only adds the after rating
    run = { p: p, done: true, mins: m, before: before, rec: rec };
    $('#c-pp').hidden = true; if ($('#c-before')) $('#c-before').hidden = true; $('#c-after').hidden = false;
    if (window.WLMe && !p.path) $('#c-after').insertAdjacentHTML('afterbegin', WLMe.askHtml('calm', p.id + '@' + rec.at));
    var td = K.today(S), l = $('#c-label') || $('#c-line');
    if (l && p.path) l.textContent = 'Well done. ' + Math.max(1, Math.round(m)) + ' min of practice.';
    else if (l) l.textContent = td.done ? 'Well done. Today’s ' + td.goal + ' min goal is done ✓' : 'Good reset (' + Math.max(1, td.mins) + ' of ' + td.goal + ' min today).';
    $('#c-prog').style.width = '100%'; $('#c-left').textContent = '';
  }

  function begin(p) {
    var total = totalSecs(p), before = run && run.before;
    stopRun();
    run = { p: p, start: Date.now(), pausedFor: 0, paused: false, before: before, total: total, iv: 0 };
    var every = Sit.intervalEvery(S, p);
    WL.keepAwake(true); WL.bell();
    if (usesAlarm(p) && window.WLNoise && S.settings.noise && S.settings.noise !== 'off') WLNoise.start(S.settings.noise);
    if (usesAlarm(p)) calmAlarm(total * 1000, alarmLabel(p));
    var pp = $('#c-pp'); pp.textContent = '⏸ Pause'; pp.dataset.state = 'playing';
    var lc = $('#c-len'); if (lc) lc.hidden = true;
    var ex = $('#c-exact'); if (ex) ex.hidden = true;
    var nr = $('#c-noise-row'); if (nr) nr.hidden = true;
    var qr = $('#c-quiet-row'); if (qr) qr.hidden = true;
    var ft = $('#c-first-tip'); if (ft) ft.hidden = true;
    if ($('#c-before')) $('#c-before').hidden = true;
    var progress = function () {
      var e = elapsed();
      $('#c-prog').style.width = Math.min(100, 100 * e / total) + '%';
      if (p.kind !== 'guided' || p.path) $('#c-left').textContent = fmtTimer(total - e) + ' left';
      Sit.ringInterval(run, every, e);
      if (p.kind !== 'guided' && e >= total) finish(!!(usesAlarm(p) && WL.native && WL.native.calmAlarm && e - total > 5));
    };
    progress();
    run.tick = setInterval(progress, 500);
    scheduleDark();
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
      var sc = K.scriptFor(p, K.timesDone(S, p.id));
      if (p.path && S.settings.sitQuiet) sc = K.quietScript(sc); // a quiet sit: the opening, silence, the close
      var steps = G.scaleScript(sc, mins(p), S.settings.rate);
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
      // a sit length is kept for next time (not the shorter one picked because of a rough night)
      if (p.path && !(roughDay(p) && pick.m <= 10)) { S.settings.sitMinutes = pick.m; save(); }
      $$('#c-len [data-len]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      var em = $('#c-exact-m'), es = $('#c-exact-s'); if (em) em.value = ''; if (es) es.value = '';
      $('#c-pp').textContent = beginLabel(p);
    }; });
    function applyExact() {
      var em = $('#c-exact-m'), es = $('#c-exact-s');
      var m = em ? Math.max(0, Math.min(120, Math.floor(+em.value || 0))) : 0;
      var s = es ? Math.max(0, Math.min(59, Math.floor(+es.value || 0))) : 0;
      var tot = m * 60 + s;
      if (p.path && m < 1) return;
      if (tot < 10) return;
      pick = { id: p.id, m: tot / 60, secs: tot };
      $$('#c-len [data-len]').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.len * 60 === tot)); });
      $('#c-pp').textContent = beginLabel(p);
    }
    var em = $('#c-exact-m'), es = $('#c-exact-s');
    if (em) em.oninput = applyExact;
    if (es) es.oninput = applyExact;
    $$('#c-noise-pick [data-noise]').forEach(function (b) { b.onclick = function () {
      S.settings.noise = b.dataset.noise; save();
      $$('#c-noise-pick [data-noise]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    }; });
    var qb = $('#c-quiet');
    if (qb) qb.onclick = function () { S.settings.sitQuiet = !S.settings.sitQuiet; save(); qb.setAttribute('aria-pressed', !!S.settings.sitQuiet); };
    $$('#c-before [data-r]').forEach(function (b) { b.onclick = function () { run = run || { p: p }; run.before = +b.dataset.r; $$('#c-before [data-r]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    var after = null, hind = [];
    $$('#c-focus [data-f]').forEach(function (b) { b.onclick = function () {
      var f = +b.dataset.f, on = b.getAttribute('aria-pressed') === 'true';
      $$('#c-focus [data-f]').forEach(function (x) { x.setAttribute('aria-pressed', !on && x === b); });
      if (run && run.done && run.rec) { K.rateSit(run.rec, on ? null : f); run.rec.rated = new Date().toISOString(); save(); }
    }; });
    $$('#c-hind [data-h]').forEach(function (b) { b.onclick = function () {
      var v = b.dataset.h, i = hind.indexOf(v);
      if (i >= 0) hind.splice(i, 1); else hind.push(v);
      if (run && run.done && run.rec) { K.rateSit(run.rec, undefined, hind); hind = (run.rec.hind || []).slice(); run.rec.rated = new Date().toISOString(); save(); }
      $$('#c-hind [data-h]').forEach(function (x) { x.setAttribute('aria-pressed', hind.indexOf(x.dataset.h) >= 0); });
    }; });
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
        if (window.WLNoise) WLNoise.stop();
        if (usesAlarm(p)) calmAlarm(0, '');
        lightUp();
        b.textContent = '▶ Resume'; b.dataset.state = 'paused';
      } else {
        run.pausedFor += Date.now() - run.pausedAt; run.paused = false; if (run.player) run.player.resume(); if (run.frame) run.frame(); WL.keepAwake(true);
        if (usesAlarm(p) && window.WLNoise && S.settings.noise && S.settings.noise !== 'off') WLNoise.start(S.settings.noise);
        if (usesAlarm(p)) calmAlarm(Math.max(0, run.total * 1000 - elapsed() * 1000), alarmLabel(p));
        scheduleDark();
        b.textContent = '⏸ Pause'; b.dataset.state = 'playing';
      }
    };
    $('#c-save').onclick = function () {
      if (run && run.done) { if (after) { run.rec.after = after; run.rec.rated = new Date().toISOString(); } save(); WL.toast('Saved. ' + Math.max(1, Math.round(run.mins)) + ' min.'); }
      stopRun(); location.hash = '#calm';
    };
    $('#c-end').onclick = function () { saveEarly(); stopRun(); location.hash = '#calm'; };
    var pp = $('#c-pp');
    keyHandler = function (ev) {
      if (ev.key !== ' ' && ev.code !== 'Space') return;
      var tag = ev.target && ev.target.tagName;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag || '') || (ev.target && ev.target.isContentEditable)) return;
      if (pp && pp.isConnected && !pp.hidden && (pp.dataset.state === 'playing' || pp.dataset.state === 'paused')) {
        ev.preventDefault(); pp.click();
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  // ending early (✕, Android back, another tab) still counts the minutes you did, if at least half a minute
  function saveEarly() {
    if (run && !run.done && run.start && elapsed() >= 30) {
      var m = loggedMins();
      K.record(S, run.p.id, m, run.before, null, sessionTime(run.start)); save();
      WL.toast('Saved ' + Math.max(1, Math.round(m)) + ' min');
    }
  }
  function leave() {
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    pick = null;
    saveEarly(); stopRun();
  }
  /* Returning after the screen was locked: if a sit or Quiet timer already passed its end, finish cleanly without a duplicate bell. */
  document.addEventListener('visibilitychange', function () {
    // (back in the app mid-sit, WL.darkScreen shows the time first and goes dark again 10 s later)
    if (!document.hidden && run && !run.done && !run.paused && usesAlarm(run.p)) {
      var e = elapsed();
      if (e >= run.total) finish(!!(WL.native && WL.native.calmAlarm && e - run.total > 5));
    }
  });

  function route(parts, v) {
    if (v) view = v;
    leave();
    if (parts && parts[0] === 's' && practice(parts[1])) {
      var p = practice(parts[1]);
      // #calm/s/<id>/<minutes>: a length picked elsewhere (Home on a rough day) for this one session
      if (parts[2] && lengths(p).indexOf(+parts[2]) >= 0) pick = { id: p.id, m: +parts[2] };
      view.innerHTML = sessionHtml(p); wireSession(p); return;
    }
    view.innerHTML = list();
    $$('[data-goal]').forEach(function (b) { b.onclick = function () { S.settings.dailyGoal = +b.dataset.goal; save(); route([]); }; });
    $$('[data-min]').forEach(function (b) { b.onclick = function () { S.settings.minutes = +b.dataset.min; save(); route([]); }; });
    $('#cv').onclick = function () { S.settings.voice = !S.settings.voice; save(); route([]); };
    $('#ctk').onclick = function () { S.settings.tick = !S.settings.tick; save(); route([]); };
    $('#cdk').onclick = function () { S.settings.dark = S.settings.dark === false; save(); route([]); };
    $$('[data-iv]').forEach(function (b) { b.onclick = function () { S.settings.interval = +b.dataset.iv; save(); route([]); }; });
    $$('#c-noise [data-noise]').forEach(function (b) { b.onclick = function () { S.settings.noise = b.dataset.noise; save(); route([]); }; });
    $$('[data-aim]').forEach(function (b) { b.onclick = function () { S.settings.aim = b.dataset.aim; save(); route([]); }; });
    $$('[data-stage]').forEach(function (b) { b.onclick = function () { K.setStage(S, b.dataset.stage); save(); WL.toast('Your stage: ' + titleOf(K.stageOf(S))); route([]); }; });
  }

  /* A path sit on a rough day (short or broken night, low energy): offered at 10 minutes, for that sit only. */
  function roughSit(p) { return !!(p && p.path && window.WLMe && WLMe.rough && WLMe.rough() && mins(p) > 10 && lengths(p).indexOf(10) >= 0); }
  function card() {
    var t = K.today(S), sug = practice(K.suggest(S, null, sopts()));
    // not answered yet: the same one-tap question as on Calm (he may never open the Calm tab first); after the done card
    if (!S.settings.aim && !t.done) return '<div class="meta ui">Calm</div><h3>What do you want from Calm?</h3><p class="meta ui">Short practices for stress and sleep, or meditation as a daily training of the mind, step by step.</p>' +
      '<div class="chips ui" id="c-aim-home">' + aimChips() + '</div><div class="row ui"><a class="btn" href="#calm">Calm</a></div>';
    if (t.done) return '<div class="meta ui">Calm</div><h3>✓ Done for today</h3><p class="meta ui">' + esc(titleOf(t.ids[0])) + (t.count > 1 ? ' and ' + (t.count - 1) + ' more' : '') + ' · ' + Math.max(1, t.mins) + ' of ' + t.goal + ' min. Today’s goal is done.</p>' +
      '<div class="row ui"><a class="btn" href="#calm">Calm</a></div>';
    // a sit on a rough day (short night, broken night, low energy): 10 minutes, for that sit only
    var short = roughSit(sug);
    return '<div class="meta ui">' + (t.any ? 'Calm · ' + Math.max(1, t.mins) + ' of ' + t.goal + ' min today' : 'Calm · today’s practice (goal ' + t.goal + ' min)') + '</div><h3>' + esc(sug.title) + ' · ' + (short ? 10 : mins(sug)) + ' min</h3>' +
      (short ? '<p class="meta ui" id="c-card-rough">Short night: a 10-minute sit counts just as much today.</p>' : '<p class="meta ui">' + esc(K.advice(S)) + '</p>') +
      '<div class="row ui"><a class="btn primary" href="#calm/s/' + sug.id + (short ? '/10' : '') + '">Begin</a><a class="btn" href="#calm">All practices</a></div>';
  }

  function wireCard(el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('#c-aim-home [data-aim]'); if (!b) return;
      S.settings.aim = b.dataset.aim; save();
      el.innerHTML = card(); if (WL.refreshToday) WL.refreshToday();
      WL.toast(b.dataset.aim === 'train' ? 'Calm: the meditation path, one sit a day.' : 'Calm: short practices for stress and sleep.');
    });
  }

  WL.register({
    id: 'calm', title: 'Calm', short: 'Calm', icon: '○', nav: true, storageKeys: [store.key],
    route: route, leave: leave, card: card, wireCard: wireCard,
    week: function () {
      var st = K.stats(S); if (!st.weekDays) return '';
      var w = K.pathWeek(S), pw = w.sits ? K.pathWhen(S) : null;
      var sits = w.sits ? '; ' + w.sits + ' sit' + (w.sits === 1 ? '' : 's') + ' on the meditation path' + (S.settings.aim === 'train' ? ' (stage ' + K.pathStatus(S).n + ': ' + titleOf(K.stageOf(S)) + ')' : '') + (pw ? ', steadiest ' + pw.bestIn : '') : '';
      return st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') + ' of calm (' + st.weekMins + ' min)' + sits;
    },
    today: function () {
      var t = K.today(S);
      if (S.settings.aim === 'train') { // training the mind: the sit is the thing, not the daily minutes
        var td = K.iso(new Date()), sat = S.sessions.filter(function (x) { return x.date === td && K.PATH.indexOf(x.id) >= 0; });
        if (sat.length) {
          var m = sat.reduce(function (a, x) { return a + (x.mins || 0); }, 0), last = sat[sat.length - 1];
          return { label: 'Calm: sat ' + Math.max(1, Math.round(m)) + ' min (' + titleOf(last.id) + ')', done: true, href: '#calm' };
        }
        var sp = practice(K.suggest(S, null, sopts()));
        if (sp && sp.path && !t.done) {
          var rough = roughSit(sp); // same as the Calm card: on a rough day, 10 minutes for this sit
          return { label: 'Calm: ' + (rough ? 10 : mins(sp)) + '-min sit, ' + sp.title.toLowerCase(), done: false, href: '#calm/s/' + sp.id + (rough ? '/10' : '') };
        }
      }
      if (t.done) return { label: 'Calm: done (' + Math.max(1, t.mins) + ' min)', done: true, href: '#calm' };
      if (t.any) return { label: 'Calm: ' + Math.max(1, t.mins) + ' of ' + t.goal + ' min today', done: false, href: '#calm' };
      var sug = practice(K.suggest(S, null, sopts()));
      return { label: 'Calm: ' + sug.title.toLowerCase() + ' (' + mins(sug) + ' min · goal ' + t.goal + ' min)', done: false, href: '#calm/s/' + sug.id };
    },
    pause: function () { var b = $('#c-pp'); if (b && b.dataset.state === 'playing') b.click(); },
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
