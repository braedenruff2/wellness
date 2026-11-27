/* Parenting coach, the pure part: the child's age in words, scores per skill, which skill to practise next,
   checking saved data. Scenarios and grading come from Claude on his PC (pc/wellness_pc.py, tasks coach-scenario
   and coach-grade). His child's name and birthday stay on the phone (never in the app's code or repo). */
(function (root) {
  'use strict';
  var WLD = root.WLDates || (typeof require === 'function' ? require('../../lib/dates.js') : null);
  function iso(d) {
    if (WLD && WLD.iso) return WLD.iso(d);
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var SKILLS = ['Connection', 'Calm under stress', 'Sleep', 'Feeding', 'Play and learning', 'Safety', 'Routines',
    'Crying and comfort', 'Looking after yourself', 'Family and partner'];

  /* Practical everyday skills to introduce and practise by age (whole months). General guidance from CDC, AAP and
     Canadian Paediatric Society — not medical advice; every child develops at their own pace. */
  var TEACH = [
    { id: 'tummy', from: 0, to: 6, title: 'Tummy time every day', how: 'Short, playful floor sessions while awake build neck, shoulder and core strength for rolling and sitting.' },
    { id: 'babble', from: 4, to: 9, title: 'Back-and-forth babbling', how: 'Pause and answer when she coos or babbles (“serve and return”). It builds early language and turn-taking.' },
    { id: 'sit', from: 4, to: 8, title: 'Supported sitting and reaching', how: 'Sit her propped between your legs with a toy slightly out of reach so she practises balance.' },
    { id: 'opencup', from: 6, to: 12, title: 'Drink from an open cup', how: 'Start around 6 months with a small, heavy or two-handled cup and a splash of water. Guide it to her lips; expect spills. Early practice makes dropping bottles much easier.' },
    { id: 'strawcup', from: 6, to: 12, title: 'Try a straw cup', how: 'Trap a drop of water in a short straw with your finger and let her sip, or try a soft squeeze-straw cup so she learns to draw liquid up.' },
    { id: 'fingerfood', from: 6, to: 10, title: 'Soft finger foods and self-feeding', how: 'Once sitting steadily, offer soft squishable strips (banana, steamed veg, scrambled egg) so she practises bringing food to her mouth.' },
    { id: 'brush', from: 6, to: 18, title: 'Brush teeth twice a day', how: 'Start as soon as the first tooth appears with a tiny rice-grain smear of fluoride toothpaste and a soft baby brush.' },
    { id: 'textures', from: 6, to: 12, title: 'Varied textures and everyday foods', how: 'Move steadily past smooth purées to mashed and soft chopped foods. Introduce common foods early and regularly (check with her doctor first if there is eczema or family allergy history).' },
    { id: 'books', from: 6, to: 24, title: 'Daily board-book reading', how: 'Even 5–10 minutes pointing at pictures, making animal sounds and letting her turn thick pages builds vocabulary and bedtime calm.' },
    { id: 'backwards', from: 9, to: 15, title: 'Get down feet-first (backwards)', how: 'Every time she nears the edge of a couch, bed or low step, gently turn her belly-down and guide her feet down first while saying “feet first, slide down.”' },
    { id: 'point', from: 9, to: 15, title: 'Pointing, waving and naming things', how: 'Point to what she looks at and name it simply (“dog!”, “light!”, “cup!”). Practise waving bye-bye, clapping and peek-a-boo.' },
    { id: 'dentist', from: 9, to: 14, title: 'First dental check-up', how: 'Canadian Paediatric Society and AAP suggest a first visit by 12 months (or within 6 months of the first tooth) so the dentist feels familiar.' },
    { id: 'nobottle', from: 12, to: 15, title: 'Transition off bottles to cups', how: 'Swap daytime bottles one by one for open or straw cups (bedtime bottle last) to protect teeth and speech, aiming to finish by 15–18 months.' },
    { id: 'spoon', from: 12, to: 18, title: 'Practise with a spoon', how: 'Preload thick food (yogurt, oatmeal, mashed sweet potato) on a short baby spoon and hand it to her. Messy is normal and builds wrist control.' },
    { id: 'onestep', from: 12, to: 18, title: 'Simple one-step requests', how: 'Ask for small concrete actions with a gesture (“bring me the ball”, “put the block in the box”) and celebrate her effort.' },
    { id: 'choices', from: 12, to: 24, title: 'Offer two simple choices', how: '“Red cup or blue cup?” “Walk or be carried?” Small safe choices give healthy autonomy and reduce power struggles.' },
    { id: 'helper', from: 15, to: 24, title: 'Tiny daily helper jobs', how: 'Let her drop laundry in the hamper, wipe a spill with a cloth or toss a wipe in the bin. Toddlers love feeling capable.' },
    { id: 'expand', from: 15, to: 24, title: 'Expand her words into short phrases', how: 'When she says “ball”, reply “Yes, big red ball!” rather than quizzing or correcting. It models natural phrases.' },
    { id: 'feelings', from: 15, to: 30, title: 'Name big feelings simply', how: 'Say “You’re mad the block fell” or “You’re sad we have to leave” before fixing it. Hearing feeling words builds self-regulation.' },
    { id: 'stairs', from: 15, to: 24, title: 'Stairs with a hand or railing', how: 'Practise stepping up and down low steps holding your hand (and still backing down steeper stairs) with close supervision.' },
    { id: 'fork', from: 18, to: 24, title: 'Kid-safe fork and steady open cup', how: 'Offer a blunt toddler fork for soft bites and regular open-cup drinks at the table so spilling gradually drops.' },
    { id: 'dresshelp', from: 18, to: 24, title: 'Help get dressed and undressed', how: 'Encourage pushing arms through sleeves, pulling off socks or a hat and stepping into pants; leave an extra couple of minutes.' },
    { id: 'washhands', from: 18, to: 30, title: 'Hand-washing routine', how: 'Use a steady step stool at the sink before meals and after outings, singing a short 20-second song together.' },
    { id: 'pretend', from: 18, to: 30, title: 'Simple pretend play', how: 'Feed a stuffed animal, stir a toy pot or talk on a block “phone”. Pretend play builds imagination, language and empathy.' },
    { id: 'potty', from: 20, to: 36, title: 'Watch for potty-readiness signs', how: 'Look for staying dry 2+ hours, telling you when wet or dirty and showing curiosity about the toilet. No rush before she’s ready.' },
    { id: 'dressself', from: 24, to: 36, title: 'Put on simple clothes and shoes', how: 'Elastic-waist pants, pull-on shirts and velcro shoes make practice easy; show the “flip trick” for putting on a jacket.' },
    { id: 'turns', from: 24, to: 36, title: 'Taking turns in short games', how: 'Practise “my turn, your turn” rolling a ball, building a tower or sharing a toy while you stay nearby to coach.' },
    { id: 'words', from: 24, to: 36, title: 'Simple problem-solving words', how: 'Practise short scripts in calm moments (“Stop, I don’t like that”, “Can I have a turn when you’re done?”).' }
  ];
  var TEACH_BY = {};
  TEACH.forEach(function (x) { TEACH_BY[x.id] = x; });

  function defaults() { return { child: { name: '', birth: '' }, history: [], current: null, pending: null, teach: {} }; }

  /* What she can do now (his own picks, saved on the phone): sent with every Claude request so scenarios and advice
     fit her, not a typical child of her age. */
  var CAN = ['Walks', 'Gets down by herself', 'Climbs', 'Waves or does “bless”', 'First words', 'Points', 'Feeds herself finger food', 'Drinks from a cup'];
  function toggleCan(state, v) {
    if (CAN.indexOf(v) < 0) return null;
    var c = state.child.can = Array.isArray(state.child.can) ? state.child.can : [], i = c.indexOf(v);
    if (i >= 0) c.splice(i, 1); else c.push(v);
    c.sort(function (a, b) { return CAN.indexOf(a) - CAN.indexOf(b); });
    return c;
  }
  function setCanNote(state, text) { var t = String(text || '').trim().slice(0, 300); if (t) state.child.canNote = t; else delete state.child.canNote; }
  /* In words for the prompt ('' when he hasn't said): "walks; climbs; first words. Also: says mama". */
  function canText(state) {
    var c = (Array.isArray(state.child.can) ? state.child.can : []).map(function (x) { return x.charAt(0).toLowerCase() + x.slice(1); });
    var t = c.join('; ');
    if (state.child.canNote) t += (t ? '. Also: ' : '') + state.child.canNote;
    return t;
  }
  function parse(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(d)) return null;
    var p = d.split('-'), y = +p[0], mo = +p[1] - 1, day = +p[2], dt = new Date(y, mo, day);
    return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === day ? dt : null;
  }

  /* Whole months between birth and now (a month counts once its day of the month comes round). */
  function ageMonths(birth, now) {
    var b = parse(birth); if (!b || isNaN(b)) return null;
    now = now || new Date();
    var m = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
    // born on the 31st (or 29 Feb): the month counts on the last day of a shorter month
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() < b.getDate() && now.getDate() !== lastDay) m--;
    return m;
  }
  function ageText(birth, now) {
    var m = ageMonths(birth, now); if (m == null || m < 0) return '';
    if (m < 1) {
      var n = now || new Date(), b = parse(birth);
      var d = Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);
      return d < 14 ? d + ' day' + (d === 1 ? '' : 's') + ' old' : Math.floor(d / 7) + ' weeks old';
    }
    if (m < 24) return m + ' month' + (m === 1 ? '' : 's') + ' old';
    var y = Math.floor(m / 12), r = m % 12;
    return y + ' years' + (r ? ' and ' + r + ' month' + (r === 1 ? '' : 's') : '') + ' old';
  }

  function scored(state) { return state.history.filter(function (h) { return h.result && typeof h.result.score === 'number'; }); }

  /* Per skill: {skill, n, avg (last 5), last, scores (last 10, oldest first)}. */
  function skillStats(state) {
    var by = {};
    scored(state).forEach(function (h) { (by[h.skill] = by[h.skill] || []).push(h.result.score); });
    return SKILLS.map(function (s) {
      var v = by[s] || [], l5 = v.slice(-5);
      return { skill: s, n: v.length, avg: l5.length ? Math.round(10 * l5.reduce(function (a, b) { return a + b; }, 0) / l5.length) / 10 : null, last: v.length ? v[v.length - 1] : null, scores: v.slice(-10) };
    });
  }

  /* What to practise: a skill never tried yet first (in list order), else the lowest recent average. */
  function suggestSkill(state) {
    var st = skillStats(state), untried = st.filter(function (s) { return !s.n; });
    if (untried.length) return untried[0].skill;
    return st.slice().sort(function (a, b) { return a.avg - b.avg || a.n - b.n; })[0].skill;
  }

  function setTeach(state, id, val) {
    if (!TEACH_BY[id]) return null;
    if (!state.teach || typeof state.teach !== 'object') state.teach = {};
    if (val === 'doing' || val === 'done') state.teach[id] = val;
    else delete state.teach[id];
    return state.teach[id] || '';
  }

  /* Practical skills grouped for her exact age: now (current window), next (starting in the next 4 months),
     and earlier (past window and not yet marked "done", so catching up is gentle and visible). */
  function teachForAge(state, now) {
    var m = ageMonths(state.child.birth, now);
    if (m == null || m < 0) return null;
    var st = (state && state.teach && typeof state.teach === 'object') ? state.teach : {};
    var wrap = function (x) { return { id: x.id, from: x.from, to: x.to, title: x.title, how: x.how, status: st[x.id] || '' }; };
    var nowList = [], nextList = [], earlierList = [], doneCount = 0, doingCount = 0;
    TEACH.forEach(function (x) {
      var s = st[x.id] || '';
      if (s === 'done') doneCount++;
      else if (s === 'doing') doingCount++;
      if (m >= x.from && m <= x.to) nowList.push(wrap(x));
      else if (x.from > m && x.from <= m + 4) nextList.push(wrap(x));
      else if (x.to < m && s !== 'done') earlierList.push(wrap(x));
    });
    return { ageMonths: m, now: nowList, next: nextList, earlier: earlierList, doneCount: doneCount, doingCount: doingCount, total: TEACH.length };
  }

  /* True if at least one scenario was graded today (local date). Real-situation advice doesn't count as the daily scenario. */
  function doneToday(state, now) {
    var d = iso(now || new Date());
    return (state.history || []).some(function (h) {
      return h && h.kind !== 'real' && h.result && !isNaN(new Date(h.at).getTime()) && iso(new Date(h.at)) === d;
    });
  }

  /* True when today's suggested scenario should auto-generate: child birthday set, no scenario waiting to be answered,
     none graded today, and not already tried or cancelled today. */
  function scenarioDue(state, now) {
    if (!state || !state.child || !parse(state.child.birth)) return false;
    if (state.current || state.pending) return false;
    var d = iso(now || new Date());
    if (doneToday(state, now)) return false;
    if (state.autoTried === d || state.autoCancelled === d) return false;
    return true;
  }

  /* Count of graded scenarios in the last N calendar days (including today). */
  function doneInLast(state, days, now) {
    now = now || new Date();
    var end = iso(now), start = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((days || 7) - 1)));
    return (state.history || []).filter(function (h) {
      if (!h || h.kind === 'real' || !h.result || isNaN(new Date(h.at).getTime())) return false;
      var d = iso(new Date(h.at));
      return d >= start && d <= end;
    }).length;
  }

  /* What the PC is sent with a scenario request. */
  function scenarioInput(state, skill, now) {
    var out = { child: state.child.name || 'your daughter', age: ageText(state.child.birth, now) || 'about one year old',
      skill: skill || suggestSkill(state), can: canText(state),
      recent: scored(state).slice(-10).map(function (h) { return { skill: h.skill, score: h.result.score }; }),
      avoid: state.history.slice(-15).map(function (h) { return h.title; }) };
    var practising = TEACH.filter(function (x) { return state.teach && state.teach[x.id] === 'doing'; }).map(function (x) { return x.title; });
    if (practising.length) out.practising = practising.slice(0, 8);
    return out;
  }

  function newId(now) { return (now || new Date()).getTime().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* Claude's scenario becomes the current one (checked: only strings, sensible lengths). */
  function setScenario(state, a, now) {
    if (!a || typeof a.scenario !== 'string' || !a.scenario.trim()) throw new Error('Claude didn’t send a scenario. Try again.');
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    state.current = { id: newId(now), at: (now || new Date()).toISOString(), title: s(a.title, 120) || 'A moment with ' + (state.child.name || 'her'),
      skill: SKILLS.indexOf(a.skill) >= 0 ? a.skill : 'Connection', scenario: s(a.scenario, 3000), question: s(a.question, 400) || 'What do you do and say?',
      age: ageText(state.child.birth, now), answer: '' };
    return state.current;
  }

  function cleanResult(a) {
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var list = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, 5).map(function (x) { return x.slice(0, 600); }) : []; };
    var sc = Math.round(+a.score);
    return { score: sc >= 1 && sc <= 10 ? sc : null, verdict: s(a.verdict, 400), good: list(a.good), improve: list(a.improve), better: s(a.better, 3000),
      why: s(a.why, 1500), practice: s(a.practice, 600), text: s(a.text, 3000),
      sources: Array.isArray(a.sources) ? a.sources.filter(function (x) { return x && typeof x.url === 'string' && /^https:\/\//.test(x.url); }).slice(0, 6)
        .map(function (x) { return { title: s(x.title, 200) || x.url, url: x.url.slice(0, 500) }; }) : [] };
  }

  /* His own real situation and Claude's advice (no score): kept in the history as kind "real". */
  function cleanAdvice(a) {
    var s = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var list = function (v, k) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, k || 6).map(function (x) { return x.slice(0, 600); }) : []; };
    return { summary: s(a.summary, 1500), steps: list(a.steps), say: list(a.say, 3), avoid: list(a.avoid, 3), why: s(a.why, 1500), watch: s(a.watch, 1000),
      text: s(a.text, 3000), sources: cleanResult(a).sources };
  }
  function addReal(state, situation, a, now) {
    a = a || {};
    if (!a.steps && !a.summary && !a.text) throw new Error('Claude didn’t send advice. Try again.');
    var h = { id: newId(now), at: (now || new Date()).toISOString(), kind: 'real', title: (typeof a.title === 'string' && a.title.slice(0, 120)) || 'Your situation',
      skill: SKILLS.indexOf(a.skill) >= 0 ? a.skill : 'Connection', scenario: String(situation).slice(0, 3000), question: '', age: ageText(state.child.birth, now),
      answer: '', result: null, advice: cleanAdvice(a) };
    state.history.push(h);
    if (state.history.length > 300) state.history.splice(0, state.history.length - 300);
    state.pending = null;
    return h;
  }
  /* "Practise this": his real situation becomes the scenario to answer and get graded on. */
  function practiseReal(state, id, now) {
    var h = state.history.filter(function (x) { return x.id === id && x.kind === 'real'; })[0]; if (!h) return null;
    state.current = { id: newId(now), at: (now || new Date()).toISOString(), title: h.title, skill: h.skill, scenario: h.scenario,
      question: 'Next time this happens, what do you do and say, step by step?', age: ageText(state.child.birth, now), answer: '', from: h.id };
    return state.current;
  }

  /* What to try this week: the "Try this week" lines from graded practice in the last 7 days (newest first, no
     repeats, up to 3), so a tip from a scenario isn't forgotten once the next one comes. */
  function tips(state, now, max) {
    var t = (now || new Date()).getTime(), seen = {}, out = [];
    for (var i = state.history.length - 1; i >= 0 && out.length < (max || 3); i--) {
      var h = state.history[i], p = h.result && h.result.practice, at = new Date(h.at).getTime();
      if (!p || !(t - at < 7 * 864e5) || at > t + 6e4) continue;
      var key = p.trim().toLowerCase(); if (!key || seen[key]) continue;
      seen[key] = 1; out.push({ text: p.trim(), skill: h.skill, id: h.id, at: h.at });
    }
    return out;
  }

  /* His answers on earlier "This week, try" tips (About you: "Did you try it with her?" and "Not for me?"), newest
     last, sent with scenario / grade / advice requests so Claude doesn't suggest again what he says he already does
     or she already does, and changes tack on what didn't work. me: the wl.me.v1 state (or null). */
  function tipNotes(state, me, max) {
    if (!me || !Array.isArray(me.feedback)) return [];
    var byId = {}, rows = [];
    state.history.forEach(function (h) { if (h && h.id) byId[h.id] = h; });
    me.feedback.forEach(function (f, idx) {
      if (!f || f.part !== 'coach' || !/^tip:/.test(String(f.about || ''))) return;
      var h = byId[String(f.about).slice(4)], tip = String(f.shown || (h && h.result && h.result.practice) || '').trim();
      if (!tip) return;
      var o = { tip: tip.slice(0, 300) };
      if (h && h.skill) o.skill = h.skill;
      if (f.kind === 'notfit') {
        o.notForMe = true;
        var rs = f.a && Array.isArray(f.a.reasons) ? f.a.reasons.filter(function (r) { return typeof r === 'string'; }).slice(0, 5) : [];
        if (rs.length) o.reasons = rs;
        if (typeof f.note === 'string' && f.note.trim()) o.note = f.note.trim().slice(0, 600);
      } else if (f.kind === 'after' && f.a && typeof f.a.tried === 'string' && f.a.tried !== 'Not yet') o.tried = f.a.tried;
      else return;
      var t = Date.parse(f.edited || f.at || '');
      rows.push({ o: o, _t: isNaN(t) ? 0 : t, _i: idx });
    });
    rows.sort(function (a, b) { return a._t - b._t || a._i - b._i; });
    return rows.slice(-(max || 6)).map(function (r) { return r.o; });
  }

  /* Tips he marked "It worked" (About you: "Did you try it with her?"), newest first, no repeats,
     excluding tips later flagged "Not for me". Kept in a recall list on #coach even after the 7-day
     "This week, try" window passes. me: the wl.me.v1 state (or null). */
  function workedTips(state, me, max) {
    if (!me || !Array.isArray(me.feedback)) return [];
    var byId = {}, notFit = {};
    state.history.forEach(function (h) { if (h && h.id) byId[h.id] = h; });
    me.feedback.forEach(function (f) {
      if (f && f.part === 'coach' && f.kind === 'notfit' && /^tip:/.test(String(f.about || ''))) notFit[String(f.about).slice(4)] = 1;
    });
    var rows = [];
    me.feedback.forEach(function (f, idx) {
      if (!f || f.part !== 'coach' || f.kind !== 'after' || !/^tip:/.test(String(f.about || ''))) return;
      if (!f.a || f.a.tried !== 'It worked') return;
      var id = String(f.about).slice(4);
      if (notFit[id]) return;
      var h = byId[id], text = String((h && h.result && h.result.practice) || '').trim();
      if (!text) return;
      var at = f.edited || f.at || (h && h.at) || '';
      var t = new Date(at).getTime();
      rows.push({ text: text, skill: h.skill, id: h.id, at: at, _t: isNaN(t) ? 0 : t, _i: idx });
    });
    rows.sort(function (a, b) { return b._t - a._t || b._i - a._i; });
    var seen = {}, out = [], cap = max || 8;
    for (var i = 0; i < rows.length && out.length < cap; i++) {
      var key = rows[i].text.toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ text: rows[i].text, skill: rows[i].skill, id: rows[i].id, at: rows[i].at });
    }
    return out;
  }

  /* The graded current scenario goes into the history. */
  /* scn: the scenario that was answered (the request may come back after he moved on to another one). */
  function grade(state, answer, a, now, scn) {
    var c = scn || state.current; if (!c) return null;
    var h = { id: c.id, at: (now || new Date()).toISOString(), title: c.title, skill: c.skill, scenario: c.scenario, question: c.question, age: c.age,
      answer: String(answer).slice(0, 4000), result: cleanResult(a || {}) };
    state.history.push(h);
    if (state.history.length > 300) state.history.splice(0, state.history.length - 300);
    if (state.current && state.current.id === c.id) state.current = null;
    state.pending = null;
    return h;
  }

  function validate(s) {
    if (!s || typeof s !== 'object') return null;
    var d = defaults();
    if (s.child && typeof s.child.name === 'string') d.child.name = s.child.name.slice(0, 40);
    if (s.child && parse(s.child.birth)) d.child.birth = s.child.birth;
    if (s.child && Array.isArray(s.child.can)) s.child.can.forEach(function (v) { if (CAN.indexOf(v) >= 0 && (d.child.can || []).indexOf(v) < 0) toggleCan(d, v); });
    if (s.child && typeof s.child.canNote === 'string') setCanNote(d, s.child.canNote);
    (Array.isArray(s.history) ? s.history : []).slice(-300).forEach(function (h) {
      if (!h || typeof h.scenario !== 'string' || isNaN(new Date(h.at).getTime())) return;
      d.history.push({ id: String(h.id || newId()).slice(0, 40), at: new Date(h.at).toISOString(), title: String(h.title || '').slice(0, 120),
        skill: SKILLS.indexOf(h.skill) >= 0 ? h.skill : 'Connection', scenario: h.scenario.slice(0, 3000), question: String(h.question || '').slice(0, 400),
        age: String(h.age || '').slice(0, 60), answer: String(h.answer || '').slice(0, 4000), result: h.result ? cleanResult(h.result) : null });
      if (h.kind === 'real' && h.advice) { var x = d.history[d.history.length - 1]; x.kind = 'real'; x.advice = cleanAdvice(h.advice); }
    });
    // the scenario he was answering (and his half-written answers) survive a restore too
    var c = s.current;
    if (c && typeof c.scenario === 'string' && c.scenario.trim()) {
      d.current = { id: String(c.id || newId()).slice(0, 40), at: isNaN(new Date(c.at).getTime()) ? new Date().toISOString() : new Date(c.at).toISOString(),
        title: String(c.title || '').slice(0, 120), skill: SKILLS.indexOf(c.skill) >= 0 ? c.skill : 'Connection', scenario: c.scenario.slice(0, 3000),
        question: String(c.question || 'What do you do and say?').slice(0, 400), age: String(c.age || '').slice(0, 60), answer: String(c.answer || '').slice(0, 4000) };
      if (typeof c.from === 'string') d.current.from = c.from.slice(0, 40);
    }
    if (typeof s.realDraft === 'string') d.realDraft = s.realDraft.slice(0, 3000);
    if (parse(s.autoTried)) d.autoTried = s.autoTried;
    if (parse(s.autoCancelled)) d.autoCancelled = s.autoCancelled;
    // automatic scenarios that couldn't reach the PC today: {day, n, next (ms)}
    if (s.autoFail && parse(s.autoFail.day) && s.autoFail.n >= 1 && s.autoFail.n <= 3 && isFinite(s.autoFail.next)) d.autoFail = { day: s.autoFail.day, n: Math.floor(s.autoFail.n), next: +s.autoFail.next };
    if (s.teach && typeof s.teach === 'object') {
      Object.keys(s.teach).forEach(function (id) {
        var v = s.teach[id];
        if (TEACH_BY[id] && (v === 'doing' || v === 'done')) d.teach[id] = v;
      });
    }
    return d;
  }

  var api = { SKILLS: SKILLS, CAN: CAN, TEACH: TEACH, iso: iso, toggleCan: toggleCan, setCanNote: setCanNote, canText: canText, setTeach: setTeach, teachForAge: teachForAge, doneToday: doneToday, scenarioDue: scenarioDue, doneInLast: doneInLast, defaults: defaults, ageMonths: ageMonths, ageText: ageText, skillStats: skillStats, suggestSkill: suggestSkill,
    scenarioInput: scenarioInput, setScenario: setScenario, grade: grade, addReal: addReal, practiseReal: practiseReal, tips: tips, tipNotes: tipNotes, workedTips: workedTips, cleanResult: cleanResult, validate: validate };
  root.CoachCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
