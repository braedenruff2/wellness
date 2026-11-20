/* Faith module (was the Faith Companion app). Screens live under #faith/...:
   #faith/today  #faith/day/N  #faith/pray  #faith/session/day/N  #faith/session/p/ID  #faith/journal  #faith/path  #faith/more  #faith/settings
   Storage: localStorage 'fc.v1' (unchanged). Shared things (look, speech, bell, backup) come from shell.js (WL). */
(function () {
  'use strict';
  function logNow() { return WL.logNow ? WL.logNow() : new Date(); } // the day picked on Home, or now
  var C = window.FCCore, P = window.WLPersonal;
  /* {child} in the content becomes her name from Parenting setup (on the phone only; see lib/personal.js). */
  var CONTENT = P ? P.personalize(window.FC_CONTENT, P.childName()) : window.FC_CONTENT;
  var DAYS = CONTENT.days, PRACTICES = CONTENT.practices, TOTAL = DAYS.length;
  var store = C.makeStore();
  var S = store.load();
  var view = null;
  var native = window.FCAndroid || null;   // the Android app's bridge (absent in a browser)
  var player = null, session = null, quietTimer = null;

  function save() { store.save(S); }
  var finishedAt = -1e9;
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(n) { for (var i = 0; i < DAYS.length; i++) if (DAYS[i].n === n) return DAYS[i]; return null; }
  function practice(id) { for (var i = 0; i < PRACTICES.length; i++) if (PRACTICES[i].id === id) return PRACTICES[i]; return null; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---- speech (shared engine in shell.js) ---- */
  function forSpeech(t) {
    return String(t).replace(/\s*\(([1-3] )?[A-Z][a-z]+( of [A-Z][a-z]+)? \d+:\d+(-\d+)?(, [^)]*)?\)/g, '')
      .replace(/\bLORD\b/g, 'Lord').replace(/\u2026/g, ', ');
  }
  var speech = {
    speak: function (text, done) { WL.speech.speak(forSpeech(text), done, { voice: S.settings.voice, rate: S.settings.rate }); },
    stop: function () { WL.speech.stop(); }
  };
  function bell() { if (S.settings.bell) WL.bell(); }

  /* ---- screens ---- */
  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Up in the night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  function passageHtml(d) {
    return d.passages.map(function (p) {
      return '<div class="meta ui">' + esc(p.label) + '</div>' +
        (p.heading ? '<p class="psalm-title">' + esc(p.heading) + '</p>' : '') +
        '<p class="verse">' + p.verses.map(function (v) { return '<sup>' + v.v + '</sup>' + esc(v.t); }).join(' ') + '</p>';
    }).join('');
  }

  function resumeCard() {
    var r = S.resume;
    if (!r || Date.now() - r.at > 12 * 3600e3) return '';
    var name = r.kind === 'day' ? (day(r.id) ? 'Day ' + r.id + ' guided prayer' : '') : (practice(r.id) ? practice(r.id).title : '');
    if (!name) return '';
    return '<div class="card ui" id="resume"><div class="meta">You stopped part way</div><div class="row"><div class="grow">' + esc(name) +
      '</div><a class="btn primary" href="#faith/session/' + (r.kind === 'day' ? 'day/' : 'p/') + r.id + '/' + (+r.step || 0) + '">Carry on</a>' +
      '<button class="link" id="forget-resume">Not now</button></div></div>';
  }

  function screenToday() {
    var n = C.currentDay(S, TOTAL);
    var today = C.finishedToday(S);
    var html = '<div class="meta ui">' + esc(greeting()) + '</div>';
    html += resumeCard();
    if (window.WLMe) html += WLMe.planLine('faith');
    if (today && n <= TOTAL) {
      html += '<div class="card done-banner ui"><b>You did day ' + today + ' today.</b> That\u2019s enough for one day. ' +
        'Day ' + n + ' is below if you want it, or come back tomorrow. You could also <a href="#faith/pray">pray freely</a>.</div>';
    }
    if (n > TOTAL) {
      html += '<h1>You\u2019ve walked the whole path.</h1><div class="card"><p>All ' + TOTAL + ' days' + (S.round > 1 ? ', for the ' + ordinal(S.round) + ' time' : '') +
        '. However long it took, and whatever it felt like, you kept coming back. Well done.</p>' +
        '<p>From here: the practices under <a href="#faith/pray">Pray</a> are always here, you can read any day again in the <a href="#faith/path">path</a>, ' +
        'and if you haven\u2019t yet, a local church and a pastor can walk the next part with you.</p></div>' +
        '<div class="card ui"><h2>Walk it again</h2><p>Start again at day 1. Your journal stays, and each day shows what you wrote last time, so you can see how you\u2019ve changed. ' +
        'Your ticks are kept too.</p><button class="primary big" id="walk-again">Walk the path again</button></div>';
      return html;
    }
    var lb = C.lookBack(S);
    if (lb) {
      html += '<div class="card"><div class="meta ui">' + (lb.days === 7 ? 'A week' : lb.days === 30 ? 'About a month' : 'About three months') +
        ' ago you wrote</div><p>' + esc(lb.entry.text.slice(0, 280)) + (lb.entry.text.length > 280 ? '\u2026' : '') + '</p></div>';
    }
    return html + dayHtml(day(n), true);
  }

  function dayHtml(d, isToday) {
    var week = null;
    CONTENT.weeks.forEach(function (w) { if (d.n >= w.days[0] && d.n <= w.days[1]) week = w; });
    var done = S.done[d.n];
    var h = '<div class="meta ui">Day ' + d.n + (week ? ' \u00b7 Week ' + week.n + ': ' + esc(week.title) : '') + (done ? ' \u00b7 <span class="tick">\u2713 done</span>' : '') + '</div>';
    h += '<h1>' + esc(d.title) + '</h1>';
    h += '<p class="meta ui">' + esc(d.intro) + '</p>';
    h += '<div class="chips jump ui"><button class="chip" data-jump="pray-card">Pray</button><button class="chip" data-jump="practice">Practice</button><button class="chip" data-jump="write">Write</button></div>';
    h += '<div class="card" id="reading"><h2>Read</h2>' + passageHtml(d) +
      '<div class="row ui"><button id="listen">\u25B6 Listen</button><span class="meta">' + esc(CONTENT.translation) + '</span></div></div>';
    function fit(what, text) { return window.WLMe ? '<div class="ui" style="text-align:right">' + WLMe.fitLink('faith', 'day:' + d.n + ':' + what, text) + '</div>' : ''; }
    h += '<div class="card" id="reflect"><h2>Think</h2>' + d.reflection.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + fit('think', d.reflection.join(' ')) + '</div>';
    h += '<div class="card" id="pray-card"><h2>Pray</h2><p class="key">' + esc(d.keyVerse) + '</p>' +
      '<a class="btn primary big ui" href="#faith/session/day/' + d.n + '">Guided prayer \u00b7 about ' + (+S.settings.minutes) + ' min</a>' +
      '<details class="ui" style="margin-top:10px"><summary>Read the prayer instead</summary><p class="verse" style="margin-top:8px">' + esc(d.prayer) + '</p></details></div>';
    h += '<div class="card" id="practice"><h2>Practice for today</h2><p>' + esc(d.practice) + '</p>' + fit('practice', d.practice) + '</div>';
    if (d.lookBack) h += lookBackWeek(d);
    h += '<div class="card ui" id="write"><h2>Write (optional)</h2><label for="dj">' + esc(d.journal) + '</label>' +
      '<textarea id="dj" data-day="' + d.n + '" placeholder="A line or two is plenty.">' + esc(C.dayJournal(S, d.n)) + '</textarea>' +
      '<div class="saved" id="dj-saved"></div><div id="dj-gentle"></div>' + earlierAnswer(d.n) + '</div>';
    h += '<div class="ui">' + (done
      ? '<button class="link" id="undone" data-day="' + d.n + '">Mark as not done</button>'
      : '<button class="primary big" id="finish" data-day="' + d.n + '">I\u2019ve spent time with today \u2713</button>' +
        '<p class="meta" style="text-align:center;margin-top:8px">No streaks, no pressure. Missed days just wait for you.</p>') + '</div>';
    if (!isToday) h += '<p class="ui"><a href="#faith/path">\u2190 All days</a></p>';
    return h;
  }

  function earlierAnswer(n) {
    var e = C.earlierDayJournal(S, n);
    return e ? '<div class="meta" style="margin-top:10px">Last time (' + ordinal1(e.round) + ' walk) you wrote:</div><p class="verse">' + esc(e.text) + '</p>' : '';
  }
  function ordinal1(n) { return n === 1 ? 'first' : ordinal(n); }

  function lookBackWeek(d) {
    var from = Date.now() - 8 * 864e5;
    var items = S.journal.filter(function (e) { return new Date(e.at).getTime() >= from; }).slice(0, 12);
    var doneCount = C.doneInLast(S, 7);
    var h = '<div class="card"><h2>Your week</h2><p class="ui">You spent time with ' + doneCount + ' day' + (doneCount === 1 ? '' : 's') + ' of the path in the last week. ' +
      (doneCount < 4 ? 'That\u2019s fine: with a newborn, any is a gift. ' : '') + 'Here is what you wrote:</p>';
    if (!items.length) h += '<p class="meta ui">Nothing written this week. That\u2019s fine too.</p>';
    else h += '<ul class="list">' + items.map(entryHtml).join('') + '</ul>';
    return h + '</div>';
  }

  function entryHtml(e) {
    var kinds = { journal: e.day ? 'Day ' + e.day : 'Journal', awe: 'Awe moment', gratitude: 'Thanks' };
    return '<li class="entry"><span class="kind">' + esc(kinds[e.kind] || e.kind) + '</span> <span class="when">' +
      esc(new Date(e.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><p>' + esc(e.text) + '</p></li>';
  }

  function screenPray() {
    var h = '<h1>Pray now</h1><p class="meta ui">Pick anything. Each one can be paused if the baby needs you.</p>';
    h += '<div class="card ui"><div class="row"><span class="grow">Length</span><div class="chips">' + [2, 5, 10].map(function (m) {
      return '<button class="chip" data-min="' + m + '" aria-pressed="' + (S.settings.minutes === m) + '">' + m + ' min</button>';
    }).join('') + '</div></div><div class="row" style="margin-top:8px"><span class="grow">Read aloud</span>' +
      '<button class="chip" id="voice-toggle" aria-pressed="' + !!S.settings.voice + '">' + (S.settings.voice ? 'On' : 'Off') + '</button></div></div>';
    h += '<ul class="list">' + PRACTICES.map(function (p) {
      return '<li><a href="#faith/session/p/' + p.id + '"><h3>' + esc(p.title) + '</h3><div class="meta ui">' + esc(p.when) + ' \u00b7 ' +
        (p.fixed ? p.minutes + ' min' : 'about ' + (+S.settings.minutes) + ' min') + '</div><p style="margin:.3em 0 0">' + esc(p.blurb) + '</p></a></li>';
    }).join('') + '</ul>';
    return h;
  }

  function sessionScript(kind, id) {
    var steps, title, minutes;
    if (kind === 'day') {
      var d = day(id); if (!d) return null;
      var open = (S.prayers || []).filter(function (p) { return !p.answered; }).map(function (p) { return p.text; });
      steps = C.dayScript(d, d.n + (S.round || 1) - 1, open); title = 'Day ' + d.n + ': ' + d.title; minutes = S.settings.minutes;
    } else {
      var p = practice(id); if (!p) return null;
      var tv = day(C.currentDay(S, TOTAL)) || DAYS[DAYS.length - 1];
      steps = p.steps.map(function (s) { return { say: s.say.replace(/\{\{TODAY\}\}/g, tv.keyVerse), wait: s.wait }; });
      title = p.title; minutes = p.fixed ? null : S.settings.minutes;
    }
    if (minutes) steps = C.scaleScript(steps, minutes, S.settings.rate);
    return { steps: steps, title: title, kind: kind, id: id };
  }

  function screenSession(kind, id, from) {
    var sc = sessionScript(kind, id);
    if (!sc) return '<p>Not found. <a href="#faith/today">Back</a></p>';
    session = sc;
    document.body.classList.add('in-session');
    return '<div class="session ui"><div class="row"><button class="link" id="end">\u2715 End</button><div class="grow meta" style="text-align:right">' + esc(sc.title) + '</div></div>' +
      '<div class="progress"><div id="prog"></div></div><div class="line" id="line" aria-live="polite">Ready when you are.</div>' +
      '<div class="meta" id="quiet" style="min-height:1.4em;text-align:center"></div>' +
      '<div class="controls"><button id="back" aria-label="Previous">\u23EE</button><button class="primary main" id="pp" data-from="' + (from || 0) + '">' + (from ? '\u25B6 Carry on' : '\u25B6 Begin') + '</button><button id="skip" aria-label="Next">\u23ED</button></div></div>';
  }

  function startPlayer(from) {
    if (player) player.stop();
    var line = $('#line'), prog = $('#prog'), quiet = $('#quiet'), pp = $('#pp');
    var env = {
      speak: speech.speak, stopSpeech: speech.stop,
      setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (t) { clearTimeout(t); },
      now: function () { return Date.now(); },
      onStep: function (i, step) {
        line.textContent = step.say; line.classList.remove('quiet'); quiet.textContent = '';
        prog.style.width = Math.round(100 * i / session.steps.length) + '%';
        S.resume = { kind: session.kind, id: session.id, step: i, at: Date.now() }; save();
        clearInterval(quietTimer);
        // show the quiet time once the line has been said
        quietTimer = setInterval(function () {
          if (!player || player.phase !== 'quiet') return;
          var left = Math.max(0, Math.round((player.quietLeft - (Date.now() - player.quietStart)) / 1000));
          quiet.textContent = left > 0 ? 'quiet \u00b7 ' + left + ' s' : '';
        }, 500);
      },
      onEnd: function () {
        clearInterval(quietTimer); prog.style.width = '100%'; quiet.textContent = '';
        S.resume = null;
        C.logSession(S, session.kind, session.id, session.title, session.started ? Math.max(0, Date.now() - session.started - player.pausedMs) / 60000 : 0, logNow());
        save(); bell(); keepAwake(false);
        pp.textContent = 'Done'; pp.dataset.state = 'done';
        if (session.kind === 'day' && !S.done[session.id]) {
          line.innerHTML = 'Amen.<br><span class="meta">Would you like to mark day ' + session.id + ' as done?</span>';
          var b = document.createElement('div'); b.className = 'row'; b.style.justifyContent = 'center';
          b.innerHTML = '<button class="primary" id="end-finish">Yes, mark it done</button><a class="btn" href="#faith/day/' + session.id + '">Back to the day</a>';
          line.parentNode.insertBefore(b, line.nextSibling.nextSibling);
          $('#end-finish').onclick = function () { C.finishDay(S, session.id, logNow()); save(); toast('Day ' + session.id + ' done. Go gently.'); location.hash = '#faith/today'; };
        } else line.textContent = 'Amen.';
        if (window.WLMe) line.parentNode.insertAdjacentHTML('beforeend', WLMe.askHtml('faith', session.kind + ':' + session.id + '@' + new Date().toISOString().slice(0, 16), 'Quick questions (optional): they help shape your prayer times'));
      }
    };
    player = new C.Player(session.steps, env);
    if (!from || !session.started) session.started = Date.now();
    keepAwake(true);
    bell();
    player.from = from || 0;
    // a paused-before-it-began player stays paused; Resume starts it (core.js Player.pause in 'idle')
    setTimeout(function () { if (player && player.phase === 'idle') player.start(); }, S.settings.bell ? 1200 : 0);
    pp.textContent = '\u23F8 Pause'; pp.dataset.state = 'playing';
  }

  function keepAwake(on) { WL.keepAwake(on); }

  function screenJournal(tab) {
    tab = tab || 'all';
    var tabs = [['all', 'All'], ['awe', 'Awe moments'], ['gratitude', 'Thanks'], ['prayers', 'Prayer list']];
    var h = '<h1>Journal</h1><div class="tabs2 ui" role="tablist">' + tabs.map(function (t) {
      return '<button role="tab" data-jtab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    if (tab === 'prayers') return h + prayersHtml();
    var hint = { all: 'Anything on your mind or heart.', awe: 'A moment of wonder, beauty, or grace, however small. Over time these add up.', gratitude: 'Something you\u2019re thankful for.' }[tab];
    h += '<div class="card ui"><label for="new-entry">' + esc(hint) + '</label><textarea id="new-entry"></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="add-entry" data-kind="' + (tab === 'all' ? 'journal' : tab) + '">Save</button><span class="grow"></span></div><div id="entry-gentle"></div></div>';
    var items = S.journal.filter(function (e) { return tab === 'all' || e.kind === tab; });
    if (items.length > 5) h += '<div class="ui" style="margin:8px 0"><label class="sr" for="j-search">Search your journal</label><input type="search" id="j-search" placeholder="Search your journal" autocomplete="off"><span class="meta" id="j-found"></span></div>';
    h += items.length ? '<ul class="list card" id="j-list">' + items.map(function (e) {
      return entryHtml(e).replace('</li>', '<button class="link del" data-id="' + esc(e.id) + '" aria-label="Delete">Delete</button></li>');
    }).join('') + '</ul>' : '<p class="meta ui">Nothing here yet.</p>';
    return h;
  }

  function prayersHtml() {
    var h = '<div class="card ui"><label for="new-prayer">Something or someone to pray for</label><input type="text" id="new-prayer">' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="add-prayer">Add</button></div></div>';
    var open = S.prayers.filter(function (p) { return !p.answered; }), answered = S.prayers.filter(function (p) { return p.answered; });
    h += '<div class="card"><h2>Praying for</h2>' + (open.length ? '<ul class="list">' + open.map(function (p) {
      return '<li class="entry"><p>' + esc(p.text) + '</p><div class="row ui"><span class="when grow">since ' + esc(new Date(p.at).toLocaleDateString()) +
        '</span><button class="link answered" data-id="' + esc(p.id) + '">Answered / let go</button><button class="link pdel" data-id="' + esc(p.id) + '">Delete</button></div></li>';
    }).join('') + '</ul>' : '<p class="meta ui">Nothing yet. People you love, worries, hopes: all of it can go here.</p>') + '</div>';
    if (answered.length) h += '<div class="card"><h2>Looking back</h2><p class="meta ui">Prayers can be answered in ways we didn\u2019t expect, or not in ways we can see. Both are part of an honest faith.</p><ul class="list">' +
      answered.map(function (p) { return '<li class="entry"><p>' + esc(p.text) + '</p><span class="when">' + esc(new Date(p.answered).toLocaleDateString()) + (p.note ? ': ' + esc(p.note) : '') + '</span></li>'; }).join('') + '</ul></div>';
    return h;
  }

  function ordinal(n) { return n === 2 ? 'second' : n === 3 ? 'third' : n + 'th'; }

  function screenPath() {
    var cur = C.currentDay(S, TOTAL);
    var h = '<h1>The path</h1><p class="meta ui">You\u2019ve spent time with ' + Object.keys(S.done).length + ' of the ' + TOTAL + ' days' +
      (S.round > 1 ? ' on this ' + ordinal(S.round) + ' walk' : '') + '. Go in order or jump around; it\u2019s yours.</p>';
    CONTENT.weeks.forEach(function (w) {
      h += '<div class="card"><h2>Week ' + w.n + ': ' + esc(w.title) + '</h2><ul class="list">';
      DAYS.filter(function (d) { return d.n >= w.days[0] && d.n <= w.days[1]; }).forEach(function (d) {
        h += '<li><a href="#faith/day/' + d.n + '"><span class="meta ui">Day ' + d.n + ' \u00b7 ' + esc(d.label) + '</span> ' + (S.done[d.n] ? '<span class="tick">\u2713</span>' : d.n === cur ? '<span class="meta ui">\u2190 next</span>' : '') +
          '<br>' + esc(d.title) + '</a></li>';
      });
      h += '</ul></div>';
    });
    return h;
  }

  function screenMore() {
    var shown = C.daysShowedUp(S);
    return '<h1>More</h1><div class="card ui"><p>You have shown up on <b>' + shown + '</b> day' + (shown === 1 ? '' : 's') + '. Every one counts; none of the missed ones do.</p></div>' +
      '<ul class="list card ui"><li><a href="#faith/path">The path: all days</a></li><li><a href="#faith/journal/prayers">Prayer list</a></li><li><a href="#faith/journal/awe">Awe moments</a></li><li><a href="#faith/settings">Settings and backup</a></li></ul>' +
      '<div class="card"><h2>Faith grows with people</h2><p>This app can help you pray, but faith was never meant to be done alone. A few gentle next steps, whenever you\u2019re ready:</p>' +
      '<ul><li>Visit a church near you for a Sunday service; babies are almost always welcome.</li><li>Ask a pastor or priest for a coffee and tell them you\u2019re starting out. They are usually glad to help.</li>' +
      '<li>Pray with your wife, even one line together at bedtime.</li><li>Tell one friend you\u2019re exploring faith.</li></ul></div>' +
      '<div class="card"><h2>When things are heavy</h2><p>If you are struggling a lot (low, anxious, exhausted beyond coping), please talk to someone you trust, your doctor, or a counsellor. New parents often go through this; asking for help is a strong thing to do, and God is in that too.</p></div>' +
      '<p class="meta ui">Scripture: ' + esc(CONTENT.translation) + '. Everything you write stays on this phone.</p>';
  }

  function screenSettings() {
    var st = S.settings;
    function chips(name, vals, cur, labels) {
      return '<div class="chips">' + vals.map(function (v, i) { return '<button class="chip" data-set="' + name + '" data-val="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + (labels ? labels[i] : v) + '</button>'; }).join('') + '</div>';
    }
    return '<h1>Faith settings</h1><p class="ui meta">Look, text size and backup are in the app\u2019s <a href="#settings">Settings</a>.</p><div class="card ui">' +
      '<h3>Guided prayer</h3>' + chips('voice', ['true', 'false'], String(st.voice), ['Read aloud', 'Silent (text only)']) +
      '<div style="margin-top:8px">' + chips('rate', [0.75, 0.9, 1, 1.15], st.rate, ['Slower', 'Gentle', 'Normal', 'Faster']) + '</div>' +
      '<div style="margin-top:8px">' + chips('minutes', [2, 5, 10], st.minutes, ['2 min', '5 min', '10 min']) + '</div>' +
      '<div style="margin-top:8px">' + chips('bell', ['true', 'false'], String(st.bell), ['Soft bell', 'No bell']) + '</div>' +
      '<div class="row" style="margin-top:10px"><button id="test-voice">Test the voice</button></div></div>' +
      (native && native.setReminder ? reminderHtml() : '');
  }

  function reminderHtml() {
    var r = S.settings.reminder || '';
    var blocked = r && native.notificationsAllowed && !native.notificationsAllowed();
    return '<div class="card ui"><h3>Gentle reminder</h3><p class="meta">One quiet notification a day, at a time you choose. Off by default.</p>' +
      '<div class="row"><input type="time" id="rem-time" value="' + esc(r) + '" style="max-width:150px"><button id="rem-set">' + (r ? 'Change' : 'Turn on') + '</button>' +
      (r ? '<button class="link" id="rem-off">Turn off</button>' : '') + '</div>' +
      (blocked ? '<p class="gentle">Notifications are turned off for this app, so the reminder can\u2019t appear. Turn them on in Android Settings > Apps > Wellness > Notifications.</p>' : '') + '</div>';
  }

  /* ---- router (called by the shell for #faith/...) ---- */
  var SUBNAV = [['today', 'Today'], ['pray', 'Pray'], ['journal', 'Journal'], ['more', 'More']];
  function subnav(tab) {
    return '<div class="subnav ui" role="tablist">' + SUBNAV.map(function (t) {
      return '<a href="#faith/' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }
  function leave() {
    clearInterval(quietTimer);
    if (player) { player.stop(); player = null; keepAwake(false); }
  }
  var lastParts = ['today'];
  function route(parts, v) {
    if (v) view = v;
    if (!parts) parts = lastParts; // re-render the current screen after a change
    lastParts = parts;
    var h = parts && parts.length && parts[0] ? parts : ['today'];
    leave();
    var html, tab = h[0];
    switch (h[0]) {
      case 'day': { var d = day(+h[1]); html = d ? dayHtml(d, false) : screenToday(); tab = 'today'; break; }
      case 'pray': html = screenPray(); break;
      case 'session': html = screenSession(h[1], h[1] === 'day' ? +h[2] : h[2], +(h[3] || 0)); tab = 'pray'; break;
      case 'journal': html = screenJournal(h[1]); break;
      case 'path': html = screenPath(); tab = 'more'; break;
      case 'more': html = screenMore(); break;
      case 'settings': html = screenSettings(); tab = 'more'; break;
      default: h = ['today']; html = screenToday(); tab = 'today';
    }
    view.innerHTML = (h[0] === 'session' ? '' : subnav(tab)) + html;
    wire(h);
    S.lastOpen = Date.now(); save();
  }

  function journalSaver(ta) {
    var tmr = null, out = $('#dj-saved'), gentle = $('#dj-gentle');
    function commit() {
      clearTimeout(tmr);
      C.setDayJournal(S, +ta.dataset.day, ta.value, logNow()); save();
      out.textContent = ta.value.trim() ? 'Saved' : '';
      gentle.innerHTML = C.soundsHeavy(ta.value) ? heavyNote() : '';
    }
    ta.addEventListener('input', function () { out.textContent = ''; clearTimeout(tmr); tmr = setTimeout(commit, 600); });
    ta.addEventListener('blur', commit);
  }

  function heavyNote() {
    return '<p class="gentle">It sounds like things may be really hard right now. You don\u2019t have to carry that alone: please consider talking to someone you trust, a pastor, or your doctor. If you are in danger, call your local emergency number.</p>';
  }

  function on(sel, f) { var e = $(sel); if (e) f(e); }

  function wire(h) {
    [].forEach.call(document.querySelectorAll('[data-jump]'), function (b) {
      b.onclick = function () { var t = document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
    on('#forget-resume', function (el) { el.onclick = function () { S.resume = null; save(); $('#resume').remove(); }; });
    on('#dj', function (el) { journalSaver(el); });
    on('#finish', function (el) { el.onclick = function () {
      var n = +el.dataset.day; C.finishDay(S, n, logNow()); save(); finishedAt = performance.now();
      toast('Day ' + n + ' done. Go gently.'); route();
    }; });
    // a double-tap on "I've spent time with today" would land on "Mark as not done" (drawn where it was)
    on('#undone', function (el) { el.onclick = function () { if (performance.now() - finishedAt < 700) return; C.unfinishDay(S, +el.dataset.day); save(); route(); }; });
    on('#walk-again', function (el) { el.onclick = function () {
      if (!el.dataset.armed) { el.dataset.armed = 1; el.textContent = 'Tap again to start at day 1'; return; } // no accidental restarts
      C.walkAgain(S); save(); toast('Day 1 again. Go gently.'); location.hash = '#faith/today'; route(['today']);
    }; });
    on('#listen', function (el) { el.onclick = function () {
      var d = h[0] === 'day' ? day(+h[1]) : day(C.currentDay(S, TOTAL));
      if (el.dataset.on) { speech.stop(); delete el.dataset.on; el.textContent = '\u25B6 Listen'; return; }
      el.dataset.on = 1; el.textContent = '\u25A0 Stop';
      var text = d.passages.map(function (p) { return p.label.replace(':', ', verses ').replace('-', ' to ') + '. ' + p.verses.map(function (v) { return v.t; }).join(' '); }).join(' ');
      var was = S.settings.voice; S.settings.voice = true;
      speech.speak(text, function () { delete el.dataset.on; el.textContent = '\u25B6 Listen'; });
      S.settings.voice = was;
    }; });
    on('#pp', function (el) { {
      var from = +el.dataset.from || 0;
      el.onclick = function () {
        var st = el.dataset.state;
        if (!st) startPlayer(from);
        else if (st === 'playing') { player.pause(); el.textContent = '\u25B6 Resume'; el.dataset.state = 'paused'; keepAwake(false); }
        else if (st === 'paused') { player.resume(); el.textContent = '\u23F8 Pause'; el.dataset.state = 'playing'; keepAwake(true); }
        else if (st === 'done') location.hash = session.kind === 'day' ? '#faith/day/' + session.id : '#faith/pray';
      };
      $('#skip').onclick = function () { if (!player) return; player.skip(); if ($('#pp').dataset.state === 'paused') { $('#pp').textContent = '\u23F8 Pause'; $('#pp').dataset.state = 'playing'; } };
      $('#back').onclick = function () { if (!player) return; player.back(); if ($('#pp').dataset.state === 'paused') { $('#pp').textContent = '\u23F8 Pause'; $('#pp').dataset.state = 'playing'; } };
      $('#end').onclick = function () {
        if (player && player.phase !== 'ended') { S.resume = { kind: session.kind, id: session.id, step: player.place(), at: Date.now() }; save(); }
        if (player) player.stop(); player = null; keepAwake(false);
        history.length > 1 ? history.back() : (location.hash = '#faith/today');
      };
    } });
    [].forEach.call(document.querySelectorAll('[data-min]'), function (b) {
      b.onclick = function () { S.settings.minutes = +b.dataset.min; save(); route(); };
    });
    on('#voice-toggle', function (el) { el.onclick = function () { S.settings.voice = !S.settings.voice; save(); route(); }; });
    on('#j-search', function (el) { el.oninput = function () {
      var q = el.value.trim().toLowerCase(), n = 0;
      [].forEach.call(document.querySelectorAll('#j-list > li'), function (li) { var hit = !q || li.textContent.toLowerCase().indexOf(q) >= 0; li.hidden = !hit; if (hit) n++; });
      $('#j-found').textContent = q ? ' ' + n + ' found' : '';
    }; });
    [].forEach.call(document.querySelectorAll('[data-jtab]'), function (b) { b.onclick = function () { location.hash = '#faith/journal/' + b.dataset.jtab; }; });
    on('#add-entry', function (el) { el.onclick = function () {
      var ta = $('#new-entry'), e = C.addEntry(S, el.dataset.kind, ta.value, null, logNow());
      if (!e) { ta.focus(); return; }
      save(); var heavy = C.soundsHeavy(e.text); route(); toast('Saved');
      if (heavy && $('#entry-gentle')) $('#entry-gentle').innerHTML = heavyNote();
    }; });
    [].forEach.call(document.querySelectorAll('.del'), function (b) {
      b.onclick = function () {
        if (b.dataset.armed) { C.removeEntry(S, b.dataset.id); save(); route(); return; }
        b.dataset.armed = 1; b.textContent = 'Tap again to delete';
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000);
      };
    });
    on('#add-prayer', function (el) { {
      var inp = $('#new-prayer');
      var add = function () { if (C.addPrayer(S, inp.value)) { save(); route(); toast('Added'); } else inp.focus(); };
      el.onclick = add; inp.onkeydown = function (ev) { if (ev.key === 'Enter') add(); };
    } });
    [].forEach.call(document.querySelectorAll('.answered'), function (b) {
      b.onclick = function () {
        // an inline note, not window.prompt (a bright system dialog in the app, and Cancel still marked it answered)
        var row = b.parentNode, f = document.createElement('div');
        f.className = 'ans-form';
        f.innerHTML = '<label>Anything to remember about how this went? (optional)<input type="text" class="ans-note"></label>' +
          '<div class="row" style="margin-top:6px"><button class="primary ans-save">Save</button><button class="link ans-cancel">Cancel</button></div>';
        row.style.display = 'none'; row.parentNode.appendChild(f);
        var inp = f.querySelector('.ans-note'); inp.focus();
        var done = function () {
          var p = S.prayers.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!p) return;
          p.answered = new Date().toISOString(); p.note = inp.value.trim(); save(); route();
        };
        f.querySelector('.ans-save').onclick = done;
        inp.onkeydown = function (ev) { if (ev.key === 'Enter') done(); };
        f.querySelector('.ans-cancel').onclick = function () { f.remove(); row.style.display = ''; };
      };
    });
    [].forEach.call(document.querySelectorAll('.pdel'), function (b) {
      b.onclick = function () {
        if (b.dataset.armed) { S.prayers = S.prayers.filter(function (x) { return x.id !== b.dataset.id; }); save(); route(); return; }
        b.dataset.armed = 1; b.textContent = 'Tap again';
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000);
      };
    });
    [].forEach.call(document.querySelectorAll('[data-set]'), function (b) {
      b.onclick = function () {
        var k = b.dataset.set, v = b.dataset.val;
        S.settings[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        save(); route();
      };
    });
    on('#test-voice', function (el) { el.onclick = function () {
      var was = S.settings.voice; S.settings.voice = true; speech.speak('The Lord is my shepherd; I shall lack nothing.', function () {}); S.settings.voice = was;
    }; });
    on('#rem-set', function (el) { el.onclick = function () {
      var t = $('#rem-time').value; if (!/^\d\d:\d\d$/.test(t)) { toast('Pick a time first'); return; }
      var hm = t.split(':');
      try {
        S.settings.reminder = t; save(); route();
        native.setReminder(+hm[0], +hm[1]); // the app answers with FCReminderPermission(allowed) (Android may ask first)
      } catch (e) { toast('Could not set the reminder'); }
    }; });
    on('#rem-off', function (el) { el.onclick = function () { try { native.setReminder(-1, -1); } catch (e) {} S.settings.reminder = ''; save(); route(); }; });
  }

  function saveNow() { var ta = view && view.querySelector('#dj'); if (ta) { C.setDayJournal(S, +ta.dataset.day, ta.value, logNow()); } save(); }
  window.FCReminderPermission = function (granted) {
    toast(granted ? 'Reminder set for ' + S.settings.reminder : 'Notifications are off, so the reminder can\u2019t show');
    if (location.hash === '#faith/settings') route(['settings']);
  };

  /* Home screen card: today's day of the path. */
  function card() {
    var n = C.currentDay(S, TOTAL), today = C.finishedToday(S), d = day(n);
    var h = '<div class="meta ui">Faith \u00b7 grow closer to God</div>';
    if (today) h += '<h3>Day ' + today + ' done today \u2713</h3><p class="meta ui">' + (d ? 'Next: day ' + n + ', ' + esc(d.title) + '. Tomorrow, or now if you like.' : 'You\u2019ve finished every day written so far.') + '</p>';
    else if (d) h += '<h3>Day ' + n + ': ' + esc(d.title) + '</h3><p class="meta ui">' + esc(d.label) + ' \u00b7 read, think, pray (about ' + (+S.settings.minutes) + ' min)</p>';
    else h += '<h3>Every day written so far is done</h3>';
    h += '<div class="row ui"><a class="btn primary" href="#faith/today">Open</a><a class="btn" href="#faith/session/p/pause">1-minute pause</a></div>';
    return h;
  }

  WL.register({
    id: 'faith', title: 'Faith', short: 'Faith', icon: '\u271D', nav: true,
    storageKeys: [store.key], settingsLink: '#faith/settings',
    route: route, leave: leave, card: card, saveNow: saveNow,
    week: function () { var n = C.doneInLast(S, 7); return n ? n + ' faith day' + (n === 1 ? '' : 's') : ''; },
    today: function () { var t = C.finishedToday(S), n = C.currentDay(S, TOTAL); return t ? { label: 'Faith: day ' + t + ' done', done: true, href: '#faith/today' } : day(n) ? { label: 'Faith: day ' + n + ' (about ' + (+S.settings.minutes) + ' min)', done: false, href: '#faith/today' } : null; },
    pause: function () { var pp = view && view.querySelector('#pp'); if (pp && pp.dataset.state === 'playing') pp.click(); },
    validate: function (k, raw) { try { return JSON.stringify(C.importData(JSON.stringify({ app: 'faith-companion', state: JSON.parse(raw) }))); } catch (e) { return null; } },
    importOld: function (text) { S = C.importData(text); save(); },
    reload: function () { S = store.load(); }
  });
  window.FC = { state: function () { return S; }, reload: function () { S = store.load(); } };
})();
