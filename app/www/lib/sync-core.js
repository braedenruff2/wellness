/* Pure logic for Google Drive sync (wellness-sync.json): 30-min auto-sync throttle, reading cloud answers
   before writing, keeping answers locally until shown, writing acked ids, and building the backup+requests JSON.
   Tested directly in Node (tests/sync.cjs) and used by lib/sync.js in the browser/WebView. */
(function (root) {
  'use strict';
  var AUTO_MS = 30 * 60 * 1000;
  var MAX_ACKED = 200;
  var MAX_REQUESTS = 50;

  function defaults() {
    return { requests: [], answers: {}, acked: [], lastSync: null, lastAuto: null, lastError: null, answersError: null, lastWrite: null };
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

  /* RFC-4180 CSV parser (handles quotes, doubled quotes, commas & newlines inside quotes, BOM, CRLF/LF/CR). */
  function parseCsv(text) {
    var s = String(text || '');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    var rows = [], row = [], cell = '', inQ = false, has = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (i + 1 < s.length && s.charAt(i + 1) === '"') { cell += '"'; i++; }
          else inQ = false;
        } else cell += c;
      } else {
        if (c === '"' && !cell.length) { inQ = true; has = true; }
        else if (c === ',') { row.push(cell); cell = ''; has = true; }
        else if (c === '\r' || c === '\n') {
          if (c === '\r' && i + 1 < s.length && s.charAt(i + 1) === '\n') i++;
          if (has || cell.length || row.length) { row.push(cell); rows.push(row); }
          row = []; cell = ''; has = false;
        } else { cell += c; has = true; }
      }
    }
    if (has || cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* Converts sheet rows ({id, task, raw, at} or CSV arrays [id, task, raw, at]) into an answers map.
     Malformed JSON in one row is skipped safely so other answers still arrive. */
  function rowsToAnswers(rows) {
    var out = {};
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], id, task, raw, at;
      if (Array.isArray(r)) {
        if (r.length < 3) continue;
        id = String(r[0] || '').trim();
        task = String(r[1] || '').trim();
        raw = String(r[2] || '').trim();
        at = r.length > 3 ? String(r[3] || '').trim() : '';
        if (i === 0 && id.toLowerCase() === 'id' && task.toLowerCase() === 'task') continue;
      } else if (r && typeof r === 'object') {
        id = String(r.id || '').trim();
        task = String(r.task || '').trim();
        raw = String(r.raw || '').trim();
        at = String(r.at || '').trim();
      } else continue;
      if (!id || !raw) continue;
      var obj;
      try { obj = JSON.parse(raw); } catch (e) { continue; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
      var entry;
      if ((obj.answer && typeof obj.answer === 'object') || typeof obj.error === 'string') {
        entry = Object.assign({}, obj);
        if (!entry.task && task) entry.task = task;
        if (!entry.at && at) entry.at = at;
      } else {
        entry = { task: task, answer: obj };
        if (at) entry.at = at;
      }
      out[id] = entry;
    }
    return out;
  }

  /* Read the existing Drive file (or exported answers sheet CSV / {"rows":[...]}) before writing:
     take any new `answers` (keyed by request id) not yet acked, store them in state.answers until shown,
     add their ids to state.acked, and drop answered requests. */
  function mergeRemote(state, remoteText) {
    state.requests = Array.isArray(state.requests) ? state.requests : [];
    state.answers = state.answers && typeof state.answers === 'object' && !Array.isArray(state.answers) ? state.answers : {};
    state.acked = Array.isArray(state.acked) ? state.acked : [];
    var raw = String(remoteText || '');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    raw = raw.trim();
    if (!raw) return { fresh: [], badRemote: false };
    var ans = null;
    if (raw.charAt(0) === '{') {
      var remote;
      try { remote = JSON.parse(raw); } catch (e) { return { fresh: [], badRemote: true }; }
      if (!remote || typeof remote !== 'object') return { fresh: [], badRemote: true };
      ans = {};
      if (remote.answers && typeof remote.answers === 'object' && !Array.isArray(remote.answers)) {
        Object.assign(ans, remote.answers);
      }
      if (Array.isArray(remote.rows)) {
        Object.assign(ans, rowsToAnswers(remote.rows));
      }
    } else {
      ans = rowsToAnswers(parseCsv(raw));
    }
    var fresh = [];
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

  /* Skipping a write that would change nothing: an automatic sync whose payload (apart from its "exported" time) is
     what was last written, while Drive's file is still exactly that write, leaves the file alone, so Drive's version
     history isn't filled with the same copy every 30 minutes. Any other change, a file changed in Drive, or Sync now
     writes as before. Hashes only (FNV-1a), nothing of the data is kept. */
  function hash(str) {
    var h = 0x811c9dc5, s = String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + s.length.toString(36);
  }
  function bodyOf(payload) { return String(payload || '').replace(/\n "exported": "[^"]*",/, ''); }
  function unchanged(state, remoteText, payload) {
    var w = state && state.lastWrite;
    if (!w || typeof remoteText !== 'string' || !remoteText) return false;
    return hash(remoteText) === w.file && hash(bodyOf(payload)) === w.body;
  }
  function noteWrite(state, payload) { state.lastWrite = { file: hash(payload), body: hash(bodyOf(payload)) }; return state.lastWrite; }

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
    if (typeof raw.answersError === 'string' && raw.answersError) d.answersError = raw.answersError.slice(0, 300);
    var lw = raw.lastWrite;
    if (lw && typeof lw.file === 'string' && typeof lw.body === 'string' && lw.file.length <= 24 && lw.body.length <= 24) d.lastWrite = { file: lw.file, body: lw.body };
    return d;
  }

  /* Validate a backup / wellness-sync.json string before confirming restore. Returns {app, exported, storeCount}. */
  function describeBackup(text) {
    var raw = String(text || '');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    var o;
    try { o = JSON.parse(raw); } catch (e) { throw new Error('This is not a backup from this app.'); }
    if (!o || typeof o !== 'object') throw new Error('This is not a backup from this app.');
    if (o.app === 'faith-companion') {
      return { app: 'faith-companion', exported: typeof o.exported === 'string' && !isNaN(Date.parse(o.exported)) ? o.exported : null, storeCount: 1 };
    }
    if (o.app !== 'wellness' || !o.stores || typeof o.stores !== 'object' || Array.isArray(o.stores)) {
      throw new Error('This is not a backup from this app.');
    }
    var keys = Object.keys(o.stores).filter(function (k) { return typeof o.stores[k] === 'string'; });
    return {
      app: 'wellness',
      exported: typeof o.exported === 'string' && !isNaN(Date.parse(o.exported)) ? o.exported : null,
      storeCount: keys.length
    };
  }

  var api = {
    AUTO_MS: AUTO_MS, hash: hash, unchanged: unchanged, noteWrite: noteWrite, defaults: defaults, autoDue: autoDue, enqueue: enqueue, cancelRequest: cancelRequest,
    parseCsv: parseCsv, rowsToAnswers: rowsToAnswers, describeBackup: describeBackup,
    mergeRemote: mergeRemote, takeAnswer: takeAnswer, buildPayload: buildPayload, validate: validate
  };
  root.WLSyncCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
