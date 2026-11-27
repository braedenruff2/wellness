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
  const no = [['peanut butter', 'butter'], ['chicken broth', 'chicken'], ['tomato sauce', 'tomato'], ['sweet potato', 'potatoes'], ['oat milk', 'milk'], ['rice noodles', 'rice'], ['cream cheese', 'cheese'], ['egg noodles', 'eggs'], ['carrots', 'car']];
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
    if (r.ingredients.some((i) => /tuna/.test(i.name))) assert.ok(r.ingredients.some((i) => /light tuna/.test(i.name)), r.id + ': light tuna');
    if (r.ingredients.some((i) => /broth|stock/.test(i.name))) assert.ok(r.ingredients.some((i) => /low-sodium/.test(i.name)), r.id + ': low-sodium broth');
  }
});
console.log(n + ' cook unit tests passed');
