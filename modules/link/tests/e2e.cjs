/* PC link and parenting coach in the browser, with a stand-in for the Android side (window.FCAndroid.pcRequest)
   that behaves like the PC server: pair, sync the activity log, Claude jobs that take a couple of polls. */
'use strict';
const assert = require('assert');
const W = require('../../../tests/lib/web.cjs');
const FAKE_PC = `
  (function () {
    var load = function () { try { return JSON.parse(localStorage.getItem('__pc')) || null; } catch (e) { return null; } };
    var pc = load() || { paired: false, posts: [], asks: [] };
    var save = function () { localStorage.setItem('__pc', JSON.stringify(pc)); };
    var ANSWERS = {
      'coach-scenario': { title: 'Teething at 3am', skill: 'Crying and comfort', scenario: 'It is 3am and Kid wakes up screaming, chewing her fist.', question: 'What do you do and say?' },
      'coach-grade': { score: 7, verdict: 'Kind and calm.', good: ['You stayed calm'], improve: ['Offer a cold teether'], better: 'Pick her up, name it, offer a cold teether.', why: 'Co-regulation.', practice: 'Name her feelings.', sources: [{ title: 'HealthyChildren', url: 'https://www.healthychildren.org/teething' }] },
      'coach-advice': { title: 'Car seat screaming', skill: 'Crying and comfort', summary: 'Common at 11 months: she wants to move.', steps: ['Warn her before', 'Give a car-only toy', 'Sing the same song'], say: ['Seat time, then we go see the ducks.'], avoid: ['Rushing her in'], why: 'Predictability helps.', watch: '', sources: [{ title: 'Caring for Kids', url: 'https://caringforkids.cps.ca/' }] },
      'tagalog-check': { ok: false, corrected: 'Salamat po', meaning: 'Thank you (polite)', explain: 'Add po for elders.', tip: 'po = respect' },
      'advice': { headline: 'A steady week.', points: ['Keep the morning prayer', 'One more calm session'], next: 'Stroller walk after lunch.' }
    };
    window.FCAndroid = {
      pcStatus: function () { return JSON.stringify(pc.paired ? { paired: true, host: '192.168.1.20', name: 'BRAEDEN-PC' } : { paired: false }); },
      pcRequest: function (id, op, a, b) {
        var ok = true, out = '';
        if (op === 'find') out = JSON.stringify([{ host: '192.168.1.20', port: 8780, name: 'BRAEDEN-PC' }]);
        else if (op === 'pair') { if (b.replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== 'ABCDEFGHJKMN') { ok = false; out = "wrong code (or that's not your PC)"; } else { pc.paired = true; out = '{"paired":true}'; } }
        else if (op === 'forget') { pc.paired = false; out = '{}'; }
        else if (op === 'post' && a === '/v1/activity') { var o = JSON.parse(b); pc.posts.push(o); out = JSON.stringify({ saved: o.events.length, got: o.events.length }); }
        else if (op === 'post' && a === '/v1/ask') { pc.asks.push(JSON.parse(b)); out = JSON.stringify({ job: 'j' + pc.asks.length }); }
        else if (op === 'get' && a.indexOf('/v1/job') === 0) { var k = pc.asks[+a.split('=j')[1] - 1]; k.polls = (k.polls || 0) + 1; out = JSON.stringify(k.polls < 2 ? { state: 'running' } : { state: 'done', answer: ANSWERS[k.task] }); }
        else if (op === 'get' && a === '/v1/health') out = '{"app":"wellness","claude":true}';
        else { ok = false; out = 'not found'; }
        save();
        Promise.resolve().then(function () { window.FCPcDone(id, ok, out); });
      }
    };
    var up = { version: '0.1.old', code: 1, ready: false, readyName: '', allowed: false, busy: false, checked: 0, error: '', from: '' };
    window.FCAndroid.updateStatus = function () { return JSON.stringify(up); };
    window.FCAndroid.updateCheck = function () { up.busy = true; setTimeout(function () { up.busy = false; up.ready = true; up.readyName = '0.1.new'; up.checked = Date.now(); window.FCUpdateState(); }, 0); };
    window.FCAndroid.updateAllow = function () { up.allowed = true; };
    window.FCAndroid.updateInstall = function () { window.__installed = true; };
    window.FCAndroid.setBusy = function (b) { (window.__busy = window.__busy || []).push(b); };
    var vs = { english: 'nice', tagalog: 'nice', pcVoice: true, sid: 6, kokoro: 'missing', tagalogVoice: 'missing', downloading: '', progress: '', error: '', last: '',
      speakers: [{ sid: 6, name: 'Nicole (soft, calm)' }, { sid: 3, name: 'Heart' }] };
    window.FCAndroid.voiceStatus = function () { return JSON.stringify(vs); };
    window.FCAndroid.voiceSet = function (k, v) { (window.__vset = window.__vset || []).push([k, v]); if (k === 'sid') vs.sid = +v; else if (k === 'pcVoice') vs.pcVoice = v === 'true'; else vs[k] = v; };
    window.FCAndroid.voiceDownload = function (p) { vs.downloading = p; vs.progress = '40%'; setTimeout(function () { vs.downloading = ''; vs[p === 'kokoro' ? 'kokoro' : 'tagalogVoice'] = 'ready'; window.FCVoiceState(); }, 0); };
    window.__fakepc = function () { return pc; };
  })();
`;
(async () => {
  const t = await W.open({ time: new Date(2026, 10, 19, 10, 0) });
  const { page, base } = t;
  await page.addInitScript(FAKE_PC);
  const fake = () => page.evaluate(() => window.__fakepc());
  await page.goto(base + '#todo');
  await t.step('things done before pairing are listed as not sent yet', async () => {
    await page.fill('#td-new', 'call Mom today'); await page.press('#td-new', 'Enter');
    await page.click('li:has-text("call Mom") [data-tick]');
    await page.goto(base + '#link');
    const txt = await page.textContent('main');
    assert.ok(txt.includes('To do: added “call Mom”') && txt.includes('To do: done “call Mom”'), txt);
    assert.ok(txt.includes('2 not sent yet'), txt);
  });
  await t.step('pair: find the PC, a wrong code is refused, the right one pairs and sends the log', async () => {
    await page.click('#lk-find');
    await page.waitForSelector('[data-host]');
    assert.strictEqual(await page.inputValue('#lk-host'), '192.168.1.20');
    await page.fill('#lk-code', 'AAAA-BBBB-CCCC'); await page.click('#lk-pair');
    await page.waitForSelector('#lk-msg.no');
    assert.ok((await page.textContent('#lk-msg')).includes('wrong code'));
    await page.fill('#lk-code', 'abcd-efgh-jkmn'); await page.click('#lk-pair');
    await page.waitForSelector('text=Paired with BRAEDEN-PC');
    await page.waitForFunction(() => window.__fakepc().posts.length >= 1);
    const posts = (await fake()).posts;
    assert.strictEqual(posts[0].events.length, 2);
    assert.ok(posts[0].tagalogWeek && Array.isArray(posts[0].tagalogWeek.lessonsDone), 'Tagalog week goes along');
    await page.goto(base + '#link');
    assert.ok((await page.textContent('main')).includes('0 not sent yet'));
  });
  await t.step('new activity is sent once (Send now), never twice', async () => {
    await page.goto(base + '#todo');
    await page.fill('#td-new', 'buy diapers'); await page.press('#td-new', 'Enter');
    await page.goto(base + '#link');
    await page.click('#lk-sync');
    await page.waitForSelector('text=Last sent: just now (1 new)');
    await page.click('#lk-sync');
    await page.waitForSelector('text=Last sent: just now (0 new)');
    const posts = (await fake()).posts;
    assert.deepStrictEqual(posts.map((p) => p.events.length), [2, 1], 'no empty or repeat posts: ' + posts.map((p) => p.events.length));
  });
  await t.step('journal text only when switched on', async () => {
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('fc.v1') || '{}'); s.journal = [{ id: 'j1', at: new Date().toISOString(), kind: 'awe', text: 'Secret sunrise', day: null }]; s.done = s.done || {}; localStorage.setItem('fc.v1', JSON.stringify(s)); window.FC.reload(); });
    await page.goto(base + '#link');
    await page.click('#lk-sync'); await page.waitForFunction(() => window.__fakepc().posts.length === 3);
    let last = (await fake()).posts[2];
    assert.ok(last.events.some((e) => e.kind === 'awe') && !JSON.stringify(last).includes('Secret sunrise'));
    await page.check('#lk-jt');
    assert.ok((await page.textContent('main')).includes('Secret sunrise'), 'shown in the list when on');
    await page.click('#lk-sync'); await page.waitForFunction(() => window.__fakepc().posts.length === 4);
    last = (await fake()).posts[3];
    assert.ok(JSON.stringify(last).includes('Secret sunrise'), 'sent with text once switched on');
  });
  await t.step('a lot of long journal text goes in batches the PC accepts', async () => {
    const before = (await fake()).posts.length;
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('fc.v1')); for (let i = 0; i < 150; i++) s.journal.push({ id: 'big' + i, at: new Date(Date.now() - i * 60000).toISOString(), kind: 'journal', text: 'word '.repeat(700), day: null }); localStorage.setItem('fc.v1', JSON.stringify(s)); window.FC.reload(); });
    await page.click('#lk-sync');
    await page.waitForSelector('text=(150 new)');
    const posts = (await fake()).posts.slice(before);
    assert.ok(posts.length >= 3, 'several batches: ' + posts.length);
    for (const p of posts) assert.ok(JSON.stringify(p).length < 210000, 'batch size ' + JSON.stringify(p).length);
    assert.strictEqual(posts.reduce((a, p) => a + p.events.length, 0), 150);
  });
  await t.step('advice from Claude on the PC, from Home', async () => {
    await page.goto(base + '#home');
    const card = page.locator('.home-card[data-module="link"]');
    await card.locator('[data-advice]').click();
    await page.waitForSelector('text=Claude is thinking');
    await page.clock.runFor(3500);
    await page.waitForSelector('text=A steady week.');
    assert.ok((await card.textContent()).includes('Stroller walk after lunch.'));
    await page.reload(); await page.waitForSelector('.home-card[data-module="link"]');
    assert.ok((await page.locator('.home-card[data-module="link"]').textContent()).includes('A steady week.'), 'kept');
  });
  await t.step('parenting: setup, scenario for her age, answer, feedback, progress', async () => {
    await page.click('nav#tabs a[data-tab="coach"]');
    await page.fill('#co-name', 'Kid'); await page.fill('#co-birth', '2025-11-24'); await page.click('#co-save');
    assert.ok((await page.textContent('main')).includes('Kid is 11 months old'));
    await page.click('[data-skill="Sleep"]');
    await page.click('#co-new');
    await page.waitForSelector('text=Claude is writing a scenario');
    await page.clock.runFor(3500);
    await page.waitForSelector('text=Teething at 3am');
    const ask = (await fake()).asks.slice(-1)[0];
    assert.deepStrictEqual([ask.task, ask.input.child, ask.input.age, ask.input.skill], ['coach-scenario', 'Kid', '11 months old', 'Sleep']);
    await page.fill('#co-answer', 'short'); await page.click('#co-grade');
    assert.strictEqual((await fake()).asks.length, 2, 'too short: not sent');
    await page.fill('#co-answer', 'I pick her up, stay calm and give her something cold to chew.');
    await page.reload(); await page.waitForSelector('#co-answer');
    assert.ok((await page.inputValue('#co-answer')).includes('stay calm'), 'answer draft kept');
    await page.click('#co-grade');
    await page.waitForSelector('text=Claude is checking');
    await page.clock.runFor(3500);
    await page.waitForSelector('text=What an expert would do');
    const txt = await page.textContent('main');
    assert.ok(txt.includes('7/10') && txt.includes('Offer a cold teether') && txt.includes('HealthyChildren'), txt.slice(0, 400));
    await page.goto(base + '#coach');
    assert.ok((await page.textContent('main')).includes('recent 7/10'));
    assert.ok((await page.textContent('#co-tips')).includes('Name her feelings.'), 'this week\'s tip listed');
    await page.goto(base + '#home');
    assert.ok((await page.textContent('.home-card[data-module="coach"]')).includes('Try this week: Name her feelings.'), 'tip on Home');
    await page.goto(base + '#coach');
    await page.waitForFunction(() => window.__fakepc().posts.some((p) => p.events.some((e) => e.part === 'coach')));
  });
  await t.step('a Claude request carries on after leaving the screen', async () => {
    await page.click('#co-new');
    await page.waitForSelector('text=Claude is writing');
    await page.goto(base + '#home');
    await page.clock.runFor(3500);
    await page.goto(base + '#coach');
    await page.waitForSelector('#co-answer');
  });
  await t.step('parenting: his own real situation gets advice, then can be practised as a scenario', async () => {
    await page.goto(base + '#coach');
    await page.fill('#co-real', 'too short'); await page.click('#co-real-go');
    const n = (await fake()).asks.length;
    assert.ok((await page.textContent('#toast')).includes('a bit more'));
    await page.fill('#co-real', 'She screams every time I put her in the car seat since last week. I tried a toy.');
    await page.reload(); await page.waitForSelector('#co-real');
    assert.ok((await page.inputValue('#co-real')).includes('car seat'), 'draft kept');
    await page.click('#co-real-go');
    await page.waitForSelector('text=checking current guidance for your situation');
    const ask = (await fake()).asks.slice(-1)[0];
    assert.strictEqual((await fake()).asks.length, n + 1);
    assert.deepStrictEqual([ask.task, ask.input.child, ask.input.age], ['coach-advice', 'Kid', '11 months old']);
    assert.ok(ask.input.situation.includes('car seat'));
    await page.clock.runFor(3500);
    await page.waitForSelector('text=What to do');
    const txt = await page.textContent('main');
    assert.ok(txt.includes('Car seat screaming') && txt.includes('Give a car-only toy') && txt.includes('ducks') && txt.includes('Caring for Kids'), txt.slice(0, 300));
    await page.click('#co-practise');
    await page.waitForSelector('#co-answer');
    const main = await page.textContent('main');
    assert.ok(main.includes('Next time this happens') && main.includes('screams every time'), 'his situation is now the scenario');
    assert.ok(main.includes('your situation'), 'listed in past practice');
    assert.strictEqual(await page.inputValue('#co-real'), '', 'draft cleared');
    await page.waitForFunction(() => window.__fakepc().posts.some((p) => p.events.some((e) => e.kind === 'advice')));
  });
  await t.step('Tagalog: a wrong typed answer can be checked by Claude', async () => {
    const id = await page.evaluate(() => (window.TL_PACKS || [])[0] && window.TL_PACKS[0].id);
    const lesson = await page.evaluate(() => window.TL_PACKS[0].lessons.find((l) => l.exercises.some((x) => x.type === 'type')));
    await page.goto(base + '#tagalog/l/' + id + '/' + lesson.day);
    await page.waitForSelector('main');
    for (const ex of lesson.exercises) {
      await page.waitForSelector('#tl-ex .meta');
      if (ex.type === 'type') break;
      if (ex.type === 'mc' || ex.type === 'listen') await page.click(`#tl-ex [data-o="${ex.answer.replace(/"/g, '\\"')}"]`);
      if (ex.type === 'build') { for (const w of ex.answer.split(' ')) await page.click(`#tl-ex .word:not([disabled]):text-is("${w}")`); await page.click('#tl-check'); }
      await page.click('#tl-next');
    }
    await page.fill('#tl-in', 'salamt'); await page.click('#tl-check');
    await page.click('#tl-ask');
    await page.clock.runFor(3500);
    await page.waitForSelector('text=Add po for elders.');
    const a = (await fake()).asks.slice(-1)[0];
    assert.strictEqual(a.task, 'tagalog-check'); assert.strictEqual(a.input.answer, 'salamt');
  });
  await t.step('app updates: allow once, check, update now; a guided session tells Android it is busy', async () => {
    await page.goto(base + '#settings');
    assert.ok((await page.textContent('#wl-update')).includes('Version 0.1.old'));
    await page.click('#wl-allow');
    await page.click('#wl-check');
    await page.clock.runFor(50);
    await page.waitForSelector('text=Version 0.1.new is downloaded');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.click('#wl-install');
    assert.ok(await page.evaluate(() => window.__installed));
    await page.goto(base + '#calm');
    await page.evaluate(() => { document.body.classList.add('in-session'); });
    await page.evaluate(() => { document.body.classList.remove('in-session'); });
    await page.waitForFunction(() => (window.__busy || []).includes(true) && window.__busy[window.__busy.length - 1] === false);
  });
  await t.step('voice: Loudbook\'s voices and the Filipino voice, download once, choose, hear', async () => {
    await page.goto(base + '#settings');
    const card = () => page.textContent('#wl-voice');
    assert.ok((await card()).includes('Kokoro: not downloaded yet') && (await card()).includes('Filipino voice: not downloaded yet'));
    await page.click('#wl-dl-kokoro');
    await page.clock.runFor(400);
    await page.waitForFunction(() => document.getElementById('wl-voice').textContent.includes('Kokoro: ready'));
    await page.click('#wl-dl-tagalog');
    await page.clock.runFor(400);
    await page.waitForFunction(() => document.getElementById('wl-voice').textContent.includes('Filipino voice: ready'));
    await page.selectOption('#wl-sid', '3');
    await page.uncheck('#wl-pcv');
    await page.click('[data-voice="tagalog"][data-val="phone"]');
    const set = await page.evaluate(() => window.__vset);
    assert.deepStrictEqual(set, [['sid', '3'], ['pcVoice', 'false'], ['tagalog', 'phone']]);
    assert.strictEqual(await page.getAttribute('[data-voice="tagalog"][data-val="phone"]', 'aria-pressed'), 'true');
    await page.evaluate(() => { window.__spoken = []; });
    await page.click('#wl-hear-tl');
    const said = await page.evaluate(() => window.__spoken);
    assert.ok(said.some((s) => s.lang === 'fil-PH' && /Magandang umaga/.test(s.text)), JSON.stringify(said));
  });
  await t.step('unpair needs two taps', async () => {
    await page.goto(base + '#link');
    await page.click('#lk-forget'); await page.click('#lk-forget');
    await page.waitForSelector('#lk-find');
  });
  await t.step('no overflow, no console errors', async () => {
    await t.noOverflow(['#link', '#coach', '#home']);
    assert.deepStrictEqual(t.errors, []);
  });
  await t.close('PC link browser');
})().catch((e) => { console.error(e); process.exit(1); });
