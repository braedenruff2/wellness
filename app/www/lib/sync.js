/* Google Drive sync (WL.driveSync): connects shell.js and Task B's request queue to Android's Sync.java bridge.
   On app open, going to background (at most every 30 min), and "Sync now":
   1. Reads wellness-sync.json from Drive, takes any new cloud `answers` into localStorage (kept until shown) and records `acked`.
   2. Writes the full app backup JSON plus `requests` and `acked` back to wellness-sync.json. */
(function () {
  'use strict';
  var C = window.WLSyncCore;
  var store = WL.store('wl.sync.v1', C.defaults);
  var S = C.validate(store.load());
  var cbs = {}, seq = 0, inFlight = null;
  var stateListeners = [], answerListeners = [], reqProvider = null;

  function nat() {
    var x = window.FCAndroid;
    return x && x.syncStatus && x.syncRead && x.syncWrite ? x : null;
  }

  window.FCSyncDone = function (id, ok, text) {
    var c = cbs[id]; delete cbs[id];
    if (c) { if (ok) c[0](text == null ? '' : String(text)); else c[1](new Error(text || 'Google Drive sync failed.')); }
  };

  function emitState() {
    stateListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }
  function emitAnswers(fresh) {
    if (!fresh || !fresh.length) return;
    var snap = Object.assign({}, S.answers);
    answerListeners.forEach(function (fn) { try { fn(Object.assign({}, snap), fresh.slice()); } catch (e) {} });
  }

  window.FCSyncState = function (picked) {
    var ns = nativeStatus();
    if (ns && ns.error) S.lastError = ns.error;
    else if (picked) S.lastError = null;
    if (ns && ns.answersError) S.answersError = ns.answersError;
    else if (picked || (ns && !ns.answersConfigured)) S.answersError = null;
    store.save(S);
    emitState();
    if (picked) sync({ auto: false }).catch(function () {});
  };

  function nativeStatus() {
    var x = nat(); if (!x) return null;
    try { return JSON.parse(x.syncStatus() || '{}'); } catch (e) { return {}; }
  }

  function callNative(method, arg) {
    return new Promise(function (res, rej) {
      var x = nat(); if (!x || !x[method]) return rej(new Error('Drive sync works in the Wellness app on your phone.'));
      var id = 'ds' + (++seq);
      cbs[id] = [res, rej];
      try {
        if (arg !== undefined) x[method](id, arg);
        else x[method](id);
      } catch (e) { delete cbs[id]; rej(e); }
    });
  }

  function extraRequests() {
    if (!reqProvider) return [];
    try { var r = reqProvider(); return Array.isArray(r) ? r : []; } catch (e) { return []; }
  }

  function pendingRequestCount() {
    var seen = {}, ack = {}, n = 0;
    S.acked.forEach(function (id) { ack[id] = 1; });
    S.requests.concat(extraRequests()).forEach(function (r) {
      if (r && r.id && !seen[r.id] && !ack[r.id]) { seen[r.id] = 1; n++; }
    });
    return n;
  }

  function status() {
    var ns = nativeStatus(), x = nat();
    if (!ns) return { available: false, configured: false, name: '', lastSync: null, error: '', busy: false, pendingRequests: 0, pendingAnswers: 0, answersSupported: false, answersConfigured: false, answersName: '', answersError: '' };
    var nLast = ns.lastSync ? new Date(ns.lastSync).toISOString() : null;
    var last = S.lastSync;
    if (nLast && (!last || Date.parse(nLast) > Date.parse(last))) last = nLast;
    return {
      available: true,
      configured: !!ns.configured,
      name: ns.name || 'wellness-sync.json',
      lastSync: last,
      error: S.lastError || ns.error || '',
      busy: !!inFlight || !!ns.busy,
      pendingRequests: pendingRequestCount(),
      pendingAnswers: Object.keys(S.answers).length,
      answersSupported: !!(x && x.syncPickAnswers && x.syncReadAnswers),
      answersConfigured: !!ns.answersConfigured,
      answersName: ns.answersConfigured ? (ns.answersName || 'wellness-answers') : '',
      answersError: S.answersError || ns.answersError || ''
    };
  }

  function available() { return !!nat(); }

  function pick() {
    var x = nat(); if (!x || !x.syncPick) return;
    S.lastError = null; store.save(S);
    x.syncPick();
  }

  function pickAnswers() {
    var x = nat(); if (!x || !x.syncPickAnswers) return;
    S.answersError = null; store.save(S);
    x.syncPickAnswers();
  }

  function forgetAnswers() {
    var x = nat();
    S.answersError = null; store.save(S);
    if (x && x.syncForgetAnswers) x.syncForgetAnswers();
    else emitState();
  }

  function forget() {
    var x = nat();
    S.lastSync = null; S.lastAuto = null; S.lastError = null; S.answersError = null; store.save(S);
    if (x && x.syncForget) x.syncForget();
    else emitState();
  }

  /* Run a full read (sync file + optional answers sheet) -> take answers -> write cycle.
     opts.auto enforces the 30-min throttle. */
  function sync(opts) {
    opts = opts || {};
    var st = status();
    if (!st.available || !st.configured) return Promise.resolve({ ok: false, skipped: true });
    if (inFlight) return inFlight;
    var now = new Date();
    if (opts.auto && !C.autoDue(S, now)) return Promise.resolve({ ok: false, skipped: true });

    if (WL.modules) Object.keys(WL.modules).forEach(function (id) { var m = WL.modules[id]; if (m && m.saveNow) try { m.saveNow(); } catch (e) {} });
    if (opts.auto) { S.lastAuto = now.toISOString(); store.save(S); }

    var fresh = [];
    inFlight = Promise.resolve().then(function () {
      emitState();
      return callNative('syncRead');
    }).then(function (remoteText) {
      var m = C.mergeRemote(S, remoteText);
      fresh = m.fresh.slice();
      var x = nat();
      if (!st.answersConfigured || !x || !x.syncReadAnswers) return null;
      return callNative('syncReadAnswers').then(function (ansText) {
        var m2 = C.mergeRemote(S, ansText);
        if (m2.fresh.length) fresh = fresh.concat(m2.fresh);
        S.answersError = null;
      }, function (ae) {
        // Keep syncing backup + outgoing requests even if Drive refuses answers-sheet export; show the error plainly in Settings.
        S.answersError = String((ae && ae.message) || ae || 'Could not read the answers sheet.').slice(0, 300);
      });
    }).then(function () {
      // save received answers and acked ids locally BEFORE writing back to Drive
      store.save(S);
      var backupObj = JSON.parse(WL.backupText());
      var payload = C.buildPayload(backupObj, S, new Date(), extraRequests());
      return callNative('syncWrite', payload);
    }).then(function () {
      var doneAt = new Date().toISOString();
      S.lastSync = doneAt; S.lastAuto = doneAt; S.lastError = null;
      store.save(S);
      inFlight = null;
      emitState();
      emitAnswers(fresh);
      return { ok: true, fresh: fresh, answersError: S.answersError || '' };
    }, function (e) {
      S.lastError = String((e && e.message) || e || 'Google Drive sync failed.').slice(0, 300);
      store.save(S);
      inFlight = null;
      emitState();
      // if answers were already read before write failed, still notify listeners so nothing is lost
      emitAnswers(fresh);
      throw e;
    });
    return inFlight;
  }

  function autoSync() {
    var st = status();
    if (st.available && st.configured) sync({ auto: true }).catch(function () {});
  }

  function start() {
    // quiet auto-sync shortly after app open (once all modules have loaded)
    setTimeout(autoSync, 1500);
  }

  WL.driveSync = {
    available: available,
    status: status,
    pick: pick,
    pickAnswers: pickAnswers,
    forgetAnswers: forgetAnswers,
    forget: forget,
    sync: sync,
    autoSync: autoSync,
    start: start,
    enqueue: function (task, input, id) { var r = C.enqueue(S, task, input, new Date(), id); store.save(S); emitState(); return r; },
    cancelRequest: function (id) { C.cancelRequest(S, id); store.save(S); emitState(); },
    requests: function () { return S.requests.slice(); },
    answers: function () { return Object.assign({}, S.answers); },
    peekAnswer: function (id) { return S.answers[id] || null; },
    takeAnswer: function (id) { var v = C.takeAnswer(S, id); store.save(S); emitState(); return v; },
    acked: function () { return S.acked.slice(); },
    onState: function (fn) { if (typeof fn === 'function') stateListeners.push(fn); },
    onAnswers: function (fn) { if (typeof fn === 'function') answerListeners.push(fn); },
    setRequestsProvider: function (fn) { reqProvider = typeof fn === 'function' ? fn : null; }
  };
})();
