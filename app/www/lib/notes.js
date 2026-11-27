/* Everywhere "Note for autopilot" feedback box (wl.notes.v1):
   Lets the user jot ideas, bugs, or feature requests from any screen. Notes stay private on the phone,
   ride along in backups & Drive wellness-sync.json, and go into the PC/cloud activity log so the next
   autopilot run sees them right away. Pure helpers are exported for Node unit tests. */
(function (root) {
  'use strict';
  var KEY = 'wl.notes.v1';
  var TAGS = ['Idea', 'Feature', 'Bug', 'Wording'];
  var MAX_NOTES = 200;

  function defaults() { return { notes: [] }; }

  var seq = 0;
  function newId(now) { return 'n' + (now ? now.getTime() : Date.now()).toString(36) + '-' + (++seq); }

  function add(state, text, where, tag, now) {
    var t = String(text == null ? '' : text).trim().slice(0, 1200);
    if (!t) return null;
    now = now || new Date();
    var w = String(where || '#home').trim().slice(0, 80) || '#home';
    var g = TAGS.indexOf(tag) >= 0 ? tag : 'Idea';
    var item = { id: newId(now), at: now.toISOString(), where: w, tag: g, text: t };
    if (!Array.isArray(state.notes)) state.notes = [];
    state.notes.unshift(item);
    if (state.notes.length > MAX_NOTES) state.notes.length = MAX_NOTES;
    return item;
  }

  function remove(state, id) {
    if (!state || !Array.isArray(state.notes)) return false;
    var n0 = state.notes.length;
    state.notes = state.notes.filter(function (x) { return x && x.id !== id; });
    return state.notes.length !== n0;
  }

  function validate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) return null;
    var d = defaults();
    raw.notes.slice(0, MAX_NOTES).forEach(function (x) {
      if (!x || typeof x.text !== 'string' || !x.text.trim() || isNaN(Date.parse(x.at))) return;
      d.notes.push({
        id: String(x.id || newId()).slice(0, 40),
        at: new Date(x.at).toISOString(),
        where: String(x.where || '#home').slice(0, 80),
        tag: TAGS.indexOf(x.tag) >= 0 ? x.tag : 'Idea',
        text: x.text.trim().slice(0, 1200)
      });
      if (typeof x.read === 'string' && !isNaN(Date.parse(x.read))) d.notes[d.notes.length - 1].read = new Date(x.read).toISOString();
    });
    return d;
  }

  /* A cloud run's "notes-ack" answer: these notes were read by the autopilot (at = when). Returns how many changed. */
  function markRead(state, ids, at) {
    if (!state || !Array.isArray(state.notes) || !Array.isArray(ids)) return 0;
    var when = typeof at === 'string' && !isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString(), n = 0;
    state.notes.forEach(function (x) { if (x && !x.read && ids.indexOf(x.id) >= 0) { x.read = when; n++; } });
    return n;
  }
  function unread(state) { return (state && Array.isArray(state.notes) ? state.notes : []).filter(function (x) { return x && !x.read; }); }

  var api = { KEY: KEY, TAGS: TAGS, defaults: defaults, add: add, remove: remove, validate: validate, markRead: markRead, unread: unread };
  root.WLNotes = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ---- Browser UI (attached to WL once shell.js is loaded) ---- */
  if (!root.WL) return;
  var WL = root.WL, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store(KEY, defaults);
  var S = store.load();
  var keyFn = null, lastTrigger = null, listeners = [];

  function notify() { listeners.forEach(function (fn) { try { fn(S); } catch (e) {} }); }
  function save() { store.save(S); notify(); }
  function reload() { S = store.load(); }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function close(trigger) {
    if (keyFn) { document.removeEventListener('keydown', keyFn); keyFn = null; }
    var old = $('#wl-note-modal');
    if (old) old.remove();
    var target = trigger || lastTrigger;
    lastTrigger = null;
    if (target && target.isConnected && target.focus) try { target.focus(); } catch (e) {}
  }

  function listHtml() {
    if (!S.notes.length) return '';
    return '<details id="wl-note-list" style="margin-top:10px"><summary class="meta">Saved notes for autopilot (' + S.notes.length + ')</summary><ul class="list">' +
      S.notes.slice(0, 30).map(function (n) {
        var d = !isNaN(Date.parse(n.at)) ? new Date(n.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        var rd = n.read && !isNaN(Date.parse(n.read)) ? new Date(n.read).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        return '<li class="entry"><span class="kind">' + esc(n.tag) + '</span> <span class="when">' + esc(d + (n.where ? ' · ' + n.where : '')) + '</span><p>' + esc(n.text) + '</p>' +
          '<p class="meta wl-note-state">' + (rd ? '✓ Read by the autopilot (' + esc(rd) + ')' : 'Waiting for the next autopilot run') + '</p>' +
          '<button class="link wl-note-del" type="button" data-id="' + esc(n.id) + '" aria-label="Delete note">Delete</button></li>';
      }).join('') + '</ul></details>';
  }

  /* Where a note goes: with Drive sync or the PC link on, to the next autopilot run; otherwise it waits on the phone. */
  function whereText() {
    var on = false;
    try { var st = WL.driveSync && WL.driveSync.status && WL.driveSync.status(); on = !!(st && st.configured); } catch (e) {}
    try { if (!on && WL.pc && WL.pc.ready && WL.pc.ready()) on = true; } catch (e) {}
    return on ? 'Saved on this phone and synced via Drive / PC link so Claude &amp; Gemini see it next run.'
      : 'Saved on this phone. The autopilot sees it once Drive sync (Settings) or the PC link is on.';
  }
  /* A note typed but not saved (the app went to the background, Back, ✕) waits here and comes back next time. */
  var DRAFT = 'wl.notes.draft';
  function getDraft() { try { var d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); return d && typeof d.text === 'string' && d.text.trim() ? d : null; } catch (e) { return null; } }
  function setDraft(d) { try { if (d && d.text && d.text.trim()) localStorage.setItem(DRAFT, JSON.stringify({ text: d.text.slice(0, 1200), tag: d.tag })); else localStorage.removeItem(DRAFT); } catch (e) {} }
  function open(trigger, whereOverride) {
    close();
    var draft = getDraft();
    lastTrigger = trigger || null;
    var where = whereOverride || location.hash || '#home';
    var pickedTag = draft && TAGS.indexOf(draft.tag) >= 0 ? draft.tag : 'Idea';
    var wrap = document.createElement('div');
    wrap.id = 'wl-note-modal';
    wrap.className = 'wl-modal ui';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'wl-note-h');
    wrap.innerHTML = '<div class="card wl-modal-box" id="wl-note-sheet">' +
      '<div class="row" style="margin-bottom:4px"><h3 class="grow" id="wl-note-h" style="margin:0">Note for the next autopilot run</h3><button class="link" id="wl-note-x" type="button" aria-label="Close">✕</button></div>' +
      '<p class="meta" id="wl-note-where" style="margin:0 0 8px">About: <b>' + esc(where) + '</b>. ' + whereText() + '</p>' +
      '<div class="chips" id="wl-note-tags" style="margin-bottom:8px">' + TAGS.map(function (t) {
        return '<button class="chip" type="button" data-ntag="' + esc(t) + '" aria-pressed="' + (t === pickedTag) + '">' + esc(t) + '</button>';
      }).join('') + '</div>' +
      '<label class="sr" for="wl-note-in">Your note for autopilot</label>' +
      '<textarea id="wl-note-in" rows="3" placeholder="e.g. white noise during sits, exact timer, a new cooking idea...">' + (draft ? esc(draft.text) : '') + '</textarea>' +
      (draft ? '<p class="meta" id="wl-note-draft" style="margin:4px 0 0">Your unsaved note from last time. <button class="link" id="wl-note-clear" type="button">Clear it</button></p>' : '') +
      '<div class="row" style="margin-top:8px"><button class="primary" id="wl-note-save" type="button">Save note</button><button id="wl-note-close" type="button">Cancel</button></div>' +
      '<div id="wl-note-list-wrap">' + listHtml() + '</div></div>';
    document.body.appendChild(wrap);
    if (window.WL && WL.trapTab) WL.trapTab(wrap);

    function wireList() {
      $$('.wl-note-del', wrap).forEach(function (b) {
        b.onclick = function () {
          // a note the autopilot hasn't read yet: a second tap deletes it (no system dialog)
          var n0 = S.notes.filter(function (x) { return x && x.id === b.dataset.id; })[0];
          if (n0 && !n0.read && b.dataset.sure !== '1') {
            b.dataset.sure = '1'; b.textContent = 'Not read yet: tap again to delete'; b.setAttribute('aria-label', 'Not read by the autopilot yet. Tap again to delete');
            setTimeout(function () {
              if (b.isConnected && b.dataset.sure === '1') {
                delete b.dataset.sure; b.textContent = 'Delete'; b.setAttribute('aria-label', 'Delete note');
              }
            }, 4000);
            return;
          }
          remove(S, b.dataset.id); save();
          var lw = $('#wl-note-list-wrap', wrap);
          if (lw) { lw.innerHTML = listHtml(); var det = $('#wl-note-list', lw); if (det) det.open = true; wireList(); }
          if (window.WL && WL.refocus) WL.refocus(wrap, '.wl-note-del', '#wl-note-in');
          else { var ta2 = $('#wl-note-in', wrap); if (ta2 && ta2.focus) try { ta2.focus(); } catch (e) {} }
          WL.toast('Note removed');
        };
      });
    }
    wireList();

    $$('[data-ntag]', wrap).forEach(function (b) {
      b.onclick = function () {
        pickedTag = b.dataset.ntag;
        if (ta0 && ta0.value.trim()) setDraft({ text: ta0.value, tag: pickedTag });
        $$('[data-ntag]', wrap).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      };
    });
    var ta0 = $('#wl-note-in', wrap);
    ta0.oninput = function () { setDraft({ text: ta0.value, tag: pickedTag }); };
    var clr = $('#wl-note-clear', wrap);
    if (clr) clr.onclick = function () { setDraft(null); ta0.value = ''; var dl = $('#wl-note-draft', wrap); if (dl) dl.remove(); ta0.focus(); };
    wrap.onclick = function (e) { if (e.target === wrap) close(trigger); };
    $('#wl-note-x', wrap).onclick = function () { close(trigger); };
    $('#wl-note-close', wrap).onclick = function () { close(trigger); };
    $('#wl-note-save', wrap).onclick = function () {
      var ta = $('#wl-note-in', wrap);
      var item = add(S, ta.value, where, pickedTag, new Date());
      if (!item) { ta.focus(); return; }
      save(); setDraft(null);
      if (WL.driveSync && WL.driveSync.status && WL.driveSync.status().configured) {
        try { WL.driveSync.sync({ auto: false }).catch(function () {}); } catch (e) {}
      }
      close(trigger);
      WL.toast('Saved for the next autopilot run');
    };
    keyFn = function (ev) {
      if (!wrap.isConnected) { close(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); close(trigger); }
    };
    document.addEventListener('keydown', keyFn);
    var ta = $('#wl-note-in', wrap); if (ta && ta.focus) try { ta.focus(); } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-wl-note]');
    if (!b) return;
    e.preventDefault();
    open(b, b.dataset.wlNote && b.dataset.wlNote !== '1' ? b.dataset.wlNote : (location.hash || '#home'));
  });
  window.addEventListener('hashchange', function () { close(); });
  // Android Back (MainActivity.goBack -> window.FCBack): light a dark screen first, else close an open note sheet
  var prevBack = root.FCBack;
  root.FCBack = function () {
    if (prevBack && prevBack()) return true;
    if ($('#wl-note-modal')) { close(); return true; }
    return false;
  };
  // a cloud run says which notes it has read (an answers-sheet row, task notes-ack); pc.js loads after this file
  function hookAck() {
    if (!WL.pc || !WL.pc.onCloudAnswer) return;
    WL.pc.onCloudAnswer('notes-ack', function (e, ans) {
      if (e || !ans || !Array.isArray(ans.ids)) return;
      S = store.load();
      if (markRead(S, ans.ids, ans.at)) save(); // an open sheet shows it the next time it opens
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookAck); else setTimeout(hookAck, 0);

  WL.notes = {
    open: open, close: close, reload: reload, onChange: onChange,
    state: function () { return S; },
    validateRaw: function (raw) { try { var v = validate(JSON.parse(raw)); return v ? JSON.stringify(v) : null; } catch (e) { return null; } }
  };
})(typeof window !== 'undefined' ? window : this);
