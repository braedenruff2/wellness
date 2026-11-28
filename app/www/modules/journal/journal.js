/* General Journal module (#journal): life notes, awe moments, thanks, day reflections, and the Wisdom toolkit
   (#journal/wisdom: Zoom Out, Decision Log with 14/30/90-day revisits, and Personal Principles).
   Journal entries share fc.v1 via window.FC / FCCore (zero migration risk); Wisdom data lives in wl.wisdom.v1
   via WisdomCore (backed up, Drive-synced, and validated automatically). */
(function () {
  'use strict';
  var C = window.FCCore, WC = window.WisdomCore, WV = window.WisdomViews, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var wStore = WL.store('wl.wisdom.v1', WC ? WC.defaults : function () { return { zoomouts: [], decisions: [], principles: [] }; });
  var W = wStore.load();
  var view = null, lastTab = 'all', wisdomMode = '', principleTag = '', openZoomId = '';
  var aiBusy = false, aiErr = '', pendingZoomId = '';

  function logNow() { return WL.logNow ? WL.logNow() : new Date(); }
  function realNow() { return new Date(); }
  function state() { return window.FC ? window.FC.state() : C.defaults(); }
  function save() { if (window.FC && window.FC.save) window.FC.save(); }
  function saveW() { wStore.save(W); }

  function askable() { var pc = WL.pc; return !!(pc && (pc.canAsk ? pc.canAsk() : pc.ready())); }
  function queuedWisdom() {
    var pc = WL.pc;
    return pc && pc.queued ? pc.queued().filter(function (x) { return x.task === 'wisdom-check'; }) : [];
  }

  function heavyNote() {
    return '<p class="gentle">It sounds like things may be really hard right now. You don\u2019t have to carry that alone: please consider talking to someone you trust, a pastor, or your doctor. If you are in danger, call your local emergency number.</p>';
  }

  function askBlindSpots(z) {
    if (!z || aiBusy || !WL.pc) return;
    aiBusy = true; aiErr = ''; pendingZoomId = z.id;
    route(['wisdom', 'zoom']);
    var inp = {
      zoomId: z.id,
      situation: z.situation,
      assuming: z.assuming || '',
      otherSide: z.otherSide || '',
      yearView: z.yearView || '',
      nextStep: z.nextStep || ''
    };
    WL.pc.ask('wisdom-check', inp, null, { input: { zoomId: z.id } }).then(function (ans) { // meta: the cloud answer finds this one
      aiBusy = false;
      var saved = WC && WC.setZoomOutFeedback(W, z.id, ans);
      if (saved) { openZoomId = z.id; saveW(); WL.toast('Blind-spot check ready'); }
      else aiErr = 'Could not read that reflection reply. Try again.';
      if (view && /^#journal\/wisdom/.test(location.hash)) route(['wisdom', 'zoom']);
    }, function (e) {
      aiBusy = false;
      if (!e.queued) aiErr = (e && e.message) || 'Could not reach Claude.';
      if (view && /^#journal\/wisdom/.test(location.hash)) route(['wisdom', 'zoom']);
    });
  }

  if (WL.pc && WL.pc.onCloudAnswer) {
    WL.pc.onCloudAnswer('wisdom-check', function (e, ans, meta) {
      if (!e && WC) {
        // the Zoom Out it was asked for, never simply the newest one
        var targetId = meta ? (meta.input && meta.input.zoomId) || meta.zoomId || '' : pendingZoomId;
        var has = targetId && (W.zoomouts || []).some(function (z) { return z && z.id === targetId; });
        if (!has) aiErr = 'A blind-spot check arrived, but the Zoom Out it was for isn’t saved any more.';
        else if (WC.setZoomOutFeedback(W, targetId, ans)) {
          aiErr = ''; openZoomId = targetId; saveW(); WL.toast('Your blind-spot check arrived');
        } else {
          aiErr = 'That cloud reflection reply was incomplete. Try again.';
        }
      } else if (e) {
        aiErr = e;
      }
      if (view && /^#journal\/wisdom/.test(location.hash)) route(['wisdom', wisdomMode || 'zoom']);
    });
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

  function screen(tab, sub) {
    var S = state();
    tab = tab || 'all';
    if (['all', 'journal', 'awe', 'gratitude', 'wisdom'].indexOf(tab) < 0) tab = 'all';
    lastTab = tab;
    var dueN = WC ? WC.dueDecisions(W, realNow()).length : 0;
    var tabs = [
      ['all', 'All'], ['journal', 'Notes'], ['awe', 'Awe moments'], ['gratitude', 'Thanks'],
      ['wisdom', 'Wisdom' + (dueN ? ' (' + dueN + ')' : '')]
    ];
    var h = '<h1>Journal</h1><p class="meta ui">For anything on your mind \u2014 life, parenting, thoughts, awe moments, or faith reflections. Stays on this phone.</p>';
    h += '<div class="tabs2 ui" role="tablist">' + tabs.map(function (t) {
      return '<button role="tab" data-jtab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + esc(t[1]) + '</button>';
    }).join('') + '</div>';

    if (tab === 'wisdom' && WC && WV) {
      var mode = ['zoom', 'decisions', 'principles'].indexOf(sub) >= 0
        ? sub
        : (wisdomMode || (dueN ? 'decisions' : 'zoom'));
      wisdomMode = mode;
      h += WV.wisdomHtml(W, {
        mode: mode, realNow: realNow(), logNow: logNow(),
        askable: askable, queued: queuedWisdom, aiBusy: aiBusy, aiErr: aiErr,
        principleTag: principleTag, openZoomId: openZoomId
      });
      return h;
    }

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
    if (!view) return;
    var tab = (parts && parts[0]) || 'all';
    var sub = (parts && parts[1]) || '';
    if (tab !== 'wisdom') wisdomMode = '';
    view.innerHTML = screen(tab, sub);
    wire();
  }

  function wireWisdom() {
    $$('[data-wmode]', view).forEach(function (b) {
      b.onclick = function () {
        wisdomMode = b.dataset.wmode;
        location.hash = '#journal/wisdom/' + wisdomMode;
      };
    });

    // 1) Zoom Out
    function saveZoom(alsoAsk) {
      var sit = $('#w-z-sit', view);
      var rec = WC.addZoomOut(W, {
        situation: sit ? sit.value : '',
        assuming: ($('#w-z-assume', view) && $('#w-z-assume', view).value) || '',
        otherSide: ($('#w-z-other', view) && $('#w-z-other', view).value) || '',
        yearView: ($('#w-z-year', view) && $('#w-z-year', view).value) || '',
        nextStep: ($('#w-z-step', view) && $('#w-z-step', view).value) || ''
      }, logNow());
      if (!rec) { if (sit) sit.focus(); return; }
      saveW();
      var heavy = C.soundsHeavy(rec.situation + ' ' + rec.assuming);
      if (alsoAsk) {
        askBlindSpots(rec);
        if (heavy && $('#w-z-gentle', view)) $('#w-z-gentle', view).innerHTML = heavyNote();
        return;
      }
      route(['wisdom', 'zoom']);
      WL.toast('Zoom Out saved');
      if (heavy && $('#w-z-gentle', view)) $('#w-z-gentle', view).innerHTML = heavyNote();
    }
    var zs = $('#w-z-save', view); if (zs) zs.onclick = function () { saveZoom(false); };
    var zai = $('#w-z-ai', view); if (zai) zai.onclick = function () { saveZoom(true); };
    $$('[data-z-ai]', view).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.zAi;
        var z = (W.zoomouts || []).filter(function (x) { return x && x.id === id; })[0];
        if (z) askBlindSpots(z);
      };
    });

    // 2) Decisions
    var dDays = 30;
    $$('[data-ddays]', view).forEach(function (b) {
      b.onclick = function () {
        dDays = +b.dataset.ddays || 30;
        $$('[data-ddays]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      };
    });
    var ds = $('#w-d-save', view);
    if (ds) ds.onclick = function () {
      var ch = $('#w-d-choice', view);
      var rec = WC.addDecision(W, {
        choice: ch ? ch.value : '',
        why: ($('#w-d-why', view) && $('#w-d-why', view).value) || '',
        expect: ($('#w-d-expect', view) && $('#w-d-expect', view).value) || '',
        reviewDays: dDays
      }, logNow());
      if (!rec) { if (ch) ch.focus(); return; }
      saveW();
      route(['wisdom', 'decisions']);
      WL.toast('Decision saved — revisit ' + rec.reviewOn);
    };
    // Due decision reviews
    var revOut = {};
    $$('[data-dout]', view).forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.dout.split('|');
        revOut[p[0]] = p[1];
        $$('[data-rev-out="' + p[0] + '"] [data-dout]', view).forEach(function (x) {
          x.setAttribute('aria-pressed', x === b);
        });
      };
    });
    $$('[data-d-save-rev]', view).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.dSaveRev;
        var act = $('#w-rev-act-' + id, view), les = $('#w-rev-les-' + id, view), prom = $('#w-rev-prom-' + id, view);
        var out = revOut[id] || WC.OUTCOMES[0];
        var rev = WC.reviewDecision(W, id, {
          outcome: out,
          actual: act ? act.value : '',
          lesson: les ? les.value : ''
        }, logNow());
        if (!rev) return;
        var promoted = false;
        if (prom && prom.checked && rev.lesson) {
          var dec = (W.decisions || []).filter(function (x) { return x && x.id === id; })[0];
          WC.addPrinciple(W, {
            text: rev.lesson,
            context: dec ? 'From decision: ' + dec.choice + (rev.actual ? ' — ' + rev.actual : '') : '',
            fromDecisionId: id
          }, logNow());
          promoted = true;
        }
        saveW();
        route(['wisdom', 'decisions']);
        WL.toast(promoted ? 'Review saved & principle added' : 'Decision review saved');
      };
    });
    $$('[data-d-snooze]', view).forEach(function (b) {
      b.onclick = function () {
        var next = WC.snoozeDecision(W, b.dataset.dSnooze, 14, realNow());
        if (next) { saveW(); route(['wisdom', 'decisions']); WL.toast('Revisit moved to ' + next); }
      };
    });

    // 3) Principles
    var pTag = '';
    $$('[data-ptag]', view).forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.ptag;
        pTag = pTag === t ? '' : t;
        $$('[data-ptag]', view).forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.ptag === pTag); });
      };
    });
    var ps = $('#w-p-save', view);
    if (ps) ps.onclick = function () {
      var tx = $('#w-p-text', view);
      var rec = WC.addPrinciple(W, {
        text: tx ? tx.value : '',
        context: ($('#w-p-ctx', view) && $('#w-p-ctx', view).value) || '',
        tag: pTag
      }, logNow());
      if (!rec) { if (tx) tx.focus(); return; }
      saveW();
      route(['wisdom', 'principles']);
      WL.toast('Principle saved');
    };
    $$('[data-pfilter]', view).forEach(function (b) {
      b.onclick = function () {
        principleTag = b.dataset.pfilter || '';
        route(['wisdom', 'principles']);
        var btn = $('[data-pfilter="' + principleTag + '"]', view);
        if (btn && btn.focus) try { btn.focus(); } catch (e) {}
      };
    });
    var pSearch = $('#w-p-search', view);
    if (pSearch) pSearch.oninput = function () {
      var q = pSearch.value.trim().toLowerCase(), n = 0;
      $$('#w-p-list > li', view).forEach(function (li) {
        var hit = !q || li.textContent.toLowerCase().indexOf(q) >= 0;
        li.hidden = !hit; if (hit) n++;
      });
      var pl = $('#w-p-list', view); if (pl) pl.hidden = !!q && n === 0;
      var pf = $('#w-p-found', view); if (pf) pf.textContent = q ? ' ' + n + ' found' : '';
    };

    // Two-tap delete (4 s disarm) for Zoom Outs, Decisions, Principles
    $$('.w-del', view).forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.armed) {
          var p = b.dataset.wdel.split('|'), kind = p[0], id = p[1];
          var q = $('#w-p-search', view) ? $('#w-p-search', view).value : '';
          if (kind === 'zoom') WC.removeZoomOut(W, id);
          else if (kind === 'decision') WC.removeDecision(W, id);
          else if (kind === 'principle') WC.removePrinciple(W, id);
          saveW();
          route(['wisdom', wisdomMode]);
          var ps2 = $('#w-p-search', view);
          if (q && ps2) { ps2.value = q; ps2.oninput(); }
          return;
        }
        b.dataset.armed = 1; b.textContent = 'Tap again to delete';
        setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000);
      };
    });

    var wex = $('#w-export-text', view);
    if (wex) wex.onclick = function () {
      var txt = WC.exportText(W, realNow());
      if (txt) WL.saveFile('wisdom-' + WC.iso(realNow()) + '.txt', txt);
    };
  }

  function wire() {
    $$('[data-jtab]', view).forEach(function (b) {
      b.onclick = function () { location.hash = '#journal/' + b.dataset.jtab; };
    });
    if (lastTab === 'wisdom') { wireWisdom(); return; }
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
      var ta = $('#new-entry', view); if (ta && ta.focus) try { ta.focus(); } catch (e) {}
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
    var dueN = WC ? WC.dueDecisions(W, realNow()).length : 0;
    var sub = dueN
      ? dueN + ' decision' + (dueN === 1 ? '' : 's') + ' due for review in Wisdom.'
      : (last ? 'Latest: \u201c' + preview + '\u201d' : 'Life notes, parenting thoughts, awe moments, thanks \u2014 private on this phone.');
    return '<div class="meta ui">Journal</div>' +
      '<h3>' + (list.length ? list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') : 'Write anything on your mind') + '</h3>' +
      '<p class="meta ui">' + sub + '</p>' +
      '<div class="row ui"><a class="btn primary" href="#journal">Write</a><a class="btn" href="#journal/gratitude">Thanks</a><a class="btn" href="#journal/awe">Awe</a></div>';
  }

  WL.register({
    id: 'journal', title: 'Journal', short: 'Journal', icon: '\u270E', nav: true,
    storageKeys: [wStore.key],
    route: route,
    card: card,
    validate: function (k, raw) {
      if (k !== wStore.key || !WC) return null;
      try { var s = WC.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; }
    },
    reload: function () { W = wStore.load(); }
  });
})();
