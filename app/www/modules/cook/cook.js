/* Cooking & family nutrition module (#cook, #cook/week, #cook/log, #cook/pantry).
   Tab HTML rendering lives in cook-views.js (loaded before this file); core logic lives in cook-core.js.
   This file handles state, event wiring, image compression, AI/cloud request lifecycles, and WL registration. */
(function () {
  'use strict';
  var K = window.CookCore, V = window.CookViews, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.cook.v1', K.defaults);
  var S = store.load(), view = null, curTab = '', pantryCat = 'all';
  var targetWho = 'me', targetRange = 'day', foodKeyFn = null, foodTrigger = null;
  var planBusy = false, photoBusy = false, photoErr = '', planErr = '';

  function save() { store.save(S); }
  // the food log records on the day picked in "Log for an earlier day"; the meal plan, fridge and shopping list are
  // always about now (an earlier day must never re-plan the week or mark last week's meals)
  function now() { return WL.logNow ? WL.logNow() : new Date(); }
  function realNow() { return new Date(); }
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
    var d = realNow(), wk = workoutInfo(d);
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
      if (K.applyAiPlan(S, ans, realNow())) { save(); WL.toast('Updated this week’s meal plan'); }
      else planErr = 'Claude’s reply didn’t include meals for this week. Try again.';
      render();
    }, function (e) {
      planBusy = false;
      if (!e.queued) planErr = (e && e.message) || 'Could not reach Claude.';
      render();
    });
  }

  function clearNativePhoto() {
    var n = WL.native;
    if (n && n.clearFridgePhotos) try { n.clearFridgePhotos(); } catch (e) {}
  }

  function noFoodMessage(ans) {
    var s = ans && typeof ans.summary === 'string' ? ans.summary.trim() : '';
    return s || 'No food found — could not identify any food items in that photo.';
  }

  function askPhotoCheck(file, note) {
    if (photoBusy) return;
    if (!askable()) { clearNativePhoto(); photoErr = 'Pair the PC link (Settings › PC link) or turn on Drive sync to check photos with Claude / Gemini.'; render(); return; }
    photoBusy = true; photoErr = ''; render();
    compressImage(file).then(function (b64) {
      clearNativePhoto();
      var input = {
        imageBase64: b64,
        mime: 'image/jpeg',
        note: String(note || '').trim().slice(0, 300),
        pantry: (S.pantry || []).slice(0, 40).map(function (x) { return { name: x.name, qty: x.qty, unit: x.unit, status: x.status }; })
      };
      return WL.pc.ask('cook-photo', input);
    }, function (err) {
      clearNativePhoto();
      throw err;
    }).then(function (ans) {
      photoBusy = false;
      var found = ans && K.cleanPhotoItems(ans.items);
      if (found && found.length) {
        S.lastPhoto = { at: new Date().toISOString(), summary: typeof ans.summary === 'string' ? ans.summary.trim().slice(0, 300) : '', items: found };
        save();
        WL.toast('Found ' + S.lastPhoto.items.length + ' item' + (S.lastPhoto.items.length === 1 ? '' : 's'));
      } else {
        photoErr = noFoodMessage(ans);
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
    WL.pc.onCloudAnswer('cook-plan', function (e, ans, meta, info) {
      if (!e && K.applyAiPlan(S, ans, realNow(), info && info.at)) { planErr = ''; save(); WL.toast('Your cloud meal plan arrived'); }
      else if (e) planErr = e;
      else planErr = 'That cloud meal plan was for another week or incomplete. Ask again for this week’s plan.';
      if (view && /^#cook/.test(location.hash)) render();
    });
    WL.pc.onCloudAnswer('cook-photo', function (e, ans) {
      var found = !e && ans && K.cleanPhotoItems(ans.items);
      if (found && found.length) {
        photoErr = '';
        S.lastPhoto = { at: new Date().toISOString(), summary: typeof ans.summary === 'string' ? ans.summary.trim().slice(0, 300) : '', items: found };
        save(); WL.toast('Photo inventory result arrived');
      } else if (!e) {
        photoErr = noFoodMessage(ans);
      } else if (e) photoErr = e;
      if (view && /^#cook/.test(location.hash)) render();
    });
  }

  function viewCtx() {
    var rn = realNow();
    return {
      realNow: rn, logNow: now(), childLabel: childLabel, pers: pers,
      wk: curTab === '' ? workoutInfo(rn) : null,
      askable: askable, queuedFor: queuedFor, pantryCat: pantryCat,
      targetWho: targetWho, targetRange: targetRange,
      planBusy: planBusy, planErr: planErr, photoBusy: photoBusy, photoErr: photoErr
    };
  }

  /* ---- Closable Quick-Add Food Picker modal (for Me or {child}) ---- */
  function closeFoodModal(noFocus) {
    var m = document.getElementById('ck-food-modal');
    if (m) m.remove();
    if (foodKeyFn) { document.removeEventListener('keydown', foodKeyFn); foodKeyFn = null; }
    var tr = foodTrigger; foodTrigger = null;
    if (!noFocus && tr && tr.isConnected && tr.focus) try { tr.focus(); } catch (e) {}
  }
  function openFoodModal(who, opts) {
    opts = opts || {};
    closeFoodModal(true);
    var CN = K.nutri; if (!CN) return;
    foodTrigger = opts.trigger || null;
    var picked = [], activeCat = 'all', query = '';
    var modal = document.createElement('div');
    modal.id = 'ck-food-modal';
    modal.className = 'wl-modal ui';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ck-food-h');
    var esc = WL.esc, whoName = who === 'child' ? childLabel() : 'Me';

    function pickedTotals() {
      var tot = CN.zeroNutri();
      var scale = who === 'child' ? CN.CHILD_PORTION_BASE : 1;
      picked.forEach(function (p) { CN.addNutri(tot, p.food.nutri, p.qty * scale); });
      return CN.roundNutri(tot);
    }
    function pickedLabel() {
      return picked.map(function (p) { return (p.qty > 1 ? p.qty + '× ' : '') + p.food.name; }).join(', ');
    }
    function renderBody() {
      var hits = CN.searchFoods(query, activeCat, S.customFoods).slice(0, 30);
      var tot = pickedTotals();
      var cats = [['all', 'All']].concat(S.customFoods && S.customFoods.length ? [['custom', 'My foods']] : []).concat(CN.FOOD_CATS);
      var h = '<div class="row" style="margin-bottom:4px"><h3 class="grow" id="ck-food-h" style="margin:0">Pick foods for ' + esc(whoName) + '</h3>' +
        '<button class="link" id="ck-food-x" type="button" aria-label="Close">\u2715</button></div>' +
        '<label class="sr" for="ck-food-q">Search foods</label>' +
        '<input type="search" id="ck-food-q" placeholder="Search foods (e.g. egg, banana, tinola, rice)..." value="' + esc(query) + '" autocomplete="off">' +
        '<div class="chips" id="ck-food-cats" style="margin:8px 0">' + cats.map(function (c) {
          return '<button class="chip" type="button" data-fcat="' + esc(c[0]) + '" aria-pressed="' + (activeCat === c[0]) + '">' + esc(c[1]) + '</button>';
        }).join('') + '</div>';
      if (picked.length) {
        h += '<div class="card" id="ck-food-picked" style="margin:6px 0 8px;padding:10px 12px">' +
          '<div class="meta"><b>Selected:</b> ' + esc(pickedLabel()) + '</div>' +
          '<div class="meta" style="margin-top:2px">~' + tot.kcal + ' kcal · ' + tot.pro + ' g protein · ' + tot.carb + ' g carbs · ' + tot.fat + ' g fat' +
          (who === 'child' ? ' (offered; scaled by what she eats)' : '') + '</div>' +
          '<div class="row" style="margin-top:6px"><button class="primary" type="button" id="ck-food-log">Log now</button>' +
          '<button type="button" id="ck-food-fill">Add to box</button>' +
          '<button class="link" type="button" id="ck-food-clear">Clear</button></div></div>';
      }
      h += '<div id="ck-food-results">' + (hits.length ? hits.map(function (f) {
        var mult = who === 'child' ? CN.CHILD_PORTION_BASE : 1;
        var k = Math.round(f.nutri.kcal * mult), pr = Math.round(f.nutri.pro * mult);
        var delBtn = f.cat === 'custom'
          ? '<button class="link" type="button" data-fdel="' + esc(f.id.slice(7)) + '" aria-label="Remove ' + esc(f.name) + '">Remove</button>'
          : '';
        return '<div class="ck-food-row"><div class="grow"><b>' + esc(f.name) + '</b><div class="meta">' + esc(f.serving) + ' · ~' + k + ' kcal · ' + pr + ' g pro</div></div>' +
          delBtn + '<button class="chip" type="button" data-fadd="' + esc(f.id) + '">+ Add</button></div>';
      }).join('') : '<p class="meta">No matching foods — save your own below.</p>') + '</div>';

      h += '<details id="ck-cf-add" style="margin-top:8px"><summary class="meta">+ Save a custom food (1-tap forever)</summary>' +
        '<label for="ck-cf-name">Food name</label><input type="text" id="ck-cf-name" placeholder="e.g. Mama’s chicken sopas">' +
        '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px"><input type="text" id="ck-cf-serv" style="flex:2 1 120px;min-width:0;width:auto;box-sizing:border-box" placeholder="Serving (e.g. 1 bowl)" aria-label="Serving size">' +
        '<input type="number" id="ck-cf-kcal" style="flex:1 1 78px;min-width:0;width:auto;box-sizing:border-box" min="0" placeholder="kcal" aria-label="Calories"></div>' +
        '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">' +
        '<input type="number" id="ck-cf-pro" style="flex:1 1 72px;min-width:0;width:auto;box-sizing:border-box" min="0" placeholder="Pro g" aria-label="Protein grams">' +
        '<input type="number" id="ck-cf-carb" style="flex:1 1 72px;min-width:0;width:auto;box-sizing:border-box" min="0" placeholder="Carb g" aria-label="Carbs grams">' +
        '<input type="number" id="ck-cf-fat" style="flex:1 1 72px;min-width:0;width:auto;box-sizing:border-box" min="0" placeholder="Fat g" aria-label="Fat grams"></div>' +
        '<div class="row" style="margin-top:8px"><button class="primary" type="button" id="ck-cf-save">Save food</button></div></details>' +
        '<div class="row" style="margin-top:10px"><button id="ck-food-close" type="button">Close</button></div>';
      return h;
    }

    function wireModal() {
      var box = $('#ck-food-sheet', modal); if (!box) return;
      var x = $('#ck-food-x', box); if (x) x.onclick = function () { closeFoodModal(); };
      var cl = $('#ck-food-close', box); if (cl) cl.onclick = function () { closeFoodModal(); };
      var q = $('#ck-food-q', box);
      if (q) q.oninput = function () {
        query = q.value;
        var pos = q.selectionStart;
        box.innerHTML = renderBody();
        wireModal();
        var q2 = $('#ck-food-q', box);
        if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
      };
      $$('[data-fcat]', box).forEach(function (b) {
        b.onclick = function () { activeCat = b.dataset.fcat; box.innerHTML = renderBody(); wireModal(); };
      });
      $$('[data-fadd]', box).forEach(function (b) {
        b.onclick = function () {
          var id = b.dataset.fadd;
          var all = CN.searchFoods('', 'all', S.customFoods);
          var f = all.filter(function (x) { return x.id === id; })[0];
          if (!f) return;
          var ex = picked.filter(function (p) { return p.food.id === id; })[0];
          if (ex) ex.qty++; else picked.push({ food: f, qty: 1 });
          box.innerHTML = renderBody(); wireModal();
        };
      });
      $$('[data-fdel]', box).forEach(function (b) {
        b.onclick = function () {
          var cid = b.dataset.fdel;
          if (!K.removeCustomFood(S, cid)) return;
          save();
          picked = picked.filter(function (p) { return p.food.id !== 'custom:' + cid; });
          if (activeCat === 'custom' && !(S.customFoods && S.customFoods.length)) activeCat = 'all';
          box.innerHTML = renderBody(); wireModal();
          WL.toast('Removed custom food');
        };
      });
      var clr = $('#ck-food-clear', box);
      if (clr) clr.onclick = function () { picked = []; box.innerHTML = renderBody(); wireModal(); };
      var fillBtn = $('#ck-food-fill', box);
      if (fillBtn) fillBtn.onclick = function () {
        var txt = pickedLabel();
        if (opts.onFill) opts.onFill(txt, pickedTotals());
        closeFoodModal();
      };
      var logBtn = $('#ck-food-log', box);
      if (logBtn) logBtn.onclick = function () {
        var txt = pickedLabel(), tot = pickedTotals();
        if (opts.onLog) opts.onLog(txt, tot);
        closeFoodModal(true);
      };
      var cfSave = $('#ck-cf-save', box);
      if (cfSave) cfSave.onclick = function () {
        var nm = $('#ck-cf-name', box), kc = $('#ck-cf-kcal', box);
        var rec = K.addCustomFood(S, {
          name: nm ? nm.value : '',
          serving: ($('#ck-cf-serv', box) && $('#ck-cf-serv', box).value) || '1 serving',
          kcal: kc ? +kc.value : 0,
          pro: +($('#ck-cf-pro', box) && $('#ck-cf-pro', box).value || 0),
          carb: +($('#ck-cf-carb', box) && $('#ck-cf-carb', box).value || 0),
          fat: +($('#ck-cf-fat', box) && $('#ck-cf-fat', box).value || 0)
        });
        if (!rec) { if (nm) nm.focus(); WL.toast('Enter a food name and calories'); return; }
        save();
        picked.push({ food: { id: 'custom:' + rec.id, name: rec.name, serving: rec.serving, nutri: rec.nutri }, qty: 1 });
        activeCat = 'custom'; query = '';
        box.innerHTML = renderBody(); wireModal();
        WL.toast('Saved ' + rec.name);
      };
    }

    modal.innerHTML = '<div class="card wl-modal-box" id="ck-food-sheet">' + renderBody() + '</div>';
    document.body.appendChild(modal);
    modal.onclick = function (e) { if (e.target === modal) closeFoodModal(); };
    wireModal();
    foodKeyFn = function (ev) {
      if (!modal.isConnected) { closeFoodModal(true); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); closeFoodModal(); }
    };
    document.addEventListener('keydown', foodKeyFn);
    var q0 = $('#ck-food-q', modal);
    if (q0) try { q0.focus(); } catch (e) {}
  }

  function render() {
    if (!view) return;
    var ctx = viewCtx();
    if (curTab === '' || curTab === 'week') { K.ensureWeekPlan(S, ctx.realNow); save(); }
    else if (curTab === 'log') K.ensureWeekPlan(S, ctx.realNow);
    view.innerHTML = curTab === 'week' ? V.weekHtml(S, ctx)
      : curTab === 'log' ? V.logHtml(S, ctx)
      : curTab === 'pantry' ? V.pantryHtml(S, ctx)
      : V.todayHtml(S, ctx);
    wire();
  }

  function wire() {
    var d = curTab === 'log' ? now() : realNow(), tIso = K.iso(d);
    $$('[data-tl-say]', view).forEach(function (b) { b.onclick = function () { WL.speech.speak(b.dataset.tlSay, null, { lang: 'fil-PH', rate: 0.8 }); }; });
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
          K.markSlot(S, tIso, meal, 'mama', '', d);
          save(); render(); WL.toast('Marked Mama cooked — shopping list updated');
          var inp = $('#ck-mama-' + meal, view); if (inp) inp.focus();
        };
      });
      $$('[data-ck-mama-form]', view).forEach(function (f) {
        f.onsubmit = function (e) {
          e.preventDefault();
          var meal = f.dataset.ckMamaForm, inp = $('#ck-mama-' + meal, view);
          K.markSlot(S, tIso, meal, 'mama', inp ? inp.value.trim() : '', d);
          save(); render(); WL.toast('Saved');
        };
      });
      $$('[data-ck-mama-pick]', view).forEach(function (b) {
        b.onclick = function () {
          var p = b.dataset.ckMamaPick.split('|');
          K.markSlot(S, tIso, p[0], 'mama', p[1], d);
          save(); render(); WL.toast('Saved: ' + p[1]);
        };
      });
      $$('[data-ck-skip]', view).forEach(function (b) {
        b.onclick = function () {
          K.markSlot(S, tIso, b.dataset.ckSkip, 'skipped', '', d);
          save(); render(); WL.toast('Skipped — shopping list updated');
        };
      });
      $$('[data-ck-logmeal]', view).forEach(function (b) {
        b.onclick = function () {
          var meal = b.dataset.ckLogmeal;
          var slot = S.plan && S.plan.days && S.plan.days[tIso] && S.plan.days[tIso][meal];
          if (!slot) return;
          var text = slot.status === 'mama' ? (slot.note || 'Mama’s cooking') : (slot.title || '');
          if (!text) return;
          K.logMe(S, { date: tIso, meal: meal, text: text, portion: 'Regular', tags: slot.status === 'mama' ? ['Mama cooked'] : [], recipeId: slot.status === 'made' ? slot.recipeId : undefined }, d);
          save(); render(); WL.toast('Logged ' + text + ' to food log');
        };
      });
      $$('[data-ck-reset]', view).forEach(function (b) {
        b.onclick = function () { K.markSlot(S, tIso, b.dataset.ckReset, 'planned', '', d); save(); render(); };
      });
      $$('[data-ck-swap]', view).forEach(function (b) {
        b.onclick = function () { var s = K.swapSlot(S, tIso, b.dataset.ckSwap, null, d); save(); render(); if (s) WL.toast('Swapped to ' + s.title); };
      });
    } else if (curTab === 'week') {
      function rerenderWeek(focusSel) {
        var openSlots = [];
        $$('[data-wk-slot]', view).forEach(function (el) {
          var det = el.querySelector('details');
          if (det && det.open) openSlots.push(el.dataset.wkSlot);
        });
        render();
        openSlots.forEach(function (key) {
          var det = $('[data-wk-slot="' + key + '"] details', view);
          if (det) det.open = true;
        });
        if (focusSel) {
          var target = $(focusSel, view);
          if (target && target.focus) try { target.focus(); } catch (e) {}
        }
      }
      var rg = $('#ck-regen', view);
      if (rg) rg.onclick = function () { K.ensureWeekPlan(S, d, { force: true }); save(); render(); WL.toast('Refreshed plan (using expiring foods first)'); };
      var ap = $('#ck-ai-plan', view);
      if (ap) ap.onclick = askAiPlan;
      $$('[data-wk-swap]', view).forEach(function (b) {
        b.onclick = function () {
          var key = b.dataset.wkSwap, p = key.split('|');
          K.swapSlot(S, p[0], p[1], null, d); save();
          rerenderWeek('[data-wk-swap="' + key + '"]');
        };
      });
      $$('[data-wk-mama]', view).forEach(function (b) {
        b.onclick = function () {
          var key = b.dataset.wkMama, p = key.split('|');
          var cur = S.plan && S.plan.days && S.plan.days[p[0]] && S.plan.days[p[0]][p[1]];
          K.markSlot(S, p[0], p[1], cur && cur.status === 'mama' ? 'planned' : 'mama', '', d);
          save();
          rerenderWeek('[data-wk-mama="' + key + '"]');
        };
      });
      $$('[data-wk-skip]', view).forEach(function (b) {
        b.onclick = function () {
          var key = b.dataset.wkSkip, p = key.split('|');
          var cur = S.plan && S.plan.days && S.plan.days[p[0]] && S.plan.days[p[0]][p[1]];
          K.markSlot(S, p[0], p[1], cur && cur.status === 'skipped' ? 'planned' : 'skipped', '', d);
          save();
          rerenderWeek('[data-wk-skip="' + key + '"]');
        };
      });
    } else if (curTab === 'log') {
      // Target graph controls (Me / {child}, Day / 7-day avg, Customize targets) redraw only #ck-targets-wrap
      // so typed meal drafts in #ck-c-offered / #ck-m-text and open #ck-micro state stay intact.
      function redrawTargets(focusSel) {
        var wrap = $('#ck-targets-wrap', view);
        if (!wrap) { render(); return; }
        var microOpen = !!($('#ck-micro', wrap) && $('#ck-micro', wrap).open);
        wrap.innerHTML = V.targetsCardHtml(S, viewCtx());
        if (microOpen) { var m = $('#ck-micro', wrap); if (m) m.open = true; }
        wireTargets();
        if (focusSel) {
          var target = $(focusSel, wrap);
          if (target && target.focus) try { target.focus(); } catch (e) {}
        }
      }
      function wireTargets() {
        var wrap = $('#ck-targets-wrap', view) || view;
        $$('[data-ck-twho]', wrap).forEach(function (b) {
          b.onclick = function () { targetWho = b.dataset.ckTwho; redrawTargets('[data-ck-twho="' + targetWho + '"]'); };
        });
        $$('[data-ck-trange]', wrap).forEach(function (b) {
          b.onclick = function () { targetRange = b.dataset.ckTrange; redrawTargets('[data-ck-trange="' + targetRange + '"]'); };
        });
        var ts = $('#ck-t-save', wrap);
        if (ts) ts.onclick = function () {
          var vals = {};
          $$('[data-ck-tval]', wrap).forEach(function (inp) { vals[inp.dataset.ckTval] = +inp.value; });
          K.setTargets(S, targetWho, vals); save(); redrawTargets(); WL.toast('Saved targets');
        };
        var tr = $('#ck-t-reset', wrap);
        if (tr) tr.onclick = function () { K.resetTargets(S, targetWho); save(); redrawTargets(); WL.toast('Targets reset to defaults'); };
      }
      wireTargets();

      var cMeal = 'lunch', cAte = 'About half', mMeal = 'dinner', mPort = 'Regular', mTags = [];
      var cPickedNutri = null, mPickedNutri = null;
      $$('[data-cmeal]', view).forEach(function (b) { b.onclick = function () { cMeal = b.dataset.cmeal; $$('[data-cmeal]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-cate]', view).forEach(function (b) { b.onclick = function () { cAte = b.dataset.cate; $$('[data-cate]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mmeal]', view).forEach(function (b) { b.onclick = function () { mMeal = b.dataset.mmeal; $$('[data-mmeal]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mport]', view).forEach(function (b) { b.onclick = function () { mPort = b.dataset.mport; $$('[data-mport]', view).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      $$('[data-mtag]', view).forEach(function (b) { b.onclick = function () {
        var tg = b.dataset.mtag, idx = mTags.indexOf(tg);
        if (idx >= 0) mTags.splice(idx, 1); else mTags.push(tg);
        b.setAttribute('aria-pressed', mTags.indexOf(tg) >= 0);
      }; });
      function appendFood(inp, item) {
        if (!inp) return;
        var cur = inp.value.trim();
        inp.value = cur ? cur + ', ' + item : item;
      }
      $$('[data-cquick]', view).forEach(function (b) {
        b.onclick = function () { cPickedNutri = null; appendFood($('#ck-c-offered', view), b.dataset.cquick); };
      });
      $$('[data-mquick]', view).forEach(function (b) {
        b.onclick = function () { mPickedNutri = null; appendFood($('#ck-m-text', view), b.dataset.mquick); };
      });
      var cPick = $('#ck-c-pick', view);
      if (cPick) cPick.onclick = function () {
        openFoodModal('child', {
          trigger: cPick,
          onFill: function (txt, tot) { var inp = $('#ck-c-offered', view); if (inp) inp.value = txt; cPickedNutri = tot; },
          onLog: function (txt, tot) {
            K.logChild(S, { date: tIso, meal: cMeal, offered: txt, ate: cAte, note: ($('#ck-c-note', view) && $('#ck-c-note', view).value) || '', nutri: tot }, d);
            targetWho = 'child'; save(); render(); WL.toast('Saved ' + childLabel() + '’s meal');
          }
        });
      };
      var mPick = $('#ck-m-pick', view);
      if (mPick) mPick.onclick = function () {
        openFoodModal('me', {
          trigger: mPick,
          onFill: function (txt, tot) { var inp = $('#ck-m-text', view); if (inp) inp.value = txt; mPickedNutri = tot; },
          onLog: function (txt, tot) {
            K.logMe(S, { date: tIso, meal: mMeal, text: txt, portion: mPort, tags: mTags, nutri: tot }, d);
            targetWho = 'me'; save(); render(); WL.toast('Saved your meal');
          }
        });
      };
      var cIn = $('#ck-c-offered', view); if (cIn) cIn.oninput = function () { cPickedNutri = null; };
      var mIn = $('#ck-m-text', view); if (mIn) mIn.oninput = function () { mPickedNutri = null; };
      var day = (S.plan && S.plan.days && S.plan.days[tIso]) || {};
      var dinnerTitle = (day.dinner && day.dinner.title) || '';
      var cs = $('#ck-c-same', view); if (cs) cs.onclick = function () { cPickedNutri = null; $('#ck-c-offered', view).value = dinnerTitle + ' (soft, unsalted)'; };
      var ms = $('#ck-m-same', view); if (ms) ms.onclick = function () { mPickedNutri = null; $('#ck-m-text', view).value = dinnerTitle; };
      var mf = $('#ck-m-mama-fill', view); if (mf) mf.onclick = function () { mPickedNutri = null; $('#ck-m-text', view).value = 'Mama’s cooking: '; $('#ck-m-text', view).focus(); };
      $('#ck-c-save', view).onclick = function () {
        var inp = $('#ck-c-offered', view), note = $('#ck-c-note', view);
        if (!K.logChild(S, { date: tIso, meal: cMeal, offered: inp.value, ate: cAte, note: note.value, nutri: cPickedNutri }, d)) { inp.focus(); return; }
        targetWho = 'child'; save(); render(); WL.toast('Saved ' + childLabel() + '’s meal');
      };
      $('#ck-m-save', view).onclick = function () {
        var inp = $('#ck-m-text', view);
        if (!K.logMe(S, { date: tIso, meal: mMeal, text: inp.value, portion: mPort, tags: mTags, nutri: mPickedNutri }, d)) { inp.focus(); return; }
        targetWho = 'me'; save(); render(); WL.toast('Saved your meal');
      };
      $$('.ck-log-del', view).forEach(function (b) { b.onclick = function () { K.removeLog(S, b.dataset.id); save(); render(); }; });
    } else if (curTab === 'pantry') {
      $$('[data-pquick]', view).forEach(function (b) {
        b.onclick = function () {
          var p = b.dataset.pquick.split('|');
          var rec = K.addPantryItem(S, { name: p[0], cat: p[1], status: 'plenty', expiresInDays: +p[2] }, d);
          if (rec) { save(); render(); WL.toast('Added ' + rec.name + ' to fridge'); }
        };
      });
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
      $$('[data-pcat]', view).forEach(function (b) {
        b.onclick = function () {
          pantryCat = b.dataset.pcat || 'all';
          render();
          var btn = $('[data-pcat="' + pantryCat + '"]', view);
          if (btn && btn.focus) try { btn.focus(); } catch (e) {}
        };
      });
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
    var d = realNow();
    K.ensureWeekPlan(S, d);
    return V.cardHtml(S, { realNow: d, childLabel: childLabel });
  }

  var prevBackCook = window.FCBack;
  window.FCBack = function () {
    if (WL.darkScreen && WL.darkScreen.lit && WL.darkScreen.lit()) return prevBackCook ? prevBackCook() : true;
    if (document.getElementById('ck-food-modal')) { closeFoodModal(); return true; }
    return prevBackCook ? prevBackCook() : false;
  };
  window.addEventListener('hashchange', function () { closeFoodModal(true); });

  WL.register({
    id: 'cook', title: 'Cooking', short: 'Cook', icon: '🍳', nav: true, storageKeys: [store.key],
    route: function (parts, v) {
      view = v;
      closeFoodModal(true);
      var t = (parts && parts[0]) || '';
      curTab = ['week', 'log', 'pantry'].indexOf(t) >= 0 ? t : '';
      if (curTab !== 'pantry') pantryCat = 'all';
      render();
    },
    leave: function () { closeFoodModal(true); },
    card: card,
    validate: function (k, raw) { try { var s = K.validate(JSON.parse(raw)); return s ? JSON.stringify(s) : null; } catch (e) { return null; } },
    reload: function () { S = store.load(); }
  });
})();
