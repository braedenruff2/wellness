/* PC link screen (#link): pair with the PC, see exactly what is logged and sent, choose whether journal text goes,
   send now, and ask Claude (on the PC) for advice from the log. Home card: advice, once paired. */
(function () {
  'use strict';
  var esc = WL.esc, $ = WL.$, pc = WL.pc, A = window.WLActivity;
  var view = null, advice = null, busy = false, found = null, showAll = false;

  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 48 * 60) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' days ago';
  }

  function pairHtml(st) {
    if (!st.available) return '<div class="card ui"><h3>Not in this browser</h3><p>The PC link works in the Wellness app on your phone.</p></div>';
    var h = '<div class="card ui"><h3>Pair with your PC</h3>' +
      '<ol class="steps"><li>On the PC, double-click <b>Set up PC link.bat</b> in the wellness folder once (later, <b>Pair a phone.bat</b>). It shows a code.</li>' +
      '<li>Keep the phone on the same Wi-Fi as the PC.</li><li>Pick your PC below (or type its address), type the code, tap Pair.</li></ol>' +
      '<div class="row"><button id="lk-find">Find my PC</button></div><div id="lk-found">' + foundHtml() + '</div>' +
      '<label for="lk-host">PC address</label><input type="text" id="lk-host" inputmode="decimal" placeholder="e.g. 192.168.1.20" autocomplete="off" value="' + esc(found && found[0] ? found[0].host : '') + '">' +
      '<label for="lk-code">Code from the PC</label><input type="text" id="lk-code" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX">' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="lk-pair">Pair</button></div><p id="lk-msg" class="meta" aria-live="polite"></p></div>';
    return h;
  }
  function foundHtml() {
    if (!found) return '';
    if (!found.length) return '<p class="meta">No PC answered. Is the PC link running on it, and the phone on the same Wi-Fi? You can type the address instead.</p>';
    return '<div class="chips">' + found.map(function (f) { return '<button class="chip" data-host="' + esc(f.host) + '">' + esc(f.name || f.host) + ' (' + esc(f.host) + ')</button>'; }).join('') + '</div>';
  }

  function render() {
    var st = pc.status(), P = pc.settings();
    var h = '<h1>PC link</h1><p class="ui meta">Your phone sends what you do in the app to your own PC (home Wi-Fi only), into Desktop\\wellness-progress. ' +
      'Claude on your PC reads it to suggest next steps and to coach you, using your own Claude Code. Nothing goes anywhere else.</p>';
    if (!st.paired) { view.innerHTML = h + pairHtml(st) + logHtml(P); wire(); return; }
    h += '<div class="card ui"><h3>Paired with ' + esc(st.name || st.host) + '</h3>' +
      '<p class="meta">Last sent: ' + esc(ago(P.lastSync)) + (P.lastSync ? ' (' + (P.lastSent || 0) + ' new)' : '') +
      (P.lastError ? '<br><span class="no">Last try: ' + esc(P.lastError) + ' (' + esc(ago(P.lastErrorAt)) + ')</span>' : '') + '</p>' +
      '<div class="row"><button class="primary" id="lk-sync"' + (busy ? ' disabled' : '') + '>Send now</button><button id="lk-test">Check the PC</button></div><p id="lk-msg" class="meta" aria-live="polite"></p></div>';
    h += '<div class="card ui"><h3>Advice from Claude</h3><p class="meta">Claude reads the last two weeks of your log and suggests what would help most.</p>' +
      '<label for="lk-q">Anything on your mind? (optional)</label><textarea id="lk-q" rows="2"></textarea>' +
      '<div class="row"><button class="primary" id="lk-advice">Ask for advice</button></div><div id="lk-adv" aria-live="polite">' + adviceHtml() + '</div></div>';
    h += logHtml(P);
    h += '<p class="ui"><button class="link" id="lk-forget">Unpair this phone</button></p>';
    view.innerHTML = h;
    wire();
  }

  function adviceHtml() {
    var q = pc.queued && pc.queued('advice').length && !(advice && advice.waiting != null) ? '<p class="meta" id="lk-queued">' + esc(pc.queuedText ? pc.queuedText() : pc.QUEUED) + (pc.cancelHtml ? pc.cancelHtml(pc.queued('advice').map(function (x) { return x.id; }), 'the advice request') : '') + '</p>' : '';
    return q + adviceBody();
  }
  function adviceBody() {
    if (!advice) return '';
    if (advice.error) return '<p class="no">' + esc(advice.error) + '</p>';
    if (advice.waiting != null) return '<p class="meta">Claude is thinking… ' + advice.waiting + ' s</p>';
    var a = advice.answer || {};
    return '<div class="advice">' + (a.headline ? '<p><b>' + esc(a.headline) + '</b></p>' : '') +
      (Array.isArray(a.points) ? '<ul>' + a.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
      (a.next ? '<p>Next step: ' + esc(a.next) + '</p>' : '') + (a.text ? '<p>' + esc(a.text) + '</p>' : '') +
      '<p class="meta">' + esc(ago(advice.at)) + (window.WLMe ? ' ' + WLMe.fitLink('home', 'advice:' + String(advice.at || '').slice(0, 16), [a.headline].concat(a.points || []).concat(a.next || []).join(' / ')) : '') + '</p></div>';
  }

  function logHtml(P) {
    var all = pc.events(), unsent = A.unsent(all, P.sent).length;
    // the daily "workouts a week" setting: listed once (the newest), not every day
    var tg = all.filter(function (e) { return e.kind === 'target'; }).pop();
    var shown = all.filter(function (e) { return e.kind !== 'target' || e === tg; }).reverse(), list = shown.slice(0, showAll ? 300 : 30);
    return '<div class="card ui"><h3>What gets logged</h3>' +
      '<p class="meta">' + all.length + ' things from the last ' + A.MAX_DAYS + ' days; ' + unsent + ' not sent yet. Faith days, guided prayers and practices, ' +
      'calm sessions with your stress ratings, every workout set, Tagalog lessons, answers and reviews, to-dos and parenting practice.</p>' +
      '<label class="row"><input type="checkbox" id="lk-jt"' + (P.journalText ? ' checked' : '') + '> <span>Include what I write in my journal and prayers (otherwise only that I wrote, and how much)</span></label>' +
      (list.length ? '<ul class="list log">' + list.map(function (e) {
        return '<li><span class="meta">' + esc(new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</span> ' +
          esc(A.describe(e)) + (P.sent[e.id] ? '' : ' <span class="meta">· not sent</span>') + '</li>';
      }).join('') + '</ul>' + (shown.length > list.length ? '<button class="link" id="lk-more">Show more</button>' : '') : '<p class="meta">Nothing yet.</p>') + '</div>';
  }

  function msg(t, cls) { var m = $('#lk-msg'); if (m) { m.className = cls || 'meta'; m.textContent = t; } }

  function wire() {
    var f = $('#lk-find');
    if (f) f.onclick = function () {
      f.disabled = true; msg('Looking for your PC…');
      pc.request('find').then(function (t) { found = JSON.parse(t || '[]'); }, function () { found = []; }).then(function () {
        msg(''); f.disabled = false;
        $('#lk-found').innerHTML = foundHtml(); wireFound();
        if (found.length === 1) $('#lk-host').value = found[0].host;
      });
    };
    wireFound();
    var pr = $('#lk-pair');
    if (pr) pr.onclick = function () {
      var host = $('#lk-host').value.trim(), code = $('#lk-code').value.trim();
      if (!host) return msg('Type the PC address (or tap Find my PC).', 'no');
      if (code.replace(/[^0-9A-Za-z]/g, '').length < 12) return msg('The code has 12 letters and numbers.', 'no');
      pr.disabled = true; msg('Pairing… (takes a few seconds)');
      pc.request('pair', host, code).then(function () {
        WL.toast('Paired with your PC');
        render();
        pc.sync().then(function () { if (view && location.hash.indexOf('#link') === 0) render(); }, function () {});
      }, function (e) { pr.disabled = false; msg(e.message, 'no'); });
    };
    var sy = $('#lk-sync');
    if (sy) sy.onclick = function () {
      busy = true; sy.disabled = true; msg('Sending…');
      pc.sync().then(function (n) { busy = false; WL.toast(n ? 'Sent ' + n + ' new' : 'Up to date'); render(); }, function (e) { busy = false; render(); msg(e.message, 'no'); });
    };
    var te = $('#lk-test');
    if (te) te.onclick = function () {
      msg('Checking…');
      pc.get('/v1/health').then(function (h) { msg('The PC answered. ' + (h.claude ? 'Claude Code is ready on it.' : 'Claude Code was not found on it: install it and sign in once.'), h.claude ? 'ok' : 'no'); },
        function (e) { msg(e.message, 'no'); });
    };
    var ad = $('#lk-advice');
    if (ad) ad.onclick = function () { askAdvice(($('#lk-q') || {}).value || ''); };
    var jt = $('#lk-jt');
    if (jt) jt.onchange = function () { var P = pc.settings(); P.journalText = jt.checked; pc.save(); render(); };
    var mo = $('#lk-more');
    if (mo) mo.onclick = function () { showAll = true; render(); };
    var fo = $('#lk-forget');
    if (fo) fo.onclick = function () {
      if (fo.dataset.sure) { pc.request('forget').then(function () { pc.reset(); render(); }); return; }
      fo.dataset.sure = '1'; fo.textContent = 'Tap again to unpair';
    };
  }
  function wireFound() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-host]'), function (b) { b.onclick = function () { $('#lk-host').value = b.dataset.host; $('#lk-code').focus(); }; });
  }

  var adviceBusy = false;
  function askAdvice(q) {
    if (adviceBusy) return; // a second tap would start another Claude job on the PC
    adviceBusy = true;
    advice = { waiting: 0 }; draw();
    // send the latest first, so Claude sees today
    pc.sync().catch(function () {}).then(function () {
      return pc.ask('advice', { question: String(q).slice(0, 1000) }, function (s) { if (advice && advice.waiting != null) { advice.waiting = s; draw(); } });
    }).then(function (a) { adviceBusy = false; advice = { answer: a, at: new Date().toISOString() }; keep(); draw(); }, function (e) {
      adviceBusy = false; advice = e.queued ? pc.settings().advice || null : { error: e.message }; draw();
    });
  }
  // an answer from the cloud run (the PC wasn't answering) shows like the PC's
  if (pc.onCloudAnswer) pc.onCloudAnswer('advice', function (e, a) {
    if (!adviceBusy) advice = e ? { error: e } : { answer: a || {}, at: new Date().toISOString() };
    if (!e) keep(); draw();
  });
  function keep() { var P = pc.settings(); P.advice = advice; pc.save(); }
  function draw() {
    var el = document.getElementById('lk-adv'); if (el) el.innerHTML = adviceHtml();
    var c = document.querySelector('.home-card[data-module="link"]'); if (c) c.innerHTML = card();
  }

  function card() {
    var paired = pc.ready();
    if (!paired && !(pc.canAsk && pc.canAsk())) return '';
    advice = advice || pc.settings().advice || null;
    return '<div class="meta ui">' + (paired ? 'Claude on your PC' : 'Claude (answers from the cloud run)') + '</div><h3>Advice for this week</h3>' + adviceHtml() +
      '<div class="row ui"><button class="primary" data-advice="1"' + (adviceBusy ? ' disabled' : '') + '>' + (advice && advice.answer ? 'Ask again' : 'Ask for advice') + '</button>' + (paired ? '<a class="btn" href="#link">PC link</a>' : '') + '</div>';
  }

  WL.register({
    id: 'link', title: 'PC link', short: 'PC', icon: '🖥', nav: false, storageKeys: [pc.storeKey], settingsLink: '#link',
    route: function (parts, v) { view = v; render(); },
    card: card,
    wireCard: function (el) { el.addEventListener('click', function (e) { if (e.target.closest('[data-advice]')) askAdvice(''); }); },
    validate: function (k, raw) {
      // a restored backup keeps the settings but sends everything again (the PC skips what it already has)
      try { var o = JSON.parse(raw); return JSON.stringify({ sent: {}, lastSync: null, lastError: null, lastSent: 0, journalText: !!o.journalText, weekSent: null }); } catch (e) { return null; }
    },
    reload: function () { pc.reload(); advice = null; }
  });
})();
