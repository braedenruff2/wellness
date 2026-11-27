/* Parenting coach (#coach): practise real moments with your daughter at her age. Claude on your PC writes a scenario,
   you answer in your own words, Claude checks current guidance and grades it (what went well, what to change, what an
   expert would do, why), and your scores per skill show progress. Needs the PC link. */
(function () {
  'use strict';
  var K = window.CoachCore, esc = WL.esc, $ = WL.$, $$ = WL.$$, pc = WL.pc;
  var store = WL.store('wl.coach.v1', K.defaults);
  var S = store.load(), view = null, waiting = null, err = null, pickSkill = '', showAllHist = false;
  function save() { store.save(S); }
  function today() { return K.iso(new Date()); }
  function here() { return view && /^#coach(\/real)?\/?$/.test(location.hash); } // the main screen (#coach/real: Home's "Finish and send")
  function tipFlagged(id) { return !!(window.WLMe && WLMe.flagged && WLMe.flagged('coach', 'tip:' + id)); }

  function setupHtml() {
    return '<div class="card ui"><h3>About your little one</h3><p class="meta">So every scenario fits her exact age. This stays on your phone and goes only to your own PC when you ask for a scenario.</p>' +
      '<label for="co-name">Her name</label><input type="text" id="co-name" value="' + esc(S.child.name) + '" autocomplete="off">' +
      '<label for="co-birth">Her birthday</label><input type="date" id="co-birth" value="' + esc(S.child.birth) + '">' +
      '<div class="meta" style="margin-top:12px">What she can do now (tap all that fit; scenarios stay within this)</div><div class="chips" id="co-can">' +
      K.CAN.map(function (v) { return '<button class="chip" data-can="' + esc(v) + '" aria-pressed="' + ((S.child.can || []).indexOf(v) >= 0) + '">' + esc(v) + '</button>'; }).join('') + '</div>' +
      '<label for="co-can-note">Anything else she does or doesn’t do yet</label><input type="text" id="co-can-note" maxlength="300" value="' + esc(S.child.canNote || '') + '" placeholder="e.g. says mama and dada, not climbing stairs yet">' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="co-save">Save</button>' + (S.child.birth ? '<a class="btn" href="#coach">Cancel</a>' : '') + '</div></div>';
  }

  function resultHtml(h) {
    var r = h.result || {};
    return '<div class="card"><div class="meta ui">' + esc(h.skill) + (h.age ? ' · ' + esc(h.age) : '') + '</div><h2>' + esc(h.title) + '</h2><p>' + esc(h.scenario) + '</p>' +
      '<p class="meta ui">Your answer</p><blockquote>' + esc(h.answer) + '</blockquote>' +
      (r.score != null ? '<p class="score ui"><b>' + r.score + '/10</b> ' + esc(r.verdict) + '</p>' : '') +
      (r.good.length ? '<h3>What you did well</h3><ul>' + r.good.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (r.improve.length ? '<h3>What to change</h3><ul>' + r.improve.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (r.better ? '<h3>What an expert would do</h3><p>' + esc(r.better) + '</p>' : '') + (r.why ? '<h3>Why</h3><p>' + esc(r.why) + '</p>' : '') +
      (r.practice ? '<h3>Try this week</h3><p>' + esc(r.practice) + '</p>' : '') + (r.text ? '<p>' + esc(r.text) + '</p>' : '') +
      (r.sources.length ? '<p class="meta ui">Sources: ' + r.sources.map(function (x) { return '<a href="' + esc(x.url) + '">' + esc(x.title) + '</a>'; }).join(' · ') + '</p>' : '') +
      '<p class="meta ui">General guidance, not medical advice. For health worries, call your doctor or 811.</p></div>';
  }

  function adviceHtml(h) {
    var a = h.advice || {}, li = function (v) { return '<ul>' + v.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
    return '<div class="card"><div class="meta ui">Your situation · ' + esc(h.skill) + (h.age ? ' · ' + esc(h.age) : '') + '</div><h2>' + esc(h.title) + '</h2>' +
      '<blockquote>' + esc(h.scenario) + '</blockquote>' +
      (a.summary ? '<p>' + esc(a.summary) + '</p>' : '') +
      (a.steps.length ? '<h3>What to do</h3><ol>' + a.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
      (a.say.length ? '<h3>What you could say</h3>' + li(a.say) : '') + (a.avoid.length ? '<h3>Try to avoid</h3>' + li(a.avoid) : '') +
      (a.why ? '<h3>Why</h3><p>' + esc(a.why) + '</p>' : '') + (a.watch ? '<h3>When to get help</h3><p>' + esc(a.watch) + '</p>' : '') + (a.text ? '<p>' + esc(a.text) + '</p>' : '') +
      (a.sources.length ? '<p class="meta ui">Sources: ' + a.sources.map(function (x) { return '<a href="' + esc(x.url) + '">' + esc(x.title) + '</a>'; }).join(' · ') + '</p>' : '') +
      '<div class="row ui"><button class="primary" id="co-practise" data-id="' + esc(h.id) + '">Practise this as a scenario</button></div>' +
      '<p class="meta ui">General guidance, not medical advice. For health worries, call your doctor or 811; in an emergency, 911.</p></div>';
  }

  function progressHtml() {
    var st = K.skillStats(S).filter(function (s) { return s.n; });
    if (!st.length) return '';
    return '<div class="card ui"><h3>Your progress</h3><ul class="list">' + st.map(function (s) {
      // the last scores as small bars (oldest on the left), once there are two to compare
      var bars = s.scores.length >= 2 ? '<span class="tbars c-bars" role="img" aria-label="Last scores, oldest first: ' + s.scores.join(', ') + '">' + s.scores.map(function (v) {
        return '<span class="tb" style="height:' + Math.round(10 + 90 * v / 10) + '%" title="' + v + '/10"></span>';
      }).join('') + '</span>' : '';
      return '<li><div class="row"><span class="grow">' + esc(s.skill) + '</span><span class="meta">' + s.n + ' practised · recent ' + s.avg + '/10</span></div>' + bars + '</li>';
    }).join('') + '</ul>' + (st.some(function (s) { return s.scores.length >= 2; }) ? '<p class="meta">Bars: your last scores per skill, oldest on the left.</p>' : '') + '</div>';
  }

  function workedHtml() {
    var w = K.workedTips(S, window.WLMe && WLMe.state ? WLMe.state() : null);
    if (!w.length) return '';
    return '<div class="card ui" id="co-worked"><h3>What worked with ' + esc(S.child.name || 'her') + '</h3>' +
      '<p class="meta">Tips you marked “It worked” — tap any to revisit the scenario.</p><ul class="list">' + w.map(function (x) {
        return '<li class="row"><a class="grow" href="#coach/h/' + esc(x.id) + '">' + esc(x.text) + '</a><span class="meta">' + esc(x.skill) + '</span></li>';
      }).join('') + '</ul></div>';
  }
  function refreshWorked() { var wrap = $('#co-worked-wrap'); if (wrap) wrap.innerHTML = workedHtml(); }

  function teachItemHtml(x, badge) {
    return '<li data-teach-item="' + esc(x.id) + '"><div class="row"><b class="grow">' + esc(x.title) + '</b>' +
      (badge ? '<span class="meta">' + esc(badge) + '</span>' : '') + '</div>' +
      '<p class="meta" style="margin:.25em 0 .5em">' + esc(x.how) + '</p>' +
      (x.nudge ? '<div class="gentle co-teach-nudge" data-teach-nudge="' + esc(x.id) + '" style="margin:.4em 0 .5em"><span>You’ve been practising this for a few weeks — still working on it, or ready to mark it done?</span>' +
        '<div class="chips" style="margin-top:6px"><button class="chip" type="button" data-teach-keep="' + esc(x.id) + '">Still working on it</button>' +
        '<button class="chip" type="button" data-teach-done="' + esc(x.id) + '">Done \u2713</button></div></div>' : '') +
      '<div class="chips">' +
      '<button class="chip" data-teach-id="' + esc(x.id) + '" data-teach-val="doing" aria-pressed="' + (x.status === 'doing') + '">Practising</button>' +
      '<button class="chip" data-teach-id="' + esc(x.id) + '" data-teach-val="done" aria-pressed="' + (x.status === 'done') + '">Got it \u2713</button>' +
      '</div></li>';
  }
  function teachHtml(openNext, openEarlier) {
    var t = K.teachForAge(S);
    if (!t || (!t.now.length && !t.next.length && !t.earlier.length)) return '';
    var summary = t.doneCount || t.doingCount ? ' (' + t.doingCount + ' practising \u00b7 ' + t.doneCount + ' got it)' : '';
    var h = '<div class="card ui" id="co-teach"><h3>What to teach ' + esc(S.child.name || 'her') + ' now</h3>' +
      '<p class="meta">Around ' + esc(K.ageText(S.child.birth)) + '. Mark what you’re working on or what she’s got down' + summary + '.</p>';
    if (t.now.length) {
      h += '<ul class="list">' + t.now.map(function (x) { return teachItemHtml(x, x.from + '–' + x.to + 'm'); }).join('') + '</ul>';
    } else {
      h += '<p class="meta">Past the 0–36 month checklist — nice work.</p>';
    }
    if (t.next.length) {
      h += '<details id="co-teach-next"' + (openNext ? ' open' : '') + '><summary class="meta">Coming up next (next few months \u00b7 ' + t.next.length + ')</summary>' +
        '<ul class="list">' + t.next.map(function (x) { return teachItemHtml(x, 'Around ' + x.from + 'm'); }).join('') + '</ul></details>';
    }
    if (t.earlier.length) {
      h += '<details id="co-teach-earlier"' + (openEarlier ? ' open' : '') + '><summary class="meta">Earlier skills to try or catch up on (' + t.earlier.length + ')</summary>' +
        '<p class="meta">No stress if an earlier window passed — kids catch up fast once you start.</p>' +
        '<ul class="list">' + t.earlier.map(function (x) { return teachItemHtml(x, 'From ' + x.from + 'm'); }).join('') + '</ul></details>';
    }
    h += '<p class="meta" style="margin:.6em 0 0">General guidance (CDC / AAP / Canadian Paediatric Society), not medical advice. Every child develops at their own pace.</p></div>';
    return h;
  }
  function wireTeach() {
    var wrap = $('#co-teach-wrap'); if (!wrap) return;
    function redrawTeach() {
      var openNext = !!($('#co-teach-next') && $('#co-teach-next').open);
      var openEarlier = !!($('#co-teach-earlier') && $('#co-teach-earlier').open);
      wrap.innerHTML = teachHtml(openNext, openEarlier);
      wireTeach();
    }
    $$('[data-teach-id]', wrap).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.teachId, val = b.dataset.teachVal;
        var cur = (S.teach && S.teach[id]) || '';
        K.setTeach(S, id, cur === val ? '' : val);
        save();
        redrawTeach();
      };
    });
    $$('[data-teach-keep]', wrap).forEach(function (b) {
      b.onclick = function () {
        K.ackTeachNudge(S, b.dataset.teachKeep);
        save();
        redrawTeach();
      };
    });
    $$('[data-teach-done]', wrap).forEach(function (b) {
      b.onclick = function () {
        K.setTeach(S, b.dataset.teachDone, 'done');
        save();
        redrawTeach();
      };
    });
  }
  /* A real situation he started writing but never sent (saved as he types): said plainly, so it isn't forgotten. */
  function draftWaiting() {
    if (String(S.realDraft || '').trim().length < 20) return false;
    if (waiting && waiting.kind === 'real') return false;
    if (S.pending && S.pending.task === 'coach-advice' && Date.now() - S.pending.at < 15 * 60000) return false;
    return !(pc.queued && pc.queued().some(function (x) { return x.task === 'coach-advice'; }));
  }
  function hasQueuedScenario() {
    return !!(pc.queued && pc.queued().some(function (x) { return x.task === 'coach-scenario'; }));
  }

  /* his earlier tip answers, sent with every coach request (only when there are some) */
  function withNotes(input) {
    var n = K.tipNotes(S, window.WLMe && WLMe.state ? WLMe.state() : null);
    if (n.length) input.tipNotes = n;
    return input;
  }
  function askable() { return pc.canAsk ? pc.canAsk() : pc.ready(); }
  function mainHtml() {
    var can = K.canText(S);
    var h = '<h1>Parenting practice</h1><div class="row ui" style="margin-bottom:8px"><span class="meta grow">' + esc(S.child.name || 'Your daughter') + ' is ' + esc(K.ageText(S.child.birth)) + '.' +
      (can ? ' She can: ' + esc(can) + '.' : '') + '</span><a class="link" href="#coach/setup">Change</a></div>';
    if (!can) h += '<div class="ui" id="co-can-nudge" style="margin:0 0 8px"><a class="link" href="#coach/setup">Tell the app what she can do now</a><p class="meta" style="margin:0">(walks, climbs, first words…) so scenarios fit her, not a typical child her age.</p></div>';
    if (!pc.ready()) h += pc.canAsk && pc.canAsk()
      ? '<div class="ui" id="co-cloud" style="margin:0 0 8px"><p class="meta" style="margin:0">Scenarios and feedback come from the next cloud run (within about 5 hours). Pair the PC link for answers in a minute or two at home.</p><a class="link" href="#link">Pair the PC link</a></div>'
      : '<div class="card ui"><p style="margin-bottom:4px">Scenarios and feedback come from Claude on your PC. Pair the PC link first (home Wi-Fi), or turn on Settings › Sync with Google Drive for answers from the cloud.</p><div class="row"><a class="link" href="#link">Pair the PC link</a><a class="link" href="#settings/sync">Sync with Google Drive</a></div></div>';
    if (err) h += '<p class="no ui">' + esc(err) + '</p>' + (/reach|time|connect|fail|network|wi-?fi|answer/i.test(err) && !/Claude didn/i.test(err)
      ? '<p class="meta ui" id="co-offline">Your PC isn’t answering (away from home Wi-Fi, or it’s asleep). The tips and past advice below still work; try again at home.</p>' : '');
    h += queuedHtml();
    if (waiting) h += '<div class="card ui"><p>' + (waiting.kind === 'grade' ? 'Claude is checking current guidance and grading your answer…' : waiting.kind === 'real' ? 'Claude is checking current guidance for your situation…' : 'Claude is writing a scenario for her age…') +
      ' <span id="co-secs">' + (waiting.secs || 0) + ' s</span></p><p class="meta">This can take a minute or two. You can leave this screen; it carries on.</p></div>';
    var c = S.current;
    if (c && !waiting) {
      h += '<div class="card"><div class="meta ui">' + esc(c.skill) + (c.age ? ' · ' + esc(c.age) : '') + '</div><h2>' + esc(c.title) + '</h2><p>' + esc(c.scenario) + '</p>' +
        '<p><b>' + esc(c.question) + '</b></p><label class="sr" for="co-answer">Your answer</label><textarea id="co-answer" rows="6" placeholder="In your own words: what you would do and say, step by step.">' + esc(c.answer || '') + '</textarea>' +
        '<div class="row ui" style="margin-top:8px"><button class="primary" id="co-grade"' + (askable() ? '' : ' disabled') + '>Get feedback</button><button class="link" id="co-skip"' + (askable() ? '' : ' disabled') + '>Different scenario</button></div></div>';
    } else if (!waiting) {
      if (K.doneToday(S)) h += '<div class="card done-banner ui" id="co-done-today"><p style="margin:0"><b>\u2713 Today’s scenario done.</b> Anything more today is a bonus.</p></div>';
      var sug = K.suggestSkill(S);
      h += '<div class="card ui"><h3>Practise a moment</h3><p class="meta">Pick a skill, or let it choose (suggested: ' + esc(sug) + ').</p><div class="chips">' +
        [''].concat(K.SKILLS).map(function (s) { return '<button class="chip" data-skill="' + esc(s) + '" aria-pressed="' + (pickSkill === s) + '">' + esc(s || 'Suggested') + '</button>'; }).join('') +
        '</div><div class="row" style="margin-top:10px"><button class="primary" id="co-new"' + (askable() ? '' : ' disabled') + '>New scenario</button></div></div>';
    }
    if (window.WLMe) h += WLMe.planLine('coach');
    var tips = K.tips(S, null, 50).filter(function (x) { return !tipFlagged(x.id); }).slice(0, 3);
    if (tips.length) h += '<div class="card ui" id="co-tips"><h3>This week, try</h3><ul class="list">' + tips.map(function (x) {
      return '<li style="flex-wrap:wrap"><a class="grow" href="#coach/h/' + esc(x.id) + '">' + esc(x.text) + '</a><span class="meta">' + esc(x.skill) + '</span>' +
        (window.WLMe ? '<div style="flex-basis:100%">' + WLMe.askHtml('coach', 'tip:' + x.id, ' ', true) + WLMe.fitLink('coach', 'tip:' + x.id, x.text) + '</div>' : '') + '</li>';
    }).join('') + '</ul></div>';
    h += '<div id="co-teach-wrap">' + teachHtml() + '</div>';
    if (!waiting) h += '<div class="card ui"><h3>Something happening with ' + esc(S.child.name || 'her') + '?</h3><p class="meta">Describe a real situation you’re dealing with: what she does, when, what you’ve tried. Claude checks current guidance for her age and gives you steps, words to say, and why.</p>' +
      '<label class="sr" for="co-real">Your situation</label><textarea id="co-real" rows="5" placeholder="e.g. She screams when I put her in the car seat, every time, since last week. I’ve tried…">' + esc(S.realDraft || '') + '</textarea>' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="co-real-go"' + (askable() ? '' : ' disabled') + '>Get advice</button>' +
      (draftWaiting() ? '<span class="meta" id="co-real-saved">Saved on this phone, not sent yet</span>' : '') + '</div></div>';
    h += '<div id="co-worked-wrap">' + workedHtml() + '</div>';
    var last = S.history.slice().reverse();
    if (last.length) {
      h += '<div class="card ui" id="co-hist"><h3>Past practice</h3>' +
        (last.length > 5 ? '<label class="sr" for="co-hist-search">Search past practice</label><input type="search" id="co-hist-search" placeholder="Search past practice" autocomplete="off" style="margin-bottom:8px"><span class="meta" id="co-hist-found"></span>' : '') +
        '<ul class="list" id="co-hist-list">' + last.map(function (x, i) {
          var extra = i >= 20;
          return '<li data-skill="' + esc(x.skill || '') + '"' + (extra ? ' data-extra="1"' : '') + (extra && !showAllHist ? ' hidden' : '') + '><a class="grow" href="#coach/h/' + esc(x.id) + '">' + esc(x.title) + '</a><span class="meta">' + (x.kind === 'real' ? 'your situation' : x.result && x.result.score != null ? x.result.score + '/10' : '') + '</span></li>';
        }).join('') + '</ul>' + (!showAllHist && last.length > 20 ? '<button class="link" id="co-hist-more">Show all (' + last.length + ')</button>' : '') + '</div>';
    }
    return h + progressHtml();
  }

  function render(parts) {
    parts = parts || [];
    if (!S.child.birth || parts[0] === 'setup') { view.innerHTML = '<h1>Parenting practice</h1>' + setupHtml(); wireSetup(); return; }
    if (parts[0] === 'h') {
      var h = S.history.filter(function (x) { return x.id === parts[1]; })[0];
      view.innerHTML = h ? (h.kind === 'real' ? adviceHtml(h) : resultHtml(h)) + '<p class="ui"><a class="link" href="#coach">Back</a></p>' : '<p class="ui">Not found. <a class="link" href="#coach">Back</a></p>';
      var pr = $('#co-practise'); if (pr) pr.onclick = function () { K.practiseReal(S, pr.dataset.id); save(); location.hash = '#coach'; };
      return;
    }
    view.innerHTML = mainHtml();
    wire();
    if (parts[0] === 'real') { // Home's "Finish and send": straight to the saved question
      var box = $('#co-real'), go = $('#co-real-go');
      if (box && box.scrollIntoView) try { box.scrollIntoView({ block: 'center' }); } catch (e) {}
      if (go && !go.disabled) go.focus(); else if (box) box.focus();
    }
  }

  function wireSetup() {
    $$('[data-can]').forEach(function (b) { b.onclick = function () { K.toggleCan(S, b.dataset.can); save(); b.setAttribute('aria-pressed', String(S.child.can.indexOf(b.dataset.can) >= 0)); }; });
    $('#co-save').onclick = function () {
      var b = $('#co-birth').value;
      if (!/^\d{4}-\d\d-\d\d$/.test(b) || K.ageMonths(b) == null || K.ageMonths(b) < 0) { WL.toast('Pick her birthday'); return; }
      S.child.name = $('#co-name').value.trim().slice(0, 40); S.child.birth = b; K.setCanNote(S, $('#co-can-note').value); save();
      location.hash = '#coach'; render([]);
    };
  }

  function wire() {
    $$('[data-skill]').forEach(function (b) { b.onclick = function () { pickSkill = b.dataset.skill; render([]); }; });
    var n = $('#co-new'); if (n) n.onclick = newScenario;
    var g = $('#co-grade'); if (g) g.onclick = function () { gradeIt($('#co-answer').value); };
    var a = $('#co-answer'); if (a) a.oninput = function () { S.current.answer = a.value.slice(0, 4000); save(); };
    var rl = $('#co-real'); if (rl) rl.oninput = function () { S.realDraft = rl.value.slice(0, 3000); save(); };
    var rg = $('#co-real-go'); if (rg) rg.onclick = function () { askReal($('#co-real').value); };
    var sk = $('#co-skip'); if (sk) sk.onclick = function () { if (!askable()) return; S.current = null; save(); newScenario(); };
    var tp = $('#co-tips'); if (tp) tp.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-me-a], #me-send')) setTimeout(refreshWorked, 0);
    });
    var hm = $('#co-hist-more'); if (hm) hm.onclick = function () {
      showAllHist = true;
      $$('#co-hist-list > li[data-extra]').forEach(function (li) { li.hidden = false; });
      hm.hidden = true;
    };
    var hs = $('#co-hist-search'); if (hs) hs.oninput = function () {
      var q = hs.value.trim().toLowerCase(), n = 0;
      $$('#co-hist-list > li').forEach(function (li) {
        if (!q) { li.hidden = !showAllHist && !!li.dataset.extra; return; }
        var a = li.querySelector('a'), txt = ((a ? a.textContent : '') + ' ' + (li.dataset.skill || '')).toLowerCase();
        var hit = txt.indexOf(q) >= 0;
        li.hidden = !hit; if (hit) n++;
      });
      var out = $('#co-hist-found'); if (out) out.textContent = q ? ' ' + n + ' found' : '';
      if (hm) hm.hidden = !!q || showAllHist;
    };
    wireTeach();
  }

  function tick(secs) { if (waiting) waiting.secs = secs; var e = $('#co-secs'); if (e) e.textContent = secs + ' s'; }
  function refreshCard() {
    var c = document.querySelector('.home-card[data-module="coach"]');
    if (c) { c.innerHTML = card(); wireCard(c); }
    if (WL.refreshToday) WL.refreshToday();
  }
  function finish() { waiting = null; if (here()) render([]); else refreshCard(); }

  /* One request at a time: while one waits (its spinner may be off screen, e.g. with text in the history search)
     another tap says so instead of starting a second one. */
  function busy() {
    if (!waiting) return false;
    WL.toast('Claude is still on the last one: it shows here when it’s ready');
    return true;
  }
  function newScenario(opts) {
    var auto = !!(opts && opts.auto);
    if (!auto && busy()) return;
    if (!auto) { S.autoTried = today(); save(); }
    err = null; waiting = { kind: 'scenario', secs: 0 };
    if (here()) { if (!typingHere()) render([]); } else refreshCard();
    var input = withNotes(K.scenarioInput(S, auto ? null : (pickSkill || null)));
    start('coach-scenario', input, function (a) {
      K.setScenario(S, a); S.autoTried = today(); save();
      if (auto) WL.toast('Today’s parenting scenario is ready');
    }, { auto: auto });
  }
  function gradeIt(answer) {
    answer = String(answer || '').trim();
    if (answer.length < 15) { WL.toast('Write a little more: what would you do and say?'); return; }
    if (busy()) return;
    var c = S.current; c.answer = answer; save();
    err = null; waiting = { kind: 'grade', secs: 0 }; render([]);
    start('coach-grade', withNotes({ child: S.child.name, age: c.age, can: K.canText(S), scenario: c.scenario, question: c.question, answer: answer }), function (a) {
      var h = K.grade(S, answer, a, null, c); save();
      if (h && here()) location.hash = '#coach/h/' + h.id;
      pc.sync().catch(function () {});
    });
  }
  function askReal(text) {
    text = String(text || '').trim();
    if (text.length < 20) { WL.toast('Tell Claude a bit more: what happens, when, what you’ve tried'); return; }
    if (busy()) return;
    err = null; waiting = { kind: 'real', secs: 0 }; render([]);
    start('coach-advice', withNotes({ child: S.child.name, age: K.ageText(S.child.birth), can: K.canText(S), situation: text.slice(0, 3000) }), function (a) {
      var h = K.addReal(S, text, a); S.realDraft = ''; save();
      if (here()) location.hash = '#coach/h/' + h.id;
      pc.sync().catch(function () {});
    });
  }
  /* Starts a Claude request; its job id is saved so leaving the app and coming back carries on waiting for it. */
  function start(task, input, onAnswer, opts) {
    var auto = !!(opts && opts.auto);
    var meta = task === 'coach-grade' ? { answer: input.answer, scn: S.current ? JSON.parse(JSON.stringify(S.current)) : null }
      : task === 'coach-advice' ? { answer: input.situation } : null;
    if (!pc.ready() && pc.orQueue) {
      // no PC paired: straight to the cloud queue when Drive sync is on (shown in the queued card), else say why
      var q = pc.orQueue(new Error('Pair the PC link first (Settings › PC link).'), task, input, meta);
      if (auto && q.queued) { S.autoTried = today(); save(); }
      err = q.queued || auto ? null : q.message;
      if (here() && typingHere()) { waiting = null; return; }
      finish(); return;
    }
    var reached = false, mine = null, w = waiting;
    // Two requests can overlap (an automatic scenario still running when he asks for advice): each one clears only
    // its own saved job and its own spinner, so the other carries on and can still resume after a restart.
    var clearMine = function () { if (mine && S.pending === mine) S.pending = null; };
    // a manual request whose spinner something else cleared (a cloud answer, a finished request) still shows its result
    var ownsUi = function () { return waiting === w || (!auto && !waiting); };
    pc.post('/v1/ask', { task: task, input: input }).then(function (r) { reached = true; return r; }, function (e) { throw pc.orQueue ? pc.orQueue(e, task, input, meta) : e; }).then(function (r) {
      if (!S.pending || ownsUi()) { // a request running in the background never replaces the one on screen
        mine = S.pending = { job: r.job, task: task, at: Date.now(), answer: input.answer || input.situation || '' };
        if (task === 'coach-grade' && S.current) S.pending.scn = JSON.parse(JSON.stringify(S.current)); // graded against this one
      }
      if (auto) { S.autoTried = today(); delete S.autoFail; }
      save();
      return pc.poll(r.job, Date.now(), tick);
    }).then(function (a) { clearMine(); onAnswer(a); save(); })
      // an answer Claude sent as prose (onAnswer throws) ends the wait with a message instead of a spinner forever
      .then(function () { if (!ownsUi()) return; if (here() && typingHere()) { waiting = null; return; } finish(); }, function (e) {
        clearMine();
        if (auto && (e.queued || reached)) S.autoTried = today();
        else if (auto) autoFailed();
        save();
        if (!ownsUi()) { if (!auto && !e.queued) err = e.message || String(e); return; } // shown on the next render
        err = e.queued || auto ? null : e.message || String(e);
        if (here() && typingHere()) { waiting = null; return; }
        finish();
      });
  }
  /* An automatic scenario that couldn't reach the PC (and wasn't queued) waits 1 h, then 3 h, and gives up for the
     day after 3 tries, so a PC that's off doesn't make Home flip to "Claude is on it…" every 15 minutes. */
  // kept in wl.coach.v1 (autoFail: {day, n, next}) so reopening the app doesn't try again at once
  function autoFailed() {
    var d = today(), f = S.autoFail && S.autoFail.day === d ? S.autoFail : { day: d, n: 0, next: 0 };
    f.n++;
    if (f.n >= 3) { S.autoTried = d; delete S.autoFail; return; }
    f.next = Date.now() + (f.n === 1 ? 60 : 180) * 60000;
    S.autoFail = f;
  }
  function autoWait() { return !!(S.autoFail && S.autoFail.day === today() && Date.now() < S.autoFail.next); }
  function typingHere() {
    var ae = document.activeElement, id = ae && ae.id;
    if (id === 'co-real' || id === 'co-answer' || id === 'co-hist-search') return true;
    var hs = $('#co-hist-search');
    if (hs && hs.value.trim()) return true;
    return !!$('#me-sheet');
  }
  /* Answers from the cloud run (when the PC wasn't answering): shown through the same code as a PC answer. */
  function cloudDone(err0, note) {
    if (err0) err = err0;
    save();
    if (here() && typingHere()) {
      waiting = null;
      if (err0 || note) WL.toast(err0 || note);
      return;
    }
    finish();
  }
  if (pc.onCloudAnswer) {
    pc.onCloudAnswer('coach-scenario', function (e, a) {
      if (e) return cloudDone(e);
      if (!S.current) {
        try { K.setScenario(S, a); } catch (x) { return cloudDone(x.message); }
        return cloudDone(null, 'New parenting scenario ready');
      }
      cloudDone();
    });
    pc.onCloudAnswer('coach-grade', function (e, a, m) {
      if (e) return cloudDone(e);
      var scn = m && m.scn; if (!scn || S.history.some(function (h) { return h.id === scn.id; })) return cloudDone();
      K.grade(S, m.answer || scn.answer || '', a, null, scn);
      cloudDone(null, 'Parenting feedback is ready');
    });
    pc.onCloudAnswer('coach-advice', function (e, a, m) {
      if (e) return cloudDone(e);
      if (!m || !m.answer) return cloudDone();
      try { K.addReal(S, m.answer, a); } catch (x) { return cloudDone(x.message); }
      if (String(S.realDraft || '').trim().slice(0, 3000) === m.answer) S.realDraft = '';
      cloudDone(null, 'Parenting advice is ready');
    });
  }
  function queuedHtml() {
    var q = pc.queued ? pc.queued().filter(function (x) { return /^coach-/.test(x.task); }) : [];
    if (!q.length) return '';
    return '<div class="card ui" id="co-queued"><p>' + esc(pc.queuedText ? pc.queuedText() : pc.QUEUED) + '</p><ul class="list">' + q.map(function (x) {
      var m = x.meta || {}, what = x.task === 'coach-grade' ? 'Feedback on “' + ((m.scn && m.scn.title) || 'your answer') + '”'
        : x.task === 'coach-advice' ? 'Advice: “' + String(m.answer || '').slice(0, 60) + (String(m.answer || '').length > 60 ? '…' : '') + '”' : 'A new scenario';
      return '<li><span class="grow">' + esc(what) + '</span><span class="meta">asked ' + esc(new Date(x.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</span>' + (pc.cancelHtml ? pc.cancelHtml(x.id, what) : '') + '</li>';
    }).join('') + '</ul></div>';
  }
  function resume() {
    var p = S.pending;
    if (!p || waiting || !pc.ready()) return;
    if (Date.now() - p.at > 15 * 60000) { S.pending = null; save(); return; }
    waiting = { kind: p.task === 'coach-grade' ? 'grade' : p.task === 'coach-advice' ? 'real' : 'scenario', secs: Math.round((Date.now() - p.at) / 1000) };
    pc.poll(p.job, p.at, tick).then(function (a) {
      S.pending = null;
      if (p.task === 'coach-grade') { var h = K.grade(S, p.answer, a, null, p.scn || null); save(); if (h && here()) location.hash = '#coach/h/' + h.id; }
      else if (p.task === 'coach-advice') { var r = K.addReal(S, p.answer, a); S.realDraft = ''; save(); if (here()) location.hash = '#coach/h/' + r.id; }
      else { K.setScenario(S, a); save(); }
    }).then(finish, function (e) { S.pending = null; save(); err = e.message || String(e); finish(); });
  }

  function card() {
    if (!S.child.birth && !askable()) return '';
    var st = K.skillStats(S).filter(function (s) { return s.n; }), last = null;
    for (var i = S.history.length - 1; i >= 0; i--) { if (S.history[i].result && S.history[i].result.score != null) { last = S.history[i]; break; } }
    var done = K.doneToday(S), queued = hasQueuedScenario();
    var title = S.current ? esc(S.current.title) : waiting ? 'Claude is on it…' : queued ? 'Today’s scenario is on the way…' : done ? '\u2713 Scenario done today' : 'Practise a moment with ' + esc(S.child.name || 'her');
    var actions = S.current ? '<a class="btn primary" href="#coach">Answer it</a>'
      : (!done && !waiting && !queued && S.child.birth && askable())
        ? '<button class="primary" data-co-daily>Generate today’s scenario</button><a class="btn" href="#coach">Open</a>'
        : '<a class="btn' + (done ? '' : ' primary') + '" href="#coach">Open</a>';
    return '<div class="meta ui">Parenting practice</div><h3>' + title + '</h3>' +
      (last ? '<p class="meta ui">Last: ' + last.result.score + '/10 in ' + esc(last.skill) + ' · ' + st.length + ' skill' + (st.length === 1 ? '' : 's') + ' practised</p>' : '') +
      (draftWaiting() ? '<div class="row ui" id="co-draft-line"><span class="grow">Your question is saved, not sent yet.</span><a class="btn" href="#coach/real">Finish and send</a></div>' : '') +
      (function () { var ts = K.tips(S, null, 50).filter(function (x) { return !tipFlagged(x.id); }); return ts[0] && !S.current ? '<p class="ui" id="co-tip">Try this week: ' + esc(ts[0].text) + '</p>' : ''; })() +
      '<div class="row ui">' + actions + '</div>';
  }
  function wireCard(el) {
    var b = el && el.querySelector('[data-co-daily]');
    if (b) b.onclick = function () { newScenario(); };
  }
  function todayItem() {
    if (!S.child.birth) return null;
    if (K.doneToday(S)) return { label: 'Parenting: scenario done', done: true, href: '#coach' };
    if (S.current) return { label: 'Parenting: answer today’s scenario', done: false, href: '#coach' };
    if (waiting || hasQueuedScenario()) return { label: 'Parenting: scenario on the way', done: false, href: '#coach' };
    return { label: 'Parenting: 1 daily scenario (5 min)', done: false, href: '#coach' };
  }

  // Automatically generate today's suggested scenario once a day when setup is done and Claude can answer (PC or cloud).
  function autoScenario() {
    if (waiting || document.hidden || !askable() || hasQueuedScenario() || !K.scenarioDue(S, new Date())) return;
    if (autoWait()) return;
    if (here() && typingHere()) return; // never start while he is typing on the Parenting screen
    newScenario({ auto: true });
  }
  if (pc.onCancel) pc.onCancel(function (task) {
    if (task === 'coach-scenario') {
      S.autoCancelled = today();
      save();
      if (!here()) refreshCard();
    }
  });
  document.addEventListener('wl-notfit', function (e) {
    if (e && e.detail && e.detail.part === 'coach') refreshWorked();
  });

  WL.register({
    id: 'coach', title: 'Parenting', short: 'Parent', icon: '🧸', nav: true, storageKeys: [store.key], settingsLink: '#coach/setup',
    route: function (parts, v) { view = v; resume(); render(parts); },
    card: card, wireCard: wireCard,
    today: todayItem,
    week: function () { var n = K.doneInLast(S, 7); return n ? n + ' parenting scenario' + (n === 1 ? '' : 's') : ''; },
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
  setTimeout(resume, 1500);
  setTimeout(autoScenario, 10000);
  setInterval(autoScenario, 15 * 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(autoScenario, 3000); });
})();
