/* PC link (WL.pc): the phone app talking to his own PC (pc/wellness_pc.py) on home Wi-Fi, through the Android
   side (PcLink.java: HTTPS pinned to the PC's certificate, the per-phone key from pairing). Used for:
   - sync(): the activity log (lib/activity.js) of every part, plus Tagalog's "my week", to Desktop\wellness-progress;
   - ask(task, input): Claude on the PC (claude -p with his own Claude Code): the parenting coach, Tagalog checks, advice.
   In a plain browser (the PC's Chrome) there is no link: ready() is false and everything says so. */
(function () {
  'use strict';
  var A = window.WLActivity;
  var store = WL.store('wl.pc.v1', function () { return { sent: {}, lastSync: null, lastError: null, lastSent: 0, journalText: false, weekSent: null }; });
  var P = store.load();
  var cbs = {}, n = 0, syncing = null;

  function nat() { var x = window.FCAndroid; return x && x.pcRequest ? x : null; }
  window.FCPcDone = function (id, ok, text) {
    var c = cbs[id]; delete cbs[id];
    if (c) { if (ok) c[0](text); else c[1](new Error(text || 'the PC link failed')); }
  };
  /* op: find | pair (host, code) | get (path) | post (path, json) | forget */
  function request(op, a, b) {
    return new Promise(function (res, rej) {
      var x = nat(); if (!x) return rej(new Error('The PC link works in the phone app.'));
      var id = 'p' + (++n); cbs[id] = [res, rej];
      try { x.pcRequest(id, op, a == null ? '' : String(a), b == null ? '' : String(b)); } catch (e) { delete cbs[id]; rej(e); }
    });
  }
  function json(t) { try { return JSON.parse(t); } catch (e) { throw new Error('the PC sent something odd'); } }
  function status() {
    var x = nat(); if (!x) return { available: false, paired: false };
    try { var s = JSON.parse(x.pcStatus() || '{}'); s.available = true; return s; } catch (e) { return { available: true, paired: false }; }
  }
  function ready() { return !!status().paired; }
  function get(path) { return request('get', path).then(json); }
  function post(path, body) { return request('post', path, JSON.stringify(body)).then(json); }

  function states() {
    var out = {};
    (A ? A.keys : []).forEach(function (k) { try { var v = localStorage.getItem(k); if (v) out[k] = JSON.parse(v); } catch (e) {} });
    return out;
  }
  function events(now) { return A ? A.collect(states(), { journalText: P.journalText }, now) : []; }

  /* Sends what hasn't been sent (in batches), and Tagalog's "my week" once a day. Resolves to the number sent. */
  function sync(opts) {
    opts = opts || {};
    if (syncing) return syncing;
    if (!ready()) return Promise.resolve(0);
    if (opts.save !== false) WL.modules && Object.keys(WL.modules).forEach(function (id) { var m = WL.modules[id]; if (m.saveNow) try { m.saveNow(); } catch (e) {} });
    var all = events(), todo = A.unsent(all, P.sent), total = 0;
    var tl = WL.modules && WL.modules.tagalog && WL.modules.tagalog.weekSummary, today = WL.isoDate();
    var week = tl && P.weekSent !== today ? (function () { try { return tl(); } catch (e) { return null; } })() : null;
    function next() {
      // batches of up to 1000 events and about 200 KB (journal text can make events big; the PC takes 1 MB at most)
      var batch = [], size = 0;
      while (todo.length && batch.length < 1000 && (!batch.length || size + JSON.stringify(todo[0]).length < 200000)) {
        var e = todo.shift(); size += JSON.stringify(e).length; batch.push(e);
      }
      if (!batch.length && !week) return Promise.resolve(total);
      var body = { events: batch }; if (week) body.tagalogWeek = week;
      return post('/v1/activity', body).then(function () {
        A.markSent(P.sent, batch); total += batch.length;
        if (week) { P.weekSent = today; week = null; }
        store.save(P);
        return todo.length ? next() : total;
      });
    }
    syncing = next().then(function (t) {
      A.markSent(P.sent, [], all); // forget ids that have aged out
      P.lastSync = new Date().toISOString(); P.lastError = null; P.lastSent = t; store.save(P);
      syncing = null; return t;
    }, function (e) {
      P.lastError = String(e.message || e).slice(0, 200); P.lastErrorAt = new Date().toISOString(); store.save(P);
      syncing = null; throw e;
    });
    return syncing;
  }

  /* Claude on the PC: starts the request, then checks every few seconds (it takes 10 s to a few minutes).
     onWait(seconds) is called while waiting. Resolves to Claude's answer object. */
  function ask(task, input, onWait) {
    if (!ready()) return Promise.reject(new Error('Pair the PC link first (Settings > PC link).'));
    var t0 = Date.now();
    return post('/v1/ask', { task: task, input: input }).then(function (r) { return poll(r.job, t0, onWait); });
  }
  function poll(job, t0, onWait) {
    return new Promise(function (res, rej) {
      (function tick() {
        get('/v1/job?id=' + encodeURIComponent(job)).then(function (r) {
          if (r.state === 'done') return res(r.answer || {});
          if (r.state === 'error') return rej(new Error(r.error || 'Claude had a problem'));
          if (Date.now() - t0 > 9 * 60000) return rej(new Error('Claude is taking too long. Try again later.'));
          if (onWait) try { onWait(Math.round((Date.now() - t0) / 1000)); } catch (e) {}
          setTimeout(tick, 3000);
        }, rej);
      })();
    });
  }

  // send the log when the app opens and every 15 minutes while it's open (quietly: no PC, no problem)
  function auto() { if (ready() && !document.hidden) sync().catch(function () {}); }
  setTimeout(auto, 4000);
  setInterval(auto, 15 * 60000);

  WL.pc = {
    status: status, ready: ready, request: request, get: get, post: post, sync: sync, ask: ask, poll: poll, events: events,
    settings: function () { return P; }, save: function () { store.save(P); }, storeKey: store.key, reload: function () { P = store.load(); },
    reset: function () { P.sent = {}; P.lastSync = null; P.weekSent = null; store.save(P); }
  };
})();
