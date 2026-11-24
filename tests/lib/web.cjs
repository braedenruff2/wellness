/* Shared helpers for browser tests: serve app/www, open a phone-sized page with fake speech and a fixed clock. */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const WWW = path.join(__dirname, '..', '..', 'app', 'www');

function serve() {
  return new Promise((res) => {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WWW, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
      if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

const FAKE_SPEECH = `
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 50); }, cancel() { window.__cancels = (window.__cancels || 0) + 1; } } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
`;

async function open(opts = {}) {
  const { chromium } = require('playwright');
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctxOpts = { viewport: { width: 360, height: 760 }, acceptDownloads: true };
  if (opts.timezoneId) ctxOpts.timezoneId = opts.timezoneId;
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); }); // a missing lessons repo is expected
  await page.addInitScript(FAKE_SPEECH);
  // tests never touch the internet: anything off this machine gets a 404 unless a test routes it
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 404, body: '' }));
  if (opts.routes) for (const [pattern, fn] of opts.routes) await page.route(pattern, fn);
  await page.clock.install({ time: opts.time || new Date(2026, 10, 18, 10, 0) });
  let passed = 0;
  return {
    base, page, ctx, browser, errors,
    async step(name, f) { console.log('..', name); await f(); passed++; console.log('ok', name); },
    async close(label) { await browser.close(); srv.close(); console.log(passed + ' ' + (label || 'browser') + ' tests passed'); },
    async noOverflow(hashes) {
      for (const h of hashes) {
        await page.goto(base + h);
        await page.waitForTimeout(30);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 0) throw new Error(h + ' overflows by ' + over + 'px');
      }
    }
  };
}
module.exports = { serve, open, FAKE_SPEECH, WWW };
