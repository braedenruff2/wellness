#!/usr/bin/env node
/* Notification ids and the request codes of PendingIntents that open MainActivity must not be shared between
   classes: Android treats two PendingIntents with the same request code and the same target (extras don't count)
   as one, so FLAG_UPDATE_CURRENT in one class rewrites the other's (a to-do reminder would open Calm), and a shared
   notification id makes one class replace or cancel the other's notification. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const DIR = path.join(__dirname, '..', 'android', 'src', 'app', 'faithcompanion');

const notifOwners = {}, openOwners = {};
const add = (map, key, who) => { (map[key] = map[key] || new Set()).add(who); };
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.java'))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8'), who = f.replace('.java', '');
  // int constants (static final int A = 9, B = 10;) so ids written as names are checked too
  const k = {};
  for (const d of src.matchAll(/static final int ([^;]+);/g)) {
    for (const part of d[1].split(',')) { const m = part.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(\d+)$/); if (m) k[m[1]] = m[2]; }
  }
  const val = (x) => (/^\d+$/.test(x) ? x : k[x]);
  for (const m of src.matchAll(/\bnm\.notify\((\w+)\s*,/g)) if (val(m[1])) add(notifOwners, val(m[1]), who);
  for (const m of src.matchAll(/NOTIFICATION_SERVICE\)\)\.cancel\((\w+)\)/g)) if (val(m[1])) add(notifOwners, val(m[1]), who);
  // Intents built as new Intent(c, MainActivity.class) and handed to getActivity with a literal request code
  const toMain = new Set([...src.matchAll(/Intent\s+(\w+)\s*=\s*new Intent\(\w+,\s*MainActivity\.class\)/g)].map((m) => m[1]));
  for (const m of src.matchAll(/PendingIntent\.getActivity\(\w+,\s*(\w+),\s*(\w+)/g)) {
    if (toMain.has(m[2]) && val(m[1])) add(openOwners, val(m[1]), who);
  }
}
let checked = 0;
for (const [id, who] of Object.entries(notifOwners)) {
  checked++;
  assert.strictEqual(who.size, 1, 'notification id ' + id + ' is used by ' + [...who].join(' and '));
}
for (const [code, who] of Object.entries(openOwners)) {
  checked++;
  assert.strictEqual(who.size, 1, 'PendingIntent request code ' + code + ' (opens MainActivity) is used by ' + [...who].join(' and '));
}
assert.ok(notifOwners['5'] && notifOwners['5'].has('RestAlarm'), 'the scan found RestAlarm\'s notification');
assert.ok(Object.values(notifOwners).some((w) => w.has('CalmAlarm')), 'ids written as constants are found (CalmAlarm)');
assert.ok(Object.values(openOwners).some((w) => w.has('CalmAlarm')), 'CalmAlarm\'s tap intent is found');
assert.ok(Object.keys(openOwners).length >= 4, 'the scan found the notification tap intents');
console.log('android ids ok (' + checked + ' ids checked)');
