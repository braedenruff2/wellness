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
      pcStatus: function () { return ls('test.pc.unpaired') === '1' ? '{"paired":false}' : '{"paired":true,"host":"192.168.1.20","name":"PC"}'; },
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
const QUEUED_CLOUD = 'This will be answered by the next cloud run (within about 5 hours).';

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
    assert.strictEqual(r[0].input.tipNotes, undefined, 'no tip answers yet, none sent');
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
    // his "Not for me?" on last week's tip goes with the request, so Claude doesn't suggest it again
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('wl.coach.v1'));
      WLMe.state().feedback.push({ id: 'coach/notfit/x', at: new Date().toISOString(), part: 'coach', about: 'tip:' + c.history[0].id, kind: 'notfit', a: { reasons: [] }, shown: 'p', note: 'She already does this' }); });
    await page.fill('#co-real', '  She screams in the car seat every time since last week. I have tried songs.\n');
    await page.click('#co-real-go');
    await page.waitForSelector('#co-queued');
    assert.ok((await page.textContent('#co-queued')).includes('Advice: “She screams in the car seat'));
    const r = await reqs('coach-advice');
    assert.deepStrictEqual(r[0].input.tipNotes, [{ tip: 'p', skill: 'Safety', notForMe: true, note: 'She already does this' }]);
    await cloudAnswers({ [r[0].id]: { task: 'coach-advice', answer: { title: 'Car seat protests', skill: 'Crying and comfort', summary: 's', steps: ['one', 'two', 'three'], say: [], avoid: [], why: 'w', watch: '', sources: [] } } });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.coach.v1')).history.length === 2);
    assert.ok((await page.textContent('#view')).includes('Car seat protests'));
    assert.strictEqual((await coach()).realDraft, '', 'realDraft cleared even with leading/trailing whitespace');
  });
  await t.step('a cloud error shows plainly', async () => {
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const id = (await reqs('coach-scenario'))[0].id;
    await cloudAnswers({ [id]: { task: 'coach-scenario', error: 'The cloud run could not answer this one. Try again.' } });
    await page.waitForFunction(() => !document.querySelector('#co-queued'));
    assert.ok((await page.textContent('#view')).includes('The cloud run could not answer this one'));
    // a cloud scenario arriving while editing #coach/setup must not wipe the setup form
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const setupReqId = (await reqs('coach-scenario'))[0].id;
    await page.goto(base + '#coach/setup');
    await page.waitForSelector('#co-can-note');
    await page.fill('#co-can-note', 'unsaved milestone note');
    await cloudAnswers({ [setupReqId]: { task: 'coach-scenario', answer: { title: 'Bedtime story', skill: 'Routines', scenario: 'She throws the book.', question: 'What do you do?' } } });
    await page.waitForTimeout(50);
    assert.strictEqual(await page.inputValue('#co-can-note'), 'unsaved milestone note', '#coach/setup not overwritten by arriving scenario');
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-answer');
    assert.ok((await page.textContent('#view')).includes('Bedtime story'), 'scenario saved and ready when returning to #coach');
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wl.coach.v1')); s.current = null; localStorage.setItem('wl.coach.v1', JSON.stringify(s)); });
    await page.reload();
  });
  await t.step('parenting cloud answers do not steal focus or wipe search while typing in #co-real, #co-answer, or #co-hist-search', async () => {
    await page.goto(base + '#coach');
    // 1. Typing in #co-real when a cloud coach-scenario arrives
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const scnReq = (await reqs('coach-scenario'))[0].id;
    await page.focus('#co-real');
    await page.fill('#co-real', 'Drafting a real situation about nap time');
    await cloudAnswers({ [scnReq]: { task: 'coach-scenario', answer: { title: 'Snack throw', skill: 'Limits and boundaries', scenario: 'She throws peas on the floor.', question: 'What do you do?' } } });
    await page.waitForTimeout(50);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-real', '#co-real kept focus on coach-scenario arrival');
    assert.strictEqual(await page.inputValue('#co-real'), 'Drafting a real situation about nap time');
    assert.strictEqual((await coach()).current.title, 'Snack throw', 'scenario saved in state');
    await page.goto(base + '#home'); await page.goto(base + '#coach');
    await page.waitForSelector('#co-answer');
    assert.ok((await page.textContent('#view')).includes('Snack throw'), 'scenario shown on next render');
    // 2. Typing in #co-answer when a cloud coach-advice arrives
    const advReq = await page.evaluate(() => WL.pc.queue('coach-advice', { situation: 'Earlier nap question' }, { answer: 'Earlier nap question' }).id);
    await page.focus('#co-answer');
    await page.fill('#co-answer', 'I stay calm and put the bowl aside while explaining food stays on the tray.');
    await cloudAnswers({ [advReq]: { task: 'coach-advice', answer: { title: 'Nap transitions', skill: 'Routines', summary: 'Keep wind-down steady.', steps: ['Dim lights'], say: [], avoid: [], why: 'Predictability helps.', watch: '', sources: [] } } });
    await page.waitForTimeout(50);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-answer', '#co-answer kept focus on coach-advice arrival');
    assert.ok((await page.inputValue('#co-answer')).includes('bowl aside'));
    assert.ok((await coach()).history.some((h) => h.title === 'Nap transitions'), 'advice saved in history');
    // 3. Filtering #co-hist-search (6+ history items) when a cloud coach-grade arrives
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      for (let i = 0; i < 4; i++) {
        s.history.push({ id: 'pad-' + i, at: new Date(Date.UTC(2026, 10, 10 + i, 12, 0)).toISOString(), skill: 'Play', age: '12 months', title: 'Extra moment ' + i, scenario: 's', answer: 'a', result: { score: 7, verdict: 'ok', good: [], improve: [], better: '', why: '', practice: '', sources: [] } });
      }
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await page.goto(base + '#home'); await page.goto(base + '#coach');
    await page.waitForSelector('#co-hist-search');
    const gradeScn = (await coach()).current;
    const gradeReq = await page.evaluate((scn) => WL.pc.queue('coach-grade', { answer: 'I stay calm and keep the tray steady.' }, { answer: 'I stay calm and keep the tray steady.', scn }).id, gradeScn);
    await page.focus('#co-hist-search');
    await page.fill('#co-hist-search', 'Nap transitions');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 1);
    await cloudAnswers({ [gradeReq]: { task: 'coach-grade', answer: { score: 9, verdict: 'Calm and clear.', good: ['calm'], improve: [], better: '', why: '', practice: '', sources: [] } } });
    await page.waitForTimeout(50);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-hist-search', '#co-hist-search kept focus on coach-grade arrival');
    assert.strictEqual(await page.inputValue('#co-hist-search'), 'Nap transitions', 'search filter preserved');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 1, 'filtered list untouched');
    assert.ok((await coach()).history.some((h) => h.title === 'Snack throw' && h.result && h.result.score === 9), 'graded scenario saved in history');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.current = null; s.realDraft = '';
      s.history = s.history.filter((h) => !/^pad-/.test(h.id));
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await page.goto(base + '#home'); await page.goto(base + '#coach');
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
    // a cloud weekly-plan arriving while typing in #me-ck-note on #me does not yank focus away from the note input
    await page.focus('#me-ck-note');
    await page.fill('#me-ck-note', 'typing a note');
    await cloudAnswers({ 'plan-note-guard': { task: 'weekly-plan', answer: { headline: 'Keep writing uninterrupted', parts: { home: { focus: 'Gentle pace', why: 'busy week' } }, check: 'How are you feeling?' } } });
    await page.waitForTimeout(50);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'me-ck-note', '#me-ck-note kept focus when cloud plan arrived');
    assert.strictEqual(await page.inputValue('#me-ck-note'), 'typing a note');
    await page.goto(base + '#home'); await page.goto(base + '#me');
    assert.ok((await page.textContent('#view')).includes('Keep writing uninterrupted'), 'new cloud plan shows on next render');
    // a cloud advice answer arriving while a new PC advice request is in flight still saves the cloud answer (never { waiting: 0 })
    await page.goto(base + '#home');
    await page.evaluate(() => {
      const orig = window.FCAndroid.pcRequest;
      window.__holdPc = [];
      window.FCAndroid.pcRequest = function (id, op, a, b) {
        if (op === 'post' && a === '/v1/ask') { window.__holdPc.push(id); return; }
        orig(id, op, a, b);
      };
    });
    await page.click('[data-advice]');
    await page.waitForSelector('text=Claude is thinking');
    await cloudAnswers({ 'adv-race': { task: 'advice', answer: { headline: 'Fresh cloud advice', points: ['p'], next: 'n' } } });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.pc.v1')).advice);
    assert.strictEqual(saved && saved.answer && saved.answer.headline, 'Fresh cloud advice');
    await page.evaluate(() => { window.__holdPc.forEach((id) => window.FCPcDone(id, false, "couldn't reach the PC")); });
    await page.waitForSelector('text=Fresh cloud advice');
    await page.reload();
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
  await t.step('no PC paired, Drive sync on: parenting, Home advice, the weekly plan and Tagalog checks go straight to the cloud', async () => {
    await page.evaluate(() => {
      localStorage.setItem('test.pc.unpaired', '1');
      const f = JSON.parse(window.__drive.content); f.requests = []; localStorage.setItem('test.drive.content', JSON.stringify(f));
      const me = JSON.parse(localStorage.getItem('wl.me.v1')); me.plan = null; me.planTried = null; localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.reload();
    await page.goto(base + '#coach');
    assert.ok((await page.textContent('#co-cloud')).includes('next cloud run'));
    assert.ok(!(await page.$eval('#co-new', (b) => b.disabled)), 'New scenario works without a PC');
    assert.ok(!(await page.$eval('#co-real-go', (b) => b.disabled)), 'Get advice works without a PC');
    const asks = await page.evaluate(() => window.__pc.asks);
    await page.click('#co-new');
    await page.waitForSelector('#co-queued');
    const txt = await page.textContent('#co-queued');
    assert.ok(txt.includes(QUEUED_CLOUD) && !txt.includes('PC isn’t answering'), txt);
    assert.ok(!(await page.$('#co-offline')) && !(await page.$('.no')), 'no error shown');
    assert.strictEqual(await page.evaluate(() => window.__pc.asks), asks, 'the PC is not asked');
    assert.strictEqual((await reqs('coach-scenario')).length, 1);
    await page.goto(base + '#home');
    const card = await page.textContent('.home-card[data-module="link"]');
    assert.ok(card.includes('answers from the cloud run') && !card.includes('PC link'), card);
    await page.click('[data-advice]');
    await page.waitForSelector('#lk-queued');
    assert.ok((await page.textContent('#lk-queued')).includes(QUEUED_CLOUD));
    await page.click('#me-plan');
    await page.waitForSelector('#me-plan-queued');
    assert.ok((await page.textContent('#me-plan-queued')).includes(QUEUED_CLOUD));
    assert.strictEqual((await reqs('advice')).length, 1); assert.strictEqual((await reqs('weekly-plan')).length, 1);
    const q = await page.evaluate(() => { const i = { task: 'Say: water', expected: 'tubig', answer: 'tubeg' }; return WL.pc.ask('tagalog-check', i, null, i).then(() => 'answered', (e) => e.queued ? 'queued' : e.message); });
    assert.strictEqual(q, 'queued');
    assert.strictEqual((await reqs('tagalog-check')).length, 1);
    await page.goto(base + '#me');
    assert.ok(await page.$('#me-plan-queued'));
    // the cloud answers them all; they show the same way as with a PC
    const ids = {}; for (const k of ['coach-scenario', 'advice', 'weekly-plan', 'tagalog-check']) ids[k] = (await reqs(k))[0].id;
    await cloudAnswers({
      [ids['coach-scenario']]: { task: 'coach-scenario', error: 'Cloud says: try another skill.' },
      [ids.advice]: { task: 'advice', answer: { headline: 'Cloud advice', points: ['a', 'b', 'c'], next: 'n' } },
      [ids['weekly-plan']]: { task: 'weekly-plan', answer: { headline: 'Cloud plan', parts: { home: { focus: 'f', why: 'w' } }, check: 'c' } },
      [ids['tagalog-check']]: { task: 'tagalog-check', answer: { ok: false, corrected: 'tubig', meaning: 'water', explain: 'i, not e', tip: '' } }
    });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wl.me.v1')).plan);
    assert.strictEqual(await page.evaluate(() => WL.pc.queued().length), 0);
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="link"]')).includes('Cloud advice'));
    // Unpaired with Drive sync on: #link still shows "Advice from Claude" so custom questions queue for the cloud
    // Even if generic advice is already queued on Home, a custom question on #link is queued instead of silently dropped
    await page.click('[data-advice]');
    await page.waitForSelector('#lk-queued');
    assert.strictEqual((await reqs('advice')).length, 1);
    await page.click('.home-card[data-module="link"] a[href="#link"]');
    await page.waitForSelector('#lk-advice-card #lk-q');
    await page.fill('#lk-q', 'How should I pace workouts after two rough nights?');
    await page.click('#lk-advice');
    await page.waitForSelector('#lk-queued');
    await page.click('#lk-advice'); // same custom question twice still dedups
    await page.waitForTimeout(50);
    const customReqs = await reqs('advice');
    assert.strictEqual(customReqs.length, 2, 'generic + custom advice both queued (and duplicate custom deduped)');
    assert.strictEqual(customReqs[1].input.question, 'How should I pace workouts after two rough nights?');
    await cloudAnswers({
      [customReqs[0].id]: { task: 'advice', answer: { headline: 'General note', points: ['Steady'], next: 'Sleep' } },
      [customReqs[1].id]: { task: 'advice', answer: { headline: 'Keep workouts light', points: ['Two sets is enough'], next: 'Rest today' } }
    });
    await page.waitForFunction(() => /Keep workouts light/.test(document.getElementById('lk-adv').textContent));
    assert.ok(!(await page.$('#lk-queued')));
    await page.goto(base + '#home');
  });
  await t.step('an old answer the phone is not waiting for is dropped, not shown again', async () => {
    await cloudAnswers({ 'r-old-1': { task: 'advice', answer: { headline: 'Stale advice', points: ['x'], next: 'y' }, at: '2026-11-01T10:00:00Z' } });
    await page.waitForTimeout(100);
    assert.ok(!(await page.textContent('.home-card[data-module="link"]')).includes('Stale advice'));
    assert.strictEqual(await page.evaluate(() => Object.keys(WL.driveSync.answers()).length), 0);
  });
  await t.step('an expired queued request (>7 days old) is also removed from Drive sync so it never stays stuck pending', async () => {
    await page.evaluate(() => {
      const r = WL.pc.queue('advice', { question: 'Old unanswered question' });
      const p = WL.pc.settings();
      p.cloud[r.id].at = '2026-11-01T10:00:00.000Z';
      WL.pc.save();
    });
    assert.strictEqual(await page.evaluate(() => WL.driveSync.status().pendingRequests), 1);
    await page.evaluate(() => WL.pc.deliver());
    assert.strictEqual(await page.evaluate(() => WL.pc.queued().length), 0, 'expired request pruned from pc.cloud');
    assert.strictEqual(await page.evaluate(() => WL.driveSync.status().pendingRequests), 0, 'expired request also removed from driveSync');
    await page.evaluate(() => WL.driveSync.sync());
    assert.strictEqual((await reqs('advice')).length, 0, 'expired request no longer written to wellness-sync.json');
  });
  await t.step('Cancel drops a waiting request (parenting, Home advice, weekly plan, Tagalog) and a late answer is not shown', async () => {
    await page.goto(base + '#coach');
    await page.click('#co-new');
    await page.waitForSelector('#co-queued [data-cloud-cancel]');
    const id = (await reqs('coach-scenario'))[0].id;
    assert.strictEqual(await page.getAttribute('#co-queued [data-cloud-cancel]', 'aria-label'), 'Cancel A new scenario');
    await page.click('#co-queued [data-cloud-cancel]');
    await page.waitForFunction(() => !document.querySelector('#co-queued'));
    assert.ok(!(await page.$eval('#co-new', (b) => b.disabled)), 'can ask again');
    await page.waitForTimeout(50);
    assert.strictEqual((await reqs('coach-scenario')).length, 0, 'out of the sync file');
    assert.strictEqual(await page.evaluate(() => WL.pc.queued().length), 0);
    // the cloud run had already answered it: taken and acked, not shown
    await cloudAnswers({ [id]: { task: 'coach-scenario', answer: { title: 'Too late', skill: 'Safety', scenario: 'A late one.', question: 'What do you do?' } } });
    await page.waitForTimeout(100);
    assert.strictEqual((await coach()).current, null);
    assert.ok(!(await page.textContent('#view')).includes('Too late'));
    assert.strictEqual(await page.evaluate(() => Object.keys(WL.driveSync.answers()).length), 0);
    assert.ok((await file()).acked.includes(id), 'acked so the sheet row is pruned');

    await page.evaluate(() => { const m = WLMe.state(); m.plan = null; m.planTried = null; });
    await page.goto(base + '#home');
    await page.click('[data-advice]');
    await page.waitForSelector('#lk-queued [data-cloud-cancel]');
    await page.click('#me-plan');
    await page.waitForSelector('#me-plan-queued [data-cloud-cancel]');
    assert.strictEqual((await reqs('advice')).length, 1); assert.strictEqual((await reqs('weekly-plan')).length, 1);
    await page.click('#lk-queued [data-cloud-cancel]');
    await page.waitForFunction(() => !document.querySelector('#lk-queued'));
    assert.ok(await page.$('#me-plan-queued'), 'only the advice was cancelled');
    await page.click('#me-plan-queued [data-cloud-cancel]');
    await page.waitForFunction(() => !document.querySelector('#me-plan-queued'));
    assert.ok(!(await page.$('#me-plan-failed')), 'a cancelled plan is not "couldn’t make your plan"');
    await page.waitForTimeout(50);
    assert.strictEqual((await reqs('advice')).length + (await reqs('weekly-plan')).length, 0);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1')).planCancelled), '2026-11-21', 'not asked again by itself today');

    await page.evaluate(() => { for (const a of ['tubeg', 'tubik']) { const i = { task: 'Say: water', expected: 'tubig', answer: a }; WL.pc.queue('tagalog-check', i, i); } });
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('#tl-checks')).includes('2 answers waiting'));
    assert.strictEqual(await page.getAttribute('#tl-checks [data-cloud-cancel]', 'aria-label'), 'Cancel the waiting checks');
    await page.click('#tl-checks [data-cloud-cancel]');
    await page.waitForFunction(() => !document.querySelector('#tl-checks [data-cloud-cancel]'));
    assert.ok(!/waiting/.test(await page.textContent('#view')), 'no waiting line left');
    await page.waitForTimeout(50);
    assert.strictEqual((await reqs('tagalog-check')).length, 0);
    assert.strictEqual(await page.evaluate(() => WL.pc.queued().length), 0);
  });
  await t.step('no PC and no Drive sync: buttons are off and the note says both ways to get answers', async () => {
    await page.evaluate(() => localStorage.setItem('test.drive.off', '1'));
    await page.reload();
    await page.goto(base + '#coach');
    const txt = await page.textContent('#view');
    assert.ok(txt.includes('Pair the PC link') && txt.includes('Sync with Google Drive'), txt);
    assert.ok(await page.$eval('#co-new', (b) => b.disabled));
    await page.goto(base + '#home');
    assert.ok(!(await page.$('.home-card[data-module="link"]')), 'no advice card without a way to answer');
    await page.goto(base + '#link');
    assert.strictEqual(await page.$('#lk-advice-card'), null, 'no advice card on #link without PC or Drive sync');
    const e = await page.evaluate(() => WL.pc.ask('advice', {}).then(() => '', (x) => (x.queued ? 'queued: ' : '') + x.message));
    assert.ok(/Pair the PC link first/.test(e) && !/queued/.test(e), e);
    await page.evaluate(() => { localStorage.removeItem('test.pc.unpaired'); localStorage.removeItem('test.drive.off'); });
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
  await t.step('no errors, nothing overflows', async () => { await t.noOverflow(['#home', '#coach', '#tagalog', '#me', '#link']); assert.deepStrictEqual(t.errors, []); });
  await t.close('cloud answers browser');
})().catch((e) => { console.error(e); process.exit(1); });
