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

  await t.step('"What worked with her" updates live when rating tips and keeps older working tips', async () => {
    assert.strictEqual(await page.locator('#co-worked').count(), 0, 'hidden before any tip is marked It worked');
    // add an older scenario (> 7 days ago) already marked "It worked"
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.history.unshift({
        id: 'h0', at: '2026-11-01T12:00:00Z', title: 'Car seat song', skill: 'Crying and comfort',
        scenario: 'Cries getting buckled in.', question: 'What do you do?', age: '11 months old',
        answer: 'Sing before buckling.',
        result: { score: 8, verdict: 'Warm', good: [], improve: [], better: '', why: '', practice: 'Sing the same car-seat song', text: '', sources: [] }
      });
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{},"plan":null,"skipped":{}}');
      me.feedback.push({ id: 'coach/after/tip:h0', at: '2026-11-02T12:00:00Z', part: 'coach', about: 'tip:h0', kind: 'after', a: { tried: 'It worked' } });
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
    });
    await page.reload();
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-worked');
    let worked = await page.textContent('#co-worked');
    assert.ok(worked.includes('What worked with Mila') && worked.includes('Sing the same car-seat song'), worked);
    assert.ok(!worked.includes('Name what happened.'), 'unrated tip not shown yet');
    // tap "It worked" on this week's tip: #co-worked updates live
    await page.click('#co-tips [data-me-a][data-v="It worked"]');
    await page.waitForFunction(() => {
      const el = document.querySelector('#co-worked');
      return el && el.textContent.includes('Name what happened.');
    });
    worked = await page.textContent('#co-worked');
    assert.ok(worked.includes('Name what happened.') && worked.includes('Feeding'), worked);
    // tapping again clears it and drops it from #co-worked live
    await page.click('#co-tips [data-me-a][data-v="It worked"]');
    await page.waitForFunction(() => {
      const el = document.querySelector('#co-worked');
      return el && !el.textContent.includes('Name what happened.');
    });
    assert.ok((await page.textContent('#co-worked')).includes('Sing the same car-seat song'), 'older working tip stays');
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

  await t.step('Past practice search finds items by title or skill (even past 20) and Show all reveals the rest', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      // put an older item first (will be beyond index 20 when reversed), keeping h1/h2 and adding 21 newer items
      s.history.unshift({ id: 'old-sleep', at: '2026-10-01T12:00:00Z', title: 'Midnight crib wake', skill: 'Sleep', scenario: 'S', question: 'Q', age: '10 months old', answer: 'A', result: { score: 7, verdict: 'V', good: [], improve: [], better: '', why: '', practice: '', text: '', sources: [] } });
      for (let i = 1; i <= 21; i++) {
        s.history.push({ id: 'p' + i, at: new Date(2026, 10, 1 + (i % 20), 12, i).toISOString(), title: 'Moment ' + i, skill: i === 5 ? 'Safety' : 'Play and learning', scenario: 'S', question: 'Q', age: '11 months old', answer: 'A', result: { score: 8, verdict: 'V', good: [], improve: [], better: '', why: '', practice: '', text: '', sources: [] } });
      }
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-hist-search');
    const total = await page.locator('#co-hist-list > li').count();
    assert.ok(total > 22, '20+ history items seeded: ' + total);
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 20, 'shows newest 20 first');
    await page.fill('#co-hist-search', 'crib');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 1, 'finds older item past 20');
    assert.ok(/1 found/.test(await page.textContent('#co-hist-found')));
    await page.fill('#co-hist-search', 'safety');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 1, 'matches by skill');
    await page.fill('#co-hist-search', '');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), 20);
    await page.click('#co-hist-more');
    assert.strictEqual(await page.locator('#co-hist-list > li:not([hidden])').count(), total, 'Show all reveals all items');
  });

  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#coach', '#coach/setup', '#coach/h/h1', '#coach/h/h2']);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.close('coach browser');
})().catch((e) => { console.error(e); process.exit(1); });
