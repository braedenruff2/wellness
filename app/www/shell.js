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
          watchdog = setTimeout(fin, wordsSeconds(text, rate) * 2500 + 6000); // if the voice never answers, carry on
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

  function home() {
    var h = '<div class="meta ui">' + esc(greeting()) + ' · ' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '</div>' +
      '<h1>Today</h1>';
    order.forEach(function (id) {
      var m = modules[id];
      if (!m.card) return;
      var c = ''; try { c = m.card(); } catch (e) { c = ''; }
      if (c) h += '<div class="card home-card" data-module="' + id + '">' + c + '</div>';
    });
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
    h += '<div class="card ui"><h3>Backup</h3><p class="meta">Everything lives only on this phone. Save a backup file now and then (all parts of the app in one file).</p>' +
      '<div class="row"><button id="wl-export">Save a backup</button><label class="btn" for="wl-import">Restore a backup</label><input type="file" id="wl-import" accept=".json,application/json" class="sr"></div></div>';
    return h;
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
    var allowed = {}; allowed[SKEY] = 1;
    order.forEach(function (id) { (modules[id].storageKeys || []).forEach(function (k) { allowed[k] = 1; }); });
    Object.keys(o.stores).forEach(function (k) {
      if (!allowed[k] || typeof o.stores[k] !== 'string') return;
      var m = order.map(function (id) { return modules[id]; }).filter(function (m) { return (m.storageKeys || []).indexOf(k) >= 0; })[0];
      var val = o.stores[k];
      if (m && m.validate) val = m.validate(k, val); // each module checks its own data
      if (val != null) lsSet(k, val);
    });
    SH = shellStore.load();
    order.forEach(function (id) { if (modules[id].reload) modules[id].reload(); });
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
    var ex = $('#wl-export'); if (ex) ex.onclick = function () { saveFile('wellness-backup-' + isoDate() + '.json', backupText()); };
    var im = $('#wl-import');
    if (im) im.onchange = function () {
      var f = im.files && im.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          if (!window.confirm || window.confirm('Replace what is on this phone with the backup from that file?')) {
            restoreText(String(r.result)); applyLook(); toast('Backup restored'); route();
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
    register: register, start: start, route: route, store: store, $: $, $$: $$, esc: esc, toast: toast, isoDate: isoDate,
    speech: speech, bell: bell, keepAwake: keepAwake, wordsSeconds: wordsSeconds, applyLook: applyLook, themeNow: themeNow,
    saveFile: saveFile, native: native, modules: modules, backupText: backupText, restoreText: restoreText
  };
})();
