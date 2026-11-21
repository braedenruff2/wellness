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
  function ask(task, input, onWait, meta) {
    // not paired: with Drive sync on, it goes straight to the cloud queue (e.queued), else "pair first"
    if (!ready()) return Promise.reject(orQueue(new Error('Pair the PC link first (Settings › PC link).'), task, input, meta));
    var t0 = Date.now();
    return post('/v1/ask', { task: task, input: input }).then(function (r) { return poll(r.job, t0, onWait); }, function (e) {
      throw orQueue(e, task, input, meta);
    });
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
        }, function (e) {
          // one failed check (Wi-Fi blip, screen off) doesn't abandon the job: it keeps running on the PC
          if (e && /no such request/.test(e.message || "")) return rej(e); // the PC restarted: the job is gone
          if (Date.now() - t0 > 9 * 60000) return rej(e);
          setTimeout(tick, 3000);
        });
      })();
    });
  }

  /* Cloud answers (task B): when the PC can't be reached, a Claude request goes into the Drive sync file's queue
     (WL.driveSync, lib/sync.js) and the next cloud run answers it with the same prompt (pc/prompts/<task>.md).
     Each module registers how to show an answer (onCloudAnswer), the same code it uses for a PC answer.
     P.cloud keeps, per queued id, the task and what the module needs to show the answer later (meta). */
  var QUEUED = 'Your PC isn’t answering, so this will be answered by the next cloud run (within about 5 hours).';
  var QUEUED_CLOUD = 'This will be answered by the next cloud run (within about 5 hours).';
  /* What a waiting request says: "PC isn't answering" only when there is a PC to answer. */
  function queuedText() { return ready() ? QUEUED : QUEUED_CLOUD; }
  /* Claude can be asked at all: the PC link is paired, or Drive sync is on (the cloud run answers). */
  function canAsk() { return ready() || cloudOn(); }
  var handlers = {};
  function cloud() { if (!P.cloud || typeof P.cloud !== 'object') P.cloud = {}; return P.cloud; }
  function unreachable(e) {
    return /couldn.t reach the PC|timed? ?out|failed to connect|unreachable|no route|connection (refused|reset)|network|pair the PC link/i.test(String((e && e.message) || e || ''));
  }
  function cloudOn() {
    var d = WL.driveSync; if (!d || !d.enqueue) return false;
    try { var st = d.status(); return !!(st && st.available && st.configured); } catch (e) { return false; }
  }
  function queued(task) {
    return Object.keys(cloud()).filter(function (id) { return !task || cloud()[id].task === task; })
      .map(function (id) { var c = cloud()[id]; return { id: id, task: c.task, at: c.at, meta: c.meta || null }; })
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  /* Puts a request in the cloud queue (one per task and input: asking twice doesn't queue twice). Returns it, or
     null when Drive sync isn't set up (then nothing can answer it). */
  function queue(task, input, meta) {
    if (!cloudOn()) return null;
    // one waiting at a time for these (a new day's input is still the same question); others: one per input
    var key = /^(weekly-plan|advice|coach-scenario)$/.test(task) ? task : JSON.stringify(input || {}).slice(0, 4000), mine = queued(task);
    for (var i = 0; i < mine.length; i++) if (cloud()[mine[i].id].key === key) return { id: mine[i].id, task: task, at: mine[i].at };
    var r = WL.driveSync.enqueue(task, input || {});
    cloud()[r.id] = { task: task, at: r.at, key: key, meta: meta == null ? null : meta };
    store.save(P);
    try { WL.driveSync.sync().catch(function () {}); } catch (e) {}
    return r;
  }
  /* The error a module shows when the PC failed: queued for the cloud (e.queued) when the PC couldn't be reached and
     the module can show a cloud answer; otherwise the PC's own error, with a hint when Drive sync would help. */
  function orQueue(e, task, input, meta) {
    if (!unreachable(e) || !handlers[task]) return e;
    var r = queue(task, input, meta);
    if (!r) {
      var x = new Error(String((e && e.message) || e) + (WL.driveSync && WL.driveSync.available() ? ' Turn on Settings › Sync with Google Drive and the next cloud run can answer instead.' : ''));
      return x;
    }
    var q = new Error(queuedText()); q.queued = r; return q;
  }
  /* Asks the PC; if it can't be reached, queues for the cloud. Resolves to the answer, or rejects (e.queued set
     when it went to the cloud). Used where the PC must be reached first (sync) before asking. */
  function askOrQueue(task, input, onWait, meta) { return ask(task, input, onWait, meta); }
  function onCloudAnswer(task, fn) { handlers[task] = fn; setTimeout(deliver, 0); }
  /* Hands every cloud answer that has arrived to its module (once). A cloud answer is {task, answer} or
     {task, error}; a bare answer object works too. */
  function deliver() {
    var d = WL.driveSync; if (!d || !d.answers) return 0;
    var all = d.answers(), n = 0, old = Date.now() - 7 * 864e5;
    Object.keys(cloud()).forEach(function (id) { if (!(id in all) && Date.parse(cloud()[id].at) < old) { delete cloud()[id]; store.save(P); } });
    Object.keys(all).forEach(function (id) {
      var c = cloud()[id], a = all[id] || {};
      var task = (c && c.task) || (typeof a.task === 'string' ? a.task : '');
      // an answer this phone isn't waiting for and that is over a week old (a sheet row seen again after a restore
      // or once its id left the acked list) is dropped, not shown again
      if (!c && a.at && Date.parse(a.at) < old) { d.takeAnswer(id); return; }
      // he cancelled it before the cloud's answer came in
      if (!c && Array.isArray(P.cancelled) && P.cancelled.indexOf(id) >= 0) { d.takeAnswer(id); return; }
      var h = handlers[task]; if (!h || (!c && !a.task)) return;
      d.takeAnswer(id); delete cloud()[id]; store.save(P); n++;
      var ans = a && typeof a === 'object' && a.answer && typeof a.answer === 'object' ? a.answer : (a.error ? null : a);
      var err = a && a.error && !a.answer ? String(a.error).slice(0, 400) : null;
      try { h(err, ans, c ? c.meta : null, { id: id, task: task, at: c ? c.at : null }); } catch (x) {}
    });
    return n;
  }
  /* Drops a waiting cloud request (a typo, or he changed his mind): out of the sync file's queue, and an answer that
     still arrives for it (the cloud run may have answered before the phone synced) is taken and not shown. */
  var cancelFns = [];
  function cancel(id) {
    var c = cloud()[id]; if (!c) return false;
    delete cloud()[id];
    var gone = Array.isArray(P.cancelled) ? P.cancelled : [];
    if (gone.indexOf(id) < 0) gone.push(id);
    P.cancelled = gone.slice(-50); store.save(P);
    if (WL.driveSync && WL.driveSync.cancelRequest) {
      WL.driveSync.cancelRequest(id);
      try { WL.driveSync.sync().catch(function () {}); } catch (e) {}
    }
    cancelFns.forEach(function (fn) { try { fn(c.task, id); } catch (e) {} });
    return true;
  }
  function onCancel(fn) { if (typeof fn === 'function') cancelFns.push(fn); }
  /* A "Cancel" button for waiting requests (ids: one id or a list); what: read out by screen readers. */
  function cancelHtml(ids, what) {
    ids = [].concat(ids || []).filter(Boolean); if (!ids.length) return '';
    return ' <button class="link small" data-cloud-cancel="' + WL.esc(ids.join(' ')) + '" aria-label="' + WL.esc('Cancel ' + (what || 'this request')) + '">Cancel</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-cloud-cancel]') : null; if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var n = 0; String(b.getAttribute('data-cloud-cancel')).split(' ').forEach(function (id) { if (id && cancel(id)) n++; });
    if (n) WL.toast('Cancelled: it won’t be answered');
    WL.route();
  });
  if (WL.driveSync && WL.driveSync.onAnswers) WL.driveSync.onAnswers(function () { deliver(); });
  setTimeout(deliver, 2500);

  // send the log when the app opens and every 15 minutes while it's open (quietly: no PC, no problem)
  function auto() { if (ready() && !document.hidden) sync().catch(function () {}); }
  setTimeout(auto, 4000);
  setInterval(auto, 15 * 60000);

  WL.pc = {
    status: status, ready: ready, request: request, get: get, post: post, sync: sync, ask: ask, poll: poll, events: events,
    askOrQueue: askOrQueue, orQueue: orQueue, queue: queue, queued: queued, onCloudAnswer: onCloudAnswer, deliver: deliver, cloudOn: cloudOn, cancel: cancel, onCancel: onCancel, cancelHtml: cancelHtml,
    unreachable: unreachable, QUEUED: QUEUED, QUEUED_CLOUD: QUEUED_CLOUD, queuedText: queuedText, canAsk: canAsk,
    settings: function () { return P; }, save: function () { store.save(P); }, storeKey: store.key, reload: function () { P = store.load(); },
    reset: function () { P.sent = {}; P.lastSync = null; P.weekSent = null; store.save(P); }
  };
})();
