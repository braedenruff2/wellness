/* Tagalog in the browser: a lesson with all four exercise types, words to review next day, downloading next week. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const Wb = require('../../../tests/lib/web.cjs');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'packs', '2026-11-18.json'), 'utf8'));
const next = JSON.parse(JSON.stringify(pack)); next.id = '2026-11-25'; next.week = 2; next.title = 'Week two test';
const HASHES = {}, GOT = { n: 0 };
const RAW = 'https://raw.githubusercontent.com/test/wellness/main/modules/tagalog/packs/';
(async () => {
  const t = await Wb.open({ routes: [[RAW + '**', (route) => {
    const u = route.request().url();
    if (u.endsWith('index.json')) return route.fulfill({ json: { packs: ['2026-11-18', '2026-11-25', '../../x'], hashes: HASHES } });
    if (u.endsWith('2026-11-25.json')) { GOT.n++; return route.fulfill({ json: next }); }
    return route.fulfill({ status: 404, body: '' });
  }]] });
  const { page, base } = t;
  const reveal = async () => { await page.click('#tl-show'); await page.clock.runFor(450); }; // answer buttons ignore taps for 0.4 s
  await page.goto(base + '#tagalog');
  await t.step('today shows lesson 1', async () => {
    assert.ok((await page.textContent('main')).includes('Po, opo and greeting elders'));
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
      if (ex.type === 'build') { for (const w of ex.answer.split(' ')) await page.click(`#tl-ex .word:not([disabled]):text-is("${w}")`); await page.click('#tl-check'); }
      assert.ok((await page.textContent('#tl-fb')).includes('Right'), 'exercise ' + (i + 1));
      await page.click('#tl-next');
    }
    assert.ok((await page.textContent('#tl-ex')).includes(exs.length + ' of ' + exs.length + ' right'));
  });
  await t.step('a wrong answer shows the right one', async () => {
    await page.click('#tl-again');
    await page.click('#tl-ex [data-o="no"]');
    assert.ok((await page.textContent('#tl-fb')).includes('Answer: yes (polite)'));
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
  await t.step('mixed practice: the missed exercise comes first; finishing offers another 8', async () => {
    await page.goto(base + '#tagalog');
    assert.ok((await page.textContent('main')).includes('Mixed practice'));
    await page.click('a[href="#tagalog/practice"]');
    const first = pack.lessons[0].exercises[0];
    assert.ok((await page.textContent('#tl-ex')).includes(first.prompt), 'the one answered wrong earlier');
    const n = Math.min(8, pack.lessons[0].exercises.length);
    for (let i = 0; i < n; i++) {
      const b = await page.$('#tl-ex .opt:not(.word)');
      if (b) await b.click(); else { const inp = await page.$('#tl-in'); if (inp) await inp.fill('x'); await page.click('#tl-check'); }
      await page.click('#tl-next');
    }
    assert.ok(new RegExp('of ' + n + ' right').test(await page.textContent('#tl-ex')));
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).answers.length);
    await page.click('#tl-more');
    assert.ok((await page.textContent('#tl-ex')).includes('1 of ' + n));
    assert.ok(before >= n + 1, 'practice answers are recorded');
    const done = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('wl.tagalog.v1')).done));
    assert.deepStrictEqual(done, ['2026-11-18/1'], 'practice never marks a lesson done');
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
    next.title = 'Week two corrected'; HASHES['2026-11-25'] = 'aaaaaaaaaaaa';
    await page.click('#tl-fetch'); await page.waitForFunction(() => /2026-11-25/.test(localStorage.getItem('wl.tagalog.v1')) && JSON.parse(localStorage.getItem('wl.tagalog.v1')).packs['2026-11-25'].title === 'Week two corrected');
    assert.strictEqual(GOT.n, n0 + 1);
    await page.click('#tl-fetch'); await page.clock.runFor(500);
    assert.strictEqual(GOT.n, n0 + 1, 'same hash: not fetched again');
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#tagalog', '#tagalog/l/2026-11-18/3', '#tagalog/review', '#tagalog/practice', '#tagalog/settings', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('tagalog browser');
})().catch((e) => { console.error(e); process.exit(1); });
