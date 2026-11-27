/* Standalone Journal (#journal) end-to-end tests: Home card shortcuts, tabs (All / Notes / Awe / Thanks),
   adding & heavy-word note, search & preservation across two-tap deletes (plus disarm), text export,
   link to Faith Prayer list, and shared storage with Faith (#faith/more & #faith/journal). */
'use strict';
const assert = require('assert');
const fs = require('fs');
const W = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 25, 10, 0) });
  const { page, base } = t;

  await t.step('Home Journal card shows empty state and shortcuts (Write, Thanks, Awe)', async () => {
    await page.goto(base + '#home');
    await page.waitForSelector('.home-card[data-module="journal"]');
    const cardText = await page.textContent('.home-card[data-module="journal"]');
    assert.ok(cardText.includes('Write anything on your mind'), cardText);
    const hrefs = await page.$$eval('.home-card[data-module="journal"] a.btn', (els) => els.map((a) => [a.textContent.trim(), a.getAttribute('href')]));
    assert.deepStrictEqual(hrefs, [['Write', '#journal'], ['Thanks', '#journal/gratitude'], ['Awe', '#journal/awe']]);
    await page.click('.home-card[data-module="journal"] a[href="#journal/gratitude"]');
    await page.waitForSelector('#new-entry');
    assert.strictEqual(await page.getAttribute('[data-jtab="gratitude"]', 'aria-selected'), 'true');
  });

  await t.step('Tabs (All / Notes / Awe / Thanks), unknown tab fallback, adding entries & Home preview', async () => {
    // Save a Thanks entry from #journal/gratitude
    await page.fill('#new-entry', 'Warm coffee during the morning nap.');
    await page.click('#add-entry');
    assert.ok((await page.textContent('#j-list')).includes('Warm coffee during the morning nap.'));
    assert.strictEqual(await page.getAttribute('[data-jtab="gratitude"]', 'aria-selected'), 'true');

    // Empty save focuses #new-entry without creating an entry
    await page.fill('#new-entry', '   ');
    await page.click('#add-entry');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'new-entry');

    // Switch to Awe tab and add an Awe moment
    await page.click('[data-jtab="awe"]');
    await page.waitForSelector('[data-jtab="awe"][aria-selected="true"]');
    assert.ok((await page.textContent('main')).includes('Nothing here yet.'));
    await page.fill('#new-entry', 'Sunlight on the kitchen floor.');
    await page.click('#add-entry');
    assert.ok((await page.textContent('#j-list')).includes('Sunlight on the kitchen floor.'));

    // Switch to Notes tab and add a regular Note
    await page.click('[data-jtab="journal"]');
    await page.waitForSelector('[data-jtab="journal"][aria-selected="true"]');
    await page.fill('#new-entry', 'Good stroller walk before rain.');
    await page.click('#add-entry');
    assert.strictEqual(await page.locator('#j-list > li').count(), 1);

    // Unknown tab falls back to All showing all 3 entries
    await page.goto(base + '#journal/unknown-tab');
    await page.waitForSelector('#j-list');
    assert.strictEqual(await page.getAttribute('[data-jtab="all"]', 'aria-selected'), 'true');
    assert.strictEqual(await page.locator('#j-list > li').count(), 3);

    // Home card now shows count and latest entry preview
    await page.goto(base + '#home');
    await page.waitForSelector('.home-card[data-module="journal"]');
    const hc = await page.textContent('.home-card[data-module="journal"]');
    assert.ok(hc.includes('3 entries') && hc.includes('Good stroller walk before rain.'), hc);
  });

  await t.step('Search appears at 6+ entries, hides list on 0 hits, preserves query across delete, and disarms delete after 4s', async () => {
    await page.goto(base + '#journal');
    for (const txt of ['Lantern walk by the harbour', 'Lantern light on snow', 'Quiet reading after bedtime', 'Lantern story at dusk']) {
      await page.fill('#new-entry', txt);
      await page.click('#add-entry');
    }
    await page.waitForSelector('#j-search');
    assert.strictEqual(await page.locator('#j-list > li').count(), 7);

    // 0 hits hides #j-list and reports 0 found
    await page.fill('#j-search', 'xyznonexistent');
    assert.strictEqual(await page.textContent('#j-found'), ' 0 found');
    assert.strictEqual(await page.isVisible('#j-list'), false);

    // Filter to "lantern" -> 3 hits visible
    await page.fill('#j-search', 'lantern');
    assert.strictEqual(await page.textContent('#j-found'), ' 3 found');
    const visCount = () => page.evaluate(() => Array.from(document.querySelectorAll('#j-list > li')).filter((li) => !li.hidden).length);
    assert.strictEqual(await visCount(), 3);

    // First tap arms delete, and 4s later it disarms automatically
    const firstDel = page.locator('#j-list > li:not([hidden]) .del').first();
    await firstDel.click();
    assert.strictEqual(await firstDel.textContent(), 'Tap again to delete');
    await page.clock.fastForward(4100);
    assert.strictEqual(await firstDel.textContent(), 'Delete');

    // Two-tap delete removes one matching entry and preserves the active search filter (2 found)
    await firstDel.click();
    await firstDel.click();
    assert.strictEqual(await page.inputValue('#j-search'), 'lantern');
    assert.strictEqual(await page.textContent('#j-found'), ' 2 found');
    assert.strictEqual(await visCount(), 2);
  });

  await t.step('Export journal as text (#j-export-text) downloads readable .txt with entries and Faith day reflections', async () => {
    // Also add a Faith day reflection to confirm shared fc.v1 storage and day title in export
    await page.goto(base + '#faith/day/1');
    await page.waitForSelector('#dj');
    await page.fill('#dj', 'Day one quiet reflection.');
    await page.locator('#dj').blur();

    await page.goto(base + '#journal');
    await page.waitForSelector('#j-export-text');
    assert.ok((await page.textContent('#j-list')).includes('Faith Day 1'), 'Faith day reflection appears in standalone Journal');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#j-export-text')]);
    assert.strictEqual(dl.suggestedFilename(), 'journal-2026-11-25.txt');
    const txt = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(/^My journal \(Wellness app\)/.test(txt), txt.slice(0, 120));
    assert.ok(txt.includes('Warm coffee during the morning nap.'), 'contains Thanks entry');
    assert.ok(txt.includes('Sunlight on the kitchen floor.'), 'contains Awe entry');
    assert.ok(txt.includes('Day one quiet reflection.'), 'contains Faith Day 1 reflection');
  });

  await t.step('Prayer list link (#faith/prayers), Faith More link to #journal, and #faith/journal compatibility', async () => {
    await page.click('a[href="#faith/prayers"]');
    await page.waitForSelector('#new-prayer');
    assert.ok((await page.textContent('h1')).includes('Prayer list'));

    await page.goto(base + '#faith/more');
    await page.waitForSelector('a[href="#journal"]');
    await page.click('a[href="#journal"]');
    await page.waitForSelector('#j-export-text');
    assert.strictEqual(await page.evaluate(() => location.hash), '#journal');

    // Existing #faith/journal route still renders shared entries cleanly
    await page.goto(base + '#faith/journal');
    await page.waitForSelector('#j-list');
    assert.ok((await page.textContent('#j-list')).includes('Warm coffee during the morning nap.'));
  });

  await t.step('an entry saved while logging for an earlier day lands on that day in chronological order; heavy words show the gentle note', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-logday');
    await page.selectOption('#wl-logday', '2026-11-24');
    await page.goto(base + '#journal'); await page.waitForSelector('#new-entry');
    await page.fill('#new-entry', 'Quiet morning walk with her');
    await page.click('#add-entry');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).journal);
    const earlier = saved.find((e) => e.text === 'Quiet morning walk with her');
    assert.ok(earlier, 'earlier-day entry saved');
    assert.strictEqual(new Date(earlier.at).getDate(), 24, 'dated the day he chose: ' + earlier.at);
    assert.strictEqual(new Date(saved[0].at).getDate(), 25, 'today entry stays newest first above earlier-day entry');
    assert.strictEqual((await page.textContent('#entry-gentle')).trim(), '', 'no note for an ordinary entry');
    await page.fill('#new-entry', 'Today felt hopeless and heavy');
    await page.click('#add-entry');
    assert.ok(/talking to someone you trust/.test(await page.textContent('#entry-gentle')), 'the gentle note shows');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-logday');
    const cardText = await page.textContent('.home-card[data-module="journal"]');
    assert.ok(!cardText.includes('Quiet morning walk with her') && !cardText.includes('hopeless'), 'Home Latest preview stays on today rather than an earlier-day entry: ' + cardText);
    await page.selectOption('#wl-logday', '');
  });
  await t.step('7-day-old look-back does not clutter #faith/today; lives collapsed and dismissable in #journal', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('fc.v1'));
      s.journal.push({ id: 'lb-week-1', at: new Date(2026, 10, 18, 10, 0).toISOString(), kind: 'journal', text: 'A peaceful walk along the river a week ago.' });
      localStorage.setItem('fc.v1', JSON.stringify(s));
      if (WL.modules.faith && WL.modules.faith.reload) WL.modules.faith.reload();
    });
    await page.goto(base + '#faith/today');
    await page.waitForSelector('#reading');
    assert.ok(!(await page.textContent('#view')).includes('ago you wrote'), '#faith/today no longer shows look-back card');
    await page.goto(base + '#journal');
    await page.waitForSelector('#j-lookback');
    assert.strictEqual(await page.getAttribute('#j-lookback', 'open'), null, 'collapsed by default on #journal');
    await page.click('#j-lookback summary');
    assert.ok((await page.textContent('#j-lookback')).includes('peaceful walk along the river'));
    await page.click('#j-lb-dismiss');
    assert.strictEqual(await page.$('#j-lookback'), null, 'Dismiss removes look-back card');
    await page.reload();
    await page.goto(base + '#journal');
    await page.waitForSelector('#j-list');
    assert.strictEqual(await page.$('#j-lookback'), null, 'dismissed look-back stays gone after reload');
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#journal', '#journal/journal', '#journal/awe', '#journal/gratitude']);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.close('journal');
})().catch((e) => { console.error(e); process.exit(1); });
