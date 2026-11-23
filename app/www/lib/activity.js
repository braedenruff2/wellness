/* Activity log: everything he does in the app, as events {id, at, part, kind, text?, data?}, read straight from each
   part's saved data (so nothing has to remember to log, and what was done before the PC link existed counts too).
   The PC link (lib/pc.js) sends the events it hasn't sent yet to his PC, which appends them to
   Desktop\wellness-progress\activity\<date>.jsonl. Journal and prayer text only when he turns that on (those events then get new ids,
   so what was sent without text is sent again with it).
   Pure functions, no browser: tested in modules/link/tests/unit.cjs. */
(function (root) {
  'use strict';
  var MAX_DAYS = 60;

  function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function okDate(at) { return typeof at === 'string' && /^\d{4}-\d\d-\d\d/.test(at) && !isNaN(new Date(at.length === 10 ? at + 'T12:00:00' : at).getTime()); }
  function localNoon(day) { var p = day.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12).toISOString(); }

  var X = {};

  /* Faith (fc.v1): days finished, guided prayers and practices, journal / awe / gratitude, prayers and answers. */
  X['fc.v1'] = function (s, o, out) {
    var round = s.round || 1;
    function pushDone(done, r) {
      Object.keys(done || {}).forEach(function (n) {
        var d = done[n]; if (!okDate(d)) return;
        out.push({ id: 'faith/day/' + r + '/' + n, at: d.length === 10 ? localNoon(d) : d, part: 'faith', kind: 'day-done', text: 'Day ' + n, data: { day: +n, round: r } });
      });
    }
    (s.pastRounds || []).forEach(function (pr, idx) { if (pr && pr.done) pushDone(pr.done, pr.round || (idx + 1)); });
    pushDone(s.done, round);
    (s.sessions || []).forEach(function (x) {
      if (!x || !okDate(x.at)) return;
      out.push({ id: 'faith/s/' + x.at, at: x.at, part: 'faith', kind: x.kind === 'day' ? 'guided-prayer' : 'practice', text: cut(x.title, 80), data: { id: x.id, mins: x.mins } });
    });
    (s.journal || []).forEach(function (e) {
      if (!e || !okDate(e.at)) return;
      var ev = { id: 'faith/j/' + e.id + (o.journalText ? '/t' : ''), at: e.at, part: 'faith', kind: e.kind || 'journal', data: { day: e.day || null, chars: String(e.text || '').length } };
      if (o.journalText) ev.text = cut(e.text, 4000);
      out.push(ev);
    });
    (s.prayers || []).forEach(function (p) {
      if (!p || !okDate(p.at)) return;
      var ev = { id: 'faith/p/' + p.id + (o.journalText ? '/t' : ''), at: p.at, part: 'faith', kind: 'prayer-added' };
      if (o.journalText) ev.text = cut(p.text, 2000);
      out.push(ev);
      if (okDate(p.answered)) {
        var a = { id: 'faith/pa/' + p.id + (o.journalText ? '/t' : ''), at: p.answered, part: 'faith', kind: 'prayer-answered' };
        if (o.journalText) a.text = cut(p.text, 300) + (p.note ? ' — ' + cut(p.note, 1000) : '');
        out.push(a);
      }
    });
  };

  /* Calm (wl.calm.v1): every session with its length and stress before / after (1-5). */
  X['wl.calm.v1'] = function (s, o, out) {
    (s.sessions || []).forEach(function (x) {
      if (!x) return;
      var at = okDate(x.at) ? x.at : okDate(x.date) ? localNoon(x.date) : null; if (!at) return;
      // an after-rating added later gets a new id ending /e<ms> (the session may already have been sent): newest wins
      out.push({ id: 'calm/' + at + '/' + x.id + (x.after && okDate(x.rated) ? '/e' + Date.parse(x.rated) : ''), at: at, part: 'calm', kind: 'session', text: x.id, data: { practice: x.id, mins: x.mins, before: x.before || null, after: x.after || null } });
    });
  };

  /* Move (wl.workout.v1): every set (exercise, set number, reps or seconds, weight) and each finished workout. */
  X['wl.workout.v1'] = function (s, o, out) {
    (s.sessions || []).forEach(function (w) {
      if (!w) return;
      (w.sets || []).forEach(function (x) {
        if (!x || !okDate(x.at)) return;
        // a fixed set gets a new id ending /e<ms>: the PC keeps the newest of them
        out.push({ id: 'workout/' + w.id + '/' + x.at + '/' + x.i + (x.edited && okDate(x.edited) ? '/e' + Date.parse(x.edited) : ''), at: x.at, part: 'workout', kind: 'set', data: { day: w.day, ex: x.ex, n: x.n, val: x.val, w: x.w } });
      });
      (w.removed || []).forEach(function (r) {
        if (r && okDate(r.at)) out.push({ id: 'workout/' + w.id + '/' + r.at + '/' + r.i + '/x', at: r.at, part: 'workout', kind: 'set-removed' });
      });
      if (okDate(w.end) && (w.sets || []).length) {
        var mins = Math.round((new Date(w.end) - new Date(w.start)) / 60000);
        // the end time is in the id: "Carry on" then Finish again sends the new end, and the PC keeps the newest
        out.push({ id: 'workout/end/' + w.id + '/e' + Date.parse(w.end), at: w.end, part: 'workout', kind: 'workout-done', text: 'Day ' + w.day, data: { day: w.day, sets: w.sets.length, mins: isNaN(mins) ? null : mins } });
      }
    });
    // rest days he logged with a reason (not missed workouts); an undone one comes again as <id>/x and the PC drops it
    Object.keys(s.rest || {}).forEach(function (d) {
      var r = s.rest[d]; if (!r || !okDate(r.at) || !/^\d{4}-\d\d-\d\d$/.test(d)) return;
      out.push({ id: 'workout/rest/' + d + '/' + r.at, at: localNoon(d), part: 'workout', kind: 'rest-day', text: String(r.why || '').slice(0, 40), data: { date: d, why: r.why } });
    });
    (s.restRemoved || []).forEach(function (r) {
      if (r && okDate(r.at) && /^\d{4}-\d\d-\d\d$/.test(r.date)) out.push({ id: 'workout/rest/' + r.date + '/' + r.at + '/x', at: localNoon(r.date), part: 'workout', kind: 'rest-removed' });
    });
    // the workouts a week he aims for (3, or 2 when he chose it), once a day, so every summary knows it (the PC keeps the
    // last one sent): advice and weekly plans then plan around his choice
    if (o.now && (s.sessions || []).length + Object.keys(s.rest || {}).length) {
      var n0 = o.now, day = n0.getFullYear() + '-' + ('0' + (n0.getMonth() + 1)).slice(-2) + '-' + ('0' + n0.getDate()).slice(-2), per = s.target === 2 ? 2 : 3;
      out.push({ id: 'workout/target/' + day + '/' + per, at: localNoon(day), part: 'workout', kind: 'target', data: { perWeek: per } });
    }
  };

  /* Tagalog (wl.tagalog.v1): lessons finished, every exercise answer, every review card. */
  X['wl.tagalog.v1'] = function (s, o, out) {
    Object.keys(s.done || {}).forEach(function (k) {
      if (okDate(s.done[k])) out.push({ id: 'tagalog/lesson/' + k, at: s.done[k], part: 'tagalog', kind: 'lesson', text: k });
    });
    (s.answers || []).forEach(function (a, i) {
      if (!a || !okDate(a.at)) return;
      out.push({ id: 'tagalog/a/' + a.at + '/' + cut(a.prompt, 40), at: a.at, part: 'tagalog', kind: 'answer', data: { pack: a.pack, day: a.day, type: a.type, prompt: a.prompt, ok: !!a.ok, given: a.given || undefined } });
    });
    (s.reviews || []).forEach(function (r) {
      if (!r || !okDate(r.at)) return;
      out.push({ id: 'tagalog/r/' + r.at + '/' + r.tl, at: r.at, part: 'tagalog', kind: 'review', data: r.dir === 'say' ? { tl: r.tl, right: !!r.right, dir: 'say' } : { tl: r.tl, right: !!r.right } });
    });
  };

  /* To do (wl.todo.v1): tasks added and done. */
  X['wl.todo.v1'] = function (s, o, out) {
    (s.tasks || []).forEach(function (t) {
      if (!t) return;
      if (okDate(t.created) && !t.fromRepeat) out.push({ id: 'todo/add/' + t.id, at: t.created, part: 'todo', kind: 'added', text: cut(t.text, 200), data: { due: t.due || null, repeat: t.repeat || null } });
      if (okDate(t.done)) out.push({ id: 'todo/done/' + t.id + '/e' + Date.parse(t.done), at: t.done, part: 'todo', kind: 'done', text: cut(t.text, 200) });
    });
  };

  /* Parenting coach (wl.coach.v1): each graded scenario (skill and score). His answers stay on the phone unless
     journal text is on (the PC keeps the full exchange anyway, since it does the grading). */
  X['wl.coach.v1'] = function (s, o, out) {
    (s.history || []).forEach(function (h) {
      if (h && okDate(h.at) && h.kind === 'real') out.push({ id: 'coach/' + h.id, at: h.at, part: 'coach', kind: 'advice', text: cut(h.title, 120), data: { skill: h.skill } });
      if (!h || !okDate(h.at) || !h.result) return;
      out.push({ id: 'coach/' + h.id, at: h.at, part: 'coach', kind: 'graded', text: cut(h.title, 120), data: { skill: h.skill, score: h.result.score } });
    });
  };

  /* About you (wl.me.v1): the daily check-in, quick answers after things he did, "not for me" flags. A changed answer
     gets a new id ending /e<ms> (the PC keeps the newest). Notes are his words about the app and his day: sent so the
     weekly plan can use them (only to his own PC). */
  X['wl.me.v1'] = function (s, o, out) {
    var ck = s.checkins || {};
    Object.keys(ck).forEach(function (d) {
      var c = ck[d]; if (!c || !/^\d{4}-\d\d-\d\d$/.test(d)) return;
      var at = okDate(c.at) ? c.at : localNoon(d), data = {};
      ['sleep', 'wakes', 'energy', 'mood', 'day'].forEach(function (k) { if (c[k] != null) data[k] = c[k]; });
      var ev = { id: 'checkin/' + d + (okDate(c.edited) ? '/e' + Date.parse(c.edited) : ''), at: at, part: 'checkin', kind: 'checkin', data: data };
      if (c.note) ev.text = cut(c.note, 600);
      out.push(ev);
    });
    (s.feedback || []).forEach(function (f) {
      if (!f || !okDate(f.at) || typeof f.id !== 'string') return;
      var part = f.part === 'home' ? 'app' : f.part;
      var ev = { id: 'fb/' + f.id + (okDate(f.edited) ? '/e' + Date.parse(f.edited) : ''), at: f.at, part: part, kind: f.kind === 'notfit' ? 'not-for-me' : 'feedback',
        data: { about: f.about, a: f.a } };
      var t = [f.shown, f.note].filter(Boolean).join(' | ');
      if (t) ev.text = cut(t, 900);
      out.push(ev);
    });
  };

  /* All events from the saved data ({storageKey: parsed state}), oldest first, last MAX_DAYS days only. */
  function collect(states, opts, now) {
    now = now || new Date(); opts = Object.assign({}, opts || {}, { now: now });
    var from = new Date(now.getTime() - MAX_DAYS * 864e5).toISOString(), to = new Date(now.getTime() + 864e5).toISOString();
    var out = [];
    Object.keys(X).forEach(function (k) {
      var s = states[k]; if (!s || typeof s !== 'object') return;
      try { X[k](s, opts, out); } catch (e) { /* one part's odd data never stops the others */ }
    });
    var seen = {};
    return out.filter(function (e) {
      var at = new Date(e.at).toISOString();
      if (at < from || at > to || seen[e.id]) return false;
      seen[e.id] = 1; return true;
    }).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }

  /* The events not sent yet. sent: {id: 1}. */
  function unsent(events, sent) { return events.filter(function (e) { return !sent[e.id]; }); }

  /* After a send: remember those ids, and forget ids older than the window (they are never collected again). */
  function markSent(sent, events, all) {
    events.forEach(function (e) { sent[e.id] = 1; });
    if (all) {
      var live = {}; all.forEach(function (e) { live[e.id] = 1; });
      Object.keys(sent).forEach(function (k) { if (!live[k]) delete sent[k]; });
    }
    return sent;
  }

  /* One line for the "what's logged" list. */
  function describe(e) {
    var d = e.data || {};
    switch (e.part + '/' + e.kind) {
      case 'faith/day-done': return 'Faith: finished ' + e.text;
      case 'faith/guided-prayer': return 'Faith: guided prayer' + (d.mins ? ' (' + d.mins + ' min)' : '');
      case 'faith/practice': return 'Faith: ' + (e.text || 'practice') + (d.mins ? ' (' + d.mins + ' min)' : '');
      case 'faith/prayer-added': return 'Faith: added a prayer' + (e.text ? ': ' + cut(e.text, 60) : '');
      case 'faith/prayer-answered': return 'Faith: a prayer answered';
      case 'calm/session': return 'Calm: ' + (e.text || 'session') + ' ' + (d.mins || 0) + ' min' + (d.before && d.after ? ', stress ' + d.before + '→' + d.after : '');
      case 'workout/set': return 'Move: ' + d.ex + ' set ' + d.n + ': ' + d.val + (d.w ? ' @ ' + d.w + ' lb' : '');
      case 'workout/target': return 'Move: aiming for ' + d.perWeek + ' workouts a week';
      case 'workout/rest-day': return 'Move: rest day (' + (d.why || e.text || '') + ')';
      case 'workout/workout-done': return 'Move: finished workout ' + (d.day || '') + ' (' + d.sets + ' sets' + (d.mins != null ? ', ' + d.mins + ' min' : '') + ')';
      case 'tagalog/lesson': return 'Tagalog: finished lesson ' + e.text;
      case 'tagalog/answer': return 'Tagalog: ' + (d.ok ? '✓ ' : '✗ ') + cut(d.prompt, 60);
      case 'tagalog/review': return 'Tagalog review' + (d.dir === 'say' ? ' (said it)' : '') + ': ' + (d.right ? '✓ ' : '✗ ') + d.tl;
      case 'todo/added': return 'To do: added “' + cut(e.text, 60) + '”';
      case 'todo/done': return 'To do: done “' + cut(e.text, 60) + '”';
      case 'coach/advice': return 'Parenting: asked about ' + cut(e.text, 60);
      case 'checkin/checkin': return 'Check-in: ' + Object.keys(d).map(function (k) { return k + ' ' + d[k]; }).join(', ') + (e.text ? ' — ' + cut(e.text, 60) : '');
      case 'coach/graded': return 'Parenting: ' + cut(e.text, 60) + ' — ' + (d.score != null ? d.score + '/10' : '');
    }
    if (e.kind === 'feedback' || e.kind === 'not-for-me') return e.part + (e.kind === 'feedback' ? ' answers: ' : ' — not for me: ') + cut(JSON.stringify((d || {}).a || {}).replace(/[{}"\[\]]/g, '').replace(/,/g, ', '), 80);
    if (e.part === 'faith') return 'Faith: wrote in the journal (' + e.kind + ')' + (e.text ? ': ' + cut(e.text, 60) : '');
    return e.part + ': ' + e.kind;
  }

  var API = { collect: collect, unsent: unsent, markSent: markSent, describe: describe, MAX_DAYS: MAX_DAYS, keys: Object.keys(X) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.WLActivity = API;
})(this);
