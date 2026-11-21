/* Pure logic for Google Drive sync (wellness-sync.json): 30-min auto-sync throttle, reading cloud answers
   before writing, keeping answers locally until shown, writing acked ids, and building the backup+requests JSON.
   Tested directly in Node (tests/sync.cjs) and used by lib/sync.js in the browser/WebView. */
(function (root) {
  'use strict';
  var AUTO_MS = 30 * 60 * 1000;
  var MAX_ACKED = 200;
  var MAX_REQUESTS = 50;

  function defaults() {
    return { requests: [], answers: {}, acked: [], lastSync: null, lastAuto: null, lastError: null };
  }

  function newId(now) {
    return 'r' + (now ? now.getTime() : Date.now()).toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* Automatic sync (on app open or background) runs at most once every 30 minutes. */
  function autoDue(state, now) {
    now = now || new Date();
    var nowMs = now.getTime();
    var ls = state && state.lastSync ? Date.parse(state.lastSync) : 0;
    var la = state && state.lastAuto ? Date.parse(state.lastAuto) : 0;
    var last = Math.max(isNaN(ls) ? 0 : ls, isNaN(la) ? 0 : la);
    return !last || nowMs < last || nowMs - last >= AUTO_MS;
  }

  /* Add a cloud request {id, task, input, at} to the queue. */
  function enqueue(state, task, input, now, id) {
    now = now || new Date();
    state.requests = Array.isArray(state.requests) ? state.requests : [];
    var req = {
      id: String(id || newId(now)).slice(0, 60),
      task: String(task || '').slice(0, 60),
      input: input && typeof input === 'object' ? input : {},
      at: now.toISOString()
    };
    state.requests.push(req);
    if (state.requests.length > MAX_REQUESTS) state.requests.splice(0, state.requests.length - MAX_REQUESTS);
    return req;
  }

  function cancelRequest(state, id) {
    if (!Array.isArray(state.requests)) return;
    state.requests = state.requests.filter(function (r) { return r && r.id !== id; });
  }

  /* Read the existing Drive file before writing: take any new `answers` (keyed by request id) not yet acked,
     store them in state.answers until shown, add their ids to state.acked, and drop answered requests. */
  function mergeRemote(state, remoteText) {
    state.requests = Array.isArray(state.requests) ? state.requests : [];
    state.answers = state.answers && typeof state.answers === 'object' && !Array.isArray(state.answers) ? state.answers : {};
    state.acked = Array.isArray(state.acked) ? state.acked : [];
    var raw = String(remoteText || '').trim();
    if (!raw) return { fresh: [], badRemote: false };
    var remote;
    try { remote = JSON.parse(raw); } catch (e) { return { fresh: [], badRemote: true }; }
    if (!remote || typeof remote !== 'object') return { fresh: [], badRemote: true };
    var ans = remote.answers, fresh = [];
    if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
      Object.keys(ans).forEach(function (id) {
        if (!id || ans[id] == null) return;
        if (state.acked.indexOf(id) < 0) {
          state.answers[id] = ans[id];
          state.acked.push(id);
          fresh.push(id);
        }
        state.requests = state.requests.filter(function (r) { return r && r.id !== id; });
      });
      if (state.acked.length > MAX_ACKED) state.acked = state.acked.slice(-MAX_ACKED);
    }
    return { fresh: fresh, badRemote: false };
  }

  /* Take (and remove) a stored cloud answer once it has been shown. */
  function takeAnswer(state, id) {
    if (!state || !state.answers || !(id in state.answers)) return null;
    var v = state.answers[id];
    delete state.answers[id];
    return v;
  }

  /* Build the Drive file JSON: same shape as "Save a backup" plus `requests` and `acked`. */
  function buildPayload(backupObj, state, now, extraRequests) {
    now = now || new Date();
    var out = {
      app: (backupObj && backupObj.app) || 'wellness',
      exported: now.toISOString(),
      stores: backupObj && backupObj.stores && typeof backupObj.stores === 'object' ? backupObj.stores : {}
    };
    var seen = {}, ackSet = {}, reqs = [];
    (Array.isArray(state && state.acked) ? state.acked : []).forEach(function (id) { ackSet[id] = 1; });
    function addReq(r) {
      if (!r || !r.id || !r.task || seen[r.id] || ackSet[r.id]) return;
      seen[r.id] = 1;
      reqs.push({
        id: String(r.id),
        task: String(r.task),
        input: r.input && typeof r.input === 'object' ? r.input : {},
        at: r.at || now.toISOString()
      });
    }
    (Array.isArray(state && state.requests) ? state.requests : []).forEach(addReq);
    (Array.isArray(extraRequests) ? extraRequests : []).forEach(addReq);
    out.requests = reqs;
    out.acked = (Array.isArray(state && state.acked) ? state.acked : []).slice(-MAX_ACKED);
    return JSON.stringify(out, null, 1);
  }

  function validate(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (Array.isArray(raw.requests)) {
      raw.requests.slice(-MAX_REQUESTS).forEach(function (r) {
        if (r && typeof r.id === 'string' && r.id && typeof r.task === 'string' && r.task) {
          d.requests.push({
            id: r.id.slice(0, 60),
            task: r.task.slice(0, 60),
            input: r.input && typeof r.input === 'object' ? r.input : {},
            at: typeof r.at === 'string' ? r.at : new Date().toISOString()
          });
        }
      });
    }
    if (raw.answers && typeof raw.answers === 'object' && !Array.isArray(raw.answers)) {
      Object.keys(raw.answers).forEach(function (k) { if (k && raw.answers[k] != null) d.answers[k] = raw.answers[k]; });
    }
    if (Array.isArray(raw.acked)) {
      d.acked = raw.acked.filter(function (x) { return typeof x === 'string' && x; }).slice(-MAX_ACKED);
    }
    if (typeof raw.lastSync === 'string' && !isNaN(Date.parse(raw.lastSync))) d.lastSync = raw.lastSync;
    if (typeof raw.lastAuto === 'string' && !isNaN(Date.parse(raw.lastAuto))) d.lastAuto = raw.lastAuto;
    if (typeof raw.lastError === 'string' && raw.lastError) d.lastError = raw.lastError.slice(0, 300);
    return d;
  }

  var api = {
    AUTO_MS: AUTO_MS, defaults: defaults, autoDue: autoDue, enqueue: enqueue, cancelRequest: cancelRequest,
    mergeRemote: mergeRemote, takeAnswer: takeAnswer, buildPayload: buildPayload, validate: validate
  };
  root.WLSyncCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
