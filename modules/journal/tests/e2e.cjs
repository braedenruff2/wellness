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
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'new-entry', 'Dismiss restores focus to #new-entry');
    await page.reload();
    await page.goto(base + '#journal');
    await page.waitForSelector('#j-list');
    assert.strictEqual(await page.$('#j-lookback'), null, 'dismissed look-back stays gone after reload');
  });

  await t.step('Wisdom toolkit (#journal/wisdom): Zoom Out + AI blind-spot check, Decision Log + due review -> Principle + snooze, Principles filter/search/export', async () => {
    await page.goto(base + '#journal');
    await page.waitForSelector('[data-jtab="wisdom"]');
    await page.click('[data-jtab="wisdom"]');
    await page.waitForSelector('#w-zoom-form');

    // Stub WL.pc for blind-spot check
    await page.evaluate(() => {
      window.WL.pc = Object.assign({}, window.WL.pc || {}, {
        canAsk: () => true,
        ready: () => true,
        queued: () => [],
        ask: (task, inp) => {
          if (task === 'wisdom-check') {
            return Promise.resolve({
              blindSpots: ['Treating tiredness as bad intent'],
              otherSide: 'Everyone is running on low sleep tonight.',
              reframe: 'In a year, calm kindness matters more than tonight’s schedule.',
              nextStep: 'Offer tea and reset expectations gently.'
            });
          }
          return Promise.reject(new Error('unexpected ' + task));
        }
      });
    });

    // Save & check blind spots on Zoom Out
    await page.goto(base + '#journal/wisdom/zoom');
    await page.waitForSelector('#w-z-ai');
    await page.fill('#w-z-sit', 'He is tense because dinner is running late.');
    await page.fill('#w-z-assume', 'Assuming the whole evening is ruined.');
    await page.fill('#w-z-other', 'Everyone had a full day.');
    await page.fill('#w-z-year', 'Staying steady and kind.');
    await page.fill('#w-z-step', 'Take three slow breaths first.');
    await page.click('#w-z-ai');
    await page.waitForSelector('#w-z-list .w-fb');
    assert.ok((await page.textContent('#w-z-list .w-fb')).includes('Treating tiredness as bad intent'));

    // Decision Log: add 30-day decision, seed an overdue decision, snooze & review + auto-promote to Principles
    await page.click('[data-wmode="decisions"]');
    await page.waitForSelector('#w-d-choice');
    await page.fill('#w-d-choice', 'Keep cooking plans flexible on busy weeks');
    await page.fill('#w-d-why', 'Less pressure when Mama cooks');
    await page.fill('#w-d-expect', 'Less stress and less wasted food');
    await page.click('#w-d-days [data-ddays="14"]');
    await page.click('#w-d-save');
    await page.waitForFunction(() => document.getElementById('w-d-list').textContent.includes('Keep cooking plans flexible'));

    // Seed two overdue decisions so #w-d-due surfaces (one to snooze, one to review & promote to Principle)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.wisdom.v1'));
      WisdomCore.addDecision(s, { choice: 'Switch to 2 workouts/wk', why: 'Rough sleep', expect: 'More consistent', reviewDays: 14 }, new Date(2026, 10, 1, 9, 0));
      WisdomCore.addDecision(s, { choice: 'Buy walking pad', expect: 'More daily steps', reviewDays: 14 }, new Date(2026, 10, 5, 9, 0));
      localStorage.setItem('wl.wisdom.v1', JSON.stringify(s));
      WL.modules.journal.reload();
    });
    // Home Journal card gently notes due decisions
    await page.goto(base + '#home');
    await page.waitForSelector('.home-card[data-module="journal"]');
    assert.ok((await page.textContent('.home-card[data-module="journal"]')).includes('2 decisions due for review'));

    // Opening #journal/wisdom without sub-mode lands on Decisions automatically when due
    await page.goto(base + '#journal/wisdom');
    await page.waitForSelector('#w-d-due');
    assert.strictEqual(await page.getAttribute('[data-wmode="decisions"]', 'aria-pressed'), 'true');
    assert.ok((await page.textContent('[data-jtab="wisdom"]')).includes('Wisdom (2)'));

    // Snooze the first due decision -> 1 due left
    await page.click('#w-d-due [data-d-snooze]');
    await page.waitForFunction(() => document.querySelectorAll('#w-d-due [data-due-id]').length === 1);

    // Review the remaining due decision with lesson promoted to Personal Principles
    const remId = await page.getAttribute('#w-d-due [data-due-id]', 'data-due-id');
    await page.click('[data-dout="' + remId + '|Better than expected"]');
    await page.fill('#w-rev-act-' + remId, 'Used it every afternoon');
    await page.fill('#w-rev-les-' + remId, 'Remove friction from daily movement');
    await page.click('[data-d-save-rev="' + remId + '"]');
    await page.waitForFunction(() => !document.getElementById('w-d-due'));

    // Principles tab: promoted principle is there; add two more tagged principles, filter by tag, search & export
    await page.click('[data-wmode="principles"]');
    await page.waitForSelector('#w-p-list');
    assert.ok((await page.textContent('#w-p-list')).includes('Remove friction from daily movement'));
    for (const [text, tag] of [
      ['Never solve big topics after 9 pm', 'Family'],
      ['Pause 10 seconds before reacting', 'Calm'],
      ['Sleep comes before perfection', 'Health'],
      ['Ask one curious question first', 'Parenting'],
      ['Keep the daily floor tiny', 'Work']
    ]) {
      await page.fill('#w-p-text', text);
      await page.click('#w-p-tags [data-ptag="' + tag + '"]');
      await page.click('#w-p-save');
      await page.waitForFunction((tx) => document.getElementById('w-p-list').textContent.includes(tx), text);
    }
    await page.waitForSelector('#w-p-filter');
    await page.click('#w-p-filter [data-pfilter="Family"]');
    assert.strictEqual(await page.locator('#w-p-list > li').count(), 1);
    await page.click('#w-p-filter [data-pfilter=""]');
    await page.waitForSelector('#w-p-search');
    await page.fill('#w-p-search', 'curious');
    assert.strictEqual(await page.textContent('#w-p-found'), ' 1 found');

    const [wdl] = await Promise.all([page.waitForEvent('download'), page.click('#w-export-text')]);
    assert.strictEqual(wdl.suggestedFilename(), 'wisdom-2026-11-25.txt');
    const wtxt = fs.readFileSync(await wdl.path(), 'utf8');
    assert.ok(wtxt.includes('Personal Principles') && wtxt.includes('Decision Log') && wtxt.includes('Zoom Out Reflections'), wtxt);
  });

  await t.step('439: his words from quick answers and after sits show read-only on All, newest first, escaped', async () => {
    await page.evaluate(() => {
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{}}');
      me.feedback = me.feedback || [];
      me.feedback.push({ id: 'faith/after/day:10@x', at: '2026-11-23T23:15:00.000Z', part: 'faith', kind: 'after', about: 'day:10@x', a: { felt: 'Peaceful' }, note: 'The verse about rest <b>stayed</b>' });
      me.feedback.push({ id: 'workout/after/w@x', at: '2026-11-24T21:18:00.000Z', part: 'workout', kind: 'after', about: 'w@x', a: { hard: 'Just right' } }); // no words: not listed
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
      const c = JSON.parse(localStorage.getItem('wl.calm.v1') || '{"sessions":[],"settings":{}}');
      c.sessions.push({ id: 'count', date: '2026-11-24', at: '2026-11-24T23:36:00.000Z', rated: '2026-11-24T23:37:00.000Z', mins: 20, focus: 2, hind: ['Interrupted'], note: 'counting got easier after minute 5' });
      localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.goto(base + '#journal'); await page.reload(); await page.waitForSelector('#j-words');
    assert.ok(/\(2\)/.test(await page.textContent('#j-words summary')), await page.textContent('#j-words summary'));
    await page.click('#j-words summary');
    const items = await page.$$eval('#j-words-list li', (ls) => ls.map((l) => l.textContent));
    assert.strictEqual(items.length, 2);
    assert.ok(/Calm sit/.test(items[0]) && /minute 5/.test(items[0]), 'newest first: ' + items[0]);
    assert.ok(/Faith/.test(items[1]) && items[1].includes('<b>stayed</b>'), 'shown as text, not markup: ' + items[1]);
    assert.strictEqual(await page.$('#j-words-list b'), null);
    await page.goto(base + '#journal/journal'); await page.waitForSelector('#new-entry');
    assert.strictEqual(await page.$('#j-words'), null, 'only on All');
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#journal', '#journal/journal', '#journal/awe', '#journal/gratitude', '#journal/wisdom/zoom', '#journal/wisdom/decisions', '#journal/wisdom/principles']);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.close('journal');
})().catch((e) => { console.error(e); process.exit(1); });
