/* How big the phone's saved data gets: 120 days (his parental leave) of heavy daily use through the real cores, all
   stores together, must stay well under the WebView's localStorage quota (about 5 million characters per app), and
   the logs that are capped stay capped after a year. (A refused save is shown on Home: tests/e2e-savefail.cjs.) */
'use strict';
const assert = require('assert');
const { simulate } = require('./lib/year.cjs');
const sizes = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, JSON.stringify(v).length]));
const total = (z) => Object.values(z).reduce((a, b) => a + b, 0);
const z120 = sizes(simulate(120));
console.log('120 days:', JSON.stringify(z120), 'total', total(z120));
assert.ok(total(z120) < 2500000, 'under half the quota after 120 days: ' + total(z120));
const s365 = simulate(365);
assert.ok(s365['wl.tagalog.v1'].answers.length <= 2000 && s365['wl.tagalog.v1'].reviews.length <= 2000, 'Tagalog logs capped');
assert.ok(s365['wl.coach.v1'].history.length <= 300, 'coach history capped');
assert.ok(s365['wl.me.v1'].feedback.length <= 600, 'quick answers capped');
const z365 = sizes(s365);
console.log('365 days total', total(z365), 'calm', z365['wl.calm.v1']);
assert.ok(z365['wl.calm.v1'] < 400000, 'a year of Calm (3 a day incl. a rated sit) stays small: ' + z365['wl.calm.v1']);
assert.ok(total(z365) < 4000000, 'a year of everything stays under the quota: ' + total(z365));
// the backup / Drive sync file has the same stores as JSON strings: a year must stay well under what the phone reads
// back from Drive (Sync.MAX_READ_BYTES, 16 MB) and quick to write
const backup = JSON.stringify({ app: 'wellness', exported: new Date().toISOString(), stores: Object.fromEntries(Object.entries(s365).map(([k, v]) => [k, JSON.stringify(v)])), requests: [], acked: [] });
console.log('a year as a backup/sync file:', backup.length, 'chars');
assert.ok(Buffer.byteLength(backup, 'utf8') < 4 * 1024 * 1024, 'backup of a year < 4 MB: ' + Buffer.byteLength(backup, 'utf8'));
console.log('storage size checks passed');
