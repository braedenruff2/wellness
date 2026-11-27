/* Parenting automatic daily scenario (task 315): it never starts while he is typing a real situation (so a running
   scenario can't wipe the advice request he sends next), and a paired PC that never answers is tried 3 times a day
   at most (1 h, then 3 h apart) instead of every 15 minutes. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

const CHILD = { child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {} };

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 21, 10, 0) });
  const { page, base } = t;

  await t.step('typing a real situation: no auto scenario starts, the advice request keeps its saved job', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__posts = []; window.__start = {};
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a, b) => {
          let out = '{}';
          if (op === 'post' && a === '/v1/ask') { const body = JSON.parse(b); window.__posts.push(body.task); out = JSON.stringify({ job: 'job-' + body.task }); window.__start[body.task] = Date.now(); }
          else if (op === 'get' && a.indexOf('/v1/job') === 0) {
            const task = a.indexOf('coach-scenario') >= 0 ? 'coach-scenario' : 'coach-advice';
            if (Date.now() - window.__start[task] < 60000) out = JSON.stringify({ state: 'running' });
            else out = JSON.stringify({ state: 'done', answer: task === 'coach-scenario' ? { title: 'Auto', skill: 'Connection', scenario: 'A quiet morning.', question: 'What do you do?' } : { summary: 'Advice', steps: ['a'], say: ['b'], why: 'c' } });
          }
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((s) => localStorage.setItem('wl.coach.v1', JSON.stringify(s)), CHILD);
    await p2.goto(base + '#coach'); await p2.reload();
    await p2.waitForSelector('#co-real');
    await p2.click('#co-real');
    await p2.keyboard.type('She screams when I put her in the car seat every time');
    await p2.clock.runFor(12000);
    assert.deepStrictEqual(await p2.evaluate(() => window.__posts), [], 'nothing starts while he types');
    await p2.click('#co-real-go');
    await p2.clock.runFor(2000);
    const pend = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')).pending);
    assert.ok(pend && pend.task === 'coach-advice', 'the advice job is saved for resume');
    assert.ok((await p2.textContent('#view')).includes('checking current guidance'), 'advice spinner');
    await p2.clock.runFor(70000);
    const s = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));
    assert.strictEqual(s.pending, null, 'advice done: no job left');
    assert.ok(s.history.some((h) => h.kind === 'real'), 'advice saved');
    // once he has stopped typing, the day's scenario comes on the next check
    await p2.goto(base + '#home');
    await p2.clock.runFor(16 * 60000);
    await p2.clock.runFor(70000);
    assert.deepStrictEqual(await p2.evaluate(() => window.__posts), ['coach-advice', 'coach-scenario']);
    await p2.close();
  });

  await t.step('paired PC that never answers, Drive sync off: 3 tries in the day, not every 15 minutes', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__asks = [];
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a) => {
          if (op === 'post' && a === '/v1/ask') { window.__asks.push(Date.now()); setTimeout(() => window.FCPcDone(id, false, "Couldn't reach the PC (timed out)"), 8000); return; }
          Promise.resolve().then(() => window.FCPcDone(id, false, "Couldn't reach the PC"));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((s) => localStorage.setItem('wl.coach.v1', JSON.stringify(s)), CHILD);
    await p2.reload();
    await p2.clock.runFor(30000);
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 1, 'first try');
    assert.ok(!(await p2.textContent('.home-card[data-module="coach"]')).includes('Claude is on it'), 'card back to normal after the failed try');
    await p2.clock.runFor(10 * 60000);
    await p2.reload(); // reopening the app keeps the wait
    await p2.clock.runFor(40 * 60000);
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 0, 'no retry within the hour, even after reopening (the counter restarts on reload)');
    await p2.clock.runFor(30 * 60000); // the next 15-minute check after the hour
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 1, 'second try after an hour');
    await p2.clock.runFor(3.5 * 3600000);
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 2, 'third try 3 h later');
    await p2.clock.runFor(5 * 3600000);
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 2, 'then none for the rest of the day');
    assert.strictEqual(await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')).autoTried), '2026-11-22');
    // a manual "Generate today's scenario" still works after the automatic ones gave up
    const b = p2.locator('[data-co-daily]');
    assert.strictEqual(await b.count(), 1, 'Generate button offered');
    await b.click();
    await p2.clock.runFor(1000);
    assert.strictEqual(await p2.evaluate(() => window.__asks.length), 3, 'manual try goes out');
    await p2.close();
  });

  await t.step('restart with an advice request still running: no scenario until the advice has come, then the scenario', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__posts = []; window.__gets = 0; window.__t0 = Date.now();
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a, b) => {
          let out = '{}';
          if (op === 'post' && a === '/v1/ask') { const body = JSON.parse(b); window.__posts.push(body.task); out = JSON.stringify({ job: 'job-' + body.task }); }
          else if (op === 'get' && a.indexOf('/v1/job') === 0) {
            window.__gets++;
            if (a.indexOf('job-adv') >= 0) out = JSON.stringify(Date.now() - window.__t0 < 90000 ? { state: 'running' } : { state: 'done', answer: { summary: 'Advice', steps: ['a'], say: ['b'], why: 'c' } });
            else out = JSON.stringify({ state: 'done', answer: { title: 'Auto', skill: 'Connection', scenario: 'A quiet morning.', question: 'What do you do?' } });
          }
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((s) => { s = JSON.parse(JSON.stringify(s)); s.pending = { job: 'job-adv', task: 'coach-advice', at: Date.now() - 60000, answer: 'She cries every time I put her down in the crib.' }; s.realDraft = s.pending.answer; localStorage.setItem('wl.coach.v1', JSON.stringify(s)); }, CHILD);
    await p2.reload();
    await p2.clock.runFor(60000);
    assert.deepStrictEqual(await p2.evaluate(() => window.__posts), [], 'nothing new asked while the advice is on its way');
    assert.ok(await p2.evaluate(() => window.__gets) > 0, 'the advice job is being checked');
    await p2.clock.runFor(60000);
    const s = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));
    assert.ok(s.history.some((h) => h.kind === 'real') && s.pending === null && s.realDraft === '', 'advice arrived and saved');
    await p2.clock.runFor(16 * 60000);
    assert.deepStrictEqual(await p2.evaluate(() => window.__posts), ['coach-scenario'], 'then the day\'s scenario');
    await p2.close();
  });

  await t.step('one request at a time: Generate with text in the history search, then Get advice: only one goes out', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__posts = [];
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a, b) => {
          let out = '{}';
          if (op === 'post' && a === '/v1/ask') { window.__posts.push(JSON.parse(b).task); out = JSON.stringify({ job: 'job-x' }); }
          else if (op === 'get') out = JSON.stringify({ state: 'running' });
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((s) => {
      s = JSON.parse(JSON.stringify(s)); s.autoTried = '2026-11-22';
      for (let i = 0; i < 7; i++) s.history.push({ id: 'h' + i, at: new Date(2026, 10, 10 + i, 9).toISOString(), title: 'Moment ' + i, skill: 'Connection', scenario: 's', question: 'q', age: '12 months', answer: 'a', result: { score: 7, good: [], better: [], why: '' } });
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
    }, CHILD);
    await p2.goto(base + '#coach'); await p2.reload();
    await p2.fill('#co-hist-search', 'Moment');
    await p2.click('#co-new');
    await p2.clock.runFor(2000);
    if (await p2.locator('#co-real-go').count()) {
      await p2.fill('#co-real', 'She cries every time I put her down in the crib unless asleep.');
      await p2.click('#co-real-go');
      await p2.clock.runFor(2000);
    }
    assert.deepStrictEqual(await p2.evaluate(() => window.__posts), ['coach-scenario'], 'only the first request went out');
    await p2.close();
  });

  await t.step('PC not paired, Drive sync on: the day\'s scenario is queued once; cancelling it stops it for the day', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      const d = window.__drive = { content: '', writes: 0 };
      window.FCAndroid = {
        pcStatus: () => '{"paired":false}',
        pcRequest: (id) => Promise.resolve().then(() => window.FCPcDone(id, false, 'not paired')),
        syncStatus: () => JSON.stringify({ configured: true, name: 'wellness-sync.json', lastSync: 0, error: '', busy: false }),
        syncRead: (id) => Promise.resolve().then(() => window.FCSyncDone(id, true, d.content)),
        syncWrite: (id, text) => { d.writes++; Promise.resolve().then(() => { d.content = text; window.FCSyncDone(id, true, ''); }); }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((s) => localStorage.setItem('wl.coach.v1', JSON.stringify(s)), CHILD);
    await p2.reload();
    await p2.clock.runFor(15000);
    const queued = () => p2.evaluate(() => WL.pc.queued().filter((x) => x.task === 'coach-scenario').length);
    assert.strictEqual(await queued(), 1, 'queued for the cloud');
    assert.strictEqual(await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')).autoTried), '2026-11-22');
    await p2.clock.runFor(31 * 60000);
    assert.strictEqual(await queued(), 1, 'not queued again');
    await p2.goto(base + '#coach');
    await p2.waitForSelector('[data-cloud-cancel]');
    await p2.click('[data-cloud-cancel]');
    await p2.clock.runFor(1000);
    assert.strictEqual(await queued(), 0, 'cancelled');
    assert.strictEqual(await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')).autoCancelled), '2026-11-22');
    await p2.goto(base + '#home');
    await p2.clock.runFor(31 * 60000);
    assert.strictEqual(await queued(), 0, 'not queued again the same day after a cancel');
    await p2.clock.setSystemTime(new Date(2026, 10, 23, 9, 0));
    await p2.clock.runFor(16 * 60000);
    assert.strictEqual(await queued(), 1, 'the next day: queued again');
    await p2.close();
  });

  await t.step('no console errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('coach auto browser');
})().catch((e) => { console.error(e); process.exit(1); });
