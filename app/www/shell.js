/* Wellness app shell: the home screen, bottom navigation, look (theme / text size), shared speech and bell,
   backup of every module, and a tiny router. Each module (modules/<id>/) registers itself with WL.register
   and owns its screens under #<id>/..., its own storage key and its own tests.
   Module contract: { id, title, icon, nav (bool), route(parts, view), leave(), card() -> html for Home,
                      storageKeys: [...] (for backup) } */
(function () {
  'use strict';
  var modules = {}, order = [], current = null;
  var native = window.FCAndroid || null;
  var view = null;
  var SKEY = 'wl.shell.v1';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  /* Per-module JSON store with defaults merged in (and an in-memory fallback when storage is blocked). */
  function store(key, defaults) {
    var mem = null;
    return {
      load: function () {
        var raw = lsGet(key); if (raw == null) raw = mem;
        var d = defaults ? defaults() : {};
        if (!raw) return d;
        try { var s = JSON.parse(raw); if (!s || typeof s !== 'object') return d; for (var k in d) if (!(k in s)) s[k] = d[k]; return s; } catch (e) { return d; }
      },
      save: function (s) { var raw = JSON.stringify(s); mem = raw; return lsSet(key, raw); },
      key: key
    };
  }

  var shellStore = store(SKEY, function () { return { theme: null, textSize: null }; });
  var SH = shellStore.load();

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return [].slice.call((el || document).querySelectorAll(sel)); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function isoDate(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* ---- look (shared by every module) ---- */
  function nightHours(when) { var h = (when || new Date()).getHours(); return h >= 21 || h < 6; }
  function look() {
    // first run after the faith app became a module: take its look settings
    if (SH.theme == null) {
      var f = null; try { f = JSON.parse(lsGet('fc.v1') || 'null'); } catch (e) {}
      SH.theme = (f && f.settings && f.settings.theme) || 'auto';
      SH.textSize = (f && f.settings && f.settings.textSize) || 1;
      shellStore.save(SH);
    }
    return SH;
  }
  function themeNow(when) { var t = look().theme; return t === 'auto' ? (nightHours(when) ? 'night' : 'light') : t; }
  function applyLook() {
    var theme = themeNow();
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--size', look().textSize || 1);
    if (native && native.setDark) try { native.setDark(theme !== 'light'); } catch (e) {}
  }
  function setLook(k, v) { look()[k] = v; shellStore.save(SH); applyLook(); }
  setInterval(function () { if (look().theme === 'auto') applyLook(); }, 60000);

  /* ---- speech: the phone's own voice through the Android bridge, else the browser's ---- */
  function wordsSeconds(text, rate) {
    var w = String(text || '').split(/\s+/).filter(Boolean).length;
    return w / (2.4 * (rate || 1)) + 0.4;
  }
  var speech = (function () {
    var cbs = {}, n = 0, watchdog = null;
    window.FCSpeechDone = function (id) { var f = cbs[id]; delete cbs[id]; if (f) f(); };
    function synth() { return window.speechSynthesis || null; }
    return {
      /* opts: {voice: false = don't speak, just wait the reading time; rate; lang: 'en-US' | 'fil-PH'} */
      speak: function (text, done, opts) {
        opts = opts || {};
        var rate = opts.rate || 1;
        clearTimeout(watchdog);
        var once = false, fin = function () { if (!once) { once = true; clearTimeout(watchdog); if (done) done(); } };
        var later = function () { watchdog = setTimeout(fin, wordsSeconds(text, rate) * 1000); };
        if (opts.voice === false) return later();
        if (native && native.speak) {
          var id = 's' + (++n); cbs[id] = fin;
          try {
            if (opts.lang && native.speakIn) native.speakIn(text, id, rate, opts.lang);
            else native.speak(text, id, rate);
          } catch (e) { delete cbs[id]; return later(); }
          // if the voice never answers, carry on (Loudbook's voices make speech first, so they get longer)
          var nice = false; try { nice = native.voiceKind && native.voiceKind() === 'nice'; } catch (e) {}
          watchdog = setTimeout(fin, wordsSeconds(text, rate) * (nice ? 4000 : 2500) + (nice ? 30000 : 6000));
          return;
        }
        var s = synth();
        if (s) {
          try {
            s.cancel();
            var u = new SpeechSynthesisUtterance(text);
            u.rate = rate; u.lang = opts.lang || 'en-US';
            u.onend = fin; u.onerror = fin;
            s.speak(u);
            watchdog = setTimeout(fin, wordsSeconds(text, rate) * 2500 + 6000);
            return;
          } catch (e) { /* fall through */ }
        }
        later();
      },
      stop: function () {
        clearTimeout(watchdog); cbs = {};
        if (native && native.stopSpeaking) try { native.stopSpeaking(); } catch (e) {}
        var s = synth(); if (s) try { s.cancel(); } catch (e) {}
      }
    };
  })();

  var audioCtx = null;
  function bell() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime;
      [528, 792, 1056].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 / (i + 1), t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 3.6);
      });
    } catch (e) {}
  }
  function keepAwake(on) { if (native && native.keepAwake) try { native.keepAwake(!!on); } catch (e) {} }

  /* ---- modules and routing ---- */
  function register(m) { modules[m.id] = m; order.push(m.id); }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return 'Up in the night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  /* Logging for an earlier day (forgot to log yesterday's workout, prayer, calm session or to-do): every part records
     with WL.logNow(): that day at the current time of day. Kept in memory only, and back to today after 2 hours. */
  var logDay = null, logDaySet = 0;
  function addDaysIso(n) { var d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)); }
  function getLogDay() {
    if (logDay && (Date.now() - logDaySet > 2 * 3600e3 || logDay >= isoDate())) {
      // ran out: say so at once (the banner used to keep showing the old day while new entries went to today)
      logDay = null; setTimeout(function () { drawLogDay(); toast('Logging for today again'); }, 0);
    }
    return logDay;
  }
  function setLogDay(iso) { logDay = iso && iso < isoDate() ? iso : null; logDaySet = Date.now(); drawLogDay(); }
  function logNow() {
    var d = getLogDay(), now = new Date();
    if (!d) return now;
    logDaySet = Date.now(); // the 2 hours count from the last entry for that day (a workout with long breaks stays on it)
    var p = d.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  }
  function dayLabel(iso) {
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return (iso === addDaysIso(1) ? 'yesterday, ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function drawLogDay() {
    var el = document.getElementById('logday'); if (!el) return;
    var d = getLogDay();
    el.hidden = !d;
    el.innerHTML = d ? '<span class="grow">Logging for <b>' + esc(dayLabel(d)) + '</b></span><button id="logday-back" class="chip">Back to today</button>' : '';
    var b = document.getElementById('logday-back'); if (b) b.onclick = function () { setLogDay(null); route(); toast('Logging for today'); };
  }
  function logDayHtml() {
    var cur = getLogDay(), o = '<option value="">Today</option>';
    for (var i = 1; i <= 7; i++) { var v = addDaysIso(i); o += '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(dayLabel(v)) + '</option>'; }
    return '<div class="card ui"><div class="row"><label for="wl-logday" class="grow">Log for an earlier day<br><span class="meta">Forgot to log something? Pick the day, then use any part as usual.</span></label>' +
      '<select id="wl-logday" aria-label="Log for which day">' + o + '</select></div></div>';
  }

  /* One list of what each part asks of today (module.today() -> {label, done, href} or null), so it's clear what's
     left and when the day is done. Each part decides what "done" means, the same way its own card does. */
  function todayList() {
    var items = [];
    order.forEach(function (id) { var m = modules[id]; if (!m.today) return; try { var t = m.today(); if (t && t.label) items.push(t); } catch (e) {} });
    if (!items.length) return '';
    var n = items.filter(function (t) { return t.done; }).length;
    return '<div class="card ui" id="wl-today"><div class="row"><b class="grow">' + (n === items.length ? 'All done for today ✓' : n + ' of ' + items.length + ' done today') + '</b></div>' +
      '<ul class="today-list">' + items.map(function (t) {
        return '<li' + (t.done ? ' class="done"' : '') + '><a href="' + esc(t.href || '#home') + '"><span class="tk" aria-hidden="true">' + (t.done ? '✓' : '○') + '</span> ' + esc(t.label) + '</a></li>';
      }).join('') + '</ul>' + (n === items.length ? '<p class="meta">Nothing else you need to do. Anything more is a bonus.</p>'
        : new Date().getHours() >= 20 ? '<p class="meta">It’s evening: what’s left can wait. Tomorrow is fine.</p>'
        : n === 0 ? '<p class="meta">Do what fits today; on a hard day one of these is plenty.</p>' : '') + '</div>';
  }
  /* A gentle backup nudge: everything lives only on the phone, so 14 days without a backup file earns one line in
     Settings, and on Home at most one day a week. */
  function backupDue(now) {
    now = now || new Date();
    if (!SH.since) { SH.since = now.toISOString(); shellStore.save(SH); }
    var last = Date.parse(SH.lastBackup || SH.since);
    return !(now.getTime() - last < 14 * 864e5);
  }
  function backupNudge(now) {
    now = now || new Date();
    if (!backupDue(now)) return '';
    var today = isoDate(now);
    if (SH.nudged && SH.nudged !== today && now.getTime() - Date.parse(SH.nudged) < 7 * 864e5) return '';
    if (SH.nudged !== today) { SH.nudged = today; shellStore.save(SH); }
    return '<div class="card ui" id="wl-backup"><p>' + (SH.lastBackup ? 'Your last backup was ' + Math.floor((now.getTime() - Date.parse(SH.lastBackup)) / 864e5) + ' days ago.' : 'You haven’t saved a backup yet.') +
      ' Everything lives only on this phone. <a href="#settings">Save one in Settings</a>.</p></div>';
  }
  /* Sunday from noon: one plain line about the week across parts (no streaks, no scores). */
  function weekCard(now) {
    now = now || new Date();
    if (now.getDay() !== 0 || now.getHours() < 12) return '';
    var bits = [];
    order.forEach(function (id) { var m = modules[id]; if (!m.week) return; try { var w = m.week(); if (w) bits.push(w); } catch (e) {} });
    return '<div class="card ui" id="wl-week"><b>Your week</b><p>' + (bits.length ? esc(bits.join(', ')) + '.' : 'A quiet week in the app. That’s allowed; looking after her counts most.') + '</p>' +
      '<p class="meta">Whatever this week held, a new one starts tomorrow.</p></div>';
  }
  function refreshToday() { var el = document.getElementById('wl-today'); if (el) el.outerHTML = todayList(); }

  function home() {
    var h = '<div class="meta ui">' + esc(greeting()) + ' · ' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
      '<h1>Today</h1>' + todayList() + weekCard() + backupNudge();
    order.forEach(function (id) {
      var m = modules[id];
      if (!m.card) return;
      var c = ''; try { c = m.card(); } catch (e) { c = ''; }
      if (c) h += '<div class="card home-card" data-module="' + id + '">' + c + '</div>';
    });
    h += logDayHtml();
    h += '<p class="ui" style="text-align:center"><a href="#settings">Settings and backup</a></p>';
    return h;
  }

  function settingsHtml() {
    var L = look();
    function chips(name, vals, cur, labels) {
      return '<div class="chips">' + vals.map(function (v, i) { return '<button class="chip" data-look="' + name + '" data-val="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + labels[i] + '</button>'; }).join('') + '</div>';
    }
    var h = '<h1>Settings</h1><div class="card ui"><h3>Look</h3>' + chips('theme', ['auto', 'light', 'dark', 'night'], L.theme, ['Auto', 'Light', 'Dark', 'Night']) +
      '<p class="meta">Auto turns on Night (very dim, warm) from 9pm to 6am.</p><h3>Text size</h3>' +
      chips('textSize', [0.9, 1, 1.15, 1.3], L.textSize, ['Small', 'Normal', 'Large', 'Larger']) + '</div>';
    order.forEach(function (id) { var m = modules[id]; if (m.settingsLink) h += '<p class="ui"><a href="' + m.settingsLink + '">' + esc(m.title) + ' settings</a></p>'; });
    h += voiceHtml();
    h += updateHtml();
    h += '<div class="card ui"><h3>Backup</h3><p class="meta">Everything lives only on this phone. Save a backup file now and then (all parts of the app in one file).' +
      (SH.lastBackup ? ' Last saved ' + esc(new Date(SH.lastBackup).toLocaleDateString()) + '.' : '') + (backupDue() ? ' <b>It’s been a while: save one now.</b>' : '') + '</p>' +
      '<div class="row"><button id="wl-export">Save a backup</button><label class="btn" for="wl-import">Restore a backup</label><input type="file" id="wl-import" accept=".json,application/json" class="sr"></div></div>';
    return h;
  }

  /* Voices (Android: Voices.java): Loudbook's voices for English (Kokoro on the phone, the natural voice from the PC at
     home) and a Filipino voice (MMS Tagalog) for Tagalog, each downloaded once. */
  function voiceState() { try { return native && native.voiceStatus ? JSON.parse(native.voiceStatus()) : null; } catch (e) { return null; } }
  var VSTATE = { ready: 'ready ✓', loading: 'getting ready…', downloaded: 'getting ready…', missing: 'not downloaded yet' };
  function voiceHtml() {
    var v = voiceState(); if (!v || !v.speakers) return '';
    function chip(key, val, cur, label) { return '<button class="chip" data-voice="' + key + '" data-val="' + val + '" aria-pressed="' + (String(cur) === String(val)) + '">' + label + '</button>'; }
    var dl = v.downloading;
    var h = '<div class="card ui" id="wl-voice"><h3>Voice</h3><p class="meta">English: the voices from Loudbook (Kokoro on this phone; ' +
      'the natural voice from your PC when you\'re home). Tagalog: a Filipino voice (Meta\'s MMS Tagalog). The phone\'s own voice reads until they\'re downloaded.</p>' +
      '<h3>English</h3><div class="chips">' + chip('english', 'nice', v.english, 'Loudbook\'s voice') + chip('english', 'phone', v.english, 'Phone\'s voice') + '</div>' +
      '<p class="meta">Kokoro: ' + esc(dl === 'kokoro' ? 'downloading ' + (v.progress || '') : VSTATE[v.kokoro] || v.kokoro) + '</p>' +
      (v.kokoro === 'missing' && dl !== 'kokoro' ? '<div class="row"><button class="primary" id="wl-dl-kokoro">Download Kokoro (354 MB, Wi-Fi)</button></div>' : '') +
      '<label for="wl-sid">Kokoro voice</label><select id="wl-sid">' + v.speakers.map(function (s) { return '<option value="' + s.sid + '"' + (s.sid === v.sid ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
      '<label class="row"><input type="checkbox" id="wl-pcv"' + (v.pcVoice ? ' checked' : '') + '> <span>At home, use the natural voice from my PC (Loudbook\'s PC voice; needs the PC link)</span></label>' +
      '<h3>Tagalog</h3><div class="chips">' + chip('tagalog', 'nice', v.tagalog, 'Filipino voice') + chip('tagalog', 'phone', v.tagalog, 'Phone\'s voice') + '</div>' +
      '<p class="meta">Filipino voice: ' + esc(dl === 'tagalog' ? 'downloading ' + (v.progress || '') : VSTATE[v.tagalogVoice] || v.tagalogVoice) + '</p>' +
      (v.tagalogVoice === 'missing' && dl !== 'tagalog' ? '<div class="row"><button class="primary" id="wl-dl-tagalog">Download the Filipino voice (114 MB, from your PC)</button></div>' : '') +
      (v.error ? '<p class="no">' + esc(v.error) + '</p>' : '') +
      '<div class="row"><button id="wl-hear-en">▶ Hear English</button><button id="wl-hear-tl">▶ Hear Tagalog</button></div>' +
      (v.last ? '<p class="meta">Last read by: ' + esc(v.last) + '</p>' : '') + '</div>';
    return h;
  }
  function wireVoice() {
    $$('[data-voice]').forEach(function (b) { b.onclick = function () { native.voiceSet(b.dataset.voice, b.dataset.val); redrawVoice(); }; });
    var s = $('#wl-sid'); if (s) s.onchange = function () { native.voiceSet('sid', s.value); speech.speak('Be still, and know that I am God.', null, { rate: 0.9 }); };
    var p = $('#wl-pcv'); if (p) p.onchange = function () { native.voiceSet('pcVoice', String(p.checked)); };
    ['kokoro', 'tagalog'].forEach(function (k) { var b = $('#wl-dl-' + k); if (b) b.onclick = function () { b.disabled = true; native.voiceDownload(k); setTimeout(redrawVoice, 300); }; });
    var e = $('#wl-hear-en'); if (e) e.onclick = function () { speech.speak('Breathe in slowly. Be still, and know that I am God.', function () { redrawVoice(); }, { rate: 0.9 }); };
    var t = $('#wl-hear-tl'); if (t) t.onclick = function () { speech.speak('Magandang umaga po. Kumain ka na ba?', function () { redrawVoice(); }, { rate: 0.9, lang: 'fil-PH' }); };
    watchVoice();
  }
  function redrawVoice() { var el = $('#wl-voice'); if (el) { el.outerHTML = voiceHtml(); wireVoice(); } }
  window.FCVoiceState = redrawVoice;
  // while a download or loading is under way and the card is on screen, refresh it every few seconds (no timer otherwise)
  var voiceTimer = null;
  function watchVoice() {
    clearTimeout(voiceTimer);
    var st = voiceState();
    if (!$('#wl-voice') || !st || !(st.downloading || st.kokoro === 'loading' || st.tagalogVoice === 'loading' || st.kokoro === 'downloaded' || st.tagalogVoice === 'downloaded')) return;
    voiceTimer = setTimeout(function () { var el = $('#wl-voice'); if (el) { el.outerHTML = voiceHtml(); wireVoice(); } }, 3000);
  }

  /* App updates (Android: Updater.java). The app finds new versions by itself (on the PC at home, or GitHub),
     downloads them, and installs them when you leave the app. */
  function updateState() { try { return native && native.updateStatus ? JSON.parse(native.updateStatus()) : null; } catch (e) { return null; } }
  function updateHtml() {
    var u = updateState(); if (!u) return '';
    var when = u.checked ? new Date(u.checked).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
    var h = '<div class="card ui" id="wl-update"><h3>App updates</h3><p class="meta">Version ' + esc(u.version) + '. New versions download by themselves ' +
      '(from your PC at home, or from GitHub) and install when you leave the app.</p>';
    if (!u.allowed) h += '<p><b>One-time step:</b> let Wellness install its own updates.</p><div class="row"><button class="primary" id="wl-allow">Allow updates</button></div>';
    if (u.ready) h += '<p class="ok">Version ' + esc(u.readyName) + ' is downloaded.' + (u.allowed ? ' It installs when you leave the app, or now:' : '') + '</p>' +
      (u.allowed ? '<div class="row"><button class="primary" id="wl-install">Update now (the app restarts)</button></div>' : '');
    else h += '<p class="meta">' + (u.busy ? 'Checking…' : 'Up to date as of ' + esc(when) + '.') + '</p>';
    if (u.error) h += '<p class="meta">Last check: ' + esc(u.error) + '</p>';
    return h + '<div class="row"><button id="wl-check"' + (u.busy ? ' disabled' : '') + '>Check now</button></div></div>';
  }
  function wireUpdate() {
    var c = $('#wl-check'); if (c) c.onclick = function () { native.updateCheck(); c.disabled = true; c.textContent = 'Checking…'; };
    var a = $('#wl-allow'); if (a) a.onclick = function () { native.updateAllow(); };
    var i = $('#wl-install'); if (i) i.onclick = function () { i.disabled = true; native.updateInstall(); };
  }
  function redrawUpdate() { var el = $('#wl-update'); if (el) { el.outerHTML = updateHtml(); wireUpdate(); } }
  window.FCUpdateState = redrawUpdate;
  // coming back from Android's "Install unknown apps" screen: show the new state
  document.addEventListener('visibilitychange', function () { if (!document.hidden) redrawUpdate(); });
  // an update never installs during a guided prayer or calm session (Android asks the page)
  if (window.MutationObserver && native && native.setBusy) {
    new MutationObserver(function () { try { native.setBusy(document.body.classList.contains('in-session')); } catch (e) {} })
      .observe(document.body || document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  /* One backup file for the whole app: {app:'wellness', stores:{key: json}}. Old Faith Companion backups still restore. */
  function backupText() {
    var stores = {};
    order.forEach(function (id) { (modules[id].storageKeys || []).forEach(function (k) { var v = lsGet(k); if (v != null) stores[k] = v; }); });
    var v = lsGet(SKEY); if (v != null) stores[SKEY] = v;
    return JSON.stringify({ app: 'wellness', exported: new Date().toISOString(), stores: stores }, null, 1);
  }
  function restoreText(text) {
    var o = JSON.parse(text);
    if (o && o.app === 'faith-companion' && modules.faith && modules.faith.importOld) { modules.faith.importOld(text); return; }
    if (!o || o.app !== 'wellness' || !o.stores || typeof o.stores !== 'object') throw new Error('This is not a backup from this app.');
    var allowed = {}, skipped = []; allowed[SKEY] = 1;
    order.forEach(function (id) { (modules[id].storageKeys || []).forEach(function (k) { allowed[k] = 1; }); });
    Object.keys(o.stores).forEach(function (k) {
      if (!allowed[k] || typeof o.stores[k] !== 'string') return;
      var m = order.map(function (id) { return modules[id]; }).filter(function (m) { return (m.storageKeys || []).indexOf(k) >= 0; })[0];
      var val = o.stores[k];
      if (m && m.validate) val = m.validate(k, val); // each module checks its own data
      if (val != null) lsSet(k, val); else if (m) skipped.push(m.title || m.id || k);
    });
    SH = shellStore.load();
    order.forEach(function (id) { if (modules[id].reload) modules[id].reload(); });
    return skipped; // parts whose data in the backup was unreadable (left as they were)
  }

  function saveFile(name, text) {
    if (native && native.saveFile) {
      try { var where = native.saveFile(name, text); toast(where ? 'Saved to ' + where : 'Could not save the file'); } catch (e) { toast('Could not save the file'); }
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Saved ' + name);
  }

  function wireShell() {
    $$('[data-look]').forEach(function (b) {
      b.onclick = function () { var v = b.dataset.val; setLook(b.dataset.look, isNaN(+v) ? v : +v); route(); };
    });
    wireUpdate(); wireVoice();
    var ld = $('#wl-logday'); if (ld) ld.onchange = function () { setLogDay(ld.value || null); toast(ld.value ? 'Logging for ' + dayLabel(ld.value) : 'Logging for today'); };
    var ex = $('#wl-export'); if (ex) ex.onclick = function () { saveFile('wellness-backup-' + isoDate() + '.json', backupText()); SH.lastBackup = new Date().toISOString(); shellStore.save(SH); };
    var im = $('#wl-import');
    if (im) im.onchange = function () {
      var f = im.files && im.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          if (!window.confirm || window.confirm('Replace what is on this phone with the backup from that file?')) {
            var bad = restoreText(String(r.result)) || []; applyLook();
            toast(bad.length ? 'Backup restored, except ' + bad.join(', ') + ' (unreadable there; kept as it was)' : 'Backup restored'); route();
          }
        } catch (e) { toast(e.message || 'Could not read that file'); }
      };
      r.readAsText(f);
    };
  }

  function route() {
    view = view || document.getElementById('view');
    var parts = (location.hash || '#home').slice(1).split('/');
    var id = parts[0] || 'home';
    var m = modules[id];
    speech.stop(); // nothing keeps talking on a screen that has no Stop button
    if (current && current.leave) try { current.leave(); } catch (e) {}
    document.body.className = '';
    current = m || null;
    if (m) m.route(parts.slice(1), view);
    else {
      view.innerHTML = id === 'settings' ? settingsHtml() : home(); wireShell();
      $$('.home-card').forEach(function (el) { var mm = modules[el.dataset.module]; if (mm && mm.wireCard) try { mm.wireCard(el); } catch (e) {} });
    }
    var tab = m ? (m.navAs || id) : 'home';
    $$('nav#tabs a').forEach(function (a) {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    drawLogDay();
    if (!m || !m.keepScroll) window.scrollTo(0, 0);
  }

  function start() {
    applyLook();
    var nav = document.getElementById('tabs');
    if (nav) nav.innerHTML = '<a href="#home" data-tab="home"><span class="ico" aria-hidden="true">⌂</span>Home</a>' +
      order.filter(function (id) { return modules[id].nav; }).map(function (id) {
        var m = modules[id];
        return '<a href="#' + id + '" data-tab="' + id + '"><span class="ico" aria-hidden="true">' + m.icon + '</span>' + esc(m.short || m.title) + '</a>';
      }).join('');
    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', function () { order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); }); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); }); });
    route();
  }

  // The Android app calls these.
  window.FCSaveNow = function () { order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); }); };
  window.FCPauseSession = function () { if (current && current.pause) current.pause(); };

  window.WL = {
    register: register, start: start, route: route, logNow: logNow, logDay: getLogDay, setLogDay: setLogDay, store: store, $: $, $$: $$, esc: esc, toast: toast, isoDate: isoDate,
    speech: speech, bell: bell, keepAwake: keepAwake, wordsSeconds: wordsSeconds, applyLook: applyLook, themeNow: themeNow,
    refreshToday: refreshToday, saveFile: saveFile, native: native, modules: modules, backupText: backupText, restoreText: restoreText
  };
})();
