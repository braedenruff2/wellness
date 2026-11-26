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
        bell: true,
        darkPray: true        // a guided prayer late at night (21:00-05:00) goes dark after 20 s
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

  var WLD = root.WLDates || require('../../lib/dates.js');
  var isoDate = WLD.iso, isDate = WLD.isDate;

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
    state.journal.forEach(function (e) { if (e && e.at && !isNaN(new Date(e.at))) seen[isoDate(new Date(e.at))] = 1; }); // local date, like done[]
    // a guided prayer or practice, or a new prayer-list item, is showing up too
    (state.sessions || []).forEach(function (x) { if (x && x.at && !isNaN(new Date(x.at))) seen[isoDate(new Date(x.at))] = 1; });
    (state.prayers || []).forEach(function (x) { if (x && x.at && !isNaN(new Date(x.at))) seen[isoDate(new Date(x.at))] = 1; });
    return Object.keys(seen).length;
  }

  /* How many path days were finished in the last `days` calendar days, today included (local dates). Days finished
     in an earlier round count too (walkAgain mid-week keeps them in pastRounds). */
  function doneInLast(state, days, when) {
    var w = when || new Date();
    var from = isoDate(new Date(w.getFullYear(), w.getMonth(), w.getDate() - (days - 1))), today = isoDate(w);
    var n = 0, count = function (done) { for (var k in done) if (done[k] >= from && done[k] <= today) n++; };
    count(state.done);
    (state.pastRounds || []).forEach(function (r) { if (r && r.done) count(r.done); });
    return n;
  }

  function finishedToday(state, when) {
    var t = isoDate(when), best = 0; // the latest day finished today, if several
    for (var k in state.done) if (state.done[k] === t && Number(k) > best) best = Number(k);
    return best;
  }

  var idn = 0;
  function newId(when) { idn++; return (when || new Date()).getTime().toString(36) + '-' + idn; }

  /* Keep journal entries and prayers strictly newest-first by timestamp (ties go ahead of existing items). */
  function insertNewest(list, item) {
    var t = Date.parse(item.at), i = 0;
    if (!isNaN(t)) {
      while (i < list.length) {
        var cur = list[i] && Date.parse(list[i].at);
        if (isNaN(cur) || cur <= t) break;
        i++;
      }
    }
    list.splice(i, 0, item);
  }

  function addEntry(state, kind, text, day, when) {
    text = String(text == null ? '' : text).trim();
    if (!text) return null;
    var e = { id: newId(when), at: (when || new Date()).toISOString(), day: day || null, kind: kind || 'journal', text: text };
    insertNewest(state.journal, e);
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

  /* Practices played to the end this week (Monday 00:00 local onward): {practiceId: count}. */
  function practicesThisWeek(state, when) {
    var now = when || new Date(), out = {};
    var ws = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
    (Array.isArray(state.sessions) ? state.sessions : []).forEach(function (x) {
      if (!x || x.kind !== 'practice' || x.id == null) return;
      var t = new Date(x.at).getTime();
      if (isNaN(t) || t < ws || t > now.getTime()) return;
      out[x.id] = (out[x.id] || 0) + 1;
    });
    return out;
  }

  function addPrayer(state, text, when) {
    text = String(text == null ? '' : text).trim();
    if (!text) return null;
    var p = { id: newId(when), at: (when || new Date()).toISOString(), text: text, answered: null, note: '' };
    insertNewest(state.prayers, p);
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

  /* Practices (#faith/pray): other wordings for the guiding lines, by practice id and step index; the n-th time
     through a practice uses wording n (mod the count). Scripture, the Lord's Prayer and the {{TODAY}} verse steps
     have none: they are always exact. Same waits as the original step. */
  var PRACTICE_LINES = {
    pause: {
      0: ['Pause right where you are. For one minute, you don’t have to solve anything.', 'Stop for a moment. Nothing needs fixing in the next minute.'],
      1: ['A slow breath in, and an even slower breath out.', 'Breathe in slowly. Let the breath out, longer than it came in.'],
      2: ['And again. In… and out, long and slow.', 'Once more. In, and a long, slow breath out.'],
      4: ['Pray, if you can: Lord, this is hard. Stay with me. Give me patience for the next few minutes.', 'Pray, if you can: Lord, I need you right now. Be with me, and give me patience for what comes next.'],
      5: ['Breathe slowly once more. God is with you in this room.', 'One more slow breath. You are not on your own here.'],
      6: ['Take it gently from here. Come back as often as you need to.', 'Go gently. This minute is here whenever you need it.']
    },
    breath: {
      0: ['Get comfortable and let your shoulders drop. Let your breath slow on its own.', 'Let your body settle. Your breathing will slow down by itself.'],
      1: ['Breathing in, pray silently: Lord Jesus Christ. Breathing out: have mercy on me.'],
      3: ['Thoughts will come and go. Let them pass and return to the words. Lord Jesus Christ… have mercy on me.', 'When your mind wanders, and it will, simply come back to the words. Lord Jesus Christ… have mercy on me.'],
      4: ['Carry on in your own rhythm. There’s no hurry.', 'Keep going, at your own pace.'],
      6: ['Let the words fall away. Rest for a moment with God.', 'Now let the words go quiet, and simply rest with God for a moment.']
    },
    examen: {
      0: ['Take a moment to remember that God is with you, here, at the end of this day.', 'Notice that God is here with you now, as this day ends.'],
      1: ['Ask for light: Lord, help me see my day through your eyes.', 'Ask for light: God, help me see today as you see it.'],
      2: ['Replay your day, starting from when you got up. What are you grateful for? Little things count too: a laugh, a quiet minute, a good meal.', 'Walk back through the day from the moment you woke. What are you thankful for? Small things count: a smile, a nap, a warm drink.'],
      3: ['When did you feel close to God, or at peace? When did you feel distant, anxious or short-tempered? Just notice; no need to judge.'],
      4: ['Was there a moment you regret today? Bring it to God honestly, and ask for forgiveness where it’s needed.', 'Is there a moment you’d like to have handled differently? Tell God about it, and ask for forgiveness where you need it.'],
      6: ['Look ahead to tomorrow. Where will you need strength? Ask God for it now.', 'Now think about tomorrow. What might be hard? Ask God for the help you’ll need.'],
      7: ['Thank you, God, for today, all of it. Amen.']
    },
    lectio: {
      0: ['Settle in. Ask God to speak to you through this verse.', 'Find a comfortable position. Ask God to speak to you through these words.'],
      3: ['Say that word or phrase over to yourself. Why might it stand out today? What in your life does it touch?'],
      5: ['Now respond to God in your own words: thanks, a question, a request, whatever comes to you.'],
      6: ['Last of all, just rest. No more words. Be with God, the way you’d sit quietly with someone you love.']
    },
    still: {
      1: ['Pick your word. Say it once, gently, as a way of saying yes to God being here.'],
      2: ['Now rest in silence. When you notice you’re thinking about something, gently come back to your word. Each return is a small act of love.'],
      3: ['Come back to your word, gently.', 'Gently, your word.'],
      4: ['A little longer. There’s no rush.', 'Stay here a little longer.'],
      5: ['Slowly come back. Thank God for this time, even if nothing seemed to happen. Much happens quietly.']
    },
    gratitude: {
      1: ['Bring to mind one thing from the last day you’re thankful for. Make it specific: a moment, a word, a look.'],
      2: ['Tell God thank you for it, simply.', 'Thank God for it, in one sentence.'],
      3: ['A second thing. Perhaps something you usually don’t notice: warmth, food, a body that works.'],
      4: ['A third. Maybe a person. Thank God for them by name.']
    },
    awe: {
      0: ['Begin walking at an easy pace. Today you’re not trying to get anywhere; you’re looking.'],
      2: ['Look up. Take in the sky: its colour, the clouds, how far it stretches.'],
      3: ['Now look closely at something small: a leaf, frost, a stone, a bird. See it as if for the first time.'],
      4: ['Listen. What do you hear: wind, the sea, birds, the stroller wheels? Let each sound be a small gift.'],
      6: ['If something makes you stop, stop. Say quietly: you made this.'],
      7: ['Look at your daughter. She is part of creation too. Thank God for her.'],
      8: ['Head home whenever you’re ready. If something caught you, add it to your awe moments.']
    },
    blessing: {
      0: ['If you can, gently rest your hand on your daughter. Say these words out loud or in your heart.'],
      2: ['Now bless her in your own words. What do you pray for her: love, courage, kindness, faith?']
    },
    together: {
      0: ['Sit together. Hold hands if it feels right. There’s no wrong way to do this.'],
      2: ['Each of you, name one thing you’re grateful for today, out loud or silently.'],
      3: ['Each of you, share one worry or hope. Just listen; nothing needs fixing.'],
      4: ['Now pray for each other, in a sentence or in silence. Ask God to bless the other.'],
      5: ['Together, pray for your daughter.']
    },
    night: {
      0: ['Night feeds are long. You’re awake with your daughter, and God is awake with you both.'],
      2: ['Feel her weight, her warmth, her breath. Quietly give thanks for her.'],
      5: ['Lord, when this feed is done, give us both rest. Watch over my family tonight. Amen.']
    }
  };
  /* How many wordings a practice has in all (1 = no variants). */
  function practiceVariants(p) {
    var v = PRACTICE_LINES[p.id]; if (!v) return 1;
    return 1 + Math.max.apply(null, Object.keys(v).map(function (k) { return v[k].length; }));
  }
  /* The steps for the n-th time through a practice (n from 0); a step with fewer wordings cycles its own. */
  function practiceScript(p, n) {
    var v = PRACTICE_LINES[p.id] || {}, k = Math.max(0, n | 0);
    return p.steps.map(function (s, i) {
      var all = [s.say].concat(v[i] || []);
      return { say: all[k % all.length], wait: s.wait };
    });
  }
  /* Times a practice was played to the end (picks the wording for the next time). */
  function practiceTimes(state, id) {
    return (Array.isArray(state.sessions) ? state.sessions : []).filter(function (x) { return x && x.kind === 'practice' && x.id === id; }).length;
  }

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
    var raw = String(text == null ? '' : text);
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    var o = JSON.parse(raw);
    var s = o && o.app === 'faith-companion' ? o.state : null;
    if (!s || typeof s !== 'object' || !s.done || typeof s.done !== 'object' || Array.isArray(s.done)) throw new Error('This is not a Faith Companion backup.');
    var d = defaults(), str = function (v) { return typeof v === 'string' ? v : ''; };
    for (var k in s.done) if (/^\d+$/.test(k) && isDate(s.done[k])) d.done[k] = s.done[k];
    if (isDate(s.started)) d.started = s.started;
    if (typeof s.round === 'number' && s.round >= 1 && s.round % 1 === 0 && s.round < 1000) d.round = s.round;
    (Array.isArray(s.pastRounds) ? s.pastRounds : []).forEach(function (r) {
      if (!r || !r.done || typeof r.done !== 'object' || Array.isArray(r.done)) return;
      var pd = {};
      for (var k in r.done) if (/^\d+$/.test(k) && isDate(r.done[k])) pd[k] = r.done[k];
      d.pastRounds.push({ done: pd, ended: isDate(r.ended) ? r.ended : null });
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
    if (typeof st.darkPray === 'boolean') ds.darkPray = st.darkPray;
    if (typeof st.rate === 'number' && st.rate >= 0.5 && st.rate <= 1.6) ds.rate = st.rate;
    if ([2, 5, 10].indexOf(st.minutes) >= 0) ds.minutes = st.minutes;
    if (typeof st.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(st.reminder)) ds.reminder = st.reminder;
    return d;
  }

  function nightHours(when) { var h = (when || new Date()).getHours(); return h >= 21 || h < 6; }

  function themeFor(settings, when) {
    if (settings.theme === 'auto') return nightHours(when) ? 'night' : 'light';
    return settings.theme;
  }

  /* His journal and prayer list as plain text to keep (Faith settings > Save my journal as text). Newest first.
     dayTitle(n) -> the day's title (or ''). Dates are the phone's local time, written the same everywhere. */
  function journalText(state, dayTitle, now) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    function when(at) { var d = new Date(at); return isNaN(d) ? '' : d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
    var KIND = { awe: 'Awe moment', gratitude: 'Thanks' };
    var out = ['My journal (Wellness app), saved ' + when((now || new Date()).toISOString()), ''];
    var items = (state.journal || []).slice().sort(function (a, b) {
      var ta = Date.parse(a && a.at), tb = Date.parse(b && b.at);
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
    if (!items.length) out.push('(No entries yet.)', '');
    items.forEach(function (e) {
      var label = KIND[e.kind] || (e.day ? 'Day ' + e.day + (dayTitle && dayTitle(e.day) ? ': ' + dayTitle(e.day) : '') : 'Journal');
      out.push(when(e.at) + ' · ' + label, String(e.text || '').replace(/\r\n?/g, '\n'), '');
    });
    var open = (state.prayers || []).filter(function (p) { return !p.answered; }), done = (state.prayers || []).filter(function (p) { return p.answered; });
    if (open.length || done.length) {
      out.push('Prayer list', '');
      open.forEach(function (p) { out.push('- ' + p.text + ' (since ' + when(p.at).slice(0, 10) + ')'); });
      done.forEach(function (p) { var note = String(p.note || '').trim(); out.push('- ' + p.text + ': answered or let go ' + when(p.answered).slice(0, 10) + (note ? ' (' + note + ')' : '')); });
      out.push('');
    }
    return out.join('\n');
  }

  var api = {
    journalText: journalText,
    defaults: defaults, makeStore: makeStore, isoDate: isoDate, currentDay: currentDay, finishDay: finishDay,
    unfinishDay: unfinishDay, walkAgain: walkAgain, earlierDayJournal: earlierDayJournal, daysShowedUp: daysShowedUp, finishedToday: finishedToday, doneInLast: doneInLast, addEntry: addEntry,
    setDayJournal: setDayJournal, dayJournal: dayJournal, removeEntry: removeEntry, addPrayer: addPrayer, logSession: logSession, practicesThisWeek: practicesThisWeek,
    lookBack: lookBack, soundsHeavy: soundsHeavy, scaleScript: scaleScript, scriptLength: scriptLength,
    wordsSeconds: wordsSeconds, dayScript: dayScript, PRACTICE_LINES: PRACTICE_LINES, practiceVariants: practiceVariants, practiceScript: practiceScript, practiceTimes: practiceTimes, Player: Player, exportData: exportData, importData: importData,
    themeFor: themeFor, nightHours: nightHours
  };
  root.FCCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
