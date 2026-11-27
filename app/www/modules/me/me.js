/* "About you" (#me): the daily check-in and "For you" card on Home, quick questions after things he does
   (WLMe.askHtml), "Not for me?" on advice and practices (WLMe.fitLink), and the weekly plan Claude writes on his PC
   from all of it. Every answer is optional. Logic in me-core.js. */
(function () {
  'use strict';
  var K = window.MeCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.me.v1', K.defaults);
  var S = store.load(), view = null, planBusy = false;
  function save() { store.save(S); }
  function now() { return WL.logNow ? WL.logNow() : new Date(); }
  // the check-in is always about the real today ("Log for an earlier day" is for things done, and WL.logNow() would
  // keep that mode alive every time Home is drawn)
  function today() { return K.iso(new Date()); }

  function chips(attrs, q, cur) {
    return '<div class="me-q"><div class="meta">' + esc(q.q) + '</div><div class="chips">' + q.opts.map(function (o) {
      var on = Array.isArray(cur) ? cur.indexOf(o) >= 0 : cur === o;
      return '<button class="chip" ' + attrs + ' data-k="' + q.k + '" data-v="' + esc(o) + '" aria-pressed="' + on + '">' + esc(o) + '</button>';
    }).join('') + '</div></div>';
  }

  /* Quick questions after something he did. about: what it was, unique per time (e.g. "body@2026-11-20T14:00"). */
  /* Calm's saved state (for "What's working" when he trains the mind); null if there's none or it can't be read. */
  function calmState() {
    try { var raw = localStorage.getItem('wl.calm.v1'); return raw && window.CalmCore ? CalmCore.validate(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function askHtml(part, about, title, compact) {
    var qs = K.questions(part); if (!qs.length || !about) return '';
    var a = K.answers(S, part, about);
    return '<div class="' + (compact ? '' : 'card ') + 'ui me-ask" data-part="' + esc(part) + '" data-about="' + esc(about) + '">' +
      (compact ? '' : '<div class="meta">' + esc(title || 'Quick questions (optional): they help the app fit you') + '</div>') +
      qs.map(function (q) { return chips('data-me-a="1"', q, a[q.k]); }).join('') + '</div>';
  }

  /* "Not for me?" link next to a piece of advice or a practice. Once marked, it stays in the backend (S.feedback)
     but is removed from the UI instead of lingering as "Noted". */
  function fitLink(part, about, shown) {
    var ms = Date.now(), isGuide = /^guide:/.test(String(about || ''));
    if (isGuide ? K.flagged(S, part, about, ms - 14 * 864e5, ms) : K.flagged(S, part, about)) return '';
    return '<button class="link me-fit" data-me-fit="1" data-part="' + esc(part) + '" data-about="' + esc(about) + '" data-shown="' + esc(String(shown || '').slice(0, 300)) + '">Not for me?</button>';
  }

  var fitKey = null;
  function closeFitSheet(trigger) {
    if (fitKey) { document.removeEventListener('keydown', fitKey); fitKey = null; }
    var old = $('#me-sheet'); if (old) old.remove();
    if (trigger && trigger.isConnected && trigger.focus) try { trigger.focus(); } catch (e) {}
  }
  window.addEventListener('hashchange', function () { closeFitSheet(); });

  /* Immediately remove the marked-down item from the UI while keeping the feedback in S.feedback for backend/plans. */
  function hideFlaggedUi(btn, part, about) {
    if (!btn) return;
    var plan = btn.closest('.me-plan');
    if (plan) { plan.remove(); return; }
    var adv = btn.closest('.advice');
    if (adv) { adv.remove(); return; }
    var tipLi = btn.closest('#co-tips li');
    if (tipLi) {
      var tipsCard = btn.closest('#co-tips');
      tipLi.remove();
      if (tipsCard && !tipsCard.querySelector('li')) tipsCard.remove();
      return;
    }
    var direct = btn.closest('#wo-pain, #c-path-late, #reflect, #practice');
    if (direct) {
      if (direct.id === 'practice') { var jp = $('[data-jump="practice"]'); if (jp) jp.remove(); }
      direct.remove();
      return;
    }
    if (btn.closest('.home-card[data-module="me"]')) { redrawCard(); return; }
    if (btn.closest('.home-card[data-module="workout"]')) {
      var rr = btn.closest('.home-card').querySelector('#wo-rough-rest');
      if (rr) rr.remove();
      btn.remove();
      return;
    }
    if (btn.closest('#c-today')) { WL.route(); return; }
    if (/^(guide:|coach:|balance$|tip:)/.test(String(about || ''))) {
      var box = btn.closest('li, .card, p');
      if (box) { box.remove(); return; }
    }
    btn.remove();
  }

  function fitSheet(btn) {
    closeFitSheet();
    var host = btn.closest('li, .card, p') || btn;
    if (!host || !host.parentNode) return;
    var d = document.createElement('div');
    d.id = 'me-sheet'; d.className = 'card ui sheet';
    d.innerHTML = '<div class="meta">What doesn’t fit? (tap any)</div><div class="chips">' + K.REASONS.map(function (r) {
      return '<button class="chip" data-r="' + esc(r) + '" aria-pressed="false">' + esc(r) + '</button>'; }).join('') + '</div>' +
      '<label class="sr" for="me-note">What would fit you better?</label><textarea id="me-note" rows="2" placeholder="What would fit you better? (optional)"></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="me-send">Save</button><button id="me-cancel">Cancel</button></div>';
    host.parentNode.insertBefore(d, host.nextSibling);
    $$('#me-sheet [data-r]').forEach(function (b) { b.onclick = function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); }; });
    $('#me-cancel').onclick = function () { closeFitSheet(btn); };
    $('#me-send').onclick = function () {
      var rs = $$('#me-sheet [data-r][aria-pressed="true"]').map(function (b) { return b.dataset.r; }), note = $('#me-note').value;
      if (!rs.length && !note.trim()) { WL.toast('Tap a reason or write a few words'); return; }
      var part = btn.dataset.part, about = btn.dataset.about;
      K.notFit(S, part, about, btn.dataset.shown, rs, note, now()); save();
      closeFitSheet();
      hideFlaggedUi(btn, part, about);
      try { document.dispatchEvent(new CustomEvent('wl-notfit', { detail: { part: part, about: about } })); } catch (e) {}
      WL.toast('Removed. Kept in your history so future plans skip it.');
    };
    fitKey = function (ev) {
      if (!d.isConnected) { closeFitSheet(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); closeFitSheet(btn); }
    };
    document.addEventListener('keydown', fitKey);
    var first = $('#me-sheet [data-r]'); if (first && first.focus) try { first.focus(); } catch (e) {}
    if (d.scrollIntoView) try { d.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  /* One click handler for every quick question, check-in chip, plan dismiss, and "Not for me?" anywhere in the app. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-me-a],[data-me-ck],[data-me-fit],[data-me-plan-dismiss]');
    if (!b) return;
    if (b.dataset.mePlanDismiss) {
      K.dismissPlan(S, b.dataset.mePlanDismiss); save();
      var box = b.closest('.me-plan, #me-plan-home');
      if (box) box.remove();
      WL.toast('Dismissed for this week');
      return;
    }
    if (b.dataset.meFit) { fitSheet(b); return; }
    if (b.dataset.meA) {
      var box = b.closest('.me-ask'), f = K.answer(S, box.dataset.part, box.dataset.about, b.dataset.k, b.dataset.v, now(), new Date());
      if (!f) return; save();
      $$('[data-me-a][data-k="' + b.dataset.k + '"]', box).forEach(function (x) {
        var cur = f.a[b.dataset.k]; x.setAttribute('aria-pressed', Array.isArray(cur) ? cur.indexOf(x.dataset.v) >= 0 : cur === x.dataset.v);
      });
      return;
    }
    if (b.dataset.meCk) {
      var c = K.checkin(S, today(), b.dataset.k, b.dataset.v, new Date()); if (!c) return; save();
      $$('[data-me-ck][data-k="' + b.dataset.k + '"]').forEach(function (x) { x.setAttribute('aria-pressed', c[b.dataset.k] === x.dataset.v); });
      if (K.checkinDone(c)) { var card = b.closest('.home-card'); setTimeout(function () { if (card && card.isConnected) { card.innerHTML = cardHtml(); wireCard(card); } if (WL.refreshToday) WL.refreshToday(); }, 400); }
    }
  });

  function checkinHtml(full) {
    var c = S.checkins[today()] || {};
    return '<div id="me-ck">' + K.CHECKIN.map(function (q) { return chips('data-me-ck="1"', q, c[q.k]); }).join('') +
      '<label class="sr" for="me-ck-note">Anything else today</label><input id="me-ck-note" type="text" maxlength="600" placeholder="Anything else? e.g. she’s teething (optional)" value="' + esc(c.note || '') + '">' +
      (full ? '' : '<div class="row" style="margin-top:8px"><span class="grow meta">Takes 20 seconds. Only on your phone and your PC.</span><button class="link" id="me-skip">Skip today</button></div>') + '</div>';
  }

  function askable() { var pc = WL.pc; return !!pc && (pc.canAsk ? pc.canAsk() : pc.ready()); }
  function planHtml() {
    var p = S.plan, due = K.planDue(S, new Date()), pc = WL.pc;
    var h = '';
    if (p && !due && !K.planDismissed(S, 'home') && !K.planFlagged(S, 'home')) {
      h += '<div id="me-plan-home"><div class="row"><p class="grow" style="margin:0"><b>This week:</b> ' + esc(p.headline) + '</p><button class="link me-plan-dismiss" type="button" data-me-plan-dismiss="home">Dismiss</button></div>' +
        (K.planFor(S, 'home', new Date()) ? '<p class="meta">' + esc(K.planFor(S, 'home', new Date()).focus) + '</p>' : '') + '</div>';
    }
    if (due && !planBusy && planQueued()) h += queuedLine();
    else if (due && !planBusy && K.planFailed(S, new Date())) h += '<div class="row" id="me-plan-failed"><span class="grow meta">Couldn’t make your plan this time.' +
      (askable() ? '</span><button id="me-plan">Try again</button></div>' : ' It tries again when your PC answers.</span></div>');
    else if (due && askable()) h += '<div class="row"><span class="grow meta">' + (p ? 'Time for a new weekly plan.' : 'Claude can make you a plan for the week from your check-ins and answers.') + '</span>' +
      '<button id="me-plan"' + (planBusy ? ' disabled' : '') + '>' + (planBusy ? 'Claude is on it…' : 'Make this week’s plan') + '</button></div>';
    return h;
  }

  function cardHtml() {
    var c = S.checkins[today()], g = K.guidance(S, new Date(), 3);
    if (!K.checkinDone(c) && !S.skipped[today()]) return '<div class="meta ui">Quick check-in</div><h3>How are you today?</h3>' + checkinHtml(false);
    var h = '<div class="meta ui">For you</div>';
    if (g.length) h += '<ul class="me-g">' + g.map(function (x) { return '<li>' + esc(x.text) + ' ' + fitLink(x.part, 'guide:' + x.key, x.text) + '</li>'; }).join('') + '</ul>';
    else h += '<p class="meta ui">Thanks for checking in. Answer the quick questions after things you do, and the app learns what fits you.</p>';
    var wk = K.working(S, new Date(), calmState());
    if (wk.length) h += '<p class="meta ui" id="me-working-home">What’s working: ' + esc(wk[0]) + '</p>';
    h += planHtml();
    h += '<div class="row ui"><a class="btn" href="#me">About you</a>' + (c ? '<span class="grow"></span><a class="link" id="me-ci-change" href="#me/checkin">Check-in ✓ · change</a>' : '') + '</div>';
    return h;
  }

  /* The plan arrived: redraw the "About you" card on Home if it's showing, but never under his fingers (a note being
     typed or the "Not for me?" sheet open: then it shows next time Home is drawn). */
  function redrawCard() {
    var el = document.querySelector('.home-card[data-module="me"]');
    if (!el || $('#me-sheet') || (document.activeElement && document.activeElement.id === 'me-ck-note')) return;
    el.innerHTML = cardHtml(); wireCard(el);
  }
  function wireCard(el) {
    var sk = $('#me-skip', el); if (sk) sk.onclick = function () { S.skipped[today()] = 1; save(); el.innerHTML = cardHtml(); wireCard(el); if (WL.refreshToday) WL.refreshToday(); };
    var n = $('#me-ck-note', el); if (n) n.oninput = n.onchange = function () { K.checkinNote(S, today(), n.value, new Date()); save(); };
    var pb = $('#me-plan', el); if (pb) pb.onclick = function () { makePlan(redrawCard); el.innerHTML = cardHtml(); wireCard(el); };
  }

  /* quiet: the automatic try (no toasts). The day's try counts as used only when the PC answered (Claude's plan or
     Claude's error); away from home Wi-Fi it simply tries again later. */
  function makePlan(done, quiet) {
    var pc = WL.pc; if (!askable() || planBusy) return;
    planBusy = true;
    var input = K.forPlan(S, new Date());
    try { var co = JSON.parse(localStorage.getItem('wl.coach.v1') || 'null'); if (window.CoachCore && co && co.child && co.child.birth) input.age = CoachCore.ageText(co.child.birth); } catch (e) {}
    var reached = false;
    pc.sync().then(function () { reached = true; return pc.ask('weekly-plan', input); }).then(function (a) {
      var p = K.cleanPlan(a, new Date()); planBusy = false; S.planTried = today();
      if (!p) { save(); if (!quiet) WL.toast('Claude’s plan came back empty. Try again later.'); return done && done(); }
      S.plan = p; save(); WL.toast('Your plan for this week is ready'); if (done) done();
    }, function (e) {
      planBusy = false;
      // the PC wasn't reachable: the next cloud run makes the plan (with Drive sync on), shown the same way
      if (!e.queued && !reached && pc.orQueue) e = pc.orQueue(e, 'weekly-plan', input);
      if (e.queued) { if (!quiet) WL.toast(e.message); if (done) done(); return; }
      if (reached) { S.planTried = today(); save(); }
      if (!quiet) WL.toast(e.message || 'Could not make the plan');
      if (done) done();
    });
  }
  function planQueued() { return !!(WL.pc && WL.pc.queued && WL.pc.queued('weekly-plan').length); }
  function queuedLine() {
    return '<p class="meta" id="me-plan-queued">' + esc(WL.pc.queuedText ? WL.pc.queuedText() : WL.pc.QUEUED) +
      (WL.pc.cancelHtml ? WL.pc.cancelHtml(WL.pc.queued('weekly-plan').map(function (x) { return x.id; }), 'the weekly plan request') : '') + '</p>';
  }
  // a cancelled plan isn't asked for again by itself today (the button still makes one)
  if (WL.pc && WL.pc.onCancel) WL.pc.onCancel(function (task) { if (task === 'weekly-plan') { S.planCancelled = today(); save(); redrawCard(); } });
  if (WL.pc && WL.pc.onCloudAnswer) WL.pc.onCloudAnswer('weekly-plan', function (e, a) {
    var p = e ? null : K.cleanPlan(a, new Date());
    S.planTried = today();
    if (p) { S.plan = p; WL.toast('Your plan for this week is ready'); }
    save(); redrawCard();
    if (view && location.hash.indexOf('#me') === 0 && !$('#me-sheet') && !(document.activeElement && document.activeElement.id === 'me-ck-note')) route([], view);
  });

  /* One line of the weekly plan for a part's screen ('' if none, dismissed, or marked not for me). */
  function planLine(part) {
    var p = K.planFor(S, part, new Date());
    if (!p || K.planDismissed(S, part) || K.planFlagged(S, part)) return '';
    return '<div class="card ui me-plan"><div class="row"><div class="meta grow">This week, for you</div><button class="link me-plan-dismiss" type="button" data-me-plan-dismiss="' + esc(part) + '">Dismiss</button></div><p style="margin:.2em 0">' + esc(p.focus) + '</p>' +
      (p.why ? '<p class="meta" style="margin:0">Why: ' + esc(p.why) + '</p>' : '') + '<div style="text-align:right">' + fitLink(part, 'plan:' + (S.plan.at || '').slice(0, 10), p.focus) + '</div></div>';
  }

  function page() {
    var h = '<h1>About you</h1><p class="meta ui">What you tell the app here shapes its suggestions and the weekly plan Claude writes on your PC. ' +
      'It stays on your phone and in your progress folder on the PC. Everything is optional.</p>';
    h += '<div class="card ui" id="me-checkin-card"><h3>Today’s check-in</h3>' + checkinHtml(true) + '</div>';
    var g = K.guidance(S, new Date(), 6);
    if (g.length) h += '<div class="card ui"><h3>For you</h3><ul class="me-g">' + g.map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ul></div>';
    var wk = K.working(S, new Date(), calmState());
    if (wk.length) h += '<div class="card ui" id="me-working"><h3>What’s working</h3><ul class="me-g">' + wk.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="meta">From your own answers in the last 30 days.</p></div>';
    h += '<div class="card ui"><h3>Weekly plan</h3>';
    if (S.plan) {
      var planParts = Object.keys(S.plan.parts).filter(function (k) { return !K.planFlagged(S, k); });
      h += '<p>' + esc(S.plan.headline) + '</p>' + (planParts.length ? '<ul class="me-g">' + planParts.map(function (k) {
        var x = S.plan.parts[k]; return '<li><b>' + esc(label(k)) + ':</b> ' + esc(x.focus) + (x.why ? ' <span class="meta">(' + esc(x.why) + ')</span>' : '') + '</li>';
      }).join('') + '</ul>' : '') + (S.plan.check ? '<p class="meta">' + esc(S.plan.check) + '</p>' : '') + '<p class="meta">Made ' + esc(new Date(S.plan.at).toLocaleDateString()) + '.</p>';
    } else h += '<p class="meta">No plan yet.</p>';
    var failed = !planBusy && K.planFailed(S, new Date());
    if (!planBusy && planQueued()) { h += queuedLine(); failed = false; }
    else if (failed) h += '<p class="meta" id="me-plan-failed">Couldn’t make your plan this time.' + (askable() ? '' : ' It tries again when your PC answers.') + '</p>';
    h += askable() ? '<button id="me-plan"' + (planBusy ? ' disabled' : '') + '>' + (planBusy ? 'Claude is on it…' : failed ? 'Try again' : (S.plan ? 'Make a new plan now' : 'Make this week’s plan')) + '</button>'
      : '<p class="meta">The weekly plan needs the PC link (Settings › PC link) or Settings › Sync with Google Drive.</p>';
    h += '</div>';
    var tr = K.trend(S, new Date(), 14);
    if (tr.n >= 2) {
      // one small bar per day (no check-in: a dot); taller = more sleep / more wakes / better
      var optsOf = function (k) { var q = K.CHECKIN.filter(function (x) { return x.k === k; })[0]; return q ? q.opts : []; };
      var bars = function (k, max, cls) {
        var opts = optsOf(k);
        return tr.days.map(function (x) {
          var v = x[k];
          if (v == null) return '<span class="tb none" title="' + esc(x.date) + '">·</span>';
          var lbl = opts[v] != null ? opts[v] : String(v), c = 'tb' + (cls ? ' ' + cls(v) : '');
          return '<span class="' + c + '" style="height:' + Math.round(20 + 80 * v / max) + '%" title="' + esc(x.date + ': ' + lbl) + '" data-val="' + esc(lbl) + '"></span>';
        }).join('');
      };
      h += '<div class="card ui" id="me-trend"><h3>Last 14 days</h3>' +
        '<div class="trow"><span class="tl">Sleep</span><span class="tbars">' + bars('sleep', 4) + '</span></div>' +
        '<div class="trow" id="me-trend-wakes"><span class="tl">Up in the night</span><span class="tbars">' + bars('wakes', 3, function (v) { return v === 0 ? 'tb-ok' : 'tb-wakes'; }) + '</span></div>' +
        '<div class="trow"><span class="tl">Energy</span><span class="tbars">' + bars('energy', 2) + '</span></div>' +
        '<div class="trow"><span class="tl">Mood</span><span class="tbars">' + bars('mood', 2) + '</span></div>' +
        '<p class="meta">Oldest on the left, today on the right. Taller is more sleep, more night wakes (0 to 3+), more energy, better mood.</p></div>';
    }
    var shownDays = Object.keys(S.checkins).filter(function (d) {
      var c = S.checkins[d];
      return c && (K.CHECKIN.some(function (q) { return c[q.k]; }) || c.note);
    }).sort().reverse().slice(0, 7);
    if (shownDays.length) h += '<div class="card ui"><h3>Last 7 check-ins</h3><ul class="me-g">' + shownDays.map(function (d) {
      var c = S.checkins[d]; return '<li><b>' + esc(d) + '</b> ' + esc(K.CHECKIN.map(function (q) { return c[q.k] ? q.q.split(' ')[0] + ': ' + c[q.k] : ''; }).filter(Boolean).join(' · ')) + (c.note ? ' — ' + esc(c.note) : '') + '</li>';
    }).join('') + '</ul></div>';
    var n = S.feedback.filter(function (f) { return f.kind === 'after'; }).length;
    h += '<p class="meta ui">' + n + ' quick answers so far.</p>';
    return h;
  }
  function label(k) { return { calm: 'Calm', workout: 'Move', faith: 'Faith', coach: 'Parenting', tagalog: 'Tagalog', todo: 'To do', home: 'General' }[k] || k; }

  function route(parts, v) {
    if (v) view = v;
    view.innerHTML = page();
    var n = $('#me-ck-note'); if (n) n.oninput = n.onchange = function () { K.checkinNote(S, today(), n.value, new Date()); save(); };
    var pb = $('#me-plan'); if (pb) pb.onclick = function () { makePlan(function () { if (/^#me(\/|$)/.test(location.hash)) route([]); }); route([]); };
    // #me/checkin (Home's "Check-in ✓ · change"): straight to today's answers
    var ck = parts && parts[0] === 'checkin' && $('#me-checkin-card');
    if (ck && ck.scrollIntoView) try { ck.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  // The weekly plan makes itself when one is due and the PC link answers (at most one answered try a day; the button
  // is there too): shortly after the app opens, whenever it comes back to the front, and every 15 minutes.
  function autoPlan() {
    if (askable() && K.planDue(S, new Date()) && S.planTried !== today() && S.planCancelled !== today() && !document.hidden && !planQueued() && (S.feedback.length || Object.keys(S.checkins).length))
      makePlan(redrawCard, true);
  }
  setTimeout(autoPlan, 20000);
  setInterval(autoPlan, 15 * 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(autoPlan, 5000); });

  window.WLMe = {
    askHtml: askHtml, fitLink: fitLink, flagged: function (part, about) { return K.flagged(S, part, about); }, planLine: planLine, rough: function () { return K.rough(S, new Date()); },
    calmLikes: function () { return K.calmLikes(S, new Date()); }, planFor: function (part) { return K.planFor(S, part, new Date()); }, planFlagged: function (part) { return K.planFlagged(S, part); }, calmHelped: function () { return K.calmHelped(S); }, painNote: function () { return K.painNote(S, new Date()); }, state: function () { return S; }
  };

  WL.register({
    id: 'me', title: 'About you', short: 'You', icon: '☺', nav: false, navAs: 'home', storageKeys: [store.key],
    route: route, card: cardHtml, wireCard: wireCard,
    today: function () { var c = S.checkins[today()]; return K.checkinDone(c) || S.skipped[today()] ? { label: 'Check-in', done: true, href: '#me' } : { label: 'Check-in (20 seconds, below)', done: false, href: '#home' }; },
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
