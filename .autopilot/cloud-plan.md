# Cloud plan (for overnight autopilot runs)
status: active
repo: braedenruff2/wellness
branch: autopilot-cloud (never push to main)

## Test in a Linux container
npm install -g as needed, then: NODE_PATH=$(npm root -g) node tests/run-all.cjs
Browser tests block the internet (tests/lib/web.cjs). Java/browser suites run in the cloud; some PC-only checks run later on the PC.
Can't do here: APK build/signing (key not in repo), anything using data outside the repo. Leave those for the next PC run.

## Rules
- Public repo: technical content only. No personal data, keys or keystores. Never a child's name or birthday in content:
  write {child} (see README "Personal words").
- Faith content: public-domain Scripture only (WEB), never speak as God, no invented quotes.
- Health/fitness: general guidance only, nothing medical. Calm: not therapy.
- Tagalog: natural, correct everyday Tagalog only; never invent words.
- No paid services, API keys, accounts or required network for core use.

## Tasks (pick in order; update this list on the PC; keep going until usage runs out)
Done 20 Nov early (PC run): "Not for me?" on Faith day / Tagalog lesson / Home advice / exercise cues; 6 more guidance
rules; Home "today" list (module today()); reviews of every module + Android side (29 bugs fixed with tests).
1. (done 20 Nov 07:10: dayScript DAY_LINES x3) Faith: wording variants for guided-prayer steps that repeat daily (like Calm's VARIANTS; Scripture text exact, WEB
   only, never speak as God); unit test that every variant keeps the same timing.
2. (done 20 Nov 08:00: pickup, sink, contact) Calm short practices (2-4 min) for a parent: "Breathing with the baby asleep on you", "Before you pick her
   up (30-second reset)", "Kitchen-sink mindfulness" (content + VARIANTS + tests). Not therapy, no medical claims.
3. (done 20 Nov 06:55: "light on legs this week" Fri-Sun) Workout: a plain note on Home's Move line late in the week when an area (legs / push / pull / core) is behind
   (volumeAdvice exists); unit tests across Mon/Sun and DST.
4. (done 20 Nov 06:50) To-do: today() names the first task ("To do: call Mom + 2 more"); tests.
5. (20 Nov 07:00: corrected packs now re-download via index.json hashes) Tagalog: edge-case tests (no packs at all, a pack replaced by a newer version with the same id, very long typed
   answers, a lesson with no dialogue/grammar); fix what they find.
6. (done 20 Nov 06:55: tests/e2e-a11y.cjs, all pass; night mode .meta contrast 3.4:1 on purpose, dim at 3am) Accessibility: run tests/lib/web.cjs noOverflow at text size "Larger" (1.3) on every screen; tap targets >= 44 px
   on Home's today list, chips and quick-question buttons; night-mode contrast of .meta text (>= 4.5:1).
7. (done 20 Nov 06:50) PC server: east-of-UTC de-dup (save_events checks only day+1 for old-style files; also check
   day-1) + tests in pc/test/test_pc.py.
8. (done 20 Nov cloud: lib/dates.js shared iso/addDays; no dead functions found) Code health: dead code and duplicated date helpers (iso/addDays in several cores); keep behaviour identical (tests).
9. (20 Nov 07:40: brokennights added) More guidance rules in me-core guidance() from combinations (e.g. short sleep + workout planned -> lighter workout),
   each with a stable key and unit test.
10. (done 20 Nov 07:15) Home: after 8 pm, unfinished today-list items get a gentle line ("Tomorrow is fine.") instead of looking undone;
    test with the fake clock.
11. (done 20 Nov 07:25: Sunday from noon, module week()) Home: on Sunday evening, a short "Your week" card across parts (faith days, calm sessions, workouts, Tagalog
    lessons, to-dos done), no streaks or scores; tests.
12. (done 20 Nov 07:20) #me page: a simple 14-day trend of sleep and mood from check-ins (text or inline SVG bars, dark-mode safe); tests.
13. (done 20 Nov cloud: core PRACTICE_LINES, practiceScript) Faith practices (#faith/pray): wording variants like dayScript's DAY_LINES for the guiding lines (Scripture exact).
14. (done 20 Nov 07:40) Workout: add "Not for me?" to that balance line; tests.
15. (done 20 Nov 07:35: offline note) Parenting (coach): when the PC link isn't reachable, keep the screen useful: last tips and past advice with a plain
    "your PC isn't answering; these still work" note, retry button; tests (link e2e fake PC can fail).
16. (done 20 Nov 07:30) Backup nudge: if no backup file was saved in 14 days (shell tracks the last save), one gentle line in Settings and
    once a week on Home; tests with the fake clock.
17. (done 20 Nov cloud: settings.tick, WL.tick) Calm: "Box breathing" and "Slow breathing" pacers: optional soft tick sound on each phase change (setting, off by
    default); tests that the setting persists and restores.

18. (done 20 Nov 07:50) Faith journal: search box (find a word across entries, journal/awe/gratitude); tests.
19. (done 20 Nov 07:45) To-do: "every 2 weeks" and "every month" repeats (month ends: the 31st -> last day of shorter months; Feb 29); tests.
20. (exists already: C.lookBack shows a week/month/3 months ago entry) Faith: "Awe moments" look-back: on the 1st of each month, show one awe moment from a month ago on the Faith today
    screen (if any); tests with the fake clock.
21. (done 20 Nov 07:55: #tagalog/words) Tagalog: a "Words I know" list (cards in box >= 3) with hear buttons, and "Hard words" (most wrong); tests.
22. (done 20 Nov 08:05) Workout: from 26 Dec, the Move screen asks once "Got the adjustable dumbbells?" (one tap switches equipment to
    adjustable and explains weight progression; "Not yet" hides it for a week); tests with the fake clock.
23. (done 20 Nov 08:10) Tagalog: "Listen while walking" on a lesson: plays every word (Tagalog, then English) and the conversation with
    pauses, hands-free, stops on leaving; tests (fake speech).
24. (done 20 Nov 08:00) Faith: the guided prayer's "others" step names one or two open Prayer list items ("You're praying for: ...");
    tests (text escaped, nothing when the list is empty).
25. (done 20 Nov cloud: .c-bars, skillStats().scores) Parenting progress: per skill, a small score-over-time row (like #me's 14-day bars); tests.
26. (done 20 Nov cloud: practicesThisWeek) Faith Pray list: practices done this week get a tick and a count ("2× this week"); tests.
