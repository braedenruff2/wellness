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
assert.ok(s365['wl.tagalog.v1'].answers.length <= 1000 && s365['wl.tagalog.v1'].reviews.length <= 600, 'Tagalog logs capped');
assert.ok(s365['wl.coach.v1'].history.length <= 300, 'coach history capped');
assert.ok(s365['wl.me.v1'].feedback.length <= 600, 'quick answers capped');
const z365 = sizes(s365);
console.log('365 days total', total(z365), 'calm', z365['wl.calm.v1']);
assert.ok(z365['wl.calm.v1'] < 400000, 'a year of Calm (3 a day incl. a rated sit) stays small: ' + z365['wl.calm.v1']);
assert.ok(total(z365) < 4000000, 'a year of everything stays under the quota: ' + total(z365));
// his own words (quick answers, sits, check-in notes, 600 characters each, every day) and the autopilot's replies stay bounded
assert.ok(s365['wl.calm.v1'].sessions.filter((x) => x.note).length <= 200, 'sit notes: only the newest 200 kept');
assert.ok(s365['wl.calm.v1'].sessions.slice(-200).every((x) => x.id !== 'count' || x.note), 'the newest sits keep theirs');
assert.ok(Object.keys(s365['wl.me.v1'].checkins).length <= 120, 'check-ins (with notes) capped at 120 days');
assert.ok(s365['wl.notes.v1'].notes.every((x) => !x.reply || x.reply.length <= 300), 'replies at most 300 characters');
const y2 = simulate(730), s730 = sizes(y2);
console.log('730 days:', JSON.stringify(s730), 'total', total(s730));
assert.ok(total(s730) < 4500000, 'two years of heavy daily use stays under 4.5M chars (WebView ~5M quota): ' + total(s730));
assert.strictEqual(y2['fc.v1'].journal.length, 730, 'his own journal writing is never dropped');
for (const k of ['wl.me.v1', 'wl.notes.v1', 'wl.calm.v1', 'wl.workout.v1']) assert.ok(s730[k] < 1.25 * Math.max(z365[k], 1) + 50000, k + ': a second year adds little (bounded): ' + z365[k] + ' -> ' + s730[k]);
const sitWords = (st) => st.sessions.reduce((a, x) => a + (x.note ? x.note.length : 0), 0);
assert.ok(sitWords(y2['wl.calm.v1']) <= 200 * 600, 'sit notes after two years: at most 200 x 600 characters: ' + sitWords(y2['wl.calm.v1']));
// the backup / Drive sync file has the same stores as JSON strings: a year must stay well under what the phone reads
// back from Drive (Sync.MAX_READ_BYTES, 16 MB) and quick to write
const backup = JSON.stringify({ app: 'wellness', exported: new Date().toISOString(), stores: Object.fromEntries(Object.entries(s365).map(([k, v]) => [k, JSON.stringify(v)])), requests: [], acked: [] });
console.log('a year as a backup/sync file:', backup.length, 'chars');
assert.ok(Buffer.byteLength(backup, 'utf8') < 4 * 1024 * 1024, 'backup of a year < 4 MB: ' + Buffer.byteLength(backup, 'utf8'));
// to-dos: done ones older than 30 days go when the app starts (todo.js tidyNow), so a year of daily errands stays small
const TD = require('../app/www/modules/todo/todo-core.js');
const td = JSON.parse(JSON.stringify(s365['wl.todo.v1'])); TD.tidy(td, new Date(2026, 10, 18 + 364, 20, 0));
const end = new Date(2026, 10, 18 + 364, 20, 0).getTime();
assert.ok(td.tasks.filter((x) => x.done).every((x) => end - Date.parse(x.done) <= 30 * 864e5), 'only the last 30 days of done tasks are kept');
assert.ok(JSON.stringify(td).length < JSON.stringify(s365['wl.todo.v1']).length / 2, 'tidy at least halves a year of to-dos: ' + JSON.stringify(td).length);
assert.ok(td.tasks.some((x) => x.repeat === 'weekly') && td.tasks.some((x) => x.repeat === 'monthly'), 'repeats are never tidied away');
console.log('storage size checks passed');
