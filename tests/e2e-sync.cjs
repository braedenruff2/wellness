/* Browser e2e for Google Drive sync (Settings > Sync with Google Drive) using a fake Android SAF bridge. */
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

  await t.step('Settings shows Drive sync card; choosing folder writes backup JSON + requests', async () => {
    await page.goto(base + '#todo');
    await page.fill('#td-new', 'buy diapers'); await page.press('#td-new', 'Enter');
    await page.goto(base + '#settings');
    await page.waitForSelector('#wl-sync');
    assert.ok((await page.textContent('#wl-sync')).includes('Sync with Google Drive'));
    await page.click('#wl-sync-pick');
    await page.waitForFunction(() => window.__drive.writes === 1);
    const saved = await page.evaluate(() => JSON.parse(window.__drive.content));
    assert.strictEqual(saved.app, 'wellness');
    assert.ok(saved.stores['wl.todo.v1'] && saved.stores['wl.todo.v1'].includes('buy diapers'), 'contains backup data');
    assert.deepStrictEqual(saved.requests, []);
    assert.deepStrictEqual(saved.acked, []);
    assert.ok((await page.textContent('#wl-sync-when')).includes('Last synced:'), await page.textContent('#wl-sync-when'));
  });

  await t.step('auto-sync on background is throttled to 30 min; Sync now bypasses throttle', async () => {
    // 10 min later: FCSaveNow (background) should NOT write again
    await page.clock.fastForward(10 * 60 * 1000);
    await page.evaluate(() => window.FCSaveNow());
    await page.waitForTimeout(50);
    assert.strictEqual(await page.evaluate(() => window.__drive.writes), 1, 'throttled within 30 min');

    // Sync now works immediately
    await page.click('#wl-sync-now');
    await page.waitForFunction(() => window.__drive.writes === 2);

    // 31 min later: background auto-sync runs
    await page.clock.fastForward(31 * 60 * 1000);
    await page.evaluate(() => window.FCSaveNow());
    await page.waitForFunction(() => window.__drive.writes === 3);
  });

  await t.step('reads cloud answers before writing, keeps them until taken, writes acked ids', async () => {
    await page.evaluate(() => {
      WL.driveSync.enqueue('advice', { question: 'sleep tips' }, 'req-42');
      window.__got = [];
      WL.driveSync.onAnswers(function (ans, fresh) { window.__got.push({ ans: ans, fresh: fresh }); });
    });
    await page.click('#wl-sync-now');
    await page.waitForFunction(() => window.__drive.writes === 4);
    const sent = await page.evaluate(() => JSON.parse(window.__drive.content));
    assert.strictEqual(sent.requests.length, 1);
    assert.strictEqual(sent.requests[0].id, 'req-42');

    // Simulate cloud run writing answers into wellness-sync.json
    await page.evaluate(() => {
      const f = JSON.parse(window.__drive.content);
      f.answers = { 'req-42': { at: '2026-11-21T15:00:00Z', answer: { headline: 'Rest first' } } };
      window.__drive.content = JSON.stringify(f);
    });
    await page.click('#wl-sync-now');
    await page.waitForFunction(() => window.__drive.writes === 5);

    const after = await page.evaluate(() => ({
      drive: JSON.parse(window.__drive.content),
      localAns: WL.driveSync.answers(),
      got: window.__got
    }));
    assert.deepStrictEqual(after.drive.acked, ['req-42'], 'acked written to Drive');
    assert.deepStrictEqual(after.drive.requests, [], 'answered request dropped from queue');
    assert.strictEqual(after.localAns['req-42'].answer.headline, 'Rest first', 'kept locally until shown');
    assert.deepStrictEqual(after.got[0].fresh, ['req-42'], 'onAnswers listener notified');
    assert.ok((await page.textContent('#wl-sync-when')).includes('1 cloud answer ready'));

    // Take/consume the answer and verify another sync with stale remote answers does not resurrect it
    const taken = await page.evaluate(() => WL.driveSync.takeAnswer('req-42'));
    assert.strictEqual(taken.answer.headline, 'Rest first');
    await page.evaluate(() => {
      const f = JSON.parse(window.__drive.content);
      f.answers = { 'req-42': { at: '2026-11-21T15:00:00Z', answer: { headline: 'Rest first' } } };
      window.__drive.content = JSON.stringify(f);
    });
    await page.click('#wl-sync-now');
    await page.waitForFunction(() => window.__drive.writes === 6);
    assert.deepStrictEqual(await page.evaluate(() => WL.driveSync.answers()), {}, 'consumed answer stays gone');
  });

  await t.step('provider write refusal shows error plainly while keeping answers already read', async () => {
    await page.evaluate(() => {
      const f = JSON.parse(window.__drive.content);
      f.answers = { 'req-99': { answer: { headline: 'Kept even on write error' } } };
      window.__drive.content = JSON.stringify(f);
      window.__drive.failWrite = "Google Drive's provider refused writes to this file.";
    });
    await page.click('#wl-sync-now');
    await page.waitForSelector('#wl-sync-err');
    const errText = await page.textContent('#wl-sync-err');
    assert.ok(errText.includes('refused writes'), errText);
    assert.strictEqual(await page.evaluate(() => WL.driveSync.peekAnswer('req-99').answer.headline), 'Kept even on write error');
    await page.evaluate(() => { window.__drive.failWrite = null; WL.driveSync.takeAnswer('req-99'); });
  });

  await t.step('answers Google Sheet (CSV export): reads rows, merges answers + acked, handles Drive export refusal plainly', async () => {
    await page.evaluate(() => {
      WL.driveSync.enqueue('advice', { question: 'evening routine' }, 'req-sheet-1');
      window.__sheetGot = [];
      WL.driveSync.onAnswers(function (ans, fresh) { window.__sheetGot.push({ ans: ans, fresh: fresh }); });
      window.__drive.answersContent = 'id,task,answer-json,at\r\n'
        + 'req-sheet-1,advice,"{""headline"":""Keep evenings quiet"",""points"":[""dim lights""],""next"":""Box breathe""}",2026-11-21T16:00:00Z\r\n';
      localStorage.setItem('test.drive.ansContent', window.__drive.answersContent);
    });
    const writesBefore = await page.evaluate(() => window.__drive.writes);
    await page.click('#wl-sync-ans-pick');
    await page.waitForFunction((n) => window.__drive.writes === n + 1, writesBefore);
    assert.ok((await page.textContent('#wl-sync-ans')).includes('wellness-answers'));
    const after = await page.evaluate(() => ({
      reads: window.__drive.answersReads,
      drive: JSON.parse(window.__drive.content),
      deliveredAdvice: WL.pc.settings().advice,
      got: window.__sheetGot
    }));
    assert.strictEqual(after.reads, 1);
    assert.strictEqual(after.got[0].ans['req-sheet-1'].task, 'advice');
    assert.strictEqual(after.got[0].ans['req-sheet-1'].answer.headline, 'Keep evenings quiet');
    assert.strictEqual(after.deliveredAdvice && after.deliveredAdvice.answer && after.deliveredAdvice.answer.headline, 'Keep evenings quiet', 'delivered through WL.pc to advice');
    assert.ok(after.drive.acked.includes('req-sheet-1'), 'sheet answer id acked in wellness-sync.json');
    assert.strictEqual(after.drive.requests.length, 0, 'answered request removed');
    assert.deepStrictEqual(after.got[0].fresh, ['req-sheet-1']);

    // If Drive refuses CSV export on the answers sheet, show the error plainly while backup still syncs
    await page.evaluate(() => {
      window.__drive.failAnswers = 'Google Drive refused to export the answers sheet as CSV.';
    });
    const w2 = await page.evaluate(() => window.__drive.writes);
    await page.click('#wl-sync-now');
    await page.waitForFunction((n) => window.__drive.writes === n + 1, w2);
    await page.waitForSelector('#wl-sync-ans-err');
    assert.ok((await page.textContent('#wl-sync-ans-err')).includes('refused to export'));
    await page.evaluate(() => { window.__drive.failAnswers = null; });
  });

  await t.step('auto-sync runs on app open when 30 min have passed; a11y at Larger text size (1.3)', async () => {
    await page.evaluate(() => { localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: null, textSize: 1.3 })); });
    await page.goto('about:blank');
    await page.clock.fastForward(35 * 60 * 1000);
    await page.goto(base + '#settings');
    await page.waitForSelector('#wl-sync');
    await page.clock.runFor(2000);
    await page.waitForFunction(() => window.__drive.writes === 1);
    await t.noOverflow(['#settings']);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('#wl-sync button'))
      .filter((e) => e.offsetParent !== null && !e.classList.contains('link'))
      .map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44));
    assert.deepStrictEqual(small, []);
  });

  await t.step('removing answers sheet and turning off Drive sync resets to unconfigured', async () => {
    await page.click('#wl-sync-ans-forget');
    await page.waitForFunction(() => !window.__drive.answersConfigured);
    assert.ok((await page.textContent('#wl-sync')).includes('Choose answers sheet'));
    await page.click('#wl-sync-forget');
    assert.ok((await page.textContent('#wl-sync-forget')).includes('Tap again'));
    await page.click('#wl-sync-forget');
    await page.waitForFunction(() => !window.__drive.configured);
    assert.ok((await page.textContent('#wl-sync')).includes('Choose Google Drive folder'));
  });

  await t.step('Restore from Drive (ACTION_OPEN_DOCUMENT) works even before sync is set up, with confirm and validation', async () => {
    // Prepare a Drive wellness-sync.json backup containing a different to-do item
    await page.evaluate(() => {
      window.__drive.restoreContent = JSON.stringify({
        app: 'wellness',
        exported: '2026-11-20T15:00:00Z',
        stores: {
          'wl.todo.v1': JSON.stringify({
            tasks: [{ id: 't1', text: 'restored from Drive', due: '2026-11-21', done: false, repeat: null, remind: null, created: '2026-11-20T15:00:00Z' }]
          })
        },
        requests: [],
        acked: []
      });
      window.__confirmReply = false;
      window.__confirmPrompt = '';
      window.confirm = function (msg) { window.__confirmPrompt = msg; return window.__confirmReply; };
    });

    // 1) Cancelling confirm leaves existing phone data untouched
    await page.click('#wl-sync-restore');
    await page.waitForFunction(() => !!window.__confirmPrompt);
    assert.ok((await page.evaluate(() => window.__confirmPrompt)).includes('wellness-sync.json'));
    assert.ok((await page.evaluate(() => localStorage.getItem('wl.todo.v1'))).includes('buy diapers'), 'cancel kept current data');

    // 2) Corrupt/non-backup file shows error without confirming or overwriting
    await page.evaluate(() => { window.__drive.restoreContent = '{"app":"other"}'; window.__confirmPrompt = ''; });
    await page.click('#wl-sync-restore');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('not a backup'));
    assert.strictEqual(await page.evaluate(() => window.__confirmPrompt), '', 'bad file rejected before confirm');

    // 3) Valid wellness-sync.json + confirm accepted restores the app data
    await page.evaluate(() => {
      window.__drive.restoreContent = JSON.stringify({
        app: 'wellness',
        exported: '2026-11-20T15:00:00Z',
        stores: {
          'wl.todo.v1': JSON.stringify({
            tasks: [{ id: 't1', text: 'restored from Drive', due: '2026-11-21', done: false, repeat: null, remind: null, created: '2026-11-20T15:00:00Z' }]
          })
        },
        requests: [],
        acked: []
      });
      window.__confirmReply = true;
    });
    await page.click('#wl-sync-restore');
    await page.waitForFunction(() => (localStorage.getItem('wl.todo.v1') || '').includes('restored from Drive'));
    await page.goto(base + '#todo');
    assert.ok((await page.textContent('#view')).includes('restored from Drive'));
  });

  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('drive sync browser');
})().catch((e) => { console.error(e); process.exit(1); });
