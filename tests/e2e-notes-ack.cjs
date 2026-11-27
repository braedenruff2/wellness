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
    await page.keyboard.press('Escape');
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
    await page.keyboard.press('Escape');
    await page.evaluate(() => WL.driveSync.sync());
    assert.ok(((JSON.parse(await page.evaluate(() => window.__drive.content)).acked) || []).includes('notes-ack-20261127150000'), 'acked so the next run drops the row');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('notes ack');
})().catch((e) => { console.error(e); process.exit(1); });
