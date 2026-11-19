/* To-do logic (no DOM). Tasks: {id, text, due: 'YYYY-MM-DD'|null, done: ISO|null, created: ISO, repeat: null|'daily'|'weekdays'|'weekly'}.
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
  function quickParse(text, now) {
    now = now || new Date();
    var t = String(text || '').trim(), today = iso(now), due = null, repeat = null, m;
    if ((m = /\s+(every day|daily)$/i.exec(t))) { repeat = 'daily'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every weekday|weekdays)$/i.exec(t))) { repeat = 'weekdays'; due = today; t = t.slice(0, m.index); }
    else if ((m = /\s+(every week|weekly)$/i.exec(t))) { repeat = 'weekly'; due = today; t = t.slice(0, m.index); }
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
    return { text: t.trim() || String(text || '').trim(), due: due, repeat: repeat };
  }

  function add(state, text, opts, now) {
    var q = quickParse(text, now);
    if (!q.text) return null;
    opts = opts || {};
    var task = { id: id(now), text: q.text, due: opts.due !== undefined ? opts.due : q.due, done: null,
      created: (now || new Date()).toISOString(), repeat: opts.repeat || q.repeat || null };
    state.tasks.push(task);
    return task;
  }

  function nextDue(task, today) {
    var base = task.due && task.due > today ? task.due : today, d;
    if (task.repeat === 'daily') return addDays(base, 1);
    if (task.repeat === 'weekly') { d = addDays(task.due || today, 7); while (d <= today) d = addDays(d, 7); return d; }
    if (task.repeat === 'weekdays') { d = addDays(base, 1); while ([0, 6].indexOf(parse(d).getDay()) >= 0) d = addDays(d, 1); return d; }
    return null;
  }

  /* Ticking a repeating task logs it as done and moves the task to its next date. */
  function complete(state, taskId, now) {
    now = now || new Date();
    var t = find(state, taskId); if (!t) return null;
    if (t.repeat) {
      state.tasks.push({ id: id(now), text: t.text, due: t.due, done: now.toISOString(), created: t.created, repeat: null, fromRepeat: t.id });
      t.due = nextDue(t, iso(now));
      return t;
    }
    t.done = now.toISOString();
    return t;
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

  function validate(s) {
    if (!s || !Array.isArray(s.tasks)) return null;
    var dateRe = /^\d{4}-\d\d-\d\d$/;
    return { tasks: s.tasks.filter(function (t) { return t && typeof t.text === 'string' && t.text.trim(); }).map(function (t) {
      return { id: String(t.id || id()), text: t.text, due: dateRe.test(t.due) ? t.due : null,
        done: t.done && !isNaN(new Date(t.done).getTime()) ? new Date(t.done).toISOString() : null,
        created: t.created && !isNaN(new Date(t.created).getTime()) ? new Date(t.created).toISOString() : new Date().toISOString(),
        repeat: ['daily', 'weekdays', 'weekly'].indexOf(t.repeat) >= 0 ? t.repeat : null };
    }) };
  }

  var api = { defaults: defaults, quickParse: quickParse, add: add, complete: complete, uncomplete: uncomplete, remove: remove,
    find: find, groups: groups, moveOverdueToToday: moveOverdueToToday, tidy: tidy, doneInLast: doneInLast, advice: advice,
    nextDue: nextDue, validate: validate, iso: iso, addDays: addDays };
  root.TodoCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
