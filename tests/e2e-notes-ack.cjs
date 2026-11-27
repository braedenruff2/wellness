/* "Note for autopilot": a cloud run's notes-ack answer (tools/cloud-answer.cjs ack-notes) reaches the phone through
   Drive sync and each note it names shows "Read by the autopilot"; the rest still say they're waiting. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');
const FAKE = `
  (function () {
    var d = window.__drive = { content: '', writes: 0 };
    window.FCAndroid = {
      syncStatus: function () { return JSON.stringify({ configured: true, name: 'wellness-sync.json', lastSync: 0, error: '', busy: false }); },
      syncRead: function (id) { Promise.resolve().then(function () { window.FCSyncDone(id, true, d.content); }); },
      syncWrite: function (id, text) { d.writes++; Promise.resolve().then(function () { d.content = text; window.FCSyncDone(id, true, ''); }); }
    };
  })();
`;
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 27, 10, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE);
  await page.goto(base + '#home');
  await page.evaluate(() => localStorage.setItem('wl.notes.v1', JSON.stringify({ notes: [
    { id: 'n2', at: '2026-11-27T13:00:00.000Z', where: '#calm', tag: 'Idea', text: 'second note' },
    { id: 'n1', at: '2026-11-26T13:00:00.000Z', where: '#home', tag: 'Bug', text: 'first note' }] })));
  await page.reload(); await page.waitForSelector('.home-card');
  await t.step('before any ack: every saved note says it is waiting for the next run', async () => {
    await page.click('[data-wl-note]');
    await page.waitForSelector('#wl-note-sheet');
    await page.click('#wl-note-list summary');
    const st = await page.$$eval('.wl-note-state', (e) => e.map((x) => x.textContent));
    assert.deepStrictEqual(st, ['Waiting for the next autopilot run', 'Waiting for the next autopilot run']);
    assert.ok((await page.textContent('#wl-note-where')).includes('synced via Drive'), 'sync is on');
    await page.keyboard.press('Escape');
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-when');
    assert.ok((await page.textContent('#wl-sync-when')).includes('2 notes for the autopilot not read yet'));
    await page.goto(base + '#home'); await page.waitForSelector('.home-card');
  });
  await t.step('the cloud run\'s ack arrives with a sync: n1 is read, n2 still waiting, and the ack is taken once', async () => {
    await page.evaluate(() => WL.driveSync.sync());
    await page.evaluate(() => {
      const f = JSON.parse(window.__drive.content || '{}');
      f.answers = Object.assign(f.answers || {}, { 'notes-ack-20261127150000': { task: 'notes-ack', answer: { ids: ['n1', 'gone'], at: '2026-11-27T15:00:00.000Z' } } });
      window.__drive.content = JSON.stringify(f);
      return WL.driveSync.sync();
    });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.some((n) => n.read));
    const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes);
    assert.strictEqual(notes.find((n) => n.id === 'n1').read, '2026-11-27T15:00:00.000Z');
    assert.ok(!notes.find((n) => n.id === 'n2').read);
    await page.click('[data-wl-note]');
    await page.waitForSelector('#wl-note-sheet');
    await page.click('#wl-note-list summary');
    const st = await page.$$eval('.wl-note-state', (e) => e.map((x) => x.textContent));
    assert.strictEqual(st[0], 'Waiting for the next autopilot run');
    assert.ok(/^✓ Read by the autopilot \(/.test(st[1]), st[1]);
    // deleting: the read one goes at once; the unread one asks for a second tap
    const delBtns = await page.$$('.wl-note-del');
    assert.strictEqual(delBtns.length, 2);
    await page.click('.wl-note-del[data-id="n2"]');
    assert.strictEqual(await page.textContent('.wl-note-del[data-id="n2"]'), 'Not read yet: tap again to delete');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.length), 2, 'not yet');
    await page.keyboard.press('Escape');
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-sync-when');
    assert.ok((await page.textContent('#wl-sync-when')).includes('1 note for the autopilot not read yet'));
    await page.evaluate(() => WL.driveSync.sync());
    assert.ok(((JSON.parse(await page.evaluate(() => window.__drive.content)).acked) || []).includes('notes-ack-20261127150000'), 'acked so the next run drops the row');
  });
  await t.step('Android Back with the note sheet open closes the sheet and stays on the screen', async () => {
    await page.goto(base + '#calm'); await page.waitForTimeout(50);
    await page.click('[data-wl-note]'); await page.waitForSelector('#wl-note-modal');
    assert.strictEqual(await page.evaluate(() => window.FCBack()), true);
    assert.ok(!(await page.$('#wl-note-modal')));
    assert.strictEqual(await page.evaluate(() => location.hash), '#calm');
    assert.strictEqual(await page.evaluate(() => window.FCBack()), false, 'nothing open: Back goes back as usual');
  });
  await t.step('a read note deletes with one tap; an unread one with two', async () => {
    await page.goto(base + '#home'); await page.waitForSelector('.home-card');
    await page.click('[data-wl-note]'); await page.waitForSelector('#wl-note-sheet'); await page.click('#wl-note-list summary');
    await page.click('.wl-note-del[data-id="n1"]');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.map((n) => n.id)), ['n2']);
    await page.click('.wl-note-del[data-id="n2"]'); await page.click('.wl-note-del[data-id="n2"]');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.length), 0);
    await page.keyboard.press('Escape');
  });
  await t.step('Settings > Sync refreshes unread note count live on save, notes-ack, and delete', async () => {
    await page.goto(base + '#settings');
    await page.waitForSelector('#wl-sync-when');
    assert.ok(!(await page.textContent('#wl-sync-when')).includes('not read yet'), 'starts at 0 unread');

    // Save two notes while staying on #settings
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-in');
    await page.fill('#wl-note-in', 'First live settings note');
    await page.click('#wl-note-save');
    await page.waitForFunction(() => document.getElementById('wl-sync-when').textContent.includes('1 note for the autopilot not read yet'));

    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-in');
    await page.fill('#wl-note-in', 'Second live settings note');
    await page.click('#wl-note-save');
    await page.waitForFunction(() => document.getElementById('wl-sync-when').textContent.includes('2 notes for the autopilot not read yet'));

    // Deliver notes-ack for one note while staying on #settings (no navigation or reload)
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.notes.v1')).notes.map((n) => n.id));
    await page.evaluate((ackId) => {
      const f = JSON.parse(window.__drive.content || '{}');
      f.answers = Object.assign(f.answers || {}, { 'notes-ack-live': { task: 'notes-ack', answer: { ids: [ackId], at: '2026-11-27T16:00:00.000Z' } } });
      window.__drive.content = JSON.stringify(f);
      return WL.driveSync.sync();
    }, ids[1]);
    await page.waitForFunction(() => document.getElementById('wl-sync-when').textContent.includes('1 note for the autopilot not read yet'));

    // Delete the remaining unread note while staying on #settings -> count drops to 0 immediately
    await page.click('#wl-bar-note');
    await page.waitForSelector('#wl-note-sheet');
    await page.click('#wl-note-list summary');
    await page.click('.wl-note-del[data-id="' + ids[0] + '"]');
    await page.click('.wl-note-del[data-id="' + ids[0] + '"]');
    await page.waitForFunction(() => !document.getElementById('wl-sync-when').textContent.includes('not read yet'));
    await page.keyboard.press('Escape');
  });
  await t.step('with neither Drive sync nor the PC link, the sheet says the note waits on the phone', async () => {
    const p2 = await t.ctx.newPage();
    await p2.goto(base + '#home'); await p2.waitForSelector('.home-card');
    await p2.click('[data-wl-note]'); await p2.waitForSelector('#wl-note-where');
    assert.ok((await p2.textContent('#wl-note-where')).includes('The autopilot sees it once Drive sync (Settings) or the PC link is on.'));
    await p2.close();
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('notes ack');
})().catch((e) => { console.error(e); process.exit(1); });
