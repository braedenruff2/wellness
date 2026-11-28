/* Calm (meditation) logic, no DOM. Short, practical practices for a tired parent: paced breathing, body scan,
   grounding, kindness, sleep. Christian contemplative prayer stays in the Faith module (linked from here).
   Storage 'wl.calm.v1': { sessions:[{date, at, id, mins, before, after, focus?, hind?}],
     settings:{voice, rate, minutes, tick, dailyGoal, aim: null|'calm'|'train', stage: a PATH id, sitMinutes,
     dark: screen goes dark during sits and the quiet timer, interval: soft bell every N min during them (0 = off), sitQuiet: path sits with only the opening and closing lines} }
   aim 'train' = he meditates to train the mind (the meditation path), not only for stress: Calm leads with his stage. */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');

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
    { id: 'shuffle', kind: 'guided', title: 'Picture-word shuffle', minutes: 5, when: 'In bed, when your thoughts won’t stop', blurb: 'Give a busy mind an easy, dull job: one word, letter by letter, a picture for each.', steps: [
      { say: 'Lie down and turn the screen over. This is a slow, easy game that gives your mind something harmless to do.', wait: 5 },
      { say: 'Choose a plain, calm word with a few letters, like bread, or garden.', wait: 10 },
      { say: 'Take its first letter. Think of any word that starts with it, and picture that thing for a few seconds.', wait: 30 },
      { say: 'Then another word with the same letter, and picture that one too. A banana. A boat. A blanket. Take your time with each.', wait: 60 },
      { say: 'When no more words come, move to the next letter of your word and start again.', wait: 60 },
      { say: 'If a worry comes back, that’s fine. Go back to the next word and its picture.', wait: 60 },
      { say: 'If you lose your place, pick any letter you like. There’s no wrong way to do this.', wait: 60 },
      { say: 'Keep going on your own. Let the pictures come slower and softer.', wait: 0 }
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
    { id: 'pickup', kind: 'guided', title: 'Before you pick her up', minutes: 1, fixed: true, when: 'She’s crying and you’re wound up', blurb: 'Thirty seconds to steady yourself first, so she borrows your calm.', steps: [
      { say: 'She’s safe for a moment. Stop where you are and put both feet flat on the floor.', wait: 4 },
      { say: 'Breathe in through your nose, and let a long breath out through your mouth.', wait: 8 },
      { say: 'Once more. In, and a long, slow breath out. Let your shoulders drop.', wait: 8 },
      { say: 'Soften your face and your hands. She feels your body before she hears your words.', wait: 6 },
      { say: 'Now go to her slowly, and keep breathing out long while you hold her.', wait: 0 }
    ] },
    { id: 'sink', kind: 'guided', title: 'Washing-up mindfulness', minutes: 4, when: 'Dishes, bottles, laundry: any chore', blurb: 'A chore you have to do anyway becomes a few calm minutes.', steps: [
      { say: 'Keep doing the chore, just a little slower than usual.', wait: 10 },
      { say: 'Notice the temperature: warm water, cool air, the weight of what’s in your hands.', wait: 35 },
      { say: 'Notice the sounds: water, cups, the hum of the room.', wait: 35 },
      { say: 'When your mind runs to the next job, notice where it went, and come back to your hands.', wait: 45 },
      { say: 'Breathe out slowly as you finish each item.', wait: 40 },
      { say: 'Before you stop, notice one thing that’s going fine right now.', wait: 0 }
    ] },
    { id: 'contact', kind: 'guided', title: 'Breathing with her asleep on you', minutes: 4, when: 'She’s napping on your chest and you can’t move', blurb: 'Turn a contact nap into rest for you too.', steps: [
      { say: 'She’s asleep on you. You don’t need to go anywhere. Let your back and head rest against something.', wait: 8 },
      { say: 'Feel the weight and warmth of her on your chest. Feel her breathing.', wait: 30 },
      { say: 'Let your own breath slow down, a little longer on the out-breath. She may slow down with you.', wait: 40 },
      { say: 'Let your shoulders and jaw soften. Keep one hand gently on her back.', wait: 35 },
      { say: 'If your mind lists the things you could be doing, let them wait. This counts too.', wait: 40 },
      { say: 'Stay as long as she sleeps. When you’re ready, just keep resting with her.', wait: 0 }
    ] },
    { id: 'timer', kind: 'timer', title: 'Quiet timer', minutes: 10, when: 'Sit in silence with a bell at the end', blurb: 'No voice. A soft bell to start and finish.' },
    /* The meditation path (settings.aim 'train'): meditation as training the mind rather than only easing stress. Five
       sits in the order many contemplative traditions teach them: first steady attention (concentration), then seeing
       experience clearly as it comes and goes (insight), then open awareness. Sparse words, long silences. */
    { id: 'count', kind: 'guided', path: 1, title: 'Counting breaths', minutes: 20, when: 'Stage 1: steadying attention', blurb: 'Count each out-breath from one to ten, then start again. Lose count, start again at one.', steps: [
      { say: 'Sit upright and at ease, on a chair or a cushion. Let your eyes close, or rest them on the floor a little ahead of you.', wait: 5 },
      { say: 'Let your breathing be natural; there’s no need to control it. Find where you feel it most clearly: at the nostrils, or in the belly.', wait: 10 },
      { say: 'Silently count each out-breath, from one up to ten, then start again at one. If you lose count, or find yourself at eleven, simply start again at one.', wait: 60 },
      { say: 'Each time you notice you’ve drifted, that moment of noticing is the practice. No need to judge it. Come back to one.', wait: 90 },
      { say: 'If you’re getting drowsy, sit up a little straighter and let a little light in through your eyes. If you’re restless, let each out-breath be a little longer.', wait: 90 },
      { say: 'Keep the count light, like a soft label on each breath, with most of your attention on the breath itself.', wait: 90 },
      { say: 'One breath at a time.', wait: 60 },
      { say: 'Let the counting go. For a moment, just feel the whole body breathing.', wait: 10 },
      { say: 'Slowly open your eyes. Notice how your mind feels now, compared with when you sat down.', wait: 0 }
    ] },
    { id: 'follow', kind: 'guided', path: 2, title: 'Following the breath', minutes: 20, when: 'Stage 2: attention without counting', blurb: 'Drop the numbers and follow each whole breath, beginning, middle and end.', steps: [
      { say: 'Sit upright and at ease. Let your eyes close, or rest them softly on the floor.', wait: 5 },
      { say: 'Begin with a few rounds of counting out-breaths to ten, to gather the mind.', wait: 40 },
      { say: 'Now drop the numbers. Follow each breath from its very beginning, through its middle, to its end, and notice the small pause before the next one.', wait: 80 },
      { say: 'Your mind will wander. When you notice, note where it went, then come back to the next breath. Coming back is the training.', wait: 90 },
      { say: 'See how much detail you can notice: coolness or warmth, the stretch of the belly, how long each breath is.', wait: 90 },
      { say: 'Hold the breath in attention lightly: not gripping it, not letting it go.', wait: 90 },
      { say: 'Stay with the breath.', wait: 60 },
      { say: 'Let go of the breath now and rest for a moment.', wait: 10 },
      { say: 'Open your eyes when you’re ready. Notice how your mind feels.', wait: 0 }
    ] },
    { id: 'note', kind: 'guided', path: 3, title: 'Noting', minutes: 20, when: 'Stage 3: seeing what pulls you away', blurb: 'Stay with the breath, and give whatever pulls you away a soft one-word label.', steps: [
      { say: 'Sit upright and at ease, with your eyes closed or resting on the floor.', wait: 5 },
      { say: 'Start with the breath for a minute or two, to steady the mind.', wait: 50 },
      { say: 'Now, whenever something pulls your attention away from the breath, give it a soft one-word label: thinking, hearing, feeling, planning, remembering. Then return to the breath.', wait: 80 },
      { say: 'Keep the label quiet and simple, a small part of your attention. Most of it goes to actually seeing what’s there.', wait: 90 },
      { say: 'Notice how each thing that pulls you away shows up, stays a while, and goes. There’s no need to push anything away.', wait: 90 },
      { say: 'Moods can be noted too: restless, impatient, sleepy, bored. Noting it is enough.', wait: 90 },
      { say: 'Breath, a label for what pulls you away, back to the breath.', wait: 60 },
      { say: 'Let the labels go and rest for a moment.', wait: 10 },
      { say: 'Open your eyes when you’re ready.', wait: 0 }
    ] },
    { id: 'change', kind: 'guided', path: 4, title: 'Watching things change', minutes: 20, when: 'Stage 4: insight into change', blurb: 'Look closely at sensations, sounds and thoughts, and see each one arise, change and pass.', steps: [
      { say: 'Sit upright and at ease, with your eyes closed or resting on the floor.', wait: 5 },
      { say: 'Rest your attention on the breath for a little while.', wait: 50 },
      { say: 'Now turn to the body. Find one sensation: tingling in the hands, pressure where you sit, warmth. Look closely. Is it solid and fixed, or changing moment by moment?', wait: 90 },
      { say: 'Do the same with sounds. Notice each one begin, change, and fade.', wait: 90 },
      { say: 'Thoughts too. Notice a thought appear, stay a moment, and pass, without following where it goes.', wait: 90 },
      { say: 'Everything you look at keeps changing and passing, and you are still here, noticing. Rest in that noticing.', wait: 90 },
      { say: 'Keep watching things come and go.', wait: 60 },
      { say: 'Let it all go and rest for a moment.', wait: 10 },
      { say: 'Open your eyes when you’re ready.', wait: 0 }
    ] },
    { id: 'open', kind: 'guided', path: 5, title: 'Open awareness', minutes: 20, when: 'Stage 5: awareness without a focus', blurb: 'No single object: let sounds, sensations and thoughts come and go, and rest in being aware.', steps: [
      { say: 'Sit upright and at ease, with your eyes closed or resting on the floor.', wait: 5 },
      { say: 'Begin with the breath for a minute, to steady the mind.', wait: 40 },
      { say: 'Now let go of any one focus. Let sounds, sensations, thoughts and feelings come and go, without choosing between them.', wait: 90 },
      { say: 'When you find yourself lost in a thought, notice it, and relax back into simply being aware, the way the sky lets clouds pass.', wait: 90 },
      { say: 'There is nothing to get and nothing to push away. Just be aware of whatever is here.', wait: 90 },
      { say: 'If the mind gets too scattered, come back to the breath for a while, then open up again.', wait: 90 },
      { say: 'Rest in open awareness.', wait: 60 },
      { say: 'Let the practice go now.', wait: 10 },
      { say: 'Open your eyes when you’re ready. Take a moment before you get up.', wait: 0 }
    ] }
  ];
  var PATH = PRACTICES.filter(function (p) { return p.path; }).map(function (p) { return p.id; });
  /* How steady his attention was in a sit (1-3), and what got in the way (the classic hindrances, plainly named). */
  var FOCUS = ['Mostly lost in thought', 'Some steady stretches', 'Mostly steady'];
  var HIND = ['Sleepy', 'Restless', 'Doubting it', 'Interrupted', 'Nothing much'];
  var HIND_TIP = {
    Sleepy: 'Last time you were sleepy: sit more upright, eyes a little open, or try a time of day when you’re more awake.',
    Restless: 'Last time you were restless: let the out-breath be longer, and go back to counting for a few minutes if it helps.',
    'Doubting it': 'Last time you doubted it: that’s common. Judge it by weeks of practice, not one sit.',
    Interrupted: 'Last time you were interrupted: a shorter sit when she’s asleep still counts.'
  };
  // while he is still on counting breaths, "go back to counting" makes no sense: a shorter count does the same job
  var HIND_TIP_COUNT = {
    Restless: 'Last time you were restless: let each out-breath be a little longer, and if ten feels far away, count to four and start again, as many times as you need.'
  };

  /* Other wordings for the guided scripts, so a practice doesn't sound the same every time. VARIANTS[id][i] lists
     alternatives for step i (the step's own `say` is wording 0). scriptFor picks wording n % count for each step,
     where n = how many times he has done that practice, so each time through it changes. Same timing either way. */
  var VARIANTS = {
    body: [
      ['Find a position you can stay in for a few minutes. Close your eyes, or rest your gaze on the floor.', 'Settle in, lying down or sitting. There’s nothing to get right here; just follow along.'],
      ['Breathe in slowly, and let the breath out slowly. Twice more. Feel where your body meets what’s under it.', 'Three slow breaths. With each one out, let yourself be a little heavier.'],
      ['Start at the soles of your feet. What do they feel like right now? Whatever you notice is fine.', 'Let your attention rest on your toes, then the rest of your feet. You don’t need to feel anything special.'],
      ['Now your ankles, shins and knees. Wherever it’s tight, breathe towards it and let it ease as you breathe out.', 'Your calves and knees. Notice them, and on the next out-breath, let them loosen.'],
      ['Your upper legs and hips. Let the floor or the chair take their weight.', 'Move to your thighs and hips. Nothing to hold up now.'],
      ['Your stomach. Notice it moving as you breathe, all on its own.', 'Rest your attention on your belly. In, and out. Let it be soft.'],
      ['Your back, from the bottom to the top. If it aches from carrying and bending, give it a moment of attention, kindly.', 'Your lower back, then between your shoulder blades. Let the support behind you take some of the load.'],
      ['Your arms and hands. They lift and hold all day. For now, there’s nothing to hold.', 'Notice your fingers, palms, wrists and arms. Let your hands lie open.'],
      ['Your shoulders. Notice if they’ve crept up, and let them settle down.', 'Let your shoulders sink, as if they were melting a little.'],
      ['Your neck, your jaw, the muscles round your eyes. Let your teeth part a little. Let your forehead be smooth.', 'Your face. Loosen your jaw, your cheeks, your eyes, your forehead.'],
      ['Now take in your whole body together, from head to feet, breathing quietly.', 'Feel your body as one whole, resting and breathing.'],
      ['Begin to move a little: fingers, toes, a stretch if you like. Then open your eyes.', 'Take a deeper breath, move gently, and come back when you’re ready.']
    ],
    ground: [
      ['Stop for a moment. One slow breath in, and out.', 'Wherever you are, let yourself pause. Breathe out slowly.'],
      ['Find five things you can see. Name each one to yourself, slowly.', 'Look for five things around you. Notice their colour or shape as you name them.'],
      ['Now four things you can feel: the chair or floor under you, the temperature, your hands, whatever is touching you.', 'Four things you can touch or feel right now. Take your time with each.'],
      ['Three sounds. Near or far, loud or soft.', 'Listen for three different sounds.'],
      ['Two smells, or think of two smells you enjoy.', 'Notice two things you can smell, even faintly.'],
      ['One taste. Or take a sip of water and notice it.', 'Notice one taste in your mouth, or have a drink and taste it.'],
      ['Take one more slow breath. You’re here, and this moment is enough to handle.', 'One more breath. Notice that you’re a little more here than a few minutes ago.']
    ],
    feed: [
      ['As you feed or rock her, put the phone down and let the voice do the rest.', 'Let your phone rest nearby. For these few minutes, just be with her.'],
      ['Feel how heavy she is in your arms. Notice your hands, your arms, your back holding her.', 'Notice the warmth of her against you, and where you feel it.'],
      ['Listen to her: swallowing, breathing, the small noises.', 'Notice her breathing. Is it fast, slow, settling?'],
      ['Notice your breath too. Let it slow, a little at a time.', 'Breathe out slowly, and let your shoulders drop.'],
      ['Choose one small detail of her and really look at it, as if you’d never seen it before.', 'Look at her hands, or her hair, or her face. Notice something you hadn’t noticed today.'],
      ['When your mind wanders to other things, that’s fine. Bring it back to her in your arms.', 'Thoughts will come. Each time, come back to the feeling of holding her.'],
      ['These ordinary minutes are a gift. Stay here with her for as long as the feed lasts.', 'Take one more slow breath and let this moment be enough.']
    ],
    kind: [
      ['Settle into your seat. Let your breath be easy.', 'Sit comfortably, and let your breathing slow down by itself.'],
      ['Picture yourself today, doing your best. Say quietly: may I be gentle with myself. May I get the rest I need.', 'Think of yourself kindly, as you would a friend. May I be at ease. May I forgive myself the hard moments today.'],
      ['Picture your daughter. May you be safe. May you be happy. May you always know you are loved.', 'Think of your daughter as she is right now. May you be healthy. May you sleep well. May you feel safe with us.'],
      ['Think of your wife. May you be well. May you have moments of rest. May we look after each other.', 'Picture your wife. May you be happy. May you feel loved. May we be patient with each other.'],
      ['Think of someone who is hard for you right now. As best you can: may you be well. May things go well for you.', 'Bring to mind someone you’re struggling with. It’s fine if this is hard. May you find peace. May you be well.'],
      ['Widen it out to everyone up with a child tonight, or caring for someone. May we all be well.', 'And all the parents, everywhere, doing their best today. May we all be well.'],
      ['Let the words go. Rest here a moment.', 'Let it all go now, and simply sit for a moment.']
    ],
    sleep: [
      ['Get comfortable in bed and turn the screen over. Just listen.', 'Lie back and let the bed hold you. Put the phone face down.'],
      ['Tense your feet and toes, hold for a moment… and let them relax.', 'Point your toes and tighten your feet… hold it… and let go.'],
      ['Now your legs: tighten them… hold… and let go.', 'Press your legs down into the bed and tense them… hold… and release.'],
      ['Make fists and tighten your arms… hold… and let them drop.', 'Clench your hands and arms… hold for a few seconds… and let them go loose.'],
      ['Raise your shoulders up high… hold… and let them fall.', 'Pull your shoulders up towards your ears… hold… and drop them down.'],
      ['Squeeze your eyes and face tight… hold… and let it all go soft.', 'Tighten your face… hold… and let your jaw and eyes loosen completely.'],
      ['Breathe slowly now, the out-breath a little longer each time.', 'Let your breathing slow down. Out a little longer than in.'],
      ['Thoughts may come. Put each one aside for tomorrow, one at a time.', 'If your mind is busy, let each thought drift past like a car going by outside.'],
      ['There’s nothing left to do today. Rest.', 'You can let the day go now. Rest.']
    ],
    night: [
      ['She’s asleep. That part’s done. Lie back and let yourself rest too.', 'Well done getting her back down. Now it’s your turn. Lie back.'],
      ['Breathe slowly. Let the breath out take a little longer than the breath in.', 'Slow your breathing down, a little at a time. Long, easy breaths out.'],
      ['If you’re working out how much sleep is left, notice it, and let it go. Lying still and resting helps, even awake.', 'Try not to watch the clock. Resting quietly is good for you, even before sleep comes.'],
      ['Soften your jaw. Let your shoulders and arms go heavy.', 'Unclench your hands and jaw. Let your body sink a little deeper.'],
      ['Part of you may still be listening for her. You’ll hear her if she needs you. You can let that go for now.', 'You’ll hear her if she wakes. For now, let the listening rest.'],
      ['Imagine somewhere peaceful you’ve been. Notice what you see and hear there, slowly.', 'Picture a quiet place you love. Take a slow walk around it in your mind.'],
      ['Nothing else is needed. Rest.', 'Let go. Rest now.']
    ],
    shuffle: [
      ['Lie back and put the phone face down. Here’s a quiet little game to keep your mind busy with nothing important.', 'Get comfortable and turn the screen away. You’re going to give your thoughts an easy job.'],
      ['Pick an ordinary word, nothing that matters, like table, or orange.', 'Think of a simple, peaceful word, like cloud, or pillow.'],
      ['Start with its first letter. Find a word that begins with it, and see that thing in your mind for a moment.', 'Say its first letter to yourself. Think of something that starts with it, and imagine it clearly.'],
      ['Now a different word with that same letter, and picture it. Then another. Slowly, one picture at a time.', 'Find another word with that letter and imagine it. And another. No rush between them.'],
      ['Run out of words? Go on to the next letter and begin again.', 'When that letter runs dry, take the next letter of your word.'],
      ['Thoughts about tomorrow may come back. Let them go and return to your next word.', 'If something from the day pops up, just pick the next word and picture it.'],
      ['Lost track? Start with any letter. You can’t get this wrong.', 'If you forget where you were, any letter will do. It doesn’t matter.'],
      ['Carry on by yourself now, slower and slower.', 'Keep picturing on your own, each word a little drowsier than the last.']
    ],
    contact: [
      ['She’s sleeping on you. Nowhere to be. Lean back and let your head rest.', 'She’s settled on your chest. Get as comfortable as you can without waking her.'],
      ['Notice her weight and warmth, and the rise and fall of her breathing.', 'Feel how heavy and warm she is, and her small breaths.'],
      ['Slow your breathing a little, with a longer breath out. Babies often settle with you.', 'Breathe slowly and let each out-breath be long and easy. She can feel you calm down.'],
      ['Soften your shoulders and your jaw. Rest a hand lightly on her back.', 'Let your arms and face relax. One hand resting on her back is enough.'],
      ['Your to-do list can wait. Resting together is worth it.', 'If you start planning, that’s fine. Let it go for now; this time matters.'],
      ['Stay while she sleeps. When it ends, it ends. Keep resting with her.', 'Rest here with her as long as the nap lasts.']
    ],
    pickup: [
      ['Pause for a moment; she’s safe. Feel your feet on the floor.', 'Stop for a breath before you go to her. Plant your feet.'],
      ['In through your nose, then breathe out long through your mouth.', 'Take a breath in, and let it out slowly, like blowing on hot tea.'],
      ['Again: in, then a slow, long breath out. Shoulders down.', 'One more slow breath. Let your shoulders fall away from your ears.'],
      ['Let your face and hands go soft. Babies pick up on a calm body.', 'Unclench your jaw and your fingers. Your calm reaches her through your arms.'],
      ['Go to her gently. Keep your out-breaths long as you hold her.', 'Pick her up slowly, and keep breathing out long and easy.']
    ],
    sink: [
      ['Carry on with the job, just a bit more slowly.', 'Keep going with what you’re doing, at a gentler pace.'],
      ['Feel the warmth or coolness, and the weight of what you’re holding.', 'Notice what your hands feel: water, steam, cloth, weight.'],
      ['Listen to the sounds around you: water running, things clinking, the room itself.', 'Notice what you can hear while you work, near and far.'],
      ['Your mind will jump to the next task. When it does, notice, and bring it back to your hands.', 'When you catch yourself planning, that’s fine. Come back to what your hands are doing.'],
      ['Let a slow breath out each time you put something down.', 'Each time you finish one thing, breathe out slowly.'],
      ['Before you finish, find one thing that’s going okay right now.', 'As you finish, notice one small thing that’s fine in this moment.']
    ],
    walk: [
      ['Walk at a comfortable pace. Stay aware of the path, traffic and the people around you.', 'Keep an easy pace and watch where you’re going; this practice works with your eyes open.'],
      ['Feel your feet as they meet the ground: heel, then toes.', 'Notice each step: the push of one foot, the landing of the other.'],
      ['Let your breath fall into time with your walking. In for a few steps, out for a few more.', 'Count your steps as you breathe in and as you breathe out. Let the out-breath be a step longer.'],
      ['Notice the air: cold or mild, wind or still, on your face and hands.', 'Notice the weather on your skin. What’s it like today?'],
      ['Look around for three things you’ve never noticed on this route.', 'Look up and around. Find three things you’d normally walk past without seeing.'],
      ['Listen to what’s around you: close sounds and distant ones.', 'Let your ears open: your footsteps, the wheels, birds, cars, wind.'],
      ['Take a slow breath and notice how you feel now compared with when you set out.', 'Before you go on, notice: is anything different from when you started?']
    ]
  };

  function variantCount(p) { var v = VARIANTS[p.id]; return v ? 1 + Math.max.apply(null, v.map(function (a) { return a.length; })) : 1; }
  /* The guided steps for the n-th time through this practice (n from 0). */
  function scriptFor(p, n) {
    var v = VARIANTS[p.id] || [], k = Math.max(0, n | 0);
    return p.steps.map(function (s, i) {
      var all = [s.say].concat(v[i] || []);
      return { say: all[k % all.length], wait: s.wait };
    });
  }
  function timesDone(state, id) { return state.sessions.filter(function (s) { return s.id === id; }).length; }

  var DAILY_GOALS = [1, 5, 10, 15, 20], SIT_LENGTHS = [10, 15, 20, 30], NOISE_KINDS = ['off', 'brown', 'pink', 'white', 'fan', 'ocean'], NOISE_VOLS = ['soft', 'medium', 'loud'];
  function defaults() { return { sessions: [], settings: { voice: true, rate: 0.9, minutes: 5, tick: false, dailyGoal: 10, aim: null, stage: 'count', sitMinutes: 20, dark: true, interval: 0, sitQuiet: false, noise: 'off', noiseVol: 'medium' } }; }
  /* A quiet sit (settings.sitQuiet): the opening steps up to the main instruction (the first long silence), then
     silence, then the last two closing lines. The silences of the dropped lines go to the main one, so scaleScript
     still fills the sit. Steps are copied; the practice's own list is never changed. */
  function quietScript(steps) {
    var k = -1, cp = function (x) { return { say: x.say, wait: x.wait || 0, kind: x.kind }; };
    steps.some(function (x, i) { if ((x.wait || 0) >= 60) { k = i; return true; } return false; });
    if (k < 0 || steps.length - 2 <= k + 1) return steps.map(cp);
    var extra = steps.slice(k + 1, steps.length - 2).reduce(function (a, x) { return a + (x.wait || 0); }, 0);
    var out = steps.slice(0, k + 1).map(cp); out[k].wait += extra;
    return out.concat(steps.slice(-2).map(cp));
  }
  var INTERVALS = [0, 5, 10];
  /* Interval bells during a sit: the bell number due at e seconds (0 = none yet); none in the last 30 s, the end bell comes then. */
  function intervalBell(every, e, total) {
    if (!every || !(e > 0) || !(total > 0) || e > total - 30) return 0;
    return Math.floor(e / (every * 60));
  }
  function goalOf(state) { var g = state && state.settings && state.settings.dailyGoal; return DAILY_GOALS.indexOf(g) >= 0 ? g : 10; }
  var iso = WLD.iso;

  /* Where in a breathing cycle we are at time t (seconds): {phase: 0..3, label, frac (0-1 within phase), scale (0-1 circle size)}. */
  /* The sound for entering a phase: in rises, out falls, holds sit between. */
  function tickFor(phase) { return phase === 0 ? 'up' : phase === 2 ? 'down' : 'hold'; }
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
    var m = isFinite(mins) ? Math.max(0, Math.round(mins * 10) / 10) : 0;
    var s = { id: practiceId, date: iso(now), at: now.toISOString(), mins: m,
      before: before >= 1 && before <= 5 ? before : null, after: after >= 1 && after <= 5 ? after : null };
    state.sessions.push(s);
    return s;
  }

  function sessionMs(s) {
    var t = s && s.at ? Date.parse(s.at) : NaN;
    if (!isNaN(t)) return t;
    if (s && s.date) { var d = Date.parse(s.date + 'T00:00:00Z'); if (!isNaN(d)) return d; }
    return 0;
  }

  function stats(state, now) {
    now = now || new Date();
    var to = iso(now), from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    var upTo = state.sessions.filter(function (s) { return !s.date || s.date <= to; });
    var week = upTo.filter(function (s) { return s.date >= from; });
    var mins = week.reduce(function (a, s) { return a + s.mins; }, 0);
    var days = {}; week.forEach(function (s) { days[s.date] = 1; });
    var rated = upTo.filter(function (s) { return s.before && s.after; })
      .sort(function (a, b) { return sessionMs(a) - sessionMs(b); }).slice(-20);
    var drop = rated.length ? rated.reduce(function (a, s) { return a + (s.before - s.after); }, 0) / rated.length : null;
    return { weekMins: Math.round(mins), weekDays: Object.keys(days).length, total: upTo.length, avgDrop: drop, rated: rated.length };
  }

  /* What Calm asks of him: reach his daily minutes goal (default 10 min; configurable 1-20 min). A 1-min reset
     counts toward the total and shows partial progress until the daily goal is met. */
  function today(state, now) {
    now = now || new Date();
    var d = iso(now), list = state.sessions.filter(function (s) { return s.date === d; });
    var raw = list.reduce(function (a, s) { return a + (s.mins || 0); }, 0);
    var goal = goalOf(state);
    return { done: raw >= goal - 0.15, any: list.length > 0, count: list.length, mins: Math.round(raw), rawMins: Math.round(raw * 10) / 10, goal: goal,
      ids: list.map(function (s) { return s.id; }) };
  }

  /* Practices that fit the time of day, best first. */
  var RACING = ['shuffle', 'ground', 'night'];
  function fits(h) {
    if (h >= 22) return ['sleep', 'body', 'shuffle', 'slow'];
    if (h < 5) return ['night', 'shuffle', 'slow', 'sigh'];
    if (h < 9) return ['slow', 'box', 'sigh', 'walk'];
    return ['body', 'ground', 'kind', 'walk', 'feed', 'contact', 'sink', 'slow', 'box', 'sigh', 'pickup', 'timer'];
  }

  /* A practice that fits the moment: never one already done today; among those that fit the time of day, the one
     done least recently (so the days vary), keeping the time-of-day order for ties. First time ever: the short reset.
     opts (from what he told the app, modules/me): score {id: n} (helped +, "not for me" -3), prefer [ids] from the
     weekly plan, tooLong {id: 1}, rough (bad night: short ones first). Practices he marked down (score <= -2) are
     left out while anything else fits; liked / planned ones come first. */
  /* A weak signal from his own before/after stress ratings (1-5) on each practice's last 10 rated sessions (2+ needed):
     on average 0.5+ calmer afterwards -> +1; never calmer, starting stressed (before 3+ on average) -> -1. */
  function feltScores(state, now) {
    var to = now ? iso(now) : null;
    var by = {}, out = {};
    (state.sessions || []).forEach(function (x) {
      if (to && x.date && x.date > to) return;
      if (typeof x.before === 'number' && typeof x.after === 'number') (by[x.id] = by[x.id] || []).push(x);
    });
    Object.keys(by).forEach(function (id) {
      var l = by[id].slice().sort(function (a, b) { return sessionMs(a) - sessionMs(b); }).slice(-10);
      var drop = 0, before = 0, any = false;
      l.forEach(function (x) { drop += x.before - x.after; before += x.before; if (x.after < x.before) any = true; });
      if (l.length < 2) return; // one rating says little
      if (drop / l.length >= 0.5) out[id] = 1;
      else if (!any && before / l.length >= 3) out[id] = -1;
    });
    return out;
  }
  function stageOf(state) { var st = state && state.settings && state.settings.stage; return PATH.indexOf(st) >= 0 ? st : PATH[0]; }
  /* Where he is on the meditation path: the stage, its sits (newest last), how steady the last 5 rated ones were, and
     whether to offer the next stage: 6+ sits at this stage and 3 of the last 5 rated "Mostly steady". Never automatic. */
  var READY_SITS = 6;
  /* Which time of day his sits go best: from 4+ rated path sits in the last 30 days (any stage), by local hour of
     s.at. A line only when one part of the day (2+ sits, 1+ mostly steady) beats another (2+ sits) by a third or more. */
  var PARTS = [['morning', 'in the morning'], ['afternoon', 'in the afternoon'], ['evening', 'in the evening'], ['late', 'late at night']];
  function partOfDay(h) { return h >= 5 && h < 12 ? 0 : h >= 12 && h < 18 ? 1 : h >= 18 && h < 22 ? 2 : 3; }
  function pathWhen(state, now) {
    var n = now || new Date(), to = iso(n), from = WLD.addDays(to, -30), g = PARTS.map(function () { return { n: 0, steady: 0 }; }), all = 0;
    (state.sessions || []).forEach(function (s) {
      if (!s || PATH.indexOf(s.id) < 0 || !(s.focus >= 1 && s.focus <= 3) || !s.date || s.date < from || s.date > to) return;
      var t = Date.parse(s.at); if (isNaN(t)) return;
      var x = g[partOfDay(new Date(t).getHours())]; x.n++; all++; if (s.focus === 3) x.steady++;
    });
    if (all < 4) return null;
    var ok = g.map(function (x, i) { return { i: i, n: x.n, steady: x.steady, share: x.n ? x.steady / x.n : 0 }; }).filter(function (x) { return x.n >= 2; });
    if (ok.length < 2) return null;
    var best = ok.slice().sort(function (a, b) { return b.share - a.share || b.n - a.n; })[0];
    var worst = ok.slice().sort(function (a, b) { return a.share - b.share || b.n - a.n; })[0];
    if (best.i === worst.i || best.steady < 1 || best.share - worst.share < 1 / 3 - 1e-9) return null;
    return { best: PARTS[best.i][0], worst: PARTS[worst.i][0], bestIn: PARTS[best.i][1],
      text: 'Your steadiest sits have been ' + PARTS[best.i][1] + ' (' + best.steady + ' of ' + best.n + ' mostly steady; ' + PARTS[worst.i][1] + ' ' + worst.steady + ' of ' + worst.n + ').' };
  }
  /* His last two path sits were late (22:00-05:00), mostly lost in thought, and sleepy: suggest an earlier sit (or
     the part of the day his sits go best). Text or null. */
  function pathLate(state, now) {
    var to = now ? iso(now) : null;
    var sits = (state.sessions || []).filter(function (s) { return s && PATH.indexOf(s.id) >= 0 && s.focus >= 1 && (!to || !s.date || s.date <= to) && !isNaN(Date.parse(s.at)); })
      .sort(function (a, b) { return sessionMs(a) - sessionMs(b); }).slice(-2);
    if (sits.length < 2 || !sits.every(function (s) {
      var h = new Date(Date.parse(s.at)).getHours();
      return (h >= 22 || h < 5) && s.focus === 1 && Array.isArray(s.hind) && s.hind.indexOf('Sleepy') >= 0;
    })) return null;
    var w = pathWhen(state, now);
    return 'Your last two late sits were sleepy and wandering. ' + (w && w.best !== 'late' ? 'Your steadiest sits have been ' + w.bestIn + ': try one then.' : 'If you can, try one earlier in the day, even 10 minutes.');
  }
  function pathStatus(state, now) {
    var to = now ? iso(now) : null, id = stageOf(state), i = PATH.indexOf(id);
    var all = state.sessions.filter(function (s) { return PATH.indexOf(s.id) >= 0 && (!to || !s.date || s.date <= to); })
      .sort(function (a, b) { return sessionMs(a) - sessionMs(b); });
    var sits = all.filter(function (s) { return s.id === id; });
    var rated = sits.filter(function (s) { return s.focus >= 1 && s.focus <= 3; }).slice(-5);
    var steady = rated.filter(function (s) { return s.focus === 3; }).length;
    var lastSit = all[all.length - 1] || null, hind = lastSit && Array.isArray(lastSit.hind) ? lastSit.hind : [];
    var tips = lastSit && lastSit.id === 'count' ? HIND_TIP_COUNT : {};
    var tip = null; hind.some(function (h) { return tips[h] || HIND_TIP[h] ? (tip = tips[h] || HIND_TIP[h]) : false; });
    var lost = rated.filter(function (s) { return s.focus === 1; }).length;
    return { stage: id, n: i + 1, of: PATH.length, sits: sits.length, mins: Math.round(sits.reduce(function (a, s) { return a + (s.mins || 0); }, 0)),
      rated: rated.length, steady: steady, lost: lost, ready: i < PATH.length - 1 && sits.length >= READY_SITS && steady >= 3,
      // a later stage that keeps slipping (3 of the last 5 rated "Mostly lost in thought"): offer the stage before, gently
      back: i > 0 && lost >= 3,
      next: i < PATH.length - 1 ? PATH[i + 1] : null, prev: i > 0 ? PATH[i - 1] : null, total: all.length, tip: tip, when: pathWhen(state, now), late: pathLate(state, now) };
  }
  /* Meditation-path sits in the 7 days up to now (same window as stats()). */
  function pathWeek(state, now) {
    now = now || new Date();
    var to = iso(now), from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    var l = state.sessions.filter(function (s) { return PATH.indexOf(s.id) >= 0 && s.date >= from && s.date <= to; });
    return { sits: l.length, mins: Math.round(l.reduce(function (a, s) { return a + (s.mins || 0); }, 0)) };
  }
  /* Move to another stage (the next when he's ready, or back a step whenever he likes). */
  function setStage(state, id) { if (PATH.indexOf(id) >= 0) state.settings.stage = id; return stageOf(state); }
  /* His answers after a sit: focus 1-3 (FOCUS) and what got in the way (HIND; "Nothing much" on its own). */
  function rateSit(rec, focus, hind) {
    if (!rec) return rec;
    if (focus >= 1 && focus <= 3) rec.focus = focus; else if (focus === null) delete rec.focus;
    if (Array.isArray(hind)) {
      var h = hind.filter(function (x, i, a) { return HIND.indexOf(x) >= 0 && a.indexOf(x) === i; });
      if (h.indexOf('Nothing much') >= 0 && h.length > 1) h = h[h.length - 1] === 'Nothing much' ? ['Nothing much'] : h.filter(function (x) { return x !== 'Nothing much'; });
      if (h.length) rec.hind = h; else delete rec.hind;
    }
    return rec;
  }
  /* His own words after a sit (the questions' text box): kept on the session, 600 characters; '' clears it. */
  function sitNote(rec, text) {
    if (!rec) return rec;
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 600);
    if (t) rec.note = t; else delete rec.note;
    return rec;
  }
  function suggest(state, now, opts) {
    now = now || new Date(); opts = opts || {};
    var to = iso(now), upTo = state.sessions.filter(function (s) { return !s.date || s.date <= to; });
    var h = now.getHours(), t = today(state, now), sc = opts.score || {}, pref = opts.prefer || [], long = opts.tooLong || {};
    // he meditates to train the mind: his stage's sit leads, once a day, from 05:00 (not after a night wake)
    if (state.settings && state.settings.aim === 'train' && h >= 5) {
      var stg = stageOf(state);
      if (!PATH.some(function (id) { return t.ids.indexOf(id) >= 0; })) return stg;
    }
    if (!upTo.length && h >= 5 && h < 22 && !pref.length && (sc.sigh || 0) > -2 && !opts.rough) return 'sigh';
    var base = fits(h);
    // his mind has been racing at night lately: the practices made for that join what fits (21:00-05:00)
    if (opts.racing && (h >= 21 || h < 5)) RACING.forEach(function (id) { if (base.indexOf(id) < 0) base = base.concat(id); });
    if (opts.rough && h >= 5 && h < 22) base = ['sigh', 'slow', 'ground'].concat(base.filter(function (id) { return ['sigh', 'slow', 'ground'].indexOf(id) < 0; }));
    var pool = base.filter(function (id) { return t.ids.indexOf(id) < 0; });
    if (!pool.length) pool = fits(9).filter(function (id) { return t.ids.indexOf(id) < 0; });
    if (!pool.length) return base[0];
    var ok = pool.filter(function (id) { return (sc[id] || 0) > -2; });
    if (ok.length) pool = ok;
    var last = {}, lastDay = {}; // last: newest timestamp ms (tie-break); lastDay: its local date (2-day rule)
    upTo.forEach(function (s) {
      var ms = sessionMs(s);
      if (last[s.id] == null || ms > last[s.id]) last[s.id] = ms;
      if (s.date && (!lastDay[s.id] || s.date > lastDay[s.id])) lastDay[s.id] = s.date;
    });
    var felt = feltScores(state, now);
    function rank(id) {
      var r = (sc[id] || 0) + (felt[id] || 0) + (pref.indexOf(id) >= 0 ? 3 : 0) - (long[id] ? 1 : 0);
      if (opts.rough && ['sigh', 'slow', 'ground'].indexOf(id) >= 0) r += 4;
      // his mind has been racing at night lately: the picture-word shuffle (made for a busy mind in bed) or grounding at
      // bedtime, back-to-sleep after midnight. His own answers still count: one that didn't help (score -2 or lower)
      // is left out above, so the next one of these takes its place.
      if (opts.racing && (h >= 21 || h < 5)) r += ({ shuffle: 6, ground: h >= 21 ? 5 : 0, night: h < 5 ? 7 : 0 })[id] || 0;
      // five or more "Not really" in a row: in the daytime, try moving instead of sitting still (the mindful walk)
      if ((opts.flat || 0) >= 5 && h >= 7 && h < 20 && id === 'walk') r += 4;
      return r;
    }
    // liked (or planned) ones lead, but not every day: a practice done in the last 2 days drops behind fresh ones
    var day2 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
    function key(id) { return rank(id) - ((lastDay[id] || '') >= day2 ? 2.5 : 0); }
    var best = pool[0];
    pool.forEach(function (id) {
      var a = key(id), b = key(best);
      var la = last[id] == null ? -Infinity : last[id], lb = last[best] == null ? -Infinity : last[best];
      if (a > b || (a === b && la < lb)) best = id;
    });
    return best;
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
      if (!x || ids.indexOf(x.id) < 0 || !WLD.isDate(x.date) || typeof x.mins !== 'number' || !isFinite(x.mins)) return;
      var rec = { id: x.id, date: x.date, at: String(x.at || ''), mins: Math.max(0, Math.min(240, x.mins)),
        before: [1, 2, 3, 4, 5].indexOf(x.before) >= 0 ? x.before : null, after: [1, 2, 3, 4, 5].indexOf(x.after) >= 0 ? x.after : null,
        rated: typeof x.rated === 'string' && !isNaN(Date.parse(x.rated)) ? x.rated : undefined };
      if (PATH.indexOf(x.id) >= 0) rateSit(rec, [1, 2, 3].indexOf(x.focus) >= 0 ? x.focus : undefined, Array.isArray(x.hind) ? x.hind : undefined);
      if (PATH.indexOf(x.id) >= 0 && typeof x.note === 'string') sitNote(rec, x.note);
      d.sessions.push(rec);
    });
    var st = s.settings || {};
    if (typeof st.voice === 'boolean') d.settings.voice = st.voice;
    if (typeof st.tick === 'boolean') d.settings.tick = st.tick;
    if (typeof st.dark === 'boolean') d.settings.dark = st.dark;
    if (typeof st.sitQuiet === 'boolean') d.settings.sitQuiet = st.sitQuiet;
    if (NOISE_KINDS.indexOf(st.noise) >= 0) d.settings.noise = st.noise;
    if (NOISE_VOLS.indexOf(st.noiseVol) >= 0) d.settings.noiseVol = st.noiseVol;
    if (INTERVALS.indexOf(st.interval) >= 0) d.settings.interval = st.interval;
    if (typeof st.rate === 'number' && st.rate >= 0.5 && st.rate <= 1.6) d.settings.rate = st.rate;
    if ([3, 5, 10, 15, 20].indexOf(st.minutes) >= 0) d.settings.minutes = st.minutes;
    if (DAILY_GOALS.indexOf(st.dailyGoal) >= 0) d.settings.dailyGoal = st.dailyGoal;
    if (st.aim === 'calm' || st.aim === 'train') d.settings.aim = st.aim;
    if (PATH.indexOf(st.stage) >= 0) d.settings.stage = st.stage;
    if (SIT_LENGTHS.indexOf(st.sitMinutes) >= 0) d.settings.sitMinutes = st.sitMinutes;
    return d;
  }

  /* Per practice average stress change (after - before, negative = calmer) across sessions with both ratings, best first. */
  function stressByPractice(state, now) {
    var to = now ? iso(now) : null, by = {};
    (state.sessions || []).forEach(function (s) {
      if (to && s.date && s.date > to) return;
      if (typeof s.before === 'number' && typeof s.after === 'number') {
        var o = by[s.id] = by[s.id] || { id: s.id, sum: 0, n: 0 };
        o.sum += s.after - s.before; o.n++;
      }
    });
    return Object.keys(by).map(function (id) {
      var o = by[id];
      return { id: id, avgChange: o.sum / o.n, n: o.n };
    }).sort(function (a, b) {
      return a.avgChange - b.avgChange || b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  var api = { pathLate: pathLate, quietScript: quietScript, pathWhen: pathWhen, INTERVALS: INTERVALS, NOISE_KINDS: NOISE_KINDS, NOISE_VOLS: NOISE_VOLS, intervalBell: intervalBell, PATH: PATH, FOCUS: FOCUS, HIND: HIND, SIT_LENGTHS: SIT_LENGTHS, READY_SITS: READY_SITS, stageOf: stageOf, pathStatus: pathStatus, pathWeek: pathWeek, setStage: setStage, rateSit: rateSit, sitNote: sitNote, PACERS: PACERS, PRACTICES: PRACTICES, VARIANTS: VARIANTS, DAILY_GOALS: DAILY_GOALS, goalOf: goalOf, scriptFor: scriptFor, variantCount: variantCount, timesDone: timesDone, today: today, fits: fits, defaults: defaults, pacerAt: pacerAt, tickFor: tickFor, record: record, stats: stats, stressByPractice: stressByPractice, suggest: suggest, feltScores: feltScores, advice: advice, validate: validate, iso: iso };
  root.CalmCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
