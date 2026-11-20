/* To-do logic (no DOM). Tasks: {id, text, due: 'YYYY-MM-DD'|null, at: 'HH:MM'|null (a reminder at that time on the due
   day), done: ISO|null, created: ISO, repeat: null|'daily'|'weekdays'|'weekly'|'biweekly'|'monthly', mday (monthly: its day of the month)}.
   Storage key 'wl.todo.v1'. Used by todo.js and by modules/todo/tests. */
(function (root) {
  'use strict';
  function defaults() { return { tasks: [] }; }
  function iso(d) { var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  var n = 0;
  function id(now) { return (now || new Date()).getTime().toString(36) + '-' + (++n); }

  /* "call mum tomorrow", "bins fri", "pay bill 12/3", "stretch every day": pulls a date / repeat off the end. */
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  /* "at 3pm", "3:30pm", "at 15:30", "at noon", "at 7" (1-6 without am/pm means afternoon): {at: 'HH:MM', rest}. */
  var TIME_RE = /\s+(?:at\s+(noon|midday)|(?:at\s+)?(\d{1,2})(?:[:.](\d\d))?\s*([ap])\.?m\.?|at\s+(\d{1,2})(?:[:.](\d\d))?)$/i;
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function takeTime(t) {
    var m = TIME_RE.exec(t); if (!m) return null;
    var h, mi;
    if (m[1]) { h = 12; mi = 0; }
    else if (m[2]) { h = +m[2]; mi = +(m[3] || 0); if (h < 1 || h > 12) return null; h = h % 12 + (m[4].toLowerCase() === 'p' ? 12 : 0); }
    else { h = +m[5]; mi = +(m[6] || 0); if (h > 23) return null; if (m[5].length === 1 && h >= 1 && h <= 6) h += 12; } // "at 2" / "at 2:30" = afternoon; "at 02:30" = night
    if (mi > 59) return null;
    var rest = t.slice(0, m.index);
    if (/^\s*at\s*$/i.test(rest)) return null;
    return { at: pad(h) + ':' + pad(mi), rest: rest };
  }
  function quickParse(text, now) {
    now = now || new Date();
    var t = String(text || '').trim(), today = iso(now), due = null, repeat = null, at = null, m, tm;
    if ((tm = takeTime(t))) { at = tm.at; t = tm.rest; }
    if ((m = /\s+(every day|daily)$/i.exec(t))) { repeat = 'daily'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every weekday|weekdays)$/i.exec(t))) { repeat = 'weekdays'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every week|weekly)$/i.exec(t))) { repeat = 'weekly'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every (?:2|two|other) weeks?|every other week|fortnightly|biweekly)$/i.exec(t))) { repeat = 'biweekly'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every month|monthly)$/i.exec(t))) { repeat = 'monthly'; due = today; t = t.slice(0, m.index); }
    if ((m = /\s+(today|tonight)$/i.exec(t))) { due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(tomorrow|tmrw)$/i.exec(t))) { due = addDays(today, 1); t = t.slice(0, m.index); }
    else if ((m = /\s+(?:on |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/i.exec(t))) {
      var want = DAYS.indexOf(m[1].slice(0, 3).toLowerCase()), d = (want - now.getDay() + 7) % 7 || 7;
      due = addDays(today, d); t = t.slice(0, m.index);
    } else if ((m = /\s+(\d{1,2})\/(\d{1,2})$/.exec(t))) { // day/month, Canadian style
      var dd = +m[1], mm = +m[2];
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        var c = new Date(now.getFullYear(), mm - 1, dd);
        if (c.getMonth() === mm - 1) { if (iso(c) < today) c.setFullYear(c.getFullYear() + 1); due = iso(c); t = t.slice(0, m.index); }
      }
    }
    if (!at && (tm = takeTime(t))) {                 // "call Mom at 3pm tomorrow": the time came before the date
      at = tm.at; t = tm.rest;
      if (!due && !repeat && (m = /\s+(every day|daily)$/i.exec(t))) { repeat = 'daily'; due = today; t = t.slice(0, m.index); }
    }
    if (at && !due) { due = today; if (!repeat && at <= hm(now)) due = addDays(today, 1); }  // "3pm" already gone: tomorrow
    if (!t.trim()) return { text: String(text || '').trim(), due: null, repeat: null, at: null };
    return { text: t.trim(), due: due, repeat: repeat, at: at };
  }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function add(state, text, opts, now) {
    var q = quickParse(text, now);
    if (!q.text) return null;
    opts = opts || {};
    var task = { id: id(now), text: q.text, due: opts.due !== undefined ? opts.due : q.due, done: null,
      created: (now || new Date()).toISOString(), repeat: opts.repeat || q.repeat || null, at: opts.at !== undefined ? opts.at : q.at };
    task.due = firstDue(task);
    if (task.repeat === 'monthly' && task.due) task.mday = +task.due.slice(8, 10);
    state.tasks.push(task);
    return task;
  }

  function nextDue(task, today) {
    var base = task.due && task.due > today ? task.due : today, d;
    if (task.repeat === 'daily') return addDays(base, 1);
    if (task.repeat === 'weekly') { d = addDays(task.due || today, 7); while (d <= today) d = addDays(d, 7); return d; }
    if (task.repeat === 'biweekly') { d = addDays(task.due || today, 14); while (d <= today) d = addDays(d, 14); return d; }
    if (task.repeat === 'monthly') {
      // the same day each month (the 31st falls on the last day of shorter months, then back to the 31st)
      var from = task.due || today, md = task.mday || +from.slice(8, 10), y = +from.slice(0, 4), mo = +from.slice(5, 7) - 1, guard = 0;
      do { mo++; if (mo > 11) { mo = 0; y++; } d = iso(new Date(y, mo, Math.min(md, new Date(y, mo + 1, 0).getDate()))); } while (d <= today && guard++ < 1200);
      return d;
    }
    if (task.repeat === 'weekdays') { d = addDays(base, 1); while ([0, 6].indexOf(parse(d).getDay()) >= 0) d = addDays(d, 1); return d; }
    return null;
  }

  /* A "weekdays" task never falls on a weekend (added on a Saturday it starts Monday, not that Saturday). */
  function firstDue(task) {
    var d = task.due;
    if (task.repeat === 'weekdays' && d) while ([0, 6].indexOf(parse(d).getDay()) >= 0) d = addDays(d, 1);
    return d;
  }

  /* Ticking a repeating task logs it as done and moves the task to its next date. */
  /* day: which occurrence was done (Done on a notification after midnight is still the day it rang for). */
  function complete(state, taskId, now, day) {
    now = now || new Date();
    var t = find(state, taskId); if (!t) return null;
    if (t.repeat) {
      state.tasks.push({ id: id(now), text: t.text, due: t.due, done: now.toISOString(), created: t.created, repeat: null, fromRepeat: t.id });
      t.due = nextDue(t, day || iso(now));
      return t;
    }
    t.done = now.toISOString();
    return t;
  }
  /* "Done" tapped on a reminder notification (Android hands over "ms<TAB>taskId[<TAB>reminder day]" lines). A one-off task is ticked (once);
     a repeating one only if its current date is that day or earlier (if it already moved on, e.g. ticked in the app
     too, nothing happens). Returns the tasks ticked. */
  function applyTicked(state, lines) {
    var out = [];
    String(lines || '').split('\n').forEach(function (l) {
      var p = l.split('\t'); if (p.length < 2) return;
      var ms = +p[0], t = find(state, p[1].trim());
      if (!t || t.done || !(ms > 0)) return;
      var at = new Date(ms), day = /^\d{4}-\d\d-\d\d$/.test((p[2] || '').trim()) ? p[2].trim() : iso(at);
      // a repeating task: only the occurrence that notification was for (Done on yesterday's reminder, already ticked
      // in the app, must not tick today's)
      if (t.repeat && t.due && t.due > day) return;
      complete(state, t.id, at, day); out.push(t);
    });
    return out;
  }
  function uncomplete(state, taskId) { var t = find(state, taskId); if (t) t.done = null; return t; }
  function remove(state, taskId) { state.tasks = state.tasks.filter(function (t) { return t.id !== taskId; }); }
  function find(state, taskId) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === taskId) return state.tasks[i]; return null; }

  function groups(state, now) {
    var today = iso(now || new Date()), g = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
    state.tasks.forEach(function (t) {
      if (t.done) g.done.push(t);
      else if (!t.due) g.someday.push(t);
      else if (t.due < today) g.overdue.push(t);
      else if (t.due === today) g.today.push(t);
      else g.upcoming.push(t);
    });
    var byDue = function (a, b) { return (a.due || '') < (b.due || '') ? -1 : (a.due || '') > (b.due || '') ? 1 : a.created < b.created ? -1 : 1; };
    g.overdue.sort(byDue); g.today.sort(byDue); g.upcoming.sort(byDue); g.someday.sort(byDue);
    g.done.sort(function (a, b) { return a.done < b.done ? 1 : -1; });
    return g;
  }

  function moveOverdueToToday(state, now) {
    var today = iso(now || new Date()), k = 0;
    state.tasks.forEach(function (t) { if (!t.done && t.due && t.due < today) { t.due = today; k++; } });
    return k;
  }

  /* Done tasks older than 30 days are dropped so the list stays small (the weekly counts keep them). */
  function tidy(state, now) {
    var cut = (now || new Date()).getTime() - 30 * 864e5;
    state.tasks = state.tasks.filter(function (t) { return !t.done || new Date(t.done).getTime() >= cut; });
  }

  function doneInLast(state, days, now) {
    now = now || new Date();
    var from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)));
    return state.tasks.filter(function (t) { return t.done && iso(new Date(t.done)) >= from; }).length;
  }

  /* One short, kind piece of advice for the Home card and the list. */
  function advice(state, now) {
    var g = groups(state, now), open = g.overdue.length + g.today.length;
    if (g.overdue.length >= 3) return 'A few things slipped. That happens with a baby. Move them to today, or to later, and pick just one.';
    if (open > 6) return 'That’s a lot for one day. Choose the three that matter most; the rest can wait.';
    if (open === 0 && g.upcoming.length + g.someday.length === 0) return 'Nothing on the list. Add anything that’s on your mind to get it out of your head.';
    if (open === 0) return 'Nothing due today. Enjoy it.';
    return '';
  }

  /* The reminders to set on the phone: [{id, when (ms), text}] for open tasks with a time, soonest first, within
     `days` days (repeating tasks: each coming occurrence). Sent to Android (TodoAlarm) after every change. */
  function when(day, at) { var p = day.split('-'), h = at.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +h[0], +h[1]).getTime(); }
  function reminders(state, now, days) {
    now = now || new Date(); days = days || 8;
    var t0 = now.getTime(), end = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)), out = [];
    state.tasks.forEach(function (t) {
      if (t.done || !t.at || !t.due) return;
      var d = t.due, guard = 0, today = iso(now), skip = 0;
      // a repeating task left unticked for weeks: walk past the old days first, or the 40 steps run out on them
      while (t.repeat && d < today && skip++ < 5000) { var n0 = nextDue({ due: d, repeat: t.repeat, mday: t.mday }, d); if (!n0 || n0 <= d) break; d = n0; }
      while (d <= end && guard++ < 40) {
        var w = when(d, t.at);
        if (w > t0) out.push({ id: t.id + '@' + d, when: w, text: t.text });
        if (!t.repeat) break;
        var nx = nextDue({ due: d, repeat: t.repeat, mday: t.mday }, d); if (!nx || nx <= d) break; d = nx;
      }
    });
    out.sort(function (a, b) { return a.when - b.when; });
    return out.slice(0, 40);
  }
  /* Android's format: one "when<TAB>id<TAB>text" line each (no JSON parser needed there), then "#open<TAB>id,id" naming
     the open tasks that have a time: a reminder snoozed from the notification is kept only while its task is one of them. */
  function alarmLines(list, openIds) {
    var out = list.map(function (r) { return r.when + '\t' + String(r.id).replace(/[\t\n\r]/g, ' ') + '\t' + String(r.text).replace(/[\t\n\r]+/g, ' ').slice(0, 200); });
    // always sent (also empty): with no "#open" line Android keeps every snooze (older pages), so ticking the last
    // timed task left its snoozed reminder to ring anyway
    if (Array.isArray(openIds)) out.push('#open\t' + openIds.map(function (x) { return String(x).replace(/[\t\n\r,]/g, ' '); }).join(','));
    return out.join('\n');
  }
  /* Open tasks with a time whose reminder can be ringing now: a repeating one only while due today or earlier (ticked,
     it moves to its next date, and a snooze from today's notification must stop). */
  function openTimed(state, now) {
    var today = iso(now || new Date());
    return state.tasks.filter(function (t) { return !t.done && t.at && t.due && (!t.repeat || t.due <= today); }).map(function (t) { return t.id; });
  }
  /* "Remind me in an hour": the reminder moves to now + 60 min (rounded up to 5 min), on that day (after 11 pm that is
     tomorrow). Not for repeating tasks (it would move every coming day): returns null for those. */
  function remindIn(state, taskId, minutes, now) {
    now = now || new Date();
    var t = find(state, taskId); if (!t || t.done || t.repeat) return null;
    var w = new Date(now.getTime() + (minutes || 60) * 60000);
    var r = w.getMinutes() % 5; if (r || w.getSeconds() || w.getMilliseconds()) w = new Date(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), w.getMinutes() - r + 5);
    t.due = iso(w); t.at = hm(w);
    return t;
  }
  function fmtTime(at) {
    if (!at) return '';
    var h = +at.slice(0, 2), mi = at.slice(3);
    return (h % 12 || 12) + (mi === '00' ? '' : ':' + mi) + (h < 12 ? ' am' : ' pm');
  }

  function validate(s) {
    if (!s || !Array.isArray(s.tasks)) return null;
    var dateRe = /^\d{4}-\d\d-\d\d$/;
    return { tasks: s.tasks.filter(function (t) { return t && typeof t.text === 'string' && t.text.trim(); }).map(function (t) {
      return { id: String(t.id || id()), text: t.text, due: dateRe.test(t.due) ? t.due : null,
        done: t.done && !isNaN(new Date(t.done).getTime()) ? new Date(t.done).toISOString() : null,
        created: t.created && !isNaN(new Date(t.created).getTime()) ? new Date(t.created).toISOString() : new Date().toISOString(),
        repeat: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'].indexOf(t.repeat) >= 0 ? t.repeat : null,
        mday: t.mday >= 1 && t.mday <= 31 ? Math.floor(t.mday) : undefined,
        fromRepeat: typeof t.fromRepeat === 'string' ? t.fromRepeat : undefined,
        at: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.at) ? t.at : null };
    }) };
  }

  var api = { defaults: defaults, quickParse: quickParse, add: add, complete: complete, applyTicked: applyTicked, uncomplete: uncomplete, remove: remove,
    find: find, groups: groups, moveOverdueToToday: moveOverdueToToday, tidy: tidy, doneInLast: doneInLast, advice: advice,
    nextDue: nextDue, validate: validate, iso: iso, addDays: addDays, reminders: reminders, alarmLines: alarmLines, openTimed: openTimed, firstDue: firstDue, remindIn: remindIn, fmtTime: fmtTime };
  root.TodoCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
