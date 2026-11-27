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
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-edit')), '0', 'Cancel restores focus to set chip');
    // Escape anywhere inside .editrow (including buttons) cancels edit and restores focus to set chip
    await page.click('#ex-0 [data-edit="0"]');
    await page.focus('#ex-0 .ed-save');
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#ex-0 .editrow'), 'Escape on button inside editrow closes it');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-edit')), '0', 'Escape restores focus to set chip');
    await page.fill('#ex-0 .val', '10');
    await page.fill('#ex-0 .wt', '');
    await page.click('#ex-0 .logbtn');
    await page.click('#ex-0 [data-edit="1"]');
    assert.ok(await page.isVisible('#ex-0 .ed-wt'), 'weight input shown on weighted exercise even if logged blank');
    await page.fill('#ex-0 .ed-wt', '15');
    await page.press('#ex-0 .ed-wt', 'Enter');
    const savedW = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.workout.v1'));
      const open = s.sessions.find((x) => !x.end);
      return open.sets[open.sets.length - 1].w;
    });
    assert.strictEqual(savedW, 15, 'Enter in edit weight saves updated weight');
    await page.click('#wo-undo');
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
  await t.step('finish: stays on Done for today instead of jumping to Day B; Carry on reopens Day A; explicit button opens Day B', async () => {
    await page.click('#wo-finish');
    assert.strictEqual(await page.textContent('h1'), 'Done for today ✓');
    assert.ok((await page.textContent('#wo-done-today')).includes('Finished Full body A') && (await page.textContent('#wo-done-today')).includes('Next time: Full body B'));
    assert.strictEqual(await page.$('#ex-0'), null, 'Day B exercises do not pop up automatically after finishing Day A');
    await page.click('#wo-reopen');
    assert.strictEqual(await page.textContent('h1'), 'Full body A');
    assert.strictEqual(await page.locator('.sc.on').count(), 1);
    await page.click('#wo-finish');
    assert.strictEqual(await page.textContent('h1'), 'Done for today ✓');
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="workout"]')).includes('Done for today') && (await page.textContent('.home-card[data-module="workout"]')).includes('Next: Full body B'));
  });
  await t.step('import the sheet CSV, then last-time numbers and progress show', async () => {
    const f = path.join(os.tmpdir(), 'wo-log.csv');
    fs.writeFileSync(f, 'Date,Day,Exercise,Set 1,Set 2,Set 3,Set 4,Weight,Notes\n2026-11-16,Monday,Pushups,18,18,17,,,x\n2026-11-17,Tuesday,Single Leg RDL,15,15,15,,10 lbs,x\n2026-11-17,Tuesday,Plank,45,50,,,,x\n2026-11-17,Tuesday,Walk,25,,,,,x\n');
    await page.goto(base + '#workout/settings');
    await page.setInputFiles('#wo-csv', f);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Imported 4'));
    await page.goto(base + '#workout');
    await page.click('#wo-ahead');
    assert.strictEqual(await page.textContent('h1'), 'Full body B');
    const adv = await page.textContent('#ex-0 .adv');
    assert.ok(/Last: 15\/15\/15 @ 10 lb/.test(adv) && /Ready for harder/.test(adv), adv);
    await page.goto(base + '#workout/history');
    assert.ok((await page.textContent('main')).includes('Pushups'));
    await page.waitForSelector('#wo-weekly-chart');
    await page.waitForSelector('#wo-chart-card');
    await page.waitForSelector('#wo-ex-svg');
    assert.ok((await page.textContent('#wo-bench-note')).includes('Set your age in Setup'), 'prompts to set age when unset');
    // Set age in Setup -> age-group average reference line shows on Progress graph for rep-based and time-based exercises
    await page.goto(base + '#workout/settings');
    await page.fill('#wo-age', '34');
    await page.click('#wo-age-save');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('30–39'));
    await page.goto(base + '#workout/history');
    await page.waitForSelector('#wo-ex-svg');
    assert.ok((await page.textContent('#wo-ex-svg .wo-ref-lbl')).includes('Age 30–39 avg: 19 reps'), await page.textContent('#wo-ex-svg'));
    assert.ok((await page.textContent('#wo-bench-note')).includes('Typical 30–39 average: 13–24 reps'), await page.textContent('#wo-bench-note'));
    // Time-based exercises (Plank in sec, Walk in min) and other rep exercises (Single Leg RDL) all render age-group reference line + band
    await page.selectOption('#wo-chart-ex', 'Plank');
    assert.ok((await page.textContent('#wo-ex-svg .wo-ref-lbl')).includes('Age 30–39 avg: 55 sec'), await page.textContent('#wo-ex-svg'));
    assert.ok((await page.textContent('#wo-bench-note')).includes('Typical 30–39 average: 45–75 sec'), await page.textContent('#wo-bench-note'));
    assert.strictEqual(await page.locator('#wo-ex-svg rect').count(), 1, 'age-group band renders for Plank');
    await page.selectOption('#wo-chart-ex', 'Walk');
    assert.ok((await page.textContent('#wo-ex-svg .wo-ref-lbl')).includes('Age 30–39 avg: 25 min'), await page.textContent('#wo-ex-svg'));
    // Switch exercise via dropdown & "Show on graph" button + toggle volume metric on weighted exercise
    await page.selectOption('#wo-chart-ex', 'Single Leg RDL');
    assert.ok((await page.textContent('#wo-ex-svg .wo-ref-lbl')).includes('Age 30–39 avg: 11 reps'), await page.textContent('#wo-ex-svg'));
    await page.waitForSelector('[data-wo-metric="volume"]');
    await page.click('[data-wo-metric="volume"]');
    assert.strictEqual(await page.getAttribute('[data-wo-metric="volume"]', 'aria-pressed'), 'true');
    await page.click('[data-pick-ex="Pushups"]');
    assert.strictEqual(await page.inputValue('#wo-chart-ex'), 'Pushups');
    const vol = await page.$('#wo-volume');
    assert.ok(vol, 'weekly sets shown after logging'); assert.ok(/legs \d+ \(\d+\) · push/.test(await vol.textContent()), 'weekly sets line');
    assert.strictEqual(await page.locator('[data-me-fit][data-about="balance"]').count(), 1, '"Not for me?" on the balance line');
    // area filter chips filter exercise progress cards live
    await page.waitForSelector('#wo-areas');
    const allCount = await page.locator('.wo-ex:not([hidden])').count();
    assert.strictEqual(allCount, 5, 'All shows all 5 exercises (2 legs + 1 push + 1 core + 1 walk)');
    await page.click('#wo-areas [data-area="push"]');
    assert.strictEqual(await page.locator('.wo-ex:not([hidden])').count(), 1);
    assert.ok((await page.locator('.wo-ex:not([hidden])').first().textContent()).includes('Pushups'));
    await page.click('#wo-areas [data-area="legs"]');
    assert.strictEqual(await page.locator('.wo-ex:not([hidden])').count(), 2);
    await page.click('#wo-areas [data-area=""]');
    assert.strictEqual(await page.locator('.wo-ex:not([hidden])').count(), 5);
  });
  await t.step('after Christmas the Move screen asks about the adjustable dumbbells; "Yes" switches the advice to adding weight', async () => {
    await page.goto(base + '#workout');
    assert.strictEqual(await page.$('#wo-db'), null, 'not before 26 Dec');
    await page.clock.setSystemTime(new Date(2026, 11, 26, 9, 0)); await page.reload(); await page.waitForSelector('#wo-db');
    await page.click('#wo-db-yes');
    assert.strictEqual(await page.$('#wo-db'), null);
    assert.ok(/go up to 15 lb/.test(await page.textContent('#ex-0 .adv')));
  });
  await t.step('leaving during a rest stops the timer (no beep on another screen); Progress shows weight-aware best set', async () => {
    await page.fill('#ex-0 .val', '9'); await page.fill('#ex-0 .wt', '15'); await page.click('#ex-0 .logbtn');
    await page.goto(base + '#workout/history');
    const rdl = await page.locator('.wo-ex', { hasText: 'Single Leg RDL' }).textContent();
    assert.ok(/best set 9 @ 15 lb/.test(rdl), 'heavier 15 lb set beats earlier 15 reps @ 10 lb: ' + rdl);
    await page.goto(base + '#home');
    await page.clock.runFor(30000);
    assert.ok(!(await page.isVisible('#restbar')));
    // returning to #workout after rest expired while away catches up cleanly without interval crash
    await page.goto(base + '#workout');
    assert.strictEqual(await page.textContent('#rest-time'), 'Go');
    await page.clock.runFor(3000);
    assert.ok(!(await page.isVisible('#restbar')), '#restbar hides cleanly after returning past expiry');
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#workout', '#workout/history', '#workout/settings']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('workout browser');
})().catch((e) => { console.error(e); process.exit(1); });
