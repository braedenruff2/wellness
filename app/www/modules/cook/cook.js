/* Cooking & family nutrition module (#cook, #cook/week, #cook/log, #cook/pantry).
   Offline-first beginner meal plan & recipes, flexible "Mama cooked" handling, Move workout-day fuel notes,
   Me + {child} (Offered vs. Actually ate) food logs, spoilage-first fridge/pantry + auto shopping list,
   and optional AI weekly plan (cook-plan) + fridge photo estimation (cook-photo) via PC link or cloud queue. */
(function () {
  'use strict';
  var K = window.CookCore, esc = WL.esc, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.cook.v1', K.defaults);
  var S = store.load(), view = null, curTab = '';
  var planBusy = false, photoBusy = false, photoErr = '', planErr = '';

  function save() { store.save(S); }
  function now() { return WL.logNow ? WL.logNow() : new Date(); }
  function childName() { return (window.WLPersonal && WLPersonal.childName ? WLPersonal.childName() : '') || ''; }
  function childLabel() { return childName() || 'your daughter'; }
  function pers(text) {
    return window.WLPersonal && WLPersonal.fill ? WLPersonal.fill(text, childName(), 'your daughter') : String(text || '');
  }

  /* Read Move workout state (if any) to adapt today's protein/recovery note and AI meal plan. */
  function workoutInfo(d) {
    try {
      var raw = localStorage.getItem('wl.workout.v1');
      if (!raw || !window.WorkoutCore) return null;
      var ws = WorkoutCore.validate(JSON.parse(raw));
      if (!ws) return null;
      var td = WorkoutCore.today(ws, d), st = WorkoutCore.weekStats(ws, d);
      var todayIso = K.iso(d);
      var trainedToday = (ws.sessions || []).some(function (s) { return s.date === todayIso && s.sets && s.sets.length; });
      return { trainedToday: trainedToday, restToday: !!WorkoutCore.restOn(ws, todayIso), plannedToday: !td.done, thisWeek: st.thisWeek, target: st.target };
    } catch (e) { return null; }
  }

  function childAgeText() {
    try {
      var raw = localStorage.getItem('wl.coach.v1');
      if (!raw || !window.CoachCore) return '';
      var cs = JSON.parse(raw);
      return cs && cs.child && cs.child.birth ? CoachCore.ageText(cs.child.birth, new Date()) : '';
    } catch (e) { return ''; }
  }

  function askable() { var pc = WL.pc; return !!(pc && (pc.canAsk ? pc.canAsk() : pc.ready())); }
  function queuedFor(task) {
    var pc = WL.pc;
    return pc && pc.queued ? pc.queued().filter(function (x) { return x.task === task; }) : [];
  }

  function subnav(tab) {
    return '<div class="subnav ui">' + [['', 'Today'], ['week', 'Week'], ['log', 'Food log'], ['pantry', 'Fridge & list']].map(function (t) {
      return '<a href="#cook' + (t[0] ? '/' + t[0] : '') + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</div>';
  }

  function dayHeading(iso) {
    var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var tIso = K.iso(now());
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

  function recipeDetailsHtml(r) {
    if (!r) return '';
    var ing = (r.ingredients || []).map(function (x) {
      return (x.qty ? x.qty + (x.unit ? ' ' + x.unit : '') + ' ' : '') + x.name;
    });
    return '<details class="ui" style="margin-top:6px"><summary class="meta">How to make it (' + r.mins + ' min' + (r.protein ? ' · ' + esc(r.protein) : '') + ')</summary>' +
      (ing.length ? '<p class="meta" style="margin:.2em 0 .5em"><b>Ingredients:</b> ' + esc(ing.join(', ')) + '.</p>' : '') +
      '<ol style="margin:0 0 .6em;padding-left:1.3em">' + (r.steps || []).map(function (s) { return '<li style="margin:.3em 0">' + esc(pers(s)) + '</li>'; }).join('') + '</ol>' +
      (r.babyNote ? '<p class="gentle" style="margin:.4em 0"><b>For ' + esc(childLabel()) + ':</b> ' + esc(pers(r.babyNote)) + '</p>' : '') +
      (r.tip ? '<p class="meta" style="margin:.3em 0 0"><b>Beginner tip:</b> ' + esc(r.tip) + '</p>' : '') +
      '</details>';
  }

  /* ---- Tab 1: Today (#cook) ---- */
  function todayHtml() {
    var d = now(), tIso = K.iso(d);
    K.ensureWeekPlan(S, d);
    save();
    var soon = K.expiringSoon(S, d, 3);
    var matches = soon.length ? K.matchExpiring(S, d, 3) : [];
    var wk = workoutInfo(d);
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};

    var h = subnav('') + '<h1>Cooking</h1>';
    if (wk && (wk.trainedToday || wk.plannedToday)) {
      h += '<p class="meta ui" id="ck-move-note">' + (wk.trainedToday
        ? 'Move workout logged today: aim for a solid protein portion and carbs at your next meal for recovery (general guidance).'
        : 'Move workout on the schedule today (' + wk.thisWeek + ' of ' + wk.target + ' this week): high-protein meals are highlighted below.') + '</p>';
    } else {
      h += '<p class="meta ui">Simple beginner meals for you and ' + esc(childLabel()) + '. If Mama cooks, tap “Mama cooked” and the shopping list adjusts.</p>';
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
        (slot.status !== 'mama' ? recipeDetailsHtml(r) : (slot.title ? '<p class="meta ui">Original plan (' + esc(slot.title) + ') moved off the shopping list.</p>' : '')) +
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
  function weekHtml() {
    var d = now(), days = K.weekDays(d);
    K.ensureWeekPlan(S, d);
    save();
    var q = queuedFor('cook-plan');
    var h = subnav('week') + '<h1>This week’s meals</h1>';
    h += '<div class="card ui"><p class="meta">Your 7-day plan prioritizes foods expiring soon and protein on Move workout days. Tap “Mama cooked” on any meal she handles — its ingredients drop off your shopping list automatically.</p>' +
      '<div class="row" style="margin-top:8px"><button id="ck-regen" type="button">Refresh offline plan</button>' +
      (askable() ? '<button class="primary" id="ck-ai-plan" type="button"' + (planBusy ? ' disabled' : '') + '>' + (planBusy ? 'Asking Claude…' : 'Ask Claude for this week’s plan') + '</button>' : '') + '</div>' +
      (planErr ? '<p class="no" style="margin-top:6px">' + esc(planErr) + '</p>' : '') +
      (q.length && WL.pc && WL.pc.queuedText ? '<div class="meta" id="ck-plan-queued" style="margin-top:6px">' + esc(WL.pc.queuedText()) + ' ' + (WL.pc.cancelHtml ? WL.pc.cancelHtml(q[0].id) : '') + '</div>' : '') +
      '</div>';

    days.forEach(function (iso) {
      var slot = (S.plan && S.plan.days && S.plan.days[iso]) || {};
      h += '<div class="card ui"><h3 style="margin-bottom:6px">' + esc(dayHeading(iso)) + '</h3>';
      K.MEALS.forEach(function (meal) {
        var m = slot[meal] || { title: '', status: 'planned', note: '' };
        h += '<div class="ck-slot"><div class="row"><div class="grow"><span class="meta">' + esc(K.MEAL_LABEL[meal]) + '</span><br><b>' +
          esc(m.status === 'mama' ? ('Mama cooked' + (m.note ? ': ' + m.note : '')) : (m.title || '—')) + '</b>' +
          (m.status === 'made' ? ' <span class="tick">✓</span>' : '') + '</div>' +
          '<button class="link" type="button" data-wk-swap="' + iso + '|' + meal + '">Swap</button>' +
          '<button class="link" type="button" data-wk-mama="' + iso + '|' + meal + '">' + (m.status === 'mama' ? 'Undo Mama' : 'Mama') + '</button></div></div>';
      });
      h += '</div>';
    });
    return h;
  }

  /* ---- Tab 3: Food log (#cook/log) ---- */
  function logHtml() {
    var d = now(), tIso = K.iso(d);
    K.ensureWeekPlan(S, d);
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
    var dinnerTitle = (day.dinner && day.dinner.title) || '';
    var cName = childLabel();
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
  function pantryHtml() {
    var d = now(), list = K.shoppingList(S, d), items = K.sortedPantry(S, d);
    var pq = queuedFor('cook-photo');

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
      '<div class="row" style="margin-top:8px"><label class="btn primary" for="ck-photo-in" id="ck-photo-lbl">' + (photoBusy ? 'Checking photo…' : '📷 Take or pick a photo') + '</label>' +
      '<input type="file" id="ck-photo-in" accept="image/*" capture="environment" class="sr"></div>' +
      (photoErr ? '<p class="no" style="margin-top:6px">' + esc(photoErr) + '</p>' : '') +
      (pq.length && WL.pc && WL.pc.queuedText ? '<div class="meta" id="ck-photo-queued" style="margin-top:6px">' + esc(WL.pc.queuedText()) + ' ' + (WL.pc.cancelHtml ? WL.pc.cancelHtml(pq[0].id) : '') + '</div>' : '');
    if (S.lastPhoto && Array.isArray(S.lastPhoto.items) && S.lastPhoto.items.length) {
      h += '<div id="ck-photo-res" style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">' +
        '<p style="margin-bottom:4px"><b>Detected from photo:</b> ' + esc(S.lastPhoto.summary || '') + '</p><ul class="me-g">' +
        S.lastPhoto.items.map(function (it) {
          return '<li><b>' + esc(it.name) + '</b> — ' + esc(it.amount || it.status || 'spotted') + (it.expiresInDays != null ? ' (~' + it.expiresInDays + ' d)' : '') + '</li>';
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

    // Inventory list (soonest expiring first)
    h += '<div class="card ui" id="ck-pantry-list"><h3>In your fridge &amp; pantry (' + items.length + ')</h3>';
    if (items.length) {
      h += '<ul class="list">' + items.map(function (x) {
        var dl = K.daysUntilExpiry(x, d);
        var qtyTxt = x.qty != null ? ' · ' + x.qty + (x.unit ? ' ' + x.unit : '') : '';
        return '<li><div class="row"><div class="grow"><b>' + esc(x.name) + '</b>' + esc(qtyTxt) + ' ' + expiryBadge(dl) +
          '<div class="meta">' + esc(K.CAT_LABEL[x.cat] || x.cat) + ' · ' + esc(x.status) + '</div></div></div>' +
          '<div class="chips" style="margin-top:6px">' + K.STATUS.map(function (st) {
            return '<button class="chip" type="button" data-pst="' + esc(x.id) + '|' + st + '" aria-pressed="' + (x.status === st) + '">' + (st === 'plenty' ? 'Plenty' : st === 'low' ? 'Low' : 'Out') + '</button>';
          }).join('') + '<button class="link" type="button" data-pdel="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">Remove</button></div></li>';
      }).join('') + '</ul>';
    } else {
      h += '<p class="meta">Nothing added yet. Add perishables here (or tick items bought above) and the app will nudge you to use them before they spoil.</p>';
    }
    h += '</div>';
    return h;
  }

  /* Resize and JPEG-compress a picked photo in browser so it fits comfortably inside PC / Drive payloads (~60-100 KB). */
  function compressImage(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('No photo selected.'));
      var reader = new FileReader();
      reader.onerror = function () { rej(new Error('Could not read that photo.')); };
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        if (!/^data:image\//i.test(dataUrl)) return rej(new Error('Please choose a photo (JPEG, PNG, or WebP).'));
        var img = new Image();
        img.onerror = function () {
          // fallback: send raw base64 if small enough (e.g. test fixtures)
          var b64 = dataUrl.split(',')[1] || '';
          if (b64.length > 0 && b64.length < 350000) res(b64);
          else rej(new Error('Could not decode that photo.'));
        };
        img.onload = function () {
          try {
            var maxDim = 800, w = img.naturalWidth || img.width || 640, h = img.naturalHeight || img.height || 480;
            if (w > maxDim || h > maxDim) {
              if (w >= h) { h = Math.max(1, Math.round(h * maxDim / w)); w = maxDim; }
              else { w = Math.max(1, Math.round(w * maxDim / h)); h = maxDim; }
            }
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            var out = c.toDataURL('image/jpeg', 0.72);
            res(out.split(',')[1] || '');
          } catch (e) { rej(new Error('Could not resize that photo.')); }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function askAiPlan() {
    if (planBusy || !WL.pc) return;
    planBusy = true; planErr = ''; render();
    var d = now(), wk = workoutInfo(d);
    var input = {
      weekStart: K.weekDays(d)[0],
      expiring: K.expiringSoon(S, d, 5).map(function (x) { return { name: x.item.name, daysLeft: x.daysLeft, qty: x.item.qty, unit: x.item.unit }; }),
      pantry: (S.pantry || []).filter(function (x) { return x.status !== 'out'; }).slice(0, 30).map(function (x) { return { name: x.name, status: x.status, qty: x.qty, unit: x.unit }; }),
      workout: wk || {},
      childAge: childAgeText(),
      childSummary: K.childSummary(S, d),
      recentMeals: (S.logs || []).slice(0, 14).map(function (l) { return l.who === 'child' ? { who: 'child', offered: l.offered, ate: l.ate } : { who: 'me', text: l.text, tags: l.tags }; })
    };
    WL.pc.ask('cook-plan', input).then(function (ans) {
      planBusy = false;
      if (K.applyAiPlan(S, ans, now())) { save(); WL.toast('Updated this week’s meal plan'); }
      else planErr = 'Claude’s reply didn’t include a 7-day plan. Try again.';
      render();
    }, function (e) {
      planBusy = false;
      if (!e.queued) planErr = (e && e.message) || 'Could not reach Claude.';
      render();
    });
  }

  function askPhotoCheck(file, note) {
    if (photoBusy) return;
    if (!askable()) { photoErr = 'Pair the PC link (Settings › PC link) or turn on Drive sync to check photos with Claude / Gemini.'; render(); return; }
    photoBusy = true; photoErr = ''; render();
    compressImage(file).then(function (b64) {
      var input = {
        imageBase64: b64,
        mime: 'image/jpeg',
        note: String(note || '').trim().slice(0, 300),
        pantry: (S.pantry || []).slice(0, 40).map(function (x) { return { name: x.name, qty: x.qty, unit: x.unit, status: x.status }; })
      };
      return WL.pc.ask('cook-photo', input);
    }).then(function (ans) {
      photoBusy = false;
      if (ans && Array.isArray(ans.items) && ans.items.length) {
        S.lastPhoto = { at: new Date().toISOString(), summary: String(ans.summary || '').slice(0, 300), items: ans.items.slice(0, 20) };
        save();
        WL.toast('Found ' + S.lastPhoto.items.length + ' item' + (S.lastPhoto.items.length === 1 ? '' : 's'));
      } else {
        photoErr = (ans && ans.summary) || 'Could not identify any food items in that photo.';
      }
      render();
    }, function (e) {
      photoBusy = false;
      if (!e.queued) photoErr = (e && e.message) || 'Photo check failed.';
      render();
    });
  }

  // Handle cloud answers arriving later via Drive sync
  if (WL.pc && WL.pc.onCloudAnswer) {
    WL.pc.onCloudAnswer('cook-plan', function (e, ans) {
      if (!e && K.applyAiPlan(S, ans, now())) { save(); WL.toast('Your cloud meal plan arrived'); }
      else if (e) planErr = e;
      if (view && /^#cook/.test(location.hash)) render();
    });
    WL.pc.onCloudAnswer('cook-photo', function (e, ans) {
      if (!e && ans && Array.isArray(ans.items)) {
        S.lastPhoto = { at: new Date().toISOString(), summary: String(ans.summary || '').slice(0, 300), items: ans.items.slice(0, 20) };
        save(); WL.toast('Photo inventory result arrived');
      } else if (e) photoErr = e;
      if (view && /^#cook/.test(location.hash)) render();
    });
  }

  function render() {
    if (!view) return;
    view.innerHTML = curTab === 'week' ? weekHtml() : curTab === 'log' ? logHtml() : curTab === 'pantry' ? pantryHtml() : todayHtml();
    wire();
  }

  function wire() {
    var d = now(), tIso = K.iso(d);
    if (curTab === '') {
      $$('[data-use-recipe]', view).forEach(function (b) {
        b.onclick = function () {
          K.swapSlot(S, tIso, b.dataset.useMeal, b.dataset.useRecipe, d);
          save(); render(); WL.toast('Added to today’s plan');
        };
      });
      $$('[data-ck-made]', view).forEach(function (b) {
        b.onclick = function () {
          var meal = b.dataset.ckMade;
          var slot = S.plan && S.plan.days && S.plan.days[tIso] && S.plan.days[tIso][meal];
          K.markSlot(S, tIso, meal, 'made', undefined, d);
          var ded = slot && slot.recipeId ? K.deductRecipe(S, slot.recipeId, d) : { updated: [] };
          save(); render();
          WL.toast(ded.updated.length
            ? 'Made it ✓ Updated fridge: ' + ded.updated.slice(0, 3).map(function (u) { return u.name + ' → ' + u.after; }).join(', ')
            : 'Marked made ✓');
        };
      });
      $$('[data-ck-mama]', view).forEach(function (b) {
        b.onclick = function () {
          var meal = b.dataset.ckMama;
          var dish = window.prompt ? window.prompt('What did Mama cook? (optional)', '') : '';
          if (dish === null) return;
          K.markSlot(S, tIso, meal, 'mama', dish, d);
          save(); render(); WL.toast('Marked Mama cooked — shopping list updated');
        };
      });
      $$('[data-ck-reset]', view).forEach(function (b) {
        b.onclick = function () { K.markSlot(S, tIso, b.dataset.ckReset, 'planned', '', d); save(); render(); };
      });
      $$('[data-ck-swap]', view).forEach(function (b) {
        b.onclick = function () { var s = K.swapSlot(S, tIso, b.dataset.ckSwap, null, d); save(); render(); if (s) WL.toast('Swapped to ' + s.title); };
      });
    } else if (curTab === 'week') {
      var rg = $('#ck-regen', view);
      if (rg) rg.onclick = function () { K.ensureWeekPlan(S, d, { force: true }); save(); render(); WL.toast('Refreshed plan (using expiring foods first)'); };
      var ap = $('#ck-ai-plan', view);
      if (ap) ap.onclick = askAiPlan;
      $$('[data-wk-swap]', view).forEach(function (b) {
        b.onclick = function () { var p = b.dataset.wkSwap.split('|'); K.swapSlot(S, p[0], p[1], null, d); save(); render(); };
      });
      $$('[data-wk-mama]', view).forEach(function (b) {
        b.onclick = function () {
          var p = b.dataset.wkMama.split('|');
          var cur = S.plan && S.plan.days && S.plan.days[p[0]] && S.plan.days[p[0]][p[1]];
          K.markSlot(S, p[0], p[1], cur && cur.status === 'mama' ? 'planned' : 'mama', '', d);
          save(); render();
        };
      });
    } else if (curTab === 'log') {
      var cMeal = 'lunch', cAte = 'About half', mMeal = 'dinner', mPort = 'Regular', mTags = [];
      $$('[data-cmeal]', view).forEach(function (b) { b.onclick = function () { cMeal = b.dataset.cmeal; $$('[data-cmeal]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-cate]', view).forEach(function (b) { b.onclick = function () { cAte = b.dataset.cate; $$('[data-cate]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mmeal]', view).forEach(function (b) { b.onclick = function () { mMeal = b.dataset.mmeal; $$('[data-mmeal]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mport]', view).forEach(function (b) { b.onclick = function () { mPort = b.dataset.mport; $$('[data-mport]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mtag]', view).forEach(function (b) { b.onclick = function () {
        var tg = b.dataset.mtag, idx = mTags.indexOf(tg);
        if (idx >= 0) mTags.splice(idx, 1); else mTags.push(tg);
        b.setAttribute('aria-pressed', mTags.indexOf(tg) >= 0);
      }; });
      var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
      var dinnerTitle = (day.dinner && day.dinner.title) || '';
      var cs = $('#ck-c-same', view); if (cs) cs.onclick = function () { $('#ck-c-offered', view).value = dinnerTitle + ' (soft, unsalted)'; };
      var ms = $('#ck-m-same', view); if (ms) ms.onclick = function () { $('#ck-m-text', view).value = dinnerTitle; };
      var mf = $('#ck-m-mama-fill', view); if (mf) mf.onclick = function () { $('#ck-m-text', view).value = 'Mama’s cooking: '; $('#ck-m-text', view).focus(); };
      $('#ck-c-save', view).onclick = function () {
        var inp = $('#ck-c-offered', view), note = $('#ck-c-note', view);
        if (!K.logChild(S, { date: tIso, meal: cMeal, offered: inp.value, ate: cAte, note: note.value }, d)) { inp.focus(); return; }
        save(); render(); WL.toast('Saved ' + childLabel() + '’s meal');
      };
      $('#ck-m-save', view).onclick = function () {
        var inp = $('#ck-m-text', view);
        if (!K.logMe(S, { date: tIso, meal: mMeal, text: inp.value, portion: mPort, tags: mTags }, d)) { inp.focus(); return; }
        save(); render(); WL.toast('Saved your meal');
      };
      $$('.ck-log-del', view).forEach(function (b) { b.onclick = function () { K.removeLog(S, b.dataset.id); save(); render(); }; });
    } else if (curTab === 'pantry') {
      var list = K.shoppingList(S, d);
      $$('[data-buy]', view).forEach(function (b) {
        b.onclick = function () {
          var item = list[+b.dataset.buy]; if (!item) return;
          var on = K.toggleBought(S, item, d); save(); render();
          WL.toast(on ? 'Added ' + item.name + ' to your fridge' : 'Unchecked ' + item.name);
        };
      });
      var expDays = '4';
      $$('[data-pexp]', view).forEach(function (b) { b.onclick = function () { expDays = b.dataset.pexp; $$('[data-pexp]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $('#ck-p-save', view).onclick = function () {
        var nm = $('#ck-p-name', view), q = $('#ck-p-qty', view), u = $('#ck-p-unit', view), c = $('#ck-p-cat', view);
        var rec = K.addPantryItem(S, {
          name: nm.value, qty: q.value, unit: u.value, cat: c.value, status: 'plenty',
          expires: expDays === '' ? null : undefined,
          expiresInDays: expDays !== '' ? +expDays : undefined
        }, d);
        if (!rec) { nm.focus(); return; }
        save(); render(); WL.toast('Added ' + rec.name);
      };
      $$('[data-pst]', view).forEach(function (b) {
        b.onclick = function () { var p = b.dataset.pst.split('|'); K.updatePantryStatus(S, p[0], p[1], d); save(); render(); };
      });
      $$('[data-pdel]', view).forEach(function (b) {
        b.onclick = function () { K.removePantryItem(S, b.dataset.pdel); save(); render(); };
      });
      var ph = $('#ck-photo-in', view);
      if (ph) ph.onchange = function () {
        var f = ph.files && ph.files[0]; ph.value = '';
        if (f) askPhotoCheck(f, $('#ck-photo-note', view) ? $('#ck-photo-note', view).value : '');
      };
      var pa = $('#ck-photo-apply', view);
      if (pa) pa.onclick = function () {
        var res = K.applyPhotoScan(S, S.lastPhoto && S.lastPhoto.items, d);
        S.lastPhoto = null; save(); render();
        WL.toast('Fridge updated (' + res.added + ' added, ' + res.updated + ' updated)');
      };
      var pc2 = $('#ck-photo-clear', view);
      if (pc2) pc2.onclick = function () { S.lastPhoto = null; save(); render(); };
    }
  }

  function card() {
    var d = now(), tIso = K.iso(d);
    K.ensureWeekPlan(S, d);
    var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
    var hr = d.getHours();
    var pickMeal = hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : 'dinner';
    var slot = day[pickMeal] || day.dinner || {};
    var soon = K.expiringSoon(S, d, 2);
    return '<div class="meta ui">Cooking · ' + esc(K.MEAL_LABEL[pickMeal] || 'Today') + '</div>' +
      '<h3>' + esc(slot.status === 'mama' ? 'Mama cooked' + (slot.note ? ': ' + slot.note : '') : (slot.title || 'Plan today’s meals')) + '</h3>' +
      (soon.length ? '<p class="meta ui" style="color:var(--warn)">Use soon: ' + esc(soon.slice(0, 3).map(function (x) { return x.item.name + ' (' + (x.daysLeft <= 0 ? 'today' : x.daysLeft + ' d') + ')'; }).join(', ')) + '</p>'
        : '<p class="meta ui">Beginner recipes, flexible when Mama cooks, food logs for you &amp; ' + esc(childLabel()) + '.</p>') +
      '<div class="row ui"><a class="btn primary" href="#cook">Today’s meals</a><a class="btn" href="#cook/log">Log food</a><a class="btn" href="#cook/pantry">Fridge &amp; list</a></div>';
  }

  WL.register({
    id: 'cook', title: 'Cooking', short: 'Cook', icon: '🍳', nav: false, navAs: 'home', storageKeys: [store.key],
    route: function (parts, v) {
      view = v;
      var t = (parts && parts[0]) || '';
      curTab = ['week', 'log', 'pantry'].indexOf(t) >= 0 ? t : '';
      render();
    },
    card: card,
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
