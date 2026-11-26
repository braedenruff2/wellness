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
      save: function (s) {
        var raw = JSON.stringify(s); mem = raw;
        var ok = lsSet(key, raw);
        if (!ok) saveFailed(key); else if (saveFail && saveFail.key === key) saveFail = null;
        return ok;
      },
      key: key
    };
  }

  /* A save the phone refused (storage full or blocked): until it saves again, what changed lives only in memory and
     is lost when the app closes. Say so once per session, and on Home and in Settings while it lasts. */
  var saveFail = null, saveFailToasted = false;
  function saveFailed(key) {
    saveFail = { key: key, at: Date.now() };
    if (!saveFailToasted) { saveFailToasted = true; setTimeout(function () { try { toast('Couldn’t save on this phone (its storage for the app is full or blocked). Save a backup in Settings now.'); } catch (e) {} }, 0); }
  }
  function saveFailHtml(id) {
    return saveFail ? '<div class="card ui gentle" id="' + id + '"><p><b>The last change couldn’t be saved on this phone.</b> Its storage for the app is full or blocked, so changes since then are kept only until the app closes. Save a backup now (Settings), then tell Claude.</p></div>' : '';
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
  var isoDate = window.WLDates.iso;

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
  function getAudio() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    return audioCtx;
  }
  function bell() {
    try {
      var ctx = getAudio(), t = ctx.currentTime;
      [528, 792, 1056].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 / (i + 1), t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 3.6);
      });
    } catch (e) {}
  }
  /* A very soft, short tick (breathing pacers: each change of phase). pitch: 'up' | 'down' | 'hold'. */
  function tick(pitch) {
    try {
      var ctx = getAudio(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = pitch === 'up' ? 660 : pitch === 'down' ? 440 : 550;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
    } catch (e) {}
  }
  /* One soft bell (interval bells during a sit): quieter and shorter than the start/end bell. */
  function softBell() {
    try {
      var ctx = getAudio(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 528;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 2.6);
    } catch (e) {}
  }
  function keepAwake(on) { if (native && native.keepAwake) try { native.keepAwake(!!on); } catch (e) {} }
  /* Screen brightness right down (a dark screen during a sit) or back to the phone's own setting. */
  function dimScreen(on) { if (native && native.dimScreen) try { native.dimScreen(!!on); } catch (e) {} }
  /* A dark screen during a long practice (Calm sits, late-night prayers): after a while a black cover goes over the
     page and the brightness drops right down; a tap, Space or Enter, or coming back to the app lights it, and it
     goes dark again after the same wait. The page keeps running underneath (voice, bells, timers).
     start({id, label, after}) arms it (again), light() shows the page and re-arms, stop() ends it. */
  var darkSt = { on: false, t: null, id: 'wl-dark', label: '', after: 10000 };
  function darkEl() { return document.getElementById(darkSt.id); }
  function darkArm() {
    clearTimeout(darkSt.t);
    if (!darkSt.on) return;
    darkSt.t = setTimeout(function () {
      if (!darkSt.on || darkEl()) return;
      var d = document.createElement('div');
      d.id = darkSt.id; d.className = 'c-dark wl-dark'; d.tabIndex = 0; d.setAttribute('role', 'button');
      d.setAttribute('aria-label', darkSt.label || 'Dark screen. Tap to show the page.');
      d.onclick = function () { darkLight(); };
      document.body.appendChild(d); dimScreen(true);
    }, darkSt.after);
  }
  function darkUncover() { clearTimeout(darkSt.t); var d = darkEl(); if (d) { d.parentNode.removeChild(d); dimScreen(false); } }
  function darkLight() { darkUncover(); darkArm(); }
  function darkStart(o) {
    o = o || {};
    if (darkSt.on && darkSt.id !== (o.id || 'wl-dark')) darkUncover();
    darkSt.on = true; darkSt.id = o.id || 'wl-dark'; darkSt.label = o.label || ''; darkSt.after = o.after || 10000;
    darkLight();
  }
  function darkStop() { darkSt.on = false; darkUncover(); }
  document.addEventListener('keydown', function (ev) {
    if (!darkEl() || !(ev.key === ' ' || ev.code === 'Space' || ev.key === 'Enter')) return;
    ev.preventDefault(); ev.stopPropagation(); darkLight(); // a key only lights the screen (it doesn't also pause)
  }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && darkEl()) darkLight(); });
  var darkScreen = { start: darkStart, light: darkLight, stop: darkStop, isDark: function () { return !!darkEl(); } };

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
    // Drive sync writes the same backup to Drive, so a recent sync counts as a backup
    var ds = driveState(), synced = ds && ds.configured && ds.lastSync ? Date.parse(ds.lastSync) : 0;
    if (synced > last) last = synced;
    return !(now.getTime() - last < 14 * 864e5);
  }
  function driveState() {
    var ds = window.WL && WL.driveSync; if (!ds || !ds.available()) return null;
    try { return ds.status(); } catch (e) { return null; }
  }
  /* Until Drive sync and the answers sheet are set up (in the phone app), one card on Home says what it gives and
     where to do it; "Not now" hides it for a week. */
  function syncNudge(now) {
    now = now || new Date();
    var st = driveState(); if (!st) return '';
    var step = !st.configured ? 'file' : st.answersSupported && !st.answersConfigured ? 'sheet' : '';
    if (!step) return '';
    // questions already waiting for the cloud can't come back without the sheet: then the card stays (no "Not now")
    var waiting = step === 'sheet' ? st.pendingRequests || 0 : 0;
    if (!waiting && SH.syncLater && now.getTime() - Date.parse(SH.syncLater) < 7 * 864e5 && now.getTime() >= Date.parse(SH.syncLater)) return '';
    return '<div class="card ui" id="wl-sync-nudge"><p>' + (step === 'file'
      ? 'Let Claude answer from the cloud when your PC isn’t around, and keep a live backup: turn on <b>Sync with Google Drive</b> and pick your private Wellness folder.'
      : waiting ? '<b>Answers sheet: not set.</b> ' + waiting + (waiting === 1 ? ' question is' : ' questions are') + ' waiting for the cloud, and the answers can’t reach this phone until you choose the <b>wellness-answers</b> sheet in Sync with Google Drive.'
      : '<b>Answers sheet: not set.</b> One more step for cloud answers: choose the <b>wellness-answers</b> sheet in Sync with Google Drive.') + '</p>' +
      '<div class="row"><a class="btn primary" href="#settings/sync" id="wl-sync-nudge-go">Set it up</a>' + (waiting ? '' : '<button class="link" id="wl-sync-later">Not now</button>') + '</div></div>';
  }
  function backupNudge(now) {
    now = now || new Date();
    if (!backupDue(now)) return '';
    var today = isoDate(now);
    var sinceNudge = SH.nudged ? Date.parse(today) - Date.parse(SH.nudged) : NaN;
    if (SH.nudged && SH.nudged !== today && sinceNudge > 0 && sinceNudge < 7 * 864e5) return '';
    if (SH.nudged !== today) { SH.nudged = today; shellStore.save(SH); }
    // Drive sync worked before and has stopped: say when it last worked (newer than any backup file he saved)
    var ds = driveState(), synced = ds && ds.configured && ds.lastSync ? Date.parse(ds.lastSync) : 0;
    var days = function (t) { return Math.floor((now.getTime() - t) / 864e5); };
    if (synced && synced > (Date.parse(SH.lastBackup) || 0)) {
      return '<div class="card ui" id="wl-backup"><p style="margin-bottom:4px">Drive sync last worked ' + days(synced) + ' days ago, so your newest days aren’t backed up.</p>' +
        '<div class="row"><a class="link" href="#settings/sync">Check Sync with Google Drive</a><a class="link" href="#settings">Save a backup in Settings</a></div></div>';
    }
    return '<div class="card ui" id="wl-backup"><p style="margin-bottom:4px">' + (SH.lastBackup ? 'Your last backup was ' + days(Date.parse(SH.lastBackup)) + ' days ago.' : 'You haven’t saved a backup yet.') +
      ' Everything lives only on this phone.</p><div class="row"><a class="link" href="#settings">Save one in Settings</a></div></div>';
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

  var homeStamp = '';
  function makeHomeStamp(now) {
    now = now || new Date();
    var h = now.getHours();
    return isoDate(now) + '|' + (h >= 20 ? 'e' : now.getDay() === 0 && h >= 12 ? 'w' : 'd');
  }
  function home() {
    homeStamp = makeHomeStamp();
    var h = '<div class="meta ui">' + esc(greeting()) + ' · ' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
      '<h1>Today</h1>' + saveFailHtml('wl-savefail') + todayList() + weekCard() + (syncNudge() || backupNudge());
    order.forEach(function (id) {
      var m = modules[id];
      if (!m.card) return;
      var c = ''; try { c = m.card(); } catch (e) { c = ''; }
      if (c) h += '<div class="card home-card" data-module="' + id + '">' + c + '</div>';
    });
    h += logDayHtml();
    h += '<p class="ui" style="text-align:center"><a class="link" href="#settings">Settings and backup</a></p>';
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
    order.forEach(function (id) { var m = modules[id]; if (m.settingsLink) h += '<p class="ui" style="margin:0"><a class="link" href="' + m.settingsLink + '">' + esc(m.title) + ' settings</a></p>'; });
    h += voiceHtml();
    h += updateHtml();
    h += syncHtml();
    h += saveFailHtml('wl-savefail-s');
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
      '<label for="wl-sid" style="display:block;margin-top:8px">Kokoro voice</label><select id="wl-sid">' + v.speakers.map(function (s) { return '<option value="' + s.sid + '"' + (s.sid === v.sid ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
      '<label class="row" style="flex-wrap:nowrap;align-items:flex-start;margin:10px 0"><input type="checkbox" id="wl-pcv" style="margin-top:4px;min-width:20px;min-height:20px"' + (v.pcVoice ? ' checked' : '') + '><span class="grow">At home, use the natural voice from my PC (Loudbook\'s PC voice; needs the PC link)</span></label>' +
      '<h3>Tagalog</h3><div class="chips">' + chip('tagalog', 'nice', v.tagalog, 'Filipino voice') + chip('tagalog', 'phone', v.tagalog, 'Phone\'s voice') + '</div>' +
      '<p class="meta">Filipino voice: ' + esc(dl === 'tagalog' ? 'downloading ' + (v.progress || '') : VSTATE[v.tagalogVoice] || v.tagalogVoice) + '</p>' +
      (v.tagalogVoice === 'missing' && dl !== 'tagalog' ? '<div class="row"><button class="primary" id="wl-dl-tagalog">Download the Filipino voice (114 MB, from your PC)</button></div>' : '') +
      (v.error ? '<p class="no">' + esc(v.error) + '</p>' : '') +
      '<div class="row" style="margin-top:8px"><button id="wl-hear-en">▶ Hear English</button><button id="wl-hear-tl">▶ Hear Tagalog</button></div>' +
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
    return h + '<div class="row" style="margin-top:8px"><button id="wl-check"' + (u.busy ? ' disabled' : '') + '>Check now</button></div></div>';
  }
  function wireUpdate() {
    var c = $('#wl-check'); if (c) c.onclick = function () { native.updateCheck(); c.disabled = true; c.textContent = 'Checking…'; };
    var a = $('#wl-allow'); if (a) a.onclick = function () { native.updateAllow(); };
    var i = $('#wl-install'); if (i) i.onclick = function () { i.disabled = true; native.updateInstall(); };
  }
  function redrawUpdate() { var el = $('#wl-update'); if (el) { el.outerHTML = updateHtml(); wireUpdate(); } }
  window.FCUpdateState = redrawUpdate;

  /* Google Drive sync (lib/sync.js + Android Sync.java): one-time SAF file pick, automatic sync on open & background. */
  function syncHtml() {
    var ds = window.WL && WL.driveSync; if (!ds || !ds.available()) return '';
    var s = ds.status();
    var h = '<div class="card ui" id="wl-sync"><h3>Sync with Google Drive</h3>';
    if (!s.configured) {
      h += '<p class="meta">Save a live copy (<code>wellness-sync.json</code>) into your private Google Drive folder so cloud runs can read your progress and answer queued requests.</p>';
      if (s.error) h += '<p class="no" id="wl-sync-err">' + esc(s.error) + '</p>';
      h += '<div class="row"><button class="primary" id="wl-sync-pick">Choose Google Drive folder</button>' +
        (s.restoreSupported ? '<button id="wl-sync-restore">Restore from Drive</button>' : '') + '</div></div>';
      return h;
    }
    var when = s.lastSync ? new Date(s.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
    var extra = [];
    if (s.pendingRequests) extra.push(s.pendingRequests + ' waiting for cloud');
    if (s.pendingAnswers) extra.push(s.pendingAnswers + ' cloud ' + (s.pendingAnswers === 1 ? 'answer' : 'answers') + ' ready');
    h += '<p class="meta">Syncing to <b>' + esc(s.name) + '</b> (on open and leaving the app, at most every 30 min).</p>' +
      '<p class="meta" id="wl-sync-when">' + (s.busy ? 'Syncing…' : 'Last synced: ' + esc(when)) + (extra.length ? ' · ' + esc(extra.join(' · ')) : '') + '</p>';
    if (s.error) h += '<p class="no" id="wl-sync-err">' + esc(s.error) + '</p>';
    h += '<div class="row"><button class="primary" id="wl-sync-now"' + (s.busy ? ' disabled' : '') + '>' + (s.busy ? 'Syncing…' : 'Sync now') + '</button>' +
      '<button id="wl-sync-pick">Change file</button>' +
      (s.restoreSupported ? '<button id="wl-sync-restore">Restore from Drive</button>' : '') + '</div>';
    if (s.answersSupported) {
      if (!s.answersConfigured) {
        h += '<p class="meta" id="wl-sync-ans" style="margin-top:10px">Answers sheet: <b>not set</b>. Choose your <b>wellness-answers</b> Google Sheet in Drive so answers from cloud runs show up here' +
          (s.pendingRequests ? ' (' + s.pendingRequests + ' waiting)' : '') + '.</p>';
        if (s.answersError) h += '<p class="no" id="wl-sync-ans-err">' + esc(s.answersError) + '</p>';
        h += '<div class="row"><button id="wl-sync-ans-pick">Choose answers sheet</button></div>';
      } else {
        h += '<p class="meta" id="wl-sync-ans" style="margin-top:10px">Answers sheet: <b>' + esc(s.answersName) + '</b> (checked on each sync).</p>';
        if (s.answersError) h += '<p class="no" id="wl-sync-ans-err">' + esc(s.answersError) + '</p>';
        h += '<div class="row"><button id="wl-sync-ans-pick">Change answers sheet</button><button class="link" id="wl-sync-ans-forget">Remove sheet</button></div>';
      }
    }
    h += '<p style="margin:8px 0 0"><button class="link" id="wl-sync-forget">Turn off Drive sync</button></p></div>';
    return h;
  }
  function handleDriveRestore(ok, text, name) {
    if (!ok) { toast(text || 'Could not read that Google Drive file'); return; }
    try {
      var info = window.WLSyncCore && WLSyncCore.describeBackup ? WLSyncCore.describeBackup(text) : null;
      var msg = 'Replace what is on this phone with the Drive backup' +
        (info && info.exported ? ' from ' + new Date(info.exported).toLocaleDateString() : '') +
        (name ? ' (' + name + ')' : '') + '?';
      if (!window.confirm || window.confirm(msg)) {
        var bad = restoreText(text) || []; applyLook();
        toast(bad.length ? 'Backup restored, except ' + bad.join(', ') + ' (unreadable there; kept as it was)' : 'Backup restored from Google Drive');
        route();
      }
    } catch (e) { toast((e && e.message) || 'Could not read that file'); }
  }
  function wireSync() {
    var ds = window.WL && WL.driveSync; if (!ds || !ds.available()) return;
    var p = $('#wl-sync-pick'); if (p) p.onclick = function () { ds.pick(); };
    var r = $('#wl-sync-restore'); if (r) r.onclick = function () { ds.pickRestore(); };
    var ap = $('#wl-sync-ans-pick'); if (ap) ap.onclick = function () { ds.pickAnswers(); };
    var af = $('#wl-sync-ans-forget'); if (af) af.onclick = function () { ds.forgetAnswers(); toast('Answers sheet removed'); };
    var n = $('#wl-sync-now'); if (n) n.onclick = function () {
      n.disabled = true; n.textContent = 'Syncing…';
      ds.sync({ auto: false }).then(function (r) {
        if (r && r.skipped) return;
        toast(r && r.answersError ? 'Synced backup, but could not read the answers sheet' : 'Synced with Google Drive');
      }, function (e) { toast((e && e.message) || 'Sync failed'); });
    };
    var f = $('#wl-sync-forget'); if (f) f.onclick = function () {
      if (f.dataset.sure) { clearTimeout(f._t); ds.forget(); toast('Drive sync turned off'); return; }
      f.dataset.sure = '1'; f.textContent = 'Tap again to turn off';
      clearTimeout(f._t);
      f._t = setTimeout(function () { if (f.isConnected) { delete f.dataset.sure; f.textContent = 'Turn off Drive sync'; } }, 4000);
    };
  }
  function redrawSync() { var el = $('#wl-sync'); if (el) { el.outerHTML = syncHtml(); wireSync(); } }
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
  function validateShell(raw) {
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      var d = {
        theme: ['auto', 'light', 'dark', 'night'].indexOf(o.theme) >= 0 ? o.theme : 'auto',
        textSize: [0.9, 1, 1.15, 1.3].indexOf(o.textSize) >= 0 ? o.textSize : 1
      };
      ['since', 'lastBackup', 'syncLater'].forEach(function (k) {
        if (typeof o[k] === 'string' && !isNaN(Date.parse(o[k]))) d[k] = o[k];
      });
      if (window.WLDates.isDate(o.nudged)) d.nudged = o.nudged;
      return JSON.stringify(d);
    } catch (e) { return null; }
  }
  function restoreText(text) {
    var o = JSON.parse(text);
    if (o && o.app === 'faith-companion' && modules.faith && modules.faith.importOld) { modules.faith.importOld(text); return; }
    if (!o || o.app !== 'wellness' || !o.stores || typeof o.stores !== 'object') throw new Error('This is not a backup from this app.');
    var allowed = {}, skipped = []; allowed[SKEY] = 1;
    order.forEach(function (id) { (modules[id].storageKeys || []).forEach(function (k) { allowed[k] = 1; }); });
    Object.keys(o.stores).forEach(function (k) {
      if (!allowed[k] || typeof o.stores[k] !== 'string') return;
      if (k === SKEY) { var sv = validateShell(o.stores[k]); if (sv != null) lsSet(k, sv); else skipped.push('Settings'); return; }
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
      try {
        var where = native.saveFile(name, text);
        toast(where ? 'Saved to ' + where : 'Could not save the file');
        return !!where;
      } catch (e) { toast('Could not save the file'); return false; }
    }
    var a = document.createElement('a');
    var url = URL.createObjectURL(new Blob([text], { type: /\.txt$/i.test(name) ? 'text/plain' : 'application/json' }));
    a.href = url;
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 10000);
    toast('Saved ' + name);
    return true;
  }

  function wireShell() {
    $$('[data-look]').forEach(function (b) {
      b.onclick = function () { var v = b.dataset.val; setLook(b.dataset.look, isNaN(+v) ? v : +v); route(); };
    });
    wireUpdate(); wireVoice(); wireSync();
    var sl = $('#wl-sync-later'); if (sl) sl.onclick = function () { SH.syncLater = new Date().toISOString(); shellStore.save(SH); var c = $('#wl-sync-nudge'); if (c) c.remove(); };
    var ld = $('#wl-logday'); if (ld) ld.onchange = function () { setLogDay(ld.value || null); toast(ld.value ? 'Logging for ' + dayLabel(ld.value) : 'Logging for today'); };
    var ex = $('#wl-export'); if (ex) ex.onclick = function () {
      if (saveFile('wellness-backup-' + isoDate() + '.json', backupText())) {
        SH.lastBackup = new Date().toISOString(); shellStore.save(SH); route();
      }
    };
    var im = $('#wl-import');
    if (im) im.onchange = function () {
      var f = im.files && im.files[0]; im.value = ''; if (!f) return;
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
    darkStop(); // nor stays dark (each part also stops it when it leaves)
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
    if (id === 'settings' && (parts[1] === 'sync' || parts[1] === 'voice')) { var sc = $('#wl-' + parts[1]); if (sc && sc.scrollIntoView) sc.scrollIntoView(); }
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
    window.addEventListener('pagehide', function () {
      order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); });
      if (WL.driveSync) WL.driveSync.autoSync();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); });
        if (WL.driveSync) WL.driveSync.autoSync();
      } else {
        applyLook();
        var id = ((location.hash || '#home').slice(1).split('/')[0]) || 'home';
        var editing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (!current && id !== 'settings' && !$('#me-sheet') && !editing && makeHomeStamp() !== homeStamp) route();
      }
    });
    if (WL.driveSync) {
      WL.driveSync.onState(redrawSync);
      if (WL.driveSync.onRestore) WL.driveSync.onRestore(handleDriveRestore);
      WL.driveSync.start();
    }
    route();
  }

  // The Android app calls these.
  window.FCSaveNow = function () {
    order.forEach(function (id) { if (modules[id].saveNow) modules[id].saveNow(); });
    if (WL.driveSync) WL.driveSync.autoSync();
  };
  window.FCPauseSession = function () { if (current && current.pause) current.pause(); };

  window.WL = {
    register: register, start: start, route: route, logNow: logNow, logDay: getLogDay, setLogDay: setLogDay, store: store, $: $, $$: $$, esc: esc, toast: toast, isoDate: isoDate,
    speech: speech, bell: bell, softBell: softBell, tick: tick, keepAwake: keepAwake, dimScreen: dimScreen, darkScreen: darkScreen, wordsSeconds: wordsSeconds, applyLook: applyLook, themeNow: themeNow,
    refreshToday: refreshToday, saveFile: saveFile, native: native, modules: modules, backupText: backupText, restoreText: restoreText
  };
})();
