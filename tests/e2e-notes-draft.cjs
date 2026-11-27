/* Note for autopilot (task 334): text typed but not saved comes back the next time the sheet opens (after ✕, Escape,
   or the app being closed mid-typing), with its tag and a "Clear it"; saving it clears the draft. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 27, 10, 0) });
  const { page, base } = t;
  const openSheet = async () => { await page.click('#wl-bar-note'); await page.waitForSelector('#wl-note-in'); };
  await t.step('typed, then closed with ✕: the text and tag come back', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('#wl-bar-note');
    await openSheet();
    await page.click('[data-ntag="Bug"]');
    await page.fill('#wl-note-in', 'The timer skipped a minute');
    await page.click('#wl-note-x');
    await openSheet();
    assert.strictEqual(await page.inputValue('#wl-note-in'), 'The timer skipped a minute');
    assert.strictEqual(await page.getAttribute('[data-ntag="Bug"]', 'aria-pressed'), 'true');
    assert.ok(await page.isVisible('#wl-note-draft'));
  });
  await t.step('the app closed mid-typing (reload): still there', async () => {
    await page.fill('#wl-note-in', 'The timer skipped a minute in the quiet sit');
    await page.reload(); await page.waitForSelector('#wl-bar-note');
    await openSheet();
    assert.strictEqual(await page.inputValue('#wl-note-in'), 'The timer skipped a minute in the quiet sit');
  });
  await t.step('the draft stays on this phone: not in a backup (or the Drive sync file, built the same way)', async () => {
    const b = await page.evaluate(() => WL.backupText());
    assert.ok(!b.includes('wl.notes.draft') && !b.includes('timer skipped a minute in the quiet sit'), 'draft not in the backup');
  });
  await t.step('Clear it empties the box and the draft', async () => {
    await page.click('#wl-note-clear');
    assert.strictEqual(await page.inputValue('#wl-note-in'), '');
    await page.keyboard.press('Escape');
    await openSheet();
    assert.strictEqual(await page.inputValue('#wl-note-in'), '');
    assert.strictEqual(await page.locator('#wl-note-draft').count(), 0);
  });
  await t.step('saved: the draft is gone', async () => {
    await page.fill('#wl-note-in', 'A new idea');
    await page.click('#wl-note-save');
    await openSheet();
    assert.strictEqual(await page.inputValue('#wl-note-in'), '');
    const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.map((n) => n.text));
    assert.deepStrictEqual(notes, ['A new idea']);
    await page.keyboard.press('Escape');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('note drafts');
})().catch((e) => { console.error(e); process.exit(1); });
