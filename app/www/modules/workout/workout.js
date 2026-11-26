/* Workout module: #workout (today's session with set logging and a rest timer), #workout/history, #workout/settings. */
(function () {
  'use strict';
  var W = window.WorkoutCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.workout.v1', W.defaults);
  var S = store.load(), view = null, dayChoice = null, forceAhead = false, chartEx = '', chartMetric = 'best';
  var rest = null, restTimer = null, restHideTimer = null, clockTimer = null; // rest = {end, label, next, set}
  function save() { store.save(S); }

  function fmt(secs) { secs = Math.max(0, Math.round(secs)); var m = Math.floor(secs / 60), s = secs % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function unit(e) { return e.track === 'sec' ? 'sec' : e.track === 'min' ? 'min' : 'reps'; }

  /* the phone's alarm for the rest's end (beeps with the screen off); the page beeps itself when on screen */
  function alarm() { var n = WL.native; if (n && n.restAlarm) try { n.restAlarm(rest ? Math.max(0, rest.end - Date.now()) : 0, rest ? rest.label : ''); } catch (e) {} }

  var beepCtx = null;
  function beep() {
    try {
      beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (beepCtx.state === 'suspended' && beepCtx.resume) beepCtx.resume();
      var ctx = beepCtx, t = ctx.currentTime;
      for (var i = 0; i < 2; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.28;
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.25, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
        o.start(s); o.stop(s + 0.24);
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  function subnav(tab) {
    return '<div class="subnav ui">' + [['', 'Today'], ['history', 'Progress'], ['settings', 'Setup']].map(function (t) {
      return '<a href="#workout' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }

  /* Logged for the day picked on Home ("Log for an earlier day"), or now. */
  function now() { return WL.logNow ? WL.logNow() : new Date(); }

  function weekDots(when) {
    var st = W.weekStats(S, when), h = '<span class="dots" aria-label="' + st.thisWeek + ' of ' + st.target + ' workouts this week">';
    for (var i = 0; i < Math.max(st.target, st.thisWeek); i++) h += '<span class="dot' + (i < st.thisWeek ? ' on' : '') + '"></span>';
    return h + '</span>';
  }

  function today() {
    var open = W.openSession(S, now()), fin = !open && W.finishedToday(S, now());
    var day = open ? open.day : (dayChoice || W.nextDay(S, now())), plan = W.PROGRAM[day];
    var M = window.WLMe, co = W.coach(S, now());
    if (fin && !forceAhead) {
      var h0 = subnav('') + '<div class="row ui"><h1 class="grow" style="margin:0">Done for today \u2713</h1>' + weekDots(now()) + '</div>';
      h0 += '<p class="meta ui">' + esc(co) + (M ? ' ' + M.fitLink('workout', 'coach:' + fin.day, co) : '') + '</p>';
      if (M) h0 += M.planLine('workout');
      if (M) h0 += M.askHtml('workout', fin.id, 'Workout done \u2713 Quick questions (optional): they shape your next workouts');
      h0 += '<div class="card done-banner ui" id="wo-done-today"><p style="margin-bottom:6px"><b>Finished ' + esc(W.PROGRAM[fin.day].title) + '</b> (' + fin.sets.length + ' set' + (fin.sets.length === 1 ? '' : 's') + '). Next time: <b>' + esc(plan.title) + '</b>.</p>' +
        '<div class="row"><button id="wo-reopen" data-id="' + esc(fin.id) + '">Carry on with it</button><button class="link" id="wo-ahead">Start ' + esc(plan.title) + ' anyway</button></div></div>';
      return h0;
    }
    var h = subnav('') + '<div class="row ui"><h1 class="grow" style="margin:0">' + esc(plan.title) + '</h1>' + weekDots(now()) + '</div>';
    h += '<p class="meta ui">' + esc(co) + (M ? ' ' + M.fitLink('workout', 'coach:' + day, co) : '') + '</p>';
    if (M && M.painNote && M.painNote()) {
      var pn = 'Pain came up after two workouts lately. Go lighter on the moves that hurt and check your form (the “How” notes). If it keeps up or is sharp, see a doctor or physio.';
      h += '<p class="gentle ui" id="wo-pain">' + esc(pn) + ' ' + M.fitLink('workout', 'guide:pain', pn) + '</p>';
    }
    if (M) h += M.planLine('workout');
    var dIso = W.iso(now()), worked = S.sessions.some(function (x) { return x.date === dIso && x.sets && x.sets.length; });
    if (W.askSore(S, now())) h += '<div class="card ui" id="wo-sore"><div class="meta">Sore from last time? (optional)</div><div class="chips">' + W.SORE_LEVELS.map(function (l) {
      return '<button class="chip" data-sore="' + esc(l) + '">' + esc(l) + '</button>'; }).join('') + '</div></div>';
    if (!open && !worked) {
      var rw = W.restOn(S, dIso);
      h += rw ? '<div class="card ui" id="wo-rest"><div class="row"><span class="grow">Rest day logged: <b>' + esc(rw) + '</b></span><button class="link" id="wo-rest-undo">Undo</button></div></div>'
        : '<details class="ui" id="wo-rest"><summary class="meta">Not training today?</summary><div class="chips" style="margin-top:6px">' + W.REST_REASONS.map(function (r) {
          return '<button class="chip" data-rest="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div><p class="meta">It’s kept as a rest day with your reason, not a missed workout.</p></details>';
    }
    if (!open) h += '<div class="chips ui" style="margin-bottom:10px">' + W.ORDER.map(function (d) {
      return '<button class="chip" data-day="' + d + '" aria-pressed="' + (d === day) + '">' + W.PROGRAM[d].title.replace('Full body ', 'Day ') + '</button>';
    }).join('') + '</div>';
    if (W.askDumbbells(S, new Date())) h += '<div class="card ui" id="wo-db"><p><b>Got the adjustable dumbbells?</b> Then the app switches from “make it harder” (slower, pauses) to adding weight: when you hit the top of the range on every set, go up 5 lb (2.5 lb for small muscles) and start again at the bottom.</p>' +
      '<div class="row"><button class="primary" id="wo-db-yes">Yes, switch</button><button id="wo-db-no">Not yet</button></div></div>';
    if (!open && W.offerTwo(S, now())) h += '<div class="card ui" id="wo-two"><p><b>Busy weeks lately.</b> Would 2 workouts a week fit better right now? Full-body days still work every muscle twice a week. You can change it back in Setup.</p>' +
      '<div class="row"><button class="primary" id="wo-two-yes">Yes, 2 a week</button><button id="wo-two-no">Not now</button></div></div>';
    h += '<p class="meta ui">Warm up 2 minutes first: march on the spot, arm circles, 10 easy squats. Letters are supersets: one set of each, then rest.</p>';
    var groupSeen = {};
    plan.items.forEach(function (it, idx) {
      var e = W.EX[it.ex], lp = W.last(S, it.ex, open && open.id);
      var done = open ? open.sets.filter(function (x) { return x.i === idx; }) : [];
      var full = done.length >= it.sets;
      var w = S.weights[it.ex] != null ? S.weights[it.ex] : lp && lp.w != null ? lp.w : (e.track === 'reps' && e.load ? 10 : '');
      var suggest = done.length ? done[done.length - 1].val : lp && lp.sets[Math.min(done.length, lp.sets.length - 1)] != null ? lp.sets[Math.min(done.length, lp.sets.length - 1)] : e.range[0];
      var head = it.group !== 'Z' && !groupSeen[it.group] ? '<div class="sslabel ui">Superset ' + it.group + '</div>' : '';
      groupSeen[it.group] = 1;
      h += head + '<div class="card ex' + (full ? ' ex-done' : '') + '" data-i="' + idx + '" id="ex-' + idx + '">' +
        '<div class="row"><h3 class="grow" style="margin:0">' + esc(it.ex) + (it.optional ? ' <span class="meta ui">optional</span>' : '') + '</h3>' +
        '<span class="setchips ui">' + Array.apply(null, Array(Math.max(it.sets, done.length))).map(function (_, k) {
          return done[k] ? '<button class="sc on" data-edit="' + k + '" aria-label="Set ' + (k + 1) + ': ' + done[k].val + '. Tap to fix">' + done[k].val + '</button>' : '<span class="sc"></span>';
        }).join('') + '</span></div><div class="editrow ui" hidden></div>' +
        '<p class="meta ui adv">' + esc(W.advice(S, it, lp)) + (done.length ? ' <span class="meta">Tap a set’s number to fix it.</span>' : '') + '</p>' +
        '<details class="ui"><summary class="meta">How</summary><p class="meta">' + esc(e.cue || '') + (S.next[it.ex] ? ' Now doing: ' + esc(S.next[it.ex]) + '.' : '') + (window.WLMe ? ' ' + WLMe.fitLink('workout', 'ex:' + it.ex, it.ex + ': ' + (e.cue || '')) : '') + '</p></details>' +
        (full ? '' : '<div class="row ui logrow"><button class="step" data-d="-1" aria-label="One less">−</button><input type="number" inputmode="numeric" class="val" value="' + esc(suggest) + '" aria-label="' + esc(unit(e)) + '"><button class="step" data-d="1" aria-label="One more">+</button><span class="meta">' + unit(e) + '</span>' +
          (e.track === 'reps' && (e.load || w !== '') ? '<input type="number" inputmode="decimal" class="wt" value="' + esc(w) + '" aria-label="Weight in lb"><span class="meta">lb</span>' : '') +
          '<button class="primary logbtn">Log set ' + (done.length + 1) + '</button></div>') + '</div>';
    });
    var fin = !open && W.finishedToday(S, now());
    if (fin) h = h.replace('</p>', function () { return '</p>' + (M ? M.askHtml('workout', fin.id, 'Workout done ✓ Quick questions (optional): they shape your next workouts') : '') + '<div class="card ui"><div class="row"><span class="grow">Finished ' + esc(W.PROGRAM[fin.day].title) + ' (' + fin.sets.length + ' sets) by mistake?</span><button id="wo-reopen" data-id="' + esc(fin.id) + '">Carry on with it</button></div></div>'; });
    h += '<div class="row ui" style="margin:8px 0 90px">' + (open ? '<button id="wo-undo">Undo last set</button><span class="grow"></span><button class="primary" id="wo-finish">Finish workout</button>' : '') + '</div>';
    h += '<div id="restbar" class="restbar ui" hidden><div class="grow"><div id="rest-label" class="meta"></div><div id="rest-time" class="rest-time">0:00</div></div><button id="rest-plus">+15 s</button><button id="rest-skip">Skip</button></div>';
    h += open && !(WL.logDay && WL.logDay()) ? '<div class="sessclock ui meta" id="sessclock"></div>' : '';
    return h;
  }

  function showRest() {
    var bar = $('#restbar'); if (!bar) return;
    clearInterval(restTimer);
    clearTimeout(restHideTimer); restHideTimer = null;
    if (!rest) { bar.hidden = true; return; }
    bar.hidden = false;
    $('#rest-label').textContent = rest.label;
    var tick = function () {
      if (!rest) { clearInterval(restTimer); return; }
      var left = (rest.end - Date.now()) / 1000;
      if (left <= 0) {
        // (back after the screen was off: the phone's alarm already beeped, don't beep again)
        clearInterval(restTimer); if (left > -3) beep();
        $('#rest-time').textContent = 'Go';
        var nx = rest.next != null ? $('#ex-' + rest.next) : null;
        rest = null;
        restHideTimer = setTimeout(function () { restHideTimer = null; var b = $('#restbar'); if (b && !rest) b.hidden = true; }, 2500);
        if (nx) nx.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      $('#rest-time').textContent = fmt(left);
    };
    tick(); if (rest) restTimer = setInterval(tick, 250);
  }

  function clock() {
    clearInterval(clockTimer);
    var open = W.openSession(S, now()), el = $('#sessclock'); if (!open || !el) return;
    var t = function () { var e = $('#sessclock'); if (e) e.textContent = 'Session ' + fmt((Date.now() - new Date(open.start).getTime()) / 1000); };
    t(); clockTimer = setInterval(t, 1000);
  }

  function renderToday() { view.innerHTML = today(); wireToday(); showRest(); clock(); }

  function wireToday() {
    $$('[data-day]').forEach(function (b) { b.onclick = function () { dayChoice = b.dataset.day; renderToday(); }; });
    var dy = $('#wo-db-yes'); if (dy) dy.onclick = function () { S.equipment = 'adjustable'; save(); WL.toast('Switched to adjustable dumbbells'); renderToday(); };
    $$('[data-rest]').forEach(function (b) { b.onclick = function () { W.logRest(S, W.iso(now()), b.dataset.rest, new Date()); save(); renderToday(); if (WL.refreshToday) WL.refreshToday(); }; });
    $$('[data-sore]').forEach(function (b) { b.onclick = function () { W.setSore(S, W.iso(now()), b.dataset.sore, new Date()); save(); renderToday(); }; });
    var ru = $('#wo-rest-undo'); if (ru) ru.onclick = function () { W.clearRest(S, W.iso(now())); save(); renderToday(); var rs = $('#wo-rest summary'); if (rs && rs.focus) rs.focus(); if (WL.refreshToday) WL.refreshToday(); };
    var ty = $('#wo-two-yes'); if (ty) ty.onclick = function () { S.target = 2; save(); WL.toast('2 workouts a week'); renderToday(); if (WL.refreshToday) WL.refreshToday(); };
    var tn = $('#wo-two-no'); if (tn) tn.onclick = function () { S.twoAsked = W.iso(new Date()); save(); renderToday(); };
    var dn = $('#wo-db-no'); if (dn) dn.onclick = function () { S.dbAsked = W.iso(new Date()); save(); renderToday(); };
    $$('.ex').forEach(function (card) {
      var idx = +card.dataset.i, val = card.querySelector('.val');
      $$('.step', card).forEach(function (b) { b.onclick = function () { val.value = Math.max(0, (+val.value || 0) + +b.dataset.d); }; });
      var lb = card.querySelector('.logbtn');
      if (lb) lb.onclick = function (ev) {
        if (ev && ev.detail > 1) return; // the second tap of a double-tap would log the next set too
        var v = +val.value; if (!(v > 0)) { val.focus(); return; }
        var day = W.openSession(S, now()) ? W.openSession(S, now()).day : (dayChoice || W.nextDay(S, now()));
        var wt = card.querySelector('.wt');
        var r = W.logSet(S, day, idx, v, wt ? wt.value : null, now());
        save();
        rest = r.rest.secs ? { end: Date.now() + r.rest.secs * 1000, label: r.rest.label, next: r.rest.next } : null;
        alarm();
        var y = window.scrollY;
        renderToday();
        window.scrollTo(0, y);
        if (!rest) { var nxt = $('.ex:not(.ex-done)'); if (nxt) nxt.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      };
    });
    // tap a logged set to fix a mistyped number (or remove it)
    $$('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var card = b.closest('.ex'), idx = +card.dataset.i, k = +b.dataset.edit, row = card.querySelector('.editrow');
        var open = W.openSession(S, now()); if (!open) return;
        var set = open.sets.filter(function (x) { return x.i === idx; })[k]; if (!set) return;
        var exDef = W.EX[set.ex], showWt = set.w != null || (exDef && exDef.track === 'reps' && exDef.load);
        row.hidden = false;
        row.innerHTML = '<div class="row"><span class="meta">Set ' + (k + 1) + '</span><input type="number" inputmode="numeric" class="ed-val" value="' + esc(set.val) + '" aria-label="Fixed number">' +
          (showWt ? '<input type="number" inputmode="decimal" class="ed-wt" value="' + esc(set.w != null ? set.w : '') + '" aria-label="Weight in lb"><span class="meta">lb</span>' : '') +
          '<button class="primary ed-save">Save</button><button class="ed-del">Remove</button><button class="link ed-cancel">Cancel</button></div>';
        var v = row.querySelector('.ed-val'); v.focus(); v.select();
        var wt = row.querySelector('.ed-wt');
        var y = function () { var sy = window.scrollY; renderToday(); window.scrollTo(0, sy); };
        var doSave = function () {
          if (!(+v.value > 0)) { v.focus(); return; }
          W.editSet(S, idx, k, v.value, wt ? wt.value : undefined, now()); save(); y(); WL.toast('Set ' + (k + 1) + ' fixed: ' + (+v.value));
        };
        var doCancel = function () {
          row.onkeydown = null;
          row.hidden = true; row.innerHTML = '';
          if (b && b.isConnected && b.focus) try { b.focus(); } catch (e) {}
        };
        row.querySelector('.ed-save').onclick = doSave;
        row.querySelector('.ed-del').onclick = function () { W.editSet(S, idx, k, 0, undefined, now()); save(); y(); WL.toast('Set ' + (k + 1) + ' removed'); };
        row.querySelector('.ed-cancel').onclick = doCancel;
        row.onkeydown = function (ev) {
          if (ev.key === 'Escape') { ev.preventDefault(); doCancel(); }
        };
        [v, wt].forEach(function (inp) {
          if (!inp) return;
          inp.onkeydown = function (ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
          };
        });
      };
    });
    var ro = $('#wo-reopen'); if (ro) ro.onclick = function () { forceAhead = false; W.reopen(S, ro.dataset.id); save(); dayChoice = null; renderToday(); WL.toast('Carrying on: log the next set'); };
    var ah = $('#wo-ahead'); if (ah) ah.onclick = function () { forceAhead = true; renderToday(); };
    var u = $('#wo-undo'); if (u) u.onclick = function () { var s = W.undoSet(S, now()); save(); rest = null; alarm(); renderToday(); if (s) WL.toast('Removed ' + s.ex + ' set ' + s.n); };
    var f = $('#wo-finish'); if (f) f.onclick = function () {
      var open = W.openSession(S, now()), n = open ? open.sets.length : 0;
      W.endSession(S, now()); save(); rest = null; alarm(); dayChoice = null; forceAhead = false;
      WL.toast(n ? 'Workout saved: ' + n + ' sets. Well done.' : 'Nothing logged');
      renderToday(); window.scrollTo(0, 0);
    };
    var rs = $('#rest-skip'); if (rs) rs.onclick = function () { rest = null; alarm(); showRest(); };
    var rp = $('#rest-plus'); if (rp) rp.onclick = function () { if (rest) { rest.end += 15000; alarm(); } };
  }

  function sparkline(vals) {
    if (vals.length < 2) return '';
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), w = 120, hgt = 28;
    var pts = vals.map(function (v, i) { return (i * w / (vals.length - 1)).toFixed(1) + ',' + (hgt - 2 - (max === min ? hgt / 2 : (v - min) / (max - min) * (hgt - 4))).toFixed(1); }).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + hgt + '" width="' + w + '" height="' + hgt + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  }

  /* Sets per area this week (last week in brackets) and one line of advice. */
  function volume() {
    var v = W.weekVolume(S), adv = W.volumeAdvice(S);
    if (!adv) return '';
    return '<p class="meta" id="wo-volume" style="margin:.4em 0 0">Sets this week (last week): ' + W.AREAS.map(function (k) {
      return k + ' ' + v.thisWeek[k] + ' (' + v.lastWeek[k] + ')';
    }).join(' · ') + '</p><p class="gentle" style="margin:.3em 0 0">' + esc(adv) + (window.WLMe ? ' ' + WLMe.fitLink('workout', 'balance', adv) : '') + '</p>';
  }

  /* 4 weeks x 7 days: filled = workout, outlined = a rest day he chose (reason in the label), faint = nothing. */
  function monthRow() {
    var days = W.fourWeeks(S, new Date());
    if (!days.some(function (d) { return d.kind === 'workout' || d.kind === 'rest'; })) return '';
    var name = function (iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };
    var h = '<div id="wo-4w" class="wk4"><div class="wk4-row wk4-head meta" aria-hidden="true">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>';
    for (var w = 0; w < 4; w++) {
      h += '<div class="wk4-row" role="list" aria-label="' + (w === 3 ? 'This week' : w === 2 ? 'Last week' : (3 - w) + ' weeks ago') + '">';
      days.slice(w * 7, w * 7 + 7).forEach(function (d) {
        var label = name(d.date) + ': ' + (d.kind === 'workout' ? 'workout' : d.kind === 'rest' ? 'rest day (' + d.why.toLowerCase() + ')' : d.kind === 'future' ? 'still to come' : 'nothing logged');
        h += '<span role="listitem" class="wk4-d wk4-' + d.kind + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + (d.kind === 'rest' ? 'R' : '') + '</span>';
      });
      h += '</div>';
    }
    return h + '<p class="meta" style="margin:.3em 0 0"><span class="wk4-d wk4-workout wk4-key" aria-hidden="true"></span> workout · <span class="wk4-d wk4-rest wk4-key" aria-hidden="true">R</span> rest day you chose</p></div>';
  }

  function shortDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    var ms = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (ms[+p[1] - 1] || '') + ' ' + (+p[2]);
  }

  /* 8-week bar chart of workouts per week with a dashed goal line (WHO/CSEP adult guideline: 2+ strength days/week). */
  function weeklyChartHtml() {
    var trend = W.weeklyTrend(S, new Date(), 8);
    if (!trend.some(function (x) { return x.workouts > 0; })) return '';
    var target = W.targetOf(S);
    var maxW = Math.max.apply(null, trend.map(function (x) { return x.workouts; }).concat([target + 1, 4]));
    var left = 24, right = 312, top = 16, bottom = 92, plotW = right - left, plotH = bottom - top;
    var step = plotW / trend.length, barW = Math.min(24, Math.floor(step * 0.62));
    var yAt = function (v) { return bottom - (v / maxW) * plotH; };
    var svg = '<svg class="wo-svg" id="wo-weekly-chart" viewBox="0 0 320 116" role="img" aria-label="Workouts per week over the last 8 weeks">';
    [0, target, maxW].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (v) {
      var y = yAt(v).toFixed(1);
      svg += '<line x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>';
      svg += '<text x="' + (left - 5) + '" y="' + (+y + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    });
    var ty = yAt(target).toFixed(1);
    svg += '<line x1="' + left + '" y1="' + ty + '" x2="' + right + '" y2="' + ty + '" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="4 3"/>';
    svg += '<text class="wo-ref-lbl" x="' + right + '" y="' + Math.max(10, +ty - 4).toFixed(1) + '" text-anchor="end">Goal: ' + target + '/wk</text>';
    trend.forEach(function (wk, i) {
      var cx = left + step * (i + 0.5), x = (cx - barW / 2).toFixed(1);
      var bh = wk.workouts ? Math.max(4, (wk.workouts / maxW) * plotH) : 2;
      var y = (bottom - bh).toFixed(1);
      svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + bh.toFixed(1) + '" rx="4" fill="var(--accent)"' + (wk.workouts ? '' : ' opacity="0.22"') + '><title>' + esc(wk.label + ': ' + wk.workouts + ' workout' + (wk.workouts === 1 ? '' : 's') + ', ' + wk.sets + ' sets') + '</title></rect>';
      if (wk.workouts) svg += '<text class="wo-val" x="' + cx.toFixed(1) + '" y="' + Math.max(11, +y - 4).toFixed(1) + '" text-anchor="middle">' + wk.workouts + '</text>';
      if (i === 0 || i === 3 || i === 5 || i === trend.length - 1) {
        svg += '<text x="' + cx.toFixed(1) + '" y="108" text-anchor="middle">' + esc(i === trend.length - 1 ? 'This wk' : wk.label) + '</text>';
      }
    });
    svg += '</svg><p class="meta" style="margin:.3em 0 0">Last 8 weeks · WHO/CSEP adult guideline: 2+ strength days/week.</p>';
    return svg;
  }

  /* Interactive per-exercise SVG progress graph with an age-group average or target reference line. */
  function exerciseChartHtml(rows) {
    if (!rows.length) return '';
    if (!chartEx || !rows.some(function (r) { return r.n === chartEx; })) {
      var pref = rows.filter(function (r) { return r.n === 'Pushups'; })[0] ||
        rows.filter(function (r) { return r.n === 'Plank'; })[0] ||
        rows.slice().sort(function (a, b) { return b.p.length - a.p.length; })[0];
      chartEx = pref.n;
    }
    var ex = chartEx, e = W.EX[ex], u = unit(e);
    var series = W.exerciseSeries(S, ex);
    var hasWeight = series.some(function (p) { return p.w > 0; });
    var metric = hasWeight && chartMetric === 'volume' ? 'volume' : 'best';
    var bm = metric === 'best' ? W.benchmark(ex, S.age) : null;
    var vals = series.map(function (p) { return metric === 'volume' ? p.volume : p.bestVal; });
    var rawMax = Math.max.apply(null, vals.concat(bm ? [bm.high || bm.avg, bm.avg] : [1]));
    var yMax = Math.max(4, Math.ceil(rawMax * 1.15));
    var left = 36, right = 308, top = 18, bottom = 134, plotW = right - left, plotH = bottom - top;
    var xAt = function (i) { return series.length === 1 ? left + plotW / 2 : left + (i * plotW / (series.length - 1)); };
    var yAt = function (v) { return bottom - (v / yMax) * plotH; };
    var svg = '<svg class="wo-svg" id="wo-ex-svg" viewBox="0 0 320 158" role="img" aria-label="' + esc(ex) + ' progress graph">';
    [0, Math.round(yMax / 2), yMax].forEach(function (v) {
      var y = yAt(v).toFixed(1);
      svg += '<line x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>';
      svg += '<text x="' + (left - 5) + '" y="' + (+y + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
    });
    if (bm) {
      if (bm.kind === 'age' && bm.low != null && bm.high != null) {
        var yHi = yAt(bm.high), yLo = yAt(bm.low);
        svg += '<rect x="' + left + '" y="' + yHi.toFixed(1) + '" width="' + plotW + '" height="' + Math.max(2, yLo - yHi).toFixed(1) + '" fill="var(--good)" opacity="0.12"/>';
      }
      var by = yAt(bm.avg).toFixed(1);
      svg += '<line x1="' + left + '" y1="' + by + '" x2="' + right + '" y2="' + by + '" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="5 3"/>';
      var refLbl = bm.kind === 'age' ? 'Age ' + bm.bracket + ' avg: ' + bm.avg + ' ' + bm.unit : 'Target: ' + bm.avg + ' ' + bm.unit;
      svg += '<text class="wo-ref-lbl" x="' + right + '" y="' + Math.max(11, +by - 4).toFixed(1) + '" text-anchor="end">' + esc(refLbl) + '</text>';
    }
    if (series.length >= 2) {
      var pts = vals.map(function (v, i) { return xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1); });
      var area = left + ',' + bottom + ' ' + pts.join(' ') + ' ' + right + ',' + bottom;
      svg += '<polygon points="' + area + '" fill="var(--accent)" opacity="0.14"/>';
      svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    vals.forEach(function (v, i) {
      var cx = xAt(i).toFixed(1), cy = yAt(v).toFixed(1), last = i === vals.length - 1;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (last ? 5 : 3.5) + '" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5"><title>' + esc(shortDate(series[i].date) + ': ' + v + (metric === 'volume' ? ' lb·reps' : ' ' + u)) + '</title></circle>';
      if (last) {
        var anchor = series.length === 1 ? 'middle' : 'end';
        svg += '<text class="wo-val" x="' + cx + '" y="' + Math.max(12, +cy - 8).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(v + (metric === 'volume' ? '' : ' ' + u)) + '</text>';
      }
    });
    if (series.length === 1) {
      svg += '<text x="' + xAt(0).toFixed(1) + '" y="150" text-anchor="middle">' + esc(shortDate(series[0].date)) + '</text>';
    } else {
      svg += '<text x="' + left + '" y="150" text-anchor="start">' + esc(shortDate(series[0].date)) + '</text>';
      if (series.length >= 3) {
        var mid = Math.floor(series.length / 2);
        svg += '<text x="' + xAt(mid).toFixed(1) + '" y="150" text-anchor="middle">' + esc(shortDate(series[mid].date)) + '</text>';
      }
      svg += '<text x="' + right + '" y="150" text-anchor="end">' + esc(shortDate(series[series.length - 1].date)) + '</text>';
    }
    svg += '</svg>';
    var latest = series[series.length - 1], best = W.bestSet(S, ex);
    var summary = '<p class="meta" style="margin:.45em 0 0">Best set: <b>' + best.val + ' ' + u + (best.w ? ' @ ' + best.w + ' lb' : '') + '</b> · Latest (' + esc(shortDate(latest.date)) + '): ' + latest.sets.join('/') + (latest.w ? ' @ ' + latest.w + ' lb' : '') + '.</p>';
    var note = '';
    if (bm && bm.kind === 'age') {
      note = '<p class="meta" id="wo-bench-note" style="margin:.25em 0 0">Typical ' + esc(bm.bracket) + ' average: ' + bm.low + '–' + bm.high + ' ' + esc(bm.unit) + ' (midpoint ' + bm.avg + ', strong ' + bm.good + '+) · ' + esc(bm.source) + '. General guidance, not medical advice.</p>';
    } else if (!S.age) {
      note = '<p class="meta" id="wo-bench-note" style="margin:.25em 0 0"><a class="link" href="#workout/settings">Set your age in Setup</a> to show an average for your age group on Pushups, Plank and Walk.</p>';
    } else if (e.range) {
      note = '<p class="meta" id="wo-bench-note" style="margin:.25em 0 0">Program set target: ' + e.range[0] + '–' + e.range[1] + ' ' + esc(u) + '. Age-group averages are shown on Pushups, Plank and Walk.</p>';
    }
    return '<div class="card ui" id="wo-chart-card"><div class="row" style="margin-bottom:8px"><h3 class="grow" style="margin:0">Progress graph</h3></div>' +
      '<label class="sr" for="wo-chart-ex">Choose exercise to graph</label><select id="wo-chart-ex">' +
      rows.map(function (r) { return '<option value="' + esc(r.n) + '"' + (r.n === ex ? ' selected' : '') + '>' + esc(r.n) + ' (' + r.p.length + ')</option>'; }).join('') +
      '</select>' +
      (hasWeight ? '<div class="chips" style="margin-top:8px"><button class="chip" data-wo-metric="best" aria-pressed="' + (metric === 'best') + '">Best set (' + esc(u) + ')</button><button class="chip" data-wo-metric="volume" aria-pressed="' + (metric === 'volume') + '">Total volume (reps × lb)</button></div>' : '') +
      svg + summary + note + '</div>';
  }

  function history() {
    var st = W.weekStats(S);
    var h = subnav('history') + '<h1>Progress</h1><div class="card ui"><div class="row"><div class="grow"><b>' + st.thisWeek + '</b> of ' + st.target + ' this week</div>' + weekDots() + '</div>' +
      '<p class="meta" style="margin:.4em 0 0">' + (st.streak ? st.streak + ' week' + (st.streak > 1 ? 's' : '') + ' in a row with 2+ workouts. ' : '') + st.total + ' workout days logged in all.</p>' + weeklyChartHtml() + monthRow() + volume() + '</div>';
    var names = Object.keys(W.EX);
    var rows = names.map(function (n) { return { n: n, p: W.performances(S, n), area: W.AREA[n] || 'other' }; }).filter(function (x) { return x.p.length; });
    if (!rows.length) return h + '<p class="meta ui">Log a workout, or import your sheet under Setup, and your progress shows here.</p>';
    h += '<div id="wo-chart-wrap">' + exerciseChartHtml(rows) + '</div>';
    var areas = W.AREAS.concat('other').filter(function (a) { return rows.some(function (x) { return x.area === a; }); });
    if (areas.length >= 2) {
      var label = function (a) { return a === 'other' ? 'Walk' : a.charAt(0).toUpperCase() + a.slice(1); };
      h += '<div class="chips ui" id="wo-areas" role="group" aria-label="Filter by area" style="margin-bottom:12px">' +
        '<button class="chip" data-area="" aria-pressed="true">All</button>' +
        areas.map(function (a) { return '<button class="chip" data-area="' + a + '" aria-pressed="false">' + label(a) + '</button>'; }).join('') + '</div>';
    }
    rows.forEach(function (x) {
      var tot = x.p.map(function (p) { return p.sets.reduce(function (a, b) { return a + +b; }, 0) * (p.w || 1); });
      var best = W.bestSet(S, x.n);
      var lp = x.p[x.p.length - 1], e = W.EX[x.n];
      h += '<div class="card wo-ex' + (x.n === chartEx ? ' wo-selected' : '') + '" data-area="' + esc(x.area) + '" data-ex="' + esc(x.n) + '"><div class="row"><h3 class="grow" style="margin:0">' + esc(x.n) + '</h3>' + sparkline(tot.slice(-12)) + '</div>' +
        '<p class="meta ui" style="margin:.3em 0 0">Last ' + esc(lp.date) + ': ' + lp.sets.join('/') + (lp.w ? ' @ ' + lp.w + ' lb' : '') + ' ' + unit(e) +
        (best ? ' · best set ' + best.val + (best.w ? ' @ ' + best.w + ' lb' : '') : '') + ' · ' + x.p.length + ' times</p>' +
        '<div class="row ui" style="margin-top:2px"><button class="link" data-pick-ex="' + esc(x.n) + '">Show on graph</button></div></div>';
    });
    return h;
  }

  function wireHistory() {
    var rows = Object.keys(W.EX).map(function (n) { return { n: n, p: W.performances(S, n), area: W.AREA[n] || 'other' }; }).filter(function (x) { return x.p.length; });
    function redrawChart() {
      var wrap = $('#wo-chart-wrap'); if (!wrap) return;
      wrap.innerHTML = exerciseChartHtml(rows);
      $$('.wo-ex').forEach(function (c) { c.classList.toggle('wo-selected', c.dataset.ex === chartEx); });
      wireChartControls();
    }
    function wireChartControls() {
      var sel = $('#wo-chart-ex');
      if (sel) sel.onchange = function () { chartEx = sel.value; redrawChart(); };
      $$('[data-wo-metric]').forEach(function (b) { b.onclick = function () { chartMetric = b.dataset.woMetric; redrawChart(); }; });
    }
    wireChartControls();
    $$('[data-pick-ex]').forEach(function (b) {
      b.onclick = function () {
        chartEx = b.dataset.pickEx;
        redrawChart();
        var card = $('#wo-chart-card'); if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    $$('#wo-areas [data-area]').forEach(function (b) {
      b.onclick = function () {
        var area = b.dataset.area;
        $$('#wo-areas [data-area]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        $$('.wo-ex').forEach(function (c) { c.hidden = !!area && c.dataset.area !== area; });
      };
    });
  }

  function settings() {
    var h = subnav('settings') + '<h1>Setup</h1><div class="card ui"><h3>Dumbbells</h3><div class="chips">' +
      [['fixed10', 'One pair of 10 lb'], ['adjustable', 'Adjustable']].map(function (o) { return '<button class="chip" data-eq="' + o[0] + '" aria-pressed="' + (S.equipment === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<p class="meta">With the 10 lb pair, progress means harder versions (slower lowering, pauses). With adjustable dumbbells, the app tells you when to add weight.</p></div>';
    h += '<div class="card ui"><h3>Workouts a week</h3><div class="chips">' + [3, 2].map(function (n) {
      return '<button class="chip" data-target="' + n + '" aria-pressed="' + (W.targetOf(S) === n) + '">' + n + ' a week</button>'; }).join('') + '</div>' +
      '<p class="meta">3 is the plan. 2 still trains every muscle twice a week (full-body days) and fits busy stretches.</p></div>';
    h += '<div class="card ui" id="wo-age-card"><h3>Your age (optional)</h3><div class="row">' +
      '<label for="wo-age">Age</label><input type="number" inputmode="numeric" id="wo-age" min="18" max="90" value="' + esc(S.age || '') + '" placeholder="e.g. 32" style="width:6em">' +
      '<button id="wo-age-save">Save</button>' + (S.age ? '<button class="link" id="wo-age-clear">Clear</button>' : '') + '</div>' +
      '<p class="meta" style="margin:.4em 0 0">Stays only on this phone. Shows an age-group average line on Move Progress graphs (general fitness reference, not medical advice).</p></div>';
    h += '<div class="card ui"><h3>Harder versions you’ve switched to</h3><p class="meta">When the app says “ready for harder” and you make the switch, tick it so it stops suggesting it.</p><ul class="list">' +
      Object.keys(W.EX).filter(function (n) { return W.EX[n].hard; }).map(function (n) {
        var on = S.next[n] === W.EX[n].hard;
        return '<li><label class="row" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" data-hard="' + esc(n) + '" style="margin-top:4px;min-width:20px;min-height:20px"' + (on ? ' checked' : '') + '> <span class="grow"><b>' + esc(n) + '</b><br><span class="meta">' + esc(W.EX[n].hard) + '</span></span></label></li>';
      }).join('') + '</ul></div>';
    h += '<div class="card ui"><h3>Bring in your Google Sheet</h3><p class="meta">In the sheet, open the Log tab, then File › Download › CSV. Pick that file here. Your past sets become “last time” numbers and progress.</p>' +
      '<label class="btn" for="wo-csv">Import the Log CSV</label><input type="file" id="wo-csv" accept=".csv,text/csv,text/plain" class="sr">' +
      (S.history.length ? '<p class="meta">' + S.history.length + ' exercises imported from the sheet.</p>' : '') + '</div>';
    h += '<div class="card"><h2>Why this plan</h2><p>Your sheet trained each muscle once a week (push Monday, legs Tuesday...). For beginners, working each muscle two or three times a week builds strength and muscle faster for the same total work, and a missed day doesn’t leave a gap of two weeks.</p>' +
      '<p>So there are three full-body days, A, B and C, about 25–30 minutes each. Do them in order on any three days; the app always shows the next one. Supersets and rests are like your sheet. Stop each set with one or two good reps left: that is enough to grow, and kinder on sleep-deprived joints.</p>' +
      '<p>Light dumbbells: once you pass about 20–25 reps, more reps mostly train endurance. Slower lowering and pauses keep it challenging until the adjustable dumbbells arrive; then switch Dumbbells to Adjustable and the app tells you when to add weight.</p></div>';
    return h;
  }

  function wireSettings() {
    $$('[data-target]').forEach(function (b) { b.onclick = function () { if (+b.dataset.target === 2) S.target = 2; else delete S.target; save(); route(['settings']); }; });
    $$('[data-eq]').forEach(function (b) { b.onclick = function () { S.equipment = b.dataset.eq; save(); route(['settings']); }; });
    var ageBtn = $('#wo-age-save');
    if (ageBtn) ageBtn.onclick = function () {
      var raw = $('#wo-age').value.trim();
      if (!raw) { delete S.age; save(); WL.toast('Age cleared'); route(['settings']); return; }
      var a = W.cleanAge(raw);
      if (a == null) { WL.toast('Enter an age between 18 and 90'); return; }
      S.age = a; save(); WL.toast('Age saved (' + W.ageBracket(a) + ' benchmarks)'); route(['settings']);
    };
    var ageClr = $('#wo-age-clear');
    if (ageClr) ageClr.onclick = function () { delete S.age; save(); WL.toast('Age cleared'); route(['settings']); };
    $$('[data-hard]').forEach(function (c) { c.onchange = function () { var n = c.dataset.hard; if (c.checked) S.next[n] = W.EX[n].hard; else delete S.next[n]; save(); }; });
    var f = $('#wo-csv');
    if (f) f.onchange = function () {
      var file = f.files && f.files[0]; f.value = ''; if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try { var n = W.importSheetCsv(S, String(r.result)); save(); WL.toast(n ? 'Imported ' + n + ' exercises from the sheet' : 'Nothing new in that file'); route(['settings']); }
        catch (e) { WL.toast(e.message); }
      };
      r.readAsText(file);
    };
  }

  function route(parts, v) {
    if (v) view = v;
    leave();
    var p = parts && parts[0] || '';
    if (p === 'history') { view.innerHTML = history(); wireHistory(); }
    else if (p === 'settings') { view.innerHTML = settings(); wireSettings(); }
    else renderToday();
  }
  function leave() { forceAhead = false; clearInterval(restTimer); clearTimeout(restHideTimer); restHideTimer = null; clearInterval(clockTimer); }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && rest && $('#restbar')) showRest();
  });

  function card() {
    var open = W.openSession(S, now()), fin = !open && W.finishedToday(S, now()), day = open ? open.day : W.nextDay(S, now()), plan = W.PROGRAM[day];
    if (fin) {
      return '<div class="meta ui">Workout</div><div class="row"><h3 class="grow">\u2713 Done for today</h3>' + weekDots() + '</div>' +
        '<p class="meta ui">Finished ' + esc(W.PROGRAM[fin.day].title) + '. Next: ' + esc(plan.title) + '.</p><div class="row ui"><a class="btn" href="#workout">Open</a></div>';
    }
    return '<div class="meta ui">Workout</div><div class="row"><h3 class="grow">' + (open ? 'In progress: ' : 'Next: ') + esc(plan.title) + '</h3>' + weekDots() + '</div>' +
      '<p class="meta ui">' + esc(W.coach(S, now())) + '</p><div class="row ui"><a class="btn primary" href="#workout">' + (open ? 'Carry on' : 'Start') + '</a>' + roughRest(open) + '</div>';
  }
  /* A rough night (today's check-in: very short sleep or low energy): one tap makes today a rest day ("Tired"),
     never a missed workout. Not once he has said "Not for me" to it, nor with a workout under way or a rest logged. */
  function roughRest(open) {
    var M = window.WLMe, c = M && M.state && M.state().checkins && M.state().checkins[W.iso(now())];
    if (open || !c || !(c.sleep === 'Under 4 h' || c.energy === 'Low') || W.restOn(S, W.iso(now()))) return '';
    if (M.state().feedback.some(function (f) { return f && f.part === 'workout' && f.kind === 'notfit' && f.about === 'roughrest'; })) return '';
    return '<button class="btn" id="wo-rough-rest" data-rough-rest="1">Rest today (tired)</button>' + (M.fitLink ? ' ' + M.fitLink('workout', 'roughrest', 'Rest today (tired)') : '');
  }
  function wireCard(el) {
    el.addEventListener('click', function (e) {
      if (!e.target.closest('[data-rough-rest]')) return;
      W.logRest(S, W.iso(now()), 'Tired', new Date()); save();
      el.innerHTML = card(); if (WL.refreshToday) WL.refreshToday();
      WL.toast('Rest day kept: tired. Not a missed workout.');
    });
  }

  WL.register({
    id: 'workout', title: 'Workout', short: 'Move', icon: '❁', nav: true,
    wireCard: wireCard,
    week: function () {
      var d = new Date(), n = W.weekStats(S, d).thisWeek, r = W.restThisWeek(S, d).length;
      var t = n ? n + ' workout' + (n === 1 ? '' : 's') : '';
      return r ? (t ? t + ', ' : '') + r + ' rest day' + (r === 1 ? '' : 's') + ' you chose' : t;
    },
    today: function () { var t = W.today(S, new Date()); return t.done ? { label: 'Move: ' + t.text, done: true, href: '#workout' } : { label: 'Move: ' + t.text, done: false, href: '#workout' }; },
    storageKeys: [store.key], settingsLink: '#workout/settings',
    route: route, leave: leave, card: card,
    validate: function (k, raw) { try { var s = W.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
