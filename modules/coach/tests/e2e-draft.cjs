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
    // Live sync while typing in #co-real: appears at 20+ chars and disappears when cleared below 20 chars without reload
    await page.fill('#co-real', DRAFT);
    assert.strictEqual(await page.locator('#co-real-saved').count(), 1, '#co-real-saved appears live at 20+ chars');
    assert.ok(/not sent yet/.test(await page.textContent('#co-real-saved')));
    await page.fill('#co-real', 'too short');
    assert.strictEqual(await page.locator('#co-real-saved').count(), 0, '#co-real-saved hides live below 20 chars');
    await page.fill('#co-real', '                         ');
    assert.strictEqual(await page.locator('#co-real-saved').count(), 0, 'whitespace-only draft stays hidden');
    await page.fill('#co-real', '');
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
  await t.step('a PC job that never finishes: after the time limit the spinner ends with a plain message, the question stays', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a) => {
          const out = op === 'post' ? JSON.stringify({ job: 'job-slow' }) : JSON.stringify({ state: 'running' });
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate((d) => localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {}, realDraft: d, autoTried: '2026-11-22' })), DRAFT);
    await p2.goto(base + '#coach'); await p2.reload();
    await p2.click('#co-real-go');
    await p2.clock.runFor(60000);
    assert.ok((await p2.textContent('#view')).includes('checking current guidance'), 'waiting');
    await p2.clock.runFor(10 * 60000);
    const txt = await p2.textContent('#view');
    assert.ok(!txt.includes('checking current guidance'), 'spinner ended');
    assert.ok(/taking too long/i.test(txt), 'says why: ' + txt.slice(0, 200));
    assert.strictEqual(await p2.inputValue('#co-real'), DRAFT, 'his question is still in the box');
    const s = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));
    assert.strictEqual(s.pending, null, 'no job left');
    assert.ok(await p2.locator('#co-draft-line, #co-real-saved').count() >= 1, 'saved, not sent yet');
    await p2.close();
  });
  await t.step('Home Parenting card at its fullest at 320 px / text 1.3: nothing cut off, buttons 44 px', async () => {
    await page.setViewportSize({ width: 320, height: 760 });
    await page.evaluate((d) => {
      localStorage.setItem('wl.shell.v1', JSON.stringify({ theme: 'dark', textSize: 1.3, since: '2026-10-01T12:00:00.000Z' }));
      const res = { score: 7, verdict: 'Good', good: ['Calm voice'], improve: ['Name the feeling'], better: 'Say it', why: 'Because', practice: 'Try: name what she feels before you act, every time this week.' };
      localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, current: null, pending: null, teach: {}, realDraft: d, autoTried: '2026-11-22',
        history: [{ id: 'h1', at: new Date(2026, 10, 21, 9).toISOString(), title: 'A long title for a moment at the window', skill: 'Connection', scenario: 's', question: 'q', age: '12 months', answer: 'a', result: res }] }));
    }, DRAFT);
    await page.goto(base + '#coach'); await page.goto(base + '#home'); await page.reload();
    await page.waitForSelector('.home-card[data-module="coach"] #co-draft-line');
    const card = '.home-card[data-module="coach"]';
    const small = await page.$$eval(card + ' a.btn, ' + card + ' button', (els) => els.filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
    assert.deepStrictEqual(small, []);
    const cut = await page.$$eval(card + ' *', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').map((e) => e.id || e.className));
    assert.deepStrictEqual(cut, []);
    await t.noOverflow(['#home']);
    await page.setViewportSize({ width: 360, height: 760 });
    await page.evaluate(() => localStorage.removeItem('wl.shell.v1'));
  });
  await t.step('advice he asked for: Home shows its first step for 3 days, with a link to it', async () => {
    await page.evaluate(() => {
      localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, current: null, pending: null, teach: {}, realDraft: '', autoTried: '2026-11-22',
        history: [{ id: 'r1', at: new Date(2026, 10, 21, 20).toISOString(), kind: 'real', title: 'Crib', skill: 'Sleep', scenario: 's', question: '', age: '12 months', answer: '', result: null,
          advice: { summary: 'x', steps: ['Keep the same short routine every night'], say: [], avoid: [], why: '', watch: '', text: '', sources: [] } }] }));
    });
    await page.goto(base + '#coach'); await page.goto(base + '#home'); await page.reload();
    const card = '.home-card[data-module="coach"]';
    assert.ok(/From your question: Keep the same short routine/.test(await page.textContent(card + ' #co-advice-step')));
    assert.strictEqual(await page.locator(card + ' #co-tip').count(), 0, 'no tip line beside it');
    await page.click(card + ' a[href="#coach/h/r1"]');
    await page.waitForFunction(() => location.hash === '#coach/h/r1');
    assert.strictEqual(await page.locator('.me-ask[data-about="real:r1"]').count(), 0, 'no "did it help" on the first day');
    await page.clock.setSystemTime(new Date(2026, 10, 24, 9, 0));
    await page.reload(); await page.waitForSelector('.me-ask[data-about="real:r1"]');
    await page.click('.me-ask[data-about="real:r1"] [data-me-a][data-v="Sort of"]');
    const fb = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1')).feedback.filter((f) => f.about === 'real:r1').map((f) => f.a.tried));
    assert.deepStrictEqual(fb, ['Sort of'], 'his answer saved');
    await page.goto(base + '#coach');
    assert.ok(/your situation · Sort of/.test(await page.textContent('#co-hist-list')), 'shown in Past practice');
    await page.clock.setSystemTime(new Date(2026, 10, 25, 9, 0));
    await page.goto(base + '#home'); await page.reload();
    assert.strictEqual(await page.locator(card + ' #co-advice-step').count(), 0, 'gone after 3 days');
  });
  for (const theme of ['light', 'dark', 'night']) {
    await t.step(theme + ': Home Parenting card with the advice step and the saved question: readable, 44 px buttons', async () => {
      await page.clock.setSystemTime(new Date(2026, 10, 22, 9, 0));
      await page.evaluate(([theme, d]) => {
        localStorage.setItem('wl.shell.v1', JSON.stringify({ theme, textSize: 1.3, since: '2026-10-01T12:00:00.000Z' }));
        localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, current: null, pending: null, teach: {}, realDraft: d, autoTried: '2026-11-22',
          history: [{ id: 'r1', at: new Date(2026, 10, 21, 20).toISOString(), kind: 'real', title: 'Crib', skill: 'Sleep', scenario: 's', question: '', age: '12 months', answer: '', result: null,
            advice: { summary: 'x', steps: ['Keep the same short routine every night'], say: [], avoid: [], why: '', watch: '', text: '', sources: [] } }] }));
      }, [theme, DRAFT]);
      await page.goto(base + '#coach'); await page.goto(base + '#home'); await page.reload();
      const card = '.home-card[data-module="coach"]';
      await page.waitForSelector(card + ' #co-advice-step');
      await page.waitForSelector(card + ' #co-draft-line');
      const small = await page.$$eval(card + ' a.btn, ' + card + ' button', (els) => els.filter((e) => e.offsetParent).map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h < 44));
      assert.deepStrictEqual(small, []);
      const low = await page.evaluate((sel) => {
        const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
        const lum = (c) => { c = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const bg = (e) => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgb(b); e = e.parentElement; } return [255, 255, 255]; };
        return Array.from(document.querySelectorAll(sel + ' p, ' + sel + ' b, ' + sel + ' a, ' + sel + ' span, ' + sel + ' h3')).filter((e) => e.offsetParent && e.textContent.trim()).map((e) => {
          const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e));
          return { t: e.textContent.trim().slice(0, 20), r: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) };
        });
      }, card);
      assert.deepStrictEqual(low.filter((x) => x.r < (theme === 'night' ? 3 : 4.5)), [], theme);
      await page.evaluate(() => localStorage.removeItem('wl.shell.v1'));
    });
  }
  await t.step('narrow + no errors', async () => {
    await t.noOverflow(['#home', '#coach', '#coach/real']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('coach draft browser');
})().catch((e) => { console.error(e); process.exit(1); });
