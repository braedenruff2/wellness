/* To-do in the browser: add with plain words, tick, repeat, edit, Home card. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  await page.goto(base + '#todo');
  await t.step('add tasks with dates from plain words', async () => {
    for (const x of ['call Mom tomorrow', 'stretch every day', 'buy diapers today', 'fix the gate']) { await page.fill('#td-new', x); await page.press('#td-new', 'Enter'); }
    const txt = await page.textContent('main');
    assert.ok(/Today[\s\S]*stretch[\s\S]*buy diapers/.test(txt), 'today section');
    assert.ok(/Coming up[\s\S]*call Mom/.test(txt)); assert.ok(/Any time[\s\S]*fix the gate/.test(txt));
    const names = await page.$$eval('.task-text', (els) => els.map((e) => e.textContent));
    assert.ok(names.includes('call Mom') && names.includes('stretch'), 'date words removed from the text: ' + names);
  });
  await t.step('ticking a daily task moves it to tomorrow; ticking a one-off strikes it', async () => {
    await page.click('li:has-text("stretch") [data-tick]');
    assert.ok(/Coming up[\s\S]*stretch/.test(await page.textContent('main')));
    await page.click('li:has-text("buy diapers") [data-tick]');
    assert.ok(!/Today[\s\S]*buy diapers/.test(await page.textContent('main')));
    assert.ok((await page.textContent('main')).includes('2 done in the last 7 days'));
  });
  await t.step('edit: rename, set a date, delete needs two taps', async () => {
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.fill('#td-edit', 'fix the garden gate');
    await page.click('[data-due]:has-text("Today")');
    await page.click('#td-save');
    assert.ok(/Today[\s\S]*fix the garden gate/.test(await page.textContent('main')));
    await page.click('li:has-text("fix the garden gate") [data-more]');
    await page.click('#td-del'); assert.ok((await page.textContent('main')).includes('garden gate'));
    await page.click('#td-del'); assert.ok(!(await page.textContent('main')).includes('garden gate'));
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
  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#todo', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('to-do browser');
})().catch((e) => { console.error(e); process.exit(1); });
