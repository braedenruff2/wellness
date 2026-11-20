/* Workout in the browser: log sets, rest timer, finish, rotation, sheet import, progress. */
'use strict';
const assert = require('assert');
const os = require('os'); const fs = require('fs'); const path = require('path');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open();
  const { page, base } = t;
  await page.goto(base + '#workout');
  await t.step('first time: Full body A with targets and a prefilled value', async () => {
    assert.strictEqual(await page.textContent('h1'), 'Full body A');
    const v = await page.inputValue('#ex-0 .val'); assert.strictEqual(v, '8', 'starts at the bottom of the range');
    assert.ok((await page.textContent('#ex-0')).includes('3 × 8–15 reps each side'));
  });
  await t.step('logging a set starts the 20 s transition to the superset partner, then a beep and Go', async () => {
    await page.fill('#ex-0 .val', '12');
    await page.click('#ex-0 .logbtn');
    assert.ok(await page.isVisible('#restbar'));
    assert.ok((await page.textContent('#rest-label')).includes('Pushups (set 1)'));
    assert.strictEqual(await page.textContent('#rest-time'), '0:20');
    await page.clock.runFor(21000);
    assert.strictEqual(await page.textContent('#rest-time'), 'Go');
    assert.strictEqual(await page.textContent('#ex-0 .sc.on'), '12');
  });
  await t.step('+15 s and Skip', async () => {
    await page.fill('#ex-1 .val', '15'); await page.click('#ex-1 .logbtn');
    assert.strictEqual(await page.textContent('#rest-time'), '1:15');
    await page.click('#rest-plus'); await page.clock.runFor(1000);
    assert.strictEqual(await page.textContent('#rest-time'), '1:29');
    await page.click('#rest-skip'); assert.ok(!(await page.isVisible('#restbar')));
  });
  await t.step('closing the app mid-workout keeps the session; undo works', async () => {
    await page.reload();
    assert.ok((await page.textContent('main')).includes('Undo last set'));
    assert.strictEqual(await page.locator('.sc.on').count(), 2);
    await page.click('#wo-undo');
    assert.strictEqual(await page.locator('.sc.on').count(), 1);
  });
  await t.step('a double-tap on Log set logs one set', async () => {
    const n = await page.locator('#ex-0 .sc.on').count();
    await page.locator('#ex-0 .logbtn').dblclick();
    assert.strictEqual(await page.locator('#ex-0 .sc.on').count(), n + 1);
    await page.click('#wo-undo');
    assert.strictEqual(await page.locator('#ex-0 .sc.on').count(), n);
  });
  await t.step('tap a logged set to fix a mistyped number', async () => {
    await page.click('#ex-0 [data-edit="0"]');
    await page.fill('#ex-0 .ed-val', '11'); await page.click('#ex-0 .ed-save');
    assert.strictEqual(await page.textContent('#ex-0 .sc.on'), '11');
    assert.ok((await page.textContent('#toast')).includes('fixed'));
    await page.click('#ex-0 [data-edit="0"]'); await page.click('#ex-0 .ed-cancel');
    assert.ok(await page.isHidden('#ex-0 .editrow'));
  });
  await t.step('a long break (50 min, then 3 hours) does not cut the workout off', async () => {
    await page.clock.runFor(50 * 60000);
    await page.reload();
    assert.strictEqual(await page.textContent('h1'), 'Full body A', 'still Day A (it used to jump to B after 45 min)');
    assert.ok((await page.textContent('main')).includes('Finish workout'));
    await page.clock.runFor(3 * 3600e3);
    await page.reload();
    assert.strictEqual(await page.locator('.sc.on').count(), 1, 'the sets are still there');
  });
  await t.step('finish: saved, and next time it is Full body B; finished by mistake: carry on', async () => {
    await page.click('#wo-finish');
    assert.strictEqual(await page.textContent('h1'), 'Full body B');
    await page.click('#wo-reopen');
    assert.strictEqual(await page.textContent('h1'), 'Full body A');
    assert.strictEqual(await page.locator('.sc.on').count(), 1);
    await page.click('#wo-finish');
    assert.strictEqual(await page.textContent('h1'), 'Full body B');
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="workout"]')).includes('Next: Full body B'));
  });
  await t.step('import the sheet CSV, then last-time numbers and progress show', async () => {
    const f = path.join(os.tmpdir(), 'wo-log.csv');
    fs.writeFileSync(f, 'Date,Day,Exercise,Set 1,Set 2,Set 3,Set 4,Weight,Notes\n2026-11-16,Monday,Pushups,18,18,17,,,x\n2026-11-17,Tuesday,Single Leg RDL,15,15,15,,10 lbs,x\n');
    await page.goto(base + '#workout/settings');
    await page.setInputFiles('#wo-csv', f);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Imported 2'));
    await page.goto(base + '#workout');
    const adv = await page.textContent('#ex-0 .adv');
    assert.ok(/Last: 15\/15\/15 @ 10 lb/.test(adv) && /Ready for harder/.test(adv), adv);
    await page.goto(base + '#workout/history');
    assert.ok((await page.textContent('main')).includes('Pushups'));
    const vol = await page.$('#wo-volume');
    assert.ok(vol, 'weekly sets shown after logging'); assert.ok(/legs \d+ \(\d+\) · push/.test(await vol.textContent()), 'weekly sets line');
    assert.strictEqual(await page.locator('[data-me-fit][data-about="balance"]').count(), 1, '"Not for me?" on the balance line');
  });
  await t.step('switching to adjustable dumbbells changes the advice to adding weight', async () => {
    await page.goto(base + '#workout/settings');
    await page.click('[data-eq="adjustable"]');
    await page.goto(base + '#workout');
    assert.ok(/go up to 15 lb/.test(await page.textContent('#ex-0 .adv')));
  });
  await t.step('leaving during a rest stops the timer (no beep on another screen)', async () => {
    await page.fill('#ex-0 .val', '9'); await page.click('#ex-0 .logbtn');
    await page.goto(base + '#home');
    await page.clock.runFor(30000);
    assert.ok(!(await page.isVisible('#restbar')));
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#workout', '#workout/history', '#workout/settings']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('workout browser');
})().catch((e) => { console.error(e); process.exit(1); });
