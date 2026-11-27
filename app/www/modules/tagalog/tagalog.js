/* Tagalog module: #tagalog (today), #tagalog/l/PACK/DAY (a lesson), #tagalog/review (spaced review), #tagalog/settings. */
(function () {
  'use strict';
  var T = window.TagalogCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  function logNow() { return WL.logNow ? WL.logNow() : new Date(); }
  var store = WL.store('wl.tagalog.v1', T.defaults);
  var S = store.load(), view = null, playTok = 0, playTimer = null;
  function save() { store.save(S); }
  function stopPlayback() {
    playTok++; clearTimeout(playTimer); playTimer = null;
    var wkBtn = $('#tl-walk');
    if (wkBtn && wkBtn.getAttribute('aria-pressed') === 'true') {
      wkBtn.setAttribute('aria-pressed', 'false');
      wkBtn.textContent = '🎧 Listen while walking';
    }
    walkScreen(false);
  }
  /* Listening while walking: the screen stays on (so the voice doesn't stop when it would lock) and goes dark
     after 15 s (WL.darkScreen), so the phone can sit in a pocket; a tap shows the lesson. */
  var walking = false;
  function walkScreen(on) {
    if (on === walking) return;
    walking = on;
    document.body.classList.toggle('hide-bar', on);
    if (on && WL.notes && WL.notes.close) WL.notes.close();
    WL.keepAwake(on);
    if (!WL.darkScreen) return;
    if (on && S.settings.walkDark !== false) WL.darkScreen.start({ id: 'tl-dark', label: 'Dark screen while you listen. Tap to show the lesson.', after: 15000 });
    else WL.darkScreen.stop();
  }
  function stopAudio() { stopPlayback(); WL.speech.stop(); if (window.TagalogReview) TagalogReview.clearKey(); }
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
  function say(text, rate) { stopPlayback(); WL.speech.speak(text, null, { lang: 'fil-PH', rate: rate || (S.settings && S.settings.slow ? 0.8 : 1) }); }
  function hear(t) { return '<button class="link small hear" data-say="' + esc(t) + '" aria-label="Hear it">🔊</button>'; }

  function subnav(tab) {
    return '<div class="subnav ui">' + [['', 'Today'], ['review', 'Review'], ['settings', 'Lessons & sharing']].map(function (t) {
      return '<a href="#tagalog' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }

  /* Claude's check of a typed answer (from the PC at once, or later from a cloud run). */
  function checkHtml(a) {
    a = a || {};
    return '<div class="card">' + (a.ok ? '<p class="ok">Claude: that works too ✓</p>' : '') +
      (a.corrected ? '<p><b lang="tl">' + esc(a.corrected) + '</b>' + (a.meaning ? ' <span class="meta">(' + esc(a.meaning) + ')</span>' : '') + '</p>' : '') +
      (a.explain ? '<p>' + esc(a.explain) + '</p>' : '') + (a.tip ? '<p class="meta">Tip: ' + esc(a.tip) + '</p>' : '') + (a.text ? '<p>' + esc(a.text) + '</p>' : '') + '</div>';
  }
  /* Checks the cloud answered (the PC wasn't answering): kept until he closes them on the Tagalog page. */
  if (WL.pc && WL.pc.onCloudAnswer) WL.pc.onCloudAnswer('tagalog-check', function (e, a, m) {
    S.checks = (S.checks || []).concat([{ at: new Date().toISOString(), prompt: String((m && m.task) || '').slice(0, 300), given: String((m && m.answer) || '').slice(0, 300),
      a: e ? { text: e } : T.cleanCheck(a) }]).slice(-20);
    save();
    if (view && /^#tagalog\/?$/.test(location.hash) && !$('#me-sheet')) route([], view);
  });
  function checksHtml() {
    var c = S.checks || [], q = WL.pc && WL.pc.queued ? WL.pc.queued('tagalog-check') : [];
    if (!c.length && !q.length) return '';
    return '<div class="card ui" id="tl-checks"><h2>Claude checked your answers</h2>' +
      (q.length ? '<p class="meta">' + q.length + ' answer' + (q.length === 1 ? '' : 's') + ' waiting: ' + esc(WL.pc.queuedText ? WL.pc.queuedText() : WL.pc.QUEUED) +
        (WL.pc.cancelHtml ? WL.pc.cancelHtml(q.map(function (x) { return x.id; }), q.length === 1 ? 'the waiting check' : 'the waiting checks') : '') + '</p>' : '') +
      c.slice().reverse().map(function (x) {
        return '<p class="meta" style="margin-bottom:0">' + esc(x.prompt) + '</p><p style="margin:.2em 0">You wrote: <span lang="tl">' + esc(x.given) + '</span></p>' + checkHtml(x.a);
      }).join('') + (c.length ? '<div class="row"><button class="link" id="tl-checks-clear">Done, clear these</button></div>' : '') + '</div>';
  }

  function voiceNudgeHtml() {
    var n = WL.native;
    if (!n || !n.voiceStatus) return '';
    try {
      var v = JSON.parse(n.voiceStatus());
      if (!v || v.tagalogVoice !== 'missing' || v.downloading === 'tagalog' || v.tagalog === 'phone') return '';
    } catch (e) { return ''; }
    return '<div class="ui" id="tl-voice-nudge" style="margin:0 0 10px"><p class="meta" style="margin:0">Using the phone’s voice for Tagalog. Download the Filipino voice in Settings › Voice for a natural accent.</p><a class="link" href="#settings/voice">Download the Filipino voice</a></div>';
  }

  function home() {
    var all = packs(), nx = T.nextLesson(S, all), st = T.stats(S);
    var todayIso = T.iso(new Date()), doneToday = Object.keys(S.done).some(function (k) { return T.iso(new Date(S.done[k])) === todayIso; });
    var h = subnav('') + '<h1>Tagalog</h1><p class="meta ui">' + esc(T.advice(S, all)) + '</p>' + voiceNudgeHtml();
    h += checksHtml();
    if (st.due) h += '<div class="card ui"><div class="row"><div class="grow"><b>' + st.due + '</b> word' + (st.due === 1 ? '' : 's') + ' to review</div><a class="btn primary" href="#tagalog/review">Review</a></div></div>';
    if (doneToday) {
      h += '<div class="card done-banner ui" id="tl-done-today"><h3 style="margin:.2em 0">\u2713 Lesson done for today</h3>' +
        '<p class="meta" style="margin-bottom:4px">That\u2019s enough for one day. Come back tomorrow' + (nx ? ' for lesson ' + nx.lesson.day + ' (' + esc(nx.lesson.title) + ')' : '') + '.</p>' +
        (nx ? '<div class="row"><a class="link" id="tl-ahead" href="#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day + '">Want to go ahead? Lesson ' + nx.lesson.day + '</a></div>' : '') + '</div>';
    } else if (nx) {
      h += '<div class="card"><div class="meta ui">Week ' + esc(nx.pack.week || '') + ' · ' + esc(nx.pack.title) + ' · lesson ' + nx.lesson.day + ' of ' + nx.pack.lessons.length + '</div>' +
        '<h3 style="margin:.2em 0">' + esc(nx.lesson.title) + '</h3><p class="meta ui">' + esc(nx.lesson.intro) + '</p>' +
        '<a class="btn primary ui" href="#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day + '">Start lesson · about 10 min</a></div>';
    }
    if (T.practiceSet(S, all, 1).length) h += '<div class="card ui"><div class="row"><div class="grow"><b>Mixed practice</b><div class="meta">8 exercises from lessons you’ve done, the ones you missed first</div></div><a class="btn' + (nx ? '' : ' primary') + '" href="#tagalog/practice">Practise</a></div></div>';
    h += '<div class="card ui"><div class="row"><span class="grow">Words met <b>' + st.words + '</b> · known well <b>' + st.known + '</b></span>' + (st.words ? '<a class="btn" href="#tagalog/words">Your words</a>' : '') + '</div>' +
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
    var h = subnav('') + '<div class="meta ui">Week ' + esc(pk.week || '') + ' · lesson ' + l.day + '</div><h1>' + esc(l.title) + '</h1><p>' + esc(l.intro) + '</p>' +
      (window.WLMe ? '<div class="ui" style="text-align:right">' + WLMe.fitLink('tagalog', 'lesson:' + pk.id + '/' + l.day, l.title + ': ' + l.intro) + '</div>' : '');
    h += '<div class="card"><h2>Words</h2><p class="meta ui">Tap 🔊 to hear each one, then say it out loud.</p>' +
      '<div class="row ui" style="margin-bottom:6px"><button class="chip" id="tl-walk" aria-pressed="false">🎧 Listen while walking</button></div><ul class="list">' + l.words.map(function (w) {
      return '<li class="row"><span class="grow"><b lang="tl">' + esc(w.tl) + '</b><br><span class="meta ui">' + esc(w.en) + '</span></span>' + hear(w.tl) + '</li>';
    }).join('') + '</ul></div>';
    if (l.dialogue && l.dialogue.length) h += '<div class="card"><h2>Conversation</h2><div class="row ui"><button class="chip" id="tl-play">▶ Play all</button><button class="chip" id="tl-en" aria-pressed="true">English</button></div><ul class="list dlg">' + l.dialogue.map(function (d) {
      return '<li class="row"><span class="grow"><span class="meta ui">' + esc(d.who) + '</span><br><span lang="tl">' + esc(d.tl) + '</span><br><span class="meta en">' + esc(d.en) + '</span></span>' + hear(d.tl) + '<button class="link small hear" data-say-slow="' + esc(d.tl) + '" aria-label="Hear it slowly">🐢</button></li>';
    }).join('') + '</ul></div>';
    if (l.grammar) h += '<div class="card"><h2>' + esc(l.grammar.title) + '</h2><p>' + esc(l.grammar.explain) + '</p>' + (l.grammar.examples || []).map(function (x) {
      return '<p class="row"><span class="grow"><b lang="tl">' + esc(x.tl) + '</b><br><span class="meta ui">' + esc(x.en) + '</span></span>' + hear(x.tl) + '</p>';
    }).join('') + '</div>';
    if (l.culture && !(window.WLMe && WLMe.flagged && WLMe.flagged('tagalog', 'tip:' + pk.id + '/' + l.day))) h += '<div class="card"><h2>Family tip</h2><p>' + esc(l.culture) + '</p>' + (window.WLMe ? '<div class="ui" style="text-align:right">' + WLMe.fitLink('tagalog', 'tip:' + pk.id + '/' + l.day, l.culture) + '</div>' : '') + '</div>';
    h += '<div class="card" id="tl-practice"><h2>Practice</h2><div id="tl-ex"></div></div>';
    return h;
  }

  function shuffle(a, seed) { a = a.slice(); var s = seed || 1; for (var i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function runExercises(pk, l) {
    runSet(l.exercises.map(function (ex) { return { pack: pk, lesson: l, ex: ex }; }), function (right, n, notes) {
      T.finishLesson(S, pk, l, logNow()); save();
      return '<p class="ui"><b>' + right + ' of ' + n + ' right.</b> ' + (right === n ? 'Excellent.' : right >= n * 0.6 ? 'Good work.' : 'Worth another go tomorrow.') +
        ' The words are now in your review.</p>' + watchHtml(notes) + (window.WLMe ? WLMe.askHtml('tagalog', pk.id + '/' + l.day, 'Quick question (optional): it shapes next week’s lessons') : '') + '<div class="row ui"><a class="btn primary" href="#tagalog">Done</a><button id="tl-again">Practice again</button></div>';
    });
  }

  var SLIP_LABEL = T.HINT_LABEL;
  /* The specific slips from this lesson (word order, short words, linkers, verb forms): once more with the right sentence. */
  function watchHtml(notes) {
    if (!notes || !notes.length) return '';
    var label = SLIP_LABEL;
    return '<div class="card ui" id="tl-watch"><h3>Watch for next time</h3><ul class="list">' + notes.map(function (x) {
      return '<li class="row"><span class="grow"><span class="meta">' + esc(label[x.kind] || '') + '</span><br><b lang="tl">' + esc(x.answer) + '</b></span>' + hear(x.answer) + '</li>';
    }).join('') + '</ul></div>';
  }

  /* Exercises one after another ([{pack, lesson, ex}]); finish(right, n, notes) gives the closing HTML (#tl-again
     restarts); notes: [{kind, answer}] for answers that got a specific hint. */
  function runSet(items, finish, wire) {
    var i = 0, right = 0, box = $('#tl-ex'), notes = [];
    function show() {
      if (i >= items.length) {
        box.innerHTML = finish(right, items.length, notes);
        wireHear(box);
        var again = $('#tl-again'); if (again) again.onclick = function () { i = 0; right = 0; notes = []; show(); };
        if (wire) wire(box);
        return;
      }
      var pk = items[i].pack, l = items[i].lesson, ex = items[i].ex, h = '<div class="meta ui">' + (i + 1) + ' of ' + items.length + '</div>';
      if (ex.type === 'listen') h += '<p class="ui">Listen and choose the meaning. <button class="chip" id="tl-replay">🔊 Play</button></p>';
      else h += '<p><b>' + esc(ex.prompt) + '</b></p>';
      if (ex.type === 'mc' || ex.type === 'listen') h += '<div class="opts ui">' + shuffle(ex.options, i + l.day * 7).map(function (o) { return '<button class="opt" data-o="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>';
      if (ex.type === 'type') h += '<div class="row ui"><input type="text" id="tl-in" class="grow" autocomplete="off" autocapitalize="off" spellcheck="false" lang="tl"><button class="primary" id="tl-check">Check</button></div>';
      if (ex.type === 'build') {
        var buildWords = shuffle(ex.words, i + 3).map(T.bubbleWord);
        h += '<div class="built ui" id="tl-built"></div><div class="opts ui">' + buildWords.map(function (w, k) { return '<button class="opt word" data-k="' + k + '">' + esc(w) + '</button>'; }).join('') + '</div><div class="row ui"><button id="tl-clear">Clear</button><button class="primary" id="tl-check">Check</button></div>';
      }
      h += '<div id="tl-fb" class="ui" aria-live="polite"></div>';
      box.innerHTML = h;
      if (ex.type === 'listen') { say(ex.say); $('#tl-replay').onclick = function () { say(ex.say); }; }
      var answered = false;
      function done(given) {
        if (answered) return; answered = true;
        var ok = T.check(ex, given);
        if (ok) right++;
        T.recordAnswer(S, pk, l, ex, ok, logNow(), given); save();
        var askable = !ok && ex.type === 'type' && String(given || '').trim() && WL.pc && (WL.pc.canAsk ? WL.pc.canAsk() : WL.pc.ready());
        var hint = !ok && T.orderHint ? T.orderHint(ex, given) : '', link = !ok && !hint && T.linkerHint ? T.linkerHint(ex, given) : '', asp = !ok && !hint && !link && T.aspectHint ? T.aspectHint(ex, given) : '';
        var hk = !ok && T.hintKind ? T.hintKind(ex, given) : '';
        if (hk && !notes.some(function (x) { return x.answer === ex.answer; })) notes.push({ kind: hk, answer: ex.answer });
        $('#tl-fb').innerHTML = '<p class="' + (ok ? 'ok' : 'no') + '"' + (hint ? ' id="tl-order"' : link ? ' id="tl-linker"' : asp ? ' id="tl-aspect"' : '') + '>' +
          (ok ? '✓ Right!' : hint ? '✗ ' + esc(hint) : link ? '✗ ' + esc(link) : asp ? '✗ ' + esc(asp) : '✗ Answer: <b>' + esc(ex.answer) + '</b>') + '</p>' +
          (ok && T.missedPo(ex, given) ? '<p class="meta" id="tl-po">With an elder, add “po”: <b>' + esc(ex.answer) + '</b></p>' :
            ok && T.altOf && T.altOf(ex, given) ? '<p class="meta" id="tl-alt">The lesson’s version: <b>' + esc(ex.answer) + '</b></p>' : '') +
          '<div class="row"><button class="primary" id="tl-next">Next</button>' + (askable ? '<button id="tl-ask">Ask Claude about my answer</button>' : '') + '</div><div id="tl-claude" aria-live="polite"></div>';
        if (askable) $('#tl-ask').onclick = function () {
          var b = this; b.disabled = true;
          var out = $('#tl-claude'); out.innerHTML = '<p class="meta">' + (WL.pc.ready() ? 'Asking Claude on your PC…' : 'Asking Claude…') + '</p>';
          var input = { task: ex.prompt, expected: ex.answer, answer: String(given) };
          WL.pc.ask('tagalog-check', input, null, input).then(function (a) {
            if (!out.isConnected) return;
            out.innerHTML = checkHtml(a);
          }, function (e) {
            if (!out.isConnected) return;
            if (e.queued) { out.innerHTML = '<p class="meta">' + esc(e.message) + ' It will show on the Tagalog page.</p>'; return; }
            out.innerHTML = '<p class="no">' + esc(e.message || e) + '</p>'; b.disabled = false;
          });
        };
        if (ex.type !== 'mc' || /[a-z]/.test(ex.answer) && ex.type !== 'listen') { /* hear the Tagalog answer when there is one */ }
        if (ex.type === 'type' || ex.type === 'build') say(ex.answer);
        $$('.opt, .built-w, #tl-clear, #tl-check', box).forEach(function (b) { b.disabled = true; if (b.dataset.o === ex.answer) b.classList.add('right'); });
        $('#tl-next').onclick = function () { i++; show(); };
        $('#tl-next').focus();
      }
      $$('[data-o]', box).forEach(function (b) { b.onclick = function () { if (b.dataset.o !== ex.answer) b.classList.add('wrong'); done(b.dataset.o); }; });
      if (ex.type === 'type') { $('#tl-check').onclick = function () { done($('#tl-in').value); }; $('#tl-in').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!answered) done(this.value); } }; }
      if (ex.type === 'build') {
        var picked = [];
        var words = shuffle(ex.words, i + 3).map(T.bubbleWord);
        var draw = function () {
          var el = $('#tl-built');
          el.innerHTML = picked.length
            ? picked.map(function (k, pos) { return '<button type="button" class="chip built-w" data-pos="' + pos + '" aria-label="Remove ' + esc(words[k]) + '"' + (answered ? ' disabled' : '') + '>' + esc(words[k]) + '</button>'; }).join(' ')
            : '<span class="meta">…</span>';
          $$('.built-w', el).forEach(function (b) { b.onclick = function () { if (!answered) { picked.splice(+b.dataset.pos, 1); draw(); } }; });
          $$('.word', box).forEach(function (b) { b.disabled = answered || picked.indexOf(+b.dataset.k) >= 0; });
        };
        $$('.word', box).forEach(function (b) { b.onclick = function () { picked.push(+b.dataset.k); draw(); }; });
        $('#tl-clear').onclick = function () { if (!answered) { picked = []; draw(); } };
        $('#tl-check').onclick = function () { done(picked.map(function (k) { return words[k]; }).join(' ')); };
        draw();
      }
    }
    show();
  }

  /* Every word met: the hard ones first (most often wrong), then the rest, known-well ones marked; tap 🔊 to hear. */
  /* Where a word came from when it wasn't a lesson: a recipe he cooked (card.from 'cook/<id>'). */
  function fromLine(c) {
    var m = /^cook\/(.+)$/.exec(String(c.from || '')); if (!m) return '';
    var r = window.CookCore && CookCore.recipeById ? CookCore.recipeById(null, m[1]) : null;
    return '<span class="tl-from"> · from ' + esc(r ? String(r.title).split(' (')[0] : 'a recipe') + '</span>';
  }
  function wordsHtml() {
    var keys = Object.keys(S.cards), hard = T.weakWords(S, 10), known = keys.filter(function (k) { return S.cards[k].box >= 3; });
    var row = function (k) { var c = S.cards[k]; return '<li class="row"><span class="grow"><b lang="tl">' + esc(k) + '</b><br><span class="meta">' + esc(c.en) + ((c.seen || 0) >= 2 ? '<span class="tl-score"> · right ' + (c.right || 0) + ' of ' + c.seen + '</span>' : '') + (c.againMiss > 0 ? '<span class="tl-again"> · missed again ' + (c.againMiss > 1 ? c.againMiss + '×' : 'once') + '</span>' : '') + fromLine(c) + '</span></span>' + (c.box >= 3 ? '<span class="tick" title="known well">✓</span>' : '') + hear(k) + '</li>'; };
    var h = subnav('') + '<h1>Your words</h1><p class="meta ui">' + keys.length + ' met · ' + known.length + ' known well (✓).</p>';
    if (keys.length >= 10) h += '<div class="ui" style="margin:8px 0"><label class="sr" for="tl-word-search">Search your words</label><input type="search" id="tl-word-search" placeholder="Search Tagalog or English" autocomplete="off"><span class="meta" id="tl-word-found"></span></div>';
    if (hard.length) h += '<div class="card"><h2>Hard ones</h2><p class="meta ui">Missed most often. Say each one out loud a few times.</p><ul class="list" id="tl-hard">' + hard.map(row).join('') + '</ul>' +
      '<div class="row ui"><a class="btn primary" id="tl-practise-hard" href="#tagalog/review/hard">Practise these</a><span class="meta">Extra practice: your review days stay as they are.</span></div></div>';
    var sl = T.slips ? T.slips(S, packs(), new Date(), 6) : [];
    if (sl.length) h += '<div class="card"><h2>Slips to watch</h2><p class="meta ui">From the last two weeks: the lesson’s sentence, to hear and say once more.</p><ul class="list" id="tl-slips">' + sl.map(function (x) {
      return '<li class="row"><span class="grow"><span class="meta">' + esc(SLIP_LABEL[x.kind] || '') + (x.given ? ' · you wrote “' + esc(x.given) + '”' : '') + '</span><br><b lang="tl">' + esc(x.answer) + '</b></span>' + hear(x.answer) + '</li>';
    }).join('') + '</ul><div class="row ui"><a class="btn primary" id="tl-practise-slips" href="#tagalog/slips">Practise these</a><span class="meta">Each one once more. Your review days stay as they are.</span></div></div>';
    var rest = keys.filter(function (k) { return hard.indexOf(k) < 0; }).sort(function (a, b) { return a.localeCompare(b); });
    if (rest.length) h += '<div class="card"><h2>All the others</h2><ul class="list" id="tl-all">' + rest.map(row).join('') + '</ul></div>';
    return h;
  }

  function wireWords() {
    wireHear(view);
    var ws = $('#tl-word-search');
    if (ws) ws.oninput = function () {
      var q = ws.value.trim().toLowerCase(), n = 0;
      ['#tl-slips', '#tl-hard', '#tl-all'].forEach(function (sel) {
        var ul = $(sel), shown = 0;
        if (!ul) return;
        $$('li', ul).forEach(function (li) {
          var txt = ['b', '.meta'].map(function (s) { var x = li.querySelector(s); return x ? x.textContent : ''; }).join(' ').toLowerCase();
          var hit = !q || txt.indexOf(q) >= 0;
          li.hidden = !hit;
          if (hit) { shown++; n++; }
        });
        var card = ul.closest('.card');
        if (card) card.hidden = !!q && shown === 0;
      });
      var out = $('#tl-word-found'); if (out) out.textContent = q ? ' ' + n + ' found' : '';
    };
  }

  var reviewCtx = { state: function () { return S; }, subnav: subnav, hear: hear, wireHear: wireHear, say: say, packs: packs, logNow: logNow, save: save };

  function settingsHtml() {
    var h = subnav('settings') + '<h1>Lessons & sharing</h1>';
    h += '<div class="card ui"><h3>New lessons every Wednesday</h3><p class="meta">Each Wednesday at noon a scheduled Claude run writes next week’s 7 lessons, tailored to what you found hard. They download from GitHub when you open this page (once a day).</p>' +
      '<label for="tl-src">Lessons address</label><input type="text" id="tl-src" value="' + esc(S.source) + '" placeholder="https://raw.githubusercontent.com/you/repo/main/modules/tagalog/packs/">' +
      '<div class="row" style="margin-top:8px"><button id="tl-save-src">Save</button><button class="primary" id="tl-fetch"' + (S.source ? '' : ' disabled') + '>Check for new lessons</button></div>' +
      (S.lastCheck ? '<p class="meta">Last checked ' + esc(new Date(S.lastCheck).toLocaleString()) + '</p>' : '') + '</div>';
    h += '<div class="card ui"><h3>Send my week</h3><p class="meta">So next week’s lessons fit you: save this small file (lessons done, words you missed) and put it in the <b>wellness-progress</b> folder on your PC’s Desktop before Wednesday noon. Nothing else is shared.</p><button id="tl-send">Save my week’s summary</button></div>';
    h += '<div class="card ui"><h3>Voice</h3><div class="chips"><button class="chip" id="tl-slow" aria-pressed="' + !!(S.settings && S.settings.slow) + '">Slower Tagalog voice</button>' +
      '<button class="chip" id="tl-walkdark" aria-pressed="' + !(S.settings && S.settings.walkDark === false) + '">Dark screen while listening</button></div>' +
      '<p class="meta">Uses your phone’s Filipino voice. If you hear English pronunciation, install it: Android Settings › Languages › Text-to-speech › Google › Install voice data › Filipino.</p></div>';
    return h;
  }

  function fetchPacks(manual) {
    if (!S.source) return Promise.resolve(0);
    var base = S.source.replace(/\/?$/, '/');
    return fetch(base + 'index.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (idx) {
      if (!idx || typeof idx !== 'object' || !Array.isArray(idx.packs)) throw new SyntaxError('not a lessons index');
      var have = {}; packs().forEach(function (p) { have[p.id] = 1; });
      var hashes = idx.hashes && typeof idx.hashes === 'object' ? idx.hashes : {}, hs = S.packHash || (S.packHash = {}), isNew = {};
      // new weeks, and weeks corrected since (their hash changed): downloaded ones, and ones inside the app (TL_PACK_HASH)
      var inApp = window.TL_PACK_HASH || {};
      var want = (idx.packs || []).filter(function (id) {
        if (!/^\d{4}-\d\d-\d\d$/.test(id)) return false;
        if (!have[id]) return (isNew[id] = true);
        if (typeof hashes[id] !== 'string') return false;
        if (S.packs[id]) return hs[id] !== hashes[id];
        return typeof inApp[id] === 'string' && inApp[id] !== hashes[id];
      });
      return Promise.all(want.map(function (id) {
        return fetch(base + id + '.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (p) {
          if (!T.checkPack(p).length && p.id === id) { S.packs[id] = p; if (typeof hashes[id] === 'string') hs[id] = hashes[id]; return isNew[id] ? 1 : 0; } return 0;
        }).catch(function () { return 0; });
      }));
    }).then(function (got) {
      var n = (got || []).reduce(function (a, b) { return a + b; }, 0);
      S.lastCheck = new Date().toISOString(); save();
      if (manual || n) WL.toast(n ? n + ' new week' + (n > 1 ? 's' : '') + ' of lessons' : 'No new lessons yet');
      return n;
    }).catch(function (e) {
      // a Wi-Fi sign-in page or a cut-off download isn't JSON: say so plainly (the old lessons stay; it tries again later)
      var why = /^HTTP /.test(e.message || '') ? e.message : e instanceof SyntaxError ? 'the answer wasn’t lessons: does this Wi-Fi need a sign-in?' : 'no internet?';
      if (manual) WL.toast('Couldn’t get new lessons (' + why + '). Your lessons are all still here.');
      return 0;
    });
  }

  function wireHear(el) {
    $$('[data-say]', el).forEach(function (b) { b.onclick = function () { say(b.dataset.say); }; });
    // 🐢 on conversation lines: that one line much slower, whatever the voice setting
    $$('[data-say-slow]', el).forEach(function (b) { b.onclick = function () { say(b.dataset.saySlow, 0.6); }; });
  }

  function route(parts, v) {
    if (v) view = v;
    stopAudio();
    parts = parts || [];
    if (!S.settings) S.settings = { slow: true };
    if (parts[0] === 'l') {
      var f = findLesson(parts[1], +parts[2]);
      if (f && f.lesson) {
        view.innerHTML = lessonHtml(f.pack, f.lesson); wireHear(view);
        var en = $('#tl-en'); if (en) en.onclick = function () { var on = en.getAttribute('aria-pressed') !== 'true'; en.setAttribute('aria-pressed', on); $$('.dlg .en').forEach(function (x) { x.hidden = !on; }); };
        var pl = $('#tl-play'); if (pl) pl.onclick = function () {
          stopAudio();
          var tok = playTok, here = location.hash, lines = f.lesson.dialogue.map(function (d) { return d.tl; }), k = 0;
          (function next() {
            if (tok !== playTok || location.hash !== here || k >= lines.length) return;
            WL.speech.speak(lines[k++], function () { if (tok === playTok) playTimer = setTimeout(next, 600); }, { lang: 'fil-PH', rate: S.settings.slow ? 0.8 : 1 });
          })();
        };
        // hands-free: each word in Tagalog, its meaning, the Tagalog again (time to repeat it), then the conversation
        var wk = $('#tl-walk'); if (wk) wk.onclick = function () {
          if (wk.getAttribute('aria-pressed') === 'true') { wk.setAttribute('aria-pressed', 'false'); wk.textContent = '🎧 Listen while walking'; stopAudio(); return; }
          stopAudio();
          wk.setAttribute('aria-pressed', 'true'); wk.textContent = '■ Stop listening'; walkScreen(true);
          var tok = playTok, here = location.hash, rate = S.settings.slow ? 0.8 : 1, seq = [];
          f.lesson.words.forEach(function (w) { seq.push([w.tl, 'fil-PH', 900], [w.en, '', 900], [w.tl, 'fil-PH', 2500]); });
          (f.lesson.dialogue || []).forEach(function (d) { seq.push([d.tl, 'fil-PH', 1500]); });
          var k = 0;
          (function next() {
            if (tok !== playTok || location.hash !== here || wk.getAttribute('aria-pressed') !== 'true') return;
            if (k >= seq.length) { wk.setAttribute('aria-pressed', 'false'); wk.textContent = '🎧 Listen again'; walkScreen(false); return; }
            var it = seq[k++];
            WL.speech.speak(it[0], function () { if (tok === playTok) playTimer = setTimeout(next, it[2]); }, it[1] ? { lang: it[1], rate: rate } : { rate: 1 });
          })();
        };
        runExercises(f.pack, f.lesson);
        return;
      }
    }
    if (parts[0] === 'practice') {
      var set = T.practiceSet(S, packs(), 8);
      if (!set.length) { view.innerHTML = subnav('') + '<h1>Mixed practice</h1><p class="ui">Finish a lesson first: practice mixes the exercises from lessons you’ve done.</p>'; return; }
      view.innerHTML = subnav('') + '<h1>Mixed practice</h1><p class="meta ui">From lessons you’ve done. Say each answer out loud too.</p><div class="card" id="tl-practice"><div id="tl-ex"></div></div>';
      runSet(set, function (right, n) {
        return '<p class="ui"><b>' + right + ' of ' + n + ' right.</b> ' + (right === n ? 'Excellent.' : 'The ones you missed come back first next time.') +
          '</p>' + (window.WLMe ? WLMe.askHtml('tagalog', 'practice@' + new Date().toISOString().slice(0, 16), 'Quick question (optional): it shapes next week’s lessons') : '') + '<div class="row ui"><a class="btn primary" href="#tagalog">Done</a><button id="tl-more">Another 8</button></div>';
      }, function () { $('#tl-more').onclick = function () { route(['practice']); }; });
      return;
    }
    if (parts[0] === 'slips') {
      var ss = T.slipSet(S, packs(), new Date(), 6);
      if (!ss.length) { view.innerHTML = subnav('') + '<h1>Slips to watch</h1><p class="ui">No slips from the last two weeks. Nice.</p><div class="row ui"><a class="btn" href="#tagalog/words">Your words</a></div>'; return; }
      view.innerHTML = subnav('') + '<h1>Slips to watch</h1><p class="meta ui">The sentences you nearly had. Say each answer out loud too.</p><div class="card" id="tl-slip-run"><div id="tl-ex"></div></div>';
      runSet(ss, function (right, n) {
        return '<p class="ui"><b>' + right + ' of ' + n + ' right.</b> ' + (right === n ? 'All of them this time.' : 'The ones you missed stay on the list.') + '</p>' +
          '<div class="row ui"><a class="btn primary" href="#tagalog/words">Your words</a><button id="tl-again">Go again</button></div>';
      });
      return;
    }
    if (parts[0] === 'review') { var hd = parts[1] === 'hard'; view.innerHTML = TagalogReview.html(reviewCtx, hd); TagalogReview.run(reviewCtx, hd); return; }
    if (parts[0] === 'words') { view.innerHTML = wordsHtml(); wireWords(); return; }
    if (parts[0] === 'settings') {
      view.innerHTML = settingsHtml();
      $('#tl-save-src').onclick = function () {
        var u = $('#tl-src').value.trim();
        if (u && !/^https:\/\/raw\.githubusercontent\.com\//.test(u)) { WL.toast('Use a raw.githubusercontent.com address'); return; }
        S.source = u; save(); route(['settings']); WL.toast('Saved');
      };
      var editingSrc = function () {
        var el = $('#tl-src');
        return !!el && (document.activeElement === el || el.value.trim() !== (S.source || ''));
      };
      $('#tl-fetch').onclick = function () { fetchPacks(true).then(function () { if (location.hash === '#tagalog/settings' && !editingSrc() && !$('#me-sheet')) route(['settings']); }); };
      $('#tl-send').onclick = function () { WL.saveFile('tagalog-week-' + T.iso(new Date()) + '.json', JSON.stringify(weekSummary(), null, 1)); };
      $('#tl-slow').onclick = function () { S.settings.slow = !S.settings.slow; save(); route(['settings']); };
      $('#tl-walkdark').onclick = function () { S.settings.walkDark = S.settings.walkDark === false; save(); route(['settings']); };
      return;
    }
    view.innerHTML = home();
    var cc = $('#tl-checks-clear'); if (cc) cc.onclick = function () { S.checks = []; save(); route([]); };
    // once a day, look for next week's lessons
    if (S.source && (!S.lastCheck || Date.now() - new Date(S.lastCheck).getTime() > 20 * 3600e3)) fetchPacks(false).then(function (n) { if (n && location.hash.replace(/\/$/, '') === '#tagalog' && !$('#me-sheet')) route([]); });
  }

  /* The week's summary for next week's lessons, with how the lessons felt to him ("That was: too easy / about right /
     too hard" after lessons, review and practice; "Not for me?" on lessons and tips) from the last 14 days. */
  function weekSummary() {
    var sum = T.weeklySummary(S, packs());
    try {
      var M = window.WLMe && WLMe.state(), from = new Date(Date.now() - 14 * 864e5).toISOString();
      if (M) sum.feel = M.feedback.filter(function (f) { return f.part === 'tagalog' && f.at >= from; }).slice(-40).map(function (f) {
        return f.kind === 'notfit' ? { about: f.about, notForMe: f.a.reasons || [], note: f.note || '' } : { about: f.about, level: f.a.level || null };
      });
    } catch (e) {}
    return sum;
  }

  function card() {
    var all = packs(), nx = T.nextLesson(S, all), st = T.stats(S);
    var todayIso = T.iso(new Date()), doneToday = Object.keys(S.done).some(function (k) { return T.iso(new Date(S.done[k])) === todayIso; });
    if (doneToday) {
      return '<div class="meta ui">Tagalog</div><h3>\u2713 Lesson done today</h3>' +
        '<p class="meta ui">' + (nx ? 'Next tomorrow: Lesson ' + nx.lesson.day + ' (' + esc(nx.lesson.title) + '). ' : '') + st.known + ' words known well</p>' +
        '<div class="row ui">' + (st.due ? '<a class="btn primary" href="#tagalog/review">Review (' + st.due + ')</a>' : '') + '<a class="btn" href="#tagalog">Open</a></div>';
    }
    return '<div class="meta ui">Tagalog</div><h3>' + (nx ? 'Lesson ' + nx.lesson.day + ': ' + esc(nx.lesson.title) : 'All lessons done') + '</h3>' +
      '<p class="meta ui">' + (st.due ? st.due + ' word' + (st.due === 1 ? '' : 's') + ' to review · ' : '') + st.known + ' words known well</p>' +
      '<div class="row ui">' + (nx ? '<a class="btn primary" href="#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day + '">Start</a>' : '') + (st.due ? '<a class="btn" href="#tagalog/review">Review</a>' : '') + '</div>';
  }

  WL.register({
    id: 'tagalog', title: 'Tagalog', short: 'Tagalog', icon: '💬', nav: true, storageKeys: [store.key], settingsLink: '#tagalog/settings',
    route: route, leave: stopAudio, card: card,
    week: function () { var st = T.stats(S); return st.weekLessons ? st.weekLessons + ' Tagalog lesson' + (st.weekLessons === 1 ? '' : 's') : ''; },
    today: function () {
      var d = T.iso(new Date()), lessonToday = Object.keys(S.done).some(function (k) { return T.iso(new Date(S.done[k])) === d; });
      var st = T.stats(S), nx = T.nextLesson(S, packs());
      if (lessonToday) return { label: 'Tagalog: lesson done' + (st.due ? ' (' + st.due + ' to review, optional)' : ''), done: true, href: '#tagalog' };
      if (nx) return { label: 'Tagalog: lesson ' + nx.lesson.day + (st.due ? ' + ' + st.due + ' to review' : ''), done: false, href: '#tagalog/l/' + nx.pack.id + '/' + nx.lesson.day };
      return st.due ? { label: 'Tagalog: ' + st.due + ' to review', done: false, href: '#tagalog/review' } : null;
    },
    validate: function (k, raw) { try { var s = T.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); },
    weekSummary: function () { return weekSummary(); } // the PC link sends it with the activity log
  });
})();
