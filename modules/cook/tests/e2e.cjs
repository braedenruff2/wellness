/* Cooking & family nutrition end-to-end tests (#cook, #cook/week, #cook/log, #cook/pantry). */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 17, 0) }); // Thu 5pm
  const { page, base } = t;

  await t.step('Home has Cooking card and quick Cook chip; navigates to #cook', async () => {
    await page.goto(base + '#home');
    await page.waitForSelector('.home-card[data-module="cook"]');
    assert.ok(await page.$('#wl-quick a[href="#cook"]'), 'quick Cook chip on Home');
    await page.click('.home-card[data-module="cook"] a[href="#cook"]');
    await page.waitForSelector('[data-ck-meal="dinner"]');
  });

  await t.step('Fridge spoilage alert -> Plan recipe -> Made it deducts fridge -> Mama cooked updates shopping list', async () => {
    await page.goto(base + '#cook/pantry');
    await page.waitForSelector('#ck-p-name');
    await page.fill('#ck-p-name', 'salmon');
    await page.fill('#ck-p-qty', '400');
    await page.fill('#ck-p-unit', 'g');
    await page.selectOption('#ck-p-cat', 'meat');
    await page.click('#ck-p-exp [data-pexp="2"]');
    await page.click('#ck-p-save');
    await page.waitForFunction(() => document.getElementById('ck-pantry-list').textContent.includes('salmon'));

    // Back on Today: Use soon banner suggests baked salmon
    await page.goto(base + '#cook');
    await page.waitForSelector('#ck-soon');
    assert.ok((await page.textContent('#ck-soon')).includes('salmon'));
    await page.click('#ck-soon [data-use-recipe="salmon-tray"]');
    assert.ok((await page.textContent('[data-ck-meal="dinner"]')).includes('baked salmon'));

    // Mark dinner Made it -> deducts 400g salmon to out
    await page.click('[data-ck-made="dinner"]');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="dinner"]').textContent.includes('Made'));
    const salmonAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).pantry.find((x) => x.name === 'salmon'));
    assert.strictEqual(salmonAfter.status, 'out');
    assert.strictEqual(salmonAfter.qty, 0);

    // Mark lunch Mama cooked: one tap (no system dialog), then what she made in the card's own field
    let dialogs = 0; const onDialog = (d) => { dialogs++; d.dismiss(); }; page.on('dialog', onDialog);
    await page.click('[data-ck-mama="lunch"]');
    await page.waitForSelector('#ck-mama-lunch');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'ck-mama-lunch', 'focus goes to the optional field');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-26'].lunch.status), 'mama');
    await page.fill('#ck-mama-lunch', 'Chicken tinola');
    await page.press('#ck-mama-lunch', 'Enter');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="lunch"] h3').textContent.includes('Chicken tinola'));
    assert.strictEqual(await page.inputValue('#ck-mama-lunch'), 'Chicken tinola', 'kept in the field');
    page.off('dialog', onDialog); assert.strictEqual(dialogs, 0, 'no window.prompt');
  });

  await t.step('Food log: log {child} Offered vs Actually ate + Me meal, view Ate well lately, delete log', async () => {
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-c-offered');
    await page.fill('#ck-c-offered', 'Soft scrambled egg and mashed avocado');
    await page.click('#ck-c-ate [data-cate="Most of it"]');
    await page.fill('#ck-c-note', 'Loved the avocado');
    await page.click('#ck-c-save');
    await page.waitForSelector('#ck-c-liked');
    assert.ok((await page.textContent('#ck-c-liked')).includes('Soft scrambled egg'));

    await page.fill('#ck-m-text', 'Baked salmon, spinach & potatoes');
    await page.click('#ck-m-portion [data-mport="Large"]');
    await page.click('#ck-m-tags [data-mtag="High protein"]');
    await page.click('#ck-m-tags [data-mtag="Workout fuel"]');
    await page.click('#ck-m-save');
    const listTxt = await page.textContent('#ck-log-list');
    assert.ok(listTxt.includes('Baked salmon, spinach & potatoes') && listTxt.includes('Large') && listTxt.includes('High protein'), listTxt);

    // Delete top entry
    const beforeCount = (await page.$$('.ck-log-del')).length;
    await page.click('.ck-log-del');
    assert.strictEqual((await page.$$('.ck-log-del')).length, beforeCount - 1);
  });

  await t.step('Shopping list Bought adds to fridge; AI week plan & fridge photo check work via WL.pc', async () => {
    await page.goto(base + '#cook/pantry');
    await page.waitForSelector('#ck-shop [data-buy="0"]');
    const firstItem = await page.textContent('#ck-shop li');
    await page.click('#ck-shop [data-buy="0"]');
    await page.waitForFunction(() => document.querySelector('#ck-shop li.is-done') !== null);
    const pantryTxt = await page.textContent('#ck-pantry-list');
    assert.ok(pantryTxt.length > 30 && firstItem.length > 0);

    // Stub WL.pc for AI plan & photo inventory check
    await page.evaluate(() => {
      window.WL.pc = Object.assign({}, window.WL.pc || {}, {
        canAsk: () => true,
        ready: () => true,
        queued: () => [],
        ask: (task, inp) => {
          window.__lastCookAsk = { task, inp };
          if (task === 'cook-photo') {
            return Promise.resolve({
              summary: 'Half carton of milk and fresh broccoli spotted.',
              items: [
                { name: 'milk', qty: 0.5, unit: 'L', status: 'low', cat: 'dairy', expiresInDays: 3, amount: 'about half left' },
                { name: 'broccoli', qty: 2, unit: 'heads', status: 'plenty', cat: 'produce', expiresInDays: 4, amount: '2 fresh heads' }
              ]
            });
          }
          if (task === 'cook-plan') {
            return Promise.resolve({
              note: 'High protein dinners for your Move days.',
              days: [{
                date: '2026-11-27',
                breakfast: { recipeId: 'eggs-toast', title: 'Soft scrambled eggs, spinach & toast' },
                lunch: { recipeId: 'tuna-rice', title: '10-minute tuna, avocado & cucumber rice bowl' },
                dinner: { title: 'Garlic lemon chicken & green beans', mins: 25, protein: '~40 g protein', ingredients: [{ name: 'chicken thighs', qty: 500, unit: 'g', cat: 'meat' }], steps: ['Bake at 400F for 25 min.'] }
              }]
            });
          }
          return Promise.reject(new Error('unexpected task ' + task));
        }
      });
    });

    // Upload a tiny valid 1x1 PNG for photo check
    const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
    await page.fill('#ck-photo-note', 'top shelf');
    await page.setInputFiles('#ck-photo-in', { name: 'fridge.png', mimeType: 'image/png', buffer: png1x1 });
    await page.waitForSelector('#ck-photo-res');
    assert.ok((await page.textContent('#ck-photo-res')).includes('Half carton of milk'));
    await page.click('#ck-photo-apply');
    await page.waitForFunction(() => !document.getElementById('ck-photo-res'));
    const pNames = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).pantry.map((x) => x.name));
    assert.ok(pNames.includes('milk') && pNames.includes('broccoli'), 'photo items applied to fridge: ' + pNames);
    // what the page shows keeps the plain "about half left" wording
    // a damaged answer (null items, HTML in a name, words for days, nothing usable) neither breaks the page nor says "Found 0"
    await page.evaluate(() => { const ask = window.WL.pc.ask; window.WL.pc.ask = (task, inp) => task === 'cook-photo' ? Promise.resolve({ summary: 'Odd', items: [null, { name: '<img src=x onerror=window.__x=1>', expiresInDays: 'soon', amount: '<b>2</b>' }, 7] }) : ask(task, inp); });
    await page.setInputFiles('#ck-photo-in', { name: 'fridge2.png', mimeType: 'image/png', buffer: png1x1 });
    await page.waitForSelector('#ck-photo-res');
    const res = await page.evaluate(() => ({ html: document.getElementById('ck-photo-res').innerHTML, x: window.__x, imgs: document.querySelectorAll('#ck-photo-res img').length }));
    assert.strictEqual(res.imgs, 0); assert.strictEqual(res.x, undefined);
    assert.ok(res.html.includes('&lt;img') && res.html.includes('&lt;b&gt;2') && !/~/.test(res.html), res.html);
    await page.click('#ck-photo-clear');
    await page.evaluate(() => {
      window.__photoClears = 0;
      window.WL.native = Object.assign({}, window.WL.native || {}, { clearFridgePhotos: () => { window.__photoClears++; } });
      const ask = window.WL.pc.ask;
      window.WL.pc.ask = (task, inp) => task === 'cook-photo' ? Promise.resolve({ summary: { junk: true }, items: [null, { name: '' }] }) : ask(task, inp);
    });
    await page.setInputFiles('#ck-photo-in', { name: 'fridge3.png', mimeType: 'image/png', buffer: png1x1 });
    await page.waitForFunction(() => /No food found/i.test(document.getElementById('view').textContent));
    const viewTxt = await page.textContent('#view');
    assert.ok(/No food found/i.test(viewTxt) && /could not identify any food/i.test(viewTxt) && !/Found 0/.test(viewTxt), viewTxt);
    assert.ok(!(await page.$('#ck-photo-res')));
    assert.strictEqual(await page.evaluate(() => window.__photoClears), 1, 'native clearFridgePhotos called after reading photo');
    // Also calls clearFridgePhotos if the chosen file cannot be read as an image
    await page.setInputFiles('#ck-photo-in', { name: 'not-img.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.waitForFunction(() => window.__photoClears === 2);
    assert.ok(/Please choose a photo/.test(await page.textContent('#view')));

    // Ask Claude for week plan
    await page.goto(base + '#cook/week');
    await page.waitForSelector('#ck-ai-plan');
    await page.click('#ck-ai-plan');
    await page.waitForFunction(() => document.getElementById('view').textContent.includes('Garlic lemon chicken'));

    // Stale cloud cook-plan answer (dates from last week) does not write stale dates or falsely toast success
    await page.evaluate(() => {
      window.__toasts = [];
      const origToast = WL.toast;
      WL.toast = function (m) { window.__toasts.push(m); return origToast(m); };
      const staleAns = {
        'req-stale-plan': {
          task: 'cook-plan',
          answer: {
            note: 'Old week note',
            days: [{ date: '2026-11-16', dinner: { title: 'Stale Last-Week Stew', steps: ['a'], ingredients: ['beef'] } }]
          }
        }
      };
      let taken = false;
      const origDs = WL.driveSync;
      WL.driveSync = Object.assign({}, origDs || {}, {
        answers: () => (taken ? {} : staleAns),
        takeAnswer: (id) => { if (id === 'req-stale-plan') taken = true; }
      });
      WL.pc.deliver();
      WL.driveSync = origDs;
      WL.toast = origToast;
    });
    await page.waitForFunction(() => /another week or incomplete/i.test(document.getElementById('view').textContent));
    const staleState = await page.evaluate(() => ({
      plan: JSON.parse(localStorage.getItem('wl.cook.v1')).plan,
      toasts: window.__toasts
    }));
    assert.strictEqual(staleState.plan.days['2026-11-16'], undefined, 'stale date not written into this week plan');
    assert.ok(!staleState.toasts.some((m) => /arrived|Updated/i.test(m)), 'no false success toast: ' + JSON.stringify(staleState.toasts));
  });

  await t.step('no overflow or tiny tap targets at 320 px and text size 1.3 across all Cooking tabs', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'dark', textSize: 1.3 })); WL.applyLook(); });
    for (const h of ['#cook', '#cook/week', '#cook/log', '#cook/pantry']) {
      await page.goto(base + h);
      await page.waitForTimeout(40);
      const r = await page.evaluate(() => {
        const over = document.documentElement.scrollWidth - window.innerWidth;
        const small = Array.from(document.querySelectorAll('#view button, #view a.btn, #view label.btn')).filter((e) => e.offsetParent !== null)
          .map((e) => ({ t: e.textContent.trim().slice(0, 25), h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right) }))
          .filter((x) => x.h < 44 || x.right > window.innerWidth + 1);
        return { over, small };
      });
      assert.strictEqual(r.over, 0, h + ' overflow: ' + r.over);
      assert.deepStrictEqual(r.small, [], h + ' small/cut buttons: ' + JSON.stringify(r.small));
    }
  });

  await t.step('Log for an earlier day in last week: #cook/log and #cook leave this week\'s plan and marks alone', async () => {
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-mama]');
    const meal = await page.getAttribute('[data-ck-mama]', 'data-ck-mama');
    await page.click('[data-ck-mama="' + meal + '"]');
    await page.waitForFunction((m) => { const s = JSON.parse(localStorage.getItem('wl.cook.v1')); return s.plan.days['2026-11-26'][m].status === 'mama'; }, meal);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan);
    await page.goto(base + '#home');
    await page.selectOption('#wl-logday', '2026-11-22'); // Sunday, last week
    for (const h of ['#cook/log', '#cook', '#cook/week', '#cook/pantry']) { await page.goto(base + h); await page.waitForSelector('.cook-sub, #view h1'); }
    await page.goto(base + '#cook'); await page.waitForSelector('[data-ck-meal]');
    const during = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan);
    assert.ok(!during.days['2026-11-22'], 'no stray Sunday in this week\'s plan');
    assert.strictEqual(during.week, before.week, 'still this week\'s plan');
    assert.strictEqual(during.days['2026-11-26'][meal].status, 'mama');
    await page.goto(base + '#home');
    if (await page.isVisible('#logday-back')) await page.click('#logday-back');
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-meal]');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan);
    assert.deepStrictEqual(after.days['2026-11-26'], before.days['2026-11-26']);
  });

  await t.step('a Filipino dish shows its Tagalog words, and 🔊 says them in the Tagalog voice', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.cook.v1'));
      s.plan.days['2026-11-26'].dinner = { recipeId: 'tinola', title: 'Tinolang manok (chicken & ginger soup)', status: 'planned', note: '' };
      localStorage.setItem('wl.cook.v1', JSON.stringify(s)); WL.modules.cook.reload && WL.modules.cook.reload();
    });
    await page.goto(base + '#home'); await page.reload(); await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-meal="dinner"] summary');
    await page.click('[data-ck-meal="dinner"] summary');
    const txt = await page.textContent('[data-ck-meal="dinner"] .ck-tl');
    assert.ok(txt.includes('In Tagalog:') && txt.includes('manok') && txt.includes('chicken') && txt.includes('sayote'), txt);
    await page.evaluate(() => { window.__said = []; WL.speech.speak = (text, done, o) => { window.__said.push([text, o && o.lang]); }; });
    await page.click('[data-ck-meal="dinner"] [data-tl-say="luya"]');
    assert.deepStrictEqual(await page.evaluate(() => window.__said), [['luya', 'fil-PH']]);
  });
  await t.step('after "Made it" on a Filipino dish, its Tagalog words can join Tagalog review (once)', async () => {
    await page.evaluate(() => localStorage.setItem('wl.tagalog.v1', JSON.stringify({ packs: {}, done: { '2026-11-18/1': '2026-11-19T01:00:00.000Z' }, cards: {}, answers: [], source: 'https://example.org/keep-me/', future: { kept: true } })));
    await page.click('[data-ck-made="dinner"]');
    await page.waitForSelector('[data-ck-tl-add="tinola"]');
    assert.ok((await page.textContent('[data-ck-tl-add="tinola"]')).includes('Add 6 Tagalog words'));
    await page.click('[data-ck-tl-add="tinola"]');
    await page.waitForSelector('.ck-tl-added');
    const tl = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    assert.deepStrictEqual(Object.keys(tl).sort(), ['luya', 'malunggay', 'manok', 'patis', 'sabaw', 'sayote']);
    assert.strictEqual(tl.manok.from, 'cook/tinola'); assert.strictEqual(tl.manok.due, '2026-11-27');
    const all = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')));
    assert.deepStrictEqual([all.source, all.future, Object.keys(all.done)], ['https://example.org/keep-me/', { kept: true }, ['2026-11-18/1']], 'nothing else in his Tagalog data changes');
    await page.goto(base + '#tagalog/words'); await page.waitForTimeout(100);
    assert.ok((await page.textContent('#view')).includes('sayote'), 'listed in Your words');
    assert.ok((await page.textContent('#view')).includes('from Tinolang manok'), 'says where it came from');
  });

  await t.step('#cook/week inline recipe preview expands ingredients, steps & Filipino Tagalog words, hides when Mama cooked, and fits 320 px / 1.3x', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1.3 })); WL.applyLook(); });
    await page.goto(base + '#cook/week');
    const slotSel = '[data-wk-slot="2026-11-26|dinner"]';
    await page.waitForSelector(slotSel + ' summary');
    await page.click(slotSel + ' summary');
    const txt = await page.textContent(slotSel);
    assert.ok(txt.includes('Ingredients:') && txt.includes('In Tagalog:') && txt.includes('manok') && txt.includes('sayote'), txt);
    await page.evaluate(() => { window.__said = []; WL.speech.speak = (text, done, o) => { window.__said.push([text, o && o.lang]); }; });
    await page.click(slotSel + ' [data-tl-say="manok"]');
    assert.deepStrictEqual(await page.evaluate(() => window.__said), [['manok', 'fil-PH']]);
    const check320 = await page.evaluate((sel) => {
      const over = document.documentElement.scrollWidth - window.innerWidth;
      const small = Array.from(document.querySelectorAll(sel + ' summary, ' + sel + ' button')).filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 25), h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right) }))
        .filter((x) => x.h < 44 || x.right > window.innerWidth + 1);
      return { over, small };
    }, slotSel);
    assert.strictEqual(check320.over, 0, '#cook/week expanded overflow: ' + check320.over);
    assert.deepStrictEqual(check320.small, [], '#cook/week expanded small/cut targets: ' + JSON.stringify(check320.small));
    // Expand another slot's preview and verify Swap / Mama / Skip preserve open <details> & restore focus
    const otherSel = '[data-wk-slot="2026-11-26|lunch"]';
    if (await page.$(otherSel + ' summary')) await page.click(otherSel + ' summary');
    else {
      await page.click('[data-wk-mama="2026-11-26|lunch"]');
      await page.waitForSelector(otherSel + ' summary');
      await page.click(otherSel + ' summary');
    }
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'other preview opened');
    await page.click('[data-wk-swap="2026-11-26|dinner"]');
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'Swap keeps other preview open');
    assert.strictEqual(await page.$eval(slotSel + ' details', (el) => el.open), true, 'Swap keeps swapped slot preview open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-wk-swap')), '2026-11-26|dinner', 'Swap restores focus');

    // Marking the slot Mama hides the recipe preview while keeping other previews open & restoring focus; Undo Mama restores it
    await page.click('[data-wk-mama="2026-11-26|dinner"]');
    assert.strictEqual(await page.$(slotSel + ' details'), null, 'Mama slot hides recipe preview');
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'Mama keeps other preview open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-wk-mama')), '2026-11-26|dinner', 'Mama restores focus');
    await page.click('[data-wk-mama="2026-11-26|dinner"]');
    await page.waitForSelector(slotSel + ' details');
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'Undo Mama keeps other preview open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-wk-mama')), '2026-11-26|dinner', 'Undo Mama restores focus');
    // Skip / Undo skip also preserve other open previews & restore focus
    await page.click('[data-wk-skip="2026-11-26|dinner"]');
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'Skip keeps other preview open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-wk-skip')), '2026-11-26|dinner', 'Skip restores focus');
    await page.click('[data-wk-skip="2026-11-26|dinner"]');
    await page.waitForSelector(slotSel + ' details');
    assert.strictEqual(await page.$eval(otherSel + ' details', (el) => el.open), true, 'Undo skip keeps other preview open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-wk-skip')), '2026-11-26|dinner', 'Undo skip restores focus');
  });

  await t.step('Fridge category filter chips appear at 10+ items, filter accurately, and stay clean at 320 px / 1.3x', async () => {
    // Under 10 items: no filter chips
    await page.goto(base + '#cook/pantry');
    await page.waitForSelector('#ck-pantry-list');
    assert.strictEqual(await page.$('#ck-pantry-cats'), null, 'hidden under 10 items');

    // Seed 10 pantry items across categories (none frozen)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.cook.v1'));
      const d = new Date(2026, 10, 26, 17, 0);
      s.pantry = [];
      const seed = [
        ['Spinach', 'produce'], ['Broccoli', 'produce'], ['Carrots', 'produce'],
        ['Chicken thighs', 'meat'], ['Ground beef', 'meat'],
        ['Milk', 'dairy'], ['Eggs', 'dairy'], ['Greek yogurt', 'dairy'],
        ['Rolled oats', 'pantry'], ['Jasmine rice', 'pantry']
      ];
      seed.forEach(([name, cat]) => CookCore.addPantryItem(s, { name, cat, status: 'plenty' }, d));
      localStorage.setItem('wl.cook.v1', JSON.stringify(s));
      WL.modules.cook.reload();
    });
    await page.goto(base + '#cook'); await page.goto(base + '#cook/pantry');
    await page.waitForSelector('#ck-pantry-cats');
    assert.strictEqual((await page.$$('#ck-pantry-list li')).length, 10);

    // Filter to Meat & protein -> 2 items, update status preserves active filter
    await page.click('#ck-pantry-cats [data-pcat="meat"]');
    assert.strictEqual(await page.getAttribute('#ck-pantry-cats [data-pcat="meat"]', 'aria-pressed'), 'true');
    assert.strictEqual((await page.$$('#ck-pantry-list li')).length, 2);
    assert.ok((await page.textContent('#ck-pantry-list h3')).includes('2 of 10'));
    await page.click('#ck-pantry-list [data-pst$="|low"]');
    assert.strictEqual((await page.$$('#ck-pantry-list li')).length, 2, 'filter preserved after status update');
    assert.ok((await page.textContent('#ck-pantry-list')).includes('low'));

    // Empty category (Frozen) shows clear empty message
    await page.click('#ck-pantry-cats [data-pcat="frozen"]');
    assert.strictEqual((await page.$$('#ck-pantry-list li')).length, 0);
    assert.ok((await page.textContent('#ck-pantry-empty')).includes('No items in Frozen'));

    // 320 px / 1.3x overflow and 44 px tap targets on filter chips
    await page.click('#ck-pantry-cats [data-pcat="all"]');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'night', textSize: 1.3 })); WL.applyLook(); });
    const a11y = await page.evaluate(() => {
      const over = document.documentElement.scrollWidth - window.innerWidth;
      const small = Array.from(document.querySelectorAll('#ck-pantry-cats button')).map((e) => ({
        t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height), right: Math.round(e.getBoundingClientRect().right)
      })).filter((x) => x.h < 44 || x.right > window.innerWidth + 1);
      return { over, small };
    });
    assert.strictEqual(a11y.over, 0, 'overflow: ' + a11y.over);
    assert.deepStrictEqual(a11y.small, [], 'chip targets: ' + JSON.stringify(a11y.small));

    // Removing one item drops below 10 -> filter hides cleanly and all 9 items show
    await page.click('#ck-pantry-cats [data-pcat="meat"]');
    await page.click('#ck-pantry-list [data-pdel]');
    assert.strictEqual(await page.$('#ck-pantry-cats'), null, 'hidden again under 10 items');
    assert.strictEqual((await page.$$('#ck-pantry-list li')).length, 9);
  });

  await t.step('Flexible schedule ("Not making" skip + Mama quick chips + 1-tap log) on Today and Week', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1 })); WL.applyLook(); });
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-meal="breakfast"]');

    // Skip breakfast ("Not making") -> collapses card cleanly; Back to plan restores it
    if (await page.$('[data-ck-reset="breakfast"]')) await page.click('[data-ck-reset="breakfast"]');
    await page.click('[data-ck-skip="breakfast"]');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="breakfast"]').textContent.includes('Not making'));
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).plan.days['2026-11-26'].breakfast.status), 'skipped');
    await page.click('[data-ck-reset="breakfast"]');
    await page.waitForSelector('[data-ck-skip="breakfast"]');

    // Mama cooked -> 1-tap Filipino dish chip -> Log to food log -> updates #ck-today-targets
    if (await page.$('[data-ck-mama="breakfast"]')) await page.click('[data-ck-mama="breakfast"]');
    await page.waitForSelector('[data-ck-mama-pick="breakfast|Sinigang na baboy"]');
    await page.click('[data-ck-mama-pick="breakfast|Sinigang na baboy"]');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="breakfast"] h3').textContent.includes('Sinigang'));
    await page.click('[data-ck-logmeal="breakfast"]');
    await page.waitForSelector('#ck-today-targets');
    assert.ok((await page.textContent('#ck-today-targets')).includes('kcal'), 'today target summary appears after logging');
    // 393: logged once; the card says so instead of offering a second copy
    await page.waitForSelector('[data-ck-logged="breakfast"]');
    assert.strictEqual(await page.$('[data-ck-logmeal="breakfast"]'), null, 'no second Log button');
    const bLogs = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.cook.v1')).logs.filter((x) => x.who === 'me' && x.date === '2026-11-26' && x.meal === 'breakfast'));
    assert.strictEqual(bLogs.length, 1, JSON.stringify(bLogs));
    // 401: removing that meal from the food log brings "Log to food log" back and the day's numbers follow
    const tgtBefore = await page.textContent('#ck-today-targets');
    await page.goto(base + '#cook/log');
    await page.waitForSelector('.ck-log-del[data-id="' + bLogs[0].id + '"]');
    await page.click('.ck-log-del[data-id="' + bLogs[0].id + '"]');
    await page.waitForFunction((id) => !document.querySelector('.ck-log-del[data-id="' + id + '"]'), bLogs[0].id);
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-logmeal="breakfast"]');
    assert.strictEqual(await page.$('[data-ck-logged="breakfast"]'), null, 'no "In your food log" after removing it');
    const tgtAfter = (await page.$('#ck-today-targets')) ? await page.textContent('#ck-today-targets') : '';
    assert.notStrictEqual(tgtAfter, tgtBefore, 'today\'s numbers changed: ' + tgtAfter);
    if (tgtAfter) assert.ok(!tgtAfter.includes('Me: ' + /Me: (\d+) kcal/.exec(tgtBefore)[1] + ' kcal'), 'the removed meal no longer counts');
    await page.click('[data-ck-logmeal="breakfast"]'); // logged again for the steps below
    await page.waitForSelector('[data-ck-logged="breakfast"]');
    // 393: "Use today's dinner" never fills a dinner marked Not making
    if (await page.$('[data-ck-reset="dinner"]')) await page.click('[data-ck-reset="dinner"]');
    await page.waitForSelector('[data-ck-skip="dinner"]');
    await page.click('[data-ck-skip="dinner"]');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="dinner"]').textContent.includes('Not making'));
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-m-text');
    assert.strictEqual(await page.$('#ck-m-same'), null, 'no "Use today’s dinner" for a skipped dinner');
    assert.strictEqual(await page.$('#ck-c-same'), null);
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-reset="dinner"]');
    await page.click('[data-ck-reset="dinner"]');
    await page.waitForSelector('[data-ck-skip="dinner"]');

    // Week tab: Skip hides recipe preview & Swap; Undo skip restores it
    await page.goto(base + '#cook/week');
    const wkSlot = '[data-wk-slot="2026-11-27|dinner"]';
    await page.waitForSelector('[data-wk-skip="2026-11-27|dinner"]');
    await page.click('[data-wk-skip="2026-11-27|dinner"]');
    await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('Not making'), wkSlot);
    assert.strictEqual(await page.$(wkSlot + ' details'), null, 'skipped week slot hides recipe preview');
    await page.click('[data-wk-skip="2026-11-27|dinner"]');
    await page.waitForSelector(wkSlot + ' details');
  });

  await t.step('Cronometer target graphs (Me & {child}, Day/7d, micro, custom targets), quick chips, Food Picker modal, and Pantry 1-tap staples', async () => {
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-targets');

    // Quick-add chip + Save updates Me target bars
    await page.click('#ck-m-quick [data-mquick="2 eggs & toast"]');
    await page.click('#ck-m-quick [data-mquick="Protein shake"]');
    assert.ok((await page.inputValue('#ck-m-text')).includes('2 eggs & toast, Protein shake'));
    await page.click('#ck-m-save');
    await page.waitForFunction(() => document.querySelector('#ck-targets [data-tbar="kcal"]').textContent.includes('kcal'));
    const meKcalTxt = await page.textContent('#ck-targets [data-tbar="kcal"]');
    assert.ok(/\/ 2200 kcal/.test(meKcalTxt), meKcalTxt);

    // Toggle 7-day avg, open More nutrients, customize and reset targets
    await page.click('[data-ck-trange="7d"]');
    assert.strictEqual(await page.getAttribute('[data-ck-trange="7d"]', 'aria-pressed'), 'true');
    await page.click('#ck-micro summary');
    assert.ok(await page.$('#ck-targets [data-tbar="iron"]'), 'micronutrient bars visible when expanded');
    await page.click('#ck-tedit summary');
    await page.fill('#ck-tedit [data-ck-tval="kcal"]', '2400');
    await page.click('#ck-t-save');
    await page.waitForFunction(() => document.querySelector('#ck-targets [data-tbar="kcal"]').textContent.includes('/ 2400 kcal'));
    await page.click('#ck-tedit summary');
    await page.click('#ck-t-reset');
    await page.waitForFunction(() => document.querySelector('#ck-targets [data-tbar="kcal"]').textContent.includes('/ 2200 kcal'));

    // Food Picker modal for Me: search, add food, save custom food, Log now
    await page.click('#ck-m-pick');
    await page.waitForSelector('#ck-food-modal');
    await page.fill('#ck-food-q', 'salmon');
    await page.waitForSelector('#ck-food-results [data-fadd="salmon"]');
    await page.click('#ck-food-results [data-fadd="salmon"]');
    await page.waitForSelector('#ck-food-picked');
    // 397: after + Add redraws the box, focus is back on that same + Add button (not <body>)
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fadd')), 'salmon');
    // 397: Tab and Shift+Tab stay inside the dialog
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => !!document.activeElement.closest('#ck-food-modal')), 'Tab left the dialog after ' + (i + 1));
    }
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('#ck-food-modal')));
    await page.click('#ck-cf-add summary');
    await page.fill('#ck-cf-name', 'Protein bar');
    await page.fill('#ck-cf-kcal', '200');
    await page.fill('#ck-cf-pro', '20');
    await page.click('#ck-cf-save');
    await page.waitForFunction(() => document.getElementById('ck-food-picked').textContent.includes('Protein bar'));
    await page.click('#ck-food-log');
    await page.waitForFunction(() => !document.getElementById('ck-food-modal'));
    assert.ok((await page.textContent('#ck-log-list')).includes('Protein bar'));

    // Task 353: custom food Remove button inside #ck-food-modal is >= 44px tall and cleans both customFoods & picked
    await page.click('#ck-m-pick');
    await page.waitForSelector('#ck-food-modal');
    await page.click('#ck-food-cats [data-fcat="custom"]');
    await page.waitForSelector('#ck-food-results [data-fdel]');
    const fdelBox = await page.locator('#ck-food-results [data-fdel]').first().boundingBox();
    assert.ok(fdelBox && fdelBox.height >= 44, 'custom food Remove button >= 44px tall: ' + JSON.stringify(fdelBox));
    await page.click('#ck-food-results [data-fadd^="custom:"]');
    await page.waitForSelector('#ck-food-picked');
    await page.click('#ck-food-results [data-fdel]');
    await page.waitForFunction(() => !document.getElementById('ck-food-picked') && !document.querySelector('#ck-food-results [data-fdel]'));
    assert.strictEqual(await page.evaluate(() => (JSON.parse(localStorage.getItem('wl.cook.v1')).customFoods || []).length), 0, 'custom food deleted from storage');
    await page.click('#ck-food-close');
    await page.waitForFunction(() => !document.getElementById('ck-food-modal'));

    // Task 354: toggling Me/{child} and Day/7-day avg redraws only #ck-targets-wrap, preserving drafts, #ck-micro open state & chip focus
    await page.fill('#ck-c-offered', 'Draft toddler pears');
    await page.fill('#ck-m-text', 'Draft adult stir-fry');
    await page.click('#ck-micro summary');
    assert.strictEqual(await page.evaluate(() => document.getElementById('ck-micro').open), true);
    await page.click('#ck-targets [data-ck-twho="child"]');
    assert.strictEqual(await page.inputValue('#ck-c-offered'), 'Draft toddler pears', '#ck-c-offered draft preserved');
    assert.strictEqual(await page.inputValue('#ck-m-text'), 'Draft adult stir-fry', '#ck-m-text draft preserved');
    assert.strictEqual(await page.evaluate(() => document.getElementById('ck-micro').open), true, '#ck-micro stayed open');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ck-twho')), 'child', 'focus restored to child toggle');
    await page.click('#ck-targets [data-ck-trange="7d"]');
    assert.strictEqual(await page.inputValue('#ck-c-offered'), 'Draft toddler pears');
    assert.strictEqual(await page.evaluate(() => document.getElementById('ck-micro').open), true, '#ck-micro stayed open on range switch');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ck-trange')), '7d', 'focus restored to 7d toggle');
    await page.click('#ck-targets [data-ck-trange="day"]');
    await page.click('#ck-targets [data-ck-twho="me"]');
    await page.fill('#ck-c-offered', '');
    await page.fill('#ck-m-text', '');

    // {child} target graph + quick chip + Food Picker modal Add to box + Escape / FCBack close
    await page.click('#ck-c-pick');
    await page.waitForSelector('#ck-food-modal');
    await page.click('#ck-food-cats [data-fcat="produce"]');
    await page.click('#ck-food-results [data-fadd="broccoli"]');
    await page.click('#ck-food-fill');
    await page.waitForFunction(() => !document.getElementById('ck-food-modal'));
    assert.ok((await page.inputValue('#ck-c-offered')).includes('Broccoli'));
    await page.click('#ck-c-quick [data-cquick="Banana"]');
    await page.click('#ck-c-ate [data-cate="Most of it"]');
    await page.click('#ck-c-save');
    await page.waitForFunction(() => document.querySelector('[data-ck-twho="child"]').getAttribute('aria-pressed') === 'true');
    const childBar = await page.textContent('#ck-targets [data-tbar="kcal"]');
    assert.ok(/\/ 900 kcal/.test(childBar) && !/^Energy0 \/ 900/.test(childBar), childBar);

    // Escape & Android FCBack close modal and restore focus
    await page.click('#ck-c-pick');
    await page.waitForSelector('#ck-food-modal');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ck-food-modal'));
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'ck-c-pick', 'Escape restores focus to picker button');
    await page.click('#ck-m-pick');
    await page.waitForSelector('#ck-food-modal');
    assert.strictEqual(await page.evaluate(() => window.FCBack()), true, 'FCBack consumes Back when food modal is open');
    assert.strictEqual(await page.$('#ck-food-modal'), null);

    // Pantry 1-tap staple quick chip adds straight to fridge
    await page.goto(base + '#cook/pantry');
    await page.waitForSelector('#ck-p-quick [data-pquick^="Avocado"]');
    await page.click('#ck-p-quick [data-pquick^="Avocado"]');
    await page.waitForFunction(() => document.getElementById('ck-pantry-list').textContent.includes('Avocado'));
  });

  await t.step('387: AI meal plan Filipino dish with words shows "In Tagalog", offers "Add N Tagalog words" after Made it, and names the dish in Your words', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.cook.v1'));
      s.plan.days['2026-11-26'].dinner = { recipeId: null, title: '', status: 'planned', note: '' };
      const ok = CookCore.applyAiPlan(s, {
        note: 'Filipino family night.',
        days: [{
          date: '2026-11-26',
          dinner: {
            title: 'Kare-kare (peanut stew)', mins: 45, protein: '~32 g protein',
            ingredients: [{ name: 'peanut butter', qty: 4, unit: 'tbsp', cat: 'pantry' }, { name: 'eggplant', qty: 1, unit: 'pcs', cat: 'produce' }],
            steps: ['Simmer meat until tender.', 'Stir in peanut sauce and eggplant.'],
            words: [{ tl: 'mani', en: 'peanut' }, { tl: 'talong', en: 'eggplant' }, { tl: 'bagoong', en: 'shrimp paste' }]
          }
        }]
      }, new Date(2026, 10, 26, 12, 0));
      if (!ok) throw new Error('applyAiPlan returned false');
      localStorage.setItem('wl.cook.v1', JSON.stringify(s));
      if (WL.modules.cook && WL.modules.cook.reload) WL.modules.cook.reload();
    });
    await page.goto(base + '#cook');
    await page.waitForSelector('[data-ck-meal="dinner"] summary');
    assert.ok((await page.textContent('[data-ck-meal="dinner"] h3')).includes('Kare-kare'));
    await page.click('[data-ck-meal="dinner"] summary');
    const tlTxt = await page.textContent('[data-ck-meal="dinner"] .ck-tl');
    assert.ok(tlTxt.includes('In Tagalog:') && tlTxt.includes('mani') && tlTxt.includes('peanut') && tlTxt.includes('talong') && tlTxt.includes('eggplant'), tlTxt);
    await page.evaluate(() => { window.__said = []; WL.speech.speak = (text, done, o) => { window.__said.push([text, o && o.lang]); }; });
    await page.click('[data-ck-meal="dinner"] [data-tl-say="talong"]');
    assert.deepStrictEqual(await page.evaluate(() => window.__said), [['talong', 'fil-PH']]);

    await page.click('[data-ck-made="dinner"]');
    const addSel = '[data-ck-tl-add="ai-2026-11-26-dinner"]';
    await page.waitForSelector(addSel);
    assert.ok((await page.textContent(addSel)).includes('Add 3 Tagalog words'), await page.textContent(addSel));
    await page.click(addSel);
    await page.waitForSelector('[data-ck-meal="dinner"] .ck-tl-added');
    const addedTxt = await page.textContent('[data-ck-meal="dinner"] .ck-tl-added');
    assert.ok(addedTxt.includes('mani') && addedTxt.includes('talong') && addedTxt.includes('bagoong'), addedTxt);
    const tlCards = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    assert.strictEqual(tlCards.talong && tlCards.talong.from, 'cook/ai-2026-11-26-dinner');
    assert.strictEqual(tlCards.mani && tlCards.mani.from, 'cook/ai-2026-11-26-dinner');

    await page.goto(base + '#tagalog/words');
    await page.waitForSelector('#view h1');
    const wordsTxt = await page.textContent('#view');
    assert.ok(wordsTxt.includes('talong') && wordsTxt.includes('from Kare-kare'), 'AI dish title shown in Your words: ' + wordsTxt.slice(0, 400));
  });

  await t.step('Food log shows transparent matched breakdown (incl. white brioche), inline Edit numbers override, and Estimate with AI', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'light', textSize: 1 }));
      WL.applyLook();
      window.WL.pc = Object.assign({}, window.WL.pc || {}, {
        canAsk: () => true,
        ready: () => true,
        queued: () => [],
        ask: (task, inp) => {
          if (task === 'cook-nutri') {
            return Promise.resolve({
              kcal: 430, pro: 15, carb: 46, fat: 21, fib: 4, iron: 2.1, ca: 90, vitc: 0, k: 290,
              breakdown: '2 slices white brioche (240 kcal) + 2 tbsp peanut butter (190 kcal)'
            });
          }
          return Promise.reject(new Error('unexpected ' + task));
        }
      });
    });
    await page.goto(base + '#cook/log');
    await page.waitForSelector('#ck-m-text');
    await page.fill('#ck-m-text', 'peanut butter on toast');
    await page.click('#ck-m-save');
    await page.waitForSelector('#ck-log-list .ck-est-why');
    const firstLi = page.locator('#ck-log-list li').first();
    const why = await firstLi.locator('.ck-est-why').textContent();
    assert.ok(/Matched:/.test(why) && /Peanut butter/i.test(why) && /White \/ brioche bread/i.test(why), why);

    // Inline Edit numbers -> updates targets immediately; Use auto-estimate reverts cleanly
    await firstLi.locator('[data-log-edit]').click();
    await firstLi.locator('.ck-ed-kcal').fill('480');
    await firstLi.locator('.ck-ed-pro').fill('18');
    await firstLi.locator('.ck-ed-save').click();
    await page.waitForFunction(() => document.querySelector('#ck-log-list li .ck-est-why').textContent.includes('Edited numbers'));
    assert.ok((await firstLi.textContent()).includes('~480 kcal, 18 g pro'));
    await firstLi.locator('[data-log-edit]').click();
    await firstLi.locator('.ck-ed-auto').click();
    await page.waitForFunction(() => document.querySelector('#ck-log-list li .ck-est-why').textContent.includes('Matched:'));

    // Estimate with AI -> applies breakdown & exact macros
    await firstLi.locator('[data-log-ai]').click();
    await page.waitForFunction(() => document.querySelector('#ck-log-list li .ck-est-why').textContent.includes('2 slices white brioche'));
    assert.ok((await firstLi.textContent()).includes('~430 kcal, 15 g pro'));
  });

  await t.step('a meal logged with the food picker has no "Use auto-estimate" (it would throw the picked amounts away) (407)', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.cook.v1'));
      s.logs.unshift({ id: 'pick-1', date: '2026-11-26', at: new Date().toISOString(), who: 'me', meal: 'snack', text: 'Banana, Yogurt', portion: 'Regular',
        nutri: { kcal: 250, pro: 10, carb: 45, fat: 3, fib: 3, iron: 0.3, ca: 200, vitc: 10, k: 600 }, nutriSource: 'picker' });
      localStorage.setItem('wl.cook.v1', JSON.stringify(s));
    });
    await page.goto(base + '#home'); await page.goto(base + '#cook/log');
    await page.reload();
    await page.waitForSelector('[data-log-edit="pick-1"]');
    await page.click('[data-log-edit="pick-1"]');
    await page.waitForSelector('.ck-ed-save');
    assert.strictEqual(await page.locator('.ck-ed-auto').count(), 0);
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('cook e2e');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
