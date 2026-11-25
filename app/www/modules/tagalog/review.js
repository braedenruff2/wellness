/* Tagalog spaced-review & hard-word practice screen (#tagalog/review, #tagalog/review/hard).
   Extracted from tagalog.js for code health; loaded before tagalog.js in index.html. */
(function (root) {
  'use strict';
  var reviewKey = null;

  function clearKey() {
    if (reviewKey) { document.removeEventListener('keydown', reviewKey); reviewKey = null; }
  }

  function html(ctx, hard) {
    var T = root.TagalogCore, S = ctx.state();
    if (hard) {
      var hw = T.weakWords(S, 10);
      if (!hw.length) return ctx.subnav('review') + '<h1>Practise hard words</h1><p class="ui">No hard words yet. <a class="link" href="#tagalog/words">Your words</a></p>';
      return ctx.subnav('review') + '<h1>Practise hard words</h1><p class="meta ui">' + hw.length + ' words you missed most. Extra practice: this doesn’t change when they come back for review.</p><div class="card flash" id="tl-card"></div>';
    }
    var due = T.dueCards(S);
    if (!due.length) return ctx.subnav('review') + '<h1>Review</h1><p class="ui">Nothing due right now. ' + (Object.keys(S.cards).length ? 'Come back tomorrow.' : 'Finish a lesson and its words will show up here.') + '</p>';
    return ctx.subnav('review') + '<h1>Review</h1><p class="meta ui">' + due.length + ' due. Say the meaning out loud, then check.</p><div class="card flash" id="tl-card"></div>';
  }

  function run(ctx, hard) {
    var T = root.TagalogCore, WL = root.WL, esc = WL.esc, $ = WL.$, S = ctx.state();
    // hard: the words he missed most (Your words > Practise these), shown like a review but not rescheduled
    var due = hard ? T.weakWords(S, 10) : T.dueCards(S), i = 0, el = $('#tl-card'), missed = []; if (!el) return;
    clearKey();
    reviewKey = function (ev) {
      if (!el.isConnected) { clearKey(); return; }
      if (ev.metaKey || ev.ctrlKey || ev.altKey || $('#me-sheet')) return;
      var tag = ev.target && ev.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        var sh = $('#tl-show', el);
        if (!sh || ((tag === 'BUTTON' || tag === 'A') && ev.target !== sh)) return;
        ev.preventDefault(); sh.click();
      } else if (ev.key === '1') {
        var no = $('#tl-no', el);
        if (no) { ev.preventDefault(); no.click(); }
      } else if (ev.key === '2') {
        var yes = $('#tl-yes', el);
        if (yes) { ev.preventDefault(); yes.click(); }
      }
    };
    document.addEventListener('keydown', reviewKey);
    function show() {
      if (i >= due.length) {
        clearKey();
        // the words he said "Not yet" to, once more with their sound (they come back tomorrow anyway)
        var miss = missed.filter(function (k, j) { return missed.indexOf(k) === j && S.cards[k]; });
        el.innerHTML = (hard ? '<p class="ui"><b>Done.</b> ' + (due.length - missed.length) + ' of ' + due.length + ' got. They come back in reviews as usual.</p>' : '<p class="ui"><b>All done.</b> See you tomorrow.</p>') +
          (!hard && miss.length >= 3 ? '<p class="ui" id="tl-hard-link"><a class="link" href="#tagalog/review/hard">Practise your hard words now</a></p>' : '') + (miss.length ? '<div id="tl-missed"><p class="meta ui">' + (hard ? 'Once more before you go:' : 'Once more before you go (they’re back tomorrow):') + '</p><ul class="list">' +
          miss.map(function (k) { return '<li class="row"><span class="grow"><b lang="tl">' + esc(k) + '</b><br><span class="meta">' + esc(S.cards[k].en) + '</span></span>' + ctx.hear(k) + '</li>'; }).join('') + '</ul></div>' : '') + (root.WLMe && due.length && !hard ? root.WLMe.askHtml('tagalog', 'review@' + new Date().toISOString().slice(0, 16), 'Quick question (optional): it shapes next week’s lessons', true) : '') + '<a class="btn" href="#tagalog">Back</a>';
        ctx.wireHear(el);
        return;
      }
      var k = due[i], c = S.cards[k], sayIt = T.direction(c) === 'say';
      // a word he has missed twice or more comes back with a sentence from the lessons that uses it
      var exm = (c.wrong || 0) >= 2 && T.exampleFor ? T.exampleFor(ctx.packs(), k) : null;
      var exHtml = exm ? '<p class="meta" id="tl-example"><span lang="tl">' + esc(exm.tl) + '</span> ' + ctx.hear(exm.tl) + '<br>' + esc(exm.en) + '</p>' : '';
      el.innerHTML = '<div class="meta ui">' + (i + 1) + ' / ' + due.length + (sayIt ? ' · say it in Tagalog' : '') + '</div>' +
        (sayIt ? '<p class="big">' + esc(c.en) + '</p><div id="tl-ans" hidden><p class="big" lang="tl">' + esc(k) + ' ' + ctx.hear(k) + '</p>' + exHtml + '</div>'
          : '<p class="big" lang="tl">' + esc(k) + ' ' + ctx.hear(k) + '</p><div id="tl-ans" hidden><p>' + esc(c.en) + '</p>' + exHtml + '</div>') +
        '<div class="row ui" id="tl-btns"><button class="primary" id="tl-show">' + (sayIt ? 'Show the Tagalog' : 'Show meaning') + '</button></div>';
      ctx.wireHear(el);
      $('#tl-show').onclick = function () {
        $('#tl-ans').hidden = false;
        if (sayIt) ctx.say(k); // hear it right after saying it yourself
        $('#tl-btns').innerHTML = '<button id="tl-no">Not yet</button><button class="primary" id="tl-yes">Got it</button>';
        // a double-tap on Show would land on "Not yet" (now where Show was): ignore taps for a moment
        var shownAt = Date.now(), late = function () { return Date.now() - shownAt >= 400; };
        $('#tl-no').onclick = function () { if (!late()) return; if (!hard) { T.review(S, k, false, ctx.logNow()); ctx.save(); } missed.push(k); i++; show(); };
        $('#tl-yes').onclick = function () { if (!late()) return; if (!hard) { T.review(S, k, true, ctx.logNow()); ctx.save(); } i++; show(); };
      };
    }
    show();
  }

  root.TagalogReview = { html: html, run: run, clearKey: clearKey };
})(typeof window !== 'undefined' ? window : this);
