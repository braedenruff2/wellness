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

console.log(n + ' cook unit tests passed');
