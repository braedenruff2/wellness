/* Cooking & family nutrition logic tests (runs in 4 time zones via run-all.cjs). */
'use strict';
const assert = require('assert');
const K = require('../../../app/www/modules/cook/cook-core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

const now = new Date(2026, 10, 26, 12, 0); // Thu 2026-11-26

t('recipes: unique ids, beginner steps, ingredients, and {child} placeholders only', () => {
  const ids = new Set();
  assert.ok(K.RECIPES.length >= 12);
  for (const r of K.RECIPES) {
    assert.ok(!ids.has(r.id), 'dup ' + r.id); ids.add(r.id);
    assert.ok(r.title && r.mins > 0 && K.ALL_MEALS.includes(r.meal), r.id);
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 2, r.id);
    assert.ok(Array.isArray(r.steps) && r.steps.length >= 1, r.id);
    assert.ok(r.babyNote && r.babyNote.includes('{child}'), r.id + ' mentions {child}');
  }
});

t('pantry: add, smart shelf life, dedupe by name, expiringSoon sorted soonest first', () => {
  const s = K.defaults();
  const a = K.addPantryItem(s, { name: 'Spinach', qty: 3, unit: 'cups', cat: 'produce', expiresInDays: 2 }, now);
  const b = K.addPantryItem(s, { name: 'Salmon', qty: 400, unit: 'g', cat: 'meat', expiresInDays: 1 }, now);
  const c = K.addPantryItem(s, { name: 'Rice', qty: 4, unit: 'cups', cat: 'pantry', expires: null }, now);
  assert.strictEqual(s.pantry.length, 3);
  assert.strictEqual(a.expires, '2026-11-28');
  assert.strictEqual(b.expires, '2026-11-27');
  assert.strictEqual(c.expires, null);
  // dedupe updates existing item in place
  K.addPantryItem(s, { name: 'spinach', qty: 4, unit: 'cups', cat: 'produce', expiresInDays: 2 }, now);
  assert.strictEqual(s.pantry.length, 3);
  assert.strictEqual(s.pantry.find((x) => x.id === a.id).qty, 4);
  const soon = K.expiringSoon(s, now, 3);
  assert.deepStrictEqual(soon.map((x) => [x.item.name, x.daysLeft]), [['Salmon', 1], ['Spinach', 2]]);
  const matches = K.matchExpiring(s, now, 3);
  assert.strictEqual(matches[0].recipe.id, 'salmon-tray', 'salmon + spinach recipe ranks #1');
  assert.deepStrictEqual(matches[0].hits.sort(), ['Salmon', 'Spinach']);
  // marking out removes from expiringSoon
  K.updatePantryStatus(s, b.id, 'out', now);
  assert.deepStrictEqual(K.expiringSoon(s, now, 3).map((x) => x.item.name), ['Spinach']);
  assert.strictEqual(K.removePantryItem(s, b.id), true);
  assert.strictEqual(s.pantry.length, 2);
});

t('week plan: builds Mon-Sun, prioritizes expiring items, preserves made & mama slots on refresh', () => {
  const s = K.defaults();
  K.addPantryItem(s, { name: 'salmon', qty: 400, unit: 'g', cat: 'meat', expiresInDays: 1 }, now);
  const plan = K.ensureWeekPlan(s, now);
  const days = K.weekDays(now);
  assert.strictEqual(plan.week, '2026-11-23');
  assert.strictEqual(days.length, 7);
  assert.strictEqual(plan.days['2026-11-26'].dinner.recipeId, 'salmon-tray', 'today dinner uses expiring salmon');

  K.markSlot(s, '2026-11-26', 'lunch', 'mama', 'Sinigang', now);
  K.markSlot(s, '2026-11-26', 'breakfast', 'made', '', now);
  K.ensureWeekPlan(s, now, { force: true });
  assert.strictEqual(s.plan.days['2026-11-26'].lunch.status, 'mama');
  assert.strictEqual(s.plan.days['2026-11-26'].lunch.note, 'Sinigang');
  assert.strictEqual(s.plan.days['2026-11-26'].breakfast.status, 'made');

  const swapped = K.swapSlot(s, '2026-11-26', 'dinner', null, now);
  assert.notStrictEqual(swapped.recipeId, 'salmon-tray');
});

t('deductRecipe: subtracts matching numeric quantities and steps down status when unitless', () => {
  const s = K.defaults();
  K.addPantryItem(s, { name: 'eggs', qty: 6, unit: 'pcs', cat: 'dairy', expiresInDays: 10 }, now);
  K.addPantryItem(s, { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', expiresInDays: 2 }, now);
  K.addPantryItem(s, { name: 'butter', status: 'plenty', cat: 'dairy', expiresInDays: 20 }, now);
  const res = K.deductRecipe(s, 'eggs-toast', now);
  assert.strictEqual(res.updated.length, 3);
  const eggs = s.pantry.find((x) => x.name === 'eggs');
  const spin = s.pantry.find((x) => x.name === 'spinach');
  const but = s.pantry.find((x) => x.name === 'butter');
  assert.deepStrictEqual([eggs.qty, eggs.status], [3, 'low']);
  assert.deepStrictEqual([spin.qty, spin.status], [0, 'out']);
  assert.strictEqual(but.status, 'low');
});

t('shoppingList & toggleBought: aggregates remaining planned meals, skips mama/made/plenty, bought adds to fridge', () => {
  const s = K.defaults();
  K.ensureWeekPlan(s, now);
  // Mark Fri-Sun as mama so only Thu remains planned
  for (const d of ['2026-11-27', '2026-11-28', '2026-11-29']) {
    for (const m of K.MEALS) K.markSlot(s, d, m, 'mama', '', now);
  }
  K.swapSlot(s, '2026-11-26', 'breakfast', 'eggs-toast', now);
  K.markSlot(s, '2026-11-26', 'lunch', 'mama', '', now);
  K.markSlot(s, '2026-11-26', 'dinner', 'made', '', now);
  // Already have plenty of butter
  K.addPantryItem(s, { name: 'butter', status: 'plenty', cat: 'dairy' }, now);

  const list = K.shoppingList(s, now);
  const names = list.map((x) => x.name);
  assert.ok(names.includes('eggs') && names.includes('spinach') && names.includes('bread'), names);
  assert.ok(!names.includes('butter'), 'already plenty in fridge');

  const spinItem = list.find((x) => x.name === 'spinach');
  assert.strictEqual(K.toggleBought(s, spinItem, now), true);
  assert.ok(s.pantry.some((x) => x.name === 'spinach' && x.status === 'plenty' && x.expires === '2026-11-30'), 'bought adds to fridge with 4-day shelf life');
  // Undo bought unmarks it
  assert.strictEqual(K.toggleBought(s, spinItem, now), false);
});

t('food logs: Me (portion + tags) and {child} (Offered vs Actually ate + 14-day summary)', () => {
  const s = K.defaults();
  assert.strictEqual(K.logMe(s, { text: '  ' }, now), null);
  assert.strictEqual(K.logChild(s, { offered: '' }, now), null);
  const m1 = K.logMe(s, { meal: 'dinner', text: 'Chicken & broccoli rice', portion: 'Large', tags: ['High protein', 'Workout fuel', 'BadTag'] }, now);
  assert.deepStrictEqual(m1.tags, ['High protein', 'Workout fuel']);
  assert.strictEqual(m1.portion, 'Large');
  const c1 = K.logChild(s, { meal: 'lunch', offered: 'Soft scrambled egg + avocado', ate: 'Most of it', note: 'loved avocado' }, now);
  K.logChild(s, { meal: 'dinner', offered: 'Steamed broccoli', ate: 'Refused / none' }, now);
  K.logChild(s, { meal: 'breakfast', offered: 'Old porridge', ate: 'All + more', date: '2026-10-01' }, now);
  assert.strictEqual(K.dayLogs(s, '2026-11-26').length, 3);
  const sum = K.childSummary(s, now);
  assert.strictEqual(sum.count, 2);
  assert.deepStrictEqual(sum.liked, ['Soft scrambled egg + avocado']);
  assert.deepStrictEqual(sum.refused, ['Steamed broccoli']);
  assert.strictEqual(K.removeLog(s, c1.id), true);
  assert.strictEqual(K.dayLogs(s, '2026-11-26').length, 2);
});

t('applyAiPlan & applyPhotoScan: merges AI recipes and fridge photo items cleanly', () => {
  const s = K.defaults();
  K.ensureWeekPlan(s, now);
  K.markSlot(s, '2026-11-26', 'lunch', 'mama', 'Adobo', now);
  const ok = K.applyAiPlan(s, {
    note: 'Use the chicken and spinach early this week.',
    days: [{
      date: '2026-11-26',
      breakfast: { recipeId: 'oatmeal-pb', title: 'Warm protein oatmeal with banana & peanut butter' },
      lunch: { title: 'Should not overwrite Mama slot' },
      dinner: {
        title: 'Simple garlic tilapia & rice', mins: 20, protein: '~35 g protein',
        babyNote: 'Plain flaked tilapia for {child}.',
        ingredients: [{ name: 'tilapia', qty: 400, unit: 'g', cat: 'meat' }],
        steps: ['Pan sear tilapia 4 min per side.', 'Serve with warm rice.']
      }
    }]
  }, now);
  assert.strictEqual(ok, true);
  assert.strictEqual(s.plan.source, 'ai');
  assert.strictEqual(s.plan.note, 'Use the chicken and spinach early this week.');
  assert.strictEqual(s.plan.days['2026-11-26'].lunch.status, 'mama', 'mama slot preserved');
  assert.strictEqual(s.plan.days['2026-11-26'].dinner.title, 'Simple garlic tilapia & rice');
  assert.ok(K.recipeById(s, s.plan.days['2026-11-26'].dinner.recipeId), 'custom AI recipe stored');

  K.addPantryItem(s, { name: 'milk', qty: 2, unit: 'cups', cat: 'dairy', expiresInDays: 5 }, now);
  const ph = K.applyPhotoScan(s, [
    { name: 'milk', qty: 0.5, unit: 'liters', status: 'low', cat: 'dairy', expiresInDays: 3 },
    { name: 'broccoli', qty: 1, unit: 'head', status: 'plenty', cat: 'produce', expiresInDays: 4 }
  ], now);
  assert.deepStrictEqual(ph, { added: 1, updated: 1 });
  assert.strictEqual(s.pantry.find((x) => x.name === 'milk').status, 'low');
  assert.ok(s.pantry.some((x) => x.name === 'broccoli'));
});

t('validate: round-trips clean state and strips corrupt dates/entries', () => {
  const s = K.defaults();
  K.addPantryItem(s, { name: 'eggs', qty: 6, unit: 'pcs', cat: 'dairy', expiresInDays: 10 }, now);
  K.ensureWeekPlan(s, now);
  K.logMe(s, { text: 'Eggs & toast', meal: 'breakfast', portion: 'Regular', tags: ['High protein'] }, now);
  K.logChild(s, { offered: 'Soft egg', ate: 'Most of it', meal: 'breakfast' }, now);
  const raw = JSON.parse(JSON.stringify(s));
  raw.pantry.push(null, { name: '', status: 'plenty' }, { name: 'bad-exp', expires: '2026-02-30' });
  raw.logs.push(null, { who: 'me', date: '2026-02-30', text: 'bad date' }, { who: 'alien', date: '2026-11-26', text: 'x' });
  const v = K.validate(raw);
  assert.strictEqual(v.pantry.length, 2);
  assert.strictEqual(v.pantry[1].expires, null, 'impossible date dropped');
  assert.strictEqual(v.logs.length, 2);
  assert.strictEqual(K.validate(null), null);
});

t('a log day in an earlier week never replaces this week\'s plan (made / Mama cooked marks stay)', () => {
  const s = K.defaults();
  K.ensureWeekPlan(s, now);
  const wk = s.plan.week, tue = '2026-11-24';
  K.markSlot(s, tue, 'dinner', 'mama', '', now);
  K.ensureWeekPlan(s, new Date(2026, 10, 22, 12, 0)); // Sunday of last week (Log for an earlier day)
  assert.strictEqual(s.plan.week, wk);
  assert.strictEqual(s.plan.days[tue].dinner.status, 'mama');
  K.ensureWeekPlan(s, new Date(2026, 11, 1, 12, 0)); // next week: a new plan
  assert.strictEqual(s.plan.week, '2026-11-30');
});

t('sameFood: whole words; a describing word before or a cut after still matches, a different food does not', () => {
  const yes = [['chicken thighs', 'chicken'], ['Chicken breasts', 'chicken'], ['boneless skinless chicken thighs', 'chicken'], ['red lentils', 'lentils'], ['ground beef', 'beef'], ['broccoli florets', 'broccoli'], ['baby spinach', 'spinach'], ['tomatoes', 'tomato'], ['eggs', 'egg'], ['greek yogurt', 'yogurt'], ['frozen peas', 'peas']];
  yes.push(['blueberries', 'berries'], ['strawberries', 'berries'], ['garlic cloves', 'garlic'], ['onion, diced', 'onion'], ['garlic (minced)', 'garlic'], ['cherry tomatoes, halved', 'cherry tomatoes'], ['sweet onion', 'onion'], ['corn tortillas', 'tortilla'], ['baking potatoes', 'potato'], ['canned tuna', 'tuna']);
  const no = [['blueberries', 'strawberries'], ['pineapple', 'apple'], ['fish sauce', 'fish'], ['bell pepper', 'pepper'],
    ['peanut butter', 'butter'], ['chicken broth', 'chicken'], ['tomato sauce', 'tomato'], ['sweet potato', 'potatoes'], ['oat milk', 'milk'], ['rice noodles', 'rice'], ['cream cheese', 'cheese'], ['egg noodles', 'eggs'], ['carrots', 'car']];
  for (const [a, b] of yes) { assert.strictEqual(K.sameFood(a, b), true, a + ' ~ ' + b); assert.strictEqual(K.sameFood(b, a), true, b + ' ~ ' + a); }
  for (const [a, b] of no) { assert.strictEqual(K.sameFood(a, b), false, a + ' !~ ' + b); assert.strictEqual(K.sameFood(b, a), false, b + ' !~ ' + a); }
});

t('Made it on a recipe with peanut butter leaves the butter alone; peanut butter still goes on the shopping list', () => {
  const s = K.defaults();
  K.addPantryItem(s, { name: 'butter', qty: 1, unit: 'pack', cat: 'dairy', status: 'plenty' }, now);
  K.addPantryItem(s, { name: 'tomato', qty: 4, unit: 'pcs', cat: 'produce', status: 'plenty' }, now);
  const r = K.RECIPES.find((x) => x.ingredients.some((i) => i.name === 'peanut butter'));
  K.deductRecipe(s, r.id, now);
  assert.strictEqual(s.pantry.find((p) => p.name === 'butter').status, 'plenty');
  // this week's only planned meals: the peanut-butter one and one with tomato sauce (butter and tomato are plenty)
  K.ensureWeekPlan(s, now);
  Object.values(s.plan.days).forEach((day) => Object.keys(day).forEach((m) => { day[m].status = 'made'; }));
  const ts = K.RECIPES.find((x) => x.ingredients.some((i) => i.name === 'tomato sauce'));
  s.plan.days['2026-11-27'].breakfast = { recipeId: r.id, title: r.title, status: 'planned', note: '' };
  s.plan.days['2026-11-27'].dinner = { recipeId: ts.id, title: ts.title, status: 'planned', note: '' };
  const names = K.shoppingList(s, now).map((x) => x.name);
  assert.ok(names.includes('peanut butter'), 'peanut butter to buy: ' + names);
  assert.ok(names.includes('tomato sauce'), 'tomato sauce to buy: ' + names);
  assert.ok(!names.includes('butter') && !names.includes('tomato'));
});

t('AI plan: a null or odd ingredient is skipped, not a crash', () => {
  const s = K.defaults();
  const ok = K.applyAiPlan(s, { days: [{ dinner: { title: 'Rice bowl', steps: ['Cook rice'], ingredients: [null, 7, 'rice', { name: 'eggs', qty: 2 }] } }] }, now);
  assert.ok(ok);
  const r = Object.values(s.aiRecipes)[0];
  assert.deepStrictEqual(r.ingredients.map((x) => x.name), ['rice', 'eggs']);
  const v = K.validate(JSON.parse(JSON.stringify(Object.assign({}, s, { aiRecipes: { x: Object.assign({}, r, { ingredients: [null, { name: 'milk' }] }) } }))));
  assert.deepStrictEqual(v.aiRecipes.x.ingredients.map((x) => x.name), ['milk']);
});

t('validate keeps the AI recipes this week\'s plan uses (and the newest), and a waiting photo scan', () => {
  const s = K.defaults();
  K.ensureWeekPlan(s, now);
  for (let w = 0; w < 3; w++) for (let d = 0; d < 7; d++) for (const m of ['breakfast', 'lunch', 'dinner']) {
    const date = K.iso(new Date(2026, 10, 9 + 7 * w + d)), id = 'ai-' + date + '-' + m;
    s.aiRecipes[id] = { id, title: 'AI ' + date + ' ' + m, meal: m, mins: 20, protein: '', babyNote: '', tip: '', ingredients: [{ name: 'rice', qty: 1, unit: '', cat: 'pantry' }], steps: ['a'] };
    if (w === 2) s.plan.days[date] = Object.assign(s.plan.days[date] || {}, { [m]: { recipeId: id, title: 'AI', status: 'planned', note: '' } });
  }
  assert.strictEqual(Object.keys(s.aiRecipes).length, 63);
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(Object.keys(v.aiRecipes).length, 40);
  Object.keys(v.plan.days).forEach((day) => ['breakfast', 'lunch', 'dinner'].forEach((m) => { const x = v.plan.days[day][m]; if (x && /^ai-/.test(x.recipeId)) assert.ok(v.aiRecipes[x.recipeId], 'kept ' + x.recipeId); }));
  assert.ok(v.aiRecipes['ai-2026-11-22-dinner'] && !v.aiRecipes['ai-2026-11-09-breakfast'], 'newest kept, oldest dropped');
  s.lastPhoto = { at: now.toISOString(), summary: 'Fridge', items: [null, { name: 'Milk', qty: '2', unit: 'L', status: 'low', cat: 'dairy', expiresInDays: 4 }, { name: '' }, { name: 'Kale', expiresInDays: 'x' }] };
  const v2 = K.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(v2.lastPhoto.items, [{ name: 'Milk', qty: 2, unit: 'L', status: 'low', cat: 'dairy', expiresInDays: 4 }, { name: 'Kale' }]);
  assert.deepStrictEqual(K.cleanPhotoItems([{ name: 'Eggs', amount: ' 3 eggs left ' }, 'x']), [{ name: 'Eggs', amount: '3 eggs left' }], 'the plain amount stays');
  assert.strictEqual(v2.lastPhoto.summary, 'Fridge');
  assert.deepStrictEqual(K.validate(JSON.parse(JSON.stringify(v2))).lastPhoto, v2.lastPhoto, 'stable');
});

t('toddler portions: eggs cooked through, light tuna, low-sodium broth, no cucumber rounds for {child}', () => {
  assert.ok(!K.RECIPES.some((r) => /soft scrambled/i.test(r.babyNote)), 'no soft-scrambled egg for {child}');
  for (const r of K.RECIPES) {
    if (r.ingredients.some((i) => /cucumber/.test(i.name))) assert.ok(/strips|dice/.test(r.babyNote), r.id + ': how to cut her cucumber');
    if (r.ingredients.some((i) => /tuna/.test(i.name))) assert.ok(/light tuna/.test(r.babyNote), r.id + ': light tuna');
    if (r.ingredients.some((i) => /broth|stock/.test(i.name))) assert.ok(r.ingredients.some((i) => /low-sodium/.test(i.name)), r.id + ': low-sodium broth');
  }
});
t('Filipino family dishes: there, beginner-sized, {child} served before fish sauce / salty seasoning, pork cuts match "pork"', () => {
  const ids = ['tinola', 'arroz-caldo', 'monggo', 'sinigang', 'adobo', 'pancit'];
  for (const id of ids) {
    const r = K.recipeById(K.defaults(), id);
    assert.ok(r && r.filipino, id);
    assert.ok(r.steps.length >= 4 && r.steps.length <= 7 && r.mins <= 60, id + ' beginner-sized');
    const salty = r.ingredients.some((i) => /fish sauce|soy sauce|soup mix/.test(i.name));
    if (salty) assert.ok(/before|salty|only a spoon/.test(r.babyNote), id + ': her portion before the salty part');
    assert.ok(!/whole nut|popcorn|honey/i.test(r.babyNote), id);
  }
  assert.ok(K.sameFood('pork', 'pork shoulder') && K.sameFood('pork belly', 'pork') && !K.sameFood('pork', 'fish sauce'));
  for (const r of K.RECIPES.filter((x) => x.filipino)) {
    assert.ok(Array.isArray(r.words) && r.words.length >= 4, r.id + ' has its Tagalog words');
    for (const w of r.words) assert.ok(/^[a-z ]+$/.test(w.tl) && w.en && w.en.length < 30, r.id + ': ' + JSON.stringify(w));
  }
});
t('offline week plans: a recipe at most twice a week, no 45+ min dish on a workout day, and the weeks differ', () => {
  const seen = new Set();
  for (let w = 0; w < 8; w++) {
    const s = K.defaults(), now = new Date(2026, 10, 23 + 7 * w, 9);
    K.ensureWeekPlan(s, now);
    const cnt = {};
    K.weekDays(now).forEach((d, i) => ['breakfast', 'lunch', 'dinner'].forEach((m) => {
      const x = s.plan.days[d][m]; cnt[x.recipeId] = (cnt[x.recipeId] || 0) + 1;
      if ([0, 2, 4].includes(i)) assert.ok(K.recipeById(s, x.recipeId).mins < 45, 'week ' + w + ' ' + d + ' ' + m + ': ' + x.recipeId);
    }));
    assert.ok(Object.values(cnt).every((c) => c <= 2), JSON.stringify(cnt));
    seen.add(JSON.stringify(K.weekDays(now).map((d) => s.plan.days[d].dinner.recipeId)));
  }
  assert.ok(seen.size >= 4, 'dinners vary from week to week: ' + seen.size);
});
t('weekly AI plans for months keep at most 40 AI recipes, always the ones this week uses', () => {
  const s = K.defaults();
  for (let w = 0; w < 10; w++) {
    const now = new Date(2026, 10, 23 + 7 * w, 9);
    K.applyAiPlan(s, { days: K.weekDays(now).map((date) => ({ date, lunch: { title: 'L ' + date, steps: ['a'], ingredients: ['rice'] }, dinner: { title: 'D ' + date, steps: ['a'], ingredients: ['rice'] } })) }, now);
    const ids = Object.keys(s.aiRecipes);
    assert.ok(ids.length <= 40, 'week ' + w + ': ' + ids.length);
    K.weekDays(now).forEach((d) => ['lunch', 'dinner'].forEach((m) => assert.ok(s.aiRecipes[s.plan.days[d][m].recipeId], 'kept ' + d + ' ' + m)));
  }
});
t('earlier-day food logs stay newest-first chronologically, and toggleBought prunes older weeks to 4', () => {
  const s = K.defaults();
  const thu = new Date(2026, 10, 26, 18, 0), wed = new Date(2026, 10, 25, 18, 0), tue = new Date(2026, 10, 24, 12, 0);
  K.logMe(s, { date: '2026-11-26', meal: 'dinner', text: 'Thu dinner' }, thu);
  K.logChild(s, { date: '2026-11-24', meal: 'lunch', offered: 'Tue lunch', ate: 'Most of it' }, tue);
  K.logMe(s, { date: '2026-11-25', meal: 'dinner', text: 'Wed dinner' }, wed);
  assert.deepStrictEqual(s.logs.map((x) => x.date), ['2026-11-26', '2026-11-25', '2026-11-24'], 'newest date first even when backfilled');
  for (let w = 0; w < 6; w++) {
    K.toggleBought(s, { name: 'eggs', qty: 2, unit: 'pcs', cat: 'dairy', shelfDays: 21 }, new Date(2026, 9, 5 + w * 7, 12, 0));
  }
  assert.strictEqual(Object.keys(s.bought).length, 4, 'bought map stays capped at 4 newest weeks');
});
t('applyAiPlan week-boundary guard: rejects last week\'s dates on Monday and skips out-of-week entries', () => {
  const mon = new Date(2026, 10, 30, 9, 0); // Mon 2026-11-30 (week 2026-11-30..2026-12-06)
  const s = K.defaults();
  K.ensureWeekPlan(s, mon);
  const before = JSON.parse(JSON.stringify(s.plan));
  const stale = {
    note: 'Stale note from last week',
    days: [
      { date: '2026-11-23', dinner: { title: 'Old Mon', steps: ['a'], ingredients: ['rice'] } },
      { date: '2026-11-29', dinner: { title: 'Old Sun', steps: ['a'], ingredients: ['rice'] } }
    ]
  };
  assert.strictEqual(K.applyAiPlan(s, stale, mon), false, 'all out-of-week dates rejected');
  assert.deepStrictEqual(s.plan, before, 'this week plan untouched');
  assert.deepStrictEqual(s.aiRecipes, {}, 'no stale aiRecipes created');
  assert.strictEqual(K.applyAiPlan(s, { note: 'empty', days: [] }, mon), false, 'empty days rejected');
  assert.strictEqual(K.applyAiPlan(s, { days: [{ date: '2026-11-30', dinner: { title: '   ' } }] }, mon), false, 'blank meals rejected');

  // Mixed plan (last Sunday + this Monday): skips last Sunday, applies this Monday
  const mixed = {
    note: 'Fresh week',
    days: [
      { date: '2026-11-29', dinner: { title: 'Stale Sun', steps: ['a'], ingredients: ['rice'] } },
      { date: '2026-11-30', dinner: { title: 'Fresh Mon Curry', steps: ['Simmer'], ingredients: ['chicken'] } }
    ]
  };
  assert.strictEqual(K.applyAiPlan(s, mixed, mon), true);
  assert.strictEqual(s.plan.source, 'ai');
  assert.strictEqual(s.plan.days['2026-11-29'], undefined, 'out-of-week Sunday not written');
  assert.strictEqual(s.aiRecipes['ai-2026-11-29-dinner'], undefined, 'out-of-week AI recipe not written');
  assert.strictEqual(s.plan.days['2026-11-30'].dinner.title, 'Fresh Mon Curry');
});
t('applyAiPlan: days without dates fill this week by order only when the plan was asked for this week', () => {
  const mon = new Date(2026, 10, 30, 9), lastWeek = new Date(2026, 10, 27, 20);
  const plan = { days: [{ dinner: { title: 'Rice bowl', steps: ['Cook rice'], ingredients: ['rice'] } }] };
  const s1 = K.defaults();
  assert.strictEqual(K.applyAiPlan(s1, plan, mon, lastWeek.toISOString()), false, 'asked last week: refused');
  const s2 = K.defaults();
  assert.strictEqual(K.applyAiPlan(s2, plan, mon, new Date(2026, 10, 30, 8).toISOString()), true, 'asked this week: Monday');
  assert.strictEqual(s2.plan.days['2026-11-30'].dinner.title, 'Rice bowl');
  const s3 = K.defaults();
  assert.strictEqual(K.applyAiPlan(s3, plan, mon), true, 'no request time (asked just now from the PC): by order');
  const s4 = K.defaults();
  assert.strictEqual(K.applyAiPlan(s4, { days: [{ date: '2026-12-01', dinner: plan.days[0].dinner }] }, mon, lastWeek.toISOString()), true, 'dated days still count');
});

t('skipped ("Not making") meal slot drops from shoppingList and survives plan refresh, AI plan, and validate', () => {
  const s = K.defaults();
  K.ensureWeekPlan(s, now);
  for (const d of ['2026-11-27', '2026-11-28', '2026-11-29']) {
    for (const m of K.MEALS) K.markSlot(s, d, m, 'skipped', '', now);
  }
  K.swapSlot(s, '2026-11-26', 'breakfast', 'eggs-toast', now);
  K.markSlot(s, '2026-11-26', 'lunch', 'skipped', '', now);
  K.markSlot(s, '2026-11-26', 'dinner', 'skipped', '', now);
  const names = K.shoppingList(s, now).map((x) => x.name);
  assert.ok(names.includes('eggs') && names.includes('spinach'), 'planned breakfast stays on shopping list: ' + names);
  K.markSlot(s, '2026-11-26', 'breakfast', 'skipped', '', now);
  assert.deepStrictEqual(K.shoppingList(s, now), [], 'all skipped means empty shopping list');

  K.ensureWeekPlan(s, now, { force: true });
  assert.strictEqual(s.plan.days['2026-11-26'].dinner.status, 'skipped', 'survives force refresh');
  K.applyAiPlan(s, { days: [{ date: '2026-11-26', dinner: { title: 'Should not overwrite skipped', steps: ['a'], ingredients: ['rice'] }, lunch: { title: 'Also skipped', steps: ['a'], ingredients: ['rice'] } }] }, now);
  assert.strictEqual(s.plan.days['2026-11-26'].dinner.status, 'skipped', 'AI plan respects skipped slot');
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.plan.days['2026-11-26'].dinner.status, 'skipped', 'validate preserves skipped status');
});

t('Cronometer nutrition targets & estimator: counts, no double-count, portions, {child} ate scale, 7d avg, custom foods & targets', () => {
  const CN = K.nutri;
  assert.ok(CN && CN.FOOD_DB.length >= 35, 'offline food database loaded');
  // 2 eggs + half avocado + peanut butter (must NOT double-count butter)
  const e1 = CN.estimateEntry({ who: 'me', text: '2 eggs, half avocado, peanut butter', portion: 'Regular' });
  assert.strictEqual(e1.matched, true);
  const expKcal = 2 * CN.FOOD_BY.egg.nutri.kcal + 0.5 * CN.FOOD_BY.avocado.nutri.kcal + CN.FOOD_BY.pb.nutri.kcal;
  assert.strictEqual(Math.round(e1.nutri.kcal), Math.round(expKcal), 'exact count + no butter double-count');

  // Portion scaling for Me
  const sm = CN.estimateEntry({ who: 'me', text: 'Chicken & rice', portion: 'Small' });
  const lg = CN.estimateEntry({ who: 'me', text: 'Chicken & rice', portion: 'Large' });
  assert.ok(lg.nutri.kcal > sm.nutri.kcal * 1.6, 'Large scales higher than Small');

  // Filipino dish & recipeId matching
  const fil = CN.estimateEntry({ who: 'me', text: 'Sinigang', portion: 'Regular' });
  assert.strictEqual(fil.matched, true);
  assert.ok(fil.nutri.kcal >= 300 && fil.nutri.pro >= 20, 'Filipino dish estimated');
  const rec = CN.estimateEntry({ who: 'me', recipeId: 'salmon-tray', portion: 'Regular' });
  assert.strictEqual(rec.nutri.kcal, CN.RECIPE_NUTRI['salmon-tray'].kcal);

  // {child} scaling by Actually ate
  const cNone = CN.estimateEntry({ who: 'child', offered: 'Banana & oatmeal', ate: 'Refused / none' });
  const cHalf = CN.estimateEntry({ who: 'child', offered: 'Banana & oatmeal', ate: 'About half' });
  const cAll = CN.estimateEntry({ who: 'child', offered: 'Banana & oatmeal', ate: 'All + more' });
  assert.strictEqual(cNone.nutri.kcal, 0, 'Refused / none contributes 0');
  assert.ok(Math.abs(cHalf.nutri.kcal * 2 - cAll.nutri.kcal) < 1, 'About half is 50% of All + more');

  // State-level dailyNutrition, 7-day average, custom foods, and custom targets round-trip
  const s = K.defaults();
  const cf = K.addCustomFood(s, { name: 'Mama chicken sopas', serving: '1 bowl', kcal: 380, pro: 28, carb: 36, fat: 12 });
  assert.ok(cf && s.customFoods.length === 1);
  assert.ok(CN.searchFoods('sopas', 'all', s.customFoods).some((f) => f.id === 'custom:' + cf.id));
  K.logMe(s, { date: '2026-11-26', meal: 'lunch', text: 'Mama chicken sopas', portion: 'Regular' }, now);
  K.logMe(s, { date: '2026-11-24', meal: 'dinner', text: 'Chicken & rice', portion: 'Regular', nutri: { kcal: 620, pro: 42, carb: 60, fat: 16, fib: 4, iron: 3, ca: 40, vitc: 10, k: 500 } }, now);
  K.logChild(s, { date: '2026-11-26', meal: 'breakfast', offered: 'Egg & banana', ate: 'Most of it' }, now);

  const meDay = K.dailyNutrition(s, 'me', '2026-11-26', { range: 'day' });
  assert.strictEqual(meDay.totals.kcal, 380);
  assert.strictEqual(meDay.totals.pro, 28);
  const me7d = K.dailyNutrition(s, 'me', '2026-11-26', { range: '7d' });
  assert.strictEqual(me7d.days, 2, 'averages over logged days only');
  assert.strictEqual(me7d.totals.kcal, 500, '(380 + 620) / 2');

  const chDay = K.dailyNutrition(s, 'child', '2026-11-26', { range: 'day' });
  assert.strictEqual(chDay.entries, 1);
  assert.ok(chDay.totals.kcal > 0 && chDay.bars.length === CN.NUTRI_KEYS.length);

  K.setTargets(s, 'me', { kcal: 2500, pro: 150 });
  assert.strictEqual(K.dailyNutrition(s, 'me', '2026-11-26').targets.kcal, 2500);
  const v = K.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.customFoods.length, 1, 'validate keeps customFoods');
  assert.strictEqual(v.targets.me.kcal, 2500, 'validate keeps custom targets');
  assert.strictEqual(K.removeCustomFood(v, cf.id), true);
  K.resetTargets(v, 'me');
  assert.strictEqual(K.dailyNutrition(v, 'me', '2026-11-26').targets.kcal, CN.DEFAULT_TARGETS.me.kcal);
  const vClean = K.validate(JSON.parse(JSON.stringify(v)));
  assert.strictEqual(vClean.customFoods, undefined, 'empty customFoods omitted from saved state');
  assert.strictEqual(vClean.targets, undefined, 'default targets omitted from saved state');
});
console.log(n + ' cook unit tests passed');
