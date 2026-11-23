/* "About you" logic, no DOM: what he tells the app about how things went, so guidance can fit him instead of being
   generic. Three kinds, all optional and one tap each:
   - after: a few quick questions at the end of something he did (a calm practice, a workout, a prayer, a parenting tip);
   - checkin: a 20-second daily check-in (sleep, night wakes, energy, mood, the day with her, one line);
   - notfit: "Not for me?" on any advice or practice, with reasons and an optional note.
   Plus the weekly plan Claude writes on his PC from all of it (plan).
   Storage 'wl.me.v1': { feedback:[{id, at, part, about, kind, a:{k: label | [labels]}, note}], checkins:{date: {at, k: label, note}},
                         plan: {at, week, headline, parts:{part: {focus, why, prefer?}}, check?} | null, skipped:{date:1} }
   Only on the phone and (with the PC link) in Desktop\wellness-progress on his PC: never in the repo. */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');

  var Q = {
    calm: [
      { k: 'helped', q: 'Did it help?', opts: ['Not really', 'A bit', 'A lot'] },
      { k: 'block', q: 'Anything get in the way?', multi: true, opts: ['Interrupted', 'Mind racing', 'Too tired', 'Voice or pace', 'Too long', 'Nothing'] }
    ],
    workout: [
      { k: 'hard', q: 'How hard was it?', opts: ['Easy', 'Just right', 'Hard', 'Too hard'] },
      { k: 'pain', q: 'Any pain?', opts: ['None', 'A little', 'Yes, I stopped'] },
      { k: 'energy', q: 'Energy going in?', opts: ['Low', 'OK', 'High'] }
    ],
    faith: [
      { k: 'felt', q: 'How was it?', opts: ['Hard to focus', 'Peaceful', 'Felt close to God', 'Moved'] },
      { k: 'stood', q: 'What stood out?', multi: true, opts: ['The Scripture', 'The prayer', 'The quiet', 'The reflection', 'Nothing much'] }
    ],
    coach: [
      { k: 'tried', q: 'Did you try it with her?', opts: ['It worked', 'Sort of', 'Didn’t work', 'Not yet'] }
    ],
    tagalog: [
      { k: 'level', q: 'That was', opts: ['Too easy', 'About right', 'Too hard'] }
    ]
  };

  var CHECKIN = [
    { k: 'sleep', q: 'Sleep last night', opts: ['Under 4 h', '4–5 h', '5–6 h', '6–7 h', '7 h+'] },
    { k: 'wakes', q: 'Up in the night', opts: ['0', '1', '2', '3+'] },
    { k: 'energy', q: 'Energy', opts: ['Low', 'OK', 'Good'] },
    { k: 'mood', q: 'Mood', opts: ['Low', 'OK', 'Good'] },
    { k: 'day', q: 'Yesterday with her', opts: ['Hard', 'Mixed', 'Good'] }
  ];

  var REASONS = ['Too generic', 'Doesn’t fit my situation', 'Too long', 'Too easy', 'Too hard', 'I know this already', 'Other'];
  var PARTS = ['calm', 'workout', 'faith', 'coach', 'tagalog', 'todo', 'home'];

  function defaults() { return { feedback: [], checkins: {}, plan: null, skipped: {} }; }
  var iso = WLD.iso;
  function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function questions(part) { return Q[part] || []; }
  function qFor(list, k) { return list.filter(function (q) { return q.k === k; })[0]; }

  function find(state, id) { return state.feedback.filter(function (f) { return f.id === id; })[0]; }

  /* One tap on an "after" question. A multi question toggles the option ("Nothing" clears the others and the
     others clear "Nothing"); a single one replaces it (tapping the chosen one again clears it). Returns the entry. */
  /* now: when it counts for (the "log for an earlier day" day); real: the real time of the tap (default now), which
     goes in `edited` so the PC keeps the newest change even when an earlier day is being logged. */
  function answer(state, part, about, k, v, now, real) {
    var q = qFor(questions(part), k);
    if (!q || q.opts.indexOf(v) < 0 || !about) return null;
    now = now || new Date();
    var id = part + '/after/' + cut(about, 80), f = find(state, id);
    if (!f) { f = { id: id, at: now.toISOString(), part: part, about: cut(about, 80), kind: 'after', a: {} }; state.feedback.push(f); }
    if (q.multi) {
      var cur = Array.isArray(f.a[k]) ? f.a[k] : [], none = q.opts[q.opts.length - 1];
      if (cur.indexOf(v) >= 0) cur = cur.filter(function (x) { return x !== v; });
      else if (v === none) cur = [v];
      else cur = cur.filter(function (x) { return x !== none; }).concat(v);
      if (cur.length) f.a[k] = cur; else delete f.a[k];
    } else if (f.a[k] === v) delete f.a[k];
    else f.a[k] = v;
    f.edited = (real || now).toISOString();
    trim(state);
    return f;
  }
  function answers(state, part, about) { var f = find(state, part + '/after/' + cut(about, 80)); return f ? f.a : {}; }

  /* "Not for me": what it was about (part + about + the text he saw), why (reasons from REASONS), an optional note. */
  function notFit(state, part, about, shown, reasons, note, now) {
    if (PARTS.indexOf(part) < 0 || !about) return null;
    now = now || new Date();
    var rs = (reasons || []).filter(function (r) { return REASONS.indexOf(r) >= 0; });
    var f = { id: part + '/notfit/' + cut(about, 80) + '/' + now.getTime(), at: now.toISOString(), part: part, about: cut(about, 80), kind: 'notfit',
      a: { reasons: rs }, shown: cut(shown, 300), note: cut(note, 600) };
    state.feedback.push(f); trim(state);
    return f;
  }
  function flagged(state, part, about) {
    return state.feedback.some(function (f) { return f.kind === 'notfit' && f.part === part && f.about === about; });
  }

  function trim(state) { if (state.feedback.length > 600) state.feedback = state.feedback.slice(-600); }

  function trimCheckins(state) {
    var days = Object.keys(state.checkins).sort();
    while (days.length > 120) delete state.checkins[days.shift()];
  }
  function hasCheckin(c) { return !!c && (!!c.note || CHECKIN.some(function (q) { return c[q.k] != null; })); }

  /* Daily check-in, one tap per question (tap again to clear). */
  function checkin(state, day, k, v, now) {
    var q = qFor(CHECKIN, k);
    if (!q || q.opts.indexOf(v) < 0 || !/^\d{4}-\d\d-\d\d$/.test(day)) return null;
    now = now || new Date();
    var c = state.checkins[day] || (state.checkins[day] = { at: now.toISOString() });
    if (c[k] === v) delete c[k]; else c[k] = v;
    c.edited = now.toISOString();
    if (!hasCheckin(c)) delete state.checkins[day];
    trimCheckins(state);
    return c;
  }
  function checkinNote(state, day, text, now) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day)) return null;
    now = now || new Date();
    var note = cut(String(text || '').trim(), 600);
    var c = state.checkins[day];
    if (!note && !c) return null;
    c = c || (state.checkins[day] = { at: now.toISOString() });
    if (note) c.note = note; else delete c.note;
    c.edited = now.toISOString();
    if (!hasCheckin(c)) delete state.checkins[day];
    trimCheckins(state);
    return c;
  }
  function checkinDone(c) { return !!c && CHECKIN.every(function (q) { return c[q.k] != null; }); }

  /* Today's check-in, and whether it's a rough day (little sleep or a broken night). */
  function rough(state, now) {
    var c = state.checkins[iso(now || new Date())];
    if (!c) return false;
    return c.sleep === 'Under 4 h' || c.sleep === '4–5 h' || c.wakes === '3+' || c.energy === 'Low';
  }

  /* Calm practices scored from his answers: helped a lot +2, a bit +1, not really -1; "not for me" -3.
     tooLong: practices where "Too long" got in the way. */
  /* racing: in the last 7 days, one of his last two calm answers given at night (21:00-05:00) named "Mind racing". */
  function calmLikes(state, now) {
    var score = {}, tooLong = {};
    state.feedback.forEach(function (f) {
      if (f.part !== 'calm') return;
      var id = String(f.about).split('@')[0];
      if (f.kind === 'notfit') { score[id] = (score[id] || 0) - 3; if (Array.isArray(f.a.reasons) && f.a.reasons.indexOf('Too long') >= 0) tooLong[id] = 1; return; }
      var h = f.a.helped;
      if (h) score[id] = (score[id] || 0) + (h === 'A lot' ? 2 : h === 'A bit' ? 1 : -1);
      if (Array.isArray(f.a.block) && f.a.block.indexOf('Too long') >= 0) tooLong[id] = 1;
    });
    now = now || new Date();
    var since = new Date(now.getTime() - 7 * 864e5).toISOString();
    var night = state.feedback.filter(function (f) { var h = new Date(f.at).getHours(); return f.part === 'calm' && f.kind === 'after' && (h >= 21 || h < 5); }).slice(-2);
    var racing = night.some(function (f) { return f.at >= since && Array.isArray(f.a.block) && f.a.block.indexOf('Mind racing') >= 0; });
    return { score: score, tooLong: tooLong, racing: racing };
  }

  function lastN(state, part, kind, n) {
    return state.feedback.filter(function (f) {
      return f.part === part && f.kind === kind && (kind !== 'after' || (f.a && Object.keys(f.a).length > 0));
    }).slice(-n);
  }
  function recentCheckins(state, now, days) {
    now = now || new Date(); var out = [];
    for (var i = 0; i < days; i++) { var d = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), c = state.checkins[d]; if (hasCheckin(c)) out.push(c); }
    return out;
  }

  /* A few lines of guidance from what he has told the app (newest, most useful first; at most `max`).
     Each: {part, text}. Plain rules here; the weekly plan from Claude on his PC goes deeper. */
  function guidance(state, now, max) {
    now = now || new Date(); var out = [];
    // a line he marked "not for me" stays hidden for two weeks (keys are stable even when the numbers in it change)
    var since = new Date(now.getTime() - 14 * 864e5).toISOString(), hidden = {};
    state.feedback.forEach(function (f) { if (f.kind === 'notfit' && /^guide:/.test(f.about) && f.at >= since) hidden[f.about.slice(6)] = 1; });
    var today = state.checkins[iso(now)], week = recentCheckins(state, now, 7);
    if (rough(state, now)) out.push({ key: 'rough', part: 'home', text: 'Rough night. Keep today small: the one-minute reset, a shorter workout (or rest), and lie down when she naps if you can.' });
    // today's explicit check-in note (sick/teething or busy day) belongs near the top so multi-day trends never hide it on Home
    if (today && today.note && /\b(sick|fever|teeth|teething)\b/i.test(today.note)) out.push({ key: 'sick', part: 'home', text: 'A sick or teething day: everything else can wait. Comfort, fluids, rest; call 811 if you’re unsure.' });
    else if (today && today.note && /\b(family|party|parties|visit|visits|visiting|visitors|guests|busy|hosting|birthday)\b/i.test(today.note)) out.push({ key: 'busyday', part: 'home', text: 'A full day with people around: keep it small. The one-minute reset between things, and a rest day from Move is fine (it won’t count as missed).' });
    var low = week.filter(function (c) { return c.mood === 'Low'; }).length;
    if (low >= 4) out.push({ key: 'lowmood', part: 'home', text: 'Your mood has been low on ' + low + ' of the last ' + week.length + ' check-ins. That’s worth sharing with someone you trust, or your doctor; 811 can help too.' });
    else if (week.length >= 3) {
      var short = week.filter(function (c) { return c.sleep === 'Under 4 h' || c.sleep === '4–5 h'; }).length;
      if (short >= 3) out.push({ key: 'shortsleep', part: 'home', text: 'Short sleep on ' + short + ' of the last ' + week.length + ' nights. Protect one nap-time rest a day this week; it matters more than anything else here.' });
    }
    var r5 = recentCheckins(state, now, 5), broken = r5.filter(function (c) { return c.wakes === '2' || c.wakes === '3+'; }).length;
    if (broken >= 3 && !out.some(function (g) { return g.key === 'shortsleep'; })) out.push({ key: 'brokennights', part: 'home', text: 'Broken nights on ' + broken + ' of the last ' + r5.length + ' check-ins. On these days a nap beats a workout, and Calm’s “Back to sleep” helps after a night feed.' });
    // his last bedtime wind-down didn't help because his mind was racing: the next evening, write it down first
    var wd = state.feedback.filter(function (x) { return x.part === 'calm' && x.kind === 'after' && /^(sleep|night)@/.test(String(x.about)); }).slice(-1)[0];
    if (wd && now.getHours() >= 17 && Array.isArray(wd.a.block) && wd.a.block.indexOf('Mind racing') >= 0) {
      var wdDay = iso(new Date(wd.at)), y = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      if (wdDay === y || wdDay === iso(now)) out.push({ key: 'mindracing', part: 'calm', text: 'Your mind was racing at your last wind-down. Tonight, write down what’s on it first (a few lines in the Faith journal, or any paper), then do the wind-down.' });
    }
    var w = lastN(state, 'workout', 'after', 3);
    var lw = w[w.length - 1];
    if (lw && lw.a.pain === 'Yes, I stopped') out.push({ key: 'wpain', part: 'workout', text: 'Last workout you stopped for pain. Next time skip or lighten that exercise, and if it keeps hurting, ask a doctor or physio.' });
    else if (lw && lw.a.hard === 'Too hard') out.push({ key: 'whard', part: 'workout', text: 'Last workout felt too hard: keep the same weights next time and aim for the bottom of each rep range.' });
    else if (w.length >= 2 && w.slice(-2).every(function (f) { return f.a.hard === 'Easy'; })) out.push({ key: 'weasy', part: 'workout', text: 'Your last two workouts felt easy: add a couple of reps, or the next weight up, where the app says you’re ready.' });
    var cl = calmLikes(state, now), best = Object.keys(cl.score).filter(function (k) { return cl.score[k] >= 3; }).sort(function (a, b) { return cl.score[b] - cl.score[a]; })[0];
    if (best) {
      var CC = typeof CalmCore !== 'undefined' ? CalmCore : root.CalmCore, cp = CC && CC.PRACTICES.filter(function (x) { return x.id === best; })[0];
      out.push({ key: 'calmbest', part: 'calm', text: 'What helps you most so far: ' + (cp ? cp.title.toLowerCase() : best) + '. Calm suggests it more often.', id: best });
    }
    var tips = lastN(state, 'coach', 'after', 10).filter(function (f) { return f.a.tried === 'It worked'; });
    if (tips.length) out.push({ key: 'tipworked', part: 'coach', text: 'A tip that worked with her: keep doing it, so it becomes a habit for you both.', id: tips[tips.length - 1].about });
    var f = lastN(state, 'faith', 'after', 5), hard = f.filter(function (x) { return x.a.felt === 'Hard to focus'; }).length;
    if (f.length >= 3 && hard >= 2) out.push({ key: 'faithfocus', part: 'faith', text: 'Focus has been hard in prayer lately. Try it shorter, or with the voice off and the words read slowly; a tired mind still counts.' });
    // a few more, each from his own recent answers (stable keys so "not for me" can hide them)
    var cf = lastN(state, 'calm', 'after', 5), intr = cf.filter(function (x) { return Array.isArray(x.a.block) && x.a.block.indexOf('Interrupted') >= 0; }).length;
    if (intr >= 2) out.push({ key: 'calminterrupt', part: 'calm', text: 'Calm got interrupted ' + intr + ' of the last ' + cf.length + ' times. The one-minute reset fits between things, or start one when she goes down for a nap; stopping part-way still counts.' });
    var lowE = w.filter(function (x) { return x.a.energy === 'Low'; }).length;
    if (w.length >= 2 && lowE >= 2 && !(lw && lw.a.pain === 'Yes, I stopped')) out.push({ key: 'wlowenergy', part: 'workout', text: 'Low energy going into ' + lowE + ' of your last ' + w.length + ' workouts. A short one still counts: do just the first superset on tired days, or move it to after her first nap.' });
    var ct = lastN(state, 'coach', 'after', 5), notW = ct.filter(function (x) { return x.a.tried === 'Didn’t work'; }).length;
    if (notW >= 2) out.push({ key: 'tipnot', part: 'coach', text: notW + ' recent tips didn’t work with her. Tap “Not for me?” on them and say why (her age, her mood, your situation); the next ones will take it into account.' });
    var tl = lastN(state, 'tagalog', 'after', 3), tlE = tl.filter(function (x) { return x.a.level === 'Too easy'; }).length, tlH = tl.filter(function (x) { return x.a.level === 'Too hard'; }).length;
    if (tlE >= 2) out.push({ key: 'tleasy', part: 'tagalog', text: 'Lessons have felt too easy: try “say it in Tagalog” in Review out loud, and next week’s lessons step up (longer sentences, more speaking).' });
    else if (tlH >= 2) out.push({ key: 'tlhard', part: 'tagalog', text: 'Lessons have felt hard: one lesson a day is plenty, and Review first helps the new words stick. Next week’s lessons slow down a little.' });
    var good = f.filter(function (x) { return x.a.felt === 'Felt close to God' || x.a.felt === 'Moved'; }), stood = {};
    good.forEach(function (x) { (Array.isArray(x.a.stood) ? x.a.stood : []).forEach(function (k) { if (k !== 'Nothing much') stood[k] = (stood[k] || 0) + 1; }); });
    var top = Object.keys(stood).sort(function (a, b) { return stood[b] - stood[a]; })[0];
    if (good.length >= 2 && top && stood[top] >= 2 && hard < 2) out.push({ key: 'faithstood', part: 'faith', text: 'When prayer has felt close lately, ' + top.toLowerCase() + ' stood out. Give it a little more time: ' + ({ 'The Scripture': 'read the passage twice, slowly, before you pray.', 'The prayer': 'stay with the prayer and add your own words to it.', 'The quiet': 'set the guided prayer to 10 min for longer silences.', 'The reflection': 'write a line after the Think part.' })[top] });
    return out.filter(function (g) { return !hidden[g.key]; }).slice(0, max || 3);
  }

  /* The weekly plan from Claude on the PC (task "weekly-plan"), checked. */
  function cleanPlan(p, now) {
    if (!p || typeof p !== 'object') return null;
    var out = { at: (now || new Date()).toISOString(), headline: cut(p.headline, 300), parts: {}, check: cut(p.check, 300) };
    var src = p.parts && typeof p.parts === 'object' ? p.parts : {};
    PARTS.forEach(function (k) {
      var x = src[k]; if (!x || typeof x !== 'object' || !x.focus) return;
      var y = { focus: cut(x.focus, 400), why: cut(x.why, 400) };
      if (Array.isArray(x.prefer)) y.prefer = x.prefer.filter(function (s) { return typeof s === 'string'; }).slice(0, 5).map(function (s) { return cut(s, 40); });
      out.parts[k] = y;
    });
    if (!out.headline && !Object.keys(out.parts).length) return null;
    return out;
  }
  function planFor(state, part, now) {
    var p = state.plan; if (!p || !p.parts || !p.parts[part]) return null;
    if ((now || new Date()).getTime() - new Date(p.at).getTime() > 10 * 864e5) return null; // a plan is for one week
    return p.parts[part];
  }
  function planDue(state, now) {
    now = now || new Date();
    return !state.plan || now.getTime() - new Date(state.plan.at).getTime() > 6.5 * 864e5;
  }

  /* The last try at a weekly plan didn't give one (Claude's error, an empty answer): a plan is due, a try was made,
     and the plan (if any) is older than that try. Then Home and About you say so with a "Try again". */
  function planFailed(state, now) {
    return planDue(state, now) && !!state.planTried && (!state.plan || iso(new Date(state.plan.at)) < state.planTried);
  }

  /* What the PC's weekly plan reads (the phone sends it with the request): the last 14 days of answers. */
  function forPlan(state, now) {
    now = now || new Date();
    var fromDay = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14)), today = iso(now);
    var from = new Date(now.getTime() - 14 * 864e5).toISOString();
    var cks = {};
    Object.keys(state.checkins).forEach(function (d) { if (d >= fromDay && d <= today) cks[d] = state.checkins[d]; });
    return { checkins: cks, feedback: state.feedback.filter(function (f) { return f.at >= from; }).map(function (f) {
      return { at: f.at, part: f.part, about: f.about, kind: f.kind, a: f.a, shown: f.shown, note: f.note };
    }).slice(-150) };
  }

  /* Only answers the app could have saved: known questions and their labels (a list for multi ones); reasons from REASONS. */
  function cleanA(part, kind, a) {
    var o = {};
    if (kind === 'notfit') { o.reasons = Array.isArray(a.reasons) ? a.reasons.filter(function (r) { return REASONS.indexOf(r) >= 0; }) : []; return o; }
    questions(part).forEach(function (q) {
      var v = a[q.k];
      if (q.multi) { if (Array.isArray(v)) { v = v.filter(function (x) { return q.opts.indexOf(x) >= 0; }); if (v.length) o[q.k] = v; } }
      else if (q.opts.indexOf(v) >= 0) o[q.k] = v;
    });
    return o;
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.feedback)) return null;
    var d = defaults();
    s.feedback.forEach(function (f) {
      if (f && typeof f.id === 'string' && typeof f.at === 'string' && PARTS.indexOf(f.part) >= 0 && typeof f.about === 'string' && f.a && typeof f.a === 'object')
        d.feedback.push({ id: cut(f.id, 200), at: cut(f.at, 40), part: f.part, about: cut(f.about, 80), kind: f.kind === 'notfit' ? 'notfit' : 'after', a: cleanA(f.part, f.kind, f.a),
          shown: f.shown ? cut(f.shown, 300) : undefined, note: f.note ? cut(f.note, 600) : undefined, edited: f.edited ? cut(f.edited, 40) : undefined });
    });
    if (s.checkins && typeof s.checkins === 'object') Object.keys(s.checkins).forEach(function (k) {
      var c = s.checkins[k]; if (!/^\d{4}-\d\d-\d\d$/.test(k) || !c || typeof c !== 'object') return;
      var o = { at: cut(c.at || '', 40) };
      CHECKIN.forEach(function (q) { if (q.opts.indexOf(c[q.k]) >= 0) o[q.k] = c[q.k]; });
      if (c.note) o.note = cut(c.note, 600); if (c.edited) o.edited = cut(c.edited, 40);
      d.checkins[k] = o;
    });
    if (s.plan) d.plan = s.plan.at ? (function () { var p = cleanPlan(s.plan); if (p) p.at = cut(s.plan.at, 40); return p; })() : null;
    if (typeof s.planTried === 'string' && /^\d{4}-\d\d-\d\d$/.test(s.planTried)) d.planTried = s.planTried;
    if (typeof s.planCancelled === 'string' && /^\d{4}-\d\d-\d\d$/.test(s.planCancelled)) d.planCancelled = s.planCancelled;
    if (s.skipped && typeof s.skipped === 'object') Object.keys(s.skipped).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(k)) d.skipped[k] = 1; });
    return d;
  }

  /* 14 days of sleep / energy / mood from check-ins, oldest first: {days:[{date, sleep, energy, mood}] (0-based levels
     or null), counts}. For the #me page's trend. */
  function trend(state, now, n) {
    now = now || new Date(); n = n || 14;
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), c = state.checkins[d] || {};
      var lv = function (k) { var q = qFor(CHECKIN, k), j = q.opts.indexOf(c[k]); return j >= 0 ? j : null; };
      out.push({ date: d, sleep: lv('sleep'), energy: lv('energy'), mood: lv('mood') });
    }
    return { days: out, n: out.filter(function (x) { return x.sleep != null || x.mood != null || x.energy != null; }).length };
  }

  var api = { trend: trend, Q: Q, CHECKIN: CHECKIN, REASONS: REASONS, PARTS: PARTS, defaults: defaults, iso: iso, questions: questions, answer: answer, answers: answers,
    notFit: notFit, flagged: flagged, checkin: checkin, checkinNote: checkinNote, checkinDone: checkinDone, rough: rough, calmLikes: calmLikes,
    guidance: guidance, cleanPlan: cleanPlan, planFor: planFor, planDue: planDue, planFailed: planFailed, forPlan: forPlan, validate: validate, recentCheckins: recentCheckins };
  root.MeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
