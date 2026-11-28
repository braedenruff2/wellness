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
    ['meals', 'Meals'],
    ['protein', 'Proteins'],
    ['dairy', 'Dairy & bread'],
    ['produce', 'Fruit & veg'],
    ['snacks', 'Snacks & drinks'],
    ['filipino', 'Filipino']
  ];

  /* Broad everyday food table: 1 standard adult serving (rough USDA-based estimates).
     [id, name, cat, serving, kcal, pro, carb, fat, fib, iron, ca, vitc, k, aliases] */
  var RAW_FOODS = [
    // Everyday / Breakfast / Breads & Grains
    ['toast', 'White / brioche bread / toast', 'common', '1 slice', 120, 3.5, 20, 3, 0.8, 0.9, 40, 0, 45, ['brioche', 'white brioche', 'brioche toast', 'white bread', 'bread', 'toast', 'bun', 'dinner roll', 'garlic bread']],
    ['wholegrain', 'Whole-grain / whole-wheat bread', 'dairy', '1 slice', 82, 4, 14, 1.1, 2, 0.7, 30, 0, 70, ['whole wheat bread', 'whole grain bread', 'whole wheat toast', 'multigrain bread', 'rye bread', 'sourdough']],
    ['bagel', 'Bagel', 'dairy', '1 medium', 270, 10, 53, 1.5, 2.3, 3.6, 20, 0, 100, ['bagels', 'everything bagel']],
    ['englishmuffin', 'English muffin', 'dairy', '1 muffin', 135, 5, 26, 1, 1.5, 1.6, 95, 0, 75, ['english muffin']],
    ['croissant', 'Croissant', 'dairy', '1 medium', 235, 5, 26, 12, 1.5, 1.2, 22, 0, 70, ['croissants']],
    ['biscuit', 'Biscuit / scone', 'dairy', '1 medium', 220, 4.5, 29, 9.5, 1, 1.6, 80, 0, 95, ['scone', 'tea biscuit', 'buttermilk biscuit']],
    ['naan', 'Naan / flatbread', 'dairy', '1 piece', 260, 8, 45, 5, 2, 2.5, 65, 0, 110, ['flatbread', 'garlic naan', 'roti']],
    ['pancake', 'Pancakes / waffles', 'common', '2 medium', 240, 6, 36, 8, 1.5, 2.1, 160, 0, 140, ['pancakes', 'waffle', 'waffles', 'crepe', 'crepes']],
    ['frenchtoast', 'French toast', 'common', '2 slices', 320, 11, 36, 14, 1.5, 2.2, 130, 0, 175, ['french toast']],
    ['cereal', 'Breakfast cereal with milk', 'common', '1 bowl', 240, 8, 42, 4.5, 3, 4.5, 220, 0, 260, ['cereal', 'cheerios', 'corn flakes', 'bran flakes', 'shreddies', 'rice krispies']],
    ['granola', 'Granola', 'dairy', '1/2 cup', 240, 6, 32, 10, 4, 1.8, 35, 0, 220, ['granola']],
    ['breakfastsand', 'Breakfast sandwich / wrap', 'meals', '1 sandwich', 390, 19, 32, 20, 1.8, 2.6, 210, 0, 250, ['breakfast sandwich', 'breakfast wrap', 'breakfast burrito', 'egg mcmuffin', 'bacon egger']],
    ['egg', 'Egg', 'common', '1 large egg', 72, 6.3, 0.4, 5, 0, 0.9, 28, 0, 69, ['eggs', 'scrambled egg', 'scrambled eggs', 'boiled egg', 'boiled eggs', 'hard boiled egg', 'hard boiled eggs', 'fried egg', 'fried eggs', 'poached egg', 'poached eggs', 'omelette', 'omelet']],
    ['eggwhite', 'Egg whites', 'protein', '1/2 cup', 63, 13, 0.9, 0.2, 0, 0.1, 9, 0, 200, ['egg whites', 'egg white']],
    ['oatmeal', 'Oatmeal (cooked)', 'common', '1 cup', 158, 6, 27, 3.2, 4, 2.1, 21, 0, 164, ['rolled oats', 'oats', 'porridge', 'cream of wheat']],
    ['yogurt', 'Greek yogurt (plain)', 'common', '3/4 cup', 130, 15, 6, 5, 0, 0.1, 187, 0, 240, ['greek yogurt', 'plain yogurt', 'yogurt', 'yoghurt', 'kefir']],
    ['fruityogurt', 'Flavoured / fruit yogurt', 'dairy', '3/4 cup', 150, 6, 24, 3, 0, 0.1, 190, 2, 240, ['fruit yogurt', 'vanilla yogurt', 'strawberry yogurt', 'yogurt cup', 'yogurt tube']],
    ['milk', 'Whole milk', 'dairy', '1 cup', 149, 8, 12, 8, 0, 0.1, 276, 0, 322, ['cow milk', 'dairy milk', '2% milk', '1% milk', 'skim milk']],
    ['chocmilk', 'Chocolate milk', 'snacks', '1 cup', 190, 8, 26, 5, 1, 0.6, 280, 0, 410, ['chocolate milk']],
    ['oatmilk', 'Fortified oat / soy / almond milk', 'dairy', '1 cup', 110, 5, 14, 3.5, 2, 0.6, 300, 0, 320, ['oat milk', 'soy milk', 'almond milk']],
    ['cheese', 'Cheddar / mozzarella cheese', 'dairy', '30 g', 115, 7, 0.5, 9.5, 0, 0.2, 200, 0, 28, ['cheddar', 'mozzarella', 'swiss cheese', 'feta', 'shredded cheese', 'cheese slice', 'parmesan', 'brie']],
    ['creamcheese', 'Cream cheese', 'dairy', '2 tbsp', 100, 1.8, 1.6, 10, 0, 0.1, 28, 0, 40, ['cream cheese']],
    ['cottage', 'Cottage cheese', 'dairy', '1/2 cup', 110, 14, 4, 4.5, 0, 0.1, 95, 0, 120, ['cottage cheese', 'ricotta']],
    ['sourcream', 'Sour cream / mayo / ranch', 'dairy', '2 tbsp', 110, 0.6, 1.2, 11, 0, 0, 25, 0, 35, ['sour cream', 'mayo', 'mayonnaise', 'ranch', 'ranch dressing']],
    ['rice', 'Cooked rice', 'common', '1 cup', 205, 4.3, 45, 0.4, 0.6, 1.9, 16, 0, 55, ['white rice', 'jasmine rice', 'brown rice', 'basmati rice', 'steamed rice', 'kanin']],
    ['quinoa', 'Cooked quinoa / couscous', 'dairy', '1 cup', 222, 8, 39, 3.6, 5.2, 2.8, 31, 0, 318, ['couscous', 'barley', 'bulgur']],
    ['pasta', 'Cooked pasta', 'dairy', '1 cup', 220, 8, 43, 1.3, 2.5, 1.8, 10, 0, 62, ['spaghetti', 'macaroni', 'noodles', 'penne', 'fusilli', 'linguine', 'fettuccine']],
    ['tortilla', 'Flour / corn tortilla', 'dairy', '1 medium', 140, 3.5, 24, 3.5, 1.5, 1.4, 45, 0, 60, ['wrap', 'wraps', 'pita']],
    ['pb', 'Peanut butter', 'common', '1 tbsp', 94, 4, 3.2, 8, 1, 0.3, 8, 0, 104, ['pb', 'almond butter', 'nut butter', 'sunbutter']],
    ['nutella', 'Nutella / chocolate spread', 'snacks', '1 tbsp', 100, 1, 11, 5.5, 0.5, 0.4, 15, 0, 75, ['chocolate spread', 'hazelnut spread']],
    ['butter', 'Butter / olive oil', 'dairy', '1 tsp', 36, 0, 0, 4, 0, 0, 1, 0, 1, ['olive oil', 'margarine', 'oil', 'ghee']],
    ['jam', 'Jam / maple syrup', 'dairy', '1 tbsp', 52, 0, 13, 0, 0.2, 0.1, 8, 1, 25, ['jelly', 'maple syrup', 'syrup', 'strawberry jam', 'honey']],
    ['gravy', 'Gravy / ketchup / BBQ sauce', 'dairy', '2 tbsp', 40, 0.8, 6, 1.5, 0.2, 0.2, 6, 1, 75, ['ketchup', 'bbq sauce', 'barbecue sauce', 'brown gravy']],
    ['hummus', 'Hummus', 'dairy', '2 tbsp', 70, 2.4, 6, 4.2, 1.8, 0.7, 15, 0, 75, ['chickpea dip', 'tzatziki']],

    // Everyday Western / North American / Canadian Meals
    ['pbj', 'PB&J sandwich', 'meals', '1 sandwich', 380, 13, 48, 16, 3.5, 2.3, 95, 1, 245, ['pb&j', 'pb and j', 'peanut butter and jelly', 'peanut butter and jam']],
    ['grilledcheese', 'Grilled cheese sandwich', 'meals', '1 sandwich', 380, 14, 34, 21, 1.5, 2.2, 320, 0, 160, ['grilled cheese']],
    ['sandwich', 'Deli / turkey / ham sandwich', 'meals', '1 sandwich', 390, 24, 40, 14, 3, 2.8, 180, 5, 420, ['turkey sandwich', 'ham sandwich', 'chicken sandwich', 'club sandwich', 'egg salad sandwich', 'tuna sandwich', 'tuna melt', 'pulled pork sandwich', 'sub', 'blt', 'panini']],
    ['burger', 'Burger / cheeseburger', 'meals', '1 burger', 520, 28, 38, 28, 2, 4.2, 210, 4, 460, ['cheeseburger', 'hamburger', 'beef burger', 'chicken burger', 'veggie burger', 'big mac', 'whopper']],
    ['poutine', 'Poutine', 'meals', '1 medium', 680, 22, 68, 36, 5, 2.0, 380, 10, 820, ['poutine']],
    ['pizza', 'Pizza', 'meals', '1 slice', 285, 12, 36, 10, 2.5, 2.4, 200, 2, 185, ['cheese pizza', 'pepperoni pizza', 'pizza slice', 'calzone']],
    ['maccheese', 'Mac and cheese', 'meals', '1 cup', 340, 12, 42, 14, 2, 1.8, 220, 0, 210, ['mac & cheese', 'mac n cheese', 'kd', 'kraft dinner']],
    ['bolognese', 'Spaghetti & meat sauce', 'meals', '1 bowl', 490, 26, 56, 17, 5, 4.2, 85, 16, 680, ['bolognese', 'meat sauce', 'spaghetti bolognese', 'pasta with meat sauce', 'spaghetti and meat sauce', 'spaghetti and meatballs']],
    ['lasagna', 'Lasagna', 'meals', '1 piece', 480, 26, 40, 24, 3.5, 3.2, 320, 10, 520, ['meat lasagna', 'veggie lasagna']],
    ['ravioli', 'Ravioli / tortellini', 'meals', '1 bowl', 380, 15, 50, 13, 3, 2.6, 160, 4, 280, ['tortellini', 'cheese ravioli', 'gnocchi']],
    ['alfredo', 'Pasta alfredo / carbonara', 'meals', '1 bowl', 540, 18, 52, 28, 2.5, 2.1, 240, 0, 210, ['pasta alfredo', 'fettuccine alfredo', 'chicken alfredo', 'carbonara', 'pesto pasta']],
    ['shepherdspie', 'Shepherd’s pie / cottage pie', 'meals', '1 serving', 430, 24, 38, 20, 4, 3.6, 75, 14, 780, ['shepherds pie', 'shepherd\'s pie', 'cottage pie', 'pate chinois']],
    ['beefstew', 'Beef stew / pot roast', 'meals', '1 bowl', 380, 28, 26, 18, 3.5, 4.0, 50, 16, 820, ['beef stew', 'pot roast', 'irish stew', 'roast dinner', 'stew']],
    ['meatloaf', 'Meatloaf', 'meals', '1 thick slice', 330, 24, 14, 20, 1, 3.2, 55, 4, 410, ['meatloaf', 'meat loaf', 'salisbury steak']],
    ['ribs', 'BBQ pork ribs', 'meals', '4 ribs', 480, 32, 18, 30, 0.5, 2.2, 65, 2, 520, ['pork ribs', 'bbq ribs', 'baby back ribs']],
    ['potpie', 'Chicken pot pie', 'meals', '1 serving', 460, 18, 42, 24, 3, 2.4, 70, 6, 420, ['chicken pot pie', 'pot pie', 'meat pie', 'tourtiere']],
    ['chickenparm', 'Chicken parmesan', 'meals', '1 serving', 510, 38, 28, 26, 2.5, 2.6, 280, 10, 560, ['chicken parm', 'chicken parmesan']],
    ['wings', 'Chicken wings', 'meals', '6 wings', 440, 30, 8, 32, 0.5, 1.8, 30, 0, 320, ['chicken wings', 'buffalo wings', 'honey garlic wings']],
    ['nuggets', 'Chicken nuggets / tenders', 'meals', '5 pieces', 280, 15, 16, 17, 0.8, 1.0, 20, 0, 240, ['chicken nuggets', 'chicken tenders', 'chicken strips', 'chicken fingers', 'fried chicken']],
    ['fishsticks', 'Fish sticks / fish & chips', 'meals', '4 pieces', 260, 13, 22, 13, 1, 0.9, 25, 0, 270, ['fish sticks', 'fish and chips', 'fish & chips', 'breaded fish']],
    ['chowder', 'Seafood / clam / corn chowder', 'meals', '1 bowl', 320, 14, 28, 17, 2.5, 2.2, 160, 10, 540, ['seafood chowder', 'clam chowder', 'corn chowder', 'fish chowder']],
    ['chili', 'Beef / bean chili', 'meals', '1 bowl', 360, 24, 32, 14, 9, 4.5, 95, 18, 720, ['chilli', 'chili con carne', 'turkey chili']],
    ['chickensoup', 'Chicken noodle soup', 'meals', '1 bowl', 190, 12, 22, 6, 2, 1.4, 35, 4, 360, ['chicken noodle soup', 'chicken soup', 'chicken rice soup']],
    ['tomatosoup', 'Tomato soup', 'meals', '1 bowl', 170, 4, 26, 6, 3, 1.2, 60, 22, 480, ['tomato soup', 'minestrone', 'vegetable soup']],
    ['broccolisoup', 'Broccoli cheddar / potato soup', 'meals', '1 bowl', 290, 10, 22, 18, 3, 1.1, 240, 28, 460, ['broccoli cheddar soup', 'broccoli soup', 'potato soup', 'split pea soup', 'squash soup']],
    ['burrito', 'Burrito / taco', 'meals', '1 medium', 460, 22, 48, 20, 7, 3.6, 210, 10, 520, ['tacos', 'taco', 'fish tacos', 'fajita', 'fajitas', 'enchilada', 'burrito bowl']],
    ['quesadilla', 'Cheese / chicken quesadilla', 'meals', '1 quesadilla', 420, 20, 36, 22, 2.5, 2.4, 320, 2, 240, ['quesadilla']],
    ['nachos', 'Loaded nachos', 'meals', '1 plate', 560, 18, 52, 32, 6, 2.5, 320, 8, 540, ['nachos']],
    ['friedrice', 'Fried rice', 'meals', '1 bowl', 360, 12, 52, 11, 2.5, 2.2, 45, 8, 240, ['fried rice', 'egg fried rice', 'garlic rice', 'chicken fried rice']],
    ['stirfry', 'Chicken / beef stir-fry', 'meals', '1 bowl', 420, 30, 36, 17, 4.5, 3.2, 95, 48, 680, ['stir fry', 'stir-fry', 'teriyaki chicken', 'orange chicken', 'sweet and sour chicken', 'ginger beef']],
    ['chowmein', 'Chow mein / lo mein / pad thai', 'meals', '1 bowl', 480, 18, 62, 18, 4, 3.0, 65, 16, 420, ['chow mein', 'lo mein', 'pad thai']],
    ['ramen', 'Ramen / pho / udon bowl', 'meals', '1 bowl', 460, 22, 58, 15, 3, 3.2, 60, 8, 520, ['ramen', 'pho', 'udon', 'instant noodles']],
    ['dumplings', 'Dumplings / gyoza / potstickers', 'meals', '6 pieces', 290, 12, 36, 10, 2, 1.8, 40, 4, 240, ['gyoza', 'potstickers', 'siomai', 'dim sum', 'spring roll', 'spring rolls', 'egg roll']],
    ['sushi', 'Sushi roll', 'meals', '6-8 pieces', 310, 12, 48, 7, 3, 1.8, 40, 6, 290, ['sushi', 'california roll', 'salmon roll', 'maki', 'poke bowl']],
    ['curry', 'Butter chicken / curry', 'meals', '1 bowl', 460, 28, 22, 28, 3.5, 3.2, 95, 14, 580, ['butter chicken', 'chicken curry', 'tikka masala', 'thai curry', 'japanese curry', 'korma']],
    ['shawarma', 'Shawarma / donair / gyro wrap', 'meals', '1 wrap', 560, 30, 48, 26, 4, 3.6, 140, 12, 560, ['donair', 'gyro', 'souvlaki', 'falafel wrap']],
    ['fries', 'French fries / potato wedges', 'meals', '1 medium serving', 310, 4, 41, 15, 3.8, 1.0, 20, 8, 570, ['french fries', 'fries', 'wedges', 'tater tots', 'onion rings']],
    ['hashbrowns', 'Hash browns', 'meals', '1 patty / cup', 180, 2.5, 22, 9.5, 2, 0.7, 15, 8, 360, ['hash browns', 'hash brown', 'home fries']],
    ['salad', 'Garden / Caesar / Greek salad', 'meals', '1 bowl', 180, 5, 10, 14, 3.5, 1.2, 85, 24, 360, ['caesar salad', 'garden salad', 'greek salad', 'cobb salad', 'green salad', 'side salad', 'coleslaw']],
    ['potatosalad', 'Potato / pasta salad', 'meals', '1 cup', 260, 5, 32, 12, 2.5, 1.2, 35, 10, 420, ['potato salad', 'pasta salad', 'macaroni salad']],
    ['stuffing', 'Stuffing / dressing', 'meals', '1 cup', 240, 5.5, 34, 9, 2.5, 2.0, 55, 2, 180, ['stuffing']],

    // Filipino family dishes (everyday home bowls / plates)
    ['nilaga', 'Nilaga (pork / beef soup with potatoes & cabbage)', 'filipino', '1 bowl', 380, 28, 24, 19, 3.5, 2.8, 65, 28, 760, ['nilagang baboy', 'nilagang baka', 'nilagang manok', 'pork nilaga', 'beef nilaga', 'bulalo']],
    ['tinola', 'Tinolang manok (chicken ginger soup)', 'filipino', '1 bowl', 310, 32, 14, 13, 2.5, 2.4, 75, 28, 620, ['chicken tinola', 'tinolang manok']],
    ['adobo', 'Chicken / pork adobo', 'filipino', '1 serving', 390, 34, 8, 24, 0.5, 2.0, 28, 2, 410, ['pork adobo', 'chicken adobo', 'adobong manok', 'adobong baboy']],
    ['sinigang', 'Sinigang na baboy / isda (tamarind soup)', 'filipino', '1 bowl', 360, 27, 16, 20, 3.5, 2.5, 85, 35, 680, ['sinigang na baboy', 'pork sinigang', 'sinigang na hipon', 'sinigang na isda']],
    ['sopas', 'Chicken sopas (creamy macaroni soup)', 'filipino', '1 bowl', 350, 22, 36, 13, 2.5, 2.0, 120, 10, 460, ['chicken sopas', 'macaroni sopas']],
    ['monggo', 'Ginisang monggo (mung bean stew)', 'filipino', '1 bowl', 290, 19, 38, 7, 11, 3.8, 95, 22, 650, ['munggo', 'mung bean', 'ginisang monggo']],
    ['arrozcaldo', 'Arroz caldo / lugaw (chicken rice porridge)', 'filipino', '1 bowl', 340, 24, 42, 8, 1.5, 2.2, 40, 4, 380, ['arroz caldo', 'lugaw', 'goto', 'congee']],
    ['pancit', 'Pancit bihon / canton', 'filipino', '1 plate', 380, 22, 52, 9, 3.5, 2.1, 55, 25, 420, ['pancit bihon', 'pancit canton', 'bihon', 'sotanghon', 'pancit palabok', 'palabok']],
    ['mami', 'Beef mami / batchoy / lomi', 'filipino', '1 bowl', 410, 24, 48, 13, 2.5, 2.8, 50, 8, 480, ['beef mami', 'chicken mami', 'batchoy', 'lomi']],
    ['giniling', 'Pork / beef giniling (picadillo)', 'filipino', '1 bowl', 380, 26, 20, 22, 3, 3.0, 45, 22, 580, ['pork giniling', 'beef giniling', 'picadillo', 'corned beef guisado', 'embutido']],
    ['kaldereta', 'Beef kaldereta / mechado / afritada / menudo', 'filipino', '1 bowl', 420, 30, 20, 24, 3, 3.5, 45, 32, 620, ['mechado', 'afritada', 'menudo', 'bistek', 'bistek tagalog', 'pares', 'beef pares']],
    ['karekare', 'Kare-kare (peanut oxtail / beef stew)', 'filipino', '1 bowl', 490, 28, 22, 32, 5, 3.2, 95, 22, 680, ['kare kare', 'kare-kare']],
    ['bicolexpress', 'Bicol express / ginataang manok', 'filipino', '1 bowl', 440, 24, 12, 34, 2.5, 2.2, 45, 14, 480, ['bicol express', 'ginataang manok', 'ginataang gulay', 'ginataang kalabasa', 'laing']],
    ['pinakbet', 'Pinakbet (mixed veggies & pork)', 'filipino', '1 bowl', 260, 14, 20, 14, 5.5, 2.2, 85, 34, 560, ['pakbet']],
    ['lumpia', 'Lumpiang shanghai / fresh lumpia', 'filipino', '4 pieces', 300, 14, 26, 16, 2, 1.8, 35, 8, 240, ['lumpiang shanghai', 'fresh lumpia']],
    ['sisig', 'Pork / chicken sisig', 'filipino', '1 serving', 460, 28, 6, 36, 0.5, 2.2, 25, 8, 380, ['pork sisig', 'chicken sisig', 'lechon kawali', 'lechon', 'crispy pata', 'dinuguan']],
    ['inihaw', 'Pork BBQ / inihaw na liempo', 'filipino', '2 skewers / 1 slice', 370, 28, 12, 23, 0, 1.6, 22, 0, 420, ['pork bbq', 'inihaw', 'inihaw na liempo', 'chicken inasal', 'inasal']],
    ['paksiw', 'Paksiw / pritong isda / daing na bangus', 'filipino', '1 serving', 320, 28, 6, 20, 0.5, 1.8, 65, 6, 520, ['daing na bangus', 'bangus', 'pritong isda', 'paksiw na isda', 'paksiw na pata', 'tilapia']],
    ['tortangtalong', 'Tortang talong (eggplant omelette)', 'filipino', '1 piece', 220, 13, 12, 14, 3.5, 1.8, 55, 4, 340, ['tortang talong']],
    ['longganisa', 'Silog / tocino / longganisa plate', 'filipino', '1 plate', 490, 22, 52, 21, 1, 2.2, 45, 2, 320, ['silog', 'tapsilog', 'tocilog', 'longsilog', 'bangsilog', 'tocino', 'tapa']],
    ['champorado', 'Champorado (chocolate rice porridge)', 'filipino', '1 bowl', 310, 6, 62, 4.5, 2.5, 2.2, 75, 0, 220, ['champorado']],
    ['pandesal', 'Pandesal', 'filipino', '2 small rolls', 190, 6, 36, 2.5, 1.5, 1.8, 40, 0, 85, ['pan de sal', 'ensaymada']],
    ['taho', 'Taho (silken tofu & arnibal)', 'filipino', '1 cup', 180, 9, 30, 3, 0.5, 1.5, 140, 0, 180, ['taho']],
    ['kakanin', 'Puto / bibingka / turon / halo-halo', 'filipino', '1 serving', 240, 4, 46, 5, 1.5, 1.0, 50, 4, 180, ['puto', 'bibingka', 'kutsinta', 'suman', 'turon', 'banana cue', 'halo halo', 'halo-halo']],

    // Proteins
    ['chicken', 'Chicken (breast / thigh)', 'protein', '120 g cooked', 210, 34, 0, 7.5, 0, 1.2, 16, 0, 310, ['chicken breast', 'chicken thigh', 'chicken thighs', 'roast chicken', 'rotisserie chicken', 'baked chicken', 'grilled chicken', 'manok']],
    ['turkey', 'Turkey (roast / deli / ground)', 'protein', '100 g', 155, 28, 1, 3.5, 0, 1.4, 18, 0, 280, ['deli turkey', 'roast turkey', 'ground turkey']],
    ['ham', 'Ham / deli meat', 'protein', '90 g', 145, 19, 2, 6.5, 0, 1.0, 12, 0, 310, ['deli ham', 'sliced ham', 'salami', 'pepperoni', 'bologna']],
    ['bacon', 'Bacon', 'protein', '2 slices', 90, 6, 0.2, 7, 0, 0.3, 3, 0, 95, ['bacon strips', 'peameal bacon']],
    ['sausage', 'Breakfast / dinner sausage', 'protein', '1 link', 170, 9, 1.5, 14, 0, 0.8, 14, 0, 165, ['sausages', 'pork sausage', 'turkey sausage', 'kielbasa', 'chorizo']],
    ['hotdog', 'Hot dog', 'protein', '1 frank', 170, 6.5, 2, 15, 0, 0.7, 15, 0, 130, ['hot dogs', 'wiener', 'smokie', 'corn dog']],
    ['salmon', 'Baked salmon', 'protein', '120 g cooked', 248, 26, 0, 15, 0, 0.9, 18, 0, 490, ['fish', 'trout', 'haddock', 'cod', 'halibut', 'baked fish', 'sardines', 'mackerel']],
    ['tuna', 'Canned light tuna', 'protein', '100 g drained', 116, 25.5, 0, 0.8, 0, 1.5, 11, 0, 237, ['light tuna', 'tuna salad']],
    ['shrimp', 'Cooked shrimp / seafood', 'protein', '100 g', 100, 24, 0.2, 0.3, 0, 0.5, 70, 0, 259, ['prawns', 'scallops', 'mussels', 'lobster', 'crab']],
    ['beef', 'Ground beef / lean steak', 'protein', '120 g cooked', 260, 30, 0, 15, 0, 3.1, 20, 0, 380, ['ground beef', 'steak', 'roast beef', 'beef patty', 'meatballs', 'lamb']],
    ['pork', 'Pork (tenderloin / chop / shoulder)', 'protein', '120 g cooked', 235, 28, 0, 13, 0, 1.2, 18, 0, 420, ['baboy', 'pork chop', 'pork chops', 'pork tenderloin', 'pork belly', 'pulled pork']],
    ['tofu', 'Firm tofu / tempeh', 'protein', '100 g', 144, 15.8, 3, 8.7, 2.3, 2.7, 350, 0, 237, ['bean curd', 'tempeh']],
    ['lentils', 'Cooked lentils', 'protein', '1 cup', 230, 18, 40, 0.8, 15.6, 6.6, 38, 3, 731, ['lentil', 'lentil soup', 'red lentils', 'daal', 'dal']],
    ['beans', 'Black / kidney / baked beans', 'protein', '1 cup', 225, 15, 41, 0.9, 15, 3.6, 46, 0, 611, ['black beans', 'chickpeas', 'kidney beans', 'pinto beans', 'baked beans', 'refried beans']],
    ['shake', 'Protein shake (1 scoop)', 'protein', '1 scoop', 130, 25, 3, 2, 0.5, 0.5, 120, 0, 180, ['whey', 'protein powder', 'smoothie']],

    // Snacks & Drinks (incl. toddler snacks)
    ['crackers', 'Crackers / Goldfish / Ritz', 'snacks', '1 small handful', 120, 2.5, 20, 3.5, 1, 0.8, 25, 0, 55, ['cracker', 'goldfish', 'ritz', 'saltines', 'triscuits', 'puffs', 'rice cake', 'rice cakes', 'mum mums']],
    ['cheesestring', 'Cheese string / Babybel', 'snacks', '1 piece', 70, 6, 0.5, 5, 0, 0.1, 160, 0, 20, ['cheese string', 'string cheese', 'babybel', 'cheese stick']],
    ['pouch', 'Fruit / applesauce / veggie pouch', 'snacks', '1 pouch', 70, 0.5, 17, 0.2, 2, 0.2, 10, 15, 160, ['applesauce pouch', 'fruit pouch', 'yogurt pouch', 'baby pouch']],
    ['pretzels', 'Pretzels', 'snacks', '1 small handful', 110, 3, 23, 1, 1, 1.2, 10, 0, 40, ['pretzel']],
    ['chips', 'Potato / tortilla chips', 'snacks', '1 small bowl (28 g)', 150, 2, 15, 9, 1.2, 0.5, 18, 4, 310, ['potato chips', 'tortilla chips', 'doritos', 'cheetos']],
    ['granolabar', 'Granola / protein bar', 'snacks', '1 bar', 190, 8, 24, 7, 3, 1.2, 60, 0, 140, ['granola bar', 'protein bar', 'clif bar', 'kind bar', 'fig bar', 'nutrigrain']],
    ['nuts', 'Mixed nuts / almonds / seeds', 'snacks', '1/4 cup (30 g)', 180, 6, 6, 16, 3, 1.1, 60, 0, 210, ['almonds', 'cashews', 'walnuts', 'peanuts', 'pistachios', 'pumpkin seeds', 'sunflower seeds', 'chia seeds', 'trail mix', 'mixed nuts']],
    ['popcorn', 'Popcorn', 'snacks', '3 cups popped', 110, 3, 19, 3, 3.5, 0.8, 3, 0, 80, ['popcorn']],
    ['muffin', 'Muffin / donut', 'snacks', '1 medium', 340, 5.5, 48, 14, 2, 1.8, 65, 1, 140, ['blueberry muffin', 'banana muffin', 'banana bread', 'donut', 'doughnut', 'timbit', 'timbits', 'cinnamon roll']],
    ['cookie', 'Cookie / brownie / cake', 'snacks', '1 medium', 160, 2, 22, 7.5, 0.8, 0.8, 12, 0, 55, ['cookies', 'brownie', 'cake', 'cupcake', 'pie', 'chocolate chip cookie']],
    ['chocolate', 'Chocolate (dark / milk)', 'snacks', '30 g', 160, 2.2, 17, 9.5, 2, 1.8, 45, 0, 140, ['dark chocolate', 'milk chocolate', 'chocolate bar']],
    ['icecream', 'Ice cream / frozen yogurt', 'snacks', '1/2 cup', 140, 2.5, 16, 7.5, 0.3, 0.1, 85, 0, 130, ['ice cream', 'gelato', 'frozen yogurt', 'popsicle', 'pudding']],
    ['coffee', 'Coffee with milk / latte', 'snacks', '1 cup', 60, 3, 5, 3, 0, 0, 95, 0, 180, ['latte', 'cappuccino', 'iced coffee', 'double double', 'hot chocolate']],
    ['oj', 'Orange / apple juice', 'snacks', '1 cup', 112, 1.5, 26, 0.4, 0.5, 0.4, 27, 90, 450, ['orange juice', 'apple juice', 'juice', 'soda', 'pop']],

    // Fruits & Vegetables
    ['banana', 'Banana', 'common', '1 medium', 105, 1.3, 27, 0.4, 3.1, 0.3, 6, 10, 422, ['bananas', 'mashed banana']],
    ['avocado', 'Avocado', 'common', '1/2 medium', 120, 1.5, 6.4, 11, 5, 0.4, 9, 8, 364, ['mashed avocado', 'guacamole']],
    ['berries', 'Mixed berries / blueberries / strawberries', 'produce', '1 cup', 70, 1, 17, 0.4, 4.5, 0.5, 18, 32, 160, ['blueberries', 'strawberries', 'raspberries', 'blackberries', 'strawberry', 'cherries']],
    ['apple', 'Apple / pear', 'produce', '1 medium', 95, 0.5, 25, 0.3, 4.4, 0.2, 11, 8, 195, ['apples', 'pear', 'pears', 'applesauce']],
    ['grapes', 'Grapes', 'produce', '1 cup', 104, 1.1, 27, 0.2, 1.4, 0.5, 15, 5, 288, ['grape', 'raisins', 'dates', 'dried cranberries']],
    ['melon', 'Watermelon / cantaloupe', 'produce', '1 cup', 50, 1, 12, 0.2, 0.9, 0.3, 12, 35, 280, ['watermelon', 'cantaloupe', 'honeydew']],
    ['pineapple', 'Pineapple / mango', 'produce', '1 cup', 82, 0.9, 22, 0.2, 2.3, 0.5, 21, 79, 180, ['mango', 'papaya']],
    ['peach', 'Peach / plum', 'produce', '1 medium', 59, 1.4, 14, 0.4, 2.2, 0.4, 9, 10, 285, ['peaches', 'plum', 'plums', 'nectarine', 'apricot']],
    ['orange', 'Orange / clementine / kiwi', 'produce', '1 medium', 62, 1.2, 15, 0.2, 3.1, 0.1, 52, 70, 237, ['clementine', 'mandarin', 'tangerine', 'grapefruit', 'kiwi']],
    ['broccoli', 'Broccoli (steamed / roasted)', 'produce', '1 cup', 55, 3.7, 11, 0.6, 5.1, 1.0, 62, 101, 457, ['steamed broccoli', 'brussels sprouts', 'asparagus']],
    ['cauliflower', 'Cauliflower / cabbage', 'produce', '1 cup', 27, 2.1, 5.3, 0.3, 2.1, 0.5, 24, 52, 320, ['cabbage', 'sauerkraut']],
    ['spinach', 'Spinach / kale / greens', 'produce', '1 cup', 24, 3, 3.7, 0.4, 2.2, 2.7, 100, 18, 420, ['malunggay', 'kale', 'bok choy', 'kangkong', 'greens', 'lettuce', 'arugula']],
    ['sweetpotato', 'Sweet potato', 'produce', '1 medium', 112, 2, 26, 0.1, 3.9, 0.8, 39, 22, 438, ['sweet potatoes', 'yam', 'mashed sweet potato', 'kamote', 'butternut squash', 'pumpkin']],
    ['potato', 'Potato', 'produce', '1 medium', 130, 3, 30, 0.2, 3, 1.1, 15, 20, 620, ['potatoes', 'mashed potato', 'mashed potatoes', 'baked potato', 'roasted potatoes', 'scalloped potatoes']],
    ['carrot', 'Carrots', 'produce', '1/2 cup', 27, 0.6, 6.4, 0.1, 1.8, 0.2, 22, 4, 205, ['carrots', 'steamed carrots', 'baby carrots', 'beets', 'turnip']],
    ['peas', 'Green peas / green beans', 'produce', '1/2 cup', 62, 4.1, 11, 0.3, 4.4, 1.2, 20, 12, 195, ['frozen peas', 'green beans', 'snow peas', 'snap peas', 'sitaw']],
    ['tomato', 'Tomato / tomato sauce', 'produce', '1/2 cup', 32, 1.3, 7, 0.2, 1.6, 0.6, 14, 16, 330, ['tomatoes', 'cherry tomatoes', 'pasta sauce', 'salsa']],
    ['bellpepper', 'Bell pepper', 'produce', '1/2 cup', 24, 0.8, 5.5, 0.2, 1.6, 0.3, 8, 95, 160, ['bell pepper', 'red pepper', 'green pepper', 'peppers']],
    ['mushroom', 'Mushrooms', 'produce', '1/2 cup', 15, 2.2, 2.3, 0.2, 0.7, 0.4, 2, 1, 220, ['mushrooms', 'eggplant']],
    ['cucumber', 'Cucumber / zucchini', 'produce', '1/2 cup', 12, 0.6, 2.5, 0.1, 0.6, 0.2, 10, 4, 110, ['zucchini', 'sayote', 'chayote', 'squash', 'celery', 'radish', 'pickles', 'olives']],
    ['corn', 'Corn / edamame', 'produce', '1/2 cup', 95, 5.5, 16, 2, 3, 1.1, 25, 5, 260, ['edamame', 'sweet corn', 'corn on the cob']]
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
    'pasta-meat':     { kcal: 590, pro: 36, carb: 64, fat: 20, fib: 8, iron: 4.2, ca: 140, vitc: 82, k: 840 },
    'lentil-soup':    { kcal: 410, pro: 20, carb: 62, fat: 9, fib: 17, iron: 7.4, ca: 110, vitc: 26, k: 980 },
    'salmon-tray':    { kcal: 540, pro: 32, carb: 46, fat: 25, fib: 9, iron: 3.4, ca: 145, vitc: 105, k: 1380 },
    'sheet-chicken':  { kcal: 520, pro: 36, carb: 44, fat: 22, fib: 7, iron: 2.8, ca: 115, vitc: 95, k: 1180 },
    'beef-broccoli':  { kcal: 560, pro: 34, carb: 58, fat: 21, fib: 6, iron: 4.6, ca: 95, vitc: 92, k: 890 },
    'tofu-veggie':    { kcal: 470, pro: 22, carb: 58, fat: 17, fib: 8, iron: 4.8, ca: 380, vitc: 30, k: 900 },
    'chicken-stirfry':{ kcal: 540, pro: 38, carb: 58, fat: 17, fib: 6, iron: 3.1, ca: 85, vitc: 65, k: 740 },
    'chicken-wrap':   { kcal: 450, pro: 36, carb: 30, fat: 19, fib: 4, iron: 2.6, ca: 120, vitc: 15, k: 600 },
    'egg-fried-rice': { kcal: 430, pro: 15, carb: 58, fat: 14, fib: 5, iron: 2.4, ca: 60, vitc: 10, k: 380 },
    'snack-yogurt':   { kcal: 340, pro: 23, carb: 40, fat: 11, fib: 4, iron: 0.7, ca: 230, vitc: 10, k: 700 },
    'snack-eggs':     { kcal: 165, pro: 13, carb: 4, fat: 10, fib: 1, iron: 1.9, ca: 60, vitc: 3, k: 300 },
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

  /* An AI estimate for one meal, checked before it is kept: no error reply, some calories, sane per-meal amounts,
     and calories that roughly agree with the macros (4 kcal/g protein and carbs, 9 kcal/g fat). Cleaned, or null. */
  function plausibleAi(obj) {
    if (!obj || typeof obj !== 'object' || obj.error) return null;
    var o = cleanNutri(obj);
    if (!o || !(o.kcal > 0) || o.kcal > 5000 || o.pro > 400 || o.carb > 600 || o.fat > 300) return null;
    var m = 4 * o.pro + 4 * o.carb + 9 * o.fat;
    if (m >= 60 && Math.abs(o.kcal - m) > 0.4 * Math.max(o.kcal, m)) return null;
    if (m === 0 && o.kcal > 60) return null; // calories with no macros at all: not an estimate to trust
    return o;
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

  /* Pre-compile static FOOD_DB match patterns once (longest phrase first) for fast offline matching. */
  var STATIC_PATTERNS = (function () {
    var list = [], seen = {};
    FOOD_DB.forEach(function (f) {
      var phrases = [f.name.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim(), f.id].concat(f.aliases);
      phrases.forEach(function (p) {
        var k = String(p || '').toLowerCase().trim();
        if (k.length < 2 || seen[k + '|' + f.id]) return;
        seen[k + '|' + f.id] = 1;
        list.push({
          phrase: k, id: f.id, name: f.name, nutri: f.nutri, serving: f.serving,
          re: new RegExp('(^|[^a-z])(' + escRe(k) + ')(?:$|[^a-z])', 'i')
        });
      });
    });
    list.sort(function (a, b) { return b.phrase.length - a.phrase.length; });
    return list;
  })();

  function buildPatterns(customFoods) {
    if (!Array.isArray(customFoods) || !customFoods.length) return STATIC_PATTERNS;
    var list = [];
    customFoods.forEach(function (cf) {
      if (!cf || !cf.name || !cf.nutri) return;
      var k = String(cf.name).toLowerCase().trim();
      if (k.length >= 2) {
        list.push({
          phrase: k, id: 'custom:' + cf.id, name: cf.name, nutri: cf.nutri, serving: cf.serving || '1 serving',
          re: new RegExp('(^|[^a-z])(' + escRe(k) + ')(?:$|[^a-z])', 'i')
        });
      }
    });
    if (!list.length) return STATIC_PATTERNS;
    var merged = list.concat(STATIC_PATTERNS);
    merged.sort(function (a, b) { return b.phrase.length - a.phrase.length; });
    return merged;
  }

  var NUM_RE = /(?:^|[\s,+&(])(\d+\s+(?:\d\/\d|[½¼¾])|\d+\/\d+|\d+(?:\.\d+)?|½|¼|¾|half|quarter)\s*(?:(?:an?)\s+)?(x|×|pcs?|pieces?|slices?|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|scoops?|bowls?)?\s*(?:of)?$/i;
  function parseNum(t) {
    t = String(t).toLowerCase();
    if (t === 'half' || t === '½') return 0.5;
    if (t === 'quarter' || t === '¼') return 0.25;
    if (t === '¾') return 0.75;
    var mixed = /^(\d+)\s+(\d\/\d|[½¼¾])$/.exec(t); if (mixed) return +mixed[1] + parseNum(mixed[2]);
    var fr = /^(\d+)\/(\d+)$/.exec(t); if (fr) return +fr[2] ? fr[1] / fr[2] : NaN;
    return parseFloat(t);
  }
  function tbspOf(n, unit) {
    unit = String(unit || '').toLowerCase();
    if (/^cups?$/.test(unit)) return n * 16;
    if (/^(tbsps?|tablespoons?)$/.test(unit)) return n;
    if (/^(tsps?|teaspoons?)$/.test(unit)) return n / 3;
    return 0;
  }
  function servingTbsp(serving) {
    var m = /^\s*(\d+\s+(?:\d\/\d|[½¼¾])|\d+\/\d+|\d+(?:\.\d+)?|½|¼|¾|half|quarter)\s*(cups?|tbsps?|tablespoons?|tsps?|teaspoons?)\b/i.exec(String(serving || ''));
    return m ? tbspOf(parseNum(m[1]), m[2]) : 0;
  }
  function countAt(text, idx, serving) {
    var raw = text.slice(Math.max(0, idx - 24), idx), pre = raw.replace(/\s+$/, ''), tail = raw.length - pre.length;
    var m = NUM_RE.exec(pre);
    if (!m) return { n: 1, len: 0 };
    var n = parseNum(m[1]);
    if (!isFinite(n) || n <= 0 || n > 8) return { n: 1, len: 0 };
    var typed = tbspOf(n, m[2]), per = servingTbsp(serving);
    if (typed && per) n = typed / per;
    return { n: Math.min(8, n), len: m[0].replace(/^[\s,+&(]/, '').length + tail };
  }

  function fmtMult(n) {
    var r = Math.round(n * 100) / 100;
    if (r === 1) return '';
    if (Math.abs(r - 0.5) < 0.01) return '½× ';
    if (Math.abs(r - 0.25) < 0.01) return '¼× ';
    return r + '× ';
  }

  function scaleSuffix(entry, scale) {
    if (entry.who === 'child') return ' (toddler portion × ' + (entry.ate || 'About half') + ')';
    if (entry.portion && entry.portion !== 'Regular' && scale !== 1) return ' (' + entry.portion + ' ×' + scale + ')';
    return '';
  }

  /* Estimate nutrition from a logged meal entry (or plain text). Returns { nutri, matched, summary, parts }. */
  function estimateEntry(entry, customFoods, recipes) {
    if (!entry || typeof entry !== 'object') return { nutri: zeroNutri(), matched: false, summary: '', parts: [] };
    var scale = entry.who === 'child'
      ? (CHILD_ATE_SCALE[entry.ate] != null ? CHILD_ATE_SCALE[entry.ate] : 0.5)
      : (PORTION_SCALE[entry.portion] || 1);

    if (entry.nutri && typeof entry.nutri === 'object') {
      var direct = zeroNutri();
      var mult = entry.nutriExact ? 1 : scale;
      addNutri(direct, entry.nutri, mult);
      var lbl = entry.nutriNote
        ? (entry.nutriSource === 'ai' ? 'AI estimate: ' : '') + entry.nutriNote
        : (entry.nutriSource === 'ai' ? 'Estimated by AI' : entry.nutriExact ? 'Custom numbers' : 'From food picker' + scaleSuffix(entry, scale));
      return { nutri: direct, matched: true, summary: lbl, parts: [] };
    }

    if (entry.recipeId && RECIPE_NUTRI[entry.recipeId]) {
      var rn = zeroNutri();
      addNutri(rn, RECIPE_NUTRI[entry.recipeId], entry.who === 'child' ? scale * CHILD_PORTION_BASE : scale);
      return { nutri: rn, matched: true, summary: 'Recipe estimate' + scaleSuffix(entry, scale), parts: [] };
    }

    var rawText = String(entry.who === 'child' ? entry.offered : entry.text || '').toLowerCase();
    if (!rawText.trim()) return { nutri: zeroNutri(), matched: false, summary: '', parts: [] };

    var patterns = buildPatterns(customFoods);
    var work = rawText;
    var tot = zeroNutri(), seenIds = {}, matched = 0, parts = [];
    if (Array.isArray(recipes)) {
      for (var ri = 0; ri < recipes.length; ri++) {
        var r = recipes[ri];
        if (!r || !r.title || !RECIPE_NUTRI[r.id]) continue;
        var ti = work.indexOf(r.title.toLowerCase());
        if (ti < 0) continue;
        addNutri(tot, RECIPE_NUTRI[r.id], 1);
        matched++;
        parts.push({ name: r.title, mult: 1, serving: '1 serving' });
        work = work.slice(0, ti) + ' '.repeat(r.title.length) + work.slice(ti + r.title.length);
        work = work.replace(/\(\s*soft,?\s*unsalted\s*\)/g, function (x) { return ' '.repeat(x.length); });
      }
    }
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (seenIds[p.id]) continue;
      if (work.indexOf(p.phrase) < 0) continue; // fast substring pre-check before regex
      var m = p.re.exec(work);
      if (m) {
        seenIds[p.id] = 1;
        matched++;
        var phraseIdx = m.index + m[1].length;
        var c = countAt(work, phraseIdx, p.serving);
        addNutri(tot, p.nutri, c.n);
        parts.push({ name: p.name, mult: c.n, serving: p.serving });
        var from = phraseIdx - c.len;
        work = work.slice(0, from) + ' '.repeat(c.len + m[2].length) + work.slice(phraseIdx + m[2].length);
      }
    }
    if (!matched) return { nutri: zeroNutri(), matched: false, summary: '', parts: [] };
    var finalScale = entry.who === 'child' ? scale * CHILD_PORTION_BASE : scale;
    var out = zeroNutri();
    addNutri(out, tot, finalScale);
    var desc = parts.map(function (pt) {
      return fmtMult(pt.mult) + (pt.serving ? pt.serving + ' ' : '') + pt.name;
    }).join(' + ');
    return { nutri: out, matched: true, summary: 'Matched: ' + desc + scaleSuffix(entry, scale), parts: parts };
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
      var est = estimateEntry(entry, state && state.customFoods, opts.recipes);
      if (est.matched) {
        daysSeen[entry.date] = 1;
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
    zeroNutri: zeroNutri, cleanNutri: cleanNutri, plausibleAi: plausibleAi, addNutri: addNutri, roundNutri: roundNutri,
    cleanTargets: cleanTargets, estimateEntry: estimateEntry, dailyNutrition: dailyNutrition, searchFoods: searchFoods
  };
  root.CookNutri = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
