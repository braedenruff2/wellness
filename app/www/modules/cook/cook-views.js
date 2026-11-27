/* Cooking tab & card HTML views (#cook, #cook/week, #cook/log, #cook/pantry, and Home card).
   Extracted from cook.js for code health (loaded after cook-core.js and before cook.js in index.html). */
(function (root) {
  'use strict';

  function esc(t) { return root.WL.esc(t); }

  function subnav(tab) {
    return '<div class="subnav ui">' + [['', 'Today'], ['week', 'Week'], ['log', 'Food log'], ['pantry', 'Fridge & list']].map(function (t) {
      return '<a href="#cook' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }

  function dayHeading(iso, realNow) {
    var K = root.CookCore;
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var tIso = K.iso(realNow);
    var prefix = iso === tIso ? 'Today · ' : '';
    return prefix + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function expiryBadge(daysLeft) {
    if (daysLeft == null) return '<span class="ck-urg">Keeps</span>';
    if (daysLeft < 0) return '<span class="ck-urg ck-soon">Check / expired</span>';
    if (daysLeft === 0) return '<span class="ck-urg ck-soon">Use today</span>';
    if (daysLeft <= 2) return '<span class="ck-urg ck-soon">' + daysLeft + ' d left</span>';
    if (daysLeft <= 5) return '<span class="ck-urg">' + daysLeft + ' d left</span>';
    return '<span class="ck-urg ck-ok">' + daysLeft + ' d</span>';
  }

  function recipeDetailsHtml(r, ctx) {
    if (!r) return '';
    var ing = (r.ingredients || []).map(function (x) {
      return (x.qty ? x.qty + (x.unit ? ' ' + x.unit : '') + ' ' : '') + x.name;
    });
    return '<details class="ui" style="margin-top:6px"><summary class="meta">How to make it (' + r.mins + ' min' + (r.protein ? ' · ' + esc(r.protein) : '') + ')</summary>' +
      (ing.length ? '<p class="meta" style="margin:.2em 0 .5em"><b>Ingredients:</b> ' + esc(ing.join(', ')) + '.</p>' : '') +
      '<ol style="margin:0 0 .6em;padding-left:1.3em">' + (r.steps || []).map(function (s) { return '<li style="margin:.3em 0">' + esc(ctx.pers(s)) + '</li>'; }).join('') + '</ol>' +
      (r.babyNote ? '<p class="gentle" style="margin:.4em 0"><b>For ' + esc(ctx.childLabel()) + ':</b> ' + esc(ctx.pers(r.babyNote)) + '</p>' : '') +
      (r.tip ? '<p class="meta" style="margin:.3em 0 0"><b>Beginner tip:</b> ' + esc(ctx.pers(r.tip)) + '</p>' : '') +
      // a Filipino dish: its words in Tagalog, to hear (the Tagalog voice, like the lessons)
      (Array.isArray(r.words) && r.words.length ? '<div class="ck-tl" style="margin-top:.5em"><p class="meta" style="margin:0 0 .2em"><b>In Tagalog:</b></p><ul class="list">' +
        r.words.map(function (w) { return '<li class="row"><span class="grow"><b lang="tl">' + esc(w.tl) + '</b> <span class="meta">' + esc(w.en) + '</span></span><button class="link small hear" type="button" data-tl-say="' + esc(w.tl) + '" aria-label="Hear ' + esc(w.tl) + '">🔊</button></li>'; }).join('') + '</ul></div>' : '') +
      '</details>';
  }

  /* ---- Tab 1: Today (#cook) ---- */
  function todayHtml(S, ctx) {
    var K = root.CookCore, d = ctx.realNow, tIso = K.iso(d);
    var soon = K.expiringSoon(S, d, 3);
    var matches = soon.length ? K.matchExpiring(S, d, 3) : [];
    var wk = ctx.wk;
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};

    var h = subnav('') + '<h1>Cooking</h1>';
    if (wk && (wk.trainedToday || wk.plannedToday)) {
      h += '<p class="meta ui" id="ck-move-note">' + (wk.trainedToday
        ? 'Move workout logged today: aim for a solid protein portion and carbs at your next meal for recovery (general guidance).'
        : 'Move workout on the schedule today (' + wk.thisWeek + ' of ' + wk.target + ' this week): high-protein meals are highlighted below.') + '</p>';
    } else {
      h += '<p class="meta ui">Simple beginner meals for you and ' + esc(ctx.childLabel()) + '. If Mama cooks, tap “Mama cooked” and the shopping list adjusts.</p>';
    }
    if (soon.length) {
      h += '<div class="card ui" id="ck-soon" style="border-color:var(--warn)"><h3>Use soon</h3>' +
        '<p class="meta" style="margin-bottom:6px">' + soon.map(function (x) {
          return esc(x.item.name) + ' (' + (x.daysLeft <= 0 ? 'today' : x.daysLeft + ' d') + ')';
        }).join(' · ') + '</p>' +
        (matches.length ? '<div class="chips">' + matches.map(function (m) {
          return '<button class="chip" type="button" data-use-recipe="' + esc(m.recipe.id) + '" data-use-meal="' + esc(m.recipe.meal) + '">Plan for ' + esc(K.MEAL_LABEL[m.recipe.meal].toLowerCase()) + ': ' + esc(m.recipe.title) + '</button>';
        }).join('') + '</div>' : '<a class="link" href="#cook/pantry">Open fridge list</a>') + '</div>';
    }
    if (S.plan && S.plan.note) {
      h += '<div class="card ui" id="ck-plan-note"><div class="meta">This week’s note</div><p style="margin:.2em 0 0">' + esc(S.plan.note) + '</p></div>';
    }

    K.MEALS.forEach(function (meal) {
      var slot = day[meal] || { recipeId: null, title: '', status: 'planned', note: '' };
      var r = K.recipeById(S, slot.recipeId);
      var statusBadge = slot.status === 'made' ? ' <span class="tick">✓ Made</span>'
        : slot.status === 'mama' ? ' <span class="meta">· Mama cooked</span>' : '';
      h += '<div class="card" data-ck-meal="' + meal + '">' +
        '<div class="meta ui">' + esc(K.MEAL_LABEL[meal]) + statusBadge + '</div>' +
        '<h3 style="margin:.2em 0">' + esc(slot.status === 'mama' ? (slot.note || 'Mama’s cooking') : (slot.title || 'Open slot')) + '</h3>' +
        (slot.status !== 'mama' ? recipeDetailsHtml(r, ctx) : (slot.title ? '<p class="meta ui">Original plan (' + esc(slot.title) + ') moved off the shopping list.</p>' : '') +
          // what she made (optional), right on the card: no system dialog
          '<form class="row ui ck-mama-form" data-ck-mama-form="' + meal + '" style="margin-top:6px"><label class="sr" for="ck-mama-' + meal + '">What did Mama cook? (optional)</label>' +
          '<input type="text" class="grow" id="ck-mama-' + meal + '" maxlength="200" placeholder="What did Mama cook? (optional)" value="' + esc(slot.note || '') + '" autocomplete="off">' +
          '<button type="submit">Save</button></form>') +
        '<div class="row ui" style="margin-top:8px">' +
        (slot.status !== 'made' && slot.status !== 'mama' ? '<button class="primary" type="button" data-ck-made="' + meal + '">Made it ✓</button>' : '') +
        (slot.status !== 'mama' ? '<button type="button" data-ck-mama="' + meal + '">Mama cooked</button>' : '<button type="button" data-ck-reset="' + meal + '">Back to plan</button>') +
        (slot.status === 'planned' ? '<button class="link" type="button" data-ck-swap="' + meal + '">Swap</button>' : '') +
        '</div></div>';
    });

    h += '<div class="row ui" style="margin-top:4px"><a class="btn primary" href="#cook/log">Log what we ate</a><a class="btn" href="#cook/pantry">Fridge &amp; shopping list</a></div>';
    h += '<p class="meta ui" style="margin-top:10px">General everyday cooking and fitness guidance only — not medical or paediatric nutrition advice.</p>';
    return h;
  }

  /* ---- Tab 2: Week (#cook/week) ---- */
  function weekHtml(S, ctx) {
    var K = root.CookCore, WL = root.WL, d = ctx.realNow, days = K.weekDays(d);
    var q = ctx.queuedFor('cook-plan');
    var h = subnav('week') + '<h1>This week’s meals</h1>';
    h += '<div class="card ui"><p class="meta">Your 7-day plan prioritizes foods expiring soon and protein on Move workout days. Tap “Mama cooked” on any meal she handles — its ingredients drop off your shopping list automatically.</p>' +
      '<div class="row" style="margin-top:8px"><button id="ck-regen" type="button">Refresh offline plan</button>' +
      (ctx.askable() ? '<button class="primary" id="ck-ai-plan" type="button"' + (ctx.planBusy ? ' disabled' : '') + '>' + (ctx.planBusy ? 'Asking Claude…' : 'Ask Claude for this week’s plan') + '</button>' : '') + '</div>' +
      (ctx.planErr ? '<p class="no" style="margin-top:6px">' + esc(ctx.planErr) + '</p>' : '') +
      (q.length && WL.pc && WL.pc.queuedText ? '<div class="meta" id="ck-plan-queued" style="margin-top:6px">' + esc(WL.pc.queuedText()) + ' ' + (WL.pc.cancelHtml ? WL.pc.cancelHtml(q[0].id) : '') + '</div>' : '') +
      '</div>';

    days.forEach(function (iso) {
      var slot = (S.plan && S.plan.days && S.plan.days[iso]) || {};
      h += '<div class="card ui"><h3 style="margin-bottom:6px">' + esc(dayHeading(iso, d)) + '</h3>';
      K.MEALS.forEach(function (meal) {
        var m = slot[meal] || { title: '', status: 'planned', note: '' };
        var r = m.status !== 'mama' ? K.recipeById(S, m.recipeId) : null;
        h += '<div class="ck-slot" data-wk-slot="' + iso + '|' + meal + '"><div class="row"><div class="grow"><span class="meta">' + esc(K.MEAL_LABEL[meal]) + '</span><br><b>' +
          esc(m.status === 'mama' ? ('Mama cooked' + (m.note ? ': ' + m.note : '')) : (m.title || '—')) + '</b>' +
          (m.status === 'made' ? ' <span class="tick">✓</span>' : '') + '</div>' +
          '<button class="link" type="button" data-wk-swap="' + iso + '|' + meal + '">Swap</button>' +
          '<button class="link" type="button" data-wk-mama="' + iso + '|' + meal + '">' + (m.status === 'mama' ? 'Undo Mama' : 'Mama') + '</button></div>' +
          recipeDetailsHtml(r, ctx) + '</div>';
      });
      h += '</div>';
    });
    return h;
  }

  /* ---- Tab 3: Food log (#cook/log) ---- */
  function logHtml(S, ctx) {
    var K = root.CookCore, d = ctx.logNow, tIso = K.iso(d);
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
    var dinnerTitle = (day.dinner && day.dinner.title) || '';
    var cName = ctx.childLabel();
    var cSum = K.childSummary(S, d);

    var h = subnav('log') + '<h1>Food log</h1>';

    // Child food log: Offered vs Actually ate (1 line + 1 tap)
    h += '<div class="card ui" id="ck-log-child"><h3>What ' + esc(cName) + ' ate</h3>' +
      '<p class="meta">Keeping “offered” and “actually ate” separate takes one tap and tracks food exposure even on picky days.</p>' +
      '<div class="chips" id="ck-c-meal" style="margin:6px 0">' + K.ALL_MEALS.map(function (m) {
        return '<button class="chip" type="button" data-cmeal="' + m + '" aria-pressed="' + (m === 'lunch') + '">' + esc(K.MEAL_LABEL[m]) + '</button>';
      }).join('') + '</div>' +
      '<label for="ck-c-offered">What was offered</label>' +
      '<input type="text" id="ck-c-offered" placeholder="e.g. oatmeal, mashed banana, soft egg">' +
      (dinnerTitle ? '<div class="row" style="margin:4px 0 6px"><button class="link" type="button" id="ck-c-same">Fill from today’s dinner (soft/unsalted)</button></div>' : '') +
      '<div class="meta" style="margin:8px 0 4px">How much did she actually eat?</div>' +
      '<div class="chips" id="ck-c-ate">' + K.CHILD_ATE.map(function (v) {
        return '<button class="chip" type="button" data-cate="' + esc(v) + '" aria-pressed="' + (v === 'About half') + '">' + esc(v) + '</button>';
      }).join('') + '</div>' +
      '<label for="ck-c-note" style="display:block;margin-top:8px">Note (optional)</label>' +
      '<input type="text" id="ck-c-note" placeholder="e.g. loved the banana, new texture">' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="ck-c-save" type="button">Save ' + esc(cName) + '’s meal</button></div>' +
      (cSum.liked.length ? '<p class="meta" id="ck-c-liked" style="margin:10px 0 0"><b>Ate well lately:</b> ' + esc(cSum.liked.join(' · ')) + '</p>' : '') +
      '</div>';

    // Adult food log: simple single field + rough portion + optional tags
    h += '<div class="card ui" id="ck-log-me"><h3>What I ate</h3>' +
      '<div class="chips" id="ck-m-meal" style="margin:6px 0">' + K.ALL_MEALS.map(function (m) {
        return '<button class="chip" type="button" data-mmeal="' + m + '" aria-pressed="' + (m === 'dinner') + '">' + esc(K.MEAL_LABEL[m]) + '</button>';
      }).join('') + '</div>' +
      '<label for="ck-m-text">Meal or snack</label>' +
      '<input type="text" id="ck-m-text" placeholder="e.g. chicken & broccoli rice, or Mama’s sinigang">' +
      '<div class="row" style="margin:4px 0 6px">' +
      (dinnerTitle ? '<button class="link" type="button" id="ck-m-same">Use today’s dinner</button>' : '') +
      '<button class="link" type="button" id="ck-m-mama-fill">Mama’s cooking</button></div>' +
      '<div class="meta" style="margin:6px 0 4px">Rough portion</div>' +
      '<div class="chips" id="ck-m-portion">' + K.PORTIONS.map(function (p) {
        return '<button class="chip" type="button" data-mport="' + esc(p) + '" aria-pressed="' + (p === 'Regular') + '">' + esc(p) + '</button>';
      }).join('') + '</div>' +
      '<div class="meta" style="margin:8px 0 4px">Quick tags (optional)</div>' +
      '<div class="chips" id="ck-m-tags">' + K.ME_TAGS.map(function (tg) {
        return '<button class="chip" type="button" data-mtag="' + esc(tg) + '" aria-pressed="false">' + esc(tg) + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="ck-m-save" type="button">Save my meal</button></div></div>';

    // Recent logs list
    var recent = (S.logs || []).slice(0, 20);
    h += '<div class="card ui" id="ck-log-list"><h3>Recent meals</h3>' + (recent.length ? '<ul class="list">' + recent.map(function (x) {
      var who = x.who === 'child' ? cName : 'Me';
      var body = x.who === 'child'
        ? 'Offered: ' + esc(x.offered) + ' · <b>' + esc(x.ate) + '</b>' + (x.note ? ' (' + esc(x.note) + ')' : '')
        : esc(x.text) + ' · ' + esc(x.portion) + (x.tags && x.tags.length ? ' (' + esc(x.tags.join(', ')) + ')' : '');
      return '<li class="entry"><span class="kind">' + esc(who + ' · ' + (K.MEAL_LABEL[x.meal] || x.meal)) + '</span> <span class="when">' + esc(x.date) + '</span>' +
        '<p>' + body + '</p><button class="link ck-log-del" type="button" data-id="' + esc(x.id) + '" aria-label="Delete meal log">Delete</button></li>';
    }).join('') + '</ul>' : '<p class="meta">Nothing logged yet.</p>') + '</div>';
    return h;
  }

  /* ---- Tab 4: Fridge, Pantry & Shopping List (#cook/pantry) ---- */
  function pantryHtml(S, ctx) {
    var K = root.CookCore, WL = root.WL, d = ctx.realNow;
    var list = K.shoppingList(S, d), items = K.sortedPantry(S, d);
    var pq = ctx.queuedFor('cook-photo');

    var h = subnav('pantry') + '<h1>Fridge &amp; shopping list</h1>';

    // Shopping list card
    h += '<div class="card ui" id="ck-shop"><h3>Needed for this week’s plan</h3>' +
      '<p class="meta">Auto-calculated from remaining planned meals minus what’s plenty in your fridge. Tapping “Bought” adds it straight to your fridge with a default shelf life.</p>';
    if (list.length) {
      h += '<ul class="list">' + list.map(function (x, i) {
        var qtyTxt = x.qty > 0 ? x.qty + (x.unit ? ' ' + x.unit : '') + ' ' : '';
        return '<li class="row' + (x.bought ? ' is-done' : '') + '">' +
          '<button class="tick-box" type="button" data-buy="' + i + '" aria-label="' + esc((x.bought ? 'Unmark ' : 'Mark bought: ') + x.name) + '">' + (x.bought ? '✓' : '') + '</button>' +
          '<div class="grow"><span class="task-text"><b>' + esc(qtyTxt + x.name) + '</b></span>' +
          '<div class="meta">' + esc(K.CAT_LABEL[x.cat] || x.cat) + (x.haveStatus === 'low' ? ' · running low' : '') + ' · for ' + esc(x.meals.slice(0, 2).join(', ')) + '</div></div></li>';
      }).join('') + '</ul>';
    } else {
      h += '<p class="meta">You already have everything for this week’s planned meals (or all slots are marked done / Mama cooked).</p>';
    }
    h += '</div>';

    // Photo pantry check card (PC link or cloud queue)
    h += '<div class="card ui" id="ck-photo-card"><h3>Check what’s left with a photo</h3>' +
      '<p class="meta">Snap a photo of your fridge shelf or an ingredient and let Claude / Gemini estimate what’s there and how much is left.</p>' +
      '<label class="sr" for="ck-photo-note">Photo note (optional)</label>' +
      '<input type="text" id="ck-photo-note" placeholder="Optional note, e.g. fridge shelf or how much milk is left">' +
      '<div class="row" style="margin-top:8px"><label class="btn primary" for="ck-photo-in" id="ck-photo-lbl">' + (ctx.photoBusy ? 'Checking photo…' : '📷 Take or pick a photo') + '</label>' +
      '<input type="file" id="ck-photo-in" accept="image/*" capture="environment" class="sr"></div>' +
      (ctx.photoErr ? '<p class="no" style="margin-top:6px">' + esc(ctx.photoErr) + '</p>' : '') +
      (pq.length && WL.pc && WL.pc.queuedText ? '<div class="meta" id="ck-photo-queued" style="margin-top:6px">' + esc(WL.pc.queuedText()) + ' ' + (WL.pc.cancelHtml ? WL.pc.cancelHtml(pq[0].id) : '') + '</div>' : '');
    if (S.lastPhoto && Array.isArray(S.lastPhoto.items) && S.lastPhoto.items.length) {
      h += '<div id="ck-photo-res" style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">' +
        '<p style="margin-bottom:4px"><b>Detected from photo:</b> ' + esc(S.lastPhoto.summary || '') + '</p><ul class="me-g">' +
        S.lastPhoto.items.map(function (it) {
          if (!it || typeof it.name !== 'string') return '';
          return '<li><b>' + esc(it.name) + '</b> — ' + esc(String(it.amount || it.status || 'spotted')) + (isFinite(+it.expiresInDays) && it.expiresInDays != null ? ' (~' + Math.round(+it.expiresInDays) + ' d)' : '') + '</li>';
        }).join('') + '</ul>' +
        '<div class="row" style="margin-top:8px"><button class="primary" id="ck-photo-apply" type="button">Update fridge with these</button><button class="link" id="ck-photo-clear" type="button">Dismiss</button></div></div>';
    }
    h += '</div>';

    // Add item form
    h += '<div class="card ui" id="ck-pantry-add"><h3>Add to fridge / pantry</h3>' +
      '<label for="ck-p-name">Item</label><input type="text" id="ck-p-name" placeholder="e.g. chicken thighs, spinach, milk">' +
      '<div class="row" style="margin-top:8px">' +
      '<input type="number" id="ck-p-qty" class="ck-custom-min" min="0" step="any" placeholder="Qty" aria-label="Quantity">' +
      '<input type="text" id="ck-p-unit" style="width:6.5em" placeholder="unit (g/cups)" aria-label="Unit">' +
      '<select id="ck-p-cat" style="width:auto;flex:1" aria-label="Category">' + K.CATS.map(function (c) { return '<option value="' + c + '">' + esc(K.CAT_LABEL[c]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="meta" style="margin:8px 0 4px">How fast does it spoil?</div>' +
      '<div class="chips" id="ck-p-exp">' + [['2', '1–2 days'], ['4', '3–4 days'], ['7', '1 week'], ['14', '2 weeks'], ['', 'Keeps']].map(function (e, idx) {
        return '<button class="chip" type="button" data-pexp="' + e[0] + '" aria-pressed="' + (idx === 1) + '">' + esc(e[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="primary" id="ck-p-save" type="button">Add item</button></div></div>';

    // Inventory list (soonest expiring first, with category filter chips once 10+ items exist)
    var showCats = items.length >= 10;
    var activeCat = showCats && ctx.pantryCat && K.CATS.indexOf(ctx.pantryCat) >= 0 ? ctx.pantryCat : 'all';
    var visible = activeCat === 'all' ? items : items.filter(function (x) { return x.cat === activeCat; });
    h += '<div class="card ui" id="ck-pantry-list"><h3>In your fridge &amp; pantry (' + (activeCat === 'all' ? items.length : visible.length + ' of ' + items.length) + ')</h3>';
    if (showCats) {
      h += '<div class="chips" id="ck-pantry-cats" style="margin:6px 0 8px">' +
        '<button class="chip" type="button" data-pcat="all" aria-pressed="' + (activeCat === 'all') + '">All</button>' +
        K.CATS.map(function (c) {
          return '<button class="chip" type="button" data-pcat="' + c + '" aria-pressed="' + (activeCat === c) + '">' + esc(K.CAT_LABEL[c]) + '</button>';
        }).join('') + '</div>';
    }
    if (visible.length) {
      h += '<ul class="list">' + visible.map(function (x) {
        var dl = K.daysUntilExpiry(x, d);
        var qtyTxt = x.qty != null ? ' · ' + x.qty + (x.unit ? ' ' + x.unit : '') : '';
        return '<li data-pcat-item="' + esc(x.cat || '') + '"><div class="row"><div class="grow"><b>' + esc(x.name) + '</b>' + esc(qtyTxt) + ' ' + expiryBadge(dl) +
          '<div class="meta">' + esc(K.CAT_LABEL[x.cat] || x.cat) + ' · ' + esc(x.status) + '</div></div></div>' +
          '<div class="chips" style="margin-top:6px">' + K.STATUS.map(function (st) {
            return '<button class="chip" type="button" data-pst="' + esc(x.id) + '|' + st + '" aria-pressed="' + (x.status === st) + '">' + (st === 'plenty' ? 'Plenty' : st === 'low' ? 'Low' : 'Out') + '</button>';
          }).join('') + '<button class="link" type="button" data-pdel="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">Remove</button></div></li>';
      }).join('') + '</ul>';
    } else if (items.length) {
      h += '<p class="meta" id="ck-pantry-empty">No items in ' + esc(K.CAT_LABEL[activeCat] || activeCat) + '.</p>';
    } else {
      h += '<p class="meta">Nothing added yet. Add perishables here (or tick items bought above) and the app will nudge you to use them before they spoil.</p>';
    }
    h += '</div>';
    return h;
  }

  /* ---- Home card ---- */
  function cardHtml(S, ctx) {
    var K = root.CookCore, d = ctx.realNow, tIso = K.iso(d);
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
    var hr = d.getHours();
    var pickMeal = hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : 'dinner';
    var slot = day[pickMeal] || day.dinner || {};
    var soon = K.expiringSoon(S, d, 2);
    return '<div class="meta ui">Cooking · ' + esc(K.MEAL_LABEL[pickMeal] || 'Today') + '</div>' +
      '<h3>' + esc(slot.status === 'mama' ? 'Mama cooked' + (slot.note ? ': ' + slot.note : '') : (slot.title || 'Plan today’s meals')) + '</h3>' +
      (soon.length ? '<p class="meta ui" style="color:var(--warn)">Use soon: ' + esc(soon.slice(0, 3).map(function (x) { return x.item.name + ' (' + (x.daysLeft <= 0 ? 'today' : x.daysLeft + ' d') + ')'; }).join(', ')) + '</p>'
        : '<p class="meta ui">Beginner recipes, flexible when Mama cooks, food logs for you &amp; ' + esc(ctx.childLabel()) + '.</p>') +
      '<div class="row ui"><a class="btn primary" href="#cook">Today’s meals</a><a class="btn" href="#cook/log">Log food</a><a class="btn" href="#cook/pantry">Fridge &amp; list</a></div>';
  }

  root.CookViews = {
    subnav: subnav, dayHeading: dayHeading, expiryBadge: expiryBadge, recipeDetailsHtml: recipeDetailsHtml,
    todayHtml: todayHtml, weekHtml: weekHtml, logHtml: logHtml, pantryHtml: pantryHtml, cardHtml: cardHtml
  };
})(typeof window !== 'undefined' ? window : this);
