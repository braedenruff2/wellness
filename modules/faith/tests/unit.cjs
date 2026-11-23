/* Unit tests for app/www/core.js (no browser). node tests/unit.cjs */
'use strict';
const assert = require('assert');
const C = require('../../../app/www/modules/faith/core.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

function memStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; }

t('store: defaults, round trip, bad JSON, new settings merged', () => {
  const ms = memStorage(), st = C.makeStore(ms);
  const s = st.load();
  assert.strictEqual(s.settings.minutes, 5);
  s.done[1] = '2026-11-18'; st.save(s);
  assert.strictEqual(st.load().done[1], '2026-11-18');
  ms.setItem(st.key, '{not json'); assert.deepStrictEqual(st.load().done, {});
  ms.setItem(st.key, JSON.stringify({ done: { 2: 'x' }, settings: { minutes: 10 } }));
  const l = st.load();
  assert.strictEqual(l.settings.minutes, 10); assert.strictEqual(l.settings.voice, true); assert.ok(Array.isArray(l.journal));
  ms.setItem(st.key, 'null'); assert.deepStrictEqual(st.load().done, {});
});

t('store: storage that throws (private mode) keeps working in memory', () => {
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const st = C.makeStore(bad); const s = st.load(); s.done[3] = 'd';
  assert.strictEqual(st.save(s), false);
  assert.strictEqual(st.load().done[3], 'd');
});

t('currentDay: first unfinished day, never punished for gaps', () => {
  const s = C.defaults();
  assert.strictEqual(C.currentDay(s, 14), 1);
  C.finishDay(s, 1, new Date(2026, 10, 18)); C.finishDay(s, 2, new Date(2026, 10, 25));
  assert.strictEqual(C.currentDay(s, 14), 3);
  C.finishDay(s, 5); assert.strictEqual(C.currentDay(s, 14), 3);
  for (let i = 1; i <= 14; i++) C.finishDay(s, i);
  assert.strictEqual(C.currentDay(s, 14), 15);
  C.unfinishDay(s, 7); assert.strictEqual(C.currentDay(s, 14), 7);
  assert.strictEqual(s.done[1], '2026-11-18'); // finishing again keeps the first date
  C.finishDay(s, 1, new Date(2027, 0, 1)); assert.strictEqual(s.done[1], '2026-11-18');
});

t('finishedToday and daysShowedUp', () => {
  const s = C.defaults(), d = new Date(2026, 10, 18, 23, 59);
  C.finishDay(s, 4, d);
  assert.strictEqual(C.finishedToday(s, d), 4);
  assert.strictEqual(C.finishedToday(s, new Date(2026, 10, 19, 0, 1)), 0);
  // two days done today: the banner names the latest one (it said "day 3" after doing 3 and 4)
  C.finishDay(s, 3, d); C.finishDay(s, 5, d);
  assert.strictEqual(C.finishedToday(s, d), 5);
  C.unfinishDay(s, 3); C.unfinishDay(s, 5);
  C.addEntry(s, 'awe', 'stars', null, new Date(2026, 10, 20, 12));
  assert.strictEqual(C.daysShowedUp(s), 2);
});

t('isoDate uses the local calendar date (late evening is still today)', () => {
  assert.strictEqual(C.isoDate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  assert.strictEqual(C.isoDate(new Date(2026, 11, 31, 0, 5)), '2026-12-31');
});

t('day journal: create, edit, empty removes, one per day', () => {
  const s = C.defaults();
  C.setDayJournal(s, 3, 'first');
  C.setDayJournal(s, 3, 'second');
  assert.strictEqual(C.dayJournal(s, 3), 'second');
  assert.strictEqual(s.journal.length, 1);
  C.addEntry(s, 'journal', 'free note', 3); // a free entry on the same day is separate
  assert.strictEqual(C.dayJournal(s, 3), 'second');
  C.setDayJournal(s, 3, '   ');
  assert.strictEqual(C.dayJournal(s, 3), '');
  assert.strictEqual(s.journal.length, 1);
  assert.strictEqual(C.addEntry(s, 'awe', '  '), null);
});

t('entries and prayers: ids unique, newest first, remove', () => {
  const s = C.defaults(), when = new Date(2026, 10, 18);
  const a = C.addEntry(s, 'awe', 'a', null, when), b = C.addEntry(s, 'awe', 'b', null, when);
  assert.notStrictEqual(a.id, b.id); assert.strictEqual(s.journal[0], b);
  C.removeEntry(s, a.id); assert.deepStrictEqual(s.journal.map((e) => e.text), ['b']);
  assert.strictEqual(C.addPrayer(s, ''), null);
  C.addPrayer(s, 'Baby’s sleep'); assert.strictEqual(s.prayers[0].answered, null);
});

t('lookBack finds an entry from about a week / month ago', () => {
  const s = C.defaults(), now = new Date(2026, 11, 20, 12);
  assert.strictEqual(C.lookBack(s, now), null);
  C.addEntry(s, 'journal', 'yesterday', null, new Date(2026, 11, 19));
  assert.strictEqual(C.lookBack(s, now), null);
  C.addEntry(s, 'journal', 'week', null, new Date(2026, 11, 13, 10));
  assert.strictEqual(C.lookBack(s, now).entry.text, 'week');
  C.addEntry(s, 'journal', 'month', null, new Date(2026, 10, 21));
  const lb = C.lookBack(s, now); assert.strictEqual(lb.days, 30); assert.strictEqual(lb.entry.text, 'month');
});

t('soundsHeavy: gentle check only on strong words', () => {
  assert.ok(C.soundsHeavy('I feel hopeless lately'));
  assert.ok(C.soundsHeavy("I can't cope with this"));
  assert.ok(!C.soundsHeavy('Tired but grateful. The baby smiled.'));
  assert.ok(!C.soundsHeavy('the storm in the story'));
  assert.ok(!C.soundsHeavy(''));
});

t('scaleScript: stretches quiet towards the chosen length, keeps speech', () => {
  const steps = [{ say: 'one two three four five', wait: 40 }, { say: 'six seven', wait: 60 }, { say: 'end', wait: 0 }];
  for (const m of [2, 5, 10]) {
    const sc = C.scaleScript(steps, m, 1), len = C.scriptLength(sc, 1);
    assert.ok(Math.abs(len - m * 60) < m * 60 * 0.1, m + ' min -> ' + len);
    assert.strictEqual(sc[2].wait, 0);
    assert.strictEqual(sc[0].say, steps[0].say);
  }
  // very long text: quiet shrinks but never vanishes
  const long = [{ say: 'word '.repeat(2000), wait: 10 }, { say: 'x', wait: 5 }];
  assert.ok(C.scaleScript(long, 2, 1).every((s) => s.wait >= 2));
});

/* Player with fake time */
function fakeEnv(log) {
  let now = 0, id = 0; const timers = new Map(); let speakingDone = null;
  const env = {
    log, speech: [],
    speak(text, done) { env.speech.push(text); speakingDone = done; },
    stopSpeech() { speakingDone = null; log.push('stop'); },
    setTimeout(f, ms) { timers.set(++id, { f, at: now + ms }); return id; },
    clearTimeout(i) { timers.delete(i); },
    now: () => now,
    onStep(i) { log.push('step' + i); },
    onEnd() { log.push('end'); },
    finishSpeech() { const d = speakingDone; speakingDone = null; if (d) d(); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of timers) if (v.at <= target && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].f();
      }
      now = target;
    },
    pending: () => timers.size
  };
  return env;
}

t('Player: plays steps in order, waits quiet, ends', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 2 }, { say: 'b', wait: 0 }], env);
  p.start();
  assert.deepStrictEqual(log, ['step0']);
  env.finishSpeech(); assert.strictEqual(p.phase, 'quiet');
  env.advance(1999); assert.strictEqual(p.i, 0);
  env.advance(1); assert.strictEqual(p.i, 1);
  env.finishSpeech(); env.advance(0);
  assert.deepStrictEqual(log, ['step0', 'step1', 'end']);
  assert.strictEqual(p.phase, 'ended');
});

t('Player: time paused is counted (logged minutes leave it out), also when ⏭ ends the pause', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 10 }, { say: 'b', wait: 10 }, { say: 'c', wait: 0 }], env);
  p.start(); env.finishSpeech(); env.advance(2000);
  p.pause(); env.advance(40 * 60000); p.resume();
  assert.strictEqual(p.pausedMs, 40 * 60000);
  p.pause(); env.advance(5000); p.skip();
  assert.strictEqual(p.pausedMs, 40 * 60000 + 5000); assert.strictEqual(p.i, 1);
});

t('Player: "Carry on" from step 3, then ⏭ / ⏮ / End before it began keep the place', () => {
  const steps = [0, 1, 2, 3, 4, 5].map((i) => ({ say: 's' + i, wait: 1 }));
  const a = new C.Player(steps, fakeEnv([])); a.from = 3;
  a.skip(); assert.strictEqual(a.i, 4, 'skip goes to the step after the one it would start at (was: step 0)');
  const b = new C.Player(steps, fakeEnv([])); b.from = 3; b.pause(); b.back();
  assert.strictEqual(b.i, 2);
  const c = new C.Player(steps, fakeEnv([])); c.from = 3;
  assert.strictEqual(c.place(), 3, 'End before it began keeps step 3 (was: 0)');
  c.pause(); assert.strictEqual(c.place(), 3);
  c.resume(); assert.strictEqual(c.i, 3); assert.strictEqual(c.place(), 3);
});

t('daysShowedUp also counts guided prayers and new prayer-list items', () => {
  const s = C.defaults();
  C.logSession(s, 'practice', 'pause', 'Pause', 1, new Date(2026, 10, 18, 9));
  C.addPrayer(s, 'for my family', new Date(2026, 10, 19, 9));
  assert.strictEqual(C.daysShowedUp(s), 2);
});

t('Player: pause during quiet keeps the time left', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 10 }, { say: 'b', wait: 0 }], env);
  p.start(); env.finishSpeech(); env.advance(4000);
  p.pause(); assert.strictEqual(p.phase, 'paused');
  env.advance(60000); assert.strictEqual(p.i, 0, 'nothing moves while paused');
  p.resume(); env.advance(5999); assert.strictEqual(p.i, 0);
  env.advance(1); assert.strictEqual(p.i, 1);
});

t('Player: pause while speaking repeats the sentence on resume; a late "done" from the old speech is ignored', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 3 }, { say: 'b', wait: 0 }], env);
  p.start();
  const oldDone = (() => { let d; const orig = env.speak; env.speak = (t, f) => { d = f; orig(t, f); }; return () => d; })();
  p.pause(); assert.strictEqual(p.phase, 'paused');
  p.resume(); assert.deepStrictEqual(env.speech, ['a', 'a']);
  void oldDone;
  env.finishSpeech(); env.advance(3000); assert.strictEqual(p.i, 1);
});

t('Player: stale speech callback after skip does not double-advance', () => {
  const log = [], env = fakeEnv(log);
  let first = null;
  const p = new C.Player([{ say: 'a', wait: 1 }, { say: 'b', wait: 5 }, { say: 'c', wait: 0 }], env);
  const orig = env.speak; env.speak = (t, d) => { if (!first) first = d; orig(t, d); };
  p.start(); p.skip(); assert.strictEqual(p.i, 1);
  first(); // the cancelled speech of "a" reports done late
  assert.strictEqual(p.phase, 'speaking'); assert.strictEqual(p.i, 1);
  env.advance(10000); assert.strictEqual(p.i, 1);
});

t('Player: back, skip to the end, start part way, double pause/resume are safe', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 1 }, { say: 'b', wait: 1 }, { say: 'c', wait: 1 }], env);
  p.start(2); assert.strictEqual(p.i, 2);
  p.back(); assert.strictEqual(p.i, 1);
  p.pause(); p.pause(); p.resume(); p.resume(); assert.strictEqual(p.phase, 'speaking');
  p.skip(); p.skip(); assert.strictEqual(p.phase, 'ended');
  p.skip(); p.resume(); assert.strictEqual(p.phase, 'ended');
  assert.strictEqual(log.filter((x) => x === 'end').length, 1);
  const e2 = fakeEnv([]), p2 = new C.Player([{ say: '', wait: 0 }], e2); p2.start(); e2.advance(0); assert.strictEqual(p2.phase, 'ended');
});

t('export/import round trip; foreign files refused', () => {
  const s = C.defaults(); C.finishDay(s, 1); C.addEntry(s, 'awe', 'sea');
  const back = C.importData(C.exportData(s));
  assert.deepStrictEqual(back.done, s.done); assert.strictEqual(back.journal[0].text, 'sea');
  assert.throws(() => C.importData('{"app":"other"}'));
  assert.throws(() => C.importData('nope'));
});

t('themeFor: auto is night from 21:00 to 06:00', () => {
  const st = { theme: 'auto' };
  assert.strictEqual(C.themeFor(st, new Date(2026, 1, 1, 20, 59)), 'light');
  assert.strictEqual(C.themeFor(st, new Date(2026, 1, 1, 21, 0)), 'night');
  assert.strictEqual(C.themeFor(st, new Date(2026, 1, 1, 5, 59)), 'night');
  assert.strictEqual(C.themeFor(st, new Date(2026, 1, 1, 6, 0)), 'light');
  assert.strictEqual(C.themeFor({ theme: 'dark' }, new Date(2026, 1, 1, 3)), 'dark');
});

t('dayScript uses the day’s own words', () => {
  const d = { keyVerse: 'KV', prayer: 'PR', practice: 'PRAC', sitWith: 'SIT' };
  const sc = C.dayScript(d).map((s) => s.say).join('|');
  assert.ok(sc.includes('KV') && sc.includes('PR') && sc.includes('PRAC') && sc.includes('SIT'));
});

t('guided prayer: guiding lines worded three ways (by day), same steps and timing; the day’s own words exact', () => {
  const d = { n: 4, keyVerse: 'KV', prayer: 'PR', practice: 'PRAC' };
  const a = C.dayScript(d, 0), b = C.dayScript(d, 1), c = C.dayScript(d, 2), again = C.dayScript(d, 3);
  assert.deepStrictEqual(a.map((s) => s.wait), b.map((s) => s.wait)); assert.deepStrictEqual(a.map((s) => s.wait), c.map((s) => s.wait));
  for (const i of [0, 1, 2, 4, 5, 7, 9]) assert.ok(a[i].say !== b[i].say && b[i].say !== c[i].say && a[i].say !== c[i].say, 'step ' + i);
  assert.deepStrictEqual(again.map((s) => s.say), a.map((s) => s.say), 'wraps');
  for (const sc of [a, b, c]) { assert.strictEqual(sc[3].say, 'KV'); assert.strictEqual(sc[6].say, 'PR'); assert.ok(sc[8].say.endsWith('PRAC')); }
  assert.deepStrictEqual(C.dayScript(d).map((s) => s.say), C.dayScript(d, 4).map((s) => s.say), 'default: by day number');
  assert.ok(C.dayScript({ keyVerse: 'K', prayer: 'P', practice: 'Q' })[0].say.length > 10, 'no day number: first wording');
  // never speaks as God: guiding lines talk about God, not as God
  const all = [a, b, c].flat().map((s) => s.say).join(' ');
  assert.ok(!/\b(I am your God|I love you, my child|says the Lord)\b/i.test(all));
});

t('guided prayer names up to two open prayer-list items in the "others" step', () => {
  const d = { n: 1, keyVerse: 'K', prayer: 'P', practice: 'Q' };
  assert.ok(!/prayer list/.test(C.dayScript(d, 0, [])[7].say));
  const s = C.dayScript(d, 0, ['Mom’s surgery', 'a friend\nlooking for work', 'third'])[7].say;
  assert.ok(/On your prayer list: Mom’s surgery; and a friend looking for work\.$/.test(s), s);
});

t('Player: back after the end does not end twice (bell, duplicate buttons)', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 0 }], env);
  p.start(); env.finishSpeech(); env.advance(0);
  assert.strictEqual(p.phase, 'ended');
  p.back(); p.back(); env.advance(1000);
  assert.strictEqual(log.filter((x) => x === 'end').length, 1);
  const q = new C.Player([{ say: 'a', wait: 0 }], fakeEnv([])); q.back(); assert.strictEqual(q.phase, 'idle');
});

t('Player: paused before it began stays paused, Resume starts at the chosen step', () => {
  const log = [], env = fakeEnv(log);
  const p = new C.Player([{ say: 'a', wait: 1 }, { say: 'b', wait: 1 }, { say: 'c', wait: 0 }], env);
  p.from = 1;
  p.pause(); assert.strictEqual(p.phase, 'paused');
  if (p.phase === 'idle') p.start(); // the delayed start in app.js only starts an idle player
  assert.deepStrictEqual(env.speech, []);
  p.resume(); assert.strictEqual(p.i, 1); assert.deepStrictEqual(env.speech, ['b']);
});

t('daysShowedUp and doneInLast use local calendar dates (evening use west of UTC)', () => {
  const s = C.defaults(), eve = new Date(2026, 10, 18, 21, 30);
  C.finishDay(s, 1, eve); C.addEntry(s, 'journal', 'x', 1, eve);
  assert.strictEqual(C.daysShowedUp(s), 1, 'TZ=' + process.env.TZ);
  const now = new Date(2026, 10, 25, 8);
  C.finishDay(s, 2, new Date(2026, 10, 19, 0, 30));  // 7 days back incl. today: 19..25
  C.finishDay(s, 3, new Date(2026, 10, 25, 7));
  assert.strictEqual(C.doneInLast(s, 7, now), 2);
  assert.strictEqual(C.doneInLast(s, 1, now), 1);
});

t('importData: checks every field; markup or junk in settings is dropped; null done refused', () => {
  const bad = JSON.stringify({ app: 'faith-companion', state: {
    done: { 1: '2026-11-18', x: 'y', 2: '<b>' }, settings: { minutes: '<img src=x onerror=alert(1)>', theme: 'evil', rate: 99, voice: false },
    journal: [{ id: 'a', at: '2026-11-18T10:00:00Z', kind: 'awe', text: 'sea' }, { text: 5 }, null, { at: 'nope', text: 'x' }],
    prayers: [{ at: '2026-11-18T10:00:00Z', text: 'p', answered: 'garbage' }], resume: { step: '<x>' } } });
  const s = C.importData(bad);
  assert.deepStrictEqual(s.done, { 1: '2026-11-18' });
  assert.strictEqual(s.settings.minutes, 5); assert.strictEqual(s.settings.theme, 'auto'); assert.strictEqual(s.settings.rate, 0.9);
  assert.strictEqual(s.settings.voice, false);
  assert.strictEqual(s.journal.length, 1); assert.strictEqual(s.prayers[0].answered, null);
  assert.strictEqual(s.resume, null);
  assert.throws(() => C.importData(JSON.stringify({ app: 'faith-companion', state: { done: null } })));
  assert.throws(() => C.importData(JSON.stringify({ app: 'faith-companion', state: { done: [] } })));
});

t('walk it again: day 1 again, old answers kept and shown as "last time", new answers separate', () => {
  const s = C.defaults(), d1 = new Date(2026, 10, 18, 9), d2 = new Date(2027, 2, 20, 9);
  for (let k = 1; k <= 120; k++) C.finishDay(s, k, d1);
  C.setDayJournal(s, 1, 'first time: mostly questions', d1);
  assert.strictEqual(C.currentDay(s, 120), 121);
  C.walkAgain(s, d2);
  assert.strictEqual(s.round, 2);
  assert.strictEqual(C.currentDay(s, 120), 1);
  assert.strictEqual(Object.keys(s.pastRounds[0].done).length, 120);
  assert.strictEqual(C.dayJournal(s, 1), '', 'this round starts empty');
  assert.deepStrictEqual(C.earlierDayJournal(s, 1), { text: 'first time: mostly questions', round: 1 });
  C.setDayJournal(s, 1, 'second time: a little more trust', d2);
  assert.strictEqual(C.dayJournal(s, 1), 'second time: a little more trust');
  assert.strictEqual(s.journal.filter((e) => e.dayAnswer && e.day === 1).length, 2, 'the first answer was not overwritten');
  C.setDayJournal(s, 1, '', d2); // emptying this round's answer leaves the old one alone
  assert.strictEqual(C.earlierDayJournal(s, 1).text, 'first time: mostly questions');
  { const q = C.defaults(); C.finishDay(q, 1, d1); C.walkAgain(q, d2); assert.strictEqual(C.daysShowedUp(q), 1, 'earlier walks still count as days you showed up'); }
  // a backup keeps the round, the old ticks and which round each answer belongs to
  C.setDayJournal(s, 2, 'round two, day two', d2);
  const back = C.importData(C.exportData(s));
  assert.strictEqual(back.round, 2);
  assert.strictEqual(Object.keys(back.pastRounds[0].done).length, 120);
  assert.strictEqual(C.dayJournal(back, 2), 'round two, day two');
  assert.strictEqual(C.dayJournal(back, 1), '');
  assert.strictEqual(C.earlierDayJournal(back, 1).text, 'first time: mostly questions');
  // junk round values are dropped
  const junk = C.importData(JSON.stringify({ app: 'faith-companion', state: { done: {}, round: '<b>', pastRounds: [null, { done: [] }, { done: { 1: 'x', 2: '2026-11-18' } }] } }));
  assert.strictEqual(junk.round, 1);
  assert.deepStrictEqual(junk.pastRounds, [{ done: { 2: '2026-11-18' }, ended: null }]);
});

t('practicesThisWeek: counts finished practices since Monday, local time', () => {
  const s = C.defaults();
  assert.deepStrictEqual(C.practicesThisWeek(s, new Date(2026, 10, 20, 12)), {});
  C.logSession(s, 'practice', 'examen', 'Examen', 5, new Date(2026, 10, 16, 0, 5));   // Monday just after midnight
  C.logSession(s, 'practice', 'examen', 'Examen', 5, new Date(2026, 10, 19, 21));    // Thursday
  C.logSession(s, 'practice', 'breath', 'Breath prayer', 2, new Date(2026, 10, 15, 23, 50)); // Sunday before: last week
  C.logSession(s, 'day', 3, 'Day 3', 5, new Date(2026, 10, 18));                      // a day's prayer is not a practice
  assert.deepStrictEqual(C.practicesThisWeek(s, new Date(2026, 10, 20, 12)), { examen: 2 });
  // on Sunday the whole week still counts; next Monday starts fresh
  assert.deepStrictEqual(C.practicesThisWeek(s, new Date(2026, 10, 22, 23)), { examen: 2 });
  assert.deepStrictEqual(C.practicesThisWeek(s, new Date(2026, 10, 23, 8)), {});
  // DST week (US clocks change 1 Nov 2026) and junk entries
  const d = C.defaults();
  C.logSession(d, 'practice', 'lectio', 'Lectio', 5, new Date(2026, 10, 2, 7));
  d.sessions.push(null, { kind: 'practice', at: 'nope', id: 'x' }, { kind: 'practice', at: new Date(2026, 10, 3).toISOString() });
  assert.deepStrictEqual(C.practicesThisWeek(d, new Date(2026, 10, 8, 22)), { lectio: 1 });
  assert.deepStrictEqual(C.practicesThisWeek({}, new Date()), {});
});

t('practice wordings: guiding lines vary, Scripture and the Lord’s Prayer never do, timing kept', () => {
  global.window = global.window || {};
  require('../../../app/www/modules/faith/content.js');
  const P = global.window.FC_CONTENT.practices, ids = P.map((p) => p.id);
  Object.keys(C.PRACTICE_LINES).forEach((id) => assert.ok(ids.includes(id), 'unknown practice ' + id));
  assert.ok(!C.PRACTICE_LINES.lords, 'the Lord’s Prayer is always exact');
  P.forEach((p) => {
    const v = C.PRACTICE_LINES[p.id] || {};
    Object.keys(v).forEach((i) => {
      const st = p.steps[+i];
      assert.ok(st, p.id + ' step ' + i + ' exists');
      assert.ok(!/\(\d?\s?[A-Z][a-z]+ \d+:\d+/.test(st.say) && !/\{\{TODAY\}\}/.test(st.say), p.id + ' step ' + i + ' is Scripture: no variants');
      v[i].forEach((alt) => {
        assert.ok(alt && alt !== st.say, p.id + ' ' + i + ' differs');
        assert.ok(!/\d+:\d+|\{\{/.test(alt), 'no Scripture references in a variant');
        const a = alt.split(/\s+/).length, b = st.say.split(/\s+/).length;
        assert.ok(a >= b * 0.6 && a <= b * 1.5 + 2, p.id + ' ' + i + ' about the same length: ' + a + ' vs ' + b);
      });
    });
    const base = C.practiceScript(p, 0);
    assert.deepStrictEqual(base, p.steps.map((x) => ({ say: x.say, wait: x.wait })), 'first time: the original words');
    for (let n = 1; n < C.practiceVariants(p) + 2; n++) {
      const sc = C.practiceScript(p, n);
      assert.deepStrictEqual(sc.map((x) => x.wait), p.steps.map((x) => x.wait), p.id + ' same waits');
      sc.forEach((x, i) => { if (!(C.PRACTICE_LINES[p.id] || {})[i]) assert.strictEqual(x.say, p.steps[i].say, p.id + ' unvaried step exact'); });
      // scaled to 5 minutes, any wording comes out the same length
      if (!p.fixed) assert.ok(Math.abs(C.scriptLength(C.scaleScript(sc, 5, 1)) - C.scriptLength(C.scaleScript(base, 5, 1))) <= 15, p.id + ' timing');
    }
    if (C.PRACTICE_LINES[p.id]) assert.notDeepStrictEqual(C.practiceScript(p, 1), base, p.id + ' second time sounds different');
  });
  const s = C.defaults();
  assert.strictEqual(C.practiceTimes(s, 'examen'), 0);
  C.logSession(s, 'practice', 'examen', 'Examen', 5); C.logSession(s, 'day', 'examen', 'x', 5);
  assert.strictEqual(C.practiceTimes(s, 'examen'), 1);
  assert.strictEqual(C.practiceTimes({}, 'examen'), 0);
});

t('doneInLast: bounded at today so logging for an earlier day ignores future completions', () => {
  const s = C.defaults();
  C.finishDay(s, 1, new Date(2026, 10, 14, 12));
  C.finishDay(s, 2, new Date(2026, 10, 18, 12));
  C.finishDay(s, 3, new Date(2026, 10, 22, 12));
  assert.strictEqual(C.doneInLast(s, 7, new Date(2026, 10, 18, 12)), 2);
  assert.strictEqual(C.doneInLast(s, 7, new Date(2026, 10, 22, 12)), 2);
});

t('doneInLast: days finished earlier in the week still count after walkAgain starts a new round', () => {
  const s = C.defaults();
  C.finishDay(s, 1, new Date(2026, 10, 10, 12)); // over a week before
  C.finishDay(s, 2, new Date(2026, 10, 16, 12));
  C.finishDay(s, 3, new Date(2026, 10, 17, 12));
  C.walkAgain(s, new Date(2026, 10, 18, 9));
  C.finishDay(s, 1, new Date(2026, 10, 18, 12));
  assert.strictEqual(C.doneInLast(s, 7, new Date(2026, 10, 18, 20)), 3, 'Mon + Tue of the old round, Wed of the new');
  assert.strictEqual(C.doneInLast(s, 1, new Date(2026, 10, 18, 20)), 1);
  assert.strictEqual(C.doneInLast(s, 7, new Date(2026, 10, 16, 20)), 2, 'bounded at today in past rounds too (10th + 16th)');
  s.pastRounds.push({ done: null, ended: null });
  assert.strictEqual(C.doneInLast(s, 7, new Date(2026, 10, 18, 20)), 3, 'an odd round is skipped');
});

t('journalText: newest first, kinds and day titles, multi-line text kept, prayer list; empty journal says so', () => {
  const s = C.defaults();
  assert.ok(/No entries yet/.test(C.journalText(s, null, new Date(2026, 10, 23, 9))));
  C.addEntry(s, 'awe', 'Stars over the bay', null, new Date(2026, 10, 19, 3, 5));
  C.addEntry(s, 'journal', 'Line one\r\nLine two', 4, new Date(2026, 10, 21, 7, 9));
  C.addEntry(s, 'gratitude', 'Warm socks', null, new Date(2026, 10, 22, 21, 0));
  C.addEntry(s, 'journal', 'Free note', null, new Date(2026, 10, 20, 12, 0));
  C.addPrayer(s, 'Her sleep', new Date(2026, 10, 18, 9));
  const txt = C.journalText(s, (n) => (n === 4 ? 'While it was still dark' : ''), new Date(2026, 10, 23, 9, 30));
  const lines = txt.split('\n');
  assert.strictEqual(lines[0], 'My journal (Wellness app), saved 2026-11-23 09:30');
  const heads = lines.filter((l) => / · /.test(l));
  assert.deepStrictEqual(heads, ['2026-11-22 21:00 · Thanks', '2026-11-21 07:09 · Day 4: While it was still dark', '2026-11-20 12:00 · Journal', '2026-11-19 03:05 · Awe moment']);
  assert.ok(txt.includes('Line one\nLine two') && !txt.includes('\r'));
  assert.ok(/Prayer list\n\n- Her sleep \(since 2026-11-18\)/.test(txt), txt);
  assert.deepStrictEqual(C.journalText(s, null, new Date(2026, 10, 23)).split('\n').filter((l) => / · Day 4$/.test(l)).length, 1, 'no title function: just the day number');
});

t('journalText: mixed timezone offsets sort strictly newest-first; answered prayers with/without note', () => {
  const s = C.defaults();
  // 20:00-04:00 is 2026-11-23T00:00:00Z (1 hour NEWER than 2026-11-22T23:00:00Z, even though lexicographically smaller)
  s.journal.push({ id: 'a', at: '2026-11-22T23:00:00.000Z', kind: 'journal', text: 'Earlier UTC' });
  s.journal.push({ id: 'b', at: '2026-11-22T20:00:00-04:00', kind: 'journal', text: 'Newer offset' });
  s.prayers.push({ id: 'p1', at: '2026-11-18T12:00:00.000Z', text: 'Sleep', answered: '2026-11-20T12:00:00.000Z', note: '   ' });
  s.prayers.push({ id: 'p2', at: '2026-11-18T12:00:00.000Z', text: 'Work', answered: '2026-11-21T12:00:00.000Z', note: '  Went smoothly  ' });
  const txt = C.journalText(s, null, new Date(2026, 10, 23, 9, 0));
  assert.ok(txt.indexOf('Newer offset') < txt.indexOf('Earlier UTC'), 'timestamp sort beats string order:\n' + txt);
  assert.ok(txt.includes('- Sleep: answered or let go 2026-11-20\n'), 'whitespace-only prayer note omitted');
  assert.ok(txt.includes('- Work: answered or let go 2026-11-21 (Went smoothly)\n'), 'trimmed prayer note included');
});

console.log(n + ' unit tests passed');
