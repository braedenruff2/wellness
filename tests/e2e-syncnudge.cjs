/* Home's Drive sync nudge: until Drive sync and the answers sheet are set up, one card on Home says what they give;
   "Not now" hides it for a week; a recent Drive sync counts as a backup (no backup nudge). */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

const FAKE_DRIVE = `
  (function () {
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
    var d = window.__drive = {
      configured: ls('test.drive.configured') === '1',
      name: 'wellness-sync.json',
      content: ls('test.drive.content') || '',
      reads: 0,
      writes: 0,
      lastSync: +(ls('test.drive.lastSync') || 0),
      error: '',
      failWrite: null,
      failRead: null,
      answersConfigured: ls('test.drive.ansConfigured') === '1',
      answersName: 'wellness-answers',
      answersContent: ls('test.drive.ansContent') || '',
      answersReads: 0,
      answersError: '',
      failAnswers: null,
      restoreContent: '',
      restoreName: 'wellness-sync.json',
      failRestore: null
    };
    window.FCAndroid = {
      syncStatus: function () {
        return JSON.stringify({
          configured: d.configured, name: d.name, lastSync: d.lastSync, error: d.error, busy: false,
          answersConfigured: d.answersConfigured, answersName: d.answersConfigured ? d.answersName : '', answersError: d.answersError
        });
      },
      syncPick: function () {
        d.configured = true;
        ls('test.drive.configured', '1');
        d.error = '';
        Promise.resolve().then(function () { window.FCSyncState && window.FCSyncState(true); });
      },
      syncPickRestore: function () {
        Promise.resolve().then(function () {
          if (d.failRestore) window.FCSyncRestore && window.FCSyncRestore(false, d.failRestore, '');
          else window.FCSyncRestore && window.FCSyncRestore(true, d.restoreContent, d.restoreName);
        });
      },
      syncPickAnswers: function () {
        d.answersConfigured = true;
        ls('test.drive.ansConfigured', '1');
        d.answersError = '';
        Promise.resolve().then(function () { window.FCSyncState && window.FCSyncState(true); });
      },
      syncForgetAnswers: function () {
        d.answersConfigured = false;
        d.answersError = '';
        ls('test.drive.ansConfigured', null);
        Promise.resolve().then(function () { window.FCSyncState && window.FCSyncState(false); });
      },
      syncForget: function () {
        d.configured = false;
        d.answersConfigured = false;
        d.lastSync = 0;
        d.error = '';
        d.answersError = '';
        ls('test.drive.configured', null);
        ls('test.drive.ansConfigured', null);
        ls('test.drive.lastSync', null);
        Promise.resolve().then(function () { window.FCSyncState && window.FCSyncState(false); });
      },
      syncRead: function (id) {
        d.reads++;
        Promise.resolve().then(function () {
          if (d.failRead) { d.error = d.failRead; window.FCSyncDone(id, false, d.failRead); }
          else window.FCSyncDone(id, true, d.content);
        });
      },
      syncReadAnswers: function (id) {
        d.answersReads++;
        Promise.resolve().then(function () {
          if (d.failAnswers) { d.answersError = d.failAnswers; window.FCSyncDone(id, false, d.failAnswers); }
          else { d.answersError = ''; window.FCSyncDone(id, true, d.answersContent); }
        });
      },
      syncWrite: function (id, text) {
        d.writes++;
        Promise.resolve().then(function () {
          if (d.failWrite) { d.error = d.failWrite; window.FCSyncDone(id, false, d.failWrite); }
          else {
            d.content = text; d.lastSync = Date.now(); d.error = '';
            ls('test.drive.content', text);
            ls('test.drive.lastSync', String(d.lastSync));
            window.FCSyncDone(id, true, '');
          }
        });
      }
    };
  })();
`;

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 21, 10, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE_DRIVE);

  await t.step('not set up: Home shows the sync card (instead of the backup nudge); Set it up opens Settings at the sync card', async () => {
    await page.goto(base + '#home');
    const txt = await page.textContent('#wl-sync-nudge');
    assert.ok(txt.includes('Sync with Google Drive') && txt.includes('answer from the cloud'), txt);
    assert.strictEqual(await page.$('#wl-backup'), null, 'one card, not two');
    await page.click('#wl-sync-nudge-go');
    await page.waitForSelector('#wl-sync-pick');
    assert.strictEqual(await page.evaluate(() => location.hash), '#settings/sync');
  });
  await t.step('Not now hides it for a week, then it comes back', async () => {
    await page.goto(base + '#home');
    await page.click('#wl-sync-later');
    assert.strictEqual(await page.$('#wl-sync-nudge'), null);
    await page.reload();
    assert.strictEqual(await page.$('#wl-sync-nudge'), null, 'still hidden after reopening');
    await page.clock.fastForward(8 * 864e5);
    await page.goto(base + '#settings'); await page.goto(base + '#home');
    assert.ok(await page.$('#wl-sync-nudge'), 'back after a week');
  });
  await t.step('folder chosen but no answers sheet: the card asks for the sheet; with both set it is gone', async () => {
    await page.goto(base + '#settings');
    await page.click('#wl-sync-pick');
    await page.waitForFunction(() => window.__drive.writes >= 1);
    await page.goto(base + '#home');
    const txt = await page.textContent('#wl-sync-nudge');
    assert.ok(txt.includes('Answers sheet: not set') && txt.includes('wellness-answers'), txt);
    // a question waiting for the cloud without the sheet: the card stays even after "Not now", and says so
    await page.click('#wl-sync-later');
    assert.strictEqual(await page.$('#wl-sync-nudge'), null);
    await page.evaluate(() => WL.driveSync.enqueue('advice', { note: 'x' }));
    await page.goto(base + '#settings'); await page.goto(base + '#home');
    const w = await page.textContent('#wl-sync-nudge');
    assert.ok(/1 question is waiting for the cloud/.test(w) && /can’t reach this phone/.test(w), w);
    assert.strictEqual(await page.$('#wl-sync-later'), null, 'no Not now while answers are stuck');
    assert.ok((await page.evaluate(() => WL.pc.queuedText())).includes('choose the answers sheet'));
    await page.goto(base + '#settings');
    assert.ok(/Answers sheet: not set.*\(1 waiting\)/.test(await page.textContent('#wl-sync-ans')));
    await page.click('#wl-sync-ans-pick');
    await page.waitForFunction(() => window.__drive.answersConfigured);
    await page.goto(base + '#home');
    assert.strictEqual(await page.$('#wl-sync-nudge'), null);
    assert.ok(!(await page.evaluate(() => WL.pc.queuedText())).includes('answers sheet'), 'sheet set: the plain line');
    await page.goto(base + '#settings');
    assert.ok(/Answers sheet: wellness-answers/.test(await page.textContent('#wl-sync-ans')));
  });
  await t.step('a recent Drive sync counts as a backup: no backup nudge 20 days on while it syncs', async () => {
    await page.clock.fastForward(20 * 864e5);
    await page.evaluate(() => WL.driveSync.sync());
    await page.goto(base + '#settings'); await page.goto(base + '#home');
    assert.strictEqual(await page.$('#wl-backup'), null);
    await page.evaluate(() => { window.__drive.failWrite = 'Drive refused'; });
    await page.clock.fastForward(15 * 864e5);
    await page.evaluate(() => WL.driveSync.sync().catch(() => {}));
    await page.goto(base + '#settings'); await page.goto(base + '#home');
    assert.ok(await page.$('#wl-backup'), 'sync failing for 15 days: the backup nudge is back');
    const txt = await page.textContent('#wl-backup');
    assert.ok(txt.includes('Drive sync last worked 15 days ago') && !txt.includes('haven’t saved a backup'), txt);
    await page.click('#wl-backup a[href="#settings/sync"]');
    await page.waitForSelector('#wl-sync-pick');
  });
  await t.step('a backup file saved after the last Drive sync: the nudge counts from the backup', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.shell.v1')); s.lastBackup = new Date(Date.now() - 14.5 * 864e5).toISOString(); s.nudged = null; localStorage.setItem('wl.shell.v1', JSON.stringify(s)); });
    await page.reload();
    await page.goto(base + '#home');
    const txt = await page.textContent('#wl-backup');
    assert.ok(txt.includes('Your last backup was 14 days ago') && !txt.includes('Drive sync last worked'), txt);
  });
  await t.step('no errors, nothing overflows', async () => { await t.noOverflow(['#home', '#settings']); assert.deepStrictEqual(t.errors, []); });
  await t.close('drive sync nudge browser');
})().catch((e) => { console.error(e); process.exit(1); });
