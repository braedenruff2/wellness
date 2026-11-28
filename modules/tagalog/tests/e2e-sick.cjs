/* 460: on a sick day (today's check-in note says unwell), Tagalog asks for no new lesson: Home's card and the
   Tagalog page offer "Listen while resting" (a lesson he has done, read aloud: words then conversation, no typing),
   Home's today list doesn't leave Tagalog undone, and the next day everything is as before. */
'use strict';
const assert = require('assert');
const Wb = require('../../../tests/lib/web.cjs');
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 27, 15, 0) });
  const { page, base } = t;
  await page.addInitScript(() => { window.FCAndroid = Object.assign(window.FCAndroid || {}, { keepAwake: () => {}, dimScreen: () => {} }); });
  const seed = (note) => page.evaluate((note) => {
    const tl = JSON.parse(localStorage.getItem('wl.tagalog.v1') || 'null') || { cards: {}, done: {}, answers: [], reviews: [], packs: {}, settings: { slow: true } };
    tl.done = { '2026-11-18/1': '2026-11-20T20:00:00.000Z', '2026-11-18/2': '2026-11-22T20:00:00.000Z', '2026-11-18/3': '2026-11-21T20:00:00.000Z' };
    localStorage.setItem('wl.tagalog.v1', JSON.stringify(tl));
    const me = JSON.parse(localStorage.getItem('wl.me.v1') || '{}');
    me.checkins = me.checkins || {};
    if (note) me.checkins['2026-11-27'] = { sleep: '7 h+', wakes: '0', energy: 'OK', mood: 'Good', day: 'Good', note: note, at: '2026-11-27T18:00:00.000Z' };
    else delete me.checkins['2026-11-27'];
    localStorage.setItem('wl.me.v1', JSON.stringify(me));
  }, note);
  const tlToday = () => page.evaluate(() => { const li = [...document.querySelectorAll('#wl-today li')].find((x) => /Tagalog/.test(x.textContent)); return li ? { text: li.textContent, done: li.classList.contains('done') || !!li.querySelector('.tick, [aria-checked="true"]'), html: li.outerHTML } : null; });

  await t.step('a normal day: Start lesson 4, Tagalog undone on Home', async () => {
    await page.goto(base + '#home'); await seed(''); await page.reload();
    await page.waitForSelector('.home-card[data-module="tagalog"]');
    assert.strictEqual(await page.$('#tl-card-listen'), null);
    const li = await tlToday(); assert.ok(li && /lesson 4/.test(li.text), JSON.stringify(li));
  });

  await t.step('sick: the card offers Listen while resting (the lesson done last), Home has nothing undone for Tagalog', async () => {
    await seed('we are all sick, sore throat'); await page.reload();
    await page.waitForSelector('#tl-card-listen');
    assert.ok(/Sick today: no lesson needed/.test(await page.textContent('.home-card[data-module="tagalog"]')));
    assert.strictEqual(await page.getAttribute('#tl-card-listen', 'href'), '#tagalog/l/2026-11-18/2/listen', 'lesson 2 was finished last (22 Nov)');
    const li = await tlToday(); assert.ok(li && /rest today/.test(li.text), JSON.stringify(li));
    const undone = await page.evaluate(() => (WL.modules.tagalog.today() || {}).done);
    assert.strictEqual(undone, true, 'a sick day is not left undone');
    assert.strictEqual(await page.evaluate(() => WL.modules.tagalog.today().href), '#tagalog', 'the ticked item opens the page, it never starts audio by itself');
  });

  await t.step('tapping it opens that lesson and reads it aloud straight away, words then conversation, nothing typed', async () => {
    await page.evaluate(() => { window.__spoken = []; });
    await page.click('#tl-card-listen');
    await page.waitForSelector('#tl-walk[aria-pressed="true"]');
    assert.ok(/Stop listening/.test(await page.textContent('#tl-walk')));
    assert.strictEqual(await page.evaluate(() => location.hash), '#tagalog/l/2026-11-18/2', 'the hash drops /listen (no restart on coming back)');
    for (let i = 0; i < 400 && (await page.getAttribute('#tl-walk', 'aria-pressed')) === 'true'; i++) await page.clock.runFor(1000);
    const spoken = await page.evaluate(() => window.__spoken.map((x) => x.text));
    const lesson = await page.evaluate(() => TagalogCore.allPacks(JSON.parse(localStorage.getItem('wl.tagalog.v1')), window.TL_PACKS).find((p) => p.id === '2026-11-18').lessons[1]);
    assert.ok(spoken.includes(lesson.words[0].tl) && spoken.includes(lesson.words[0].en), 'words and meanings read');
    if (lesson.dialogue && lesson.dialogue.length) assert.ok(spoken.includes(lesson.dialogue[lesson.dialogue.length - 1].tl), 'the conversation too');
    assert.ok(/Listen again/.test(await page.textContent('#tl-walk')));
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')));
    assert.strictEqual(Object.keys(st.done).length, 3, 'listening finishes no lesson');
    // 467: listening to the end counts for today: Home's card and today list say so
    assert.strictEqual(st.listened && st.listened['2026-11-27'], 1, JSON.stringify(st.listened));
    await page.goto(base + '#home'); await page.waitForSelector('#tl-card-listened');
    assert.ok(/Listened while resting/.test(await page.textContent('.home-card[data-module="tagalog"]')));
    const li2 = await tlToday(); assert.ok(li2 && /listened while resting/.test(li2.text), JSON.stringify(li2));
    assert.strictEqual(await page.evaluate(() => TagalogCore.stats(JSON.parse(localStorage.getItem('wl.tagalog.v1')), new Date()).weekDays >= 1), true);
  });

  await t.step('the Tagalog page: sick card first, lesson 4 still one tap away; the button reads "while resting"', async () => {
    await page.goto(base + '#tagalog'); await page.waitForSelector('#tl-sick');
    assert.ok(/Listened while resting/.test(await page.textContent('#tl-sick')) && /Listen again/.test(await page.textContent('#tl-sick-listen')), '472: the page says so too');
    assert.strictEqual(await page.getAttribute('#tl-sick-listen', 'href'), '#tagalog/l/2026-11-18/2/listen');
    assert.ok(await page.$('#tl-sick a[href="#tagalog/l/2026-11-18/4"]'), 'Lesson 4 anyway');
    await page.click('#tl-sick a[href="#tagalog/l/2026-11-18/4"]'); await page.waitForSelector('#tl-walk');
    assert.ok(/Listen while resting/.test(await page.textContent('#tl-walk')));
    assert.strictEqual(await page.getAttribute('#tl-walk', 'aria-pressed'), 'false', 'no auto-start without /listen');
  });

  await t.step('typing the sick note on Home switches the Tagalog card at once (no reload)', async () => {
    await seed(''); await page.goto(base + '#home'); await page.reload();
    await page.waitForSelector('#me-ck-note');
    assert.strictEqual(await page.$('#tl-card-listen'), null);
    await page.fill('#me-ck-note', 'I think I have a cold'); await page.press('#me-ck-note', 'Tab');
    await page.clock.runFor(1500);
    await page.waitForSelector('#tl-card-listen');
  });

  await t.step('the next day (no sick note): back to the lesson as usual', async () => {
    await page.clock.setSystemTime(new Date(2026, 10, 28, 9, 0));
    await page.evaluate(() => { const me = JSON.parse(localStorage.getItem('wl.me.v1')); delete me.checkins['2026-11-27']; localStorage.setItem('wl.me.v1', JSON.stringify(me)); });
    await page.reload(); await page.waitForSelector('.home-card[data-module="tagalog"]');
    assert.strictEqual(await page.$('#tl-card-listen'), null);
    const li = await tlToday(); assert.ok(li && /lesson 4/.test(li.text), JSON.stringify(li));
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('tagalog sick day');
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 3000)); process.exit(1); });
