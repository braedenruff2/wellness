/* Cooking & family nutrition logic (no DOM). Storage key: 'wl.cook.v1'.
   Built for a beginner cook with a baby nearby and another family member who sometimes cooks too:
   - Offline-first beginner recipe library & 7-day meal plan (boosts expiring fridge items & Move workout days)
   - Flexible daily slots: Planned / Made it ✓ (auto-deducts pantry) / Mama cooked / Custom
   - Food logs for both him (what he ate + rough portion/tags) and {child} (Offered vs. Actually ate)
   - Fridge/pantry with spoilage urgency ("Use soon") + auto shopping list + photo-scan merge.
   General everyday food & fitness guidance only — never medical or paediatric nutrition advice. */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');
  var CN = root.CookNutri || (typeof require === 'function' ? require('./cook-nutri.js') : null);
  var iso = WLD.iso, addDays = WLD.addDays, isDate = WLD.isDate;

  var MEALS = ['breakfast', 'lunch', 'dinner'];
  var ALL_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  var MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  var PORTIONS = ['Small', 'Regular', 'Large'];
  var ME_TAGS = ['High protein', 'Veggies', 'Workout fuel', 'Mama cooked'];
  var CHILD_ATE = ['Refused / none', 'A few bites', 'About half', 'Most of it', 'All + more'];
  var CATS = ['produce', 'meat', 'dairy', 'pantry', 'frozen'];
  var CAT_LABEL = { produce: 'Produce', meat: 'Meat & protein', dairy: 'Dairy & eggs', pantry: 'Pantry & grains', frozen: 'Frozen' };
  var STATUS = ['plenty', 'low', 'out'];

  /* Default shelf life in days when an item is added or bought without a specific expiry date. */
  var DEFAULT_SHELF = {
    spinach: 4, lettuce: 5, berries: 4, avocado: 4, banana: 5, broccoli: 5, tomato: 5, cucumber: 6,
    mushroom: 4, cilantro: 5, 'green onion': 6, carrot: 14, onion: 21, garlic: 21, potato: 14, 'sweet potato': 14,
    chicken: 3, beef: 3, pork: 3, salmon: 2, fish: 2, shrimp: 2, tofu: 6,
    milk: 7, yogurt: 10, cheese: 14, eggs: 21, butter: 30, bread: 5, tortilla: 14
  };
  var CAT_SHELF = { produce: 5, meat: 3, dairy: 10, pantry: 90, frozen: 90 };

  function guessShelfDays(name, cat) {
    var s = String(name || '').toLowerCase();
    for (var k in DEFAULT_SHELF) if (s.indexOf(k) >= 0) return DEFAULT_SHELF[k];
    return CAT_SHELF[cat] || 14;
  }

  /* Beginner-friendly everyday recipes (general nutrition only, no medical claims).
     Uses {child} placeholder so personal names stay strictly on the phone via WLPersonal. */
  var RECIPES = [
    {
      id: 'eggs-toast', title: 'Soft scrambled eggs, spinach & toast', meal: 'breakfast', mins: 10, effort: 'quick',
      protein: '~24 g protein', workoutFit: true,
      babyNote: 'Scramble a plain portion for {child} until the egg is cooked through (no runny bits), with finely chopped wilted spinach, before adding salt; serve warm with soft toast strips.',
      tip: 'Use medium-low heat and stir slowly. Take {child}’s portion when it is fully set; yours can come off the heat while it still looks slightly glossy.',
      ingredients: [
        { name: 'eggs', qty: 3, unit: 'pcs', cat: 'dairy', shelfDays: 21 },
        { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'bread', qty: 2, unit: 'slices', cat: 'pantry', shelfDays: 5 },
        { name: 'butter', qty: 1, unit: 'tbsp', cat: 'dairy', shelfDays: 30 }
      ],
      steps: [
        'Crack 3 eggs into a bowl, add a splash of water or milk, and beat with a fork until smooth.',
        'Put the toast in the toaster. Melt butter in a non-stick pan over medium-low heat.',
        'Toss in the spinach for 45 seconds until wilted, then pour in the eggs.',
        'Push gently from the edges toward the centre with a spatula for 2–3 minutes until softly set.',
        'Pull out {child}’s unsalted portion first, then season yours with salt and pepper.'
      ]
    },
    {
      id: 'oatmeal-pb', title: 'Warm protein oatmeal with banana & peanut butter', meal: 'breakfast', mins: 8, effort: 'quick',
      protein: '~22 g protein', workoutFit: true,
      babyNote: 'Thin {child}’s bowl with extra milk or water and swirl in a small amount of smooth peanut butter (never thick globs) plus mashed banana.',
      tip: 'Stir in peanut butter and yogurt after turning off the heat so the oats stay creamy instead of sticky.',
      ingredients: [
        { name: 'rolled oats', qty: 1, unit: 'cup', cat: 'pantry', shelfDays: 180 },
        { name: 'milk', qty: 1.5, unit: 'cups', cat: 'dairy', shelfDays: 7 },
        { name: 'banana', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 5 },
        { name: 'peanut butter', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 120 },
        { name: 'greek yogurt', qty: 0.5, unit: 'cup', cat: 'dairy', shelfDays: 10 }
      ],
      steps: [
        'Combine oats and milk (or half milk, half water) in a small pot over medium heat.',
        'Simmer gently for 5 minutes, stirring now and then so the bottom doesn’t stick.',
        'Slice or mash the banana right in the pot during the last minute.',
        'Turn off heat, scoop {child}’s portion into a cool bowl, and stir peanut butter and Greek yogurt into both.'
      ]
    },
    {
      id: 'yogurt-bowl', title: 'Greek yogurt bowl with berries & oats', meal: 'breakfast', mins: 4, effort: 'quick',
      protein: '~25 g protein', workoutFit: true,
      babyNote: 'Use plain full-fat yogurt and lightly smash or quarter berries for {child} (skip honey if under 12 months).',
      tip: 'No stove needed — great for mornings after a rough night.',
      ingredients: [
        { name: 'greek yogurt', qty: 1.5, unit: 'cups', cat: 'dairy', shelfDays: 10 },
        { name: 'berries', qty: 1, unit: 'cup', cat: 'produce', shelfDays: 4 },
        { name: 'rolled oats', qty: 0.25, unit: 'cup', cat: 'pantry', shelfDays: 180 },
        { name: 'peanut butter', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 120 }
      ],
      steps: [
        'Scoop plain Greek yogurt into a bowl.',
        'Rinse berries and lightly smash a few for {child}.',
        'Top with berries, rolled oats (or granola), and a drizzle of peanut butter.'
      ]
    },
    {
      id: 'egg-wrap', title: 'Quick egg, cheese & avocado wrap', meal: 'breakfast', mins: 10, effort: 'quick',
      protein: '~26 g protein', workoutFit: true,
      babyNote: 'Give {child} scrambled egg cooked until firm, mashed avocado, and small torn pieces of warm tortilla.',
      tip: 'Warm the tortilla for 15 seconds in the pan or microwave so it folds without cracking.',
      ingredients: [
        { name: 'eggs', qty: 3, unit: 'pcs', cat: 'dairy', shelfDays: 21 },
        { name: 'tortilla', qty: 2, unit: 'pcs', cat: 'pantry', shelfDays: 14 },
        { name: 'avocado', qty: 0.5, unit: 'pcs', cat: 'produce', shelfDays: 4 },
        { name: 'cheese', qty: 0.25, unit: 'cup', cat: 'dairy', shelfDays: 14 }
      ],
      steps: [
        'Scramble 3 eggs in a lightly oiled pan over medium-low heat.',
        'Sprinkle grated cheese on top in the last 30 seconds so it melts.',
        'Warm tortillas briefly, mash avocado down the centre, add eggs, and roll up.'
      ]
    },
    {
      id: 'tuna-rice', title: '10-minute tuna, avocado & cucumber rice bowl', meal: 'lunch', mins: 10, effort: 'quick',
      protein: '~34 g protein', workoutFit: true,
      babyNote: 'Mix plain drained light tuna with mashed avocado and soft rice for {child} before adding soy sauce or mayo; peel the cucumber and cut hers into thin strips or tiny dice.',
      tip: 'Use leftover cooked rice (warm it with a splash of water covered for 60 seconds so it steams soft again).',
      ingredients: [
        { name: 'canned tuna', qty: 2, unit: 'cans', cat: 'pantry', shelfDays: 365 },
        { name: 'rice', qty: 1.5, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'avocado', qty: 0.5, unit: 'pcs', cat: 'produce', shelfDays: 4 },
        { name: 'cucumber', qty: 0.5, unit: 'pcs', cat: 'produce', shelfDays: 6 },
        { name: 'soy sauce', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Warm cooked rice in a bowl (or cook rice ahead in a batch).',
        'Drain tuna well and flake it with a fork. Dice cucumber and slice avocado.',
        'Set aside a small unsalted tuna-avocado-rice scoop for {child}.',
        'Top your bowl with soy sauce (and a little mayo or sesame oil if you have it) and mix.'
      ]
    },
    {
      id: 'chicken-wrap', title: 'Easy pan chicken & crunchy veggie wraps', meal: 'lunch', mins: 15, effort: 'easy',
      protein: '~36 g protein', workoutFit: true,
      babyNote: 'Shred a few moist, tender pieces of cooked chicken with mashed avocado or yogurt for {child}.',
      tip: 'Cut chicken into bite-size strips BEFORE cooking — it cooks evenly in 5–6 minutes with no guesswork.',
      ingredients: [
        { name: 'chicken thighs', qty: 300, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'tortilla', qty: 2, unit: 'pcs', cat: 'pantry', shelfDays: 14 },
        { name: 'spinach', qty: 1, unit: 'cup', cat: 'produce', shelfDays: 4 },
        { name: 'tomato', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 5 },
        { name: 'greek yogurt', qty: 2, unit: 'tbsp', cat: 'dairy', shelfDays: 10 }
      ],
      steps: [
        'Slice chicken into thin strips and pat dry with a paper towel. Toss with garlic powder and pepper.',
        'Heat 1 tbsp oil in a pan over medium-high heat until shimmering (~2 min).',
        'Cook chicken strips 5–7 minutes, turning once, until golden and completely white inside (no pink).',
        'Spread Greek yogurt on warm tortillas, add spinach, diced tomato, and chicken, then roll up.'
      ]
    },
    {
      id: 'lentil-soup', title: 'One-pot red lentil & carrot soup', meal: 'lunch', mins: 25, effort: 'batch',
      protein: '~22 g protein', workoutFit: false,
      babyNote: 'Naturally soft and easy to spoon or dip toast into — pull out {child}’s bowl before final salting.',
      tip: 'Red lentils break down on their own in 15 minutes — no soaking and no blender needed. Makes great leftovers.',
      ingredients: [
        { name: 'red lentils', qty: 1, unit: 'cup', cat: 'pantry', shelfDays: 180 },
        { name: 'carrot', qty: 2, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'garlic', qty: 2, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'low-sodium chicken broth', qty: 4, unit: 'cups', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Rinse lentils under cold water until the water runs mostly clear. Dice onion, carrots, and garlic.',
        'Heat 1 tbsp oil in a pot over medium heat. Cook onion and carrots 4 minutes until softened, then add garlic for 30 seconds.',
        'Add lentils and low-sodium broth (or water; regular broth is salty for {child}), bring to a boil, then lower to a gentle simmer for 15–18 minutes until thick and soft.',
        'Scoop {child}’s portion first, then season yours with salt, pepper, and a squeeze of lemon if handy.'
      ]
    },
    {
      id: 'egg-fried-rice', title: 'Quick veggie & egg fried rice', meal: 'lunch', mins: 15, effort: 'easy',
      protein: '~24 g protein', workoutFit: true,
      babyNote: 'Scoop out a soft egg-and-veggie rice portion for {child} before adding soy sauce.',
      tip: 'Cold day-old rice fries best because the grains stay separate instead of clumping.',
      ingredients: [
        { name: 'rice', qty: 2, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'eggs', qty: 3, unit: 'pcs', cat: 'dairy', shelfDays: 21 },
        { name: 'frozen peas', qty: 1, unit: 'cup', cat: 'frozen', shelfDays: 90 },
        { name: 'carrot', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'soy sauce', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Finely dice carrot. Heat 1 tbsp oil in a wide pan over medium-high heat and cook carrot + peas 3 minutes.',
        'Push veggies to one side, crack eggs into the empty side, and scramble until just set.',
        'Add rice and stir everything together for 3–4 minutes until hot.',
        'Take out {child}’s portion, then drizzle soy sauce around the hot pan edges and toss.'
      ]
    },
    {
      id: 'sheet-chicken', title: 'Sheet-pan garlic chicken, broccoli & sweet potato', meal: 'dinner', mins: 35, effort: 'easy',
      protein: '~42 g protein', workoutFit: true,
      babyNote: 'Roast a few extra-soft sweet potato strips and broccoli florets on one corner with just olive oil (no salt) for {child}.',
      tip: 'Line the tray with parchment paper for 10-second cleanup, and cut sweet potatoes into small even cubes so everything finishes together.',
      ingredients: [
        { name: 'chicken thighs', qty: 500, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'broccoli', qty: 1, unit: 'head', cat: 'produce', shelfDays: 5 },
        { name: 'sweet potato', qty: 2, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'olive oil', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Heat oven to 400°F (200°C). Line a baking sheet with parchment.',
        'Cut sweet potatoes into 1-inch cubes and broccoli into bite-size florets. Toss with olive oil and minced garlic.',
        'Put chicken thighs and sweet potatoes on the tray (keep an unsalted corner for {child}). Roast 15 minutes.',
        'Add broccoli to the tray and roast another 15 minutes until chicken is golden and cooked through (no pink, juices clear) and sweet potato is fork-tender.'
      ]
    },
    {
      id: 'beef-broccoli', title: 'One-pan ground beef, broccoli & rice', meal: 'dinner', mins: 20, effort: 'quick',
      protein: '~40 g protein', workoutFit: true,
      babyNote: 'Set aside soft steamed broccoli florets and finely crumbled unsalted beef + rice for {child} before adding soy sauce.',
      tip: 'Let ground beef sit undisturbed in the hot pan for 2 minutes before breaking it up so it gets tasty browned edges.',
      ingredients: [
        { name: 'ground beef', qty: 450, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'broccoli', qty: 1, unit: 'head', cat: 'produce', shelfDays: 5 },
        { name: 'rice', qty: 1.5, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'soy sauce', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Start rice in a pot or rice cooker first (1 cup rice + 1.5–2 cups water).',
        'Brown ground beef in a large skillet over medium-high heat for 6–7 minutes, breaking it into small crumbles. Spoon off excess grease.',
        'Add minced garlic, chopped broccoli, and 3 tbsp water; cover for 3–4 minutes until broccoli is bright green and tender.',
        'Take out {child}’s plain portion, then stir soy sauce (and a touch of ginger or pepper) into the pan and serve over rice.'
      ]
    },
    {
      id: 'salmon-tray', title: '20-minute baked salmon, spinach & potatoes', meal: 'dinner', mins: 25, effort: 'easy',
      protein: '~38 g protein', workoutFit: true,
      babyNote: 'Flake a small piece of plain cooked salmon carefully (double-check for pin bones) with soft mashed potato for {child}.',
      tip: 'Salmon is done the moment it flakes easily with a fork in the thickest part — about 12–14 minutes at 400°F.',
      ingredients: [
        { name: 'salmon', qty: 400, unit: 'g', cat: 'meat', shelfDays: 2 },
        { name: 'potato', qty: 3, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'spinach', qty: 3, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'olive oil', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 },
        { name: 'garlic', qty: 2, unit: 'cloves', cat: 'produce', shelfDays: 21 }
      ],
      steps: [
        'Heat oven to 400°F (200°C). Dice potatoes small, toss with 1 tbsp oil, and roast 12 minutes first.',
        'Place salmon fillets on the tray, rub with olive oil and garlic (leave a plain corner for {child}), and bake 12–14 minutes until flaky.',
        'Wilt spinach in a warm pan with a splash of water for 1 minute right before serving.'
      ]
    },
    {
      id: 'pasta-meat', title: 'Easy turkey or beef tomato pasta with hidden spinach', meal: 'dinner', mins: 25, effort: 'batch',
      protein: '~36 g protein', workoutFit: true,
      babyNote: 'Cook a few pasta pieces 2 minutes extra so they are very soft for {child}, with finely chopped spinach and low-salt tomato sauce.',
      tip: 'Save half a mug of the starchy pasta water before draining — a splash helps the sauce cling smoothly.',
      ingredients: [
        { name: 'pasta', qty: 300, unit: 'g', cat: 'pantry', shelfDays: 365 },
        { name: 'ground beef', qty: 400, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'tomato sauce', qty: 2, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 }
      ],
      steps: [
        'Bring a big pot of water to a boil and cook pasta according to the box (usually 9–11 min).',
        'Meanwhile, brown onion and ground beef in a skillet for 6–7 minutes.',
        'Stir in tomato sauce and chopped spinach; simmer 5 minutes until spinach wilts.',
        'Drain pasta, toss with the sauce, and pull out {child}’s soft portion before adding parmesan or extra salt.'
      ]
    },
    {
      id: 'chicken-stirfry', title: 'Garlic chicken & mushroom rice skillet', meal: 'dinner', mins: 22, effort: 'easy',
      protein: '~38 g protein', workoutFit: true,
      babyNote: 'Finely chop soft cooked mushrooms and tender chicken strips with rice for {child} before adding soy sauce.',
      tip: 'Don’t crowd the mushrooms — give them 4 minutes untouched so they brown instead of getting soggy.',
      ingredients: [
        { name: 'chicken thighs', qty: 450, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'mushroom', qty: 200, unit: 'g', cat: 'produce', shelfDays: 4 },
        { name: 'rice', qty: 1.5, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'soy sauce', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Cook rice first (or use leftover rice). Slice chicken and mushrooms.',
        'Heat 1 tbsp oil over medium-high heat and cook chicken 6 minutes until golden; set aside on a plate.',
        'Cook sliced mushrooms in the same pan 4–5 minutes until browned, then add garlic for 30 seconds.',
        'Return chicken to the pan, pull out {child}’s unsalted scoop, then toss with soy sauce and serve over rice.'
      ]
    },
    {
      id: 'tofu-veggie', title: 'Crispy pan tofu, sweet potato & greens bowl', meal: 'dinner', mins: 25, effort: 'easy',
      protein: '~26 g protein', workoutFit: false,
      babyNote: 'Soft cubes of lightly pan-seared unsalted tofu and mashed sweet potato are easy for {child} to pick up.',
      tip: 'Press tofu gently between paper towels for 2 minutes first — removing surface water makes it crisp right up.',
      ingredients: [
        { name: 'tofu', qty: 350, unit: 'g', cat: 'meat', shelfDays: 6 },
        { name: 'sweet potato', qty: 2, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'rice', qty: 1, unit: 'cup', cat: 'pantry', shelfDays: 180 },
        { name: 'soy sauce', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 180 }
      ],
      steps: [
        'Cube tofu and pat dry. Microwave or boil diced sweet potato 8 minutes until tender.',
        'Pan-fry tofu in 1 tbsp oil over medium heat 3–4 minutes per side until lightly golden.',
        'Toss in spinach for 1 minute to wilt, take out {child}’s plain portion, then finish with soy sauce over rice.'
      ]
    },
    {
      id: 'snack-yogurt', title: 'Greek yogurt, banana & peanut butter', meal: 'snack', mins: 2, effort: 'quick',
      protein: '~18 g protein', workoutFit: true,
      babyNote: 'Serve plain yogurt with mashed banana and a thin swirl of smooth peanut butter for {child}.',
      tip: 'Great post-workout snack when dinner is still an hour away.',
      ingredients: [
        { name: 'greek yogurt', qty: 1, unit: 'cup', cat: 'dairy', shelfDays: 10 },
        { name: 'banana', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 5 },
        { name: 'peanut butter', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 120 }
      ],
      steps: ['Scoop yogurt into a bowl, slice banana on top, and swirl in peanut butter.']
    },
    {
      id: 'snack-eggs', title: 'Hard-boiled eggs & cucumber slices', meal: 'snack', mins: 12, effort: 'batch',
      protein: '~14 g protein', workoutFit: true,
      babyNote: 'Mash boiled egg yolk + white with a little yogurt or avocado for {child} so it isn’t dry; peel her cucumber and cut it into thin strips or tiny dice (round slices are a choking risk).',
      tip: 'Boil 6 eggs at once on Sunday and keep them in the fridge for 5 days of grab-and-go protein.',
      ingredients: [
        { name: 'eggs', qty: 2, unit: 'pcs', cat: 'dairy', shelfDays: 21 },
        { name: 'cucumber', qty: 0.5, unit: 'pcs', cat: 'produce', shelfDays: 6 }
      ],
      steps: [
        'Place eggs in a pot, cover with water, bring to a boil, then turn off heat, cover, and wait 10 minutes.',
        'Run under cold water for 2 minutes so they peel easily; slice cucumber alongside.'
      ]
    },
    // Filipino family dishes (everyday home versions, beginner steps)
    {
      id: 'tinola', title: 'Tinolang manok (chicken & ginger soup)', meal: 'dinner', mins: 35, effort: 'easy', filipino: true,
      words: [{ tl: 'manok', en: 'chicken' }, { tl: 'luya', en: 'ginger' }, { tl: 'sayote', en: 'chayote' }, { tl: 'malunggay', en: 'moringa leaves' }, { tl: 'sabaw', en: 'soup, broth' }, { tl: 'patis', en: 'fish sauce' }],
      protein: '~30 g protein', workoutFit: true,
      babyNote: 'Ladle {child}’s bowl before adding fish sauce: shred her chicken off the bone, mash the soft chayote, and leave out the ginger slices.',
      tip: 'Cook the ginger and garlic until they smell strong before the chicken goes in; that is where the flavour comes from.',
      ingredients: [
        { name: 'chicken thighs', qty: 6, unit: 'pcs', cat: 'meat', shelfDays: 3 },
        { name: 'ginger', qty: 1, unit: 'thumb', cat: 'produce', shelfDays: 21 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'chayote', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'fish sauce', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Slice the ginger into thin coins, dice the onion and crush the garlic. Peel the chayote (sayote) and cut it into wedges.',
        'Heat 1 tbsp oil in a pot over medium heat. Cook ginger, onion and garlic for 2 minutes until they smell strong.',
        'Add the chicken and stir for 5 minutes until the outside turns white.',
        'Pour in 6 cups of water, bring to a boil, then simmer covered for 20 minutes.',
        'Add the chayote and simmer 5–8 minutes until a fork slides in easily. Stir in the spinach (or malunggay leaves) for the last minute.',
        'Take {child}’s portion out first, then season the pot with fish sauce (patis) and pepper to taste.'
      ]
    },
    {
      id: 'arroz-caldo', title: 'Arroz caldo (chicken rice porridge)', meal: 'breakfast', mins: 40, effort: 'batch', filipino: true,
      words: [{ tl: 'lugaw', en: 'rice porridge' }, { tl: 'bigas', en: 'uncooked rice' }, { tl: 'itlog', en: 'egg' }, { tl: 'bawang', en: 'garlic' }, { tl: 'luya', en: 'ginger' }],
      protein: '~22 g protein', workoutFit: false,
      babyNote: 'Arroz caldo is soft enough for {child} as it is: take her bowl before the fish sauce, shred the chicken finely, and pick out the ginger.',
      tip: 'Keep stirring now and then once it thickens so the rice doesn’t stick to the bottom. It thickens more as it cools: add hot water to loosen leftovers.',
      ingredients: [
        { name: 'rice', qty: 1, unit: 'cup', cat: 'pantry', shelfDays: 365 },
        { name: 'chicken thighs', qty: 3, unit: 'pcs', cat: 'meat', shelfDays: 3 },
        { name: 'ginger', qty: 1, unit: 'thumb', cat: 'produce', shelfDays: 21 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'garlic', qty: 4, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'eggs', qty: 2, unit: 'pcs', cat: 'dairy', shelfDays: 21 },
        { name: 'fish sauce', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Hard-boil the eggs (10 minutes in boiling water), then cool and peel them. Rinse the rice once.',
        'Heat 1 tbsp oil in a pot. Cook sliced ginger, diced onion and half the garlic for 2 minutes.',
        'Add the chicken and stir for 5 minutes, then add the rice and stir for 1 minute.',
        'Pour in 7 cups of water, bring to a boil, then simmer on low for 25–30 minutes, stirring now and then, until the rice is soft and thick.',
        'Meanwhile fry the rest of the garlic in a little oil until golden, for the top.',
        'Take {child}’s bowl out, then season the pot with fish sauce. Serve yours with halved eggs and fried garlic on top.'
      ]
    },
    {
      id: 'monggo', title: 'Ginisang monggo (mung bean stew)', meal: 'lunch', mins: 45, effort: 'batch', filipino: true,
      words: [{ tl: 'monggo', en: 'mung beans' }, { tl: 'kamatis', en: 'tomato' }, { tl: 'sibuyas', en: 'onion' }, { tl: 'bawang', en: 'garlic' }, { tl: 'ginisa', en: 'sautéed' }],
      protein: '~20 g protein', workoutFit: true,
      babyNote: 'The beans cook down soft and mashable: take {child}’s portion before the fish sauce and mash it a little with a fork.',
      tip: 'Mung beans need no soaking; they are done when they split open and turn creamy.',
      ingredients: [
        { name: 'mung beans', qty: 1, unit: 'cup', cat: 'pantry', shelfDays: 365 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'tomato', qty: 2, unit: 'pcs', cat: 'produce', shelfDays: 5 },
        { name: 'spinach', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 4 },
        { name: 'fish sauce', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Rinse the mung beans, then simmer them in 5 cups of water for 30–35 minutes until they split and soften.',
        'In a pan, cook diced onion, garlic and chopped tomatoes in 1 tbsp oil for 4 minutes until soft.',
        'Stir the onion mix into the beans and simmer 5 more minutes. Add water if it gets too thick.',
        'Stir in the spinach (or malunggay) for the last minute.',
        'Take {child}’s portion out, then season the pot with fish sauce and pepper.'
      ]
    },
    {
      id: 'sinigang', title: 'Sinigang na baboy (sour pork soup)', meal: 'dinner', mins: 60, effort: 'batch', filipino: true,
      words: [{ tl: 'baboy', en: 'pork' }, { tl: 'maasim', en: 'sour' }, { tl: 'sampalok', en: 'tamarind' }, { tl: 'labanos', en: 'radish' }, { tl: 'sitaw', en: 'string beans' }, { tl: 'kangkong', en: 'water spinach' }],
      protein: '~28 g protein', workoutFit: true,
      babyNote: 'Take out soft pork and radish for {child} before the sour mix and fish sauce go in (the mix is salty), and cut them small.',
      tip: 'Simmer the pork low and slow until it is tender; the vegetables go in only at the end so they stay bright.',
      ingredients: [
        { name: 'pork shoulder', qty: 500, unit: 'g', cat: 'meat', shelfDays: 3 },
        { name: 'tomato', qty: 2, unit: 'pcs', cat: 'produce', shelfDays: 5 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'radish', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 10 },
        { name: 'green beans', qty: 1, unit: 'cup', cat: 'produce', shelfDays: 5 },
        { name: 'kangkong', qty: 1, unit: 'bunch', cat: 'produce', shelfDays: 3 },
        { name: 'tamarind soup mix', qty: 1, unit: 'pack', cat: 'pantry', shelfDays: 365 },
        { name: 'fish sauce', qty: 1, unit: 'tbsp', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Cut the pork into bite-size cubes. Quarter the tomatoes and onion; slice the radish (labanos) into rounds; cut the green beans short.',
        'Put the pork, tomatoes and onion in a pot with 8 cups of water. Bring to a boil and skim off the foam.',
        'Simmer covered on low for 40–45 minutes until the pork is tender.',
        'Add the radish and cook 5 minutes, then the green beans for 3 minutes.',
        'Take {child}’s portion out now. Then stir in the tamarind soup mix, add the kangkong (or spinach) for 1 minute, and season with fish sauce to taste.'
      ]
    },
    {
      id: 'adobo', title: 'Chicken adobo (adobong manok)', meal: 'dinner', mins: 45, effort: 'easy', filipino: true,
      words: [{ tl: 'manok', en: 'chicken' }, { tl: 'toyo', en: 'soy sauce' }, { tl: 'suka', en: 'vinegar' }, { tl: 'dahon ng laurel', en: 'bay leaves' }, { tl: 'paminta', en: 'pepper' }, { tl: 'kanin', en: 'cooked rice' }],
      protein: '~32 g protein', workoutFit: true,
      babyNote: 'Adobo sauce is salty: give {child} a little shredded chicken with plenty of plain rice, and only a spoon of the sauce.',
      tip: 'Let the vinegar boil for a few minutes before you stir it in; it softens the sharp smell.',
      ingredients: [
        { name: 'chicken thighs', qty: 6, unit: 'pcs', cat: 'meat', shelfDays: 3 },
        { name: 'garlic', qty: 6, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'soy sauce', qty: 0.33, unit: 'cup', cat: 'pantry', shelfDays: 365 },
        { name: 'vinegar', qty: 0.33, unit: 'cup', cat: 'pantry', shelfDays: 365 },
        { name: 'bay leaves', qty: 3, unit: 'pcs', cat: 'pantry', shelfDays: 365 },
        { name: 'rice', qty: 1.5, unit: 'cups', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Start the rice. Crush the garlic.',
        'Brown the chicken in 1 tbsp oil, skin side down, for 5 minutes. Add the garlic for 1 minute.',
        'Add the soy sauce, the vinegar, the bay leaves, a few peppercorns or ground pepper, and 1 cup of water. Let it boil 3 minutes without stirring.',
        'Cover and simmer on low for 25–30 minutes, turning the chicken once, until it is cooked through and tender.',
        'Take the lid off and simmer 5 more minutes so the sauce thickens. Take out the bay leaves and serve over rice.'
      ]
    },
    {
      id: 'pancit', title: 'Pancit bihon (rice noodles with chicken & vegetables)', meal: 'lunch', mins: 30, effort: 'easy', filipino: true,
      words: [{ tl: 'bihon', en: 'thin rice noodles' }, { tl: 'repolyo', en: 'cabbage' }, { tl: 'karot', en: 'carrot' }, { tl: 'manok', en: 'chicken' }, { tl: 'kalamansi', en: 'calamansi lime' }],
      protein: '~24 g protein', workoutFit: true,
      babyNote: 'Cut {child}’s noodles short with kitchen scissors (long noodles are hard for her to manage) and take her portion before the last soy sauce.',
      tip: 'Soak the noodles in warm water first; in the pan they only need to drink up the broth.',
      ingredients: [
        { name: 'rice noodles', qty: 250, unit: 'g', cat: 'pantry', shelfDays: 365 },
        { name: 'chicken thighs', qty: 2, unit: 'pcs', cat: 'meat', shelfDays: 3 },
        { name: 'cabbage', qty: 2, unit: 'cups', cat: 'produce', shelfDays: 14 },
        { name: 'carrot', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 14 },
        { name: 'onion', qty: 1, unit: 'pcs', cat: 'produce', shelfDays: 21 },
        { name: 'garlic', qty: 3, unit: 'cloves', cat: 'produce', shelfDays: 21 },
        { name: 'low-sodium chicken broth', qty: 2, unit: 'cups', cat: 'pantry', shelfDays: 180 },
        { name: 'soy sauce', qty: 2, unit: 'tbsp', cat: 'pantry', shelfDays: 365 }
      ],
      steps: [
        'Soak the rice noodles (bihon) in warm water for 10 minutes, then drain. Slice the chicken thin; shred the cabbage; cut the carrot into thin sticks.',
        'Cook onion and garlic in 1 tbsp oil for 2 minutes, add the chicken and cook 5 minutes until white all through.',
        'Add the carrot and cabbage and stir for 2 minutes.',
        'Pour in the broth and 1 tbsp soy sauce, bring to a boil, then add the noodles and toss for 3–4 minutes until the liquid is soaked up.',
        'Take {child}’s portion out, then season the rest with the last soy sauce and a squeeze of calamansi or lemon.'
      ]
    }
  ];

  var RECIPE_BY = {};
  RECIPES.forEach(function (r) { RECIPE_BY[r.id] = r; });
  var SOUP_IDS = ['tinola', 'arroz-caldo', 'lentil-soup'];
  var SOUP_SHORT = { 'tinola': 'Tinola soup', 'arroz-caldo': 'Arroz caldo', 'lentil-soup': 'Red lentil soup' };

  function defaults() {
    return {
      pantry: [],      // {id, name, qty, unit, status:'plenty'|'low'|'out', expires:YYYY-MM-DD|null, cat, added, updated}
      plan: { week: null, days: {}, note: '', source: 'offline', updated: null },
      bought: {},      // weekKey -> { normName: true }
      logs: [],        // {id, at, date, who:'me'|'child', meal, text, portion?, tags?, offered?, ate?, note?}
      aiRecipes: {},   // id -> {id, title, meal, mins, protein, babyNote, tip, ingredients, steps}
      lastPhoto: null  // {at, summary, items:[...]}
    };
  }

  var idSeq = 0;
  function newId(pfx, now) { return (pfx || 'c') + (now ? now.getTime() : Date.now()).toString(36) + '-' + (++idSeq); }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function stem(s) {
    var w = norm(s);
    if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
    if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }
  var CUTS = ['thighs', 'breasts', 'drumsticks', 'wings', 'legs', 'fillets', 'mince', 'strips', 'pieces', 'chunks', 'cubes', 'florets', 'leaves', 'slices', 'steaks', 'boneless', 'skinless', 'cloves', 'bulbs', 'heads', 'cans', 'tins', 'jars', 'packs', 'bags', 'bunches', 'shoulder', 'belly', 'loin', 'tenderloin', 'chops', 'ribs'].map(stem);
  // a word before a food that makes it a different food: peanut butter, sweet potato, oat milk, cream cheese, bell
  // pepper, egg noodles (but "sweet onion", "corn tortillas", "baking potatoes" are still onion, tortilla, potato)
  var OTHER_FOOD = { butter: ['peanut', 'almond', 'cashew', 'nut', 'apple', 'cocoa', 'shea'], milk: ['oat', 'soy', 'rice', 'almond', 'coconut', 'cashew'],
    potato: ['sweet'], cheese: ['cream'], cream: ['sour', 'ice'], pepper: ['bell', 'chili', 'chilli', 'hot', 'sweet'], noodle: ['egg', 'rice'],
    flour: ['corn', 'rice', 'almond', 'coconut'], sugar: ['icing'], sauce: ['fish', 'soy', 'oyster', 'hot', 'tomato'] };
  function sameFood(a, b) {
    // "onion, diced" / "garlic (minced)" are onion and garlic
    var cut = function (x) { return String(x || '').split(/[,(]/)[0]; };
    var na = norm(cut(a)), nb = norm(cut(b));
    if (!na || !nb) return false;
    if (na === nb || stem(na) === stem(nb)) return true;
    // whole words: the shorter name inside the longer one, with only describing words before it ("red lentils",
    // "ground beef", "boneless chicken") and only a cut or part after it ("chicken thighs", "broccoli florets"). So
    // "peanut butter" is not butter, "sweet potato" not potato, "chicken broth" not chicken, "tomato sauce" not tomato.
    var wa = na.split(' ').map(stem), wb = nb.split(' ').map(stem);
    var lng = wa.length >= wb.length ? wa : wb, sht = lng === wa ? wb : wa, n = sht.length;
    // blueberries, strawberries ... are berries
    if (n === 1 && (sht[0] === 'berry' && /berry$/.test(lng[lng.length - 1]) || lng.length === 1 && lng[0] === 'berry' && /berry$/.test(sht[0]))) return true;
    if (lng.length === n) return false;
    for (var i = 0; i + n <= lng.length; i++) {
      if (lng.slice(i, i + n).join(' ') !== sht.join(' ')) continue;
      var before = lng.slice(0, i), after = lng.slice(i + n);
      var head = sht[n - 1], other = OTHER_FOOD[head] || [];
      if (before.some(function (w) { return other.indexOf(w) >= 0; })) continue;
      if (after.every(function (w) { return CUTS.indexOf(w) >= 0; })) return true;
    }
    return false;
  }

  function weekStartDate(now) {
    now = now || new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function weekDays(now) {
    var ws = weekStartDate(now), out = [];
    for (var i = 0; i < 7; i++) out.push(iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i)));
    return out;
  }

  function recipeById(state, id) {
    if (!id) return null;
    if (RECIPE_BY[id]) return RECIPE_BY[id];
    if (state && state.aiRecipes && state.aiRecipes[id]) return state.aiRecipes[id];
    return null;
  }

  /* ---- Fridge & pantry ---- */
  function daysUntilExpiry(item, now) {
    if (!item || !isDate(item.expires)) return null;
    var t = iso(now || new Date());
    var a = item.expires.split('-'), b = t.split('-');
    return Math.round((Date.UTC(+a[0], +a[1] - 1, +a[2]) - Date.UTC(+b[0], +b[1] - 1, +b[2])) / 864e5);
  }

  function addPantryItem(state, item, now) {
    now = now || new Date();
    var name = String(item && item.name || '').trim().slice(0, 80);
    if (!name) return null;
    var cat = CATS.indexOf(item.cat) >= 0 ? item.cat : 'produce';
    var qty = item.qty != null && item.qty !== '' && isFinite(+item.qty) && +item.qty > 0 ? Math.round(+item.qty * 100) / 100 : null;
    var unit = String(item.unit || '').trim().slice(0, 20);
    var status = STATUS.indexOf(item.status) >= 0 ? item.status : 'plenty';
    var expires = null;
    if (isDate(item.expires)) expires = item.expires;
    else if (item.expiresInDays != null && isFinite(+item.expiresInDays) && +item.expiresInDays >= 0) {
      expires = addDays(iso(now), Math.min(365, Math.round(+item.expiresInDays)));
    } else if (item.expires !== null) {
      var sd = guessShelfDays(name, cat);
      if (sd <= 30) expires = addDays(iso(now), sd);
    }
    var ts = now.toISOString();
    // update existing item if same normalized name exists
    var existing = (state.pantry || []).filter(function (x) { return norm(x.name) === norm(name); })[0];
    if (existing) {
      if (qty != null) existing.qty = qty;
      if (unit) existing.unit = unit;
      existing.status = status;
      if (expires !== null) existing.expires = expires;
      existing.cat = cat;
      existing.updated = ts;
      return existing;
    }
    var rec = { id: newId('p', now), name: name, qty: qty, unit: unit, status: status, expires: expires, cat: cat, added: ts, updated: ts };
    state.pantry.push(rec);
    if (state.pantry.length > 150) state.pantry.splice(0, state.pantry.length - 150);
    return rec;
  }

  function updatePantryStatus(state, id, status, now) {
    if (STATUS.indexOf(status) < 0) return null;
    var it = (state.pantry || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return null;
    it.status = status;
    if (status === 'out') it.qty = 0;
    it.updated = (now || new Date()).toISOString();
    return it;
  }

  function removePantryItem(state, id) {
    var n0 = (state.pantry || []).length;
    state.pantry = (state.pantry || []).filter(function (x) { return x.id !== id; });
    return state.pantry.length !== n0;
  }

  /* Active (not 'out') pantry items sorted by soonest expiry first. */
  function expiringSoon(state, now, maxDays) {
    maxDays = maxDays == null ? 4 : maxDays;
    return (state.pantry || []).filter(function (x) {
      if (!x || x.status === 'out') return false;
      var d = daysUntilExpiry(x, now);
      return d != null && d <= maxDays;
    }).map(function (x) {
      return { item: x, daysLeft: daysUntilExpiry(x, now) };
    }).sort(function (a, b) { return a.daysLeft - b.daysLeft || (a.item.name < b.item.name ? -1 : 1); });
  }

  function sortedPantry(state, now) {
    return (state.pantry || []).slice().sort(function (a, b) {
      var ao = a.status === 'out' ? 1 : 0, bo = b.status === 'out' ? 1 : 0;
      if (ao !== bo) return ao - bo;
      var da = daysUntilExpiry(a, now), db = daysUntilExpiry(b, now);
      var sa = da == null ? 9999 : da, sb = db == null ? 9999 : db;
      return sa - sb || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
  }

  /* Match recipes against soon-to-spoil fridge items so perishables get used fast. */
  function matchExpiring(state, now, max) {
    var soon = expiringSoon(state, now, 5);
    if (!soon.length) return [];
    return RECIPES.map(function (r) {
      var hits = [];
      (r.ingredients || []).forEach(function (ing) {
        soon.forEach(function (s) {
          if (sameFood(ing.name, s.item.name) && hits.indexOf(s.item.name) < 0) hits.push(s.item.name);
        });
      });
      return { recipe: r, hits: hits, score: hits.length };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.recipe.mins - b.recipe.mins; })
      .slice(0, max || 4);
  }

  /* Deduct a recipe's ingredients from state.pantry when he marks a meal "Made it ✓".
     Returns { updated: [{ name, before, after }] } so the UI can show what changed. */
  function deductRecipe(state, recipeId, now) {
    var r = recipeById(state, recipeId);
    if (!r || !Array.isArray(r.ingredients)) return { updated: [] };
    var ts = (now || new Date()).toISOString(), updated = [];
    r.ingredients.forEach(function (ing) {
      var p = (state.pantry || []).filter(function (x) { return x && x.status !== 'out' && sameFood(x.name, ing.name); })[0];
      if (!p) return;
      var before = p.qty != null ? (p.qty + (p.unit ? ' ' + p.unit : '')) : p.status;
      if (p.qty != null && ing.qty > 0 && (!p.unit || !ing.unit || stem(p.unit) === stem(ing.unit))) {
        var left = Math.max(0, Math.round((p.qty - ing.qty) * 100) / 100);
        p.qty = left;
        if (left <= 0) p.status = 'out';
        else if (left <= ing.qty) p.status = 'low';
      } else {
        p.status = p.status === 'plenty' ? 'low' : 'out';
      }
      p.updated = ts;
      var after = p.status === 'out' ? 'used up' : (p.qty != null ? (p.qty + (p.unit ? ' ' + p.unit : '') + (p.status === 'low' ? ' (low)' : '')) : p.status);
      updated.push({ name: p.name, before: before, after: after });
    });
    return { updated: updated };
  }

  /* Merge AI photo-scan items into pantry (non-destructive: updates matched items, adds new ones). */
  function applyPhotoScan(state, items, now) {
    now = now || new Date();
    var added = 0, updated = 0;
    (Array.isArray(items) ? items : []).forEach(function (x) {
      if (!x || typeof x.name !== 'string' || !x.name.trim()) return;
      var existed = (state.pantry || []).some(function (p) { return norm(p.name) === norm(x.name); });
      var rec = addPantryItem(state, {
        name: x.name,
        qty: x.qty,
        unit: x.unit || '',
        status: STATUS.indexOf(x.status) >= 0 ? x.status : 'plenty',
        cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'produce',
        expiresInDays: x.expiresInDays != null && isFinite(+x.expiresInDays) ? +x.expiresInDays : undefined
      }, now);
      if (rec) { if (existed) updated++; else added++; }
    });
    return { added: added, updated: updated };
  }

  /* ---- Weekly meal plan ---- */
  function scoreRecipe(r, soonNames, wantProtein, usedCounts) {
    var s = 0;
    (r.ingredients || []).forEach(function (ing) {
      soonNames.forEach(function (n, idx) {
        if (sameFood(ing.name, n)) s += (idx < 2 ? 6 : 4); // soonest-expiring items win strongest boost
      });
    });
    if (wantProtein && r.workoutFit) s += 3;
    if (wantProtein && r.mins >= 45) s -= 4; // a workout day is no day for an hour at the stove
    s -= (usedCounts[r.id] || 0) * 5; // encourage variety across the week
    return s;
  }

  /* Ensure the current Mon-Sun week has a beginner-friendly plan (preserving made/mama/custom slots). */
  function ensureWeekPlan(state, now, opts) {
    now = now || new Date();
    opts = opts || {};
    var days = weekDays(now), wk = days[0];
    // an earlier week (a log day in the past, a clock set back) never replaces the week already planned
    if (state.plan && isDate(state.plan.week) && state.plan.week > wk) return state.plan;
    if (!state.plan || state.plan.week !== wk) {
      state.plan = { week: wk, days: {}, note: '', source: 'offline', updated: now.toISOString() };
    }
    var soonNames = expiringSoon(state, now, 4).map(function (x) { return x.item.name; });
    var used = {};
    days.forEach(function (d) {
      var slot = state.plan.days[d];
      if (!slot) return;
      MEALS.forEach(function (m) { if (slot[m] && slot[m].recipeId) used[slot[m].recipeId] = (used[slot[m].recipeId] || 0) + 1; });
    });
    var todayIso = iso(now), p0 = wk.split('-'), weekNo = Math.round(Date.UTC(+p0[0], +p0[1] - 1, +p0[2]) / (7 * 864e5)); // a different order each week
    days.forEach(function (d, dayIdx) {
      var cur = state.plan.days[d] = state.plan.days[d] || {};
      var workoutDay = Array.isArray(opts.workoutDays) ? opts.workoutDays.indexOf(dayIdx) >= 0 : (dayIdx === 0 || dayIdx === 2 || dayIdx === 4);
      var boostSoon = d >= todayIso && d <= addDays(todayIso, 2);
      MEALS.forEach(function (meal) {
        if (cur[meal] && (!opts.force || cur[meal].status === 'made' || cur[meal].status === 'mama' || cur[meal].status === 'custom' || cur[meal].status === 'skipped')) return;
        var pool = RECIPES.filter(function (r) { return r.meal === meal; });
        pool.sort(function (a, b) {
          var sa = scoreRecipe(a, boostSoon ? soonNames : [], workoutDay, used);
          var sb = scoreRecipe(b, boostSoon ? soonNames : [], workoutDay, used);
          return sb - sa || ((RECIPES.indexOf(a) + dayIdx + weekNo) % pool.length) - ((RECIPES.indexOf(b) + dayIdx + weekNo) % pool.length);
        });
        var pick = pool[0];
        used[pick.id] = (used[pick.id] || 0) + 1;
        cur[meal] = { recipeId: pick.id, title: pick.title, status: 'planned', note: '' };
      });
    });
    if (opts.force) { state.plan.source = 'offline'; state.plan.updated = now.toISOString(); }
    return state.plan;
  }

  function markSlot(state, date, meal, status, note, now) {
    if (!isDate(date) || MEALS.indexOf(meal) < 0) return null;
    if (['planned', 'made', 'mama', 'custom', 'skipped'].indexOf(status) < 0) return null;
    ensureWeekPlan(state, now);
    var day = state.plan.days[date] = state.plan.days[date] || {};
    var cur = day[meal] || { recipeId: null, title: '', status: 'planned', note: '' };
    cur.status = status;
    if (note !== undefined) cur.note = String(note || '').trim().slice(0, 200);
    if (status === 'custom' && cur.note) { cur.title = cur.note; cur.recipeId = null; }
    day[meal] = cur;
    return cur;
  }

  function swapSlot(state, date, meal, recipeId, now) {
    if (!isDate(date) || MEALS.indexOf(meal) < 0) return null;
    ensureWeekPlan(state, now);
    var day = state.plan.days[date] = state.plan.days[date] || {};
    var cur = day[meal];
    var pool = RECIPES.filter(function (r) { return r.meal === meal; });
    var pick = recipeId ? recipeById(state, recipeId) : null;
    if (!pick) {
      var idx = cur && cur.recipeId ? pool.findIndex(function (r) { return r.id === cur.recipeId; }) : -1;
      pick = pool[(idx + 1) % pool.length];
    }
    day[meal] = { recipeId: pick.id, title: pick.title, status: 'planned', note: '' };
    return day[meal];
  }

  /* Undo of a sick-day soup swap: puts the slot back exactly as it was (recipe, status, note), only while the slot
     still holds the soup it was swapped to. prev is the slot object as it was before the swap (a copy). */
  function restoreSlot(state, date, meal, prev, swappedTo) {
    var day = state && state.plan && state.plan.days && state.plan.days[date];
    if (!day || !prev || MEALS.indexOf(meal) < 0 || !day[meal] || day[meal].recipeId !== swappedTo || day[meal].status !== 'planned') return null;
    day[meal] = JSON.parse(JSON.stringify(prev));
    return day[meal];
  }

  /* Sick-day soup offer: find the next planned dinner (today, or tomorrow within this week if today's dinner is already
     done/Mama/skipped) that isn't already a soup, and suggest an existing comforting soup (Tinola, Arroz caldo, lentil). */
  function sickSoupOffer(state, now) {
    now = now || new Date();
    var days = state && state.plan && state.plan.days;
    if (!days) return null;
    var tIso = iso(now), tomIso = addDays(tIso, 1);
    var targetDate = null, isTomorrow = false;
    var td = days[tIso] && days[tIso].dinner;
    if (td && td.status === 'planned') {
      if (SOUP_IDS.indexOf(td.recipeId) >= 0) return null;
      targetDate = tIso;
    } else {
      var tm = days[tomIso] && days[tomIso].dinner;
      if (!tm || tm.status !== 'planned' || SOUP_IDS.indexOf(tm.recipeId) >= 0) return null;
      targetDate = tomIso; isTomorrow = true;
    }
    var soups = SOUP_IDS.map(function (id) { return RECIPE_BY[id]; }).filter(Boolean);
    if (!soups.length) return null;
    // avoid repeating a soup already planned/made today or yesterday
    var yIso = addDays(tIso, -1), recent = {};
    [yIso, tIso].forEach(function (d) {
      var row = days[d]; if (!row) return;
      MEALS.forEach(function (m) { if (row[m] && row[m].recipeId) recent[row[m].recipeId] = 1; });
    });
    var pick = soups.filter(function (r) { return !recent[r.id]; })[0] || soups[0];
    return {
      date: targetDate, meal: 'dinner', isTomorrow: isTomorrow,
      recipe: pick, shortName: SOUP_SHORT[pick.id] || pick.title,
      soups: soups.map(function (r) { return { id: r.id, title: r.title, shortName: SOUP_SHORT[r.id] || r.title }; })
    };
  }

  function usableMeal(m) {
    return (typeof m === 'string' && !!m.trim()) || (!!m && typeof m === 'object' && typeof m.title === 'string' && !!m.title.trim());
  }

  /* Apply an AI weekly meal plan (from cook-plan task), preserving already made / mama-cooked slots.
     Only accepts meals whose dates fall within the current week (weekDays(now)) so a stale cloud answer
     arriving after Monday never writes last week's dates into this week's plan or falsely reports success. */
  function applyAiPlan(state, ans, now, askedAt) {
    if (!ans || typeof ans !== 'object' || !Array.isArray(ans.days)) return false;
    now = now || new Date();
    var days = weekDays(now);
    // a day without a date is taken as this week's day by its place in the list only when the plan was asked for
    // this week (a cloud answer to last week's request would otherwise land on this week's days)
    var asked = askedAt != null ? new Date(askedAt) : null;
    var byIndex = !asked || isNaN(asked.getTime()) || weekDays(asked)[0] === days[0];
    if (state.plan && isDate(state.plan.week) && state.plan.week > days[0]) return false;
    var valid = [];
    ans.days.forEach(function (d, idx) {
      if (!d || typeof d !== 'object') return;
      var date = isDate(d.date) ? d.date : byIndex ? days[idx] : null;
      if (!date || days.indexOf(date) < 0) return;
      if (!MEALS.some(function (meal) { return usableMeal(d[meal]); })) return;
      valid.push({ date: date, day: d });
    });
    if (!valid.length) return false;
    ensureWeekPlan(state, now);
    valid.forEach(function (entry) {
      var date = entry.date, d = entry.day;
      var curDay = state.plan.days[date] = state.plan.days[date] || {};
      MEALS.forEach(function (meal) {
        var m = d[meal];
        if (!usableMeal(m)) return;
        if (curDay[meal] && (curDay[meal].status === 'made' || curDay[meal].status === 'mama' || curDay[meal].status === 'skipped')) return;
        if (typeof m === 'string' && m.trim()) {
          curDay[meal] = { recipeId: null, title: m.trim().slice(0, 120), status: 'planned', note: '' };
          return;
        }
        if (typeof m === 'object' && typeof m.title === 'string' && m.title.trim()) {
          var rid = typeof m.recipeId === 'string' && RECIPE_BY[m.recipeId] ? m.recipeId : null;
          if (!rid && Array.isArray(m.steps) && m.steps.length) {
            rid = 'ai-' + date + '-' + meal;
            state.aiRecipes[rid] = {
              id: rid, title: m.title.trim().slice(0, 120), meal: meal,
              mins: Math.max(5, Math.min(120, Math.round(+m.mins || 20))),
              protein: typeof m.protein === 'string' ? m.protein.slice(0, 40) : '',
              babyNote: typeof m.babyNote === 'string' ? m.babyNote.slice(0, 300) : '',
              tip: typeof m.tip === 'string' ? m.tip.slice(0, 300) : '',
              ingredients: (Array.isArray(m.ingredients) ? m.ingredients : []).slice(0, 15).map(function (x) {
                if (typeof x === 'string') return { name: x.slice(0, 60), qty: 1, unit: '', cat: 'produce' };
                if (!x || typeof x !== 'object') return null;
                return { name: String(x.name || '').slice(0, 60), qty: isFinite(+x.qty) && +x.qty > 0 ? +x.qty : 1, unit: String(x.unit || '').slice(0, 20), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'produce' };
              }).filter(function (x) { return x && x.name; }),
              steps: m.steps.filter(function (s) { return typeof s === 'string' && s.trim(); }).slice(0, 10).map(function (s) { return s.trim().slice(0, 300); })
            };
            var aw = cleanWords(m.words); if (aw.length) state.aiRecipes[rid].words = aw;
          }
          curDay[meal] = { recipeId: rid, title: m.title.trim().slice(0, 120), status: 'planned', note: typeof m.note === 'string' ? m.note.trim().slice(0, 200) : '' };
        }
      });
    });
    if (typeof ans.note === 'string') state.plan.note = ans.note.trim().slice(0, 600);
    state.plan.source = 'ai';
    state.plan.updated = now.toISOString();
    pruneAi(state);
    return true;
  }

  /* AI recipes kept: the ones the plan uses, then the newest (ids ai-<YYYY-MM-DD>-<meal>), at most 40, so a year of
     weekly AI plans doesn't fill the phone (the same rule validate() uses on a restore). */
  function aiKeep(plan, recipes) {
    var inPlan = {};
    Object.keys((plan && plan.days) || {}).forEach(function (day) { MEALS.forEach(function (m) { var x = plan.days[day] && plan.days[day][m]; if (x && x.recipeId) inPlan[x.recipeId] = 1; }); });
    return Object.keys(recipes || {}).sort(function (a, b) { return (inPlan[b] || 0) - (inPlan[a] || 0) || (a < b ? 1 : a > b ? -1 : 0); }).slice(0, 40);
  }
  function pruneAi(state) {
    if (!state.aiRecipes) return;
    var keep = {}; aiKeep(state.plan, state.aiRecipes).forEach(function (k) { keep[k] = 1; });
    Object.keys(state.aiRecipes).forEach(function (k) { if (!keep[k]) delete state.aiRecipes[k]; });
  }

  /* ---- Shopping list for the remaining planned meals this week ---- */
  function shoppingList(state, now) {
    now = now || new Date();
    ensureWeekPlan(state, now);
    var days = weekDays(now), todayIso = iso(now), wk = days[0];
    var boughtMap = (state.bought && state.bought[wk]) || {};
    var need = {};
    days.forEach(function (d) {
      if (d < todayIso) return;
      var slot = state.plan.days[d]; if (!slot) return;
      MEALS.forEach(function (meal) {
        var m = slot[meal];
        if (!m || m.status !== 'planned' || !m.recipeId) return;
        var r = recipeById(state, m.recipeId); if (!r) return;
        (r.ingredients || []).forEach(function (ing) {
          var key = norm(ing.name); if (!key) return;
          if (!need[key]) need[key] = { key: key, name: ing.name, qty: 0, unit: ing.unit || '', cat: ing.cat || 'pantry', shelfDays: ing.shelfDays || guessShelfDays(ing.name, ing.cat), meals: [] };
          if (ing.qty > 0 && (!need[key].unit || stem(need[key].unit) === stem(ing.unit || ''))) need[key].qty = Math.round((need[key].qty + ing.qty) * 100) / 100;
          if (need[key].meals.indexOf(r.title) < 0) need[key].meals.push(r.title);
        });
      });
    });
    return Object.keys(need).map(function (k) {
      var x = need[k];
      var have = (state.pantry || []).filter(function (p) { return p && sameFood(p.name, x.name); })[0];
      x.haveStatus = have ? have.status : 'none';
      x.bought = !!boughtMap[k];
      return x;
    }).filter(function (x) {
      // skip items already plenty in pantry (unless he just ticked them bought this week so he can undo)
      return x.haveStatus !== 'plenty' || x.bought;
    }).sort(function (a, b) {
      return (a.bought ? 1 : 0) - (b.bought ? 1 : 0) || CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || (a.name < b.name ? -1 : 1);
    });
  }

  function toggleBought(state, item, now) {
    now = now || new Date();
    var wk = weekDays(now)[0];
    if (!state.bought || typeof state.bought !== 'object') state.bought = {};
    var m = state.bought[wk] = state.bought[wk] || {};
    var key = norm(item.name);
    if (m[key]) { delete m[key]; return false; }
    m[key] = true;
    var wks = Object.keys(state.bought).sort();
    while (wks.length > 4) delete state.bought[wks.shift()];
    // Automatically add/replenish in fridge/pantry with smart default shelf life so tracking is zero extra work
    addPantryItem(state, {
      name: item.name,
      qty: item.qty > 0 ? item.qty : null,
      unit: item.unit || '',
      status: 'plenty',
      cat: item.cat || 'produce',
      expiresInDays: item.shelfDays <= 30 ? item.shelfDays : undefined
    }, now);
    return true;
  }

  /* ---- Food logs (Me & {child}) ---- */
  function insertLog(state, rec) {
    if (!Array.isArray(state.logs)) state.logs = [];
    var rDate = rec.date || '', rMs = Date.parse(rec.at);
    var idx = 0;
    while (idx < state.logs.length) {
      var cur = state.logs[idx];
      if (!cur) { idx++; continue; }
      var cDate = cur.date || '';
      if (rDate > cDate) break;
      if (rDate === cDate) {
        var cMs = Date.parse(cur.at);
        if (isNaN(cMs) || (!isNaN(rMs) && rMs >= cMs)) break;
      }
      idx++;
    }
    state.logs.splice(idx, 0, rec);
    if (state.logs.length > 400) state.logs.length = 400;
  }

  function applyLogNutriMeta(rec, data) {
    if (!CN || !data || !data.nutri) return;
    var cn = CN.cleanNutri(data.nutri);
    if (!cn) return;
    rec.nutri = cn;
    if (data.nutriExact) rec.nutriExact = true;
    if (typeof data.nutriNote === 'string' && data.nutriNote.trim()) rec.nutriNote = data.nutriNote.trim().slice(0, 220);
    if (data.nutriSource === 'ai' || data.nutriSource === 'manual' || data.nutriSource === 'picker') rec.nutriSource = data.nutriSource;
  }

  function logMe(state, data, now) {
    now = now || new Date();
    var text = String(data && data.text || '').trim().slice(0, 300);
    if (!text) return null;
    var meal = ALL_MEALS.indexOf(data.meal) >= 0 ? data.meal : 'dinner';
    var portion = PORTIONS.indexOf(data.portion) >= 0 ? data.portion : 'Regular';
    var tags = (Array.isArray(data.tags) ? data.tags : []).filter(function (t) { return ME_TAGS.indexOf(t) >= 0; }).slice(0, 4);
    var rec = { id: newId('lm', now), at: now.toISOString(), date: isDate(data.date) ? data.date : iso(now), who: 'me', meal: meal, text: text, portion: portion, tags: tags };
    if (data.recipeId && typeof data.recipeId === 'string') rec.recipeId = data.recipeId.slice(0, 60);
    applyLogNutriMeta(rec, data);
    insertLog(state, rec);
    return rec;
  }

  /* What a day's meal slot means as food, for the food log: { text, recipeId?, tags } or null. A "Not making" slot is
     nothing; a Mama-cooked one is what she made (or "Mama’s cooking"), never the recipe that was planned. */
  function slotFood(state, date, meal) {
    var slot = state && state.plan && state.plan.days && state.plan.days[date] && state.plan.days[date][meal];
    if (!slot || slot.status === 'skipped') return null;
    if (slot.status === 'mama') return { text: slot.note || 'Mama’s cooking', tags: ['Mama cooked'] };
    if (!slot.title) return null;
    return { text: slot.title, recipeId: slot.status === 'made' && slot.recipeId ? slot.recipeId : undefined, tags: [] };
  }
  /* His food log already has this slot's meal (same day, meal and text): "Log to food log" adds it once. */
  function slotLogged(state, date, meal) {
    var f = slotFood(state, date, meal);
    if (!f) return false;
    var t = f.text.toLowerCase();
    return (state.logs || []).some(function (x) { return x && x.who === 'me' && x.date === date && x.meal === meal && String(x.text || '').toLowerCase() === t; });
  }
  function logChild(state, data, now) {
    now = now || new Date();
    var offered = String(data && data.offered || '').trim().slice(0, 300);
    if (!offered) return null;
    var meal = ALL_MEALS.indexOf(data.meal) >= 0 ? data.meal : 'lunch';
    var ate = CHILD_ATE.indexOf(data.ate) >= 0 ? data.ate : 'About half';
    var note = String(data.note || '').trim().slice(0, 200);
    var rec = { id: newId('lc', now), at: now.toISOString(), date: isDate(data.date) ? data.date : iso(now), who: 'child', meal: meal, offered: offered, ate: ate, note: note };
    if (data.recipeId && typeof data.recipeId === 'string') rec.recipeId = data.recipeId.slice(0, 60);
    applyLogNutriMeta(rec, data);
    insertLog(state, rec);
    return rec;
  }

  /* Update (or clear) explicit nutrition numbers on an existing food log entry (manual edit or AI estimate). */
  function updateLogNutri(state, id, nutri, opts) {
    if (!state || !Array.isArray(state.logs) || !id) return null;
    opts = opts || {};
    for (var i = 0; i < state.logs.length; i++) {
      var x = state.logs[i];
      if (!x || x.id !== id) continue;
      if (nutri == null) {
        delete x.nutri; delete x.nutriExact; delete x.nutriNote; delete x.nutriSource;
        return x;
      }
      // an AI reply is checked for sense; numbers he types need calories or a macro (not only old micros)
      var cn = !CN ? null : opts.source === 'ai' ? CN.plausibleAi(nutri) : CN.cleanNutri(nutri);
      if (!cn) return null;
      if (opts.source === 'manual' && !(cn.kcal > 0 || cn.pro > 0 || cn.carb > 0 || cn.fat > 0)) return null;
      x.nutri = cn;
      if (opts.exact !== false) x.nutriExact = true; else delete x.nutriExact;
      if (typeof opts.note === 'string' && opts.note.trim()) x.nutriNote = opts.note.trim().slice(0, 220); else delete x.nutriNote;
      if (opts.source === 'ai' || opts.source === 'manual' || opts.source === 'picker') x.nutriSource = opts.source; else delete x.nutriSource;
      return x;
    }
    return null;
  }

  /* Custom user-saved foods (for 1-tap logging of household staples & Mama's dishes). */
  function addCustomFood(state, item, now) {
    if (!CN || !item || typeof item.name !== 'string' || !item.name.trim()) return null;
    var nutri = CN.cleanNutri(item.nutri || item);
    if (!nutri) return null;
    if (!Array.isArray(state.customFoods)) state.customFoods = [];
    var name = item.name.trim().slice(0, 80);
    var serving = String(item.serving || '1 serving').trim().slice(0, 40) || '1 serving';
    // the same food again (case and spaces aside) updates it; "Milk 2" and "Milk 2%", or two non-Latin names, are two foods
    var key = function (v) { v = String(v || ''); if (v.normalize) v = v.normalize('NFC'); return v.toLowerCase().replace(/\s+/g, ' ').trim(); };
    var k = key(name);
    var existing = state.customFoods.filter(function (x) { return x && key(x.name) === k; })[0];
    if (existing) { existing.name = name; existing.serving = serving; existing.nutri = nutri; return existing; }
    var rec = { id: newId('cf', now || new Date()), name: name, serving: serving, nutri: nutri };
    state.customFoods.unshift(rec);
    if (state.customFoods.length > 60) state.customFoods.length = 60;
    return rec;
  }

  function removeCustomFood(state, id) {
    if (!Array.isArray(state.customFoods)) return false;
    var n0 = state.customFoods.length;
    state.customFoods = state.customFoods.filter(function (x) { return x && x.id !== id; });
    if (!state.customFoods.length) delete state.customFoods;
    return (state.customFoods ? state.customFoods.length : 0) !== n0;
  }

  /* Customizable daily targets for 'me' or 'child' (falls back to general everyday reference defaults). */
  function setTargets(state, who, vals) {
    if (!CN || (who !== 'me' && who !== 'child')) return null;
    if (!state.targets || typeof state.targets !== 'object') state.targets = {};
    state.targets[who] = CN.cleanTargets(vals, who);
    return state.targets[who];
  }

  function resetTargets(state, who) {
    if (!state || !state.targets || typeof state.targets !== 'object') return;
    if (who === 'me' || who === 'child') delete state.targets[who];
    if (!Object.keys(state.targets).length) delete state.targets;
  }

  function dailyNutrition(state, who, now, opts) {
    if (!CN) return null;
    now = now || new Date();
    var dateIso = typeof now === 'string' && isDate(now) ? now : iso(now);
    return CN.dailyNutrition(state, who, dateIso, Object.assign({ addDays: addDays, recipes: RECIPES }, opts || {}));
  }

  function removeLog(state, id) {
    var n0 = (state.logs || []).length;
    state.logs = (state.logs || []).filter(function (x) { return x && x.id !== id; });
    return state.logs.length !== n0;
  }

  function dayLogs(state, date) {
    return (state.logs || []).filter(function (x) { return x && x.date === date; });
  }

  /* Summary of what {child} ate well vs. refused in the last 14 days (for quick recall & meal planning). */
  function childSummary(state, now) {
    now = now || new Date();
    var to = iso(now), from = addDays(to, -13);
    var recent = (state.logs || []).filter(function (x) { return x && x.who === 'child' && x.date >= from && x.date <= to; });
    var liked = [], refused = [];
    recent.forEach(function (x) {
      if ((x.ate === 'Most of it' || x.ate === 'All + more') && liked.indexOf(x.offered) < 0) liked.push(x.offered);
      else if (x.ate === 'Refused / none' && refused.indexOf(x.offered) < 0) refused.push(x.offered);
    });
    return { count: recent.length, liked: liked.slice(0, 8), refused: refused.slice(0, 6) };
  }

  function validate(s) {
    if (!s || typeof s !== 'object') return null;
    var d = defaults();
    (Array.isArray(s.pantry) ? s.pantry : []).slice(0, 150).forEach(function (x) {
      if (!x || typeof x.name !== 'string' || !x.name.trim()) return;
      d.pantry.push({
        id: String(x.id || newId('p')).slice(0, 40),
        name: x.name.trim().slice(0, 80),
        qty: typeof x.qty === 'number' && isFinite(x.qty) && x.qty >= 0 ? x.qty : null,
        unit: typeof x.unit === 'string' ? x.unit.slice(0, 20) : '',
        status: STATUS.indexOf(x.status) >= 0 ? x.status : 'plenty',
        expires: isDate(x.expires) ? x.expires : null,
        cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'produce',
        added: typeof x.added === 'string' && !isNaN(Date.parse(x.added)) ? x.added : new Date().toISOString(),
        updated: typeof x.updated === 'string' && !isNaN(Date.parse(x.updated)) ? x.updated : new Date().toISOString()
      });
    });
    if (s.plan && typeof s.plan === 'object' && isDate(s.plan.week)) {
      d.plan.week = s.plan.week;
      d.plan.note = typeof s.plan.note === 'string' ? s.plan.note.slice(0, 600) : '';
      d.plan.source = s.plan.source === 'ai' ? 'ai' : 'offline';
      d.plan.updated = typeof s.plan.updated === 'string' && !isNaN(Date.parse(s.plan.updated)) ? s.plan.updated : null;
      if (s.plan.days && typeof s.plan.days === 'object') {
        Object.keys(s.plan.days).forEach(function (day) {
          if (!isDate(day) || !s.plan.days[day] || typeof s.plan.days[day] !== 'object') return;
          d.plan.days[day] = {};
          MEALS.forEach(function (meal) {
            var m = s.plan.days[day][meal];
            if (!m || typeof m !== 'object') return;
            d.plan.days[day][meal] = {
              recipeId: typeof m.recipeId === 'string' ? m.recipeId.slice(0, 60) : null,
              title: typeof m.title === 'string' ? m.title.slice(0, 120) : '',
              status: ['planned', 'made', 'mama', 'custom', 'skipped'].indexOf(m.status) >= 0 ? m.status : 'planned',
              note: typeof m.note === 'string' ? m.note.slice(0, 200) : ''
            };
          });
        });
      }
    }
    if (s.bought && typeof s.bought === 'object') {
      Object.keys(s.bought).sort().slice(-4).forEach(function (wk) {
        if (!isDate(wk) || !s.bought[wk] || typeof s.bought[wk] !== 'object') return;
        d.bought[wk] = {};
        Object.keys(s.bought[wk]).slice(0, 100).forEach(function (k) { if (s.bought[wk][k]) d.bought[wk][k] = true; });
      });
    }
    (Array.isArray(s.logs) ? s.logs : []).slice(0, 400).forEach(function (x) {
      if (!x || !isDate(x.date) || isNaN(Date.parse(x.at))) return;
      if (x.who === 'child' && typeof x.offered === 'string' && x.offered.trim()) {
        var cRec = {
          id: String(x.id || newId('lc')).slice(0, 40), at: new Date(x.at).toISOString(), date: x.date, who: 'child',
          meal: ALL_MEALS.indexOf(x.meal) >= 0 ? x.meal : 'lunch',
          offered: x.offered.trim().slice(0, 300),
          ate: CHILD_ATE.indexOf(x.ate) >= 0 ? x.ate : 'About half',
          note: typeof x.note === 'string' ? x.note.trim().slice(0, 200) : ''
        };
        if (typeof x.recipeId === 'string' && x.recipeId) cRec.recipeId = x.recipeId.slice(0, 60);
        applyLogNutriMeta(cRec, x);
        d.logs.push(cRec);
      } else if (x.who === 'me' && typeof x.text === 'string' && x.text.trim()) {
        var mRec = {
          id: String(x.id || newId('lm')).slice(0, 40), at: new Date(x.at).toISOString(), date: x.date, who: 'me',
          meal: ALL_MEALS.indexOf(x.meal) >= 0 ? x.meal : 'dinner',
          text: x.text.trim().slice(0, 300),
          portion: PORTIONS.indexOf(x.portion) >= 0 ? x.portion : 'Regular',
          tags: (Array.isArray(x.tags) ? x.tags : []).filter(function (t) { return ME_TAGS.indexOf(t) >= 0; }).slice(0, 4)
        };
        if (typeof x.recipeId === 'string' && x.recipeId) mRec.recipeId = x.recipeId.slice(0, 60);
        applyLogNutriMeta(mRec, x);
        d.logs.push(mRec);
      }
    });
    if (s.aiRecipes && typeof s.aiRecipes === 'object') {
      // the ones this plan uses first, then the newest, so a restore keeps this week's
      aiKeep(d.plan, s.aiRecipes).forEach(function (k) {
        var r = s.aiRecipes[k];
        if (!r || typeof r.title !== 'string' || !r.title.trim()) return;
        d.aiRecipes[k] = {
          id: String(k).slice(0, 60), title: r.title.slice(0, 120), meal: MEALS.indexOf(r.meal) >= 0 ? r.meal : 'dinner',
          mins: Math.max(5, Math.min(120, Math.round(+r.mins || 20))),
          protein: typeof r.protein === 'string' ? r.protein.slice(0, 40) : '',
          babyNote: typeof r.babyNote === 'string' ? r.babyNote.slice(0, 300) : '',
          tip: typeof r.tip === 'string' ? r.tip.slice(0, 300) : '',
          ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 15).map(function (x) {
            if (!x || typeof x !== 'object') return null;
            return { name: String(x.name || '').slice(0, 60), qty: isFinite(+x.qty) && +x.qty > 0 ? +x.qty : 1, unit: String(x.unit || '').slice(0, 20), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'produce' };
          }).filter(function (x) { return x && x.name; }),
          steps: (Array.isArray(r.steps) ? r.steps : []).filter(function (st) { return typeof st === 'string' && st.trim(); }).slice(0, 10).map(function (st) { return st.trim().slice(0, 300); })
        };
        var vw = cleanWords(r.words); if (vw.length) d.aiRecipes[k].words = vw;
      });
    }
    if (s.lastPhoto && typeof s.lastPhoto === 'object') {
      var pi = cleanPhotoItems(s.lastPhoto.items);
      if (pi.length) d.lastPhoto = { at: typeof s.lastPhoto.at === 'string' && !isNaN(Date.parse(s.lastPhoto.at)) ? s.lastPhoto.at : new Date().toISOString(), summary: String(s.lastPhoto.summary || '').slice(0, 300), items: pi };
    }
    if (CN && Array.isArray(s.customFoods)) {
      var cfs = [];
      s.customFoods.slice(0, 60).forEach(function (cf) {
        if (!cf || typeof cf.name !== 'string' || !cf.name.trim()) return;
        var nu = CN.cleanNutri(cf.nutri);
        if (!nu) return;
        cfs.push({ id: String(cf.id || newId('cf')).slice(0, 40), name: cf.name.trim().slice(0, 80), serving: String(cf.serving || '1 serving').trim().slice(0, 40) || '1 serving', nutri: nu });
      });
      if (cfs.length) d.customFoods = cfs;
    }
    if (CN && s.targets && typeof s.targets === 'object') {
      var tg = {};
      ['me', 'child'].forEach(function (w) {
        if (s.targets[w] && typeof s.targets[w] === 'object') tg[w] = CN.cleanTargets(s.targets[w], w);
      });
      if (Object.keys(tg).length) d.targets = tg;
    }
    return d;
  }

  /* A dish's Tagalog words from an AI plan: [{tl, en}], letters and spaces only, at most 8. */
  function cleanWords(ws) {
    return (Array.isArray(ws) ? ws : []).filter(function (w) {
      return w && typeof w.tl === 'string' && typeof w.en === 'string' && /^[a-zA-ZñÑ' -]{2,40}$/.test(w.tl.trim()) && w.en.trim();
    }).slice(0, 8).map(function (w) { return { tl: w.tl.trim().toLowerCase(), en: w.en.trim().slice(0, 40) }; });
  }

  /* A fridge-photo answer's items, only what the app can show and add: [{name, qty, unit, status, cat, expiresInDays}]. */
  function cleanPhotoItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (x) { return x && typeof x.name === 'string' && x.name.trim(); }).slice(0, 20).map(function (x) {
      var o = { name: x.name.trim().slice(0, 80) };
      if (x.qty != null && x.qty !== '' && isFinite(+x.qty) && +x.qty > 0) o.qty = Math.round(+x.qty * 100) / 100;
      if (typeof x.unit === 'string' && x.unit.trim()) o.unit = x.unit.trim().slice(0, 20);
      if (typeof x.amount === 'string' && x.amount.trim()) o.amount = x.amount.trim().slice(0, 80);
      if (STATUS.indexOf(x.status) >= 0) o.status = x.status;
      if (CATS.indexOf(x.cat) >= 0) o.cat = x.cat;
      if (x.expiresInDays != null && x.expiresInDays !== '' && isFinite(+x.expiresInDays) && +x.expiresInDays >= 0) o.expiresInDays = Math.min(365, Math.round(+x.expiresInDays));
      return o;
    });
  }

  var api = {
    MEALS: MEALS, ALL_MEALS: ALL_MEALS, MEAL_LABEL: MEAL_LABEL, PORTIONS: PORTIONS, ME_TAGS: ME_TAGS,
    CHILD_ATE: CHILD_ATE, CATS: CATS, CAT_LABEL: CAT_LABEL, STATUS: STATUS, RECIPES: RECIPES,
    defaults: defaults, iso: iso, weekDays: weekDays, recipeById: recipeById, guessShelfDays: guessShelfDays,
    daysUntilExpiry: daysUntilExpiry, addPantryItem: addPantryItem, updatePantryStatus: updatePantryStatus,
    removePantryItem: removePantryItem, expiringSoon: expiringSoon, sortedPantry: sortedPantry,
    matchExpiring: matchExpiring, deductRecipe: deductRecipe, applyPhotoScan: applyPhotoScan,
    ensureWeekPlan: ensureWeekPlan, markSlot: markSlot, swapSlot: swapSlot, restoreSlot: restoreSlot, sickSoupOffer: sickSoupOffer, SOUP_IDS: SOUP_IDS, applyAiPlan: applyAiPlan,
    shoppingList: shoppingList, toggleBought: toggleBought,
    logMe: logMe, logChild: logChild, updateLogNutri: updateLogNutri, removeLog: removeLog, dayLogs: dayLogs, childSummary: childSummary,
    addCustomFood: addCustomFood, removeCustomFood: removeCustomFood, setTargets: setTargets, resetTargets: resetTargets,
    dailyNutrition: dailyNutrition, nutri: CN, slotFood: slotFood, slotLogged: slotLogged,
    sameFood: sameFood, cleanPhotoItems: cleanPhotoItems, validate: validate
  };
  root.CookCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
