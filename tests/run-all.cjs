#!/usr/bin/env node
/* Runs every test suite. In the cloud: NODE_PATH=$(npm root -g) node tests/run-all.cjs
   On a PC without Playwright the browser suite is skipped (says so). */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
// Each module keeps its own tests in modules/<id>/tests/: unit*.cjs (also run in two other time zones),
// e2e*.cjs (need Playwright), anything else plain. Then the shell's own tests here in tests/.
const suites = [];
for (const m of fs.readdirSync(path.join(ROOT, 'modules')).sort()) {
  const dir = path.join('modules', m, 'tests');
  if (!fs.existsSync(path.join(ROOT, dir))) continue;
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.cjs')).sort()) {
    const name = m + ' ' + f.replace('.cjs', ''), file = path.join(dir, f);
    if (f.startsWith('e2e')) suites.push([name, file, 'playwright']);
    else {
      suites.push([name, file]);
      if (f.startsWith('unit')) {
        suites.push([name + ' (New York time)', file, null, { TZ: 'America/New_York' }]);
        suites.push([name + ' (Manila time)', file, null, { TZ: 'Asia/Manila' }]);
      }
    }
  }
}
for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.cjs') && f !== 'run-all.cjs').sort()) {
  suites.push(['shell ' + f.replace('.cjs', ''), path.join('tests', f), f.startsWith('e2e') ? 'playwright' : null]);
}
let failed = 0, ran = 0;
for (const [name, file, needs, env] of suites) {
  if (needs) { try { require.resolve(needs); } catch (e) { console.log('-- ' + name + ': skipped (' + needs + ' not installed)'); continue; } }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', file)], { encoding: 'utf8', timeout: 300000, env: Object.assign({}, process.env, env || {}) });
  ran++;
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (!ok) console.log((r.stdout || '').slice(-3000) + (r.stderr || '').slice(-3000));
}
console.log(failed ? failed + ' of ' + ran + ' suites failed' : 'all ' + ran + ' suites passed');
process.exit(failed ? 1 : 0);
