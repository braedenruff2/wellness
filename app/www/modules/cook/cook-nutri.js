/* Offline food database, Cronometer-style daily nutrient target guides, and text-to-nutrition estimator.
   Pure logic (no DOM). Loaded before cook-core.js in index.html and required by cook-core.js in Node.
   Values are rough USDA-based everyday estimates for general fitness/cooking guidance only —
   never medical or paediatric nutrition advice. */
(function (root) {
  'use strict';

  var NUTRI_KEYS = ['kcal', 'pro', 'carb', 'fat', 'fib', 'iron', 'ca', 'vitc', 'k'];
  var NUTRI_META = {
    kcal: { label: 'Energy', unit: 'kcal', dec: 0 },
    pro:  { label: 'Protein', unit: 'g', dec: 0 },
    carb: { label: 'Carbs', unit: 'g', dec: 0 },
    fat:  { label: 'Fat', unit: 'g', dec: 0 },
    fib:  { label: 'Fibre', unit: 'g', dec: 0 },
    iron: { label: 'Iron', unit: 'mg', dec: 1 },
    ca:   { label: 'Calcium', unit: 'mg', dec: 0 },
    vitc: { label: 'Vitamin C', unit: 'mg', dec: 0 },
    k:    { label: 'Potassium', unit: 'mg', dec: 0 }
  };

  /* General everyday reference targets (editable by the user; not medical or paediatric advice).
     Child defaults follow broad 1–3 year general dietary reference guides (DRI) as a rough overview only. */
  var DEFAULT_TARGETS = {
    me:    { kcal: 2200, pro: 120, carb: 250, fat: 70, fib: 30, iron: 8, ca: 1000, vitc: 90, k: 3400 },
    child: { kcal: 900,  pro: 13,  carb: 130, fat: 35, fib: 14, iron: 7, ca: 700,  vitc: 15, k: 2000 }
  };

  var PORTION_SCALE = { Small: 0.75, Regular: 1, Large: 1.35 };
  var CHILD_ATE_SCALE = {
    'Refused / none': 0,
    'A few bites': 0.2,
    'About half': 0.5,
    'Most of it': 0.75,
    'All + more': 1
  };
  var CHILD_PORTION_BASE = 0.35; // rough toddler portion relative to one standard adult serving

  var FOOD_CATS = [
    ['common', 'Everyday'],
    ['filipino', 'Filipino'],
    ['protein', 'Proteins'],
    ['dairy', 'Dairy & grains'],
    ['produce', 'Fruit & veg']
  ];

  /* Compact everyday food table: 1 standard adult serving (rough USDA-based estimates).
     [id, name, cat, serving, kcal, pro, carb, fat, fib, iron, ca, vitc, k, aliases] */
  var RAW_FOODS = [
    // Everyday / Breakfast / Dairy & grains
    ['egg', 'Egg', 'common', '1 large egg', 72, 6.3, 0.4, 5, 0, 0.9, 28, 0, 69, ['eggs', 'scrambled egg', 'boiled egg', 'fried egg', 'omelette']],
    ['oatmeal', 'Oatmeal (cooked)', 'common', '1 cup', 158, 6, 27, 3.2, 4, 2.1, 21, 0, 164, ['rolled oats', 'oats', 'porridge']],
    ['yogurt', 'Greek yogurt (plain)', 'common', '3/4 cup', 130, 15, 6, 5, 0, 0.1, 187, 0, 240, ['greek yogurt', 'plain yogurt', 'yoghurt']],
    ['milk', 'Whole milk', 'dairy', '1 cup', 149, 8, 12, 8, 0, 0.1, 276, 0, 322, ['cow milk', 'dairy milk']],
    ['oatmilk', 'Fortified oat/soy milk', 'dairy', '1 cup', 110, 5, 14, 3.5, 2, 0.6, 300, 0, 320, ['oat milk', 'soy milk', 'almond milk']],
    ['cheese', 'Cheddar / mozzarella cheese', 'dairy', '30 g', 115, 7, 0.5, 9.5, 0, 0.2, 200, 0, 28, ['cheddar', 'mozzarella', 'shredded cheese']],
    ['cottage', 'Cottage cheese', 'dairy', '1/2 cup', 110, 14, 4, 4.5, 0, 0.1, 95, 0, 120, ['cottage']],
    ['toast', 'Whole-grain bread / toast', 'common', '1 slice', 82, 4, 14, 1.1, 2, 0.7, 30, 0, 70, ['bread', 'whole wheat bread', 'sourdough']],
    ['rice', 'Cooked rice', 'common', '1 cup', 205, 4.3, 45, 0.4, 0.6, 1.9, 16, 0, 55, ['white rice', 'jasmine rice', 'brown rice', 'steamed rice']],
    ['pasta', 'Cooked pasta', 'dairy', '1 cup', 220, 8, 43, 1.3, 2.5, 1.8, 10, 0, 62, ['spaghetti', 'macaroni', 'noodles', 'penne']],
    ['tortilla', 'Flour / corn tortilla', 'dairy', '1 medium', 140, 3.5, 24, 3.5, 1.5, 1.4, 45, 0, 60, ['wrap', 'wraps']],
    ['pb', 'Peanut butter', 'common', '1 tbsp', 94, 4, 3.2, 8, 1, 0.3, 8, 0, 104, ['almond butter', 'nut butter']],
    ['butter', 'Butter / olive oil', 'dairy', '1 tsp', 36, 0, 0, 4, 0, 0, 1, 0, 1, ['olive oil', 'oil']],
    ['crackers', 'Whole-grain crackers', 'dairy', '6 crackers', 120, 3, 20, 3.5, 2, 0.8, 25, 0, 65, ['cracker', 'goldfish', 'puffs']],
    ['hummus', 'Hummus', 'dairy', '2 tbsp', 70, 2.4, 6, 4.2, 1.8, 0.7, 15, 0, 75, ['chickpea dip']],

    // Proteins
    ['chicken', 'Chicken (breast / thigh)', 'protein', '120 g cooked', 210, 34, 0, 7.5, 0, 1.2, 16, 0, 310, ['chicken breast', 'chicken thigh', 'chicken thighs', 'roast chicken', 'manok']],
    ['salmon', 'Baked salmon', 'protein', '120 g cooked', 248, 26, 0, 15, 0, 0.9, 18, 0, 490, ['fish', 'trout', 'baked fish']],
    ['tuna', 'Canned light tuna', 'protein', '100 g drained', 116, 25.5, 0, 0.8, 0, 1.5, 11, 0, 237, ['light tuna', 'tuna salad']],
    ['beef', 'Ground beef / lean steak', 'protein', '120 g cooked', 260, 30, 0, 15, 0, 3.1, 20, 0, 380, ['ground beef', 'steak', 'beef patty', 'meatballs']],
    ['pork', 'Pork (tenderloin / shoulder)', 'protein', '120 g cooked', 235, 28, 0, 13, 0, 1.2, 18, 0, 420, ['baboy', 'pork chop', 'pork belly']],
    ['tofu', 'Firm tofu', 'protein', '100 g', 144, 15.8, 3, 8.7, 2.3, 2.7, 350, 0, 237, ['bean curd']],
    ['lentils', 'Cooked lentils', 'protein', '1 cup', 230, 18, 40, 0.8, 15.6, 6.6, 38, 3, 731, ['lentil', 'lentil soup', 'red lentils', 'daal']],
    ['beans', 'Black / kidney beans', 'protein', '1 cup', 225, 15, 41, 0.9, 15, 3.6, 46, 0, 611, ['black beans', 'chickpeas', 'kidney beans']],
    ['shake', 'Protein shake (1 scoop)', 'protein', '1 scoop', 130, 25, 3, 2, 0.5, 0.5, 120, 0, 180, ['whey', 'protein powder', 'smoothie']],

    // Filipino family dishes (1 generous home bowl/plate serving)
    ['tinola', 'Tinolang manok (chicken ginger soup)', 'filipino', '1 bowl', 310, 32, 14, 13, 2.5, 2.4, 75, 28, 620, ['chicken tinola', 'tinolang manok']],
    ['adobo', 'Chicken adobo', 'filipino', '1 serving', 390, 34, 8, 24, 0.5, 2.0, 28, 2, 410, ['pork adobo', 'adobong manok']],
    ['sinigang', 'Sinigang na baboy (tamarind soup)', 'filipino', '1 bowl', 360, 27, 16, 20, 3.5, 2.5, 85, 35, 680, ['sinigang na baboy', 'pork sinigang', 'sinigang']],
    ['monggo', 'Ginisang monggo (mung bean stew)', 'filipino', '1 bowl', 290, 19, 38, 7, 11, 3.8, 95, 22, 650, ['munggo', 'mung bean', 'ginisang monggo']],
    ['arrozcaldo', 'Arroz caldo (chicken rice porridge)', 'filipino', '1 bowl', 340, 24, 42, 8, 1.5, 2.2, 40, 4, 380, ['arroz caldo', 'lugaw', 'congee']],
    ['pancit', 'Pancit bihon (rice noodles & chicken)', 'filipino', '1 plate', 380, 22, 52, 9, 3.5, 2.1, 55, 25, 420, ['pancit bihon', 'pancit canton', 'bihon']],
    ['longganisa', 'Silog / tocino / longganisa plate', 'filipino', '1 plate', 490, 22, 52, 21, 1, 2.2, 45, 2, 320, ['tapsilog', 'tocilog', 'tocino', 'tapa']],
    ['kaldereta', 'Beef kaldereta / mechado', 'filipino', '1 bowl', 420, 30, 20, 24, 3, 3.5, 45, 32, 620, ['mechado', 'afritada', 'menudo', 'kare kare', 'bistek']],

    // Fruits & Vegetables
    ['banana', 'Banana', 'common', '1 medium', 105, 1.3, 27, 0.4, 3.1, 0.3, 6, 10, 422, ['bananas', 'mashed banana']],
    ['avocado', 'Avocado', 'common', '1/2 medium', 120, 1.5, 6.4, 11, 5, 0.4, 9, 8, 364, ['mashed avocado', 'guacamole']],
    ['berries', 'Mixed berries / blueberries', 'produce', '1 cup', 70, 1, 17, 0.4, 4.5, 0.5, 18, 32, 160, ['blueberries', 'strawberries', 'raspberries', 'strawberry']],
    ['apple', 'Apple / pear', 'produce', '1 medium', 95, 0.5, 25, 0.3, 4.4, 0.2, 11, 8, 195, ['apples', 'pear', 'applesauce']],
    ['orange', 'Orange / clementine', 'produce', '1 medium', 62, 1.2, 15, 0.2, 3.1, 0.1, 52, 70, 237, ['clementine', 'mandarin', 'tangerine', 'mango', 'kiwi']],
    ['broccoli', 'Broccoli (steamed)', 'produce', '1 cup', 55, 3.7, 11, 0.6, 5.1, 1.0, 62, 101, 457, ['steamed broccoli']],
    ['spinach', 'Spinach (cooked / fresh)', 'produce', '1 cup', 24, 3, 3.7, 0.4, 2.2, 2.7, 100, 18, 420, ['malunggay', 'kale', 'bok choy', 'greens']],
    ['sweetpotato', 'Sweet potato', 'produce', '1 medium', 112, 2, 26, 0.1, 3.9, 0.8, 39, 22, 438, ['sweet potatoes', 'yam', 'mashed sweet potato', 'kamote']],
    ['potato', 'Potato', 'produce', '1 medium', 130, 3, 30, 0.2, 3, 1.1, 15, 20, 620, ['potatoes', 'mashed potato', 'roasted potatoes']],
    ['carrot', 'Carrots', 'produce', '1/2 cup', 27, 0.6, 6.4, 0.1, 1.8, 0.2, 22, 4, 205, ['carrots', 'steamed carrots']],
    ['peas', 'Green peas / green beans', 'produce', '1/2 cup', 62, 4.1, 11, 0.3, 4.4, 1.2, 20, 12, 195, ['frozen peas', 'green beans', 'sitaw']],
    ['tomato', 'Tomato / tomato sauce', 'produce', '1/2 cup', 32, 1.3, 7, 0.2, 1.6, 0.6, 14, 16, 330, ['tomatoes', 'marinara', 'salsa']],
    ['cucumber', 'Cucumber / zucchini', 'produce', '1/2 cup', 12, 0.6, 2.5, 0.1, 0.6, 0.2, 10, 4, 110, ['zucchini', 'sayote', 'squash', 'bell pepper']],
    ['corn', 'Corn / edamame', 'produce', '1/2 cup', 95, 5.5, 16, 2, 3, 1.1, 25, 5, 260, ['edamame', 'sweet corn']]
  ];

  var FOOD_DB = RAW_FOODS.map(function (r) {
    return {
      id: r[0], name: r[1], cat: r[2], serving: r[3],
      nutri: { kcal: r[4], pro: r[5], carb: r[6], fat: r[7], fib: r[8], iron: r[9], ca: r[10], vitc: r[11], k: r[12] },
      aliases: r[13] || []
    };
  });
  var FOOD_BY = {};
  FOOD_DB.forEach(function (f) { FOOD_BY[f.id] = f; });

  /* Recipe-level adult 1-serving nutrition overrides for built-in Cooking recipes. */
  var RECIPE_NUTRI = {
    'eggs-toast':     { kcal: 440, pro: 25, carb: 30, fat: 24, fib: 5, iron: 4.5, ca: 185, vitc: 14, k: 480 },
    'oatmeal-pb':     { kcal: 540, pro: 23, carb: 68, fat: 20, fib: 9, iron: 3.1, ca: 310, vitc: 10, k: 790 },
    'yogurt-bowl':    { kcal: 420, pro: 26, carb: 46, fat: 15, fib: 7, iron: 1.6, ca: 315, vitc: 32, k: 560 },
    'egg-wrap':       { kcal: 495, pro: 27, carb: 31, fat: 29, fib: 6, iron: 3.5, ca: 275, vitc: 8, k: 560 },
    'tuna-rice':      { kcal: 520, pro: 34, carb: 56, fat: 17, fib: 7, iron: 3.8, ca: 65, vitc: 14, k: 780 },
    'chicken-pasta':  { kcal: 560, pro: 38, carb: 64, fat: 16, fib: 8, iron: 4.2, ca: 140, vitc: 82, k: 840 },
    'lentil-soup':    { kcal: 410, pro: 20, carb: 62, fat: 9, fib: 17, iron: 7.4, ca: 110, vitc: 26, k: 980 },
    'beef-burrito':   { kcal: 590, pro: 36, carb: 58, fat: 24, fib: 12, iron: 5.2, ca: 165, vitc: 18, k: 820 },
    'salmon-tray':    { kcal: 540, pro: 32, carb: 46, fat: 25, fib: 9, iron: 3.4, ca: 145, vitc: 105, k: 1380 },
    'chicken-sheet':  { kcal: 520, pro: 36, carb: 44, fat: 22, fib: 7, iron: 2.8, ca: 115, vitc: 95, k: 1180 },
    'beef-stirfry':   { kcal: 560, pro: 34, carb: 58, fat: 21, fib: 6, iron: 4.6, ca: 95, vitc: 92, k: 890 },
    'tofu-curry':     { kcal: 490, pro: 22, carb: 56, fat: 20, fib: 9, iron: 5.5, ca: 410, vitc: 40, k: 860 },
    'chicken-rice':   { kcal: 540, pro: 38, carb: 58, fat: 17, fib: 6, iron: 3.1, ca: 85, vitc: 65, k: 740 },
    'turkey-chili':   { kcal: 480, pro: 34, carb: 52, fat: 14, fib: 14, iron: 5.8, ca: 115, vitc: 32, k: 990 },
    'tinola':         { kcal: 430, pro: 34, carb: 42, fat: 14, fib: 4, iron: 3.6, ca: 95, vitc: 32, k: 680 },
    'arroz-caldo':    { kcal: 420, pro: 28, carb: 48, fat: 12, fib: 2, iron: 2.8, ca: 55, vitc: 6, k: 460 },
    'monggo':         { kcal: 440, pro: 25, carb: 64, fat: 9, fib: 12, iron: 5.2, ca: 115, vitc: 26, k: 720 },
    'sinigang':       { kcal: 480, pro: 30, carb: 48, fat: 19, fib: 5, iron: 3.6, ca: 105, vitc: 38, k: 740 },
    'adobo':          { kcal: 560, pro: 36, carb: 48, fat: 24, fib: 2, iron: 3.5, ca: 45, vitc: 4, k: 470 },
    'pancit':         { kcal: 430, pro: 24, carb: 56, fat: 11, fib: 4.5, iron: 2.6, ca: 68, vitc: 30, k: 480 }
  };

  function zeroNutri() {
    var o = {};
    NUTRI_KEYS.forEach(function (k) { o[k] = 0; });
    return o;
  }

  function cleanNutri(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var o = {}, any = false;
    NUTRI_KEYS.forEach(function (k) {
      var v = +obj[k];
      if (isFinite(v) && v >= 0) {
        o[k] = k === 'iron' ? Math.min(200, Math.round(v * 10) / 10) : Math.min(20000, Math.round(v));
        if (o[k] > 0) any = true;
      } else o[k] = 0;
    });
    return any ? o : null;
  }

  function addNutri(dst, src, mult) {
    if (!src) return dst;
    mult = mult == null ? 1 : mult;
    NUTRI_KEYS.forEach(function (k) {
      var v = +src[k];
      if (isFinite(v) && v > 0) dst[k] = (dst[k] || 0) + v * mult;
    });
    return dst;
  }

  function roundNutri(o) {
    var out = {};
    NUTRI_KEYS.forEach(function (k) {
      var v = +(o && o[k]) || 0;
      out[k] = k === 'iron' ? Math.round(v * 10) / 10 : Math.round(v);
    });
    return out;
  }

  function cleanTargets(raw, who) {
    var def = DEFAULT_TARGETS[who] || DEFAULT_TARGETS.me;
    var out = Object.assign({}, def);
    if (!raw || typeof raw !== 'object') return out;
    NUTRI_KEYS.forEach(function (k) {
      var v = +raw[k];
      if (isFinite(v) && v > 0) {
        out[k] = k === 'iron' ? Math.min(100, Math.round(v * 10) / 10) : Math.min(15000, Math.round(v));
      }
    });
    return out;
  }

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Build sorted match patterns (longest phrase first) for FOOD_DB + optional user customFoods. */
  function buildPatterns(customFoods) {
    var list = [];
    (Array.isArray(customFoods) ? customFoods : []).forEach(function (cf) {
      if (!cf || !cf.name || !cf.nutri) return;
      var k = String(cf.name).toLowerCase().trim();
      if (k.length >= 2) list.push({ phrase: k, id: 'custom:' + cf.id, nutri: cf.nutri });
    });
    FOOD_DB.forEach(function (f) {
      var phrases = [f.name.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim(), f.id].concat(f.aliases);
      phrases.forEach(function (p) {
        var k = String(p || '').toLowerCase().trim();
        if (k.length >= 3) list.push({ phrase: k, id: f.id, nutri: f.nutri });
      });
    });
    list.sort(function (a, b) { return b.phrase.length - a.phrase.length; });
    return list;
  }

  /* Estimate multiplier immediately before a matched food phrase (e.g. "2 eggs", "half avocado", "1.5 cups rice"). */
  function countBefore(text, idx) {
    var pre = text.slice(Math.max(0, idx - 18), idx).trim();
    if (/\b(?:half|1\/2)\s*(?:an?|of)?$/i.test(pre)) return 0.5;
    if (/\b(?:quarter|1\/4)\s*(?:an?|of)?$/i.test(pre)) return 0.25;
    var m = /(?:^|[\s,+&(])(\d+(?:\.\d+)?)\s*(?:x|×|pcs?|pieces?|slices?|cups?|tbsp|scoops?|bowls?)?$/i.exec(pre);
    if (m) {
      var n = parseFloat(m[1]);
      if (isFinite(n) && n > 0 && n <= 8) return n;
    }
    return 1;
  }

  /* Estimate nutrition from a logged meal entry (or plain text). Returns { nutri, matched }. */
  function estimateEntry(entry, customFoods, recipes) {
    if (!entry || typeof entry !== 'object') return { nutri: zeroNutri(), matched: false };
    var scale = entry.who === 'child'
      ? (CHILD_ATE_SCALE[entry.ate] != null ? CHILD_ATE_SCALE[entry.ate] : 0.5)
      : (PORTION_SCALE[entry.portion] || 1);

    // Explicit nutrition saved on the log (e.g. from Quick-Add Food Picker or custom numbers)
    if (entry.nutri && typeof entry.nutri === 'object') {
      var direct = zeroNutri();
      addNutri(direct, entry.nutri, entry.who === 'child' ? scale : 1);
      return { nutri: direct, matched: true };
    }

    // Recipe ID directly attached to the log
    if (entry.recipeId && RECIPE_NUTRI[entry.recipeId]) {
      var rn = zeroNutri();
      addNutri(rn, RECIPE_NUTRI[entry.recipeId], entry.who === 'child' ? scale * CHILD_PORTION_BASE : scale);
      return { nutri: rn, matched: true };
    }

    var rawText = String(entry.who === 'child' ? entry.offered : entry.text || '').toLowerCase();
    if (!rawText.trim()) return { nutri: zeroNutri(), matched: false };

    // Check if the text exactly matches a built-in recipe title
    if (Array.isArray(recipes)) {
      for (var ri = 0; ri < recipes.length; ri++) {
        var r = recipes[ri];
        if (r && r.title && RECIPE_NUTRI[r.id] && rawText.indexOf(r.title.toLowerCase()) >= 0) {
          var rOut = zeroNutri();
          addNutri(rOut, RECIPE_NUTRI[r.id], entry.who === 'child' ? scale * CHILD_PORTION_BASE : scale);
          return { nutri: rOut, matched: true };
        }
      }
    }

    var patterns = buildPatterns(customFoods);
    var work = rawText;
    var tot = zeroNutri(), seenIds = {}, matched = 0;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (seenIds[p.id]) continue;
      var re = new RegExp('(?:^|[^a-z])(' + escRe(p.phrase) + ')(?:$|[^a-z])', 'i');
      var m = re.exec(work);
      if (m) {
        seenIds[p.id] = 1;
        matched++;
        var phraseIdx = m.index + (m[0].length - m[1].length - (m[0].slice(-1) !== m[1].slice(-1) ? 1 : 0));
        var mult = countBefore(work, phraseIdx);
        addNutri(tot, p.nutri, mult);
        // Blank matched span so sub-phrases (like "butter" inside "peanut butter") never double-count
        work = work.slice(0, m.index) + ' '.repeat(m[0].length) + work.slice(m.index + m[0].length);
      }
    }
    if (!matched) return { nutri: zeroNutri(), matched: false };
    var finalScale = entry.who === 'child' ? scale * CHILD_PORTION_BASE : scale;
    var out = zeroNutri();
    addNutri(out, tot, finalScale);
    return { nutri: out, matched: true };
  }

  /* Aggregate daily (or 7-day average) Cronometer-style nutrient progress for 'me' or 'child'. */
  function dailyNutrition(state, who, dateIso, opts) {
    opts = opts || {};
    who = who === 'child' ? 'child' : 'me';
    var range = opts.range === '7d' ? '7d' : 'day';
    var addDays = opts.addDays;
    var fromIso = range === '7d' && addDays ? addDays(dateIso, -6) : dateIso;
    var logs = (state && Array.isArray(state.logs) ? state.logs : []).filter(function (x) {
      return x && x.who === who && x.date >= fromIso && x.date <= dateIso;
    });
    var targets = cleanTargets(state && state.targets && state.targets[who], who);
    var totals = zeroNutri(), daysSeen = {}, matchedCount = 0, unmatchedCount = 0;
    logs.forEach(function (entry) {
      daysSeen[entry.date] = 1;
      var est = estimateEntry(entry, state && state.customFoods, opts.recipes);
      if (est.matched) {
        matchedCount++;
        addNutri(totals, est.nutri, 1);
      } else {
        unmatchedCount++;
      }
    });
    var dayCount = Math.max(1, Object.keys(daysSeen).length);
    var divisor = range === '7d' ? dayCount : 1;
    var avg = zeroNutri();
    addNutri(avg, totals, 1 / divisor);
    var rounded = roundNutri(avg);
    var bars = NUTRI_KEYS.map(function (k) {
      var val = rounded[k], tgt = targets[k];
      var pct = tgt > 0 ? Math.round(100 * val / tgt) : 0;
      return { key: k, label: NUTRI_META[k].label, unit: NUTRI_META[k].unit, val: val, target: tgt, pct: pct };
    });
    return {
      who: who, range: range, date: dateIso,
      entries: logs.length, days: Object.keys(daysSeen).length,
      matched: matchedCount, unmatched: unmatchedCount,
      totals: rounded, targets: targets, bars: bars
    };
  }

  function searchFoods(query, cat, customFoods) {
    var q = String(query || '').trim().toLowerCase();
    var customs = (Array.isArray(customFoods) ? customFoods : []).map(function (c) {
      return { id: 'custom:' + c.id, name: c.name, cat: 'custom', serving: c.serving || '1 serving', nutri: c.nutri, aliases: [] };
    });
    var pool = customs.concat(FOOD_DB);
    return pool.filter(function (f) {
      if (cat && cat !== 'all' && f.cat !== cat) return false;
      if (!q) return true;
      if (f.name.toLowerCase().indexOf(q) >= 0) return true;
      return (f.aliases || []).some(function (a) { return a.toLowerCase().indexOf(q) >= 0; });
    });
  }

  var api = {
    NUTRI_KEYS: NUTRI_KEYS, NUTRI_META: NUTRI_META, DEFAULT_TARGETS: DEFAULT_TARGETS,
    PORTION_SCALE: PORTION_SCALE, CHILD_ATE_SCALE: CHILD_ATE_SCALE, CHILD_PORTION_BASE: CHILD_PORTION_BASE,
    FOOD_CATS: FOOD_CATS, FOOD_DB: FOOD_DB, FOOD_BY: FOOD_BY, RECIPE_NUTRI: RECIPE_NUTRI,
    zeroNutri: zeroNutri, cleanNutri: cleanNutri, addNutri: addNutri, roundNutri: roundNutri,
    cleanTargets: cleanTargets, estimateEntry: estimateEntry, dailyNutrition: dailyNutrition, searchFoods: searchFoods
  };
  root.CookNutri = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
