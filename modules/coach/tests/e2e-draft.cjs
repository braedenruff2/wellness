/* Parenting: a real situation he started writing but never sent (task 325): #coach says it's saved and not sent,
   Home's Parenting card says so with "Finish and send" (to #coach/real: the box, Get advice focused); nothing once it
   is sent, or while its answer is on the way. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

const DRAFT = 'She cries every time I put her down in the crib unless she is already deeply asleep.';

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 22, 9, 0) });
  const { page, base } = t;
  await t.step('a short or empty draft: nothing said', async () => {
    await page.goto(base + '#home');
    await page.evaluate(() => localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {}, realDraft: 'short', autoTried: '2026-11-22' })));
    await page.reload();
    assert.strictEqual(await page.locator('#co-draft-line').count(), 0);
    await page.goto(base + '#coach');
    assert.strictEqual(await page.locator('#co-real-saved').count(), 0);
  });
  await t.step('a real draft: Home says it is saved, not sent; Finish and send opens it with Get advice focused', async () => {
    await page.evaluate((d) => { const s = JSON.parse(localStorage.getItem('wl.coach.v1')); s.realDraft = d; localStorage.setItem('wl.coach.v1', JSON.stringify(s)); }, DRAFT);
    await page.goto(base + '#home'); await page.reload();
    const line = page.locator('.home-card[data-module="coach"] #co-draft-line');
    assert.strictEqual(await line.count(), 1, 'line on the card');
    assert.ok(!(await line.textContent()).includes('crib'), 'the draft itself is not shown on Home');
    await page.click('#co-draft-line a');
    await page.waitForSelector('#co-real');
    assert.strictEqual(await page.inputValue('#co-real'), DRAFT);
    assert.ok(/not sent yet/.test(await page.textContent('#co-real-saved')));
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-real', 'Get advice disabled without the PC or Drive sync: the box is focused instead');
  });
  await t.step('with the PC paired: Get advice is focused; once sent and answered, the line is gone', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a) => {
          let out = '{}';
          if (op === 'post' && a === '/v1/ask') out = JSON.stringify({ job: 'job-a' });
          else if (op === 'get') out = JSON.stringify({ state: 'done', answer: { summary: 'Advice', steps: ['a'], say: ['b'], why: 'c' } });
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((d) => localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {}, realDraft: d, autoTried: '2026-11-22' })), DRAFT);
    await p2.goto(base + '#coach/real'); await p2.reload();
    await p2.waitForSelector('#co-real-go');
    assert.strictEqual(await p2.evaluate(() => document.activeElement && document.activeElement.id), 'co-real-go');
    await p2.click('#co-real-go');
    await p2.clock.runFor(20000);
    const s = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));
    assert.ok(s.history.some((h) => h.kind === 'real') && s.realDraft === '', 'advice saved, draft cleared');
    assert.ok(/^#coach\/h\//.test(await p2.evaluate(() => location.hash)), 'taken to the answer (not left on a spinner)');
    assert.ok(!(await p2.textContent('#view')).includes('checking current guidance'), 'no spinner left');
    await p2.goto(base + '#home');
    assert.strictEqual(await p2.locator('#co-draft-line').count(), 0, 'sent: no line');
    await p2.close();
  });
  await t.step('narrow + no errors', async () => {
    await t.noOverflow(['#home', '#coach', '#coach/real']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('coach draft browser');
})().catch((e) => { console.error(e); process.exit(1); });
