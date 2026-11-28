/* Workout logic (no DOM). Ported from Braeden's Google Sheets "Dumbbell workout tracker" script and improved:
   - Full-body A / B / C days that rotate (the next one is whatever comes after the last one you did), so a skipped
     day never leaves a muscle untrained for two weeks. Each muscle gets worked 2-3 times a week instead of once.
   - Supersets with a short transition and one real rest per round (as in the sheet); target ranges per exercise.
   - Progression: with the 10 lb pair, hitting the top of the range on every set means "make it harder" (tempo,
     pauses, a harder variation); with adjustable dumbbells it means "add weight" (double progression).
   Storage key 'wl.workout.v1': { equipment, weights:{name:lb}, sessions:[{id, date, day, start, end, sets:[{ex, n, val, w, at}]}],
                                  history:[...imported rows], next: {name: variation note he switched to},
                                  rest: {date: {why, at}} days he chose not to train and why, restRemoved: [{date, at}] (undone; the PC drops them) }. */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');

  /* track: reps | sec | min.  range = target per set.  hard = what to do once every set reaches the top with fixed weight.
     load: how much to add when the dumbbells can change (lb per dumbbell).  side: true = each side counts separately. */
  var EX = {
    'Bulgarian Split Squats': { track: 'reps', range: [8, 15], side: true, hard: '3-sec lowering + 1-sec pause at the bottom', load: 5, cue: 'Back foot on a chair. Most weight on the front leg; knee tracks over toes.' },
    'Pushups': { track: 'reps', range: [8, 20], hard: ['3-sec lowering on every rep', 'feet on a chair'], cue: 'Body in one line, elbows about 45° from your sides, chest to a fist’s height from the floor.' },
    'One-Arm Rows': { track: 'reps', range: [10, 20], side: true, hard: '2-sec squeeze at the top + 3-sec lowering', load: 5, cue: 'Hand and knee on a chair, flat back, pull the dumbbell to your hip.' },
    'Overhead Press': { track: 'reps', range: [10, 20], hard: '1.5 reps (extra half rep at the bottom)', load: 5, cue: 'Standing, ribs down, squeeze your glutes; press straight up.' },
    'Plank': { track: 'sec', range: [30, 90], hard: 'RKC plank: squeeze glutes, pull elbows toward toes', cue: 'Elbows under shoulders, straight line from head to heels.' },
    'Single Leg RDL': { track: 'reps', range: [8, 15], side: true, hard: '3-sec lowering + pause at the bottom', load: 5, cue: 'Hinge at the hip with a soft knee; back flat; hold a chair for balance if needed.' },
    'Pike Pushups': { track: 'reps', range: [6, 15], hard: 'feet on a chair', cue: 'Hips high, head goes forward of your hands, elbows back.' },
    'Rear Delt Flys': { track: 'reps', range: [12, 25], hard: '2-sec hold at the top', load: 2.5, cue: 'Bent over, slight bend in the elbows, lead with the elbows.' },
    'Reverse Lunges': { track: 'reps', range: [10, 20], side: true, hard: '1-sec pause with the back knee just off the floor', load: 5, cue: 'Step back, drop straight down, push through the front heel.' },
    'Dead Bug': { track: 'reps', range: [8, 16], side: true, hard: 'hold a dumbbell in your hands overhead', cue: 'Low back pressed to the floor the whole time; move slowly.' },
    'Split Squats': { track: 'reps', range: [10, 20], side: true, hard: 'front foot on a step or book', load: 5, cue: 'Both feet on the floor, long stance, straight down and up.' },
    'Dumbbell Pullovers': { track: 'reps', range: [12, 25], hard: 'hold both dumbbells together', load: 5, cue: 'Lying on the floor, arms nearly straight, lower behind your head only as far as is comfortable.' },
    'Hammer Curls': { track: 'reps', range: [10, 20], hard: '3-sec lowering', load: 2.5, cue: 'Elbows still at your sides, palms facing each other.' },
    'Single Leg Glute Bridge': { track: 'reps', range: [10, 20], side: true, hard: 'dumbbell on the hip + 2-sec squeeze', cue: 'Drive through the heel, squeeze at the top, don’t arch your back.' },
    'Calf Raises': { track: 'reps', range: [15, 30], hard: 'single-leg, holding both dumbbells', load: 5, cue: 'Full stretch at the bottom, pause at the top. Hold a wall for balance.' },
    'Russian Twists': { track: 'reps', range: [16, 40], hard: 'feet off the floor, both dumbbells together', cue: 'Turn your chest, not just your arms.' },
    'Walk': { track: 'min', range: [10, 40], cue: 'Treadmill or a stroller walk with the baby. Brisk enough to breathe a little harder.' }
  };

  /* Three full-body days, about 25-30 minutes each. Letters = supersets (do one set of each, then rest). */
  var PROGRAM = {
    A: { title: 'Full body A', items: [
      { ex: 'Bulgarian Split Squats', group: 'A', sets: 3, rest: 75 },
      { ex: 'Pushups', group: 'A', sets: 3, rest: 75 },
      { ex: 'One-Arm Rows', group: 'B', sets: 3, rest: 60 },
      { ex: 'Overhead Press', group: 'B', sets: 3, rest: 60 },
      { ex: 'Plank', group: 'C', sets: 2, rest: 45 },
      { ex: 'Walk', group: 'Z', sets: 1, rest: 0, optional: true }
    ] },
    B: { title: 'Full body B', items: [
      { ex: 'Single Leg RDL', group: 'A', sets: 3, rest: 75 },
      { ex: 'Pike Pushups', group: 'A', sets: 3, rest: 75 },
      { ex: 'Reverse Lunges', group: 'B', sets: 2, rest: 60 },
      { ex: 'Rear Delt Flys', group: 'B', sets: 3, rest: 60 },
      { ex: 'Dead Bug', group: 'C', sets: 2, rest: 45 },
      { ex: 'Walk', group: 'Z', sets: 1, rest: 0, optional: true }
    ] },
    C: { title: 'Full body C', items: [
      { ex: 'Split Squats', group: 'A', sets: 3, rest: 75 },
      { ex: 'Pushups', group: 'A', sets: 3, rest: 75 },
      { ex: 'Dumbbell Pullovers', group: 'B', sets: 3, rest: 60 },
      { ex: 'Hammer Curls', group: 'B', sets: 2, rest: 60 },
      { ex: 'Single Leg Glute Bridge', group: 'C', sets: 2, rest: 45 },
      { ex: 'Calf Raises', group: 'C', sets: 2, rest: 45 },
      { ex: 'Walk', group: 'Z', sets: 1, rest: 0, optional: true }
    ] }
  };
  var ORDER = ['A', 'B', 'C'];
  var TRANSITION = 20, WEEK_TARGET = 3, LATE_HOURS = 6;

  /* A day he chose not to train, and why (he asked not to be marked "inconsistent" for days with no time). A rest day
     with a reason counts as done for that day; it never adds to the week's workouts. */
  var REST_REASONS = ['Busy day', 'Sore', 'Tired', 'Sick', 'Planned rest'];
  /* Workouts a week he aims for: 3 (default) or 2 (busy stretches). */
  function targetOf(state) { return state && state.target === 2 ? 2 : WEEK_TARGET; }
  /* Offer 2 a week once: still on 3, and in 2 of the last 3 full weeks he logged a "Busy day" rest and did fewer than 3
     workouts. "Not now" (twoAsked) hides it for 4 weeks. */
  function offerTwo(state, now) {
    now = now || new Date();
    if (targetOf(state) !== 3) return false;
    if (state.twoAsked && (new Date(iso(now)) - new Date(state.twoAsked)) / 864e5 < 28) return false;
    var ws = weekStart(now), worked = {}, busy = 0;
    sessionsWithSets(state).forEach(function (x) { worked[x.date] = 1; }); historyWithSets(state).forEach(function (h) { worked[h.date] = 1; });
    for (var w = 1; w <= 3; w++) {
      var a = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7 * w)), b = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7 * (w - 1)));
      var n = Object.keys(worked).filter(function (d) { return d >= a && d < b; }).length;
      var hadBusy = Object.keys(state.rest || {}).some(function (d) { return d >= a && d < b && !worked[d] && restOn(state, d) === 'Busy day'; });
      if (hadBusy && n < 3) busy++;
    }
    return busy >= 2;
  }
  function restOn(state, day) { var r = state.rest && state.rest[day]; return r && r.why ? r.why : null; }
  function sickRestCleared(state, day, opts) {
    var r = state.rest && state.rest[day];
    return !!(r && r.why === 'Sick' && r.fromCheckin && opts && opts.unwell === false);
  }
  function logRest(state, day, why, now, opts) {
    if (REST_REASONS.indexOf(why) < 0) throw new Error('Unknown reason');
    clearRest(state, day);
    if (!state.rest) state.rest = {};
    var rec = { why: why, at: (now || new Date()).toISOString() };
    if (why === 'Sick' && opts && opts.fromCheckin) rec.fromCheckin = true;
    state.rest[day] = rec;
    var ks = Object.keys(state.rest).sort();
    if (ks.length > 200) ks.slice(0, ks.length - 200).forEach(function (k) { delete state.rest[k]; });
    return state.rest[day];
  }
  function clearRest(state, day) {
    var r = state.rest && state.rest[day]; if (!r) return false;
    delete state.rest[day];
    if (!Array.isArray(state.restRemoved)) state.restRemoved = [];
    state.restRemoved.push({ date: day, at: r.at });
    state.restRemoved = state.restRemoved.slice(-60);
    return true;
  }
  /* Rest days logged in the Monday-to-Sunday week of now: [{date, why}] (only days without a workout). */
  function restThisWeek(state, now) {
    now = now || new Date();
    var ws = weekStart(now), a = iso(ws), b = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7)), t = iso(now);
    var worked = {}; sessionsWithSets(state).forEach(function (s) { worked[s.date] = 1; }); historyWithSets(state).forEach(function (h) { worked[h.date] = 1; });
    return Object.keys(state.rest || {}).sort().filter(function (d) { return d >= a && d < b && d <= t && !worked[d] && restOn(state, d); })
      .map(function (d) { return { date: d, why: state.rest[d].why }; });
  }
  /* "Sore from last time?" before a workout, 1-3 days after the last one: {date: {level, at}}. */
  var SORE_LEVELS = ['No', 'A bit', 'Very'];
  function askSore(state, now) {
    now = now || new Date();
    var d = iso(now);
    if (openSession(state, now) || (state.sore && state.sore[d]) || restOn(state, d)) return false;
    var last = latestByDate(sessionsWithSets(state).filter(function (x) { return x.date <= d; }));
    if (!last || last.date === d) return false;
    var gap = Math.round((new Date(d) - new Date(last.date)) / 864e5);
    return gap >= 1 && gap <= 3;
  }
  function setSore(state, day, level, now) {
    if (SORE_LEVELS.indexOf(level) < 0) throw new Error('Unknown level');
    if (!state.sore) state.sore = {};
    state.sore[day] = { level: level, at: (now || new Date()).toISOString() };
    var ks = Object.keys(state.sore).sort(); if (ks.length > 120) ks.slice(0, ks.length - 120).forEach(function (k) { delete state.sore[k]; });
    return state.sore[day];
  }
  function soreOn(state, day) { var x = state.sore && state.sore[day]; return x ? x.level : null; }
  var REST_LINES = {
    'Busy day': 'Rest day logged: a busy day isn’t a missed workout. The next one picks up where you left off.',
    'Sore': 'Sore muscles a day or two after a workout are normal when you’re getting back into it. A walk or gentle stretching helps; train again when moving feels easy. Sharp or one-sided pain is different: rest it, and if it lasts, ask a doctor or physio.',
    'Tired': 'Rest day logged. Sleep comes first; the next workout keeps.',
    'Sick': 'Rest until you’re better. When you start again, do two sets of each.',
    'Planned rest': 'Rest day. This is when the muscle actually grows.'
  };

  function defaults() { return { equipment: 'fixed10', weights: {}, sessions: [], history: [], next: {} }; }
  var iso = WLD.iso;
  var idn = 0;
  function newId(now) { return (now || new Date()).getTime().toString(36) + '-' + (++idn); }

  function sessionsWithSets(state) { return state.sessions.filter(function (s) { return s.sets && s.sets.length; }); }
  function historyWithSets(state) { return (state.history || []).filter(function (h) { return h && Array.isArray(h.sets) && h.sets.some(function (v) { return +v > 0; }); }); }
  function latestByDate(arr) {
    var best = null;
    arr.forEach(function (x) { if (!best || x.date >= best.date) best = x; });
    return best;
  }

  /* The next day in the rotation: the one after the most recent session (on or before now's day) with sets. */
  function nextDay(state, now) {
    var open = openSession(state, now);
    if (open) return open.day;
    var day = iso(now || new Date());
    var last = latestByDate(sessionsWithSets(state).filter(function (s) { return s.date <= day; }));
    if (!last) return 'A';
    return ORDER[(ORDER.indexOf(last.day) + 1) % ORDER.length] || 'A';
  }

  /* The workout in progress for now's day: not finished, and started that day (or, past midnight, sets within the
     last 6 hours). It stays open however long the gaps are (a set, the baby, another set hours later) until
     "Finish workout". (It used to close after 45 min without a set, cutting a workout in two.) */
  function openSession(state, now, withEmpty) {
    now = now || new Date();
    var day = iso(now), t = now.getTime();
    for (var i = state.sessions.length - 1; i >= 0; i--) {
      var s = state.sessions[i];
      if (s.end) continue;
      if (!s.sets.length && !withEmpty) continue; // every set undone or removed: not a workout in progress (the day can be changed again)
      if (s.date === day) return s;
      var lastAt = s.sets.length ? new Date(s.sets[s.sets.length - 1].at).getTime() : new Date(s.start).getTime();
      if (s.date < day && t >= lastAt && t - lastAt < LATE_HOURS * 3600e3) return s;
    }
    return null;
  }

  /* How long he has actually been training in a session: from the start through each set to now (or its end), leaving
     out any gap over 90 minutes (he did half, then the rest hours later). {secs, broke: true when a gap was left out}. */
  var GAP_MS = 90 * 60e3;
  function activeTime(s, now) {
    var pts = [Date.parse(s.start)].concat((s.sets || []).map(function (x) { return Date.parse(x.at); }));
    pts.push(s.end ? Date.parse(s.end) : (now || new Date()).getTime());
    pts = pts.filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return a - b; });
    var ms = 0, broke = false;
    for (var i = 1; i < pts.length; i++) { var d = pts[i] - pts[i - 1]; if (d > GAP_MS) broke = true; else ms += d; }
    return { secs: Math.round(ms / 1000), broke: broke };
  }

  /* An unfinished session from an earlier day is closed at its last set (so it never swallows a later workout). */
  function closeStale(state, now) {
    var day = iso(now || new Date()), open = openSession(state, now);
    state.sessions.forEach(function (s) {
      if (s.end || s === open || s.date >= day) return;
      s.end = s.sets.length ? s.sets[s.sets.length - 1].at : s.start;
    });
  }

  /* The last session with sets that was finished on now's day: "Carry on" reopens it (finished by mistake). */
  function finishedToday(state, now) {
    var day = iso(now || new Date());
    for (var i = state.sessions.length - 1; i >= 0; i--) { var s = state.sessions[i]; if (s.date === day && s.end && s.sets.length) return s; }
    return null;
  }
  function reopen(state, id) {
    var s = state.sessions.filter(function (x) { return x.id === id; })[0];
    if (s) s.end = null;
    return s || null;
  }

  function startSession(state, day, now) {
    now = now || new Date();
    var open = openSession(state, now);
    if (open) return open;
    closeStale(state, now);
    var s = { id: newId(now), date: iso(now), day: day, start: now.toISOString(), end: null, sets: [] };
    // an empty session left behind is replaced (one with removed sets is kept, closed, so the PC still hears of them)
    state.sessions = state.sessions.filter(function (x) { return x.sets.length || x.end || (x.removed && x.removed.length); });
    state.sessions.forEach(function (x) { if (!x.sets.length && !x.end) x.end = x.start; });
    // kept in date order (a session logged for an earlier day goes before later ones)
    var k = state.sessions.length;
    while (k > 0 && state.sessions[k - 1].start > s.start) k--;
    state.sessions.splice(k, 0, s);
    return s;
  }

  /* With no time given: the most recent unfinished one (the old behaviour). */
  function lastUnfinished(state) { for (var i = state.sessions.length - 1; i >= 0; i--) if (!state.sessions[i].end) return state.sessions[i]; return null; }

  /* Compact closed sessions older than ARCHIVE_DAYS (6 months) into state.archive ({days, bests}) so multi-year
     storage stays well within WebView localStorage limits while keeping all-time PRs (bestSet), total workout days,
     and weekly streaks (weekStats) exact, and keeping the last 6 months of sessions in full for every chart and summary. */
  var ARCHIVE_DAYS = 180;
  function betterSet(best, val, w, date) {
    val = +val; if (!(val > 0)) return best;
    var wt = w > 0 ? +w : 0;
    var bw = best && best.w > 0 ? best.w : 0;
    if (!best || wt > bw || (wt === bw && val > best.val)) return { val: val, w: wt || null, date: date };
    return best;
  }
  function compact(state, now) {
    if (!state || !Array.isArray(state.sessions) || !state.sessions.length) return 0;
    var refIso = typeof now === 'string' && WLD.isDate(now) ? now : iso(now || new Date());
    var cutoff = WLD.addDays(refIso, -ARCHIVE_DAYS);
    var hasOld = state.sessions.some(function (s) { return s && s.end && s.date && s.date < cutoff; });
    if (!hasOld) return 0;
    var arch = state.archive && typeof state.archive === 'object' ? state.archive : { days: [], bests: {} };
    var dayMap = {}, bests = arch.bests && typeof arch.bests === 'object' ? arch.bests : {};
    (Array.isArray(arch.days) ? arch.days : []).forEach(function (d) { if (WLD.isDate(d)) dayMap[d] = 1; });
    var kept = [], moved = 0;
    state.sessions.forEach(function (s) {
      if (s && s.end && s.date && s.date < cutoff) {
        moved++;
        var sets = (s.sets || []).filter(function (x) { return x && +x.val > 0 && Object.prototype.hasOwnProperty.call(EX, x.ex); });
        if (sets.length) {
          dayMap[s.date] = 1;
          sets.forEach(function (x) { bests[x.ex] = betterSet(bests[x.ex] || null, x.val, x.w, s.date); });
        }
      } else {
        kept.push(s);
      }
    });
    state.sessions = kept;
    var days = Object.keys(dayMap).sort();
    if (days.length || Object.keys(bests).length) state.archive = { days: days, bests: bests };
    else delete state.archive;
    return moved;
  }

  function endSession(state, now) {
    var s = now ? openSession(state, now, true) : lastUnfinished(state);
    if (!s) return;
    if (!s.sets.length) { if (s.removed && s.removed.length) s.end = s.start; else state.sessions.splice(state.sessions.indexOf(s), 1); }
    else s.end = (now || new Date()).toISOString();
    compact(state, now || (s.date || new Date()));
  }

  /* After set n of item idx: a superset partner still due this round -> 20 s transition; another round -> rest;
     last round -> rest, then the next group. Same rules as the sheet's getRestInfo. */
  function restInfo(day, idx, n) {
    var plan = PROGRAM[day].items, cur = plan[idx];
    if (!cur || !cur.rest) return { secs: 0, label: '' };
    var group = plan.filter(function (e) { return e.group === cur.group; });
    var pos = group.indexOf(cur);
    var partner = group.slice(pos + 1).filter(function (e) { return e.sets >= n; })[0];
    if (partner) return { secs: TRANSITION, label: 'Next: ' + partner.ex + ' (set ' + n + ')', next: plan.indexOf(partner), set: n };
    var round = group.filter(function (e) { return e.sets > n; })[0];
    if (round) return { secs: cur.rest, label: 'Rest, then ' + round.ex + ' set ' + (n + 1), next: plan.indexOf(round), set: n + 1 };
    var after = plan.filter(function (e, i) { return i > idx && e.group !== cur.group; })[0];
    if (after) return { secs: cur.rest, label: 'Rest, then ' + after.ex + (after.optional ? ' (optional)' : ''), next: plan.indexOf(after), set: 1 };
    return { secs: 0, label: '' };
  }

  function cleanWeight(w) {
    if (w == null || w === '') return null;
    var n = +w;
    return isFinite(n) && n >= 0 ? n : null;
  }

  function logSet(state, day, idx, val, weight, now) {
    now = now || new Date();
    var s = startSession(state, day, now), item = PROGRAM[day].items[idx];
    var n = s.sets.filter(function (x) { return x.i === idx; }).length + 1;
    var set = { i: idx, ex: item.ex, n: n, val: +val, w: cleanWeight(weight), at: now.toISOString() };
    s.sets.push(set);
    if (set.w != null) state.weights[item.ex] = set.w;
    clearRest(state, s.date); // he trained after all: that day isn't a rest day any more (the PC drops it too)
    return { set: set, rest: n <= item.sets ? restInfo(day, idx, n) : { secs: 0, label: '' } };
  }

  function undoSet(state, now) {
    var s = now ? openSession(state, now) : lastUnfinished(state);
    if (!s || !s.sets.length) return null;
    var x = s.sets.pop();
    (s.removed = s.removed || []).push({ at: x.at, i: x.i }); // the PC may have it already: tell it it's gone
    return x;
  }

  /* Fix a logged set (mistyped reps): set k (0-based) of plan item idx in the open session. val <= 0 or null removes
     it; the later sets of that exercise are renumbered. Returns the set, or null. */
  function editSet(state, idx, k, val, weight, now) {
    var s = now ? openSession(state, now) : lastUnfinished(state); if (!s) return null;
    var mine = s.sets.filter(function (x) { return x.i === idx; }), set = mine[k];
    if (!set) return null;
    if (!(+val > 0)) {
      s.sets.splice(s.sets.indexOf(set), 1);
      (s.removed = s.removed || []).push({ at: set.at, i: set.i }); // so the PC's log drops it too
      s.sets.filter(function (x) { return x.i === idx; }).forEach(function (x, j) { x.n = j + 1; });
      return set;
    }
    set.val = +val;
    if (weight !== undefined) { set.w = cleanWeight(weight); if (set.w != null && k === mine.length - 1) state.weights[set.ex] = set.w; }
    set.edited = (now || new Date()).toISOString();
    return set;
  }

  /* Every performance of an exercise, newest last: [{date, sets:[vals], w}] from the app's sessions and the imported sheet. */
  /* "date|exercise" of every exercise done in the app: an imported sheet row for the same day and exercise is the same
     workout written twice (he kept the sheet going for a while), so the app's own sets win. */
  function appDone(state) {
    var k = {}; state.sessions.forEach(function (s) { (s.sets || []).forEach(function (x) { if (+x.val > 0) k[s.date + '|' + x.ex] = 1; }); });
    return k;
  }
  function performances(state, name) {
    var out = [], dup = appDone(state);
    state.history.forEach(function (h) {
      var sets = h.ex === name && !dup[h.date + '|' + name] ? h.sets.filter(function (v) { return +v > 0; }) : []; // empty sheet cells as 0 aren't sets
      if (sets.length) out.push({ date: h.date, sets: sets, w: h.w });
    });
    state.sessions.forEach(function (s) {
      var sets = s.sets.filter(function (x) { return x.ex === name; });
      if (sets.length) out.push({ date: s.date, sets: sets.map(function (x) { return x.val; }), w: sets[sets.length - 1].w, session: s.id });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function last(state, name, exceptSession) {
    var p = performances(state, name).filter(function (x) { return !exceptSession || x.session !== exceptSession; });
    return p.length ? p[p.length - 1] : null;
  }
  /* Best single set for an exercise across app sessions and non-duplicate sheet rows: heaviest weight first,
     then highest reps/sec/min at that weight. Returns {val, w, date} or null. */
  function bestSet(state, name) {
    var best = null, dup = appDone(state);
    function consider(val, w, date) { best = betterSet(best, val, w, date); }
    var ab = state.archive && state.archive.bests && Object.prototype.hasOwnProperty.call(state.archive.bests, name) ? state.archive.bests[name] : null;
    if (ab) consider(ab.val, ab.w, ab.date);
    (state.history || []).forEach(function (h) {
      if (h.ex === name && !dup[h.date + '|' + name] && Array.isArray(h.sets))
        h.sets.forEach(function (v) { consider(v, h.w, h.date); });
    });
    (state.sessions || []).forEach(function (s) {
      (s.sets || []).forEach(function (x) { if (x.ex === name) consider(x.val, x.w, s.date); });
    });
    return best;
  }

  function ready(item, lastPerf) {
    var e = EX[item.ex];
    if (!e || !e.range || !lastPerf) return false;
    var vals = lastPerf.sets.slice(0, item.sets);
    return vals.length >= item.sets && vals.every(function (v) { return +v >= e.range[1]; });
  }

  function hardSteps(name) {
    var e = EX[name];
    if (!e || !e.hard) return [];
    return Array.isArray(e.hard) ? e.hard.slice() : [e.hard];
  }
  function hardLevel(state, name) {
    var steps = hardSteps(name), cur = state && state.next && state.next[name];
    if (!steps.length || !cur) return 0;
    var idx = steps.indexOf(cur);
    if (idx >= 0) return idx + 1;
    // Backwards compatibility: older saves stored multi-step progressions joined by ", then "
    if (steps.length > 1 && cur === steps.join(', then ')) return steps.length;
    return 0;
  }
  function nextHard(state, name) {
    var steps = hardSteps(name), lvl = hardLevel(state, name);
    return steps[lvl] || null;
  }
  /* What he is doing now for an exercise's harder versions: every step up to his level ("3-sec lowering on every rep +
     feet on a chair"), since the steps add up; '' if none. */
  function doingText(state, name) {
    var steps = hardSteps(name), lvl = hardLevel(state, name), cur = state && state.next && state.next[name];
    if (lvl > 0) return steps.slice(0, lvl).join(' + ');
    return typeof cur === 'string' ? cur : '';
  }
  function setHard(state, name, level) {
    var steps = hardSteps(name);
    if (!state.next) state.next = {};
    var lvl = Math.max(0, Math.min(steps.length, Math.floor(+level) || 0));
    if (lvl <= 0) delete state.next[name];
    else state.next[name] = steps[lvl - 1];
    return lvl;
  }

  /* What to do this time, in plain words. */
  function advice(state, item, lastPerf) {
    var e = EX[item.ex]; if (!e) return '';
    var unit = e.track === 'sec' ? 'sec' : e.track === 'min' ? 'min' : 'reps';
    if (e.track === 'min') return 'Optional: ' + e.range[0] + '–' + e.range[1] + ' min.';
    var target = item.sets + ' × ' + e.range[0] + '–' + e.range[1] + ' ' + unit + (e.side ? ' each side' : '');
    if (!lastPerf) return target + '. Start comfortably; stop with 1–2 good reps left in the tank.';
    var lastTxt = 'Last: ' + lastPerf.sets.join('/') + (lastPerf.w ? ' @ ' + lastPerf.w + ' lb' : '');
    if (ready(item, lastPerf)) {
      if (state.equipment === 'adjustable' && e.load) {
        var w = (+lastPerf.w || 10) + e.load;
        return target + '. ' + lastTxt + '. ⬆ You hit the top on every set: go up to ' + w + ' lb and aim for the bottom of the range again.';
      }
      var nh = nextHard(state, item.ex);
      if (nh) return target + '. ' + lastTxt + '. ⬆ Ready for harder: ' + nh + '.';
      return target + '. ' + lastTxt + '. ⬆ Top of the range: add a set or slow the lowering to 3–4 seconds.';
    }
    var lowest = Math.min.apply(null, lastPerf.sets.map(Number));
    if (lowest < e.range[0] && lastPerf.sets.length) return target + '. ' + lastTxt + '. Below the range last time: same again, or use the easier version.';
    return target + '. ' + lastTxt + '. Try to beat it by one rep on at least one set.';
  }

  /* Weekly view: sessions (with sets) this week (Mon-Sun), streak of weeks hitting the target, totals. */
  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function weekStats(state, now) {
    now = now || new Date();
    var wsDate = weekStart(now), ws = iso(wsDate), todayIso = iso(now), nextWs = iso(new Date(wsDate.getFullYear(), wsDate.getMonth(), wsDate.getDate() + 7));
    var days = {};
    ((state.archive && Array.isArray(state.archive.days)) ? state.archive.days : []).forEach(function (d) { if (WLD.isDate(d)) days[d] = 1; });
    sessionsWithSets(state).forEach(function (s) { days[s.date] = 1; });
    historyWithSets(state).forEach(function (h) { days[h.date] = 1; });
    var thisWeek = Object.keys(days).filter(function (d) { return d >= ws && d < nextWs && d <= todayIso; }).length;
    // weeks in a row (before this one) with at least 2 workouts
    var streak = 0, w = weekStart(now);
    for (;;) {
      w.setDate(w.getDate() - 7);
      var a = iso(w), b = iso(new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7));
      var n = Object.keys(days).filter(function (d) { return d >= a && d < b; }).length;
      if (n >= 2) streak++; else break;
      if (streak > 520) break;
    }
    return { thisWeek: thisWeek, target: targetOf(state), streak: streak, total: Object.keys(days).filter(function (d) { return d <= todayIso; }).length };
  }

  /* The last 4 weeks (Monday 3 weeks ago to this Sunday), one entry per day: kind 'workout' | 'rest' (a rest day he
     chose, with why) | 'none' | 'future'. For Progress; no streaks. */
  function fourWeeks(state, now) {
    now = now || new Date();
    var ws = weekStart(now), todayIso = iso(now), days = {}, out = [];
    sessionsWithSets(state).forEach(function (s) { days[s.date] = 1; }); historyWithSets(state).forEach(function (h) { days[h.date] = 1; });
    for (var i = 0; i < 28; i++) {
      var d = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 21 + i)), why = restOn(state, d);
      out.push(d > todayIso ? { date: d, kind: 'future' } : days[d] ? { date: d, kind: 'workout' } : why ? { date: d, kind: 'rest', why: why } : { date: d, kind: 'none' });
    }
    return out;
  }

  /* Weekly sets per body area (Mon-Sun), this week and last, from logged sessions and the imported sheet. About 6+
     hard sets per area a week is a sound beginner dose (general guidance). Walk is cardio, not counted. */
  var AREA = { 'Bulgarian Split Squats': 'legs', 'Single Leg RDL': 'legs', 'Reverse Lunges': 'legs', 'Split Squats': 'legs',
    'Single Leg Glute Bridge': 'legs', 'Calf Raises': 'legs', 'Pushups': 'push', 'Overhead Press': 'push', 'Pike Pushups': 'push',
    'One-Arm Rows': 'pull', 'Rear Delt Flys': 'pull', 'Dumbbell Pullovers': 'pull', 'Hammer Curls': 'pull',
    'Plank': 'core', 'Dead Bug': 'core', 'Russian Twists': 'core' };
  var AREAS = ['legs', 'push', 'pull', 'core'], AREA_TARGET = { legs: 6, push: 6, pull: 6, core: 3 };
  function weekVolume(state, now) {
    now = now || new Date();
    var ws = weekStart(now), a = iso(ws), todayIso = iso(now), nextWs = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7)), b = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7));
    var out = { thisWeek: {}, lastWeek: {} };
    AREAS.forEach(function (k) { out.thisWeek[k] = 0; out.lastWeek[k] = 0; });
    function add(date, ex, n) {
      var area = AREA[ex]; if (!area || !n) return;
      if (date >= a && date < nextWs && date <= todayIso) out.thisWeek[area] += n; else if (date >= b && date < a) out.lastWeek[area] += n;
    }
    state.sessions.forEach(function (s) { (s.sets || []).forEach(function (x) { if (+x.val > 0) add(s.date, x.ex, 1); }); });
    var dup = appDone(state);
    state.history.forEach(function (h) { if (!dup[h.date + '|' + h.ex]) add(h.date, h.ex, h.sets.filter(function (v) { return +v > 0; }).length); });
    return out;
  }
  /* One plain line about the week's balance, or '' when nothing is logged yet. */
  function volumeAdvice(state, now) {
    var v = weekVolume(state, now).thisWeek, total = AREAS.reduce(function (t, k) { return t + v[k]; }, 0);
    if (!total) return '';
    var behind = AREAS.filter(function (k) { return v[k] < AREA_TARGET[k]; });
    if (!behind.length) return 'Every area got enough work this week. Anything more is a bonus.';
    var k = behind.sort(function (x, y) { return v[x] / AREA_TARGET[x] - v[y] / AREA_TARGET[y]; })[0];
    var best = ORDER.map(function (d) { return { d: d, n: PROGRAM[d].items.filter(function (it) { return AREA[it.ex] === k; }).reduce(function (t, it) { return t + it.sets; }, 0) }; })
      .sort(function (x, y) { return y.n - x.n; })[0];
    return k.charAt(0).toUpperCase() + k.slice(1) + ' has ' + v[k] + ' of about ' + AREA_TARGET[k] + ' sets this week: Day ' + best.d + ' gives it the most.';
  }

  /* One sentence of coaching for the Home card. */
  function coach(state, now, opts) {
    now = now || new Date();
    var st = weekStats(state, now), dow = (now.getDay() + 6) % 7, todayIso = iso(now); // 0 = Monday
    var done = sessionsWithSets(state).filter(function (s) { return s.date <= todayIso; });
    var hist = historyWithSets(state).filter(function (h) { return h.date <= todayIso; });
    var lastSess = latestByDate(done), lastHist = latestByDate(hist);
    var lastSessDate = lastSess ? lastSess.date : null, lastHistDate = lastHist ? lastHist.date : null;
    var lastDate = lastSessDate && lastHistDate ? (lastSessDate > lastHistDate ? lastSessDate : lastHistDate) : (lastSessDate || lastHistDate);
    var gap = lastDate ? Math.round((new Date(todayIso) - new Date(lastDate)) / 864e5) : null;
    var open = openSession(state, now);
    if (open) return 'In progress: ' + open.sets.length + ' set' + (open.sets.length === 1 ? '' : 's') + ' so far. Keep going.';
    if (lastDate === iso(now)) return 'Done for today. Rest is when the muscle actually grows.';
    var restToday = restOn(state, todayIso);
    if (restToday) return sickRestCleared(state, todayIso, opts) ? 'Rest day logged. The next workout picks up where you left off.' : REST_LINES[restToday];
    var soreToday = soreOn(state, todayIso);
    if (soreToday === 'Very') return 'Very sore today: do two sets of each and keep the weights the same, or make it a rest day (“Not training today?” › Sore). Moving gently usually helps it ease.';
    if (soreToday === 'A bit') return 'A bit sore is normal: warm up well and it usually eases once you’re moving.';
    var yIso = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    if (restOn(state, yIso) === 'Sore') return 'Still sore? Do two sets of each today and keep the weights the same; moving usually eases it. If it still hurts to move, rest one more day.';
    if (restOn(state, yIso) === 'Tired') return 'Rested yesterday: today’s workout as planned, or two sets of each if you’re still tired.';
    // back after being sick (a "Sick" rest day in the last week, no workout since, and today's check-in isn't unwell): go lighter once
    if (!(opts && opts.unwell)) {
      for (var sd = 1; sd <= 7; sd++) {
        var sIso = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sd));
        if (lastDate && lastDate >= sIso) break; // trained since
        // a sick rest tapped from Home whose day's note was later changed to fine (451) wasn't a sick day after all
        if (restOn(state, sIso) === 'Sick' && state.rest[sIso].fromCheckin && opts && opts.unwellOn && !opts.unwellOn(sIso)) continue;
        if (restOn(state, sIso) === 'Sick') return 'First workout after being sick: go lighter today (two sets of each, same weights) and stop if it feels wrong. Rest another day if you’re not really better.';
      }
    }
    if (gap != null && gap > 10) return 'It’s been ' + gap + ' days. Start easy today: do two sets of each, not three.';
    // the first workouts back (1-2 in the last 4 weeks): soreness is normal and drops after a couple of weeks; leave reps in reserve
    var from28 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28)), recent = {};
    done.forEach(function (x) { if (x.date >= from28) recent[x.date] = 1; }); hist.forEach(function (x) { if (x.date >= from28) recent[x.date] = 1; });
    var nRecent = Object.keys(recent).length;
    if (gap != null && nRecent >= 1 && nRecent <= 2 && st.thisWeek < st.target) return 'Early days back: stop each set 2–3 reps before you have to. Feeling sore after the first workouts is normal and gets much less within a couple of weeks.';
    if (st.thisWeek >= st.target) return (st.target === 2 ? 'Two' : 'Three') + ' this week. Anything more is a bonus: a stroller walk counts.';
    var left = st.target - st.thisWeek, daysLeft = 7 - dow;
    var rests = restThisWeek(state, now).length;
    if (left > daysLeft) return 'A busy week' + (rests ? ' (' + rests + ' rest day' + (rests === 1 ? '' : 's') + ' logged)' : '') + '. One good workout still counts; don’t try to catch up all at once.';
    return st.thisWeek + ' of ' + st.target + ' this week. ' + (st.streak >= 2 ? st.streak + ' good weeks in a row.' : 'About 30 minutes, any time today.');
  }

  /* He expects adjustable dumbbells after Christmas: from 26 Dec, while still on the 10 lb pair, ask (again a week
     after "Not yet"). */
  function askDumbbells(state, now) {
    now = now || new Date();
    if (state.equipment !== 'fixed10' || iso(now) < '2026-12-26') return false;
    return !state.dbAsked || (new Date(iso(now)) - new Date(state.dbAsked)) / 864e5 >= 7;
  }

  /* Home's "today" line: a workout done today, a rest day that's part of the plan (worked out yesterday, or the
     week's three are done), or the next workout. {done, text} */
  function today(state, now, opts) {
    now = now || new Date();
    var d = iso(now), y = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    var dates = {}; sessionsWithSets(state).forEach(function (s) { dates[s.date] = 1; }); historyWithSets(state).forEach(function (h) { dates[h.date] = 1; });
    var open = openSession(state, now);
    if (open) return { done: false, text: 'in progress (' + PROGRAM[open.day].title + ')' };
    if (dates[d]) return { done: true, text: 'workout done' };
    var rd = restOn(state, d);
    if (rd) return { done: true, text: sickRestCleared(state, d, opts) ? 'rest day' : 'rest day (' + rd.toLowerCase() + ')' };
    var st = weekStats(state, now);
    if (st.thisWeek >= st.target) return { done: true, text: st.target + ' this week, rest or a walk' };
    if (dates[y]) return { done: true, text: 'rest day (worked out yesterday)' };
    var txt = PROGRAM[nextDay(state, now)].title + ' (about 30 min)';
    // Friday to Sunday: name an area that's behind for the week (if anything was logged this week)
    if ((now.getDay() + 6) % 7 >= 4) {
      var v = weekVolume(state, now).thisWeek, tot = AREAS.reduce(function (t, k) { return t + v[k]; }, 0);
      var behind = AREAS.filter(function (k) { return v[k] < AREA_TARGET[k]; }).sort(function (x, y) { return v[x] / AREA_TARGET[x] - v[y] / AREA_TARGET[y]; });
      if (tot && behind.length) txt += ', light on ' + behind[0] + ' this week';
    }
    return { done: false, text: txt };
  }

  /* Import the Google Sheet "Log" tab saved as CSV (File > Download > CSV): Date, Day, Exercise, Set 1-4, Weight, ... */
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  var RENAME = { 'Treadmill Walk': 'Walk' };
  function importSheetCsv(state, text) {
    var rows = parseCsv(String(text || ''));
    if (!rows.length || !/date/i.test(rows[0][0] || '') || !/exercise/i.test(rows[0][2] || '')) throw new Error('That doesn’t look like the workout sheet’s Log (Date, Day, Exercise, Set 1...).');
    var seen = {}, added = 0;
    state.history.forEach(function (h) { seen[h.date + '|' + h.ex] = 1; });
    rows.slice(1).forEach(function (r) {
      var date = (r[0] || '').trim(), ex = (r[2] || '').trim();
      if (!WLD.isDate(date) || !ex || ex === 'Rest') return;
      var sets = r.slice(3, 7).map(function (v) { return String(v).trim(); }).filter(function (v) { return v !== '' && +v > 0; }).map(Number);
      if (!sets.length) return;
      var name = RENAME[ex] || ex;
      var w = parseFloat(String(r[7] || '').replace(/[^\d.]/g, ''));
      if (name === 'Walk') { w = null; sets = [sets.reduce(function (a, b) { return a + b; }, 0)]; } // minutes; the sheet kept speed in Weight
      var key = date + '|' + name; if (seen[key]) return; seen[key] = 1;
      state.history.push({ date: date, ex: name, sets: sets, w: isNaN(w) ? null : w, from: 'sheet' });
      added++;
    });
    state.history.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return added;
  }

  /* General adult age-group benchmarks for every exercise (general fitness reference only, never medical advice).
     Pushups use ACSM/CSEP adult endurance norms; Walk uses WHO/CSEP activity guidance; other exercises are realistic
     general-adult single-set estimates scaled for bodyweight / light (~10 lb) dumbbells. */
  function normBrackets(vals, unit, source) {
    var out = {}, bs = ['20–29', '30–39', '40–49', '50–59', '60+'];
    bs.forEach(function (b, i) { out[b] = { avg: vals[i][0], low: vals[i][1], high: vals[i][2], good: vals[i][3], unit: unit, source: source }; });
    return out;
  }
  var AGE_NORMS = {
    'Pushups': normBrackets([[23, 17, 29, 35], [19, 13, 24, 30], [15, 11, 20, 25], [13, 9, 17, 22], [11, 8, 14, 18]], 'reps', 'ACSM/CSEP general adult reference'),
    'Plank': normBrackets([[60, 45, 90, 90], [55, 45, 75, 85], [50, 40, 65, 75], [40, 35, 55, 65], [35, 30, 45, 55]], 'sec', 'rough guide only (there are no published age norms for planks)'),
    'Walk': normBrackets([[25, 20, 30, 30], [25, 20, 30, 30], [25, 20, 30, 30], [25, 20, 30, 30], [25, 20, 30, 30]], 'min', 'WHO/CSEP ~150 min/week activity guide'),
    'Bulgarian Split Squats': normBrackets([[12, 8, 15, 18], [10, 7, 14, 16], [9, 6, 12, 15], [8, 5, 11, 13], [7, 5, 10, 12]], 'reps', 'general adult estimate (per leg, bodyweight/light DB)'),
    'One-Arm Rows': normBrackets([[16, 12, 20, 24], [15, 11, 19, 22], [13, 10, 17, 20], [12, 9, 15, 18], [10, 8, 14, 16]], 'reps', 'general adult estimate (per side, light DB)'),
    'Overhead Press': normBrackets([[15, 11, 19, 22], [14, 10, 18, 20], [12, 9, 16, 18], [10, 8, 14, 16], [9, 7, 12, 15]], 'reps', 'general adult estimate (light DBs)'),
    'Single Leg RDL': normBrackets([[12, 8, 15, 18], [11, 8, 14, 16], [10, 7, 13, 15], [9, 6, 12, 14], [8, 5, 10, 12]], 'reps', 'general adult estimate (per leg, bodyweight/light DB)'),
    'Pike Pushups': normBrackets([[10, 6, 14, 18], [9, 5, 12, 15], [7, 4, 10, 13], [6, 4, 9, 11], [5, 3, 8, 10]], 'reps', 'general adult estimate (bodyweight)'),
    'Rear Delt Flys': normBrackets([[16, 12, 20, 25], [15, 11, 19, 23], [13, 10, 17, 21], [12, 9, 15, 19], [10, 8, 14, 17]], 'reps', 'general adult estimate (light DBs)'),
    'Reverse Lunges': normBrackets([[15, 11, 19, 22], [14, 10, 18, 20], [12, 9, 16, 18], [11, 8, 14, 16], [9, 7, 12, 15]], 'reps', 'general adult estimate (per leg, bodyweight/light DB)'),
    'Dead Bug': normBrackets([[12, 9, 15, 18], [11, 8, 14, 16], [10, 7, 13, 15], [9, 6, 12, 14], [8, 6, 10, 12]], 'reps', 'general adult estimate (per side, slow controlled reps)'),
    'Split Squats': normBrackets([[15, 11, 19, 22], [14, 10, 18, 20], [12, 9, 16, 18], [11, 8, 14, 16], [9, 7, 12, 15]], 'reps', 'general adult estimate (per leg, bodyweight/light DB)'),
    'Dumbbell Pullovers': normBrackets([[18, 14, 22, 25], [16, 12, 20, 24], [15, 11, 18, 22], [13, 10, 16, 20], [11, 8, 15, 18]], 'reps', 'general adult estimate (light DB)'),
    'Hammer Curls': normBrackets([[16, 12, 20, 24], [15, 11, 19, 22], [13, 10, 17, 20], [12, 9, 15, 18], [10, 8, 14, 16]], 'reps', 'general adult estimate (light DBs)'),
    'Single Leg Glute Bridge': normBrackets([[15, 11, 19, 22], [14, 10, 18, 20], [12, 9, 16, 18], [11, 8, 14, 16], [9, 7, 12, 15]], 'reps', 'general adult estimate (per leg, bodyweight)'),
    'Calf Raises': normBrackets([[25, 18, 30, 35], [22, 16, 28, 32], [20, 15, 25, 30], [18, 13, 22, 27], [15, 11, 20, 24]], 'reps', 'general adult estimate (standing)'),
    'Russian Twists': normBrackets([[28, 20, 36, 42], [24, 18, 32, 38], [22, 16, 28, 34], [18, 14, 24, 30], [16, 12, 20, 26]], 'reps', 'general adult estimate (total twists)')
  };
  function cleanAge(age) {
    if (age == null || age === '') return null;
    var a = Math.floor(+age);
    return isFinite(a) && a >= 18 && a <= 90 ? a : null;
  }
  function ageBracket(age) {
    var a = cleanAge(age); if (a == null) return null;
    if (a < 30) return '20–29';
    if (a < 40) return '30–39';
    if (a < 50) return '40–49';
    if (a < 60) return '50–59';
    return '60+';
  }
  function benchmark(exName, age) {
    var e = EX[exName];
    if (!e) return null;
    var unit = e.track === 'sec' ? 'sec' : e.track === 'min' ? 'min' : 'reps';
    var br = ageBracket(age);
    if (br && AGE_NORMS[exName] && AGE_NORMS[exName][br]) {
      var n = AGE_NORMS[exName][br];
      return { kind: 'age', bracket: br, avg: n.avg, low: n.low, high: n.high, good: n.good, unit: n.unit, source: n.source };
    }
    if (e.range) return { kind: 'target', avg: e.range[1], low: e.range[0], high: e.range[1], unit: unit, source: 'Program set target' };
    return null;
  }

  /* Last N Monday-to-Sunday weeks (oldest first): [{start, end, label, workouts, sets}]. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function weeklyTrend(state, now, weeks) {
    now = now || new Date();
    weeks = weeks || 8;
    var ws = weekStart(now), todayIso = iso(now), dup = appDone(state);
    var daySet = {}, setsByDay = {};
    sessionsWithSets(state).forEach(function (s) {
      if (s.date > todayIso) return;
      daySet[s.date] = 1;
      setsByDay[s.date] = (setsByDay[s.date] || 0) + s.sets.filter(function (x) { return +x.val > 0; }).length;
    });
    historyWithSets(state).forEach(function (h) {
      if (h.date > todayIso) return;
      daySet[h.date] = 1;
      if (!dup[h.date + '|' + h.ex]) setsByDay[h.date] = (setsByDay[h.date] || 0) + h.sets.filter(function (v) { return +v > 0; }).length;
    });
    var out = [];
    for (var w = weeks - 1; w >= 0; w--) {
      var d0 = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7 * w);
      var d1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7);
      var a = iso(d0), b = iso(d1), workouts = 0, sets = 0;
      Object.keys(daySet).forEach(function (k) { if (k >= a && k < b) workouts++; });
      Object.keys(setsByDay).forEach(function (k) { if (k >= a && k < b) sets += setsByDay[k]; });
      out.push({ start: a, end: iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 6)), label: MONTHS[d0.getMonth()] + ' ' + d0.getDate(), workouts: workouts, sets: sets });
    }
    return out;
  }

  /* Chronological points for an exercise progress chart: [{date, sets, w, bestVal, totalReps, volume}]. */
  function exerciseSeries(state, name) {
    return performances(state, name).map(function (p) {
      var bestVal = Math.max.apply(null, p.sets.map(Number));
      var totalReps = p.sets.reduce(function (a, b) { return a + +b; }, 0);
      var w = p.w > 0 ? +p.w : null;
      return { date: p.date, sets: p.sets, w: w, bestVal: bestVal, totalReps: totalReps, volume: Math.round(totalReps * (w || 1) * 10) / 10 };
    });
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.sessions)) return null;
    var d = defaults(), isDate = WLD.isDate;
    d.equipment = s.equipment === 'adjustable' ? 'adjustable' : 'fixed10';
    if (isDate(s.dbAsked)) d.dbAsked = s.dbAsked;
    if (s.target === 2) d.target = 2;
    if (isDate(s.twoAsked)) d.twoAsked = s.twoAsked;
    if (typeof s.age === 'number') { var ag = cleanAge(s.age); if (ag != null) d.age = ag; }
    Object.keys(s.weights || {}).forEach(function (k) { var w = cleanWeight(s.weights[k]); if (EX[k] && typeof s.weights[k] === 'number' && w != null) d.weights[k] = w; });
    Object.keys(s.next || {}).forEach(function (k) { if (EX[k] && typeof s.next[k] === 'string') d.next[k] = s.next[k]; });
    if (s.rest && typeof s.rest === 'object') Object.keys(s.rest).sort().slice(-200).forEach(function (k) {
      var r = s.rest[k]; if (isDate(k) && r && REST_REASONS.indexOf(r.why) >= 0 && typeof r.at === 'string' && !isNaN(Date.parse(r.at))) {
        if (!d.rest) d.rest = {};
        var rec = { why: r.why, at: r.at };
        if (r.why === 'Sick' && r.fromCheckin === true) rec.fromCheckin = true;
        d.rest[k] = rec;
      }
    });
    if (s.sore && typeof s.sore === 'object') Object.keys(s.sore).sort().slice(-120).forEach(function (k) {
      var x = s.sore[k]; if (isDate(k) && x && SORE_LEVELS.indexOf(x.level) >= 0 && typeof x.at === 'string' && !isNaN(Date.parse(x.at))) { if (!d.sore) d.sore = {}; d.sore[k] = { level: x.level, at: x.at }; }
    });
    if (Array.isArray(s.restRemoved)) {
      var rr = s.restRemoved.filter(function (r) { return r && isDate(r.date) && typeof r.at === 'string' && !isNaN(Date.parse(r.at)); }).slice(-60).map(function (r) { return { date: r.date, at: r.at }; });
      if (rr.length) d.restRemoved = rr;
    }
    s.sessions.forEach(function (x) {
      if (!x || !isDate(x.date) || !PROGRAM[x.day] || !Array.isArray(x.sets)) return;
      var ses = { id: String(x.id || newId()), date: x.date, day: x.day, start: String(x.start || ''), end: x.end ? String(x.end) : null,
        sets: x.sets.filter(function (t) { return t && EX[t.ex] && typeof t.val === 'number' && isFinite(t.val) && t.val > 0; }).map(function (t) {
          var o = { i: +t.i || 0, ex: t.ex, n: +t.n || 1, val: t.val, w: typeof t.w === 'number' ? cleanWeight(t.w) : null, at: String(t.at || '') };
          if (typeof t.edited === 'string' && !isNaN(Date.parse(t.edited))) o.edited = t.edited;
          return o;
        }) };
      var rm = (Array.isArray(x.removed) ? x.removed : []).filter(function (r) { return r && typeof r.at === 'string' && !isNaN(Date.parse(r.at)); })
        .slice(-50).map(function (r) { return { at: r.at, i: +r.i || 0 }; });
      if (rm.length) ses.removed = rm; // as the app keeps it: only when a set was taken back (a restore comes back unchanged)
      d.sessions.push(ses);
    });
    (Array.isArray(s.history) ? s.history : []).forEach(function (h) {
      if (h && isDate(h.date) && typeof h.ex === 'string' && Array.isArray(h.sets)) {
        var sets = h.sets.filter(function (v) { return typeof v === 'number' && isFinite(v) && v > 0; });
        if (sets.length) d.history.push({ date: h.date, ex: h.ex.slice(0, 60), sets: sets, w: typeof h.w === 'number' ? cleanWeight(h.w) : null, from: 'sheet' });
      }
    });
    if (s.archive && typeof s.archive === 'object') {
      var aDaysMap = {};
      (Array.isArray(s.archive.days) ? s.archive.days : []).slice(-4000).forEach(function (dt) { if (isDate(dt)) aDaysMap[dt] = 1; });
      var aDays = Object.keys(aDaysMap).sort();
      var aBests = {};
      if (s.archive.bests && typeof s.archive.bests === 'object') {
        Object.keys(s.archive.bests).forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(EX, k)) return;
          var b = s.archive.bests[k];
          if (b && typeof b === 'object' && typeof b.val === 'number' && isFinite(b.val) && b.val > 0 && isDate(b.date)) {
            aBests[k] = { val: b.val, w: typeof b.w === 'number' && b.w > 0 ? cleanWeight(b.w) : null, date: b.date };
          }
        });
      }
      if (aDays.length || Object.keys(aBests).length) d.archive = { days: aDays, bests: aBests };
    }
    return d;
  }

  var api = { fourWeeks: fourWeeks, SORE_LEVELS: SORE_LEVELS, askSore: askSore, setSore: setSore, soreOn: soreOn, targetOf: targetOf, offerTwo: offerTwo, REST_REASONS: REST_REASONS, restOn: restOn, logRest: logRest, clearRest: clearRest, restThisWeek: restThisWeek, askDumbbells: askDumbbells, today: today, EX: EX, PROGRAM: PROGRAM, ORDER: ORDER, WEEK_TARGET: WEEK_TARGET, ARCHIVE_DAYS: ARCHIVE_DAYS, defaults: defaults, nextDay: nextDay, openSession: openSession, activeTime: activeTime, finishedToday: finishedToday, reopen: reopen, editSet: editSet,
    startSession: startSession, endSession: endSession, compact: compact, restInfo: restInfo, logSet: logSet, undoSet: undoSet, performances: performances,
    last: last, bestSet: bestSet, ready: ready, hardSteps: hardSteps, hardLevel: hardLevel, nextHard: nextHard, setHard: setHard, doingText: doingText, advice: advice, weekStats: weekStats, weekVolume: weekVolume, volumeAdvice: volumeAdvice, AREA: AREA, AREAS: AREAS, coach: coach, parseCsv: parseCsv, importSheetCsv: importSheetCsv,
    AGE_NORMS: AGE_NORMS, cleanAge: cleanAge, ageBracket: ageBracket, benchmark: benchmark, weeklyTrend: weeklyTrend, exerciseSeries: exerciseSeries,
    validate: validate, iso: iso };
  root.WorkoutCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
