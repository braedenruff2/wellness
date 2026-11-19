/* Tagalog module: #tagalog (today), #tagalog/l/PACK/DAY (a lesson), #tagalog/review (spaced review), #tagalog/settings. */
(function () {
  'use strict';
  var T = window.TagalogCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.tagalog.v1', T.defaults);
  var S = store.load(), view = null;
  function save() { store.save(S); }
  /* Lessons say {child}; the phone fills in her name from Parenting setup, or "Baby" (lib/personal.js). */
  var P = window.WLPersonal, filled = typeof WeakMap === 'function' ? new WeakMap() : null, filledFor = null;
  function personal(p) {
    if (!P || !p || typeof p !== 'object') return p;
    var name = P.childName();
    if (name !== filledFor) { filledFor = name; if (filled) filled = new WeakMap(); }
    var c = filled && filled.get(p);
    if (!c) { c = P.personalize(p, name, 'Baby'); if (filled) filled.set(p, c); }
    return c;
  }
  function packs() { return T.allPacks(S, window.TL_PACKS || []).map(personal); }
  function findLesson(pid, day) { var p = packs().filter(function (x) { return x.id === pid; })[0]; return p ? { pack: p, lesson: p.lessons.filter(function (l) { return l.day === day; })[0] } : null; }
  function say(text) { WL.speech.speak(text, null, { lang: 'fil-PH', rate: S.settings && S.settings.slow ? 0.8 : 1 }); }
  function hear(t) { return '<button class="link small hear" data-say="' + esc(t) + '" aria-label="Hear it">🔊</button>'; }

  function subnav(tab) {
    return '<div class="subnav ui">' + [['', 'Today'], ['review', 'Review'], ['settings', 'Lessons & sharing']].map(function (t) {
      return '<a href="#tagalog' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }

  function home() {
    var all = packs(), nx = T.nextLesson(S, all), st = T.stats(S);
    var h = subnav('') + '<h1>Tagalog</h1><p class="meta ui">' + esc(T.advice(S, all)) + '</p>';
    if (st.due) h += '<div class="card ui"><div class="row"><div class="grow"><b>' + st.due + '</b> word' + (st.due === 1 ? '' : 's') + ' to review</div><a class="btn primary" href="#tagalog/review">Review</a></div></div>';
    if (nx) h += '<div class="card"><div class="meta ui">Week ' + esc(nx.pack.week || '') + ' · ' + esc(nx.pack.title) + ' · lesson ' + nx.lesson.day + ' of ' + nx.pack.lessons.length + '</div>' +
      '<h3 style="margin:.2em 0">' + esc(nx.lesson.title) + '</h3><p class="meta ui">' + esc(nx.lesson.intro) + '</p>' +
      '<a class="btn primary ui" href="#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day + '">Start lesson · about 10 min</a></div>';
    h += '<div class="card ui"><div class="row"><span class="grow">Words met <b>' + st.words + '</b> · known well <b>' + st.known + '</b></span></div>' +
      '<div class="meta">This week: ' + st.weekLessons + ' lesson' + (st.weekLessons === 1 ? '' : 's') + ', practised on ' + st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') +
      (st.weekAccuracy != null ? ', ' + Math.round(st.weekAccuracy * 100) + '% of answers right' : '') + '</div></div>';
    all.slice().reverse().forEach(function (p) {
      h += '<div class="card"><h2>Week ' + esc(p.week || '') + ': ' + esc(p.title) + '</h2><ul class="list">' + p.lessons.map(function (l) {
        var d = S.done[p.id + '/' + l.day];
        return '<li><a href="#tagalog/l/' + p.id + '/' + l.day + '"><span class="meta ui">Lesson ' + l.day + '</span> ' + (d ? '<span class="tick">✓</span>' : '') + '<br>' + esc(l.title) + '</a></li>';
      }).join('') + '</ul></div>';
    });
    return h;
  }

  function lessonHtml(pk, l) {
    var h = subnav('') + '<div class="meta ui">Week ' + esc(pk.week || '') + ' · lesson ' + l.day + '</div><h1>' + esc(l.title) + '</h1><p>' + esc(l.intro) + '</p>';
    h += '<div class="card"><h2>Words</h2><p class="meta ui">Tap 🔊 to hear each one, then say it out loud.</p><ul class="list">' + l.words.map(function (w) {
      return '<li class="row"><span class="grow"><b lang="tl">' + esc(w.tl) + '</b><br><span class="meta ui">' + esc(w.en) + '</span></span>' + hear(w.tl) + '</li>';
    }).join('') + '</ul></div>';
    if (l.dialogue && l.dialogue.length) h += '<div class="card"><h2>Conversation</h2><div class="row ui"><button class="chip" id="tl-play">▶ Play all</button><button class="chip" id="tl-en" aria-pressed="true">English</button></div><ul class="list dlg">' + l.dialogue.map(function (d) {
      return '<li class="row"><span class="grow"><span class="meta ui">' + esc(d.who) + '</span><br><span lang="tl">' + esc(d.tl) + '</span><br><span class="meta en">' + esc(d.en) + '</span></span>' + hear(d.tl) + '</li>';
    }).join('') + '</ul></div>';
    if (l.grammar) h += '<div class="card"><h2>' + esc(l.grammar.title) + '</h2><p>' + esc(l.grammar.explain) + '</p>' + (l.grammar.examples || []).map(function (x) {
      return '<p class="row"><span class="grow"><b lang="tl">' + esc(x.tl) + '</b><br><span class="meta ui">' + esc(x.en) + '</span></span>' + hear(x.tl) + '</p>';
    }).join('') + '</div>';
    if (l.culture) h += '<div class="card"><h2>Family tip</h2><p>' + esc(l.culture) + '</p></div>';
    h += '<div class="card" id="tl-practice"><h2>Practice</h2><div id="tl-ex"></div></div>';
    return h;
  }

  function shuffle(a, seed) { a = a.slice(); var s = seed || 1; for (var i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function runExercises(pk, l) {
    var i = 0, right = 0, box = $('#tl-ex');
    function show() {
      if (i >= l.exercises.length) {
        T.finishLesson(S, pk, l); save();
        box.innerHTML = '<p class="ui"><b>' + right + ' of ' + l.exercises.length + ' right.</b> ' + (right === l.exercises.length ? 'Excellent.' : right >= l.exercises.length * 0.6 ? 'Good work.' : 'Worth another go tomorrow.') +
          ' The words are now in your review.</p><div class="row ui"><a class="btn primary" href="#tagalog">Done</a><button id="tl-again">Practice again</button></div>';
        $('#tl-again').onclick = function () { i = 0; right = 0; show(); };
        return;
      }
      var ex = l.exercises[i], h = '<div class="meta ui">' + (i + 1) + ' of ' + l.exercises.length + '</div>';
      if (ex.type === 'listen') h += '<p class="ui">Listen and choose the meaning. <button class="chip" id="tl-replay">🔊 Play</button></p>';
      else h += '<p><b>' + esc(ex.prompt) + '</b></p>';
      if (ex.type === 'mc' || ex.type === 'listen') h += '<div class="opts ui">' + shuffle(ex.options, i + l.day * 7).map(function (o) { return '<button class="opt" data-o="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>';
      if (ex.type === 'type') h += '<div class="row ui"><input type="text" id="tl-in" class="grow" autocomplete="off" autocapitalize="off" spellcheck="false" lang="tl"><button class="primary" id="tl-check">Check</button></div>';
      if (ex.type === 'build') h += '<div class="built ui" id="tl-built"></div><div class="opts ui">' + shuffle(ex.words, i + 3).map(function (w, k) { return '<button class="opt word" data-k="' + k + '">' + esc(w) + '</button>'; }).join('') + '</div><div class="row ui"><button id="tl-clear">Clear</button><button class="primary" id="tl-check">Check</button></div>';
      h += '<div id="tl-fb" class="ui" aria-live="polite"></div>';
      box.innerHTML = h;
      if (ex.type === 'listen') { say(ex.say); $('#tl-replay').onclick = function () { say(ex.say); }; }
      var answered = false;
      function done(given) {
        if (answered) return; answered = true;
        var ok = T.check(ex, given);
        if (ok) right++;
        T.recordAnswer(S, pk, l, ex, ok, null, given); save();
        var askable = !ok && ex.type === 'type' && String(given || '').trim() && WL.pc && WL.pc.ready();
        $('#tl-fb').innerHTML = '<p class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ Right!' : '✗ Answer: <b>' + esc(ex.answer) + '</b>') + '</p>' +
          '<div class="row"><button class="primary" id="tl-next">Next</button>' + (askable ? '<button id="tl-ask">Ask Claude about my answer</button>' : '') + '</div><div id="tl-claude" aria-live="polite"></div>';
        if (askable) $('#tl-ask').onclick = function () {
          var b = this; b.disabled = true;
          var out = $('#tl-claude'); out.innerHTML = '<p class="meta">Asking Claude on your PC…</p>';
          WL.pc.ask('tagalog-check', { task: ex.prompt, expected: ex.answer, answer: String(given) }).then(function (a) {
            if (!out.isConnected) return;
            out.innerHTML = '<div class="card">' + (a.ok ? '<p class="ok">Claude: that works too ✓</p>' : '') +
              (a.corrected ? '<p><b lang="tl">' + esc(a.corrected) + '</b>' + (a.meaning ? ' <span class="meta">(' + esc(a.meaning) + ')</span>' : '') + '</p>' : '') +
              (a.explain ? '<p>' + esc(a.explain) + '</p>' : '') + (a.tip ? '<p class="meta">Tip: ' + esc(a.tip) + '</p>' : '') + (a.text ? '<p>' + esc(a.text) + '</p>' : '') + '</div>';
          }, function (e) { if (out.isConnected) out.innerHTML = '<p class="no">' + esc(e.message || e) + '</p>'; b.disabled = false; });
        };
        if (ex.type !== 'mc' || /[a-z]/.test(ex.answer) && ex.type !== 'listen') { /* hear the Tagalog answer when there is one */ }
        if (ex.type === 'type' || ex.type === 'build') say(ex.answer);
        $$('.opt', box).forEach(function (b) { b.disabled = true; if (b.dataset.o === ex.answer) b.classList.add('right'); });
        $('#tl-next').onclick = function () { i++; show(); };
        $('#tl-next').focus();
      }
      $$('[data-o]', box).forEach(function (b) { b.onclick = function () { if (b.dataset.o !== ex.answer) b.classList.add('wrong'); done(b.dataset.o); }; });
      if (ex.type === 'type') { $('#tl-check').onclick = function () { done($('#tl-in').value); }; $('#tl-in').onkeydown = function (e) { if (e.key === 'Enter') done(this.value); }; }
      if (ex.type === 'build') {
        var picked = [];
        var words = shuffle(ex.words, i + 3);
        var draw = function () { $('#tl-built').textContent = picked.map(function (k) { return words[k]; }).join(' ') || '…'; $$('.word', box).forEach(function (b) { b.disabled = answered || picked.indexOf(+b.dataset.k) >= 0; }); };
        $$('.word', box).forEach(function (b) { b.onclick = function () { picked.push(+b.dataset.k); draw(); }; });
        $('#tl-clear').onclick = function () { if (!answered) { picked = []; draw(); } };
        $('#tl-check').onclick = function () { done(picked.map(function (k) { return words[k]; }).join(' ')); };
        draw();
      }
    }
    show();
  }

  function reviewHtml() {
    var due = T.dueCards(S);
    if (!due.length) return subnav('review') + '<h1>Review</h1><p class="ui">Nothing due right now. ' + (Object.keys(S.cards).length ? 'Come back tomorrow.' : 'Finish a lesson and its words will show up here.') + '</p>';
    return subnav('review') + '<h1>Review</h1><p class="meta ui">' + due.length + ' due. Say the meaning out loud, then check.</p><div class="card flash" id="tl-card"></div>';
  }

  function runReview() {
    var due = T.dueCards(S), i = 0, el = $('#tl-card'); if (!el) return;
    function show() {
      if (i >= due.length) { el.innerHTML = '<p class="ui"><b>All done.</b> See you tomorrow.</p><a class="btn" href="#tagalog">Back</a>'; return; }
      var k = due[i], c = S.cards[k];
      el.innerHTML = '<div class="meta ui">' + (i + 1) + ' / ' + due.length + '</div><p class="big" lang="tl">' + esc(k) + ' ' + hear(k) + '</p><div id="tl-ans" hidden><p>' + esc(c.en) + '</p></div>' +
        '<div class="row ui" id="tl-btns"><button class="primary" id="tl-show">Show meaning</button></div>';
      wireHear(el);
      $('#tl-show').onclick = function () {
        $('#tl-ans').hidden = false;
        $('#tl-btns').innerHTML = '<button id="tl-no">Not yet</button><button class="primary" id="tl-yes">Got it</button>';
        $('#tl-no').onclick = function () { T.review(S, k, false); save(); i++; show(); };
        $('#tl-yes').onclick = function () { T.review(S, k, true); save(); i++; show(); };
      };
    }
    show();
  }

  function settingsHtml() {
    var h = subnav('settings') + '<h1>Lessons & sharing</h1>';
    h += '<div class="card ui"><h3>New lessons every Wednesday</h3><p class="meta">Each Wednesday at noon a scheduled Claude run writes next week’s 7 lessons, tailored to what you found hard. They download from GitHub when you open this page (once a day).</p>' +
      '<label for="tl-src">Lessons address</label><input type="text" id="tl-src" value="' + esc(S.source) + '" placeholder="https://raw.githubusercontent.com/you/repo/main/modules/tagalog/packs/">' +
      '<div class="row" style="margin-top:8px"><button id="tl-save-src">Save</button><button class="primary" id="tl-fetch"' + (S.source ? '' : ' disabled') + '>Check for new lessons</button></div>' +
      (S.lastCheck ? '<p class="meta">Last checked ' + esc(new Date(S.lastCheck).toLocaleString()) + '</p>' : '') + '</div>';
    h += '<div class="card ui"><h3>Send my week</h3><p class="meta">So next week’s lessons fit you: save this small file (lessons done, words you missed) and put it in the <b>wellness-progress</b> folder on your PC’s Desktop before Wednesday noon. Nothing else is shared.</p><button id="tl-send">Save my week’s summary</button></div>';
    h += '<div class="card ui"><h3>Voice</h3><div class="chips"><button class="chip" id="tl-slow" aria-pressed="' + !!(S.settings && S.settings.slow) + '">Slower Tagalog voice</button></div>' +
      '<p class="meta">Uses your phone’s Filipino voice. If you hear English pronunciation, install it: Android Settings › Languages › Text-to-speech › Google › Install voice data › Filipino.</p></div>';
    return h;
  }

  function fetchPacks(manual) {
    if (!S.source) return Promise.resolve(0);
    var base = S.source.replace(/\/?$/, '/');
    return fetch(base + 'index.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (idx) {
      var have = {}; packs().forEach(function (p) { have[p.id] = 1; });
      var want = (idx.packs || []).filter(function (id) { return /^\d{4}-\d\d-\d\d$/.test(id) && !have[id]; });
      return Promise.all(want.map(function (id) {
        return fetch(base + id + '.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (p) {
          if (!T.checkPack(p).length && p.id === id) { S.packs[id] = p; return 1; } return 0;
        }).catch(function () { return 0; });
      }));
    }).then(function (got) {
      var n = (got || []).reduce(function (a, b) { return a + b; }, 0);
      S.lastCheck = new Date().toISOString(); save();
      if (manual || n) WL.toast(n ? n + ' new week' + (n > 1 ? 's' : '') + ' of lessons' : 'No new lessons yet');
      return n;
    }).catch(function (e) { if (manual) WL.toast('Couldn’t reach the lessons (' + e.message + ')'); return 0; });
  }

  function wireHear(el) { $$('[data-say]', el).forEach(function (b) { b.onclick = function () { say(b.dataset.say); }; }); }

  function route(parts, v) {
    if (v) view = v;
    parts = parts || [];
    if (!S.settings) S.settings = { slow: true };
    if (parts[0] === 'l') {
      var f = findLesson(parts[1], +parts[2]);
      if (f && f.lesson) {
        view.innerHTML = lessonHtml(f.pack, f.lesson); wireHear(view);
        var en = $('#tl-en'); if (en) en.onclick = function () { var on = en.getAttribute('aria-pressed') !== 'true'; en.setAttribute('aria-pressed', on); $$('.dlg .en').forEach(function (x) { x.hidden = !on; }); };
        var pl = $('#tl-play'); if (pl) pl.onclick = function () {
          var lines = f.lesson.dialogue.map(function (d) { return d.tl; }), k = 0;
          (function next() { if (k < lines.length && location.hash.indexOf('#tagalog/l/') === 0) WL.speech.speak(lines[k++], function () { setTimeout(next, 600); }, { lang: 'fil-PH', rate: S.settings.slow ? 0.8 : 1 }); })();
        };
        runExercises(f.pack, f.lesson);
        return;
      }
    }
    if (parts[0] === 'review') { view.innerHTML = reviewHtml(); runReview(); return; }
    if (parts[0] === 'settings') {
      view.innerHTML = settingsHtml();
      $('#tl-save-src').onclick = function () {
        var u = $('#tl-src').value.trim();
        if (u && !/^https:\/\/raw\.githubusercontent\.com\//.test(u)) { WL.toast('Use a raw.githubusercontent.com address'); return; }
        S.source = u; save(); route(['settings']); WL.toast('Saved');
      };
      $('#tl-fetch').onclick = function () { fetchPacks(true).then(function () { if (location.hash === '#tagalog/settings') route(['settings']); }); };
      $('#tl-send').onclick = function () { WL.saveFile('tagalog-week-' + T.iso(new Date()) + '.json', JSON.stringify(T.weeklySummary(S, packs()), null, 1)); };
      $('#tl-slow').onclick = function () { S.settings.slow = !S.settings.slow; save(); route(['settings']); };
      return;
    }
    view.innerHTML = home();
    // once a day, look for next week's lessons
    if (S.source && (!S.lastCheck || Date.now() - new Date(S.lastCheck).getTime() > 20 * 3600e3)) fetchPacks(false).then(function (n) { if (n && location.hash.replace(/\/$/, '') === '#tagalog') route([]); });
  }

  function card() {
    var all = packs(), nx = T.nextLesson(S, all), st = T.stats(S);
    return '<div class="meta ui">Tagalog</div><h3>' + (nx ? 'Lesson ' + nx.lesson.day + ': ' + esc(nx.lesson.title) : 'All lessons done') + '</h3>' +
      '<p class="meta ui">' + (st.due ? st.due + ' word' + (st.due === 1 ? '' : 's') + ' to review · ' : '') + st.known + ' words known well</p>' +
      '<div class="row ui">' + (nx ? '<a class="btn primary" href="#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day + '">Start</a>' : '') + (st.due ? '<a class="btn" href="#tagalog/review">Review</a>' : '') + '</div>';
  }

  WL.register({
    id: 'tagalog', title: 'Tagalog', short: 'Tagalog', icon: '💬', nav: true, storageKeys: [store.key], settingsLink: '#tagalog/settings',
    route: route, card: card,
    validate: function (k, raw) { try { var s = T.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); },
    weekSummary: function () { return T.weeklySummary(S, packs()); } // the PC link sends it with the activity log
  });
})();
