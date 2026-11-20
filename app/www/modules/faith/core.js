/* Faith Companion: logic with no DOM, shared by the app and the node tests.
   Everything is stored on the device (localStorage); nothing is sent anywhere. */
(function (root) {
  'use strict';

  var KEY = 'fc.v1';

  function defaults() {
    return {
      version: 1,
      started: null,          // ISO date the path was started
      done: {},               // day number -> ISO date finished
      journal: [],            // {id, at, day|null, kind:'journal'|'awe'|'gratitude', text}
      prayers: [],            // {id, at, text, answered: null|ISO, note}
      settings: {
        theme: 'auto',        // auto | light | dark | night
        textSize: 1,          // 0.9 .. 1.4
        voice: true,          // speak guided prayers aloud
        rate: 0.9,            // speech rate
        minutes: 5,           // guided prayer length: 2 | 5 | 10
        bell: true
      },
      resume: null,           // {screen, day, practice, step, at}
      round: 1,               // 2, 3, ... after "Walk it again"
      pastRounds: [],         // [{done, ended}] for earlier walks of the path
      sessions: [],           // guided prayers and practices played to the end: {at, kind:'day'|'practice', id, title, mins}
      lastOpen: null
    };
  }

  function makeStore(storage) {
    if (!storage) { try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; } }
    var mem = null;
    function load() {
      var raw = null;
      try { raw = storage ? storage.getItem(KEY) : mem; } catch (e) { raw = mem; }
      var d = defaults();
      if (!raw) return d;
      var s;
      try { s = JSON.parse(raw); } catch (e) { return d; }
      if (!s || typeof s !== 'object') return d;
      // merge so new settings get their defaults
      for (var k in d) if (!(k in s)) s[k] = d[k];
      for (var j in d.settings) if (!(j in (s.settings || {}))) { s.settings = s.settings || {}; s.settings[j] = d.settings[j]; }
      if (!s.done || typeof s.done !== 'object') s.done = {};
      if (!Array.isArray(s.journal)) s.journal = [];
      if (!Array.isArray(s.prayers)) s.prayers = [];
      if (!(s.round >= 1)) s.round = 1;
      if (!Array.isArray(s.pastRounds)) s.pastRounds = [];
      return s;
    }
    function save(s) {
      var raw = JSON.stringify(s);
      try { if (storage) storage.setItem(KEY, raw); else mem = raw; } catch (e) { mem = raw; return false; }
      return true;
    }
    return { load: load, save: save, key: KEY };
  }

  function isoDate(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* The day to show on the Today screen: the first day not finished yet.
     Not tied to the calendar, so missing days never "costs" anything. */
  function currentDay(state, total) {
    for (var n = 1; n <= total; n++) if (!state.done[n]) return n;
    return total + 1; // finished everything written so far
  }

  function finishDay(state, n, when) {
    if (!state.started) state.started = isoDate(when);
    if (!state.done[n]) state.done[n] = isoDate(when);
    return state;
  }

  function unfinishDay(state, n) { delete state.done[n]; return state; }

  /* After the last day: start the path again from day 1. Nothing is deleted: the old ticks go to pastRounds and
     journal answers stay (each tagged with its round), so the days can show "last time you wrote". */
  function walkAgain(state, when) {
    state.pastRounds.push({ done: state.done, ended: isoDate(when) });
    state.done = {};
    state.round = (state.round || 1) + 1;
    state.resume = null;
    return state;
  }

  function roundOf(e) { return e.round || 1; }

  /* The most recent day answer for `day` from an earlier walk of the path: {text, round} or null. */
  function earlierDayJournal(state, day) {
    var best = null, cur = state.round || 1;
    state.journal.forEach(function (e) {
      if (e.kind === 'journal' && e.day === day && e.dayAnswer && roundOf(e) < cur && (!best || roundOf(e) > best.round)) best = { text: e.text, round: roundOf(e) };
    });
    return best;
  }

  /* Number of different calendar dates he showed up (finished a day, wrote, or prayed). */
  function daysShowedUp(state) {
    var seen = {};
    for (var k in state.done) seen[state.done[k]] = 1;
    (state.pastRounds || []).forEach(function (r) { for (var j in r.done) seen[r.done[j]] = 1; });
    state.journal.forEach(function (e) { if (e.at) seen[isoDate(new Date(e.at))] = 1; }); // local date, like done[]
    // a guided prayer or practice, or a new prayer-list item, is showing up too
    (state.sessions || []).forEach(function (x) { if (x.at && !isNaN(new Date(x.at))) seen[isoDate(new Date(x.at))] = 1; });
    (state.prayers || []).forEach(function (x) { if (x.at && !isNaN(new Date(x.at))) seen[isoDate(new Date(x.at))] = 1; });
    return Object.keys(seen).length;
  }

  /* How many path days were finished in the last `days` calendar days, today included (local dates). */
  function doneInLast(state, days, when) {
    var w = when || new Date();
    var from = isoDate(new Date(w.getFullYear(), w.getMonth(), w.getDate() - (days - 1)));
    var n = 0;
    for (var k in state.done) if (state.done[k] >= from) n++;
    return n;
  }

  function finishedToday(state, when) {
    var t = isoDate(when), best = 0; // the latest day finished today, if several
    for (var k in state.done) if (state.done[k] === t && Number(k) > best) best = Number(k);
    return best;
  }

  var idn = 0;
  function newId(when) { idn++; return (when || new Date()).getTime().toString(36) + '-' + idn; }

  function addEntry(state, kind, text, day, when) {
    text = String(text == null ? '' : text).trim();
    if (!text) return null;
    var e = { id: newId(when), at: (when || new Date()).toISOString(), day: day || null, kind: kind || 'journal', text: text };
    state.journal.unshift(e);
    return e;
  }

  /* One editable journal answer per day: create, update or (when emptied) remove it. */
  function setDayJournal(state, day, text, when) {
    text = String(text == null ? '' : text);
    var i = -1;
    for (var k = 0; k < state.journal.length; k++) {
      var e = state.journal[k];
      if (e.kind === 'journal' && e.day === day && e.dayAnswer && roundOf(e) === (state.round || 1)) { i = k; break; }
    }
    if (!text.trim()) { if (i >= 0) state.journal.splice(i, 1); return null; }
    if (i >= 0) { state.journal[i].text = text; state.journal[i].edited = (when || new Date()).toISOString(); return state.journal[i]; }
    var n = addEntry(state, 'journal', text, day, when);
    n.dayAnswer = true;
    if ((state.round || 1) > 1) n.round = state.round;
    return n;
  }

  function dayJournal(state, day) {
    for (var k = 0; k < state.journal.length; k++) {
      var e = state.journal[k];
      if (e.kind === 'journal' && e.day === day && e.dayAnswer && roundOf(e) === (state.round || 1)) return e.text;
    }
    return '';
  }

  function removeEntry(state, id) {
    state.journal = state.journal.filter(function (e) { return e.id !== id; });
  }

  /* A guided prayer or practice played to the end (for progress and the activity log); the last 500 are kept. */
  function logSession(state, kind, id, title, mins, when) {
    if (!Array.isArray(state.sessions)) state.sessions = [];
    var x = { at: (when || new Date()).toISOString(), kind: kind === 'day' ? 'day' : 'practice', id: id, title: String(title || '').slice(0, 120),
      mins: Math.max(0, Math.round((+mins || 0) * 10) / 10) };
    state.sessions.push(x);
    if (state.sessions.length > 500) state.sessions.splice(0, state.sessions.length - 500);
    return x;
  }

  function addPrayer(state, text, when) {
    text = String(text == null ? '' : text).trim();
    if (!text) return null;
    var p = { id: newId(when), at: (when || new Date()).toISOString(), text: text, answered: null, note: '' };
    state.prayers.unshift(p);
    return p;
  }

  /* "A month ago you wrote..." : an entry from roughly 7, 30 or 90 days back (within a few days). */
  function lookBack(state, when) {
    var now = (when || new Date()).getTime();
    var spans = [90, 30, 7];
    for (var s = 0; s < spans.length; s++) {
      var best = null, bestGap = 1e15;
      for (var i = 0; i < state.journal.length; i++) {
        var e = state.journal[i];
        var age = (now - new Date(e.at).getTime()) / 864e5;
        var gap = Math.abs(age - spans[s]);
        if (gap <= (spans[s] === 7 ? 1 : 4) && gap < bestGap) { best = e; bestGap = gap; }
      }
      if (best) return { days: spans[s], entry: best };
    }
    return null;
  }

  /* Gentle check: words that may mean he is really struggling. Never a diagnosis;
     the app only offers a kind note about talking to someone. */
  var HEAVY = /\b(hopeless|can'?t go on|cannot go on|want to die|wish i (was|were) dead|end it all|kill myself|suicid\w*|hurt myself|self[- ]harm|no reason to live|give up on everything|breaking down|can'?t cope|cannot cope|so alone|completely alone|depress\w*|panic attack)/i;
  function soundsHeavy(text) { return HEAVY.test(String(text || '')); }

  /* Guided sessions: the shared engine in app/www/lib/guided.js. */
  var G = root.WLGuided || require('../../lib/guided.js');
  var wordsSeconds = G.wordsSeconds, scaleScript = G.scaleScript, scriptLength = G.scriptLength, Player = G.Player;

  /* The guided prayer for a day of the path. The guiding lines around the day's own words (Scripture, prayer, practice:
     always exact) come in three wordings that take turns by day, so it doesn't sound the same every day. */
  var DAY_LINES = {
    open: ['Let’s be still for a few minutes. You can keep your eyes open or closed. If the baby needs you, just pause; this will wait.',
      'Take a few quiet minutes. Sit or lie however is comfortable. If she needs you, pause; this will be here when you come back.',
      'Let’s slow down together for a little while. Eyes open or closed, whatever helps. If you’re called away, just pause.'],
    breathe: ['Breathe in slowly… and out. Again, in… and out. Notice your feet, your hands, the weight of your body. You are here, and God is here.',
      'Let your breathing slow… in… and out. Feel the floor or the chair holding you. You are here, and God is with you.',
      'Breathe in… and let it go. Once more. Let your shoulders drop. You don’t have to do anything to be welcome here.'],
    hear: ['Hear today’s words again, slowly.', 'Listen to today’s words once more.', 'Here are today’s words again. Let them sink in.'],
    sit: ['Which word or phrase stays with you? Rest on it. If your mind wanders, gently come back to it.',
      'Is there one word that stands out? Stay with it for a while. When your thoughts drift, return to it gently.',
      'Let one phrase from it stay with you. Turn it over slowly. A wandering mind is normal; just come back.'],
    pray: ['Now pray, in these words or your own.', 'Now let’s pray. Use these words, or your own.', 'Pray along with these words, or in your own way.'],
    others: ['Is there someone you want to bring to God right now? Your wife, your daughter, a friend, yourself. Just hold them in mind.',
      'Who is on your heart today? Your family, a friend, someone who is struggling, or yourself. Bring them to God in a few words.',
      'Think of someone who needs prayer today, maybe someone at home, maybe someone far away. Hold them before God for a moment.'],
    practice: ['Before you go, remember today’s practice: ', 'One thing to carry with you today: ', 'Today’s practice, before you go: '],
    end: ['Amen. Go gently.', 'Amen. Go in peace.', 'Amen. Take this quiet with you.']
  };
  /* praying: up to two open Prayer list items, named in the "others" step. */
  function dayScript(day, variant, praying) {
    var v = ((Math.floor(+(variant == null ? day.n : variant) || 0)) % 3 + 3) % 3, L = function (k) { return DAY_LINES[k][v]; };
    var steps = [
      { say: L('open'), wait: 3 },
      { say: L('breathe'), wait: 8 },
      { say: L('hear'), wait: 1 },
      { say: day.keyVerse, wait: 12, kind: 'verse' },
      { say: day.sitWith || L('sit'), wait: 30 },
      { say: L('pray'), wait: 1 },
      { say: day.prayer, wait: 15, kind: 'prayer' },
      { say: L('others') + (praying && praying.length ? ' On your prayer list: ' + praying.slice(0, 2).map(function (t) { return String(t).replace(/\s+/g, ' ').trim().slice(0, 80); }).join('; and ') + '.' : ''), wait: 20 },
      { say: L('practice') + day.practice, wait: 4 },
      { say: L('end'), wait: 0, kind: 'end' }
    ];
    return steps;
  }

  /* Export / import of everything (a backup file he keeps himself). */
  function exportData(state) { return JSON.stringify({ app: 'faith-companion', exported: new Date().toISOString(), state: state }, null, 1); }
  /* A backup is checked field by field, so a damaged or hand-edited file can't break the app or inject markup. */
  function importData(text) {
    var o = JSON.parse(text);
    var s = o && o.app === 'faith-companion' ? o.state : null;
    if (!s || typeof s !== 'object' || !s.done || typeof s.done !== 'object' || Array.isArray(s.done)) throw new Error('This is not a Faith Companion backup.');
    var d = defaults(), str = function (v) { return typeof v === 'string' ? v : ''; };
    var dateRe = /^\d{4}-\d\d-\d\d$/;
    for (var k in s.done) if (/^\d+$/.test(k) && dateRe.test(s.done[k])) d.done[k] = s.done[k];
    if (typeof s.started === 'string' && dateRe.test(s.started)) d.started = s.started;
    if (typeof s.round === 'number' && s.round >= 1 && s.round % 1 === 0 && s.round < 1000) d.round = s.round;
    (Array.isArray(s.pastRounds) ? s.pastRounds : []).forEach(function (r) {
      if (!r || !r.done || typeof r.done !== 'object' || Array.isArray(r.done)) return;
      var pd = {};
      for (var k in r.done) if (/^\d+$/.test(k) && dateRe.test(r.done[k])) pd[k] = r.done[k];
      d.pastRounds.push({ done: pd, ended: typeof r.ended === 'string' && dateRe.test(r.ended) ? r.ended : null });
    });
    (Array.isArray(s.journal) ? s.journal : []).forEach(function (e) {
      if (!e || typeof e.text !== 'string' || isNaN(new Date(e.at).getTime())) return;
      var n = { id: str(e.id) || newId(), at: new Date(e.at).toISOString(), day: typeof e.day === 'number' ? e.day : null,
        kind: ['journal', 'awe', 'gratitude'].indexOf(e.kind) >= 0 ? e.kind : 'journal', text: e.text };
      if (e.dayAnswer === true) n.dayAnswer = true;
      if (typeof e.edited === 'string') n.edited = e.edited;
      if (typeof e.round === 'number' && e.round >= 2 && e.round % 1 === 0) n.round = e.round;
      d.journal.push(n);
    });
    (Array.isArray(s.prayers) ? s.prayers : []).forEach(function (p) {
      if (!p || typeof p.text !== 'string' || isNaN(new Date(p.at).getTime())) return;
      d.prayers.push({ id: str(p.id) || newId(), at: new Date(p.at).toISOString(), text: p.text,
        answered: p.answered && !isNaN(new Date(p.answered).getTime()) ? new Date(p.answered).toISOString() : null, note: str(p.note) });
    });
    (Array.isArray(s.sessions) ? s.sessions : []).slice(-500).forEach(function (x) {
      if (!x || isNaN(new Date(x.at).getTime())) return;
      d.sessions.push({ at: new Date(x.at).toISOString(), kind: x.kind === 'day' ? 'day' : 'practice', id: typeof x.id === 'number' || typeof x.id === 'string' ? x.id : null,
        title: str(x.title).slice(0, 120), mins: typeof x.mins === 'number' && x.mins >= 0 && x.mins < 1000 ? x.mins : 0 });
    });
    var st = s.settings || {}, ds = d.settings;
    if (['auto', 'light', 'dark', 'night'].indexOf(st.theme) >= 0) ds.theme = st.theme;
    if (typeof st.textSize === 'number' && st.textSize >= 0.8 && st.textSize <= 1.6) ds.textSize = st.textSize;
    if (typeof st.voice === 'boolean') ds.voice = st.voice;
    if (typeof st.bell === 'boolean') ds.bell = st.bell;
    if (typeof st.rate === 'number' && st.rate >= 0.5 && st.rate <= 1.6) ds.rate = st.rate;
    if ([2, 5, 10].indexOf(st.minutes) >= 0) ds.minutes = st.minutes;
    if (typeof st.reminder === 'string' && /^\d\d:\d\d$/.test(st.reminder)) ds.reminder = st.reminder;
    return d;
  }

  function nightHours(when) { var h = (when || new Date()).getHours(); return h >= 21 || h < 6; }

  function themeFor(settings, when) {
    if (settings.theme === 'auto') return nightHours(when) ? 'night' : 'light';
    return settings.theme;
  }

  var api = {
    defaults: defaults, makeStore: makeStore, isoDate: isoDate, currentDay: currentDay, finishDay: finishDay,
    unfinishDay: unfinishDay, walkAgain: walkAgain, earlierDayJournal: earlierDayJournal, daysShowedUp: daysShowedUp, finishedToday: finishedToday, doneInLast: doneInLast, addEntry: addEntry,
    setDayJournal: setDayJournal, dayJournal: dayJournal, removeEntry: removeEntry, addPrayer: addPrayer, logSession: logSession,
    lookBack: lookBack, soundsHeavy: soundsHeavy, scaleScript: scaleScript, scriptLength: scriptLength,
    wordsSeconds: wordsSeconds, dayScript: dayScript, Player: Player, exportData: exportData, importData: importData,
    themeFor: themeFor, nightHours: nightHours
  };
  root.FCCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
