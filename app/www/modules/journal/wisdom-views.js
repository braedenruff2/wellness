/* Wisdom toolkit views inside Journal (#journal/wisdom/zoom | decisions | principles).
   Pure HTML builders (loaded after wisdom-core.js and before journal.js in index.html). */
(function (root) {
  'use strict';
  function esc(t) { return root.WL.esc(t); }

  function shortDate(iso) {
    if (!iso || typeof iso !== 'string') return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function feedbackHtml(fb) {
    if (!fb) return '';
    var h = '<div class="w-fb" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">' +
      '<div class="meta"><b>Second look (blind-spot check)</b></div>';
    if (fb.blindSpots && fb.blindSpots.length) {
      h += '<ul class="me-g">' + fb.blindSpots.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
    }
    if (fb.otherSide) h += '<p class="meta" style="margin:.3em 0"><b>Other side:</b> ' + esc(fb.otherSide) + '</p>';
    if (fb.reframe) h += '<p class="meta" style="margin:.3em 0"><b>In a year:</b> ' + esc(fb.reframe) + '</p>';
    if (fb.nextStep) h += '<p class="gentle" style="margin:.3em 0 0"><b>Calm next step:</b> ' + esc(fb.nextStep) + '</p>';
    return h + '</div>';
  }

  function zoomHtml(W, ctx) {
    var ask = ctx.askable(), q = ctx.queued();
    var h = '<div class="card ui" id="w-zoom-form">' +
      '<h3 style="margin-top:0">2-minute Zoom Out</h3>' +
      '<p class="meta">Describe a sticky moment or tough call in <b>third person</b> (“He is dealing with…”). Research shows stepping back widens perspective in minutes. General reflection only — not therapy.</p>' +
      '<label for="w-z-sit">What’s happening? (try 3rd person)</label>' +
      '<textarea id="w-z-sit" placeholder="e.g. He is frustrated because the evening plan fell apart…"></textarea>' +
      '<label for="w-z-assume" style="display:block;margin-top:8px">What might I be assuming or missing?</label>' +
      '<input type="text" id="w-z-assume" placeholder="e.g. Assuming they did it on purpose, or forgetting how tired we both are">' +
      '<label for="w-z-other" style="display:block;margin-top:8px">Most charitable view of the other side (optional)</label>' +
      '<input type="text" id="w-z-other" placeholder="e.g. They are trying to help in the way they know how">' +
      '<label for="w-z-year" style="display:block;margin-top:8px">What will matter about this in a year? (optional)</label>' +
      '<input type="text" id="w-z-year" placeholder="e.g. Staying kind and steady, not winning this argument">' +
      '<label for="w-z-step" style="display:block;margin-top:8px">One calm next step (optional)</label>' +
      '<input type="text" id="w-z-step" placeholder="e.g. Pause, ask one curious question after dinner">' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="primary" type="button" id="w-z-save">Save</button>' +
      (ask ? '<button type="button" id="w-z-ai"' + (ctx.aiBusy ? ' disabled' : '') + '>' + (ctx.aiBusy ? 'Checking…' : 'Save &amp; check blind spots') + '</button>' : '') +
      '</div>' +
      (ctx.aiErr ? '<p class="no" id="w-z-err" style="margin-top:6px">' + esc(ctx.aiErr) + '</p>' : '') +
      (q.length && root.WL.pc && root.WL.pc.queuedText ? '<div class="meta" id="w-z-queued" style="margin-top:6px">' + esc(root.WL.pc.queuedText()) + ' ' + (root.WL.pc.cancelHtml ? root.WL.pc.cancelHtml(q[0].id) : '') + '</div>' : '') +
      '<div id="w-z-gentle"></div></div>';

    var list = W.zoomouts || [];
    if (list.length) {
      h += '<div class="card ui" id="w-z-list"><h3 style="margin-top:0">Past Zoom Outs (' + list.length + ')</h3><ul class="list">' +
        list.map(function (z) {
          var metaBits = [shortDate(z.date)];
          if (z.feedback) metaBits.push('blind-spot check ✓');
          return '<li class="entry" data-zid="' + esc(z.id) + '">' +
            '<span class="kind">Zoom Out</span> <span class="when">' + esc(metaBits.join(' · ')) + '</span>' +
            '<p>' + esc(z.situation) + '</p>' +
            (z.nextStep ? '<p class="meta" style="margin-top:4px"><b>Next step:</b> ' + esc(z.nextStep) + '</p>' : '') +
            '<details' + (ctx.openZoomId === z.id ? ' open' : '') + ' style="margin-top:4px"><summary class="meta">Details' + (z.feedback ? ' &amp; blind-spot check' : '') + '</summary>' +
            (z.assuming ? '<p class="meta"><b>Might be assuming/missing:</b> ' + esc(z.assuming) + '</p>' : '') +
            (z.otherSide ? '<p class="meta"><b>Other side:</b> ' + esc(z.otherSide) + '</p>' : '') +
            (z.yearView ? '<p class="meta"><b>In a year:</b> ' + esc(z.yearView) + '</p>' : '') +
            feedbackHtml(z.feedback) +
            '</details>' +
            '<div class="row" style="margin-top:4px">' +
            (ask && !z.feedback ? '<button class="link" type="button" data-z-ai="' + esc(z.id) + '"' + (ctx.aiBusy ? ' disabled' : '') + '>Check blind spots</button>' : '') +
            '<button class="link w-del" type="button" data-wdel="zoom|' + esc(z.id) + '" aria-label="Delete zoom out">Delete</button>' +
            '</div></li>';
        }).join('') + '</ul></div>';
    } else {
      h += '<p class="meta ui">No Zoom Outs yet — use this whenever you’re annoyed, stuck, or weighing a hard call.</p>';
    }
    return h;
  }

  function decisionsHtml(W, ctx) {
    var WC = root.WisdomCore;
    var due = WC.dueDecisions(W, ctx.realNow);
    var h = '';

    if (due.length) {
      h += '<div class="card ui" id="w-d-due" style="border-color:var(--accent)">' +
        '<h3 style="margin-top:0">Due for review (' + due.length + ')</h3>' +
        '<p class="meta">Comparing what you expected with what actually happened is one of the fastest ways to calibrate judgment.</p>';
      due.forEach(function (d) {
        h += '<div class="ck-slot" data-due-id="' + esc(d.id) + '">' +
          '<div class="meta">Decided ' + esc(shortDate(d.date)) + ' · revisit ' + esc(shortDate(d.reviewOn)) + '</div>' +
          '<h4 style="margin:.2em 0">' + esc(d.choice) + '</h4>' +
          (d.why ? '<p class="meta" style="margin:.2em 0"><b>Why:</b> ' + esc(d.why) + '</p>' : '') +
          (d.expect ? '<p class="meta" style="margin:.2em 0"><b>Expected:</b> ' + esc(d.expect) + '</p>' : '') +
          '<div class="meta" style="margin:8px 0 4px">How did it turn out?</div>' +
          '<div class="chips" data-rev-out="' + esc(d.id) + '">' + WC.OUTCOMES.map(function (o, i) {
            return '<button class="chip" type="button" data-dout="' + esc(d.id + '|' + o) + '" aria-pressed="' + (i === 0) + '">' + esc(o) + '</button>';
          }).join('') + '</div>' +
          '<label for="w-rev-act-' + esc(d.id) + '" style="display:block;margin-top:8px">What actually happened?</label>' +
          '<textarea id="w-rev-act-' + esc(d.id) + '" placeholder="What matched your expectation, and what surprised you?"></textarea>' +
          '<label for="w-rev-les-' + esc(d.id) + '" style="display:block;margin-top:8px">Lesson / principle to keep (optional)</label>' +
          '<input type="text" id="w-rev-les-' + esc(d.id) + '" placeholder="e.g. Check energy before saying yes to evening plans">' +
          '<label class="row" style="flex-wrap:nowrap;align-items:center;margin-top:8px">' +
          '<input type="checkbox" id="w-rev-prom-' + esc(d.id) + '" checked style="min-width:20px;min-height:20px">' +
          '<span class="meta">Also add this lesson to Personal Principles</span></label>' +
          '<div class="row" style="margin-top:8px">' +
          '<button class="primary" type="button" data-d-save-rev="' + esc(d.id) + '">Save review</button>' +
          '<button class="link" type="button" data-d-snooze="' + esc(d.id) + '">Wait 14 more days</button>' +
          '</div></div>';
      });
      h += '</div>';
    }

    var formBody = '<label for="w-d-choice">What are you choosing?</label>' +
      '<input type="text" id="w-d-choice" placeholder="e.g. Switch to 2 workouts/wk this month, or buy X">' +
      '<label for="w-d-why" style="display:block;margin-top:8px">Why this choice? (optional)</label>' +
      '<input type="text" id="w-d-why" placeholder="e.g. Sleep has been rough and consistency matters more">' +
      '<label for="w-d-expect" style="display:block;margin-top:8px">What do you expect to happen?</label>' +
      '<textarea id="w-d-expect" placeholder="e.g. I’ll miss fewer sessions and feel less guilt by next month."></textarea>' +
      '<div class="meta" style="margin:8px 0 4px">Revisit to check how it went:</div>' +
      '<div class="chips" id="w-d-days">' + WC.REVIEW_DAYS.map(function (n) {
        return '<button class="chip" type="button" data-ddays="' + n + '" aria-pressed="' + (n === 30) + '">' + n + ' days</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" type="button" id="w-d-save">Save decision</button></div>';

    if (due.length) {
      h += '<details class="card ui" id="w-d-add"><summary><b>Log a new decision</b></summary><div style="margin-top:8px">' + formBody + '</div></details>';
    } else {
      h += '<div class="card ui" id="w-d-add"><h3 style="margin-top:0">Decision log</h3>' +
        '<p class="meta">Jot a non-trivial choice and what you expect — it’ll surface here in 14, 30, or 90 days so you can see how your judgment calibrated.</p>' +
        formBody + '</div>';
    }

    var list = W.decisions || [];
    if (list.length) {
      h += '<div class="card ui" id="w-d-list"><h3 style="margin-top:0">Saved decisions (' + list.length + ')</h3><ul class="list">' +
        list.map(function (d) {
          var badge = d.review ? '✓ ' + d.review.outcome : 'Revisit ' + shortDate(d.reviewOn);
          return '<li class="entry" data-did="' + esc(d.id) + '">' +
            '<span class="kind">' + esc(badge) + '</span> <span class="when">' + esc(shortDate(d.date)) + '</span>' +
            '<p><b>' + esc(d.choice) + '</b></p>' +
            (d.expect ? '<p class="meta"><b>Expected:</b> ' + esc(d.expect) + '</p>' : '') +
            (d.review ? '<p class="meta"><b>Actual (' + esc(shortDate(d.review.date)) + '):</b> ' + esc(d.review.actual || d.review.outcome) +
              (d.review.lesson ? '<br><b>Lesson:</b> ' + esc(d.review.lesson) : '') + '</p>' : '') +
            '<div class="row" style="margin-top:4px">' +
            '<button class="link w-del" type="button" data-wdel="decision|' + esc(d.id) + '" aria-label="Delete decision">Delete</button></div></li>';
        }).join('') + '</ul></div>';
    } else {
      h += '<p class="meta ui">No decisions logged yet.</p>';
    }
    return h;
  }

  function principlesHtml(W, ctx) {
    var WC = root.WisdomCore;
    var list = W.principles || [];
    var usedTags = [];
    list.forEach(function (p) { if (p.tag && usedTags.indexOf(p.tag) < 0) usedTags.push(p.tag); });
    var activeTag = ctx.principleTag && usedTags.indexOf(ctx.principleTag) >= 0 ? ctx.principleTag : '';
    var shown = activeTag ? list.filter(function (p) { return p.tag === activeTag; }) : list;

    var h = '<div class="card ui" id="w-p-add">' +
      '<h3 style="margin-top:0">Weekly principle</h3>' +
      '<p class="meta">Once a week (e.g. Sunday), pick one real moment and write one short principle to carry forward. Over a year, this becomes your own handbook.</p>' +
      '<label for="w-p-text">One principle to carry forward</label>' +
      '<input type="text" id="w-p-text" placeholder="e.g. Don’t solve big topics when hungry or after 9 pm">' +
      '<label for="w-p-ctx" style="display:block;margin-top:8px">What happened / what I assumed (optional)</label>' +
      '<textarea id="w-p-ctx" placeholder="One or two lines about the moment that taught this."></textarea>' +
      '<div class="meta" style="margin:8px 0 4px">Area (optional)</div>' +
      '<div class="chips" id="w-p-tags">' + WC.TAGS.map(function (t) {
        return '<button class="chip" type="button" data-ptag="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" type="button" id="w-p-save">Save principle</button></div></div>';

    if (usedTags.length >= 2) {
      h += '<div class="chips ui" id="w-p-filter" role="group" aria-label="Filter principles by area" style="margin-bottom:10px">' +
        '<button class="chip" type="button" data-pfilter="" aria-pressed="' + (!activeTag) + '">All (' + list.length + ')</button>' +
        usedTags.map(function (t) {
          return '<button class="chip" type="button" data-pfilter="' + esc(t) + '" aria-pressed="' + (activeTag === t) + '">' + esc(t) + '</button>';
        }).join('') + '</div>';
    }
    if (shown.length > 5) {
      h += '<div class="ui" style="margin:8px 0"><label class="sr" for="w-p-search">Search principles</label>' +
        '<input type="search" id="w-p-search" placeholder="Search principles" autocomplete="off"><span class="meta" id="w-p-found"></span></div>';
    }
    if (shown.length) {
      h += '<ul class="list card ui" id="w-p-list">' + shown.map(function (p) {
        return '<li class="entry" data-pid="' + esc(p.id) + '">' +
          '<span class="kind">' + esc(p.tag || 'Principle') + '</span> <span class="when">' + esc(shortDate(p.date)) + '</span>' +
          '<p><b>' + esc(p.text) + '</b></p>' +
          (p.context ? '<p class="meta" style="margin-top:4px">' + esc(p.context) + '</p>' : '') +
          '<button class="link w-del" type="button" data-wdel="principle|' + esc(p.id) + '" aria-label="Delete principle">Delete</button></li>';
      }).join('') + '</ul>';
    } else {
      h += '<p class="meta ui">No principles saved yet.</p>';
    }
    return h;
  }

  function wisdomHtml(W, ctx) {
    var WC = root.WisdomCore;
    var dueCount = WC.dueDecisions(W, ctx.realNow).length;
    var mode = ctx.mode || 'zoom';
    var hasAny = (W.zoomouts && W.zoomouts.length) || (W.decisions && W.decisions.length) || (W.principles && W.principles.length);
    var h = '<div class="chips ui" id="w-modes" role="group" aria-label="Wisdom tools" style="margin-bottom:10px">' +
      '<button class="chip" type="button" data-wmode="zoom" aria-pressed="' + (mode === 'zoom') + '">Zoom Out</button>' +
      '<button class="chip" type="button" data-wmode="decisions" aria-pressed="' + (mode === 'decisions') + '">Decisions' + (dueCount ? ' (' + dueCount + ' due)' : '') + '</button>' +
      '<button class="chip" type="button" data-wmode="principles" aria-pressed="' + (mode === 'principles') + '">Principles' + (W.principles && W.principles.length ? ' (' + W.principles.length + ')' : '') + '</button>' +
      '</div>';
    h += mode === 'decisions' ? decisionsHtml(W, ctx)
      : mode === 'principles' ? principlesHtml(W, ctx)
      : zoomHtml(W, ctx);
    if (hasAny) {
      h += '<div class="row ui" style="margin-top:10px"><button type="button" id="w-export-text">Save wisdom as text</button></div>';
    }
    return h;
  }

  root.WisdomViews = { wisdomHtml: wisdomHtml };
})(typeof window !== 'undefined' ? window : this);
