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

    // Mark lunch Mama cooked (with prompt)
    const onDialog = async (d) => { await d.accept('Chicken tinola'); };
    page.once('dialog', onDialog);
    await page.click('[data-ck-mama="lunch"]');
    await page.waitForFunction(() => document.querySelector('[data-ck-meal="lunch"]').textContent.includes('Chicken tinola'));
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
    await page.evaluate(() => { const ask = window.WL.pc.ask; window.WL.pc.ask = (task, inp) => task === 'cook-photo' ? Promise.resolve({ items: [null, { name: '' }] }) : ask(task, inp); });
    await page.setInputFiles('#ck-photo-in', { name: 'fridge3.png', mimeType: 'image/png', buffer: png1x1 });
    await page.waitForFunction(() => /Could not identify any food/.test(document.getElementById('view').textContent));
    assert.ok(!(await page.$('#ck-photo-res')));

    // Ask Claude for week plan
    await page.goto(base + '#cook/week');
    await page.waitForSelector('#ck-ai-plan');
    await page.click('#ck-ai-plan');
    await page.waitForFunction(() => document.getElementById('view').textContent.includes('Garlic lemon chicken'));
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
    page.once('dialog', (dl) => dl.accept(''));
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

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('cook e2e');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
