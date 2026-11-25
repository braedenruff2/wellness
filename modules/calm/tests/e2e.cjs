/* Calm in the browser: pacer animates and finishes, guided voice plays and pauses, ratings saved, early end counts. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 18, 14, 0) });
  const { page, base } = t;
  await page.goto(base + '#calm');
  await t.step('list with a suggestion, every practice and the faith link', async () => {
    assert.strictEqual(await page.locator('.list li').count(), await page.evaluate(() => window.CalmCore.PRACTICES.length));
    assert.strictEqual(await page.$('#c-recent'), null, 'no recent sessions card before first session');
    assert.ok(await page.isVisible('a[href="#faith/pray"]'));
  });
  await t.step('one-minute reset: inner exhale circle visible, rate, breathe, finish, shows partial progress toward 10 min goal', async () => {
    await page.goto(base + '#calm/s/sigh');
    const ringMin = await page.$eval('.ring-min', (e) => {
      const r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
      return { w: Math.round(r.width), ratio: +(r.width / p.width).toFixed(2) };
    });
    assert.ok(ringMin.w > 20 && ringMin.ratio >= 0.33 && ringMin.ratio <= 0.37, 'visible 35% inner exhale target ring: ' + JSON.stringify(ringMin));
    await page.click('#c-before [data-r="4"]');
    await page.click('#c-pp');
    await page.clock.runFor(2000);
    assert.ok(/Breathe in|Hold|Breathe out|In/.test(await page.textContent('#c-label')));
    const tf = await page.getAttribute('#c-ball', 'style');
    assert.ok(/scale\(/.test(tf), tf);
    // the rest in one jump (the end is worked out from the clock; running every animation frame took over a minute)
    await page.clock.fastForward(60000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'));
    assert.ok(!(await page.isVisible('#c-pp')), 'no Pause button once it has ended');
    assert.ok(/1 of 10 min/.test(await page.textContent('#c-label')), '1-min reset reports partial progress toward 10 min goal');
    await page.click('#c-after-r [data-r="2"]');
    await page.click('#c-save');
    await page.waitForSelector('.list');
    assert.ok(/1 of 10 min/.test(await page.textContent('#c-today')), '#c-today shows partial progress after 1-min reset');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions[0]);
    assert.strictEqual(st.before, 4); assert.strictEqual(st.after, 2); assert.ok(st.mins >= 1 && st.mins < 1.2, st.mins);
  });
  await t.step('pause stops the clock', async () => {
    await page.goto(base + '#calm/s/box');
    await page.click('#c-pp'); await page.clock.runFor(10000);
    // Space pauses and resumes when focus is not on a button/input
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Space');
    assert.strictEqual(await page.getAttribute('#c-pp', 'data-state'), 'paused', 'Space pauses Calm session');
    const left = await page.textContent('#c-left');
    await page.clock.runFor(10 * 60000);
    assert.strictEqual(await page.textContent('#c-left'), left);
    assert.ok(!(await page.isVisible('#c-after')));
    await page.keyboard.press('Space');
    assert.strictEqual(await page.getAttribute('#c-pp', 'data-state'), 'playing', 'Space resumes Calm session');
    await page.clock.runFor(5000);
    assert.ok(!(await page.isVisible('#c-after')), 'resumed, not over yet');
    await page.clock.fastForward(6 * 60000); await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'));
    // tapping an after-stress rating saves immediately even if he leaves with Back instead of tapping Done
    await page.click('#c-after-r [data-r="1"]');
    await page.goBack();
    await page.waitForSelector('.list');
    const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions[1]);
    assert.strictEqual(st2.after, 1, 'after-stress rating persisted without tapping Done');
    assert.ok(st2.rated, 'rated timestamp saved');
  });
  await t.step('guided body scan speaks its lines; ending early after 30 s still counts', async () => {
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(60000);
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    assert.ok(spoken[0].startsWith('Get comfortable'), spoken.join('|'));
    await page.click('#c-end');
    await page.waitForSelector('.list');
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length);
    assert.strictEqual(n, 3, 'a finished session is saved even without tapping Done; the early-ended body scan too');
  });
  await t.step('his report: once daily goal is met, Calm says Done for today; daily goal can be changed to 20 min', async () => {
    await page.goto(base + '#calm');
    // 1 min sigh + 5 min box + 1 min body = 7 min -> still 7 of 10 min until goal is reached (or goal set to 5)
    assert.ok(/7 of 10 min/.test(await page.textContent('#c-today')), await page.textContent('#c-today'));
    await page.click('#c-goal [data-goal="5"]');
    const top = await page.textContent('#c-today');
    assert.ok(/Done for today/.test(top), top);
    assert.ok(/One-minute reset/.test(top), top);
    // collapsible Recent sessions lists newest first with minutes and stress ratings
    await page.click('#c-recent summary');
    const rec = await page.locator('#c-recent li').allTextContents();
    assert.strictEqual(rec.length, 3);
    assert.ok(/Body scan/.test(rec[0]), rec[0]);
    assert.ok(/Box breathing/.test(rec[1]) && /stress now 1/.test(rec[1]), rec[1]);
    assert.ok(/One-minute reset/.test(rec[2]) && /stress 4→2/.test(rec[2]), rec[2]);
    // per-practice average stress change (sessions with both ratings only, best first)
    const avg0 = await page.textContent('#c-recent-avg');
    assert.ok(avg0.includes('One-minute reset: −2.0 over 1') && !avg0.includes('Box breathing'), avg0);
    // seed two rated Body scan sessions (avg −0.5 over 2) and verify ordering (One-minute reset −2.0 before Body scan −0.5)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      s.sessions.push(
        { id: 'body', date: '2026-11-17', at: '2026-11-17T12:00:00.000Z', mins: 8, before: 3, after: 2 },
        { id: 'body', date: '2026-11-17', at: '2026-11-17T18:00:00.000Z', mins: 8, before: 3, after: 3 }
      );
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
      WL.modules.calm.reload();
    });
    await page.goto(base + '#home'); await page.goto(base + '#calm');
    await page.click('#c-recent summary');
    const avg1 = await page.textContent('#c-recent-avg');
    assert.ok(avg1.includes('One-minute reset: −2.0 over 1') && avg1.includes('Body scan: −0.5 over 2'), avg1);
    assert.ok(avg1.indexOf('One-minute reset') < avg1.indexOf('Body scan'), 'best stress drop listed first: ' + avg1);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      s.sessions = s.sessions.filter((x) => x.date !== '2026-11-17');
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
      WL.modules.calm.reload();
    });
    // an earlier-day session pushed later in storage still sorts chronologically below today's sessions
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      s.sessions.push({ id: 'walk', date: '2026-11-16', at: '2026-11-16T12:00:00.000Z', mins: 6, before: null, after: null });
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
      WL.modules.calm.reload();
    });
    await page.goto(base + '#home'); await page.goto(base + '#calm');
    await page.click('#c-recent summary');
    const rec2 = await page.locator('#c-recent li').allTextContents();
    assert.strictEqual(rec2.length, 4);
    assert.ok(/Body scan/.test(rec2[0]), 'newest session still first: ' + rec2[0]);
    assert.ok(/Mindful walk/.test(rec2[3]), 'earlier-day session sorted last: ' + rec2[3]);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.calm.v1'));
      s.sessions = s.sessions.filter((x) => x.id !== 'walk');
      localStorage.setItem('wl.calm.v1', JSON.stringify(s));
      WL.modules.calm.reload();
    });
    await page.goto(base + '#home');
    assert.ok(/Done for today/.test(await page.textContent('.home-card[data-module="calm"]')));
    await page.goto(base + '#calm');
    await page.click('#c-goal [data-goal="20"]');
    assert.strictEqual(await page.getAttribute('#c-goal [data-goal="20"]', 'aria-pressed'), 'true');
    assert.ok(/7 of 20 min/.test(await page.textContent('#c-today')), 'switching to 20 min goal updates progress');
    await page.click('#c-goal [data-goal="10"]');
  });
  await t.step('a new day: today’s practice not done; the body scan speaks different words the second time', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 19, 14, 0));
    await page.goto(base + '#calm'); await page.reload();
    const top = await page.textContent('#c-today');
    assert.ok(/goal 10 min/.test(top) && !/Done for today/.test(top), top);
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(30000);
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    assert.ok(spoken.length && !spoken[0].startsWith('Get comfortable'), spoken.join('|'));
    await page.click('#c-end');
  });
  await t.step('leaving mid-session with the back gesture still saves the minutes (it used to drop them)', async () => {
    const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length);
    await page.goto(base + '#calm'); await page.goto(base + '#calm/s/body');
    await page.click('#c-pp'); await page.clock.runFor(3 * 60000);
    await page.goBack(); await page.waitForSelector('.list');
    const ss = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions);
    assert.strictEqual(ss.length, n0 + 1); assert.ok(ss[ss.length - 1].mins >= 2.9, JSON.stringify(ss[ss.length - 1]));
    await page.goto(base + '#calm/s/body'); await page.click('#c-pp'); await page.clock.runFor(10000);
    await page.goto(base + '#home');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions.length), n0 + 1, 'under 30 s: not counted');
  });
  await t.step('soft tick setting: off by default, remembered, ticks on each phase change (not the first)', async () => {
    await page.goto(base + '#calm');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'false');
    await page.evaluate(() => { window.__ticks = []; WL.tick = (p) => window.__ticks.push(p); });
    await page.goto(base + '#calm/s/box'); await page.click('#c-pp'); await page.clock.runFor(17000);
    assert.deepStrictEqual(await page.evaluate(() => window.__ticks), [], 'off: silent');
    await page.click('#c-end');
    await page.goto(base + '#calm'); await page.click('#ctk');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'true');
    await page.reload(); await page.waitForSelector('#ctk');
    assert.strictEqual(await page.getAttribute('#ctk', 'aria-pressed'), 'true', 'kept after reload');
    await page.evaluate(() => { window.__ticks = []; WL.tick = (p) => window.__ticks.push(p); });
    await page.goto(base + '#calm/s/box'); await page.click('#c-pp'); await page.clock.runFor(16500);
    assert.deepStrictEqual(await page.evaluate(() => window.__ticks), ['hold', 'down', 'hold', 'up']);
    await page.click('#c-pp'); await page.clock.runFor(8000);
    assert.strictEqual((await page.evaluate(() => window.__ticks)).length, 4, 'paused: no ticks');
    await page.click('#c-end');
    await page.goto(base + '#calm'); await page.click('#ctk');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).settings.tick), false);
  });
  await t.step('waking up hours after a timer/pacer ended caps logged minutes at the chosen length', async () => {
    await page.goto(base + '#calm/s/timer');
    await page.click('#c-len [data-len="3"]');
    await page.click('#c-pp');
    await page.clock.fastForward(2 * 3600e3);
    await page.clock.runFor(1000);
    assert.ok(await page.isVisible('#c-after'));
    const ss = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1')).sessions);
    assert.strictEqual(ss[ss.length - 1].mins, 3, 'logged 3 min, not 120 min: ' + ss[ss.length - 1].mins);
    await page.click('#c-save');
  });
  await t.step('Home card, no overflow, no errors', async () => {
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="calm"]')).length > 10);
    await t.noOverflow(['#calm', '#calm/s/slow', '#calm/s/body']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('calm browser');
})().catch((e) => { console.error(e); process.exit(1); });
