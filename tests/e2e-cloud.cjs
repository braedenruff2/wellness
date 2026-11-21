/* Cloud answers (task B): with the PC not answering and Drive sync on, Claude requests go into the sync file's
   queue with a plain "answered by the next cloud run" note, and a cloud answer written into the file shows through
   the same code as a PC answer (parenting scenario, grading and real-situation advice, Home advice, weekly plan,
   Tagalog checks). Without Drive sync nothing is queued and the error says how to turn it on. */
'use strict';
const assert = require('assert');
const W = require('./lib/web.cjs');

const FAKE = `
  (function () {
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
    var d = window.__drive = { configured: ls('test.drive.off') !== '1', content: ls('test.drive.content') || '', writes: 0 };
    var pc = window.__pc = { asks: 0 };
    window.FCAndroid = {
      pcStatus: function () { return '{"paired":true,"host":"192.168.1.20","name":"PC"}'; },
      pcRequest: function (id, op, a) {
        if (op === 'post' && a === '/v1/ask') pc.asks++;
        Promise.resolve().then(function () { window.FCPcDone(id, false, "couldn't reach the PC at 192.168.1.20. Is the PC link running there, and the phone on the same Wi-Fi?"); });
      },
      syncStatus: function () { return JSON.stringify({ configured: d.configured, name: 'wellness-sync.json', lastSync: 0, error: '', busy: false }); },
      syncRead: function (id) { Promise.resolve().then(function () { window.FCSyncDone(id, true, d.content); }); },
      syncWrite: function (id, text) { d.writes++; Promise.resolve().then(function () { d.content = text; ls('test.drive.content', text); window.FCSyncDone(id, true, ''); }); }
    };
  })();
`;
const QUEUED = 'Your PC isn’t answering, so this will be answered by the next cloud run (within about 5 hours).';

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 21, 10, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE);
  await page.goto(base + '#home');
  await page.evaluate(() => {
    localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Test', birth: '2025-11-02' }, history: [], current: null }));
    localStorage.setItem('wl.me.v1', JSON.stringify({ feedback: [], checkins: { '2026-11-21': { at: '2026-11-21T12:00:00Z', sleep: '6–7 h', wakes: '2', energy: 'OK', mood: 'OK', day: 'Good' } }, plan: null, skipped: {} }));
  });
  await page.reload();
  const file = () => page.evaluate(() => JSON.parse(window.__drive.content || '{}'));
  const reqs = async (task) => ((await file()).requests || []).filter((r) => r.task === task);
  // what a cloud run does: add answers to the file (keeping the rest); the phone takes them on its next sync
  const cloudAnswers = (answers) => page.evaluate((a) => {
    const f = JSON.parse(window.__drive.content); f.answers = Object.assign(f.answers || {}, a); window.__drive.content = JSON.stringify(f);
    return WL.driveSync.sync();
  }, answers);
  const coach = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));

  await t.step('parenting: a new scenario is queued for the cloud, with the plain note (once, however often tapped)', async () => {
    await page.goto(base + '#coach');
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const txt = await page.textContent('#co-queued');
    assert.ok(txt.includes(QUEUED) && txt.includes('A new scenario'), txt);
    assert.ok(!(await page.$('#co-offline')), 'no "try again at home" error when it was queued');
    await page.click('#co-new');
    await page.waitForFunction(() => window.__pc.asks === 2);
    await page.waitForTimeout(50);
    const r = await reqs('coach-scenario');
    assert.strictEqual(r.length, 1, JSON.stringify(r));
    assert.strictEqual(r[0].input.child, 'Test');
    assert.ok(r[0].input.age, 'the same input the PC gets');
  });
  let scnId;
  await t.step('the cloud answer shows as the scenario, and the request is acked', async () => {
    scnId = (await reqs('coach-scenario'))[0].id;
    await cloudAnswers({ [scnId]: { task: 'coach-scenario', answer: { title: 'Stairs at the cottage', skill: 'Safety', scenario: 'She heads for the stairs.', question: 'What do you do?' } } });
    await page.waitForSelector('#co-answer');
    assert.ok((await page.textContent('#view')).includes('Stairs at the cottage'));
    assert.ok(!(await page.$('#co-queued')));
    await page.evaluate(() => WL.driveSync.sync());
    const f = await file();
    assert.ok(f.acked.includes(scnId), 'acked'); assert.strictEqual((f.requests || []).length, 0);
  });
  await t.step('grading goes to the cloud and comes back as feedback in history', async () => {
    await page.fill('#co-answer', 'I scoop her up calmly and show her how to go down backwards, step by step.');
    await page.click('#co-grade');
    await page.waitForSelector('#co-queued');
    assert.ok((await page.textContent('#co-queued')).includes('Feedback on “Stairs at the cottage”'));
    const r = await reqs('coach-grade');
    assert.strictEqual(r.length, 1); assert.ok(/backwards/.test(r[0].input.answer));
    await cloudAnswers({ [r[0].id]: { task: 'coach-grade', answer: { score: 8, verdict: 'Good and calm.', good: ['calm'], improve: ['name the feeling'], better: 'b', why: 'w', practice: 'p', sources: [] } } });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.coach.v1')).history.length === 1);
    const c = await coach();
    assert.strictEqual(c.history[0].result.score, 8); assert.strictEqual(c.history[0].title, 'Stairs at the cottage'); assert.strictEqual(c.current, null);
    assert.ok(!(await page.$('#co-queued')));
  });
  await t.step('real-situation advice goes to the cloud and comes back in Past practice', async () => {
    await page.fill('#co-real', 'She screams in the car seat every time since last week. I have tried songs.');
    await page.click('#co-real-go');
    await page.waitForSelector('#co-queued');
    assert.ok((await page.textContent('#co-queued')).includes('Advice: “She screams in the car seat'));
    const r = await reqs('coach-advice');
    await cloudAnswers({ [r[0].id]: { task: 'coach-advice', answer: { title: 'Car seat protests', skill: 'Crying and comfort', summary: 's', steps: ['one', 'two', 'three'], say: [], avoid: [], why: 'w', watch: '', sources: [] } } });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.coach.v1')).history.length === 2);
    assert.ok((await page.textContent('#view')).includes('Car seat protests'));
  });
  await t.step('a cloud error shows plainly', async () => {
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const id = (await reqs('coach-scenario'))[0].id;
    await cloudAnswers({ [id]: { task: 'coach-scenario', error: 'The cloud run could not answer this one. Try again.' } });
    await page.waitForFunction(() => !document.querySelector('#co-queued'));
    assert.ok((await page.textContent('#view')).includes('The cloud run could not answer this one'));
  });
  await t.step('Home advice and the weekly plan queue too, and show the cloud answer', async () => {
    await page.goto(base + '#home');
    await page.click('[data-advice]');
    await page.waitForSelector('#lk-queued');
    assert.ok((await page.textContent('#lk-queued')).includes(QUEUED));
    await page.click('#me-plan');
    await page.waitForSelector('#me-plan-queued');
    assert.ok(!(await page.$('#me-plan-failed')), 'queued, not "couldn’t make your plan"');
    const a = await reqs('advice'), p = await reqs('weekly-plan');
    assert.strictEqual(a.length, 1); assert.strictEqual(p.length, 1); assert.ok(p[0].input.checkins, 'plan input as the PC gets it');
    await cloudAnswers({
      [a[0].id]: { task: 'advice', answer: { headline: 'A steady week', points: ['p1', 'p2', 'p3'], next: 'Nap when she naps' } },
      [p[0].id]: { task: 'weekly-plan', answer: { headline: 'Rest first this week', parts: { home: { focus: 'One rest a day', why: 'short sleep' } }, check: 'When do you feel best?' } }
    });
    await page.waitForFunction(() => /A steady week/.test(document.querySelector('.home-card[data-module="link"]').textContent));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.me.v1')).plan);
    assert.ok(!(await page.$('#me-plan-queued')) && !(await page.$('#lk-queued')));
    await page.goto(base + '#me');
    assert.ok((await page.textContent('#view')).includes('Rest first this week'));
  });
  await t.step('Tagalog: a queued check shows on the Tagalog page when it is answered; Done clears it', async () => {
    await page.evaluate(() => { const i = { task: 'Say: I am drinking water', expected: 'Umiinom ako ng tubig', answer: 'ako umiinom tubig' }; WL.pc.queue('tagalog-check', i, i); });
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('#tl-checks')).includes('1 answer waiting'));
    const r = await reqs('tagalog-check');
    await cloudAnswers({ [r[0].id]: { task: 'tagalog-check', answer: { ok: false, corrected: 'Umiinom ako ng tubig', meaning: 'I am drinking water', explain: 'The verb comes first.', tip: 'tubig = water' } } });
    await page.waitForFunction(() => document.querySelector('#tl-checks') && /verb comes first/.test(document.querySelector('#tl-checks').textContent));
    const txt = await page.textContent('#tl-checks');
    assert.ok(txt.includes('ako umiinom tubig') && txt.includes('Umiinom ako ng tubig') && !txt.includes('waiting'), txt);
    await page.click('#tl-checks-clear');
    assert.ok(!(await page.$('#tl-checks')));
  });
  await t.step('without Drive sync nothing is queued and the error says how to let the cloud answer', async () => {
    await page.evaluate(() => { localStorage.setItem('test.drive.off', '1'); const f = JSON.parse(window.__drive.content); f.requests = []; localStorage.setItem('test.drive.content', JSON.stringify(f)); });
    await page.reload();
    await page.goto(base + '#coach');
    await page.click('#co-new');
    await page.waitForSelector('#co-offline');
    const txt = await page.textContent('#view');
    assert.ok(/couldn.t reach the PC/.test(txt) && txt.includes('Turn on Settings › Sync with Google Drive'), txt);
    assert.ok(!(await page.$('#co-queued')));
    assert.strictEqual(await page.evaluate(() => WL.pc.queued().length), 0);
  });
  await t.step('no errors, nothing overflows', async () => { await t.noOverflow(['#home', '#coach', '#tagalog', '#me']); assert.deepStrictEqual(t.errors, []); });
  await t.close('cloud answers browser');
})().catch((e) => { console.error(e); process.exit(1); });
