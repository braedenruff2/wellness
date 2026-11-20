/* Shared date helpers (app/www/lib/dates.js). Also run in New York and Manila time by spawning itself. */
'use strict';
const assert = require('assert');
const D = require('../app/www/lib/dates.js');
assert.strictEqual(D.iso(new Date(2026, 0, 5)), '2026-01-05');
assert.strictEqual(D.iso(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
assert.strictEqual(D.iso(new Date(2026, 10, 21, 0, 1)), '2026-11-21');
assert.strictEqual(D.iso(), D.iso(new Date()));
assert.strictEqual(D.addDays('2026-01-31', 1), '2026-02-01');
assert.strictEqual(D.addDays('2026-03-01', -1), '2026-02-28');
assert.strictEqual(D.addDays('2028-02-28', 1), '2028-02-29');
assert.strictEqual(D.addDays('2026-12-31', 1), '2027-01-01');
assert.strictEqual(D.addDays('2026-03-07', 1), '2026-03-08'); // US clocks spring forward 8 Mar 2026
assert.strictEqual(D.addDays('2026-03-08', 1), '2026-03-09');
assert.strictEqual(D.addDays('2026-11-01', 1), '2026-11-02'); // and fall back 1 Nov
assert.strictEqual(D.addDays('2026-11-20', -365), '2025-11-20');
for (let i = -400; i <= 400; i += 7) { const a = D.addDays('2026-11-20', i); assert.strictEqual(D.addDays(a, -i), '2026-11-20', a); }
if (!process.env.__DATES_CHILD) {
  const { spawnSync } = require('child_process');
  for (const tz of ['America/New_York', 'Asia/Manila', 'America/Halifax']) {
    const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { TZ: tz, __DATES_CHILD: '1' }), encoding: 'utf8' });
    assert.strictEqual(r.status, 0, tz + ': ' + r.stderr);
  }
  console.log('date helpers ok (4 time zones)');
}
