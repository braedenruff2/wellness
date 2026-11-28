/* Calm's meditation path (settings.aim 'train'): the one-time "What do you want from Calm?" card, the path card with
   his stage, a sit with 10-30 min chips (kept for next time), no stress ratings but "How steady was your attention?"
   and "What got in the way?" saved on the session (no "Did it help?"), the tip from the last sit, moving on when
   ready, choosing any stage, and the stage sit leading Home's today list. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 25, 20, 0) });
  const { page, base } = t;
  const calm = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.calm.v1') || 'null'));
  await t.step('first visit asks what Calm is for; "Feeling calmer" keeps everything as it was', async () => {
    await page.goto(base + '#calm'); await page.waitForSelector('#c-aim');
    assert.ok(!(await page.$('#c-path[open]')), 'no open path card before choosing');
    assert.ok(await page.$('#c-path'), 'the path is still listed (closed) for anyone curious');
    await page.click('#c-aim [data-aim="calm"]'); await page.waitForSelector('#c-today');
    assert.ok(!(await page.$('#c-aim')));
    assert.strictEqual((await calm()).settings.aim, 'calm');
    assert.ok(!/Counting breaths/.test(await page.textContent('#c-today h3')));
    await page.click('#c-all-open');
    await page.waitForSelector('#c-all-list');
    const all = await page.$$eval('#c-all-list > li h3', (h) => h.map((x) => x.textContent));
    assert.ok(all.includes('One-minute reset') && !all.includes('Counting breaths'), 'path sits are not in the stress list');
    await page.click('#c-all-x');
  });
  await t.step('switching to "Training my mind" in the settings opens the path at stage 1 and today leads with it', async () => {
    await page.click('#c-settings summary');
    await page.click('#c-aim-set [data-aim="train"]'); await page.waitForSelector('#c-path[open]');
    assert.ok((await page.textContent('#c-path summary')).includes('stage 1 of 5: Counting breaths'));
    assert.ok((await page.textContent('#c-today h3')).includes('Counting breaths · 20 min'));
    assert.ok((await page.textContent('#c-today')).includes('Today’s sit on your meditation path'));
    assert.ok((await page.textContent('#c-path-status')).includes('No sits at this stage yet'));
    assert.strictEqual(await page.getAttribute('#c-stages li[aria-current="step"] a', 'href'), '#calm/s/count');
    assert.strictEqual((await page.$$('#c-stages [data-stage]')).length, 4, 'any other stage can be chosen');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.ok(/Calm: 20-min sit, counting breaths/.test(await page.textContent('#wl-today')), await page.textContent('#wl-today'));
  });
  await t.step('a sit: 10-30 min chips (pick kept), no stress rating; afterwards attention + obstacles, saved on the session', async () => {
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-len');
    assert.ok(!(await page.$('#c-before')), 'no "How stressed are you?"');
    const lens = await page.$$eval('#c-len [data-len]', (b) => b.map((x) => [+x.dataset.len, x.getAttribute('aria-pressed') === 'true']));
    assert.deepStrictEqual(lens, [[10, false], [15, false], [20, true], [30, false]]);
    await page.click('[data-len="10"]');
    assert.strictEqual((await calm()).settings.sitMinutes, 10, 'a sit length is remembered');
    await page.click('#c-pp');
    await page.clock.fastForward(5000); await page.clock.runFor(1500);
    assert.ok((await page.textContent('#c-line')).length > 20);
    await page.clock.runFor(8 * 60000);
    assert.ok(!(await page.isVisible('#c-after')), 'not over at 8 min');
    await page.clock.runFor(3 * 60000);
    assert.ok(await page.isVisible('#c-after'), 'the sit ended');
    assert.ok(!(await page.$('#c-after .me-ask')), 'no "Did it help?" after a sit');
    assert.ok(!(await page.$('#c-after-r')), 'no stress rating after a sit');
    const s0 = (await calm()).sessions[0];
    assert.strictEqual(s0.id, 'count'); assert.ok(s0.mins >= 8 && s0.mins <= 11.5, s0.mins); // the fake voice speaks in 50 ms, so a bit under 10
    await page.click('#c-focus [data-f="2"]');
    await page.click('#c-hind [data-h="Sleepy"]'); await page.click('#c-hind [data-h="Restless"]'); await page.click('#c-hind [data-h="Restless"]');
    let s1 = (await calm()).sessions[0];
    assert.deepStrictEqual([s1.focus, s1.hind], [2, ['Sleepy']], 'saved straight away, toggles work');
    await page.click('#c-focus [data-f="2"]');
    assert.ok(!('focus' in (await calm()).sessions[0]), 'tapping again clears');
    await page.click('#c-focus [data-f="3"]');
    // 425: his own words after a sit, saved as he types
    assert.strictEqual(await page.getAttribute('#c-sit-note', 'aria-label'), 'In your own words (optional)');
    await page.fill('#c-sit-note', '  counting felt   easier after minute 5 ');
    assert.strictEqual((await calm()).sessions[0].note, 'counting felt easier after minute 5');
    await page.click('#c-save'); await page.waitForSelector('#c-path[open]');
    s1 = (await calm()).sessions[0];
    assert.deepStrictEqual([s1.focus, s1.hind], [3, ['Sleepy']]);
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-last-words');
    assert.strictEqual(await page.textContent('#c-last-words'), 'After your last sit you wrote: “counting felt easier after minute 5”');
    await page.goto(base + '#calm'); await page.waitForSelector('#c-path');
    const me = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1') || '{"feedback":[]}'));
    assert.ok(!me.feedback.some((f) => f.part === 'calm'), 'nothing in the stress "helped" answers');
  });
  await t.step('the path card: status, the tip from the last sit; today is done so Calm suggests the usual practices', async () => {
    assert.ok(/1 sit at this stage \(\d+ min\); attention mostly steady in 1 of the last 1\./.test(await page.textContent('#c-path-status')));
    assert.ok(/sleepy/i.test(await page.textContent('#c-path-tip')));
    await page.click('#c-recent summary');
    assert.ok(/Mostly steady \(Sleepy\)/.test(await page.textContent('#c-recent')), await page.textContent('#c-recent'));
    assert.ok(!/Counting breaths/.test(await page.textContent('#c-today h3')), 'one sit a day');
    assert.ok(!(await page.$('#c-path-ready')));
  });
  await t.step('after 6 sits with steady attention: "Move on"; the new stage leads the next day; back a stage any time', async () => {
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
      for (let d = 18; d <= 22; d++) c.sessions.push({ id: 'count', date: '2026-11-' + d, at: new Date(2026, 10, d, 21).toISOString(), mins: 20, focus: 3, hind: ['Nothing much'] });
      localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.reload(); await page.waitForSelector('#c-path-ready');
    assert.ok(await page.$('#c-path-tip'), 'the tip comes from the newest sit (25 Nov, sleepy), not the older ones');
    await page.click('#c-path-ready [data-stage="follow"]'); await page.waitForSelector('#c-path[open]');
    assert.ok((await page.textContent('#c-path summary')).includes('stage 2 of 5: Following the breath'));
    assert.strictEqual((await calm()).settings.stage, 'follow');
    await page.clock.setSystemTime(new Date(2026, 10, 26, 19, 0));
    await page.reload(); await page.waitForSelector('#c-today');
    assert.ok((await page.textContent('#c-today h3')).includes('Following the breath · 10 min'));
    await page.click('#c-stages [data-stage="count"]'); await page.waitForSelector('#c-path[open]');
    assert.strictEqual((await calm()).settings.stage, 'count');
  });
  await t.step('a later stage that keeps slipping offers "Back to" the stage before; the week line names the sits', async () => {
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
      c.settings.stage = 'follow';
      for (let d = 23; d <= 25; d++) c.sessions.push({ id: 'follow', date: '2026-11-' + d, at: new Date(2026, 10, d, 21, 30).toISOString(), mins: 20, focus: 1 });
      localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.reload(); await page.waitForSelector('#c-path-back');
    assert.ok(/going back a step/.test(await page.textContent('#c-path-back')));
    const wk = await page.evaluate(() => WL.modules.calm.week());
    assert.ok(/sits on the meditation path \(stage 2: Following the breath\)/.test(wk), wk);
    await page.click('#c-path-back [data-stage="count"]'); await page.waitForSelector('#c-path[open]');
    assert.strictEqual((await calm()).settings.stage, 'count');
    assert.ok(!(await page.$('#c-path-back')));
  });
  await t.step('438: interrupted, wandering sits say they don\'t count against him, and don\'t offer going back', async () => {
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('wl.calm.v1'));
      c.settings.stage = 'note';
      for (let d = 23; d <= 25; d++) c.sessions.push({ id: 'note', date: '2026-11-' + d, at: new Date(2026, 10, d, 22).toISOString(), mins: 20, focus: 1, hind: ['Interrupted'] });
      localStorage.setItem('wl.calm.v1', JSON.stringify(c));
    });
    await page.reload(); await page.waitForSelector('#c-path-status');
    const txt = await page.textContent('#c-path-status');
    assert.ok(/3 sits at this stage \(60 min\)\. Interrupted sits don’t count against you\./.test(txt), txt);
    assert.ok(!(await page.$('#c-path-back')), 'no "go back a step" for interruptions');
    await page.click('#c-stages [data-stage="count"]'); await page.waitForSelector('#c-path[open]');
  });
  await t.step('418: a path sit paused 10+ min offers "Finish here (N min counts)" next to carrying on, with Interrupted pre-ticked', async () => {
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-len');
    await page.click('[data-len="15"]');
    await page.click('#c-pp');
    await page.clock.runFor(6 * 60000); // sit for 6 min (dark cover is up)
    if (await page.$('#c-dark')) await page.click('#c-dark');
    await page.click('#c-pp'); // pause
    assert.strictEqual(await page.textContent('#c-pp'), '▶ Resume');
    await page.clock.runFor(2 * 60000); // short 2 min pause: no Finish here
    assert.strictEqual(await page.isVisible('#c-finish-here'), false, 'short pause has no Finish here');
    await page.clock.runFor(9 * 60000); // total 11 min paused -> offer appears
    await page.waitForSelector('#c-finish-here', { state: 'visible' });
    assert.strictEqual((await page.textContent('#c-finish-here')).trim(), 'Finish here (6 min counts)');
    assert.strictEqual((await page.textContent('#c-pp')).trim(), '▶ Carry on');
    const fhH = await page.$eval('#c-finish-here', (el) => Math.round(el.getBoundingClientRect().height));
    assert.ok(fhH >= 44, 'Finish here height >= 44 px: ' + fhH);
    await page.click('#c-finish-here');
    await page.waitForSelector('#c-after', { state: 'visible' });
    assert.strictEqual(await page.getAttribute('#c-hind [data-h="Interrupted"]', 'aria-pressed'), 'true', 'Interrupted pre-ticked');
    const lastSess = async () => { const ss = (await calm()).sessions; return ss[ss.length - 1]; };
    let last = await lastSess();
    assert.ok(last.mins >= 5.5 && last.mins <= 6.5, 'logged ~6 min: ' + last.mins);
    assert.deepStrictEqual(last.hind, ['Interrupted'], 'Interrupted saved straight away');
    // Tapping another obstacle keeps Interrupted; tapping Interrupted unticks it
    await page.click('#c-hind [data-h="Sleepy"]');
    assert.deepStrictEqual((await lastSess()).hind, ['Interrupted', 'Sleepy']);
    await page.click('#c-hind [data-h="Interrupted"]');
    assert.deepStrictEqual((await lastSess()).hind, ['Sleepy']);
    await page.click('#c-save'); await page.waitForSelector('#c-path[open]');

    // Carrying on after a 10+ min clock jump (setSystemTime before tick): Resume shows Finish here first, second tap carries on and still pre-ticks Interrupted at end
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-len');
    await page.click('[data-len="10"]');
    await page.click('#c-pp');
    await page.clock.runFor(3 * 60000);
    if (await page.$('#c-dark')) await page.click('#c-dark');
    await page.click('#c-pp'); // pause at 3 min
    const nowMs = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(new Date(nowMs + 11 * 60000));
    await page.click('#c-pp'); // first Resume tap surfaces the offer
    assert.strictEqual(await page.isVisible('#c-finish-here'), true, 'Resume surfaces Finish here');
    assert.strictEqual((await page.textContent('#c-finish-here')).trim(), 'Finish here (3 min counts)');
    assert.strictEqual((await page.textContent('#c-pp')).trim(), '▶ Carry on');
    await page.click('#c-pp'); // Carry on
    assert.strictEqual(await page.isVisible('#c-finish-here'), false, 'hidden once carrying on');
    assert.strictEqual((await page.textContent('#c-pp')).trim(), '⏸ Pause');
    await page.clock.runFor(8 * 60000); // finish remaining ~7 min
    await page.waitForSelector('#c-after', { state: 'visible' });
    assert.strictEqual(await page.getAttribute('#c-hind [data-h="Interrupted"]', 'aria-pressed'), 'true', 'Interrupted pre-ticked after carrying on');
    await page.click('#c-save'); await page.waitForSelector('#c-path[open]');
  });
  await t.step('433: a long pause -> Finish here -> attention + own words: the session keeps Interrupted, focus and the words, and its activity event carries all three', async () => {
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-len');
    await page.click('[data-len="10"]');
    await page.click('#c-pp');
    await page.clock.runFor(4 * 60000);
    if (await page.$('#c-dark')) await page.click('#c-dark');
    await page.click('#c-pp'); // pause
    await page.clock.runFor(11 * 60000);
    await page.waitForSelector('#c-finish-here', { state: 'visible' });
    await page.click('#c-finish-here');
    await page.waitForSelector('#c-after', { state: 'visible' });
    await page.click('#c-focus [data-f="2"]');
    await page.fill('#c-sit-note', 'she woke up, I came back after feeding her');
    await page.click('#c-hind [data-h="Restless"]');
    await page.click('#c-save'); await page.waitForSelector('#c-path[open]');
    const ss = (await calm()).sessions, last = ss[ss.length - 1];
    assert.deepStrictEqual([last.focus, last.hind, last.note], [2, ['Interrupted', 'Restless'], 'she woke up, I came back after feeding her']);
    const ev = await page.evaluate((at) => {
      const st = { 'wl.calm.v1': JSON.parse(localStorage.getItem('wl.calm.v1')) };
      return WLActivity.collect(st, {}, new Date()).filter((e) => e.part === 'calm' && e.at === at).map((e) => e.data)[0];
    }, last.at);
    assert.deepStrictEqual([ev.focus, ev.hind, ev.note], [2, ['Interrupted', 'Restless'], 'she woke up, I came back after feeding her']);
    await page.goto(base + '#calm/s/count'); await page.waitForSelector('#c-last-words');
    assert.ok((await page.textContent('#c-last-words')).includes('I came back after feeding her'));
    await page.goto(base + '#calm'); await page.waitForSelector('#c-path');
  });
  await t.step('no overflow at 1.0, no errors', async () => {
    await t.noOverflow(['#calm', '#calm/s/count', '#calm/s/open']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('calm path');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
