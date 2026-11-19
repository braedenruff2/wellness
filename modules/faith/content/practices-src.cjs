/* "Pray now": practices he can pick any time. Original guidance; Scripture via {{REF}} tokens,
   filled in from the World English Bible by tools/build-content.cjs (the reference is shown too).
   wait = seconds of quiet after a line (stretched to the chosen length unless fixed: true).
   {{TODAY}} = today's key verse from the path. */
module.exports = [
  {
    id: 'pause', title: 'A one-minute pause', minutes: 1, fixed: true, when: 'For a hard moment',
    blurb: 'When the crying won’t stop or you’re at the end of yourself. One minute, eyes open, baby in arms is fine.',
    steps: [
      { say: 'Stop where you are. You don’t have to fix anything for the next minute.', wait: 3 },
      { say: 'Breathe in slowly, and let it out longer than you breathed in.', wait: 6 },
      { say: 'Again. In, and a long breath out.', wait: 6 },
      { say: 'Jesus said: {{MAT 11:28}}', wait: 8 },
      { say: 'Pray, if you can: Lord, I’m struggling. Be with me in this. Give me patience for the next few minutes.', wait: 10 },
      { say: 'One more slow breath. You are not alone in this room.', wait: 6 },
      { say: 'Go gently. You can come back here as often as you need.', wait: 0 }
    ]
  },
  {
    id: 'breath', title: 'Breath prayer', minutes: 5, when: 'Anytime, even while rocking or walking',
    blurb: 'An old, simple way to pray: a short line on the breath in, another on the breath out. This one is the Jesus Prayer, prayed by Christians for over a thousand years.',
    steps: [
      { say: 'Settle your body. Let your breathing slow down by itself.', wait: 5 },
      { say: 'As you breathe in, pray silently: Lord Jesus Christ. As you breathe out: have mercy on me.', wait: 4 },
      { say: 'Breathe in: Lord Jesus Christ. Breathe out: have mercy on me.', wait: 20 },
      { say: 'If your mind wanders, that’s normal. Just come back to the words. Lord Jesus Christ… have mercy on me.', wait: 25 },
      { say: 'Keep going, in your own rhythm.', wait: 30 },
      { say: 'If you like, change the words for today. Breathe in: Help my… Breathe out: unbelief. Or: Be still… and know.', wait: 30 },
      { say: 'Let the words fade, and just rest for a moment with God.', wait: 15 },
      { say: 'Amen.', wait: 0 }
    ]
  },
  {
    id: 'examen', title: 'Evening look-back (Examen)', minutes: 5, when: 'At the end of the day',
    blurb: 'A short review of your day with God, from Saint Ignatius: notice the good, notice where you fell short, and look ahead. No grading yourself.',
    steps: [
      { say: 'Become aware that God is here with you now, at the end of this day.', wait: 8 },
      { say: 'Ask for light: God, help me see my day the way you see it.', wait: 6 },
      { say: 'Go back through the day, from when you woke. What are you thankful for? Small things count: a smile, a nap, a warm drink.', wait: 30 },
      { say: 'Where did you feel close to God, or at peace? Where did you feel far away, anxious or impatient? Just notice; don’t judge.', wait: 30 },
      { say: 'Was there a moment you wish you had handled differently? Tell God about it, and ask for forgiveness where you need it.', wait: 25 },
      { say: '{{LAM 3:22-23}}', wait: 8 },
      { say: 'Now look at tomorrow. What will be hard? Ask God for the help you will need.', wait: 20 },
      { say: 'Thank you, God, for this day. Amen.', wait: 0 }
    ]
  },
  {
    id: 'lectio', title: 'Praying a verse slowly (Lectio Divina)', minutes: 5, when: 'With today’s verse',
    blurb: 'Read one verse slowly several times, and let it become a prayer. Uses today’s verse from the path.',
    steps: [
      { say: 'Get comfortable. Ask God to speak to you through these words.', wait: 6 },
      { say: 'Listen to the verse. {{TODAY}}', wait: 12 },
      { say: 'Again, slowly. Notice which word or phrase catches you. {{TODAY}}', wait: 25 },
      { say: 'Repeat that word or phrase to yourself. Why might it stand out today? What is going on in your life that it touches?', wait: 30 },
      { say: 'One more time. {{TODAY}}', wait: 10 },
      { say: 'Now answer God in your own words: thanks, a question, a request, whatever comes.', wait: 30 },
      { say: 'Finally, just rest. No more words. Be with God, the way you sit with someone you love.', wait: 30 },
      { say: 'Amen.', wait: 0 }
    ]
  },
  {
    id: 'still', title: 'Be still (quiet prayer)', minutes: 5, when: 'When you have a few quiet minutes',
    blurb: 'Silent prayer: not thinking about God, but being with him. Choose one word to come back to when your mind wanders, like “Jesus”, “peace”, or “Father”.',
    steps: [
      { say: '{{PSA 46:10}}', wait: 6 },
      { say: 'Choose your word. Say it once, gently, as a way of saying yes to God being here.', wait: 10 },
      { say: 'Now be silent. When you notice you are thinking about something, gently return to your word. Every return is a small act of love.', wait: 60 },
      { say: 'Your word, gently.', wait: 60 },
      { say: 'Stay a little longer.', wait: 50 },
      { say: 'Slowly come back. Thank God for this time, even if it felt like nothing happened. Much happens quietly.', wait: 5 },
      { say: 'Amen.', wait: 0 }
    ]
  },
  {
    id: 'gratitude', title: 'Three thanks', minutes: 3, when: 'Morning or evening',
    blurb: 'Gratitude trains the eyes to notice God’s gifts. Name three things, small and specific.',
    steps: [
      { say: '{{PSA 118:24}}', wait: 5 },
      { say: 'Think of one thing from the last day you’re thankful for. Be specific: not “my family”, but the way she held your finger this morning.', wait: 20 },
      { say: 'Thank God for it, in a sentence.', wait: 8 },
      { say: 'A second thing. Maybe something you usually take for granted: warmth, food, a working body.', wait: 20 },
      { say: 'A third thing. Maybe a person. Thank God for them by name.', wait: 20 },
      { say: '{{1TH 5:18}} Amen.', wait: 0 }
    ]
  },
  {
    id: 'awe', title: 'Awe walk', minutes: 10, when: 'Outside, with the stroller',
    blurb: 'Walk slowly and look for things that are bigger, older or more beautiful than you. Phone in your pocket; the voice will guide you now and then.',
    steps: [
      { say: 'Start walking at an easy pace. Today you are not going anywhere; you are looking.', wait: 20 },
      { say: '{{PSA 19:1}}', wait: 10 },
      { say: 'Look up. Notice the sky: its colour, the clouds, how far it goes.', wait: 60 },
      { say: 'Now look close: a leaf, frost, a stone, a bird. Look at one thing as if for the first time.', wait: 60 },
      { say: 'Listen. What can you hear: wind, the sea, birds, the stroller wheels? Let each sound be a small gift.', wait: 60 },
      { say: '{{PSA 104:24}}', wait: 10 },
      { say: 'If you find something that makes you stop, stop. Say quietly: you made this.', wait: 90 },
      { say: 'Look at your daughter. She is part of creation too. Give thanks for her.', wait: 45 },
      { say: 'Head home whenever you’re ready. If something struck you, add it to your awe moments.', wait: 0 }
    ]
  },
  {
    id: 'blessing', title: 'Blessing for your child', minutes: 2, fixed: true, when: 'At bedtime, or anytime',
    blurb: 'Christian parents have blessed their children with these words for thousands of years. Put your hand gently on her head or chest, if she’s near.',
    steps: [
      { say: 'If you can, rest your hand gently on your daughter. Say these words aloud or in your heart.', wait: 4 },
      { say: '{{NUM 6:24-26}}', wait: 6 },
      { say: 'Now bless her in your own words. What do you hope for her: love, courage, kindness, faith?', wait: 25 },
      { say: 'Lord Jesus, you took the children in your arms and blessed them. Hold her in your arms tonight and always. Amen.', wait: 0 }
    ]
  },
  {
    id: 'lords', title: 'The Lord’s Prayer, slowly', minutes: 3, fixed: true, when: 'Anytime',
    blurb: 'The prayer Jesus taught his friends, one line at a time with space to mean it.',
    steps: [
      { say: 'Jesus taught his friends to pray like this. Let each line sink in.', wait: 4 },
      { say: 'Our Father in heaven, may your name be kept holy.', wait: 12 },
      { say: 'Let your Kingdom come. Let your will be done on earth as it is in heaven.', wait: 12 },
      { say: 'Give us today our daily bread.', wait: 12 },
      { say: 'Forgive us our debts, as we also forgive our debtors.', wait: 15 },
      { say: 'Bring us not into temptation, but deliver us from the evil one.', wait: 10 },
      { say: 'For yours is the Kingdom, the power, and the glory forever. Amen.', wait: 0 }
    ]
  },
  {
    id: 'together', title: 'Praying together', minutes: 5, fixed: true, when: 'With your wife, when you’re both free',
    blurb: 'A simple, unhurried way for two people to pray together, even if it feels awkward at first. No one has to say much; it’s fine to pray silently.',
    steps: [
      { say: 'Sit together. If it feels right, hold hands. There’s no right way to do this.', wait: 5 },
      { say: '{{MAT 18:20}}', wait: 6 },
      { say: 'Each of you, say one thing you’re thankful for today. Out loud, or silently if you prefer.', wait: 40 },
      { say: 'Each of you, name one worry or hope. Just listen to each other; no need to fix anything.', wait: 50 },
      { say: 'Now pray for each other, in a sentence or in silence. Ask God to bless the other person.', wait: 50 },
      { say: 'Pray together for your daughter.', wait: 30 },
      { say: 'If you like, finish by saying the Lord’s Prayer together. Amen.', wait: 0 }
    ]
  },
  {
    id: 'night', title: 'Night feed prayer', minutes: 3, when: 'In the dark, at 3am',
    blurb: 'Very quiet and short, for when you’re up in the night. Turn your volume low.',
    steps: [
      { say: 'It’s the middle of the night, and you are awake with your daughter. God is awake too.', wait: 6 },
      { say: '{{PSA 4:8}}', wait: 10 },
      { say: 'Feel her weight, her warmth, her breathing. Give thanks for her, quietly.', wait: 25 },
      { say: 'Breathe in: You are here. Breathe out: I am yours.', wait: 30 },
      { say: '{{PSA 131:2}}', wait: 15 },
      { say: 'Lord, give us both rest when this feed is done. Watch over my family tonight. Amen.', wait: 0 }
    ]
  }
];
