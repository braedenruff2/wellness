/* When the phone refuses a save (storage full), the app says so once and shows it on Home and in Settings until a save
   works again; nothing breaks. */
'use strict';
const assert = require('assert');
const Wb = require('./lib/web.cjs');
(async () => {
  const t = await Wb.open();
  const { page, base } = t;
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (window.__full && k !== 'wl.shell.v1') { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
      return orig.call(this, k, v);
    };
  });
  await page.goto(base + '#todo'); await page.waitForSelector('#td-new');
  await t.step('a normal save: no warning', async () => {
    await page.fill('#td-new', 'call Mom'); await page.click('#td-form button[type=submit]');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-savefail'), null);
  });
  await t.step('storage full: one toast, a card on Home and in Settings; the task still shows for now', async () => {
    await page.goto(base + '#todo'); await page.waitForSelector('#td-new');
    await page.evaluate(() => { window.__full = true; });
    await page.fill('#td-new', 'buy diapers'); await page.click('#td-form button[type=submit]');
    await page.clock.runFor(50);
    assert.ok(/Couldn’t save on this phone/.test(await page.textContent('#toast')), await page.textContent('#toast'));
    assert.ok((await page.textContent('main')).includes('buy diapers'));
    await page.fill('#td-new', 'bins'); await page.click('#td-form button[type=submit]'); await page.clock.runFor(50);
    assert.ok(!/Couldn’t save/.test(await page.textContent('#toast')), 'only once per session');
    await page.goto(base + '#home'); await page.waitForSelector('#wl-savefail');
    assert.ok(/couldn’t be saved/.test(await page.textContent('#wl-savefail')));
    await page.goto(base + '#settings'); await page.waitForSelector('#wl-savefail-s');
  });
  await t.step('storage works again: the next save of that part clears it', async () => {
    await page.evaluate(() => { window.__full = false; });
    await page.goto(base + '#todo'); await page.waitForSelector('#td-new');
    await page.fill('#td-new', 'stretch'); await page.click('#td-form button[type=submit]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wl.todo.v1')).tasks.map((x) => x.text));
    assert.ok(saved.includes('buy diapers') && saved.includes('stretch'), JSON.stringify(saved));
    await page.goto(base + '#home'); await page.waitForSelector('#wl-today');
    assert.strictEqual(await page.$('#wl-savefail'), null);
  });
  await t.step('no errors', async () => { assert.deepStrictEqual(t.errors, []); });
  await t.close('save failure');
})().catch((e) => { console.error(e); process.exit(1); });
