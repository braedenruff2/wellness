/* Calm (meditation) logic, no DOM. Short, practical practices for a tired parent: paced breathing, body scan,
   grounding, kindness, sleep. Christian contemplative prayer stays in the Faith module (linked from here).
   Storage 'wl.calm.v1': { sessions:[{date, at, id, mins, before, after}], settings:{voice, rate, minutes} } */
(function (root) {
  'use strict';

  /* Breathing patterns: phases in seconds [in, hold, out, hold]. */
  var PACERS = {
    box: { title: 'Box breathing', phases: [4, 4, 4, 4], blurb: 'In 4, hold 4, out 4, hold 4. Steadies you when you’re wound up.' },
    slow: { title: 'Slow breathing', phases: [5, 0, 6, 0], blurb: 'About six breaths a minute, longer out than in. The simplest way to calm your body.' },
    sigh: { title: 'Two sighs', phases: [3, 1, 7, 0], blurb: 'A deep breath in, a little sip more, then a long slow sigh out. A one-minute reset.', inLabel: 'In… and a little more' }
  };

  var PRACTICES = [
    { id: 'sigh', kind: 'pacer', pacer: 'sigh', title: 'One-minute reset', minutes: 1, fixed: true, when: 'Crying, frustration, a hard moment' },
    { id: 'slow', kind: 'pacer', pacer: 'slow', title: 'Slow breathing', minutes: 5, when: 'Anytime; baby in arms is fine' },
    { id: 'box', kind: 'pacer', pacer: 'box', title: 'Box breathing', minutes: 3, when: 'When you feel wound up' },
    { id: 'body', kind: 'guided', title: 'Body scan', minutes: 8, when: 'Lying down or in a chair', blurb: 'Notice each part of your body in turn and let it soften.', steps: [
      { say: 'Get comfortable, lying down or sitting. Let your eyes close if that feels right.', wait: 5 },
      { say: 'Take three slow breaths. Feel the weight of your body being held by the floor or the chair.', wait: 15 },
      { say: 'Bring your attention to your feet. Notice whatever is there: warmth, coolness, tingling, or nothing much. Just notice.', wait: 20 },
      { say: 'Move up to your lower legs and knees. If there is tightness, breathe into it, and let it soften on the out-breath.', wait: 20 },
      { say: 'Your thighs and hips. Let them be heavy.', wait: 20 },
      { say: 'Your belly. Feel it rise and fall with each breath. No need to change anything.', wait: 20 },
      { say: 'Your back. Upper, middle, lower. Many parents carry their tiredness here. Let it be held for a moment.', wait: 25 },
      { say: 'Your hands and arms, which do so much holding and carrying. Let them rest.', wait: 20 },
      { say: 'Your shoulders. Let them drop a little away from your ears.', wait: 20 },
      { say: 'Your neck, jaw, and face. Unclench your jaw. Soften around your eyes.', wait: 20 },
      { say: 'Now feel your whole body at once, breathing.', wait: 25 },
      { say: 'When you’re ready, wiggle your fingers and toes, and come back to the room.', wait: 0 }
    ] },
    { id: 'ground', kind: 'guided', title: '5-4-3-2-1 grounding', minutes: 3, fixed: true, when: 'Anxious or scattered', blurb: 'Bring your mind back to the room through your senses.', steps: [
      { say: 'Pause where you are. Take one slow breath.', wait: 5 },
      { say: 'Look around and name five things you can see. Quietly, one at a time.', wait: 25 },
      { say: 'Four things you can feel: your feet on the floor, your clothes, the air, maybe your baby’s weight.', wait: 25 },
      { say: 'Three things you can hear.', wait: 20 },
      { say: 'Two things you can smell, or two smells you like.', wait: 15 },
      { say: 'One thing you can taste, or one slow sip of water.', wait: 12 },
      { say: 'One more slow breath. You’re here, in this room, right now.', wait: 0 }
    ] },
    { id: 'feed', kind: 'guided', title: 'Mindful feed', minutes: 5, when: 'During a bottle feed or rocking', blurb: 'Turn a feed into a few calm minutes instead of scrolling.', steps: [
      { say: 'While you feed or rock your daughter, let your phone rest. Just listen.', wait: 5 },
      { say: 'Notice her weight in your arms, and where your body is holding her.', wait: 25 },
      { say: 'Notice the small sounds she makes. Her breathing.', wait: 30 },
      { say: 'Notice your own breathing. Let it slow down to match the quiet.', wait: 30 },
      { say: 'Look at one small detail: her eyelashes, her fingers. Look as if for the first time.', wait: 35 },
      { say: 'If your mind runs to the to-do list, that’s normal. Come back to her weight in your arms.', wait: 40 },
      { say: 'This moment won’t come again in quite the same way. Let yourself be here for it.', wait: 0 }
    ] },
    { id: 'kind', kind: 'guided', title: 'Kindness practice', minutes: 6, when: 'When you’re hard on yourself or others', blurb: 'Wish yourself and others well, in a few simple phrases.', steps: [
      { say: 'Sit comfortably. Breathe gently.', wait: 8 },
      { say: 'Think of yourself, as you are today: tired, trying. Say quietly: may I be patient with myself. May I rest when I can.', wait: 25 },
      { say: 'Now think of your daughter. May you be safe. May you be healthy. May you grow up knowing you are loved.', wait: 25 },
      { say: 'Now your wife. May you rest. May you feel supported. May we be kind to each other.', wait: 25 },
      { say: 'Now someone you find difficult. May you be well. May you have what you need.', wait: 25 },
      { say: 'And everyone else awake right now, caring for someone. May all of us be well.', wait: 20 },
      { say: 'Let the phrases go, and rest for a moment.', wait: 0 }
    ] },
    { id: 'sleep', kind: 'guided', title: 'Sleep wind-down', minutes: 8, when: 'In bed, when you finally get the chance', blurb: 'Tense and release each muscle group so your body lets go faster.', steps: [
      { say: 'Lie down and get comfortable. Turn the screen face down. Let the voice guide you.', wait: 5 },
      { say: 'Curl your toes and tense your feet for five seconds… and let go. Notice the difference.', wait: 15 },
      { say: 'Tighten your calves and thighs… hold… and release.', wait: 15 },
      { say: 'Squeeze your hands into fists and tense your arms… hold… and let them go heavy.', wait: 15 },
      { say: 'Lift your shoulders to your ears… hold… and drop them.', wait: 15 },
      { say: 'Scrunch your face… hold… and soften everything.', wait: 15 },
      { say: 'Now breathe slowly, letting each out-breath be a little longer than the in-breath.', wait: 40 },
      { say: 'If thoughts come, imagine setting each one on a shelf for tomorrow.', wait: 50 },
      { say: 'Nothing else to do now. Just rest.', wait: 0 }
    ] },
    { id: 'night', kind: 'guided', title: 'Back to sleep after a night wake', minutes: 5, when: 'After settling her at night, wide awake', blurb: 'For when she’s asleep again and your mind won’t stop.', steps: [
      { say: 'She’s settled. You did the job. Lie down and let the screen go dark.', wait: 5 },
      { say: 'Let your breath be slow, with the out-breath a little longer than the in-breath.', wait: 25 },
      { say: 'If you’re checking the clock or counting the hours left, notice that, and let it go. Rest still counts, even before sleep comes.', wait: 30 },
      { say: 'Let your jaw loosen. Let your shoulders sink into the bed.', wait: 30 },
      { say: 'If you listen for her, that’s natural. The monitor will tell you if she needs you. You can stop listening for now.', wait: 40 },
      { say: 'Picture a calm place you know well. Walk slowly through it in your mind.', wait: 60 },
      { say: 'Nothing to do now. Just rest.', wait: 0 }
    ] },
    { id: 'walk', kind: 'guided', title: 'Mindful walk', minutes: 6, when: 'Out with the stroller or on any walk', blurb: 'Turn a walk into a reset: steps, breath, and what’s around you.', steps: [
      { say: 'Walk at an easy pace. Keep your eyes on the path and your surroundings, and stay safe near traffic.', wait: 5 },
      { say: 'Notice your feet: heel, sole, toes, with each step.', wait: 30 },
      { say: 'Let your breathing find a rhythm with your steps. Maybe in for three steps, out for four.', wait: 45 },
      { say: 'Notice the air on your face. Is it cold, warm, still, windy?', wait: 40 },
      { say: 'Look for three things you haven’t noticed before on this walk.', wait: 60 },
      { say: 'Listen: near sounds, far sounds. Let them come and go.', wait: 50 },
      { say: 'Before you finish, take one slow breath and notice how you feel now compared with when you started.', wait: 0 }
    ] },
    { id: 'timer', kind: 'timer', title: 'Quiet timer', minutes: 10, when: 'Sit in silence with a bell at the end', blurb: 'No voice. A soft bell to start and finish.' }
  ];

  function defaults() { return { sessions: [], settings: { voice: true, rate: 0.9, minutes: 5 } }; }
  function iso(d) { var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }

  /* Where in a breathing cycle we are at time t (seconds): {phase: 0..3, label, frac (0-1 within phase), scale (0-1 circle size)}. */
  function pacerAt(pacer, t) {
    var p = PACERS[pacer].phases, cycle = p[0] + p[1] + p[2] + p[3];
    var x = ((t % cycle) + cycle) % cycle, i = 0;
    while (i < 3 && (x >= p[i] || p[i] === 0)) { x -= p[i]; i++; }
    var frac = p[i] ? Math.min(1, x / p[i]) : 1;
    var labels = [PACERS[pacer].inLabel || 'Breathe in', 'Hold', 'Breathe out', 'Hold'];
    var scale = i === 0 ? frac : i === 1 ? 1 : i === 2 ? 1 - frac : 0;
    return { phase: i, label: labels[i], frac: frac, scale: scale, cycle: cycle };
  }

  function record(state, practiceId, mins, before, after, now) {
    now = now || new Date();
    var s = { id: practiceId, date: iso(now), at: now.toISOString(), mins: Math.max(0, Math.round(mins * 10) / 10),
      before: before >= 1 && before <= 5 ? before : null, after: after >= 1 && after <= 5 ? after : null };
    state.sessions.push(s);
    return s;
  }

  function stats(state, now) {
    now = now || new Date();
    var from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    var week = state.sessions.filter(function (s) { return s.date >= from; });
    var mins = week.reduce(function (a, s) { return a + s.mins; }, 0);
    var days = {}; week.forEach(function (s) { days[s.date] = 1; });
    var rated = state.sessions.filter(function (s) { return s.before && s.after; }).slice(-20);
    var drop = rated.length ? rated.reduce(function (a, s) { return a + (s.before - s.after); }, 0) / rated.length : null;
    return { weekMins: Math.round(mins), weekDays: Object.keys(days).length, total: state.sessions.length, avgDrop: drop, rated: rated.length };
  }

  /* A practice that fits the moment. */
  function suggest(state, now) {
    now = now || new Date();
    var h = now.getHours();
    if (h >= 22) return 'sleep';
    if (h < 5) return 'night'; /* up in the night: likely a wake to settle her */
    if (h < 9) return 'slow';
    var st = stats(state, now);
    if (st.weekDays === 0) return 'sigh';
    return 'body';
  }

  function advice(state, now) {
    var st = stats(state, now);
    if (st.total === 0) return 'Start tiny: the one-minute reset. Once a day is plenty to begin.';
    if (st.avgDrop != null && st.rated >= 3 && st.avgDrop >= 0.5) return 'On average you feel ' + st.avgDrop.toFixed(1) + ' points calmer afterwards. That’s it working.';
    if (st.weekDays >= 5) return st.weekDays + ' days this week. A steady habit: this is where the benefits build.';
    if (st.weekDays === 0) return 'Nothing this week yet. One minute counts.';
    return st.weekMins + ' minutes on ' + st.weekDays + ' day' + (st.weekDays === 1 ? '' : 's') + ' this week. Short and often beats long and rare.';
  }

  function validate(s) {
    if (!s || !Array.isArray(s.sessions)) return null;
    var d = defaults(), ids = PRACTICES.map(function (p) { return p.id; });
    s.sessions.forEach(function (x) {
      if (x && ids.indexOf(x.id) >= 0 && /^\d{4}-\d\d-\d\d$/.test(x.date) && typeof x.mins === 'number')
        d.sessions.push({ id: x.id, date: x.date, at: String(x.at || ''), mins: Math.max(0, Math.min(240, x.mins)),
          before: [1, 2, 3, 4, 5].indexOf(x.before) >= 0 ? x.before : null, after: [1, 2, 3, 4, 5].indexOf(x.after) >= 0 ? x.after : null });
    });
    var st = s.settings || {};
    if (typeof st.voice === 'boolean') d.settings.voice = st.voice;
    if (typeof st.rate === 'number' && st.rate >= 0.5 && st.rate <= 1.6) d.settings.rate = st.rate;
    if ([3, 5, 10, 15, 20].indexOf(st.minutes) >= 0) d.settings.minutes = st.minutes;
    return d;
  }

  var api = { PACERS: PACERS, PRACTICES: PRACTICES, defaults: defaults, pacerAt: pacerAt, record: record, stats: stats, suggest: suggest, advice: advice, validate: validate, iso: iso };
  root.CalmCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
