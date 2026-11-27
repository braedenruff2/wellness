/* To-do module: #todo (list), quick add with plain words ("bins fri", "stretch every day"), Home card with today's tasks. */
(function () {
  'use strict';
  function logNow() { return WL.logNow ? WL.logNow() : new Date(); } // the day picked on Home, or now
  var T = window.TodoCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.todo.v1', T.defaults);
  var S = store.load(), view = null, showDone = false;
  function save() { store.save(S); syncAlarms(); }
  /* Task reminders as Android notifications (TodoAlarm), re-sent after every change and on start. */
  var lastLines = null;
  function syncAlarms() {
    var n = WL.native; if (!n || !n.todoAlarms) return;
    var lines = T.alarmLines(T.reminders(S), T.openTimed(S));
    if (lines === lastLines) return;
    lastLines = lines;
    try { n.todoAlarms(lines); } catch (e) {}
  }

  function fmtDue(d) {
    if (!d) return '';
    var today = T.iso(new Date()), tm = T.addDays(today, 1);
    if (d === today) return 'today';
    if (d === tm) return 'tomorrow';
    var p = d.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
    var diff = Math.round((dt - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5);
    if (diff > 0 && diff < 7) return dt.toLocaleDateString(undefined, { weekday: 'long' });
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  var REP = { daily: 'every day', weekdays: 'weekdays', weekly: 'every week', biweekly: 'every 2 weeks', monthly: 'every month', month2: 'every 2 months', month3: 'every 3 months', yearly: 'every year' };
  var WDN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  /* "every Thursday" / "every other Friday" rather than "every week" when the task has a date (they keep their weekday). */
  function repLabel(t) {
    if ((t.repeat === 'weekly' || t.repeat === 'biweekly') && /^\d{4}-\d\d-\d\d$/.test(t.due || '')) {
      var p = t.due.split('-');
      return (t.repeat === 'weekly' ? 'every ' : 'every other ') + WDN[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
    }
    return REP[t.repeat] || '';
  }

  function item(t, overdue) {
    return '<li class="task' + (t.done ? ' is-done' : '') + '" data-id="' + esc(t.id) + '">' +
      '<button class="tick-box" data-tick="' + esc(t.id) + '" aria-label="' + (t.done ? 'Not done' : 'Done') + ': ' + esc(t.text) + '">' + (t.done ? '✓' : '') + '</button>' +
      '<span class="grow"><span class="task-text">' + esc(t.text) + '</span>' +
      ((t.due || t.repeat) && !t.done ? '<span class="meta ui' + (overdue ? ' late' : '') + '"> ' + esc(fmtDue(t.due)) + (t.at ? ' 🔔 ' + esc(T.fmtTime(t.at)) : '') + (t.repeat ? ' ↻ ' + esc(repLabel(t)) : '') + '</span>' : '') + '</span>' +
      '<button class="link small" data-more="' + esc(t.id) + '" aria-label="Options for ' + esc(t.text) + '">⋯</button></li>';
  }

  function list(title, arr, overdue) {
    if (!arr.length) return '';
    return '<h2>' + title + '</h2><ul class="list tasks">' + arr.map(function (t) { return item(t, overdue); }).join('') + '</ul>';
  }

  /* Done tasks older than 30 days go when the app starts too, not only when the list opens (a year of use stays small). */
  function tidyNow() { var n0 = S.tasks.length; T.tidy(S); if (S.tasks.length !== n0) save(); }
  function render() {
    T.tidy(S); save();
    var g = T.groups(S), adv = T.advice(S);
    var h = '<h1>To do</h1><div class="card ui"><form id="td-form" class="row"><input type="text" id="td-new" class="grow" placeholder="Add a task (e.g. call Mom tomorrow)" autocomplete="off" aria-label="New task"><button class="primary" type="submit">Add</button></form>' +
      '<p class="meta" id="td-preview" aria-live="polite" hidden style="margin:.45em 0 0"></p>' +
      '<p class="meta" style="margin:.5em 0 0">Ends like “tomorrow”, “fri”, “24/12”, “dec 24”, “in 3 days”, “next week”, “every day” or “every monday” set the date; “at 3pm” adds a reminder.</p></div>';
    if (adv) h += '<p class="gentle ui">' + esc(adv) + (g.overdue.length ? ' <button class="link" id="td-move">Move overdue to today</button>' : '') + '</p>';
    h += '<div class="card">' + (list('Overdue', g.overdue, true) + list('Today', g.today) + list('Coming up', g.upcoming) + list('Any time', g.someday) || '<p class="meta ui">Nothing to do. ✨</p>') + '</div>';
    var wk = T.doneInLast(S, 7);
    h += '<p class="meta ui">' + wk + ' done in the last 7 days.' + (g.done.length ? ' <button class="link" id="td-showdone">' + (showDone ? 'Hide done' : 'Show done (' + g.done.length + ')') + '</button>' : '') + '</p>';
    if (showDone && g.done.length) h += '<div class="card">' + list('Done', g.done.slice(0, 40)) + '</div>';
    view.innerHTML = h;
    wire();
  }

  function sheet(t, trigger) {
    var old = $('#td-sheet'); if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'td-sheet'; d.className = 'card ui sheet';
    var today = T.iso(new Date());
    d.innerHTML = '<label for="td-edit">Task</label><input type="text" id="td-edit" value="' + esc(t.text) + '">' +
      '<div class="chips" style="margin-top:8px">' + [['Today', today], ['Tomorrow', T.addDays(today, 1)], ['Next week', T.addDays(today, 7)], ['No date', '']].map(function (o) {
        return '<button class="chip" data-due="' + o[1] + '" aria-pressed="' + ((t.due || '') === o[1]) + '">' + o[0] + '</button>';
      }).join('') + '<input type="date" id="td-date" value="' + esc(t.due || '') + '" aria-label="Pick a date"></div>' +
      '<div class="chips" style="margin-top:8px">' + [['', 'Once'], ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['month2', 'Every 2 months'], ['month3', 'Every 3 months'], ['yearly', 'Every year']].map(function (o) {
        return '<button class="chip" data-rep="' + o[0] + '" aria-pressed="' + ((t.repeat || '') === o[0]) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:8px"><label for="td-time" class="meta">Remind me at</label><input type="time" id="td-time" value="' + esc(t.at || '') + '">' +
      '<button class="link small" id="td-notime">No reminder</button>' +
      (t.repeat || t.done ? '' : '<button class="chip" id="td-hour">In 1 hour</button>') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="td-save">Save</button><button id="td-cancel">Cancel</button><span class="grow"></span><button class="link" id="td-del">Delete</button></div>';
    var li = $$('li[data-id]').filter(function (x) { return x.dataset.id === t.id; })[0];
    (li || view).appendChild(d);
    var due = t.due || '', rep = t.repeat || '';
    $$('[data-due]', d).forEach(function (b) { b.onclick = function () { due = b.dataset.due; $('#td-date').value = due; $$('[data-due]', d).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    $('#td-date').onchange = function () { due = this.value; $$('[data-due]', d).forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.due === due); }); };
    $$('[data-rep]', d).forEach(function (b) { b.onclick = function () { rep = b.dataset.rep; $$('[data-rep]', d).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
    var delTimer = null;
    $('#td-save').onclick = function () {
      var txt = $('#td-edit').value.trim(); if (!txt) return;
      clearTimeout(delTimer);
      var at = $('#td-time').value; at = /^\d\d:\d\d$/.test(at) ? at : null;
      var d0 = due;
      if (!d0 && (rep || at)) {
        var now0 = new Date(), hm0 = ('0' + now0.getHours()).slice(-2) + ':' + ('0' + now0.getMinutes()).slice(-2);
        d0 = !rep && at && at <= hm0 ? T.addDays(today, 1) : today;
      }
      t.text = txt; t.due = d0 || null; t.repeat = rep || null; t.at = at; t.due = T.firstDue(t); if (T.MONTH_STEP[t.repeat] && t.due) t.mday = +t.due.slice(8, 10); else delete t.mday; save(); render();
      if (at) WL.toast('Reminder at ' + T.fmtTime(at) + ', ' + fmtDue(t.due));
    };
    $('#td-notime').onclick = function () { $('#td-time').value = ''; };
    var hr = $('#td-hour');
    if (hr) hr.onclick = function () {  // saves at once: the quickest "not now, remind me soon"
      var txt = $('#td-edit').value.trim(); if (txt) t.text = txt;
      if (!T.remindIn(S, t.id, 60)) return;
      clearTimeout(delTimer);
      save(); render();
      WL.toast('Reminder at ' + T.fmtTime(t.at) + ', ' + fmtDue(t.due));
    };
    var close = function () {
      clearTimeout(delTimer);
      d.remove();
      if (trigger && trigger.isConnected && trigger.focus) try { trigger.focus(); } catch (e) {}
    };
    $('#td-cancel').onclick = close;
    $('#td-del').onclick = function () {
      var btn = this;
      if (btn.dataset.armed) { clearTimeout(delTimer); T.remove(S, t.id); save(); render(); WL.toast('Deleted'); return; }
      btn.dataset.armed = 1; btn.textContent = 'Tap again to delete';
      clearTimeout(delTimer);
      delTimer = setTimeout(function () { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Delete'; } }, 4000);
    };
    d.onkeydown = function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
    var ed = $('#td-edit');
    ed.onkeydown = function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); $('#td-save').click(); }
    };
    ed.focus();
  }

  // after a tick the list redraws and the next task's box lands under the finger: the second tap of a double-tap
  // (click detail 2+) must not tick it too
  function secondTap(e) { return !!(e && e.detail > 1); }

  function updatePreview() {
    var pv = $('#td-preview'), inp = $('#td-new');
    if (!pv || !inp) return;
    var q = T.quickParse(inp.value);
    if (!q.text || (!q.due && !q.repeat && !q.at)) { pv.hidden = true; pv.textContent = ''; return; }
    var due = T.firstDue(q), parts = [];
    if (due) parts.push(fmtDue(due));
    if (q.at) parts.push('🔔 ' + T.fmtTime(q.at));
    if (q.repeat) parts.push('↻ ' + repLabel({ due: due, repeat: q.repeat }));
    pv.textContent = 'Will add: “' + q.text + '” · ' + parts.join(' ');
    pv.hidden = false;
  }

  function wire() {
    var ni = $('#td-new'); if (ni) ni.oninput = updatePreview;
    $('#td-form').onsubmit = function (e) {
      e.preventDefault();
      var inp = $('#td-new'), t = T.add(S, inp.value);
      if (!t) { inp.focus(); return; }
      save(); render(); WL.toast(t.due ? 'Added for ' + fmtDue(t.due) + (t.at ? ' at ' + T.fmtTime(t.at) + ' (reminder)' : '') : 'Added'); $('#td-new').focus();
    };
    $$('[data-tick]').forEach(function (b) {
      b.onclick = function (e) {
        if (secondTap(e)) return;
        var t = T.find(S, b.dataset.tick); if (!t) return;
        if (t.done) T.uncomplete(S, t.id); else { T.complete(S, t.id, logNow()); if (t.repeat) WL.toast('Done. Next: ' + fmtDue(t.due)); }
        save(); render();
      };
    });
    $$('[data-more]').forEach(function (b) { b.onclick = function () { var t = T.find(S, b.dataset.more); if (t) sheet(t, b); }; });
    var mv = $('#td-move'); if (mv) mv.onclick = function () { var k = T.moveOverdueToToday(S); save(); render(); WL.toast(k + ' moved to today'); };
    var sd = $('#td-showdone'); if (sd) sd.onclick = function () { showDone = !showDone; render(); };
  }

  /* Home: what's due today, tickable right there. */
  function card() {
    var g = T.groups(S), due = g.overdue.concat(g.today);
    var h = '<div class="meta ui">To do</div>';
    if (!due.length) h += '<h3>Nothing due today</h3>';
    else h += '<h3>' + due.length + ' for today</h3><ul class="list tasks">' + due.slice(0, 4).map(function (t) { return item(t, t.due < T.iso(new Date())); }).join('') + '</ul>' +
      (due.length > 4 ? '<p class="meta ui">and ' + (due.length - 4) + ' more</p>' : '');
    return h + '<div class="row ui"><a class="btn" href="#todo">Open the list</a></div>';
  }
  function wireCard(el) {
    $$('[data-tick]', el).forEach(function (b) {
      b.onclick = function (e) {
        if (secondTap(e)) return;
        var t = T.find(S, b.dataset.tick); if (!t) return;
        T.complete(S, t.id, logNow());
        if (t.repeat) WL.toast('Done. Next: ' + fmtDue(t.due));
        save(); WL.route();
      };
    });
    $$('[data-more]', el).forEach(function (b) { b.style.display = 'none'; });
  }

  WL.register({
    id: 'todo', title: 'To do', short: 'To do', icon: '☑', nav: false,
    storageKeys: [store.key],
    route: function (parts, v) { view = v; render(); },
    card: card, wireCard: wireCard,
    week: function () { var n = T.doneInLast(S, 7); return n ? n + ' to-do' + (n === 1 ? '' : 's') + ' done' : ''; },
    today: function () {
      var g = T.groups(S), due = g.overdue.concat(g.today); if (!due.length) return null;
      var first = String(due[0].text || '').slice(0, 40);
      return { label: 'To do: ' + first + (due.length > 1 ? ' + ' + (due.length - 1) + ' more' : ''), done: false, href: '#todo' };
    },
    validate: function (k, raw) { try { var s = T.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); tidyNow(); syncAlarms(); }
  });
  tidyNow();
  syncAlarms();
  /* Tasks ticked "Done" on a notification: Android hands them over when the app opens or is on screen. */
  window.FCTodoTicked = function (starting) {
    var n = WL.native, lines = '';
    if (!n || !n.todoTicked) return;
    try { lines = n.todoTicked() || ''; } catch (e) { return; }
    // also on every return to the app: reminders reach 8 days ahead, so a repeating one must be topped up even when
    // the to-do screen is never opened (only Home and notifications)
    if (!lines) { syncAlarms(); return; }
    S = store.load();
    var got = T.applyTicked(S, lines);
    if (!got.length) { syncAlarms(); return; }
    save();
    if (starting) return; // the first screen draws after this
    WL.toast('Done: ' + got.map(function (t) { return t.text; }).join(', '));
    var h = location.hash.replace(/\/$/, '');
    if (h === '#todo' || h === '' || h === '#home') WL.route();
  };
  window.FCTodoTicked(true);
})();
