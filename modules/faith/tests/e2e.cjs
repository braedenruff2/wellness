/* Browser tests of the main flows (Chromium, phone-sized). node tests/e2e.cjs
   Speech is faked (each line "spoken" in 50 ms) and time is driven by Playwright's clock. */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const assert = require('assert');
const { chromium } = require('playwright');
const WWW = path.join(__dirname, '..', '..', '..', 'app', 'www');

function serve() {
  return new Promise((res) => {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!p.startsWith(WWW) || !fs.existsSync(p)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

const FAKE_SPEECH = `
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); }, cancel() { window.__cancels = (window.__cancels || 0) + 1; } } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
`;

let passed = 0;
async function step(name, f) { console.log('..', name); await f(); passed++; console.log('ok', name); }

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, acceptDownloads: true });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(FAKE_SPEECH);
  await page.clock.install({ time: new Date(2026, 10, 18, 10, 0) });
  await page.goto(base + '#faith/today');

  await step('fresh start shows day 1 with its passage', async () => {
    await page.waitForSelector('h1');
    assert.strictEqual(await page.textContent('h1'), 'Help my unbelief');
    assert.ok((await page.textContent('#reading')).includes('I believe. Help my unbelief!'));
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'light');
  });

  await step('no horizontal scrolling at phone width', async () => {
    for (const h of ['#home', '#faith/today', '#faith/pray', '#faith/journal', '#faith/more', '#faith/settings', '#settings', '#faith/path', '#faith/session/day/1']) {
      await page.goto(base + h);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 0, h + ' overflows by ' + over + 'px');
    }
    await page.goto(base + '#faith/today');
  });

  await step('day journal saves and survives a reload; heavy words get a gentle note', async () => {
    await page.fill('#dj', 'I want God to be real to me.');
    await page.clock.runFor(1000);
    assert.strictEqual(await page.textContent('#dj-saved'), 'Saved');
    await page.reload();
    assert.strictEqual(await page.inputValue('#dj'), 'I want God to be real to me.');
    await page.fill('#dj', 'Honestly I feel hopeless some nights.');
    await page.clock.runFor(1000);
    assert.ok((await page.textContent('#dj-gentle')).includes('talking to someone'));
    await page.fill('#dj', 'I want God to be real to me.');
    await page.clock.runFor(1000);
    assert.strictEqual(await page.textContent('#dj-gentle'), '');
  });

  await step('a line typed and left via hash change before 600 ms is still saved on leave', async () => {
    await page.goto(base + '#faith/day/2');
    // set value + fire input without blurring, then change hash straight away (like hardware Back)
    await page.evaluate(() => {
      const ta = document.getElementById('dj');
      ta.focus();
      ta.value = 'quick note';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      location.hash = '#faith/today';
    });
    await page.waitForSelector('h1:text-is("Help my unbelief")');
    await page.goto(base + '#faith/day/2');
    assert.strictEqual(await page.inputValue('#dj'), 'quick note');
  });

  await step('finishing a day: banner, next day, no streak pressure', async () => {
    await page.goto(base + '#faith/today');
    await page.click('#finish');
    await page.waitForSelector('.done-banner');
    assert.ok((await page.textContent('.done-banner')).includes('You did day 1 today'));
    assert.strictEqual(await page.textContent('h1'), 'Out of the mouths of babies');
    assert.ok((await page.textContent('.psalm-title')).includes('A Psalm by David'));
    assert.ok(!(await page.textContent('#reading')).includes('Chief Musician; on an instrument of Gath. A Psalm by David. LORD'));
  });

  await step('guided prayer plays, pauses (time stands still), resumes and offers to mark the day done', async () => {
    await page.goto(base + '#faith/session/day/2');
    assert.ok(await page.isHidden('nav#tabs'));
    await page.click('#pp');
    await page.clock.runFor(1500);
    const first = await page.textContent('#line');
    assert.ok(/^(Let’s be still|Take a few quiet|Let’s slow down)/.test(first), first); // the opening is worded three ways by day
    await page.clock.runFor(60000);
    const mid = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).resume.step);
    assert.ok(mid >= 1, 'moved on: ' + mid);
    await page.click('#pp'); // pause
    assert.strictEqual(await page.textContent('#pp'), '▶ Resume');
    await page.clock.runFor(10 * 60000);
    const still = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).resume.step);
    assert.strictEqual(still, mid, 'nothing moves while paused');
    // skipping while paused resumes playback and re-enables keepAwake
    await page.evaluate(() => { window.__awake = []; const orig = WL.keepAwake; WL.keepAwake = (on) => { window.__awake.push(on); orig(on); }; });
    await page.click('#skip');
    assert.strictEqual(await page.textContent('#pp'), '⏸ Pause');
    assert.deepStrictEqual(await page.evaluate(() => window.__awake), [true], 'keepAwake re-enabled on skip from pause');
    await page.click('#pp'); // pause again
    await page.click('#pp'); // resume
    await page.clock.runFor(10 * 60000);
    await page.waitForSelector('#end-finish');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).resume), null);
    const spoken = await page.evaluate(() => window.__spoken);
    assert.ok(spoken.some((t) => t.includes('what is man, that you think of him?')), 'key verse spoken: ' + JSON.stringify(spoken));
    assert.ok(spoken.every((t) => !/\bLORD\b/.test(t)), 'LORD is said as Lord');
    await page.click('#end-finish');
    await page.waitForSelector('.done-banner');
    assert.strictEqual(await page.textContent('h1'), 'Beloved, then sent');
  });

  await step('Listen stops when you leave the screen', async () => {
    await page.goto(base + '#faith/day/3');
    await page.click('#listen');
    const before = await page.evaluate(() => window.__cancels || 0);
    await page.click('.subnav a[href="#faith/pray"]');
    await page.waitForSelector('h1:text-is("Pray now")');
    assert.ok(await page.evaluate(() => window.__cancels || 0) > before, 'speech cancelled on leaving');
  });

  await step('pausing in the first second (before the bell finishes) really pauses', async () => {
    await page.goto(base + '#faith/session/p/gratitude');
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.click('#pp');           // Begin
    await page.click('#pp');           // Pause at once
    await page.clock.runFor(5000);
    assert.deepStrictEqual(await page.evaluate(() => window.__spoken), []);
    assert.strictEqual(await page.textContent('#pp'), '\u25B6 Resume');
    await page.click('#pp');
    await page.clock.runFor(500);
    assert.strictEqual(await page.evaluate(() => window.__spoken.length), 1);
    assert.strictEqual(await page.textContent('#pp'), '\u23F8 Pause');
    await page.click('#end');
    // leaving during the 1.2 s bell delay cancels the old start timer so a newly opened session doesn't start early
    await page.goto(base + '#faith/session/p/gratitude');
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.click('#pp');
    await page.clock.runFor(900);
    await page.goto(base + '#faith/session/p/pause');
    await page.click('#pp');
    await page.clock.runFor(500); // 1400 ms after first #pp, only 500 ms after second #pp: must still wait for full 1200 ms bell
    assert.deepStrictEqual(await page.evaluate(() => window.__spoken), [], 'old bell timer did not start second session early');
    await page.clock.runFor(800);
    assert.strictEqual(await page.evaluate(() => window.__spoken.length), 1, 'second session starts after its own bell');
    await page.click('#end');
  });

  await step('after the end, \u23EE does not ring the end again or duplicate buttons', async () => {
    await page.goto(base + '#faith/session/day/5');
    await page.click('#pp');
    await page.clock.runFor(20 * 60000);
    await page.waitForSelector('#end-finish');
    await page.click('#back'); await page.click('#back');
    assert.strictEqual(await page.locator('#end-finish').count(), 1);
    await page.click('#end');
  });

  await step('stopping part way offers "Carry on" from the same step', async () => {
    await page.goto(base + '#faith/session/p/breath');
    await page.click('#pp');
    await page.clock.runFor(2000);
    // Space toggles pause and resume when focus is not on a button or input
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Space');
    assert.strictEqual(await page.getAttribute('#pp', 'data-state'), 'paused', 'Space pauses Faith session');
    await page.keyboard.press('Space');
    assert.strictEqual(await page.getAttribute('#pp', 'data-state'), 'playing', 'Space resumes Faith session');
    await page.click('#skip'); await page.click('#skip');
    await page.clock.runFor(500);
    const at = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).resume.step);
    assert.strictEqual(at, 2);
    await page.click('#end');
    await page.goto(base + '#faith/today');
    await page.waitForSelector('#resume');
    await page.click('#resume a');
    assert.strictEqual(await page.textContent('#pp'), '▶ Carry on');
    await page.click('#pp');
    await page.clock.runFor(1500);
    assert.ok((await page.textContent('#line')).startsWith('Breathe in: Lord Jesus Christ'));
    await page.click('#end');
    await page.goto(base + '#faith/today');
    await page.click('#forget-resume');
    assert.strictEqual(await page.$('#resume'), null);
    await page.reload();
    assert.strictEqual(await page.$('#resume'), null);
  });

  await step('Pray list: all practices, length choice remembered, Lectio uses today’s verse', async () => {
    await page.goto(base + '#faith/pray');
    assert.strictEqual(await page.locator('.list li').count(), 11);
    await page.click('[data-min="10"]');
    assert.strictEqual(await page.getAttribute('[data-min="10"]', 'aria-pressed'), 'true');
    await page.goto(base + '#faith/session/p/lectio');
    await page.click('#pp');
    await page.clock.runFor(1500);
    await page.click('#skip');
    await page.clock.runFor(200);
    assert.ok((await page.textContent('#line')).includes('You are my beloved Son'), 'day 3 verse');
    await page.click('#end');
  });

  await step('voice off: text-only sessions still move on by themselves', async () => {
    await page.goto(base + '#faith/pray');
    await page.click('#voice-toggle');
    await page.evaluate(() => { window.__spoken.length = 0; });
    await page.goto(base + '#faith/session/p/pause');
    await page.click('#pp');
    await page.clock.runFor(3 * 60000);
    assert.strictEqual(await page.textContent('#pp'), 'Done');
    assert.strictEqual((await page.evaluate(() => window.__spoken)).length, 0);
    await page.goto(base + '#faith/pray');
    // the finished practice gets a tick and a count for this week; one ended early (Lectio above) does not
    assert.ok(/1\u00d7 this week/.test(await page.textContent('a[href="#faith/session/p/pause"] h3')), 'pause ticked');
    assert.strictEqual(await page.$('a[href="#faith/session/p/lectio"] .done-week'), null);
    // the second time through, the guiding lines are worded differently (Scripture steps stay exact)
    await page.goto(base + '#faith/session/p/pause');
    await page.click('#pp'); await page.clock.runFor(300);
    const first = await page.textContent('#line');
    assert.ok(first && !first.startsWith('Stop where you are'), first);
    await page.click('#end');
    await page.goto(base + '#faith/pray');
    await page.click('#voice-toggle');
  });

  await step('journal: awe moment saved in its tab, delete needs two taps', async () => {
    await page.goto(base + '#faith/journal/awe');
    await page.fill('#new-entry', 'Stars over the bay at the 3am feed.');
    await page.click('#add-entry');
    assert.ok((await page.textContent('.list')).includes('Stars over the bay'));
    await page.goto(base + '#faith/journal');
    assert.ok((await page.textContent('.list')).includes('Awe moment'));
    await page.goto(base + '#faith/journal/awe');
    await page.click('.del');
    assert.ok((await page.textContent('.list')).includes('Stars'));
    await page.click('.del');
    assert.ok((await page.textContent('main')).includes('Nothing here yet'));
  });

  await step('journal search: with more than 5 entries, a search box filters them', async () => {
    await page.goto(base + '#faith/journal/gratitude');
    for (const x of ['the sunrise', 'her first laugh', 'a quiet coffee', 'friends dropping by soup', 'warm socks', 'a long nap']) { await page.fill('#new-entry', x); await page.click('#add-entry'); }
    await page.goto(base + '#faith/journal/gratitude');
    await page.fill('#j-search', 'LAUGH');
    assert.strictEqual(await page.locator('#j-list > li:not([hidden])').count(), 1);
    assert.ok(/1 found/.test(await page.textContent('#j-found')));
    await page.fill('#j-search', 'delete');
    assert.strictEqual(await page.locator('#j-list > li:not([hidden])').count(), 0, 'search ignores the Delete button label');
    await page.fill('#j-search', '');
    assert.strictEqual(await page.locator('#j-list > li:not([hidden])').count(), 6);
  });

  await step('journal "Written" tab: only written entries (not thanks or awe); saving there is a journal entry; unknown tab = All', async () => {
    await page.goto(base + '#faith/journal/journal');
    assert.strictEqual(await page.getAttribute('[data-jtab="journal"]', 'aria-selected'), 'true');
    assert.ok(!(await page.textContent('main')).includes('warm socks'), 'thanks are not in Written');
    await page.fill('#new-entry', 'A long day, but a good one.'); await page.click('#add-entry');
    assert.ok((await page.textContent('#j-list, .list')).includes('A long day'));
    const kinds = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')).journal.filter((e) => /A long day/.test(e.text)).map((e) => e.kind));
    assert.deepStrictEqual(kinds, ['journal']);
    await page.goto(base + '#faith/journal/gratitude');
    assert.ok(!(await page.textContent('main')).includes('A long day'));
    await page.goto(base + '#faith/journal/nonsense');
    assert.strictEqual(await page.getAttribute('[data-jtab="all"]', 'aria-selected'), 'true');
    assert.ok((await page.textContent('main')).includes('A long day') && (await page.textContent('main')).includes('warm socks'));
  });

  await step('prayer list: add, mark answered with a note', async () => {
    await page.goto(base + '#faith/journal/prayers');
    await page.fill('#new-prayer', 'Baby sleeping through');
    await page.press('#new-prayer', 'Enter');
    assert.ok((await page.textContent('main')).includes('Baby sleeping through'));
    // no system dialog (bright at 3am, and Cancel used to mark it answered anyway): an inline note with Save / Cancel
    let dialogs = 0; const onDialog = (d) => { dialogs++; d.dismiss(); }; page.on('dialog', onDialog);
    await page.click('.answered');
    await page.click('.ans-cancel');
    assert.ok(!(await page.textContent('main')).includes('Looking back'), 'Cancel leaves the prayer open');
    assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('answered')), 'Cancel restores focus to Answered / let go');
    // Escape in .ans-form closes the form without marking the prayer answered and restores focus
    await page.click('.answered');
    await page.fill('.ans-note', 'not saving');
    await page.press('.ans-note', 'Escape');
    assert.strictEqual(await page.locator('.ans-form').count(), 0, 'Escape closed .ans-form');
    assert.ok(!(await page.textContent('main')).includes('Looking back'), 'Escape leaves prayer open');
    assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('answered')), 'Escape restores focus to Answered / let go');
    await page.click('.answered');
    await page.fill('.ans-note', 'She did, twice!');
    await page.click('.ans-save');
    assert.ok((await page.textContent('main')).includes('She did, twice!'));
    assert.ok((await page.textContent('main')).includes('Looking back'));
    page.off('dialog', onDialog);
    assert.strictEqual(dialogs, 0, 'no browser dialog');
    // undo moves an answered prayer back to Praying for
    await page.click('.p-undo');
    assert.ok(!(await page.textContent('main')).includes('Looking back'), 'moved back out of Looking back');
    assert.ok((await page.textContent('main')).includes('Baby sleeping through'), 'still in Praying for');
    // with 6+ prayers, search filters both open and answered prayers without matching button labels and hides empty section cards
    await page.click('.answered'); await page.fill('.ans-note', 'slept 7 hours'); await page.click('.ans-save');
    for (const p of ['Patience at bedtime', 'My wife’s rest', 'Grandparents health', 'Work focus', 'Sunday church visit']) {
      await page.fill('#new-prayer', p); await page.press('#new-prayer', 'Enter');
    }
    await page.waitForSelector('#p-search');
    await page.fill('#p-search', 'church');
    assert.strictEqual(await page.locator('.p-list > li:not([hidden])').count(), 1);
    assert.strictEqual(await page.locator('#p-open-card').isHidden(), false, 'Praying for card stays visible on open hit');
    assert.strictEqual(await page.locator('#p-ans-card').isHidden(), true, 'Looking back card hides when 0 answered hits');
    assert.ok(/1 found/.test(await page.textContent('#p-found')));
    await page.fill('#p-search', '7 hours');
    assert.strictEqual(await page.locator('.p-list > li:not([hidden])').count(), 1, 'matches answered prayer note');
    assert.strictEqual(await page.locator('#p-open-card').isHidden(), true, 'Praying for card hides when 0 open hits');
    assert.strictEqual(await page.locator('#p-ans-card').isHidden(), false, 'Looking back card stays visible on answered hit');
    await page.fill('#p-search', 'delete');
    assert.strictEqual(await page.locator('.p-list > li:not([hidden])').count(), 0, 'ignores action button labels');
    assert.strictEqual(await page.locator('#p-open-card').isHidden(), true, 'Praying for card hides on 0 total hits');
    assert.strictEqual(await page.locator('#p-ans-card').isHidden(), true, 'Looking back card hides on 0 total hits');
    await page.fill('#p-search', '');
    assert.strictEqual(await page.locator('.p-list > li:not([hidden])').count(), 6);
    assert.strictEqual(await page.locator('#p-open-card').isHidden(), false, 'Praying for card reappears when search cleared');
    assert.strictEqual(await page.locator('#p-ans-card').isHidden(), false, 'Looking back card reappears when search cleared');
  });

  await step('settings: night theme, text size; auto turns night on at 9pm', async () => {
    await page.goto(base + '#settings');
    await page.click('[data-look="theme"][data-val="night"]');
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'night');
    await page.click('[data-look="textSize"][data-val="1.3"]');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--size').trim()), '1.3');
    await page.click('[data-look="theme"][data-val="auto"]');
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'light');
    await page.clock.runFor(11.5 * 3600e3); // 21:30
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'night');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.strictEqual(bg, 'rgb(0, 0, 0)');
  });

  await step('backup: save a file, restore it into a fresh phone', async () => {
    await page.goto(base + '#settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#wl-export')]);
    const file = path.join(os.tmpdir(), 'fc-backup-test.json');
    await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.app, 'wellness');
    const fc = JSON.parse(data.stores['fc.v1']);
    assert.ok(fc.done[1] && fc.done[2]);
    const p2 = await ctx.browser().newPage();
    await p2.addInitScript(FAKE_SPEECH);
    await p2.goto(base + '#settings');
    p2.on('dialog', (d) => d.accept());
    await p2.setInputFiles('#wl-import', file);
    await p2.waitForFunction(() => document.getElementById('toast').textContent === 'Backup restored');
    await p2.goto(base + '#faith/path');
    assert.strictEqual(await p2.locator('.tick').count(), 2);
    await p2.goto(base + '#settings');
    await p2.setInputFiles('#wl-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await p2.waitForFunction(() => document.getElementById('toast').textContent.includes('not a backup from this app'));
    // a backup saved by the old Faith Companion app still restores
    const old = JSON.stringify({ app: 'faith-companion', state: { done: { 1: '2026-11-18', 2: '2026-11-18', 3: '2026-11-19' }, journal: [], prayers: [], settings: {} } });
    await p2.setInputFiles('#wl-import', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(old) });
    await p2.waitForFunction(() => document.getElementById('toast').textContent === 'Backup restored');
    await p2.goto(base + '#faith/path');
    assert.strictEqual(await p2.locator('.tick').count(), 3);
    await p2.close();
  });

  await step('path lists every day; any day can be opened; back button works', async () => {
    await page.goto(base + '#faith/path');
    assert.strictEqual(await page.locator('.list li').count(), (await page.evaluate(() => window.FC_CONTENT.days.length)));
    await page.click('a[href="#faith/day/8"]');
    await page.waitForSelector('h1:text-is("Only believe")');
    assert.ok((await page.textContent('#reading')).includes('Talitha cumi!'));
    assert.ok((await page.textContent('#reading')).includes('Mark 5:35-43'));
    await page.goBack();
    await page.waitForSelector('h1:text-is("The path")');
    assert.strictEqual(await page.$('#path-jump'), null, 'no jump chip during Week 1');
    // once past Week 1 (days 1-7 done), Jump to Day 8 appears and targets #path-cur
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('fc.v1'));
      for (let i = 1; i <= 7; i++) s.done[i] = '2026-11-18';
      localStorage.setItem('fc.v1', JSON.stringify(s));
      window.FC.reload();
    });
    await page.goto(base + '#faith/more'); await page.goto(base + '#faith/path');
    await page.waitForSelector('#path-jump');
    assert.strictEqual(await page.textContent('#path-jump'), 'Jump to Day 8');
    assert.ok((await page.textContent('#path-cur')).includes('Day 8'));
    await page.click('#path-jump');
    // restore days 3-7 undone so subsequent steps see the same state
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('fc.v1'));
      for (let i = 3; i <= 7; i++) delete s.done[i];
      localStorage.setItem('fc.v1', JSON.stringify(s));
      window.FC.reload();
    });
  });

  await step('a double-tap on "I’ve spent time with today" leaves the day done; "Mark as not done" still works after', async () => {
    await page.goto(base + '#faith/day/9');
    await page.click('#finish'); await page.click('#undone', { timeout: 2000 }); // second tap lands on the link
    assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem('fc.v1')).done[9]), 'still done');
    await page.clock.runFor(1000);
    await page.click('#undone');
    assert.ok(await page.evaluate(() => !JSON.parse(localStorage.getItem('fc.v1')).done[9]), 'undone on purpose');
  });

  await step('look-back day shows the week’s writing', async () => {
    await page.goto(base + '#faith/day/7');
    assert.ok((await page.textContent('main')).includes('Your week'));
    assert.ok((await page.textContent('main')).includes('I want God to be real to me.'));
  });

  await step('after day 120: "walk it again" starts at day 1 and shows last time’s answer', async () => {
    const ctx4 = await browser.newContext({ viewport: { width: 360, height: 760 } }); // own storage
    const p4 = await ctx4.newPage();
    p4.on('pageerror', (e) => errors.push(String(e)));
    await p4.addInitScript(FAKE_SPEECH);
    // set the saved state before the app loads (a reload would save the open page's state over it on pagehide)
    await p4.addInitScript(() => {
      if (localStorage.getItem('fc.v1')) return;
      const done = {}; for (let k = 1; k <= 120; k++) done[k] = '2026-12-01';
      localStorage.setItem('fc.v1', JSON.stringify({ version: 1, started: '2026-11-18', done, journal: [
        { id: 'a', at: '2026-11-18T15:00:00.000Z', day: 1, kind: 'journal', text: 'I want to believe.', dayAnswer: true }], prayers: [] }));
    });
    await p4.goto(base + '#faith/today');
    await p4.waitForSelector('#walk-again', { timeout: 3000 }).catch(async () => { throw new Error('no walk-again: ' + (await p4.textContent('main')).slice(0, 200)); });
    assert.ok((await p4.textContent('h1')).includes('walked the whole path'));
    await p4.click('#walk-again');
    assert.ok((await p4.textContent('#walk-again')).includes('Tap again'), 'first tap only arms it');
    await p4.click('#walk-again');
    await p4.waitForSelector('h1:text-is("Help my unbelief")');
    assert.ok((await p4.textContent('#write')).includes('I want to believe.'), 'last time’s answer shown');
    assert.strictEqual(await p4.inputValue('#dj'), '', 'this walk’s answer starts empty');
    const st = await p4.evaluate(() => JSON.parse(localStorage.getItem('fc.v1')));
    assert.strictEqual(st.round, 2);
    assert.strictEqual(Object.keys(st.pastRounds[0].done).length, 120);
    await p4.goto(base + '#faith/path');
    assert.ok((await p4.textContent('main')).includes('second walk'));
    const over = await p4.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0);
    await ctx4.close();
  });

  await step('storage blocked (private mode): the app still opens', async () => {
    const p3 = await ctx.newPage();
    await p3.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const errs = [];
    p3.on('pageerror', (e) => errs.push(String(e)));
    await p3.goto(base + '#faith/today');
    await p3.waitForSelector('h1');
    assert.deepStrictEqual(errs, []);
    await p3.close();
  });

  await step('no errors in the console', async () => {
    assert.deepStrictEqual(errors, []);
  });

  await browser.close();
  srv.close();
  console.log(passed + ' browser tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
