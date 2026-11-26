/* Checking for new lessons on a bad connection: a Wi-Fi sign-in page (HTML) instead of index.json, a cut-off pack,
   a pack that is a sign-in page, or a server error. The lessons already there stay, nothing broken is saved, the
   message says what happened in plain words, and the next check tries again. */
'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const Wb = require('../../../tests/lib/web.cjs');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'packs', '2026-11-18.json'), 'utf8'));
const NX = '2099-12-30';
const next = JSON.parse(JSON.stringify(pack)); next.id = NX; next.title = 'Week two test';
const RAW = 'https://raw.githubusercontent.com/test/wellness/main/modules/tagalog/packs/';
const mode = { index: 'portal', pack: 'ok' };
const PORTAL = '<!doctype html><html><body><h1>Welcome to Café Wi-Fi</h1><form>Accept terms</form></body></html>';
(async () => {
  const t = await Wb.open({ time: new Date(2026, 10, 26, 10, 0), routes: [[RAW + '**', (route) => {
    const u = route.request().url();
    if (u.endsWith('index.json')) {
      if (mode.index === 'portal') return route.fulfill({ status: 200, contentType: 'text/html', body: PORTAL });
      if (mode.index === '500') return route.fulfill({ status: 500, body: 'oops' });
      if (mode.index === 'null') return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return route.fulfill({ json: { packs: ['2026-11-18', NX], hashes: {} } });
    }
    if (u.endsWith(NX + '.json')) {
      if (mode.pack === 'cut') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next).slice(0, 500) });
      if (mode.pack === 'portal') return route.fulfill({ status: 200, contentType: 'text/html', body: PORTAL });
      return route.fulfill({ json: next });
    }
    return route.fulfill({ status: 404, body: '' });
  }]] });
  const { page, base } = t;
  await page.goto(base + '#tagalog');
  await page.evaluate((src) => { const s = JSON.parse(localStorage.getItem('wl.tagalog.v1') || 'null') || {}; s.source = src; s.packs = s.packs || {}; s.done = s.done || {}; s.cards = s.cards || {}; s.answers = s.answers || []; localStorage.setItem('wl.tagalog.v1', JSON.stringify(s)); }, RAW);
  await page.reload();
  const toast = () => page.textContent('#toast');
  const check = async () => { await page.goto(base + '#tagalog/settings'); await page.waitForSelector('#tl-fetch'); await page.click('#tl-fetch'); await page.waitForTimeout(300); return toast(); };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('wl.tagalog.v1')));
  await t.step('a Wi-Fi sign-in page instead of the lessons index: plain message, lessons kept', async () => {
    const msg = await check();
    assert.ok(/Couldn’t get new lessons \(the answer wasn’t lessons: does this Wi-Fi need a sign-in\?\)\. Your lessons are all still here\./.test(msg), msg);
    assert.deepStrictEqual(Object.keys((await store()).packs), []);
    await page.goto(base + '#tagalog'); assert.ok((await page.textContent('main')).includes('Po, opo and greeting elders'), 'the bundled week still there');
  });
  await t.step('a server error and an index that is null: the same, nothing saved', async () => {
    mode.index = '500'; assert.ok(/HTTP 500/.test(await check()));
    mode.index = 'null'; assert.ok(/sign-in/.test(await check()));
    assert.deepStrictEqual(Object.keys((await store()).packs), []);
  });
  await t.step('a cut-off pack, or a pack that is a sign-in page: not saved, and tried again next time', async () => {
    mode.index = 'ok'; mode.pack = 'cut';
    assert.ok(/No new lessons yet/.test(await check()));
    assert.ok(!(await store()).packs[NX], 'cut-off pack not kept');
    mode.pack = 'portal';
    assert.ok(/No new lessons yet/.test(await check()));
    assert.ok(!(await store()).packs[NX]);
    mode.pack = 'ok';
    assert.ok(/1 new week of lessons/.test(await check()), 'the next good connection gets it');
    assert.strictEqual((await store()).packs[NX].title, 'Week two test');
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('tagalog bad connection');
})().catch((e) => { console.error(e); process.exit(1); });
