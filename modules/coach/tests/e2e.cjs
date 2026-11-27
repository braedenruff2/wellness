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

  await t.step('flagging the newest 3 tips "Not for me?" still surfaces an unflagged 4th tip from this week', async () => {
    const saved = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      const snap = { coach: JSON.parse(JSON.stringify(s)), me: localStorage.getItem('wl.me.v1') };
      s.current = null;
      s.history = [
        { id: 't4', at: '2026-11-17T12:00:00Z', title: 'S4', skill: 'Feeding', scenario: 'S', question: 'Q', age: '11 months old', answer: 'A', result: { score: 8, verdict: 'V', good: [], improve: [], better: '', why: '', practice: 'Offer water in an open cup', text: '', sources: [] } },
        { id: 't3', at: '2026-11-18T12:00:00Z', title: 'S3', skill: 'Sleep', scenario: 'S', question: 'Q', age: '11 months old', answer: 'A', result: { score: 8, verdict: 'V', good: [], improve: [], better: '', why: '', practice: 'Hidden tip 3', text: '', sources: [] } },
        { id: 't2', at: '2026-11-19T12:00:00Z', title: 'S2', skill: 'Safety', scenario: 'S', question: 'Q', age: '11 months old', answer: 'A', result: { score: 8, verdict: 'V', good: [], improve: [], better: '', why: '', practice: 'Hidden tip 2', text: '', sources: [] } },
        { id: 't1', at: '2026-11-20T12:00:00Z', title: 'S1', skill: 'Routines', scenario: 'S', question: 'Q', age: '11 months old', answer: 'A', result: { score: 8, verdict: 'V', good: [], improve: [], better: '', why: '', practice: 'Hidden tip 1', text: '', sources: [] } }
      ];
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[],"checkins":{},"plan":null,"skipped":{}}');
      ['t1', 't2', 't3'].forEach((id) => me.feedback.push({ id: 'coach/notfit/tip:' + id, at: '2026-11-21T09:00:00Z', part: 'coach', about: 'tip:' + id, kind: 'notfit', a: { reasons: ['I know this already'] } }));
      localStorage.setItem('wl.me.v1', JSON.stringify(me));
      return snap;
    });
    await page.reload();
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-tips');
    const txt = await page.textContent('#co-tips');
    assert.ok(txt.includes('Offer water in an open cup') && !txt.includes('Hidden tip 1'), txt);
    await page.goto(base + '#home');
    await page.waitForSelector('#co-tip');
    assert.ok((await page.textContent('#co-tip')).includes('Offer water in an open cup'));
    await page.evaluate((snap) => {
      localStorage.setItem('wl.coach.v1', JSON.stringify(snap.coach));
      if (snap.me == null) localStorage.removeItem('wl.me.v1'); else localStorage.setItem('wl.me.v1', snap.me);
    }, saved);
    await page.reload();
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
    // Home Parenting card still shows the last scored scenario even when the newest history entry is a real-situation advice (h2)
    await page.goto(base + '#home');
    const cardTxt = await page.textContent('.home-card[data-module="coach"]');
    assert.ok(cardTxt.includes('Last: 8/10 in Feeding'), 'Home card keeps last scored scenario past real-situation advice: ' + cardTxt);
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

  await t.step('Milestones open in a closable window, persist toggles & 3-week nudge, and Parenting shows in Home daily list', async () => {
    await page.waitForSelector('#co-teach-open');
    assert.strictEqual(await page.$('#co-teach-modal'), null, 'milestones window stays closed until tapped (no inline wall)');
    await page.click('#co-teach-open');
    await page.waitForSelector('#co-teach-modal #co-teach');
    const teachTxt = await page.textContent('#co-teach');
    assert.ok(teachTxt.includes('What to teach Mila now') && teachTxt.includes('Drink from an open cup'), teachTxt);
    // Toggle Practising -> launcher summary behind updates, persists across reload
    await page.click('#co-teach [data-teach-id="opencup"][data-teach-val="doing"]');
    assert.strictEqual(await page.getAttribute('#co-teach [data-teach-id="opencup"][data-teach-val="doing"]', 'aria-pressed'), 'true');
    // 397: focus stays on that same Practising button after the redraw (not <body>, not its Got it neighbour)
    assert.deepStrictEqual(await page.evaluate(() => [document.activeElement.dataset.teachId, document.activeElement.dataset.teachVal]), ['opencup', 'doing']);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => !!document.activeElement.closest('#co-teach-modal')), 'Tab left the milestones dialog');
    }
    assert.ok((await page.textContent('#co-teach-card')).includes('1 practising'), 'launcher card updates live');
    await page.click('#co-teach-next summary');
    assert.ok((await page.textContent('#co-teach-next')).includes('Transition off bottles to cups'), 'upcoming skills shown in Coming up next');
    // Escape closes the milestones window and restores focus to #co-teach-open
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.$('#co-teach-modal'), null, 'Escape closes milestones modal');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-teach-open', 'focus restored to Open button');
    // Android Back (FCBack) also closes it
    await page.click('#co-teach-open');
    await page.waitForSelector('#co-teach-modal');
    assert.strictEqual(await page.evaluate(() => window.FCBack && window.FCBack()), true, 'FCBack handles open milestones modal');
    assert.strictEqual(await page.$('#co-teach-modal'), null, 'FCBack closed milestones modal');
    await page.reload();
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-teach-open');
    await page.click('#co-teach-open');
    await page.waitForSelector('#co-teach');
    assert.strictEqual(await page.getAttribute('#co-teach [data-teach-id="opencup"][data-teach-val="doing"]', 'aria-pressed'), 'true', 'teach status persisted');
    await page.click('#co-teach-close');
    assert.strictEqual(await page.$('#co-teach-modal'), null, 'Close button closes modal');
    // 3+ weeks marked "doing" -> gentle "Still working on it / Done" nudge once inside modal
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.teach = Object.assign({}, s.teach, { opencup: 'doing', strawcup: 'doing' });
      s.teachAt = { opencup: '2026-10-28', strawcup: '2026-10-25' };
      delete s.teachNudged;
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await page.goto(base + '#home'); await page.goto(base + '#coach');
    await page.waitForSelector('#co-teach-open');
    assert.ok((await page.textContent('#co-teach-card')).includes('2 check-in'), 'launcher notes pending check-ins');
    await page.click('#co-teach-open');
    await page.waitForSelector('[data-teach-nudge="opencup"]');
    await page.waitForSelector('[data-teach-nudge="strawcup"]');
    // "Still working on it" dismisses nudge once while keeping item as doing across reload
    await page.click('[data-teach-keep="opencup"]');
    assert.strictEqual(await page.$('[data-teach-nudge="opencup"]'), null, 'nudge dismissed after Still working on it');
    assert.strictEqual(await page.getAttribute('#co-teach [data-teach-id="opencup"][data-teach-val="doing"]', 'aria-pressed'), 'true');
    // "Done" marks item done and clears nudge
    await page.click('[data-teach-done="strawcup"]');
    assert.strictEqual(await page.$('[data-teach-nudge="strawcup"]'), null, 'nudge gone after Done');
    assert.strictEqual(await page.getAttribute('#co-teach [data-teach-id="strawcup"][data-teach-val="done"]', 'aria-pressed'), 'true');
    await page.click('#co-teach-x');
    assert.strictEqual(await page.$('#co-teach-modal'), null, 'X button closes modal');
    await page.reload();
    await page.goto(base + '#coach');
    await page.click('#co-teach-open');
    await page.waitForSelector('#co-teach');
    assert.strictEqual(await page.$('[data-teach-nudge="opencup"]'), null, 'dismissed nudge stays gone after reload');
    assert.strictEqual(await page.getAttribute('#co-teach [data-teach-id="strawcup"][data-teach-val="done"]', 'aria-pressed'), 'true');
    await page.click('#co-teach-x');
    // Home Today list includes Parenting once birthday is set, and marks done after a graded scenario today
    await page.goto(base + '#home');
    await page.waitForSelector('#wl-today');
    assert.ok((await page.textContent('#wl-today')).includes('Parenting: answer today’s scenario'), await page.textContent('#wl-today'));
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.current = null;
      s.history.push({ id: 'today1', at: new Date(2026, 10, 21, 9, 30).toISOString(), title: 'Open cup spill', skill: 'Feeding', scenario: 'S', question: 'Q', age: '11 months old', answer: 'Stay calm and wipe together', result: { score: 9, verdict: 'Great', good: [], improve: [], better: '', why: '', practice: '', text: '', sources: [] } });
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-done-today');
    await page.goto(base + '#home');
    await page.waitForSelector('#wl-today');
    assert.ok((await page.textContent('#wl-today')).includes('Parenting: scenario done'), await page.textContent('#wl-today'));
    assert.ok((await page.textContent('.home-card[data-module="coach"]')).includes('Scenario done today'));
  });

  await t.step('suggested Parenting scenario auto-generates once per day when Claude is available', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__coAutoAsks = [];
      window.FCAndroid = {
        pcStatus: () => '{"paired":true,"host":"192.168.1.20","name":"PC"}',
        pcRequest: (id, op, a, b) => {
          let out = '{}';
          if (op === 'post' && a === '/v1/ask') {
            const body = JSON.parse(b);
            if (body.task === 'coach-scenario') window.__coAutoAsks.push(body.input);
            out = '{"job":"co-auto-1"}';
          } else if (op === 'get' && a.indexOf('/v1/job') === 0) {
            out = JSON.stringify({ state: 'done', answer: { title: 'Auto daily moment', skill: 'Connection', scenario: 'She hands you a block and smiles.', question: 'What do you do and say?' } });
          }
          Promise.resolve().then(() => window.FCPcDone(id, true, out));
        }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate(() => {
      localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {} }));
    });
    await p2.reload();
    await p2.clock.runFor(13000);
    await p2.waitForFunction(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1') || '{}');
      return s.current && s.current.title === 'Auto daily moment';
    });
    const asks = await p2.evaluate(() => window.__coAutoAsks);
    assert.strictEqual(asks.length, 1, 'auto-generated once');
    assert.strictEqual(asks[0].skill, 'Connection', 'uses suggested skill');
    assert.ok((await p2.textContent('.home-card[data-module="coach"]')).includes('Auto daily moment'), 'Home card refreshed with auto scenario');
    // Clearing current same day does NOT auto-generate again (autoTried is today)
    await p2.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      s.current = null;
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await p2.clock.runFor(16 * 60000);
    assert.strictEqual(await p2.evaluate(() => window.__coAutoAsks.length), 1, 'does not auto-generate twice same day');
    // Next day: auto-generates fresh suggested scenario
    await p2.clock.setSystemTime(new Date(2026, 10, 23, 9, 0));
    await p2.clock.runFor(16 * 60000);
    await p2.waitForFunction(() => window.__coAutoAsks.length === 2);
    await p2.close();
  });

  await t.step('autoScenario queues via Drive sync when unpaired, Cancel sets autoCancelled, and never interrupts #co-real typing', async () => {
    const p2 = await page.context().newPage();
    await p2.clock.install({ time: new Date(2026, 10, 22, 9, 0) });
    await p2.addInitScript(() => {
      window.__driveWrites = 0;
      window.FCAndroid = {
        pcStatus: () => '{"paired":false}',
        syncStatus: () => JSON.stringify({ configured: true, name: 'wellness-sync.json', lastSync: Date.now(), error: '', busy: false, answersConfigured: true, answersName: 'wellness-answers', answersError: '' }),
        syncRead: (id) => Promise.resolve().then(() => window.FCSyncDone(id, true, '')),
        syncReadAnswers: (id) => Promise.resolve().then(() => window.FCSyncDone(id, true, '')),
        syncWrite: (id) => { window.__driveWrites++; Promise.resolve().then(() => window.FCSyncDone(id, true, '')); }
      };
    });
    await p2.goto(base + '#home');
    await p2.evaluate(() => {
      localStorage.setItem('wl.coach.v1', JSON.stringify({ child: { name: 'Mila', birth: '2025-11-24' }, history: [], current: null, pending: null, teach: {} }));
    });
    // While actively typing in #co-real on #coach, autoScenario does not interrupt or queue
    await p2.goto(base + '#coach');
    await p2.reload();
    await p2.waitForSelector('#co-real');
    await p2.click('#co-real');
    await p2.keyboard.type('She pushes her cup off the tray at lunch');
    await p2.clock.runFor(13000);
    assert.strictEqual(await p2.evaluate(() => WL.driveSync.requests().filter((r) => r.task === 'coach-scenario').length), 0, 'no cloud auto-queue while typing in #co-real');
    assert.strictEqual(await p2.inputValue('#co-real'), 'She pushes her cup off the tray at lunch', 'draft text undisturbed');
    // Leaving #coach to #home lets autoScenario queue through Drive sync when unpaired
    await p2.goto(base + '#home');
    await p2.clock.runFor(16 * 60000);
    await p2.waitForFunction(() => WL.driveSync.requests().some((r) => r.task === 'coach-scenario'));
    assert.ok((await p2.textContent('#wl-today')).includes('Parenting: scenario on the way'), 'Home today list reflects queued scenario');
    // Cancel queued auto-scenario on #coach -> sets autoCancelled and prevents same-day re-queue
    await p2.goto(base + '#coach');
    await p2.waitForSelector('#co-queued [data-cloud-cancel]');
    await p2.click('#co-queued [data-cloud-cancel]');
    await p2.waitForFunction(() => !document.getElementById('co-queued'));
    const afterCancel = await p2.evaluate(() => JSON.parse(localStorage.getItem('wl.coach.v1')));
    assert.strictEqual(afterCancel.autoCancelled, '2026-11-22', 'Cancel records autoCancelled for today');
    assert.strictEqual(await p2.evaluate(() => WL.driveSync.requests().filter((r) => r.task === 'coach-scenario').length), 0, 'queued scenario request removed');
    // Even if autoTried were absent, autoCancelled prevents re-queuing on the same day
    await p2.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.coach.v1'));
      delete s.autoTried;
      localStorage.setItem('wl.coach.v1', JSON.stringify(s));
      WL.modules.coach.reload();
    });
    await p2.goto(base + '#home');
    await p2.clock.runFor(16 * 60000);
    assert.strictEqual(await p2.evaluate(() => WL.driveSync.requests().filter((r) => r.task === 'coach-scenario').length), 0, 'autoCancelled blocks same-day re-queue');
    // Next day, autoScenario queues normally again
    await p2.clock.setSystemTime(new Date(2026, 10, 23, 9, 0));
    await p2.clock.runFor(16 * 60000);
    await p2.waitForFunction(() => WL.driveSync.requests().some((r) => r.task === 'coach-scenario'));
    await p2.close();
  });

  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#coach', '#coach/setup', '#coach/h/h1', '#coach/h/h2']);
    assert.deepStrictEqual(t.errors, []);
  });

  await t.close('coach browser');
})().catch((e) => { console.error(e); process.exit(1); });
