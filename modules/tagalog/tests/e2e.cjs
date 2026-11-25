/* Tagalog in the browser: a lesson with all four exercise types, words to review next day, downloading next week. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const Wb = require('../../../tests/lib/web.cjs');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'packs', '2026-11-18.json'), 'utf8'));
// a week id no real pack will use (real weeks ship bundled in the app, so a real id would never count as new)
const NX = '2099-12-30';
const next = JSON.parse(JSON.stringify(pack)); next.id = NX; next.week = 2; next.title = 'Week two test';
const HASHES = {}, GOT = { n: 0 }, FIXED = { pack: null };
const PACK0 = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'packs', '2026-11-18.json'), 'utf8'));
const RAW = 'https://raw.githubusercontent.com/test/wellness/main/modules/tagalog/packs/';
(async () => {
  const t = await Wb.open({ routes: [[RAW + '**', (route) => {
    const u = route.request().url();
    if (u.endsWith('index.json')) return route.fulfill({ json: { packs: ['2026-11-18', NX, '../../x'], hashes: HASHES } });
    if (u.endsWith(NX + '.json')) { GOT.n++; return route.fulfill({ json: next }); }
    if (u.endsWith('2026-11-18.json') && FIXED.pack) { GOT.n++; return route.fulfill({ json: FIXED.pack }); }
    return route.fulfill({ status: 404, body: '' });
  }]] });
  const { page, base } = t;
  const reveal = async () => { await page.click('#tl-show'); await page.clock.runFor(450); }; // answer buttons ignore taps for 0.4 s
  await page.goto(base + '#tagalog');
  await t.step('today shows lesson 1', async () => {
    assert.ok((await page.textContent('main')).includes('Po, opo and greeting elders'));
    assert.strictEqual(await page.locator('#tl-voice-nudge').count(), 0, 'no voice nudge without native bridge');
    // before any lesson is finished, mixed practice shows an empty-state message cleanly
    await page.goto(base + '#tagalog/practice');
    assert.ok((await page.textContent('main')).includes('Finish a lesson first'));
    await page.goto(base + '#tagalog');
  });
  await t.step('a lesson: hear a word in Filipino, then answer every exercise', async () => {
    await page.click('a[href="#tagalog/l/2026-11-18/1"]');
    await page.waitForSelector('[data-me-fit][data-about="lesson:2026-11-18/1"]', { state: 'attached', timeout: 3000 });
    await page.click('[data-say="opo"]');
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: 'opo', lang: 'fil-PH' });
    const exs = pack.lessons[0].exercises;
    for (let i = 0; i < exs.length; i++) {
      const ex = exs[i];
      if (ex.type === 'mc' || ex.type === 'listen') await page.click(`#tl-ex [data-o="${ex.answer.replace(/"/g, '\\"')}"]`);
      if (ex.type === 'type') { await page.fill('#tl-in', ex.answer.toLowerCase()); await page.press('#tl-in', 'Enter'); } // Enter used to skip the feedback
      if (ex.type === 'build') {
        const ws = ex.answer.split(' ');
        // tap an out-of-order word first, then tap it in #tl-built to pull just that word back
        if (ws.length >= 2) {
          await page.click(`#tl-ex .word:not([disabled]):text-is("${ws[1]}")`);
          const placed = page.locator('#tl-built .built-w').first();
          const box = await placed.boundingBox();
          assert.ok(box && box.height >= 44, 'placed build word chip is >= 44px tall: ' + JSON.stringify(box));
          await placed.click();
          assert.strictEqual(await page.locator('#tl-built .built-w').count(), 0, 'tapping placed word removes it back to bank');
        }
        for (const w of ws) await page.click(`#tl-ex .word:not([disabled]):text-is("${w}")`);
        await page.click('#tl-check');
        assert.strictEqual(await page.locator('#tl-built .built-w').first().isDisabled(), true, 'placed words disabled after check');
      }
      assert.ok((await page.textContent('#tl-fb')).includes('Right'), 'exercise ' + (i + 1));
      await page.click('#tl-next');
    }
    assert.ok((await page.textContent('#tl-ex')).includes(exs.length + ' of ' + exs.length + ' right'));
  });
  await t.step('Listen while walking: word in Tagalog, its meaning, the Tagalog again; stops when he leaves', async () => {
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.click('#tl-walk');
    for (let i = 0; i < 6; i++) await page.clock.runFor(1000);
    const sp = await page.evaluate(() => window.__spoken.slice(0, 3));
    const w = PACK0.lessons[0].words[0];
    assert.deepStrictEqual(sp.map((x) => x.text), [w.tl, w.en, w.tl], JSON.stringify(sp));
    assert.strictEqual(sp[0].lang, 'fil-PH'); assert.notStrictEqual(sp[1].lang, 'fil-PH');
    await page.click('#tl-walk'); // stop
    const n = await page.evaluate(() => window.__spoken.length);
    for (let i = 0; i < 5; i++) await page.clock.runFor(1000);
    assert.strictEqual(await page.evaluate(() => window.__spoken.length), n, 'stopped');
  });
  await t.step('a wrong answer shows the right one; returning to #tagalog today stays on Done for today', async () => {
    await page.click('#tl-again');
    await page.click('#tl-ex [data-o="no"]');
    assert.ok((await page.textContent('#tl-fb')).includes('Answer: yes (polite)'));
    await page.goto(base + '#tagalog');
    await page.waitForSelector('#tl-done-today');
    assert.ok((await page.textContent('#tl-done-today')).includes('Lesson done for today'));
    assert.ok((await page.textContent('#tl-ahead')).includes('Lesson 2'));
  });
  await t.step('ang/ng word-order mistake in a lesson shows a specific word-order hint instead of plain wrong', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/5');
    // Skip first 2 exercises (mc, listen) to reach exercise 3: type "Ang sarap ng adobo!" (accepts "masarap ang adobo")
    await page.click('#tl-ex .opt'); await page.click('#tl-next');
    await page.click('#tl-ex .opt'); await page.click('#tl-next');
    await page.fill('#tl-in', 'Ang adobo masarap');
    await page.click('#tl-check');
    const fb = await page.textContent('#tl-order');
    assert.ok(fb.includes('Right words; in Tagalog the doer comes after the verb: masarap ang adobo'), fb);
    assert.ok(!(await page.$('#tl-alt')), 'wrong: no "lesson\'s version" line');
    await page.click('#tl-next');
    // Also check a plain wrong typed answer on exercise 6 ("Pakiabot po ng kanin."): wrong words -> plain Answer
    await page.click('#tl-ex .opt'); await page.click('#tl-next'); // ex 4 mc
    await page.click('#tl-check'); await page.click('#tl-next'); // ex 5 build
    await page.fill('#tl-in', 'Ng kanin pakiabot po');
    await page.click('#tl-check');
    const fb2 = await page.textContent('#tl-order');
    assert.ok(fb2.includes('Right words; in Tagalog the doer comes after the verb: Pakiabot po ng kanin.'), fb2);
  });
  await t.step('a typed answer in other accepted words is right, and shows the lesson\'s own version', async () => {
    await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/l/2026-11-18/5');
    await page.click('#tl-ex .opt'); await page.click('#tl-next');
    await page.click('#tl-ex .opt'); await page.click('#tl-next');
    await page.fill('#tl-in', 'Masarap ang adobo'); await page.click('#tl-check');
    assert.ok((await page.textContent('#tl-fb')).includes('Right'));
    assert.ok((await page.textContent('#tl-alt')).includes('The lesson’s version: Ang sarap ng adobo'), await page.textContent('#tl-alt'));
  });
  await t.step('a missing linker ("gusto ko mag-aral") says Almost and which linker', async () => {
    await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/l/2026-11-25/1');
    await page.click('#tl-ex .opt'); await page.click('#tl-next'); // mc
    await page.click('#tl-check'); await page.click('#tl-next'); // build, left empty
    await page.fill('#tl-in', 'gusto ko mag-aral ng Tagalog'); await page.click('#tl-check');
    const fb = await page.textContent('#tl-linker');
    assert.ok(fb.includes('Almost: add the linker -ng (kong): Gusto kong mag-aral ng Tagalog.'), fb);
  });
  await t.step('next day: lesson 2 is next and the words are due for review', async () => {
    await page.clock.runFor(86400e3);
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('main')).includes('Talking about the baby'));
    await page.goto(base + '#tagalog/review');
    const nrev = () => page.evaluate(() => (JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews || []).length);
    const before = await nrev();
    await page.click('#tl-show'); await page.click('#tl-no'); // a double-tap on Show lands where "Not yet" appears
    assert.ok(await nrev() === before && await page.isVisible('#tl-yes'), 'double-tap ignored: still on the same card, nothing recorded');
    await page.clock.runFor(450);
    await page.click('#tl-yes');
    await reveal(); await page.click('#tl-no');
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    assert.strictEqual(Object.values(cards).filter((c) => c.box === 2).length, 1);
  });
  await t.step('two days later the word he knew is asked English first, and he hears it after revealing', async () => {
    await page.clock.runFor(2 * 86400e3);
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    const [tl, c] = Object.entries(cards).find(([, x]) => x.box === 2);
    await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/review');
    // box-1 cards come first; skip to the English-first one
    for (let n = 0; n < 30 && !(await page.textContent('#tl-card')).includes('say it in Tagalog'); n++) { await reveal(); await page.click('#tl-yes'); }
    const txt = await page.textContent('#tl-card');
    assert.ok(txt.includes(c.en) && await page.isHidden('#tl-ans'), 'English shown, Tagalog hidden');
    await reveal();
    assert.ok(await page.isVisible('#tl-ans') && (await page.textContent('#tl-ans')).includes(tl));
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: tl, lang: 'fil-PH' });
    await page.click('#tl-yes');
    const r = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews.slice(-1)[0]);
    assert.strictEqual(r.dir, 'say'); assert.strictEqual(r.tl, tl);
  });
  await t.step('finishing review asks one optional question and keeps the answer', async () => {
    for (let n = 0; n < 40 && !(await page.textContent('#tl-card')).includes('All done'); n++) { await reveal(); await page.click('#tl-yes'); }
    assert.ok(await page.isVisible('#tl-card .me-ask[data-part="tagalog"]'));
    await page.click('#tl-card [data-me-a][data-k="level"][data-v="Too easy"]');
    const f = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.me.v1')).feedback.filter((x) => x.part === 'tagalog').slice(-1)[0]);
    assert.ok(/^review@/.test(f.about) && f.a.level === 'Too easy', JSON.stringify(f));
  });
  await t.step('Your words: hard ones first (missed), the rest A-Z, hear any of them', async () => {
    await page.goto(base + '#tagalog'); await page.click('a[href="#tagalog/words"]');
    await page.waitForSelector('#tl-all');
    const hard = await page.$('#tl-hard');
    if (hard) assert.ok((await hard.textContent()).length > 2);
    const first = await page.getAttribute('#tl-all [data-say]', 'data-say');
    await page.click('#tl-all [data-say]');
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: first, lang: 'fil-PH' });
  });
  await t.step('mixed practice: the missed exercise comes first; Enter advances, build chips remove, and finishing offers another 8', async () => {
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('main')).includes('Mixed practice'));
    await page.click('a[href="#tagalog/practice"]');
    const first = pack.lessons[0].exercises[0];
    assert.ok((await page.textContent('#tl-ex')).includes(first.prompt), 'the one answered wrong earlier');
    const n = Math.min(8, pack.lessons[0].exercises.length);
    let sawBuild = false, sawType = false;
    for (let i = 0; i < n; i++) {
      assert.ok((await page.textContent('#tl-ex')).includes((i + 1) + ' of ' + n), 'on exercise ' + (i + 1));
      const b = await page.$('#tl-ex .opt:not(.word)');
      if (b) {
        await b.click();
      } else if (await page.$('#tl-in')) {
        sawType = true;
        await page.fill('#tl-in', 'opo');
        await page.press('#tl-in', 'Enter'); // submits typed answer and focuses #tl-next
      } else if (await page.$('#tl-built')) {
        sawBuild = true;
        await page.locator('#tl-ex .word').first().click();
        assert.strictEqual(await page.locator('#tl-built .built-w').count(), 1, 'placed one chip in practice build');
        await page.locator('#tl-built .built-w').first().click();
        assert.strictEqual(await page.locator('#tl-built .built-w').count(), 0, 'tapped chip removed back to bank in practice build');
        const words = page.locator('#tl-ex .word');
        const wc = await words.count();
        for (let k = 0; k < wc; k++) await words.nth(k).click();
        await page.click('#tl-check');
        assert.strictEqual(await page.locator('#tl-built .built-w').first().isDisabled(), true, 'placed chips disabled after check');
        assert.strictEqual(await page.locator('#tl-clear').isDisabled(), true, 'Clear disabled after check');
        assert.strictEqual(await page.locator('#tl-check').isDisabled(), true, 'Check disabled after check');
      }
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'tl-next', '#tl-next focused after check');
      await page.keyboard.press('Enter'); // Enter advances to next exercise (or summary)
    }
    assert.ok(sawBuild && sawType, 'practised both build and type exercises');
    assert.ok(new RegExp('of ' + n + ' right').test(await page.textContent('#tl-ex')));
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).answers.length);
    await page.click('#tl-more');
    assert.ok((await page.textContent('#tl-ex')).includes('1 of ' + n));
    assert.ok(before >= n + 1, 'practice answers are recorded');
    const done = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('wl.tagalog.v1')).done));
    assert.deepStrictEqual(done, ['2026-11-18/1'], 'practice never marks a lesson done');
  });
  await t.step('mixed practice edge cases: finished lessons with 0 or 1 exercise handle cleanly without crashing', async () => {
    const saved = await page.evaluate(() => localStorage.getItem('wl.tagalog.v1'));
    // Finished lesson with 0 exercises (or pack removed): #tagalog hides Mixed practice, #tagalog/practice shows empty state
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.tagalog.v1'));
      s.done = { '2099-01-01/1': '2026-11-18T10:00:00.000Z' };
      localStorage.setItem('wl.tagalog.v1', JSON.stringify(s));
      window.WL.modules.tagalog.reload();
    });
    await page.goto(base + '#tagalog');
    assert.ok(!(await page.textContent('main')).includes('Mixed practice'), 'Mixed practice card hidden when 0 exercises available');
    await page.goto(base + '#tagalog/practice');
    assert.ok((await page.textContent('main')).includes('Finish a lesson first'), 'empty state shown when finished lesson has no exercises');
    // Finished lesson with only 1 exercise: runs 1 of 1 and finishes cleanly
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.tagalog.v1'));
      s.packs = s.packs || {};
      s.packs['2099-01-01'] = {
        id: '2099-01-01', week: 9, title: 'Mini',
        lessons: [{ day: 1, title: 'Tiny', intro: 'One item', words: [{ tl: 'opo', en: 'yes' }],
          exercises: [{ type: 'mc', prompt: 'Say yes politely', answer: 'opo', options: ['opo', 'hindi'] }] }]
      };
      localStorage.setItem('wl.tagalog.v1', JSON.stringify(s));
      window.WL.modules.tagalog.reload();
    });
    await page.goto(base + '#tagalog');
    await page.goto(base + '#tagalog/practice');
    assert.ok((await page.textContent('#tl-ex')).includes('1 of 1'), 'runs minimal 1-exercise practice set');
    await page.click('#tl-ex [data-o="opo"]');
    await page.keyboard.press('Enter');
    assert.ok((await page.textContent('#tl-ex')).includes('1 of 1 right'), 'finishes 1-exercise practice cleanly');
    // restore previous state
    await page.evaluate((raw) => { localStorage.setItem('wl.tagalog.v1', raw); window.WL.modules.tagalog.reload(); }, saved);
  });
  await t.step('next week downloads from GitHub (bad ids ignored); Send my week saves a summary', async () => {
    await page.goto(base + '#tagalog/settings');
    await page.fill('#tl-src', 'http://evil.example/'); await page.click('#tl-save-src');
    assert.ok((await page.textContent('#toast')).includes('raw.githubusercontent'));
    await page.fill('#tl-src', RAW); await page.click('#tl-save-src');
    await page.click('#tl-fetch');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('1 new week'));
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('main')).includes('Week two test'));
    await page.goto(base + '#tagalog/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tl-send')]);
    const f = await dl.path(); const sum = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.strictEqual(sum.app, 'wellness-tagalog-summary'); assert.ok(sum.missed.length >= 1);
    assert.ok(Array.isArray(sum.feel) && sum.feel.some((x) => /^review@/.test(x.about) && x.level === 'Too easy'), 'how lessons felt goes to next week\'s lessons: ' + JSON.stringify(sum.feel));
  });
  await t.step('a week corrected after it went out is downloaded again (its hash changed); unchanged ones are not', async () => {
    const n0 = GOT.n;
    await page.goto(base + '#tagalog/settings'); await page.click('#tl-fetch'); await page.clock.runFor(500);
    assert.strictEqual(GOT.n, n0, 'no hash yet: nothing fetched again');
    next.title = 'Week two corrected'; HASHES[NX] = 'aaaaaaaaaaaa';
    await page.click('#tl-fetch'); await page.waitForFunction((nx) => JSON.parse(localStorage.getItem('wl.tagalog.v1')).packs[nx] && JSON.parse(localStorage.getItem('wl.tagalog.v1')).packs[nx].title === 'Week two corrected', NX);
    assert.strictEqual(GOT.n, n0 + 1);
    await page.click('#tl-fetch'); await page.clock.runFor(500);
    assert.strictEqual(GOT.n, n0 + 1, 'same hash: not fetched again');
  });
  await t.step('a week that shipped inside the app is downloaded again when corrected on GitHub; not while the hash matches', async () => {
    const n0 = GOT.n;
    const inApp = await page.evaluate(() => window.TL_PACK_HASH['2026-11-18']);
    assert.ok(/^[0-9a-f]{12}$/.test(inApp));
    HASHES['2026-11-18'] = inApp;
    await page.click('#tl-fetch'); await page.clock.runFor(500);
    assert.strictEqual(GOT.n, n0, 'same as the app: not fetched');
    FIXED.pack = JSON.parse(JSON.stringify(PACK0)); FIXED.pack.title = 'Family first, corrected'; HASHES['2026-11-18'] = 'cccccccccccc';
    await page.click('#tl-fetch');
    await page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('wl.tagalog.v1')); return s.packs['2026-11-18'] && s.packs['2026-11-18'].title === 'Family first, corrected'; });
    assert.strictEqual(GOT.n, n0 + 1);
    await page.click('#tl-fetch'); await page.clock.runFor(500);
    assert.strictEqual(GOT.n, n0 + 1, 'now downloaded with that hash: not fetched again');
  });
  await t.step('Filipino-voice nudge shows when native voiceStatus reports tagalogVoice missing and links to Settings > Voice', async () => {
    await page.addInitScript(() => {
      window.__voiceState = {
        english: 'nice', tagalog: 'nice', pcVoice: true, sid: 6, kokoro: 'ready', tagalogVoice: 'missing',
        downloading: '', progress: '', error: '', last: '', speakers: [{ sid: 6, name: 'Nicole (soft, calm)' }]
      };
      window.FCAndroid = {
        voiceStatus: () => JSON.stringify(window.__voiceState),
        voiceSet: () => {},
        voiceDownload: () => {}
      };
    });
    await page.reload();
    await page.goto(base + '#tagalog');
    await page.waitForSelector('#tl-voice-nudge');
    assert.ok((await page.textContent('#tl-voice-nudge')).includes('Filipino voice'));
    await page.click('#tl-voice-nudge a[href="#settings/voice"]');
    await page.waitForSelector('#wl-voice #wl-dl-tagalog');
    await page.evaluate(() => { window.__voiceState.downloading = 'tagalog'; });
    await page.goto(base + '#tagalog');
    assert.strictEqual(await page.locator('#tl-voice-nudge').count(), 0, 'hidden while downloading');
    await page.evaluate(() => { window.__voiceState.downloading = ''; window.__voiceState.tagalog = 'phone'; });
    await page.goto(base + '#tagalog/review'); await page.goto(base + '#tagalog');
    assert.strictEqual(await page.locator('#tl-voice-nudge').count(), 0, 'hidden when phone voice chosen');
    await page.evaluate(() => { window.__voiceState.tagalog = 'nice'; window.__voiceState.tagalogVoice = 'ready'; });
    await page.goto(base + '#tagalog/review'); await page.goto(base + '#tagalog');
    assert.strictEqual(await page.locator('#tl-voice-nudge').count(), 0, 'hidden once ready');
  });
  await t.step('Listen while walking and Play all cancel cleanly on stop, restart, and leaving the screen', async () => {
    await page.goto(base + '#tagalog/l/2026-11-18/1');
    await page.waitForSelector('#tl-walk');
    await page.evaluate(() => { window.__spoken = []; window.__cancels = 0; });
    // Start walking, let 1st utterance finish (enters 900ms pause), stop, and immediately restart:
    // the stale pause timer from run #1 must NOT fire alongside run #2
    await page.click('#tl-walk');
    await page.clock.runFor(100);
    await page.click('#tl-walk'); // stop during pause
    await page.click('#tl-walk'); // restart right away
    await page.clock.runFor(950); // past old timer, right into run #2's 2nd item
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    // Run #1 spoke item 0; run #2 spoke item 0 + item 1 (3 total, NOT 4 from overlapping timers)
    assert.strictEqual(spoken.length, 3, 'no overlapping walk loop after quick stop/restart: ' + JSON.stringify(spoken));
    // Tapping a single-word hear button stops Listen while walking cleanly and resets the toggle
    await page.locator('[data-say]').first().click();
    assert.strictEqual(await page.getAttribute('#tl-walk', 'aria-pressed'), 'false', 'hear button resets #tl-walk toggle');
    await page.clock.runFor(4000);
    assert.strictEqual((await page.evaluate(() => window.__spoken.length)), 4, 'walk loop stopped after tapping a hear button');
    // Restart walk and verify leaving the lesson cancels speech immediately and prevents any later scheduled lines
    await page.click('#tl-walk');
    const cancelsBefore = await page.evaluate(() => window.__cancels || 0);
    await page.goto(base + '#home');
    await page.clock.runFor(4000);
    const afterLeave = await page.evaluate(() => ({ c: window.__cancels || 0, n: window.__spoken.length }));
    assert.ok(afterLeave.c > cancelsBefore, 'leave() cancelled speech');
    assert.strictEqual(afterLeave.n, 5, 'no speech fired after leaving lesson');
  });
  await t.step('Your words search filters Tagalog and English across Hard ones and All the others when 10+ words met', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('wl.tagalog.v1') || '{}');
      s.cards = s.cards || {};
      const extra = [['tubig', 'water', 0], ['pagkain', 'food', 0], ['bahay', 'house', 0], ['araw', 'sun / day', 0],
        ['gabi', 'night', 0], ['umaga', 'morning', 0], ['tulog', 'sleep', 2], ['kain', 'eat', 0], ['lakad', 'walk', 0], ['ngiti', 'smile', 0]];
      for (const [tl, en, wrong] of extra) s.cards[tl] = { en, box: wrong ? 1 : 3, due: '2026-11-30', seen: 3, right: 2, wrong };
      localStorage.setItem('wl.tagalog.v1', JSON.stringify(s));
    });
    await page.reload();
    await page.goto(base + '#tagalog/words');
    await page.waitForSelector('#tl-word-search');
    const total = await page.locator('#tl-hard li, #tl-all li').count();
    assert.ok(total >= 10, '10+ words present: ' + total);
    await page.fill('#tl-word-search', 'sleep');
    assert.strictEqual(await page.locator('#tl-hard li:not([hidden]), #tl-all li:not([hidden])').count(), 1);
    assert.ok(/1 found/.test(await page.textContent('#tl-word-found')));
    assert.strictEqual(await page.locator('#tl-all').evaluate((u) => u.closest('.card').hidden), true, 'empty section card hidden');
    await page.fill('#tl-word-search', 'ngiti');
    assert.strictEqual(await page.locator('#tl-hard li:not([hidden]), #tl-all li:not([hidden])').count(), 1);
    await page.fill('#tl-word-search', '');
    assert.strictEqual(await page.locator('#tl-hard li:not([hidden]), #tl-all li:not([hidden])').count(), total);
  });
  await t.step('review keyboard shortcuts: Space/Enter reveal and 1/2 rate (respecting 400 ms guard), cleaned up on leave', async () => {
    await page.clock.runFor(5 * 86400e3);
    await page.goto(base + '#tagalog/review');
    await page.waitForSelector('#tl-show');
    const nrev = () => page.evaluate(() => (JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews || []).length);
    const before = await nrev();
    // Space reveals the answer; immediate '1' is blocked by the 400 ms double-tap guard
    await page.keyboard.press('Space');
    assert.ok(await page.isVisible('#tl-ans') && await page.isVisible('#tl-no'), 'Space revealed card');
    await page.keyboard.press('1');
    assert.strictEqual(await nrev(), before, '1 ignored within 400 ms guard');
    await page.clock.runFor(450);
    await page.keyboard.press('1');
    assert.strictEqual(await nrev(), before + 1, '1 recorded Not yet after 400 ms');
    const r1 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews.slice(-1)[0]);
    assert.strictEqual(r1.right, false);
    // Card 2: Enter reveals, 2 marks Got it
    await page.waitForSelector('#tl-show');
    await page.keyboard.press('Enter');
    assert.ok(await page.isVisible('#tl-ans') && await page.isVisible('#tl-yes'), 'Enter revealed card 2');
    await page.clock.runFor(450);
    await page.keyboard.press('2');
    assert.strictEqual(await nrev(), before + 2, '2 recorded Got it');
    const r2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews.slice(-1)[0]);
    assert.strictEqual(r2.right, true);
    // Leaving review removes the key listener cleanly
    await page.goto(base + '#tagalog');
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    assert.strictEqual(await nrev(), before + 2, 'shortcuts inactive after leaving review');
  });
  await t.step('review: a word missed twice comes back with a lesson sentence that uses it', async () => {
    const saved = await page.evaluate(() => localStorage.getItem('wl.tagalog.v1'));
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('wl.tagalog.v1'));
      st.cards = { ngayon: { en: 'now', box: 1, due: '2000-01-01', seen: 3, right: 1, wrong: 2, from: '' }, opo: { en: 'yes (polite)', box: 1, due: '2000-01-01', seen: 1, right: 1, wrong: 0, from: '' } };
      localStorage.setItem('wl.tagalog.v1', JSON.stringify(st)); window.WL.modules.tagalog.reload();
    });
    await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/review');
    const first = await page.textContent('.big');
    await page.click('#tl-show');
    const ex = await page.$('#tl-example');
    if (first.includes('ngayon')) assert.ok(/ngayon/i.test(await ex.textContent()), 'missed twice: example shown');
    else assert.ok(!ex, 'never missed: no example');
    await page.clock.runFor(450); await page.click('#tl-yes');
    await page.click('#tl-show');
    const ex2 = await page.$('#tl-example');
    if (first.includes('ngayon')) assert.ok(!ex2); else assert.ok(/ngayon/i.test(await ex2.textContent()));
    await page.evaluate((raw) => { localStorage.setItem('wl.tagalog.v1', raw); window.WL.modules.tagalog.reload(); }, saved);
  });
  await t.step('no overflow, no errors', async () => {
    await page.evaluate(() => { window.__voiceState.tagalogVoice = 'missing'; });
    await t.noOverflow(['#tagalog', '#tagalog/l/2026-11-18/3', '#tagalog/review', '#tagalog/practice', '#tagalog/settings', '#tagalog/words', '#settings/voice', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('tagalog browser');
})().catch((e) => { console.error(e); process.exit(1); });
