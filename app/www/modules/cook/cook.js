/* Cooking & family nutrition module (#cook, #cook/week, #cook/log, #cook/pantry).
   Tab HTML rendering lives in cook-views.js (loaded before this file); core logic lives in cook-core.js.
   This file handles state, event wiring, image compression, AI/cloud request lifecycles, and WL registration. */
(function () {
  'use strict';
  var K = window.CookCore, V = window.CookViews, $ = WL.$, $$ = WL.$$;
  var store = WL.store('wl.cook.v1', K.defaults);
  var S = store.load(), view = null, curTab = '';
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
      else planErr = 'Claude’s reply didn’t include a 7-day plan. Try again.';
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
    WL.pc.onCloudAnswer('cook-plan', function (e, ans) {
      if (!e && K.applyAiPlan(S, ans, realNow())) { planErr = ''; save(); WL.toast('Your cloud meal plan arrived'); }
      else if (e) planErr = e;
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
      askable: askable, queuedFor: queuedFor,
      planBusy: planBusy, planErr: planErr, photoBusy: photoBusy, photoErr: photoErr
    };
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
    var d = realNow();
    K.ensureWeekPlan(S, d);
    return V.cardHtml(S, { realNow: d, childLabel: childLabel });
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
