# Faith Companion (working title)

A phone app to help Braeden grow in Christian faith, prayer and meditation during his 4 months of
parental leave (Nov 2026 - Mar 2027), built and improved by Claude autopilot.

## Why (his words, 18 Nov 2026)
"I want to develop my spirituality and meditation. I want an app that can help me. I am off for the next
4 months. I want to continuously develop myself. I am just a beginner in faith (christianity). I rarely
feel in my heart that I truly believe in him and feel the awe. I want to. I feel like I will be a better
person if I did. I am also looking after my baby alone."

## Install on your Pixel
1. Get `dist\FaithCompanion.apk` onto the phone (e.g. upload it to Google Drive and open it there, or USB).
2. Tap it. Android asks to allow installing from that app (Drive / Files): allow it, then Install.
3. Later versions install the same way, over the top; your journal and progress stay.
To try it on the PC instead: open `app\www\index.html` in Chrome (what you write there stays in that browser only).

## What's in it (version 0.1, 18 Nov 2026)
- **Today**: the next day of a guided path (not tied to the calendar: missed days just wait, no streaks).
  Each day: a short Bible passage (World English Bible, public domain) with a Listen button, a few lines to think
  about, a guided prayer, one practice for the day, and an optional journal line. Every 7th day is a look-back day
  that show what you wrote that week. "A month ago you wrote..." appears when there's an old entry.
- **The path**: all 120 days. Week 1 "Come as you are" (Mark 9 "help my unbelief", Psalm 8, Mark 1-4, Psalm 23),
  week 2 "Who is this?" (Mark 5-12, Psalm 139), week 3 "The way of the cross" (Mark 10-16, Emmaus, Psalm 16), week 4 "Come and see" (John 1-9, Psalm 27), week 5 "Abide" (John 10-21, Psalm 103), week 6 "Psalms for real life" (Psalms 13, 42, 51, 62, 121, 131, 46), week 7 "Blessed" (Sermon on the Mount, Matthew 5-6, Psalm 1), week 8 "Do not worry" (Matthew 6-7, the two sons in Luke 15, Psalm 32), week 9 "Learning to pray" (Luke 11 and 18, Philippians 4, Romans 8, Elijah, Psalm 63), week 10 "Trust" (Abram, the burning bush, Isaiah 40 and 43, Proverbs 3, Peter on the water, Psalm 37), week 11 "When it's hard" (Job 38, 2 Corinthians 4 and 12, Romans 5, Lamentations 3, Hebrews 12, Psalm 34), week 12 "Love" (1 Corinthians 13, 1 John 4, the good Samaritan, Colossians 3, Ephesians 4, Ruth, Psalm 133), week 13 "A new heart" (Ezekiel 36, Romans 12, Galatians 5, Philippians 2, Matthew 18, Psalm 139, James 1), week 14 "Grace" (Ephesians 2, Romans 8, Luke 7 and 19, John 3, Titus 3, Psalm 145), week 15 "The Spirit and the church" (Acts 1-3, 8, 9, Psalm 84), week 16 "Together" (1 Corinthians 12, Hebrews 10, Acts 16, Deuteronomy 6, Ephesians 5, Psalms 127-128), week 17 "Hope" (Romans 8, 1 Corinthians 15, John 11, Revelation 21, Philippians 3, the priestly blessing, Psalm 23 again on day 120). After day 120: "Walk the path again" starts at day 1; your journal stays and each day shows what you wrote last time (plan and notes in content/PLAN.md).
- **Guided prayer**: read aloud by the phone's own voice (or silent text), with quiet gaps, 2 / 5 / 10 minutes,
  big Pause button, back/skip, soft bell. Screen stays on while it runs. If you stop part way, Today offers
  "Carry on" from the same step (for 12 hours).
- **Pray now**: one-minute pause (for hard moments), breath prayer (Jesus Prayer), evening Examen, Lectio Divina
  with today's verse, quiet "be still" prayer, three thanks, awe walk (stroller), blessing for your child,
  the Lord's Prayer slowly, praying together (with your wife), night-feed prayer.
- **Journal**: free notes, awe moments, thanks, and a prayer list (mark answered or "let go", with a note).
  If something you write sounds really heavy, the app gently suggests talking to someone; it never diagnoses.
- **Night mode**: Auto switches to a very dim warm theme 9pm-6am (or pick Light / Dark / Night). Text size.
- **Reminder** (phone only): one quiet notification a day at a time you choose; off unless you turn it on.
- **Backup**: Settings > Save a backup puts a file in Downloads; Restore reads it back.
- Private: no account, no internet needed, nothing leaves the phone.

## For Claude (how it's built)
- `app/www/`: the whole app (index.html, style.css, core.js = logic without DOM, app.js = screens, content.js = generated).
- `content/days-src.cjs` (the path) and `content/practices-src.cjs` (Pray now) are the writing; Scripture is pulled
  word for word from `source/engwebp_vpl.txt` (eBible.org, WEB with "LORD", public domain) by
  `node tools/build-content.cjs` into app/www/content.js. Psalm titles come from `source/psalm-titles.json`.
- `android/`: WebView shell (MainActivity: TTS bridge, keep-awake, backup to Downloads, file picker, back button;
  Reminder: daily notification). `tools/build-apk.sh` builds dist/FaithCompanion.apk without Gradle; signed with
  `android/faith.keystore` (keep it: a different key means updates won't install over the old app).
- Tests: `node tests/run-all.cjs` (unit, content checks, Playwright browser flows, Java compile + ReminderTest).
  The browser suite needs Playwright (cloud); the Java one needs javac + android.jar; each skips if missing.
- Not tested on a real phone yet (no emulator available to the autopilot); see the questions in the autopilot's focus.md.
