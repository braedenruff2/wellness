/* To-do in the browser: add with plain words, tick, repeat, edit, Home card. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  await page.goto(base + '#todo');
  await t.step('quick-add shows live preview for parsed date, repeat and time, stays hidden for plain text', async () => {
    const pv = page.locator('#td-preview');
    assert.strictEqual(await pv.isVisible(), false, 'hidden when empty');
    await page.fill('#td-new', 'call friend');
    assert.strictEqual(await pv.isVisible(), false, 'hidden when no date/repeat/time parsed');
    await page.fill('#td-new', 'bins every thursday at 7pm');
    assert.strictEqual(await pv.isVisible(), true, 'shown when parsed');
    const txt = await pv.textContent();
    assert.ok(txt.includes('“bins”') && txt.includes('🔔 7 pm') && txt.includes('↻ every Thursday'), txt);
    await page.fill('#td-new', 'call Mom tomorrow');
    const txt2 = await pv.textContent();
    assert.ok(txt2.includes('“call Mom”') && txt2.includes('tomorrow'), txt2);
    await page.fill('#td-new', '');
    assert.strictEqual(await pv.isVisible(), false, 'hidden again when cleared');
    assert.strictEqual(await pv.textContent(), '', 'preview text cleared');
    // preview also resets cleanly right after submitting #td-form
    await page.fill('#td-new', 'water plants tomorrow');
    assert.strictEqual(await pv.isVisible(), true, 'preview visible before submit');
    await page.press('#td-new', 'Enter');
    assert.strictEqual(await pv.isVisible(), false, 'preview hidden after submit');
    assert.strictEqual(await pv.textContent(), '', 'preview text empty after submit');
    await page.click('li:has(.task-text:text-is("water plants")) [data-more]');
    await page.click('#td-del'); await page.click('#td-del');
  });
  await t.step('add tasks with dates from plain words', async () => {
    for (const x of ['call Mom tomorrow', 'stretch every day', 'buy diapers today', 'fix the gate']) { await page.fill('#td-new', x); await page.press('#td-new', 'Enter'); }
    const txt = await page.textContent('main');
    assert.ok(/Today[\s\S]*stretch[\s\S]*buy diapers/.test(txt), 'today section');
    assert.ok(/Coming up[\s\S]*call Mom/.test(txt)); assert.ok(/Any time[\s\S]*fix the gate/.test(txt));
    const names = await page.$$eval('.task-text', (els) => els.map((e) => e.textContent));
    assert.ok(names.includes('call Mom') && names.includes('stretch'), 'date words removed from the text: ' + names);
  });
  await t.step('weekly on a named day shows that day; "call friend" stays as written', async () => {
    for (const x of ['bins every thursday', 'call friend', 'recycling every other friday']) { await page.fill('#td-new', x); await page.press('#td-new', 'Enter'); }
    const bins = await page.textContent('li:has-text("bins")');
    assert.ok(/↻ every Thursday/.test(bins), bins);
    assert.ok(/↻ every other Friday/.test(await page.textContent('li:has-text("recycling")')));
    const names = await page.$$eval('.task-text', (els) => els.map((e) => e.textContent));
    assert.ok(names.includes('call friend'), names);
    for (const x of ['bins', 'call friend', 'recycling']) {
      await page.click('li:has(.task-text:text-is("' + x + '")) [data-more]');
      await page.click('#td-del'); await page.click('#td-del');
    }
  });
  await t.step('ticking a daily task moves it to tomorrow; ticking a one-off strikes it', async () => {
    await page.click('li:has-text("stretch") [data-tick]');
    assert.ok(/Coming up[\s\S]*stretch/.test(await page.textContent('main')));
    await page.click('li:has-text("buy diapers") [data-tick]');
    assert.ok(!/Today[\s\S]*buy diapers/.test(await page.textContent('main')));
    assert.ok((await page.textContent('main')).includes('2 done in the last 7 days'));
  });
  await t.step('edit: rename, set a date, Enter saves, Escape cancels, delete needs two taps', async () => {
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.fill('#td-edit', 'unsaved rename');
    await page.press('#td-edit', 'Escape');
    assert.strictEqual(await page.$('#td-sheet'), null, 'Escape closes edit sheet without saving');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label')), 'Options for fix the gate', 'Escape restores focus to task options button');
    assert.ok((await page.textContent('main')).includes('fix the gate') && !(await page.textContent('main')).includes('unsaved rename'));
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.click('#td-cancel');
    assert.strictEqual(await page.$('#td-sheet'), null, 'Cancel closes edit sheet');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label')), 'Options for fix the gate', 'Cancel restores focus to task options button');
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.fill('#td-edit', 'fix the garden gate');
    await page.click('[data-due]:has-text("Today")');
    await page.press('#td-edit', 'Enter');
    assert.ok(/Today[\s\S]*fix the garden gate/.test(await page.textContent('main')), 'Enter saves edit sheet');
    await page.click('li:has-text("fix the garden gate") [data-more]');
    await page.click('#td-del'); assert.ok((await page.textContent('main')).includes('garden gate'));
    await page.click('#td-del'); assert.ok(!(await page.textContent('main')).includes('garden gate'));
    // done task edit sheet hides "In 1 hour" and Escape closes from any field in the sheet
    await page.click('#td-showdone');
    await page.click('li.is-done:has-text("buy diapers") [data-more]');
    assert.strictEqual(await page.$('#td-hour'), null, 'no "In 1 hour" button on a done task');
    await page.press('#td-time', 'Escape');
    assert.strictEqual(await page.$('#td-sheet'), null, 'Escape on #td-time closes edit sheet');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label')), 'Options for buy diapers', 'Escape from #td-time restores focus to options button');
    await page.click('#td-showdone');
  });
  await t.step('Home shows what is due and can tick it', async () => {
    await page.goto(base + '#todo');
    await page.fill('#td-new', 'email the daycare today'); await page.press('#td-new', 'Enter');
    await page.goto(base + '#home');
    const c = page.locator('.home-card[data-module="todo"]');
    assert.ok((await c.textContent()).includes('email the daycare'));
    await c.locator('[data-tick]').first().click();
    assert.ok(!(await page.locator('.home-card[data-module="todo"]').textContent()).includes('email the daycare'));
  });
  await t.step('survives a reload; overdue tasks can be moved to today', async () => {
    await page.reload();
    await page.clock.runFor(3 * 86400e3);
    await page.goto(base + '#todo');
    const txt = await page.textContent('main');
    assert.ok(/Overdue[\s\S]*call Mom/.test(txt), txt.slice(0, 300));
    await page.fill('#td-new', 'a'); await page.press('#td-new', 'Enter');
    await page.fill('#td-new', 'b yesterday-ish'); await page.press('#td-new', 'Enter');
  });
  await t.step('a double-tap on a tick ticks only that task (the next one moves under the finger)', async () => {
    await page.goto(base + '#todo');
    for (const x of ['aaa task today', 'bbb task today']) { await page.fill('#td-new', x); await page.press('#td-new', 'Enter'); }
    const open = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.filter((t) => !t.done && /^(aaa|bbb)/.test(t.text)).length);
    assert.strictEqual(await open(), 2);
    await page.locator('li', { hasText: 'aaa task' }).locator('[data-tick]').dblclick();
    assert.strictEqual(await open(), 1, 'one ticked, not two');
  });
  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#todo', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('to-do browser');
})().catch((e) => { console.error(e); process.exit(1); });
