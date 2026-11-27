/* General Journal module (#journal): life notes, awe moments, thanks, and day reflections — separate from Faith so
   non-faith writing has its own home. Shares storage with fc.v1's journal array (via window.FC / FCCore) so existing
   entries, backups, Drive sync, and PC activity logs stay 100% compatible with zero migration risk. */
(function () {
  'use strict';
  var C = window.FCCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var view = null, lastTab = 'all';
  function logNow() { return WL.logNow ? WL.logNow() : new Date(); }
  function state() { return window.FC ? window.FC.state() : C.defaults(); }
  function save() { if (window.FC && window.FC.save) window.FC.save(); }

  function heavyNote() {
    return '<p class="gentle">It sounds like things may be really hard right now. You don\u2019t have to carry that alone: please consider talking to someone you trust, a pastor, or your doctor. If you are in danger, call your local emergency number.</p>';
  }

  function entryHtml(e) {
    var kinds = { journal: e.day ? 'Faith Day ' + e.day : 'Note', awe: 'Awe moment', gratitude: 'Thanks' };
    return '<li class="entry"><span class="kind">' + esc(kinds[e.kind] || e.kind) + '</span> <span class="when">' +
      esc(new Date(e.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><p>' + esc(e.text) + '</p>' +
      '<button class="link del" data-id="' + esc(e.id) + '" aria-label="Delete">Delete</button></li>';
  }

  var LB_KEY = 'wl.journal.lb.dismiss';
  function lbDismissed() {
    try { var a = JSON.parse(localStorage.getItem(LB_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function dismissLookBack(id) {
    if (!id) return;
    try {
      var a = lbDismissed();
      if (a.indexOf(id) < 0) a.push(id);
      localStorage.setItem(LB_KEY, JSON.stringify(a.slice(-50)));
    } catch (e) {}
  }
  function lookBackHtml(S, tab) {
    if (tab !== 'all' || !C.lookBack) return '';
    var lb = C.lookBack(S);
    if (!lb || !lb.entry || !lb.entry.id || lbDismissed().indexOf(lb.entry.id) >= 0) return '';
    var ago = lb.days === 7 ? 'a week ago' : lb.days === 30 ? 'about a month ago' : 'about three months ago';
    return '<details class="card ui" id="j-lookback"><summary class="meta">Looking back (' + ago + ')</summary>' +
      '<p style="margin:.4em 0">' + esc(lb.entry.text.slice(0, 280)) + (lb.entry.text.length > 280 ? '\u2026' : '') + '</p>' +
      '<div class="row"><button class="link" type="button" id="j-lb-dismiss" data-id="' + esc(lb.entry.id) + '">Dismiss</button></div></details>';
  }

  function screen(tab) {
    var S = state();
    tab = tab || 'all';
    if (['all', 'journal', 'awe', 'gratitude'].indexOf(tab) < 0) tab = 'all';
    lastTab = tab;
    var tabs = [['all', 'All'], ['journal', 'Notes'], ['awe', 'Awe moments'], ['gratitude', 'Thanks']];
    var h = '<h1>Journal</h1><p class="meta ui">For anything on your mind \u2014 life, parenting, thoughts, awe moments, or faith reflections. Stays on this phone.</p>';
    h += '<div class="tabs2 ui" role="tablist">' + tabs.map(function (t) {
      return '<button role="tab" data-jtab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var hint = {
      all: 'Anything on your mind.',
      journal: 'Anything on your mind \u2014 a quick note, a rough moment, or a thought to get out of your head.',
      awe: 'A moment of wonder, beauty, or joy, however small. Over time these add up.',
      gratitude: 'Something you\u2019re thankful for today.'
    }[tab];
    h += '<div class="card ui"><label for="new-entry">' + esc(hint) + '</label><textarea id="new-entry" placeholder="A line or two is plenty."></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="primary" id="add-entry" data-kind="' + (tab === 'all' ? 'journal' : tab) + '">Save</button><span class="grow"></span></div><div id="entry-gentle"></div></div>';
    h += lookBackHtml(S, tab);
    var items = (S.journal || []).filter(function (e) { return tab === 'all' || e.kind === tab; });
    if (items.length > 5) h += '<div class="ui" style="margin:8px 0"><label class="sr" for="j-search">Search your journal</label><input type="search" id="j-search" placeholder="Search your journal" autocomplete="off"><span class="meta" id="j-found"></span></div>';
    h += items.length ? '<ul class="list card" id="j-list">' + items.map(entryHtml).join('') + '</ul>' : '<p class="meta ui">Nothing here yet.</p>';
    h += '<div class="row ui" style="margin-top:10px"><button id="j-export-text">Save my journal as text</button></div>';
    h += '<div class="row ui" style="gap:4px 8px;margin-top:6px"><span class="meta">Looking for your Prayer list?</span><a class="link" href="#faith/prayers">Faith \u203a Prayer list</a></div>';
    return h;
  }

  function route(parts, v) {
    if (v) view = v;
    var tab = (parts && parts[0]) || 'all';
    view.innerHTML = screen(tab);
    wire();
  }

  function wire() {
    $$('[data-jtab]', view).forEach(function (b) {
      b.onclick = function () { location.hash = '#journal/' + b.dataset.jtab; };
    });
    var add = $('#add-entry', view);
    if (add) add.onclick = function () {
      var S = state(), ta = $('#new-entry', view), e = C.addEntry(S, add.dataset.kind, ta.value, null, logNow());
      if (!e) { ta.focus(); return; }
      save();
      var heavy = C.soundsHeavy(e.text);
      route([lastTab]);
      WL.toast('Saved');
      if (heavy && $('#entry-gentle', view)) $('#entry-gentle', view).innerHTML = heavyNote();
    };
    var js = $('#j-search', view);
    if (js) js.oninput = function () {
      var q = js.value.trim().toLowerCase(), n = 0;
      $$('#j-list > li', view).forEach(function (li) {
        var txt = ['.kind', '.when', 'p'].map(function (s) { var x = li.querySelector(s); return x ? x.textContent : ''; }).join(' ').toLowerCase();
        var hit = !q || txt.indexOf(q) >= 0; li.hidden = !hit; if (hit) n++;
      });
      var jl = $('#j-list', view); if (jl) jl.hidden = !!q && n === 0;
      var jf = $('#j-found', view); if (jf) jf.textContent = q ? ' ' + n + ' found' : '';
    };
    $$('.del', view).forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.armed) {
          var q = $('#j-search', view) ? $('#j-search', view).value : '';
          C.removeEntry(state(), b.dataset.id); save(); route([lastTab]);
          var js2 = $('#j-search', view);
          if (q && js2) { js2.value = q; js2.oninput(); }
          return;
        }
        b.dataset.armed = 1; b.textContent = 'Tap again to delete';
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000);
      };
    });
    var lbd = $('#j-lb-dismiss', view);
    if (lbd) lbd.onclick = function () {
      dismissLookBack(lbd.dataset.id);
      var box = $('#j-lookback', view); if (box) box.remove();
    };
    var ex = $('#j-export-text', view);
    if (ex) ex.onclick = function () {
      var dt = window.FC && window.FC.dayTitle ? window.FC.dayTitle : null;
      WL.saveFile('journal-' + C.isoDate(new Date()) + '.txt', C.journalText(state(), dt, new Date()));
    };
  }

  function card() {
    var S = state(), list = S.journal || [], last = list[0];
    var preview = last ? esc(String(last.text || '').slice(0, 90)) + (String(last.text || '').length > 90 ? '\u2026' : '') : '';
    return '<div class="meta ui">Journal</div>' +
      '<h3>' + (list.length ? list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') : 'Write anything on your mind') + '</h3>' +
      '<p class="meta ui">' + (last ? 'Latest: \u201c' + preview + '\u201d' : 'Life notes, parenting thoughts, awe moments, thanks \u2014 private on this phone.') + '</p>' +
      '<div class="row ui"><a class="btn primary" href="#journal">Write</a><a class="btn" href="#journal/gratitude">Thanks</a><a class="btn" href="#journal/awe">Awe</a></div>';
  }

  WL.register({
    id: 'journal', title: 'Journal', short: 'Journal', icon: '\u270E', nav: true,
    storageKeys: [], route: route, card: card
  });
})();
