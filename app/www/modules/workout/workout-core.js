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
    'Pushups': { track: 'reps', range: [8, 20], hard: '3-sec lowering on every rep, then feet on a chair', cue: 'Body in one line, elbows about 45° from your sides, chest to a fist’s height from the floor.' },
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
  function restOn(state, day) { var r = state.rest && state.rest[day]; return r && r.why ? r.why : null; }
  function logRest(state, day, why, now) {
    if (REST_REASONS.indexOf(why) < 0) throw new Error('Unknown reason');
    clearRest(state, day);
    if (!state.rest) state.rest = {};
    state.rest[day] = { why: why, at: (now || new Date()).toISOString() };
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
    var worked = {}; sessionsWithSets(state).forEach(function (s) { worked[s.date] = 1; });
    return Object.keys(state.rest || {}).sort().filter(function (d) { return d >= a && d < b && d <= t && !worked[d] && restOn(state, d); })
      .map(function (d) { return { date: d, why: state.rest[d].why }; });
  }
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

  /* The next day in the rotation: the one after the most recent session (on or before now's day) with sets. */
  function nextDay(state, now) {
    var open = openSession(state, now);
    if (open) return open.day;
    var day = iso(now || new Date());
    var done = sessionsWithSets(state).filter(function (s) { return s.date <= day; });
    if (!done.length) return 'A';
    var last = done[done.length - 1].day;
    return ORDER[(ORDER.indexOf(last) + 1) % ORDER.length] || 'A';
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

  function endSession(state, now) {
    var s = now ? openSession(state, now, true) : lastUnfinished(state);
    if (!s) return;
    if (!s.sets.length) { if (s.removed && s.removed.length) s.end = s.start; else state.sessions.splice(state.sessions.indexOf(s), 1); }
    else s.end = (now || new Date()).toISOString();
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

  function logSet(state, day, idx, val, weight, now) {
    now = now || new Date();
    var s = startSession(state, day, now), item = PROGRAM[day].items[idx];
    var n = s.sets.filter(function (x) { return x.i === idx; }).length + 1;
    var set = { i: idx, ex: item.ex, n: n, val: +val, w: weight == null || weight === '' ? null : +weight, at: now.toISOString() };
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
    if (weight !== undefined) { set.w = weight == null || weight === '' ? null : +weight; if (set.w != null && k === mine.length - 1) state.weights[set.ex] = set.w; }
    set.edited = (now || new Date()).toISOString();
    return set;
  }

  /* Every performance of an exercise, newest last: [{date, sets:[vals], w}] from the app's sessions and the imported sheet. */
  function performances(state, name) {
    var out = [];
    state.history.forEach(function (h) { if (h.ex === name && h.sets.length) out.push({ date: h.date, sets: h.sets.slice(), w: h.w }); });
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

  function ready(item, lastPerf) {
    var e = EX[item.ex];
    if (!e || !e.range || !lastPerf) return false;
    var vals = lastPerf.sets.slice(0, item.sets);
    return vals.length >= item.sets && vals.every(function (v) { return +v >= e.range[1]; });
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
      if (e.hard && state.next[item.ex] !== e.hard) return target + '. ' + lastTxt + '. ⬆ Ready for harder: ' + e.hard + '.';
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
    var wsDate = weekStart(now), ws = iso(wsDate), nextWs = iso(new Date(wsDate.getFullYear(), wsDate.getMonth(), wsDate.getDate() + 7));
    var days = {};
    sessionsWithSets(state).forEach(function (s) { days[s.date] = 1; });
    state.history.forEach(function (h) { days[h.date] = 1; });
    var thisWeek = Object.keys(days).filter(function (d) { return d >= ws && d < nextWs; }).length;
    // weeks in a row (before this one) with at least 2 workouts
    var streak = 0, w = weekStart(now);
    for (;;) {
      w.setDate(w.getDate() - 7);
      var a = iso(w), b = iso(new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7));
      var n = Object.keys(days).filter(function (d) { return d >= a && d < b; }).length;
      if (n >= 2) streak++; else break;
      if (streak > 520) break;
    }
    return { thisWeek: thisWeek, target: WEEK_TARGET, streak: streak, total: Object.keys(days).length };
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
    var ws = weekStart(now), a = iso(ws), nextWs = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7)), b = iso(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7));
    var out = { thisWeek: {}, lastWeek: {} };
    AREAS.forEach(function (k) { out.thisWeek[k] = 0; out.lastWeek[k] = 0; });
    function add(date, ex, n) {
      var area = AREA[ex]; if (!area || !n) return;
      if (date >= a && date < nextWs) out.thisWeek[area] += n; else if (date >= b && date < a) out.lastWeek[area] += n;
    }
    state.sessions.forEach(function (s) { (s.sets || []).forEach(function (x) { if (+x.val > 0) add(s.date, x.ex, 1); }); });
    state.history.forEach(function (h) { add(h.date, h.ex, h.sets.filter(function (v) { return +v > 0; }).length); });
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
  function coach(state, now) {
    now = now || new Date();
    var st = weekStats(state, now), dow = (now.getDay() + 6) % 7, todayIso = iso(now); // 0 = Monday
    var done = sessionsWithSets(state).filter(function (s) { return s.date <= todayIso; });
    var hist = state.history.filter(function (h) { return h.date <= todayIso; });
    var lastSess = done.length ? done[done.length - 1].date : null;
    var lastHist = hist.length ? hist[hist.length - 1].date : null;
    var lastDate = lastSess && lastHist ? (lastSess > lastHist ? lastSess : lastHist) : (lastSess || lastHist);
    var gap = lastDate ? Math.round((new Date(todayIso) - new Date(lastDate)) / 864e5) : null;
    var open = openSession(state, now);
    if (open) return 'In progress: ' + open.sets.length + ' set' + (open.sets.length === 1 ? '' : 's') + ' so far. Keep going.';
    if (lastDate === iso(now)) return 'Done for today. Rest is when the muscle actually grows.';
    var restToday = restOn(state, todayIso);
    if (restToday) return REST_LINES[restToday];
    var yIso = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    if (restOn(state, yIso) === 'Sore') return 'Still sore? Do two sets of each today and keep the weights the same; moving usually eases it. If it still hurts to move, rest one more day.';
    if (gap != null && gap > 10) return 'It’s been ' + gap + ' days. Start easy today: do two sets of each, not three.';
    // the first workouts back (1-2 in the last 4 weeks): soreness is normal and drops after a couple of weeks; leave reps in reserve
    var from28 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28)), recent = {};
    done.forEach(function (x) { if (x.date >= from28) recent[x.date] = 1; }); hist.forEach(function (x) { if (x.date >= from28) recent[x.date] = 1; });
    var nRecent = Object.keys(recent).length;
    if (gap != null && nRecent >= 1 && nRecent <= 2 && st.thisWeek < st.target) return 'Early days back: stop each set 2–3 reps before you have to. Feeling sore after the first workouts is normal and gets much less within a couple of weeks.';
    if (st.thisWeek >= st.target) return 'Three this week. Anything more is a bonus: a stroller walk counts.';
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
  function today(state, now) {
    now = now || new Date();
    var d = iso(now), y = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    var dates = {}; sessionsWithSets(state).forEach(function (s) { dates[s.date] = 1; }); state.history.forEach(function (h) { dates[h.date] = 1; });
    var open = openSession(state, now);
    if (open) return { done: false, text: 'in progress (' + PROGRAM[open.day].title + ')' };
    if (dates[d]) return { done: true, text: 'workout done' };
    var rd = restOn(state, d);
    if (rd) return { done: true, text: 'rest day (' + rd.toLowerCase() + ')' };
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
      if (!/^\d{4}-\d\d-\d\d$/.test(date) || !ex || ex === 'Rest') return;
      var sets = r.slice(3, 7).map(function (v) { return String(v).trim(); }).filter(function (v) { return v !== '' && !isNaN(+v); }).map(Number);
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

  function validate(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.sessions)) return null;
    var d = defaults(), dateRe = /^\d{4}-\d\d-\d\d$/;
    d.equipment = s.equipment === 'adjustable' ? 'adjustable' : 'fixed10';
    if (typeof s.dbAsked === 'string' && dateRe.test(s.dbAsked)) d.dbAsked = s.dbAsked;
    Object.keys(s.weights || {}).forEach(function (k) { if (EX[k] && typeof s.weights[k] === 'number') d.weights[k] = s.weights[k]; });
    Object.keys(s.next || {}).forEach(function (k) { if (EX[k] && typeof s.next[k] === 'string') d.next[k] = s.next[k]; });
    if (s.rest && typeof s.rest === 'object') Object.keys(s.rest).sort().slice(-200).forEach(function (k) {
      var r = s.rest[k]; if (dateRe.test(k) && r && REST_REASONS.indexOf(r.why) >= 0 && typeof r.at === 'string' && !isNaN(Date.parse(r.at))) { if (!d.rest) d.rest = {}; d.rest[k] = { why: r.why, at: r.at }; }
    });
    if (Array.isArray(s.restRemoved)) {
      var rr = s.restRemoved.filter(function (r) { return r && dateRe.test(r.date) && typeof r.at === 'string' && !isNaN(Date.parse(r.at)); }).slice(-60).map(function (r) { return { date: r.date, at: r.at }; });
      if (rr.length) d.restRemoved = rr;
    }
    s.sessions.forEach(function (x) {
      if (!x || !dateRe.test(x.date) || !PROGRAM[x.day] || !Array.isArray(x.sets)) return;
      d.sessions.push({ id: String(x.id || newId()), date: x.date, day: x.day, start: String(x.start || ''), end: x.end ? String(x.end) : null,
        sets: x.sets.filter(function (t) { return t && EX[t.ex] && typeof t.val === 'number'; }).map(function (t) {
          var o = { i: +t.i || 0, ex: t.ex, n: +t.n || 1, val: t.val, w: typeof t.w === 'number' ? t.w : null, at: String(t.at || '') };
          if (typeof t.edited === 'string' && !isNaN(Date.parse(t.edited))) o.edited = t.edited;
          return o;
        }), removed: (Array.isArray(x.removed) ? x.removed : []).filter(function (r) { return r && typeof r.at === 'string' && !isNaN(Date.parse(r.at)); })
          .slice(-50).map(function (r) { return { at: r.at, i: +r.i || 0 }; }) });
    });
    (Array.isArray(s.history) ? s.history : []).forEach(function (h) {
      if (h && dateRe.test(h.date) && typeof h.ex === 'string' && Array.isArray(h.sets))
        d.history.push({ date: h.date, ex: h.ex.slice(0, 60), sets: h.sets.filter(function (v) { return typeof v === 'number'; }), w: typeof h.w === 'number' ? h.w : null, from: 'sheet' });
    });
    return d;
  }

  var api = { REST_REASONS: REST_REASONS, restOn: restOn, logRest: logRest, clearRest: clearRest, restThisWeek: restThisWeek, askDumbbells: askDumbbells, today: today, EX: EX, PROGRAM: PROGRAM, ORDER: ORDER, WEEK_TARGET: WEEK_TARGET, defaults: defaults, nextDay: nextDay, openSession: openSession, finishedToday: finishedToday, reopen: reopen, editSet: editSet,
    startSession: startSession, endSession: endSession, restInfo: restInfo, logSet: logSet, undoSet: undoSet, performances: performances,
    last: last, ready: ready, advice: advice, weekStats: weekStats, weekVolume: weekVolume, volumeAdvice: volumeAdvice, AREA: AREA, AREAS: AREAS, coach: coach, parseCsv: parseCsv, importSheetCsv: importSheetCsv,
    validate: validate, iso: iso };
  root.WorkoutCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
