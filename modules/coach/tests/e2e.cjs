/* Parenting coach browser tests: setup validation, milestones & cancel, unpaired active-scenario protection,
   past practice detail + XSS escaping, and missing history id handling. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');

(async () => {
  const t = await W.open({ time: new Date(2026, 10, 21, 10, 0) });
  const { page, base } = t;

  await t.step('setup validates birthday (empty and future rejected), then saves milestones and note', async () => {
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-save');
    assert.strictEqual(await page.locator('#view a[href="#coach"]').count(), 0, 'no Cancel before first setup');
    await page.click('#co-save');
    assert.ok((await page.textContent('#toast')).includes('Pick her birthday'));
    await page.fill('#co-birth', '2027-01-01');
    await page.click('#co-save');
    assert.ok((await page.textContent('#toast')).includes('Pick her birthday'), 'future birthday refused');
    await page.fill('#co-name', 'Mila');
    await page.fill('#co-birth', '2025-11-24');
    await page.click('[data-can="Walks"]');
    await page.click('[data-can="Points"]');
    await page.fill('#co-can-note', 'loves books');
    await page.click('#co-save');
    await page.waitForSelector('#co-new');
    const txt = await page.textContent('#view');
    assert.ok(txt.includes('Mila is 11 months old') && txt.includes('walks; points. Also: loves books'), txt);
    assert.strictEqual(await page.locator('#co-can-nudge').count(), 0, 'milestone nudge hidden once set');
    await page.goto(base + '#coach/setup');
    await page.waitForSelector('#view a[href="#coach"]');
    await page.click('#view a[href="#coach"]');
    await page.waitForSelector('#co-new');
  });

  await t.step('with neither PC nor Drive sync: active scenario keeps Get feedback & Different scenario disabled so draft is not lost', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.current = {
        id: 'cur1', at: '2026-11-21T09:00:00Z', title: 'Bedtime protest', skill: 'Sleep',
        scenario: 'She stands up in the crib crying when you leave.', question: 'What do you do and say?',
        age: '11 months old', answer: 'Keep my voice calm and rub her back.'
      };
      s.history = [
        {
          id: 'h1', at: '2026-11-20T12:00:00Z', title: 'Dinner <script>window.__xss=1</script>', skill: 'Feeding',
          scenario: 'Throws spoon on the floor.', question: 'What next?', age: '11 months old',
          answer: '<b>Stay calm</b>',
          result: {
            score: 8, verdict: 'Steady', good: ['Calm voice'], improve: ['Offer a second spoon'],
            better: 'Pause and keep mealtime low-key.', why: 'Testing cause and effect.', practice: 'Name what happened.',
            text: '', sources: [{ title: 'CPS', url: 'https://caringforkids.cps.ca/' }]
          }
        },
        {
          id: 'h2', at: '2026-11-19T12:00:00Z', kind: 'real', title: 'Diaper wrestling', skill: 'Routines',
          scenario: 'Rolls over every diaper change.', question: '', age: '11 months old', answer: '', result: null,
          advice: {
            summary: 'Very common once mobile.', steps: ['Hand her a special toy'], say: ['Quick change, then play.'],
            avoid: ['Turning it into a battle'], why: 'Autonomy is growing.', watch: '', text: '', sources: []
          }
        }
      ];
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-answer');
    assert.ok(await page.$eval('#co-grade', (b) => b.disabled), 'Get feedback disabled when neither PC nor Drive sync');
    assert.ok(await page.$eval('#co-skip', (b) => b.disabled), 'Different scenario disabled so scenario cannot be wiped');
    assert.strictEqual(await page.inputValue('#co-answer'), 'Keep my voice calm and rub her back.');
  });

  await t.step('past practice views escape HTML cleanly and unknown id shows Not found', async () => {
    await page.goto(base + '#coach/h/h1');
    const txt = await page.textContent('#view');
    assert.ok(txt.includes('8/10') && txt.includes('Dinner <script>') && txt.includes('<b>Stay calm</b>'), txt);
    assert.strictEqual(await page.evaluate(() => !!window.__xss), false, 'HTML escaped, no script execution');
    await page.goto(base + '#coach/h/h2');
    const adv = await page.textContent('#view');
    assert.ok(adv.includes('Diaper wrestling') && adv.includes('Hand her a special toy'), adv);
    await page.goto(base + '#coach/h/no-such-id');
    assert.ok((await page.textContent('#view')).includes('Not found'));
  });

  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#coach', '#coach/setup', '#coach/h/h1', '#coach/h/h2']);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.close('coach browser');
})().catch((e) => { console.error(e); process.exit(1); });
