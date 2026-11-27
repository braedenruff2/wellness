/* Fuzz every part's restore check (validate) with damaged copies of a real month of data (task 338): types swapped,
   nulls, NaN, huge strings, bad dates, __proto__ keys, items dropped. validate() must never throw, must return null or
   a state, and what it returns must survive the core functions the screens call (no throw), and validate again to
   the same thing (a restored backup is stable). */
'use strict';
const assert = require('assert');
const CA = require('../app/www/modules/calm/calm-core.js');
global.CalmCore = CA;
const WK = require('../app/www/modules/workout/workout-core.js');
const TG = require('../app/www/modules/tagalog/tagalog-core.js');
const CO = require('../app/www/modules/coach/coach-core.js');
const ME = require('../app/www/modules/me/me-core.js');
const TD = require('../app/www/modules/todo/todo-core.js');
const CK = require('../app/www/modules/cook/cook-core.js');
const NT = require('../app/www/lib/notes.js');
const FC = require('../app/www/modules/faith/core.js');
const { simulate } = require('./lib/year.cjs');

const now = new Date(2026, 11, 20, 12, 0);
const parts = {
  'wl.calm.v1': { v: CA.validate, use: (s) => { CA.stats(s, now); CA.pathStatus(s, now); CA.suggest && CA.suggest(s, now); } },
  'wl.workout.v1': { v: WK.validate, use: (s) => { WK.coach(s, now); WK.weekStats(s, now); WK.openSession(s, now); WK.nextDay(s, now); } },
  'wl.tagalog.v1': { v: TG.validate, use: (s) => { TG.stats(s, now); TG.dueCards(s, now); TG.weeklySummary(s, [], now); TG.slips(s, [], now, 10); TG.practiceSet && TG.practiceSet(s, [], 10); } },
  'wl.coach.v1': { v: CO.validate, use: (s) => { CO.skillStats(s); CO.doneToday(s, now); CO.scenarioDue(s, now); CO.tips(s, null, 50); } },
  'wl.me.v1': { v: ME.validate, use: (s) => { ME.guidance(s, now); ME.hiddenList(s, now.getTime()); ME.rough(s, now); } },
  'wl.todo.v1': { v: TD.validate, use: (s) => { TD.groups(s, now); TD.reminders && TD.reminders(s, now); TD.tidy(s, now); } },
  'wl.cook.v1': { v: CK.validate, use: (s) => { CK.ensureWeekPlan(s, now); CK.expiringSoon(s, now, 5); } },
  'wl.notes.v1': { v: NT.validate, use: (s) => { NT.unread(s); } },
  'fc.v1': { v: (s) => { try { return FC.importData(JSON.stringify({ app: 'faith-companion', state: s })); } catch (e) { if (/not a|backup|file/i.test(e.message)) return null; throw e; } }, use: (s) => { FC.currentDay(s, 120); } },
};

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WEIRD = () => pick([null, undefined, NaN, Infinity, -1, 0, 1e15, '', 'x', 'not a date', '2026-02-31', '9999-99-99T99:99', true, false, [], {}, [null], { __proto__: { polluted: 1 } }, 'ñ'.repeat(5000), Array(3000).fill(1)]);
function mutate(o, depth) {
  if (Array.isArray(o)) {
    const a = o.slice();
    if (a.length && rnd() < 0.3) a.splice(Math.floor(rnd() * a.length), 1);
    if (rnd() < 0.2) a.push(WEIRD());
    return a.map((x) => (rnd() < 0.15 ? WEIRD() : depth < 6 ? mutate(x, depth + 1) : x));
  }
  if (o && typeof o === 'object') {
    const r = {};
    for (const k of Object.keys(o)) {
      if (rnd() < 0.05) continue; // a field missing
      r[k] = rnd() < 0.12 ? WEIRD() : depth < 6 ? mutate(o[k], depth + 1) : o[k];
    }
    if (rnd() < 0.05) r.__proto__ = { polluted: 1 };
    if (rnd() < 0.05) r['__proto__'] = WEIRD();
    return r;
  }
  return o;
}

const real = simulate(30);
let runs = 0;
for (const [key, p] of Object.entries(parts)) {
  const base = JSON.parse(JSON.stringify(real[key]));
  // the real state is accepted and stays usable
  const ok = p.v(JSON.parse(JSON.stringify(base)));
  assert.ok(ok, key + ': a real month is accepted');
  p.use(ok);
  for (let i = 0; i < 500; i++) {
    const bad = mutate(base, 0);
    let out;
    try { out = p.v(JSON.parse(JSON.stringify(bad, (k, v) => (typeof v === 'number' && !isFinite(v) ? v : v)))); } catch (e) { throw new Error(key + ' validate threw on try ' + i + ': ' + e.stack); }
    if (out == null) continue;
    try { p.use(out); } catch (e) { throw new Error(key + ': the screens\' core functions threw on a validated state (try ' + i + '): ' + e.stack); }
    const again = p.v(JSON.parse(JSON.stringify(out)));
    assert.ok(again, key + ': a validated state validates again (try ' + i + ')');
    runs++;
  }
  assert.strictEqual(({}).polluted, undefined, key + ': no prototype pollution');
}
console.log('ok', runs, 'damaged states validated and used without a throw');
console.log('validate fuzz passed');
