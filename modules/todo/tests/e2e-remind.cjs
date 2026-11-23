/* To-do reminders: "at 3pm" or the edit sheet's time sets a phone reminder (Android gets the lines), done or
   cleared tasks take it away, and the list shows the time. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await W.open();
  const { page, base } = t;
  await page.addInitScript(() => {
    window.__todo = [];
    window.__ticked = '';
    window.FCAndroid = { todoAlarms: (lines) => window.__todo.push(lines), todoTicked: () => { const x = window.__ticked; window.__ticked = ''; return x; } };
  });
  const last = async () => { const a = await page.evaluate(() => window.__todo); return a.length ? a[a.length - 1].split('\n').filter((x) => x && x[0] !== '#') : []; };
  await page.goto(base + '#todo');
  await t.step('a task with a time sends its reminder to the phone', async () => {
    await page.fill('#td-new', 'call Mom tomorrow at 3pm'); await page.press('#td-new', 'Enter');
    const l = await last();
    assert.strictEqual(l.length, 1, JSON.stringify(l));
    const [when, , text] = l[0].split('\t');
    assert.strictEqual(text, 'call Mom');
    assert.strictEqual(+when, new Date(2026, 10, 19, 15, 0).getTime(), 'tomorrow 3 pm (the test clock is 18 Nov 10:00)');
    assert.ok(/call Mom[\s\S]*tomorrow 🔔 3 pm/.test(await page.textContent('main')));
  });
  await t.step('a task without a time adds no reminder (and sends nothing new)', async () => {
    const n = (await page.evaluate(() => window.__todo)).length;
    await page.fill('#td-new', 'fix the gate'); await page.press('#td-new', 'Enter');
    assert.strictEqual((await page.evaluate(() => window.__todo)).length, n, 'same reminders: not sent again');
  });
  await t.step('the edit sheet sets and clears the time', async () => {
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.fill('#td-time', '21:30');
    await page.click('#td-save');
    let l = await last();
    assert.strictEqual(l.length, 2); assert.ok(l.some((x) => x.endsWith('\tfix the gate')));
    assert.ok(/Today[\s\S]*fix the gate[\s\S]*9:30 pm|Coming up[\s\S]*fix the gate/.test(await page.textContent('main')));
    await page.click('li:has-text("fix the gate") [data-more]');
    await page.click('#td-notime'); await page.click('#td-save');
    l = await last();
    assert.strictEqual(l.length, 1); assert.ok(!l.some((x) => x.includes('fix the gate')));
  });
  await t.step('ticking a task takes its reminder away', async () => {
    await page.click('li:has-text("call Mom") [data-tick]');
    assert.deepStrictEqual(await last(), []);
  });
  await t.step('reopening the app re-sends the reminders (after an update or a crash)', async () => {
    await page.fill('#td-new', 'bins fri at 7pm'); await page.press('#td-new', 'Enter');
    await page.reload();
    const a = await page.evaluate(() => window.__todo);
    assert.strictEqual(a.length, 1, 'sent once on start: ' + JSON.stringify(a));
    assert.ok(a[0].split('\n')[0].endsWith('\tbins'));
    assert.ok(/\n#open\t[^\n]+$/.test(a[0]), 'names the open timed tasks (for snoozes): ' + a[0]);
  });
  await t.step('"In 1 hour" in the sheet moves the reminder to an hour from now (not offered for repeating tasks)', async () => {
    await page.fill('#td-new', 'call the clinic back'); await page.press('#td-new', 'Enter');
    await page.click('li:has-text("call the clinic back") [data-more]');
    await page.click('#td-hour');
    const l = await last();
    const r = l.find((x) => x.endsWith('\tcall the clinic back'));
    assert.ok(r, JSON.stringify(l));
    const now = await page.evaluate(() => Date.now());
    const w = +r.split('\t')[0];
    assert.ok(w - now >= 60 * 60000 && w - now < 65 * 60000, 'about an hour: ' + (w - now) / 60000 + ' min');
    assert.ok(/call the clinic back[\s\S]*🔔/.test(await page.textContent('main')));
    await page.fill('#td-new', 'stretch every day at 7am'); await page.press('#td-new', 'Enter');
    await page.click('li:has-text("stretch") [data-more]');
    assert.strictEqual(await page.$('#td-hour'), null);
    await page.click('#td-cancel');
  });
  await t.step('"Done" tapped on the notification ticks the task when the app comes back (and on start)', async () => {
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.find((x) => x.text === 'call the clinic back').id);
    await page.evaluate((id) => { window.__ticked = Date.now() + '\t' + id + '\n'; window.FCTodoTicked(); }, id);
    assert.ok((await page.textContent('#toast')).includes('Done: call the clinic back'));
    const tk = await page.evaluate((id) => JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.find((x) => x.id === id), id);
    assert.ok(tk.done, 'ticked and saved');
    assert.ok(!(await last()).some((x) => x.endsWith('\tcall the clinic back')), 'its reminder is taken away');
    assert.ok(!/Today[\s\S]*call the clinic back[\s\S]*Coming up/.test(await page.textContent('main')), 'list redrawn');
    // ticked while the app was closed: picked up on start, before the first screen
    const bins = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.find((x) => x.text === 'bins').id);
    await page.addInitScript((id) => { window.__ticked = Date.now() + '\t' + id; }, bins);
    await page.reload();
    assert.ok(await page.evaluate((id) => !!JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.find((x) => x.id === id).done, bins));
    assert.ok(!(await page.textContent('main')).includes('bins') || (await page.textContent('main')).indexOf('bins') > (await page.textContent('main')).indexOf('done in the last'));
    // stale notification tap for an already-ticked task on a later day still tops up repeating reminders
    const before = (await page.evaluate(() => window.__todo)).length;
    await page.clock.fastForward(2 * 86400000);
    await page.evaluate((id) => { window.__ticked = Date.now() + '\t' + id + '\n'; window.FCTodoTicked(); }, bins);
    assert.strictEqual((await page.evaluate(() => window.__todo)).length, before + 1, 'repeating reminders topped up even when tap was a no-op');
  });
  await t.step('no console errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('to-do reminders');
})().catch((e) => { console.error(e); process.exit(1); });
