/* Tagalog in the browser: a lesson with all four exercise types, words to review next day, downloading next week. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const Wb = require('../../../tests/lib/web.cjs');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'packs', '2026-11-18.json'), 'utf8'));
const next = JSON.parse(JSON.stringify(pack)); next.id = '2026-11-25'; next.week = 2; next.title = 'Week two test';
const RAW = 'https://raw.githubusercontent.com/test/wellness/main/modules/tagalog/packs/';
(async () => {
  const t = await Wb.open({ routes: [[RAW + '**', (route) => {
    const u = route.request().url();
    if (u.endsWith('index.json')) return route.fulfill({ json: { packs: ['2026-11-18', '2026-11-25', '../../x'] } });
    if (u.endsWith('2026-11-25.json')) return route.fulfill({ json: next });
    return route.fulfill({ status: 404, body: '' });
  }]] });
  const { page, base } = t;
  await page.goto(base + '#tagalog');
  await t.step('today shows lesson 1', async () => {
    assert.ok((await page.textContent('main')).includes('Po, opo and greeting elders'));
  });
  await t.step('a lesson: hear a word in Filipino, then answer every exercise', async () => {
    await page.click('a[href="#tagalog/l/2026-11-18/1"]');
    await page.click('[data-say="opo"]');
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: 'opo', lang: 'fil-PH' });
    const exs = pack.lessons[0].exercises;
    for (let i = 0; i < exs.length; i++) {
      const ex = exs[i];
      if (ex.type === 'mc' || ex.type === 'listen') await page.click(`#tl-ex [data-o="${ex.answer.replace(/"/g, '\\"')}"]`);
      if (ex.type === 'type') { await page.fill('#tl-in', ex.answer.toLowerCase()); await page.click('#tl-check'); }
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
    await page.click('#tl-show'); await page.click('#tl-yes');
    await page.click('#tl-show'); await page.click('#tl-no');
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    assert.strictEqual(Object.values(cards).filter((c) => c.box === 2).length, 1);
  });
  await t.step('two days later the word he knew is asked English first, and he hears it after revealing', async () => {
    await page.clock.runFor(2 * 86400e3);
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).cards);
    const [tl, c] = Object.entries(cards).find(([, x]) => x.box === 2);
    await page.goto(base + '#tagalog'); await page.goto(base + '#tagalog/review');
    // box-1 cards come first; skip to the English-first one
    for (let n = 0; n < 30 && !(await page.textContent('#tl-card')).includes('say it in Tagalog'); n++) { await page.click('#tl-show'); await page.click('#tl-yes'); }
    const txt = await page.textContent('#tl-card');
    assert.ok(txt.includes(c.en) && await page.isHidden('#tl-ans'), 'English shown, Tagalog hidden');
    await page.click('#tl-show');
    assert.ok(await page.isVisible('#tl-ans') && (await page.textContent('#tl-ans')).includes(tl));
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.deepStrictEqual(sp, { text: tl, lang: 'fil-PH' });
    await page.click('#tl-yes');
    const r = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')).reviews.slice(-1)[0]);
    assert.strictEqual(r.dir, 'say'); assert.strictEqual(r.tl, tl);
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
  });
  await t.step('no overflow, no errors', async () => {
    await t.noOverflow(['#tagalog', '#tagalog/l/2026-11-18/3', '#tagalog/review', '#tagalog/settings', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('tagalog browser');
})().catch((e) => { console.error(e); process.exit(1); });
