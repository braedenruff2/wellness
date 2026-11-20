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
2. Calm (done 20 Nov 06:45: pickup, sink): 1 more short practice (2-4 min) for a parent: "Breathing with the baby asleep on you", "Before you pick her
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
8. Code health: dead code and duplicated date helpers (iso/addDays in several cores); keep behaviour identical (tests).
9. More guidance rules in me-core guidance() from combinations (e.g. short sleep + workout planned -> lighter workout),
   each with a stable key and unit test.
10. (done 20 Nov 07:15) Home: after 8 pm, unfinished today-list items get a gentle line ("Tomorrow is fine.") instead of looking undone;
    test with the fake clock.
11. (done 20 Nov 07:25: Sunday from noon, module week()) Home: on Sunday evening, a short "Your week" card across parts (faith days, calm sessions, workouts, Tagalog
    lessons, to-dos done), no streaks or scores; tests.
12. (done 20 Nov 07:20) #me page: a simple 14-day trend of sleep and mood from check-ins (text or inline SVG bars, dark-mode safe); tests.
13. Faith practices (#faith/pray): wording variants like dayScript's DAY_LINES for the guiding lines (Scripture exact).
14. (Move screen already shows volumeAdvice) Workout: add "Not for me?" to that balance line; tests.
15. Parenting (coach): when the PC link isn't reachable, keep the screen useful: last tips and past advice with a plain
    "your PC isn't answering; these still work" note, retry button; tests (link e2e fake PC can fail).
16. Backup nudge: if no backup file was saved in 14 days (shell tracks the last save), one gentle line in Settings and
    once a week on Home; tests with the fake clock.
17. Calm: "Box breathing" and "Slow breathing" pacers: optional soft tick sound on each phase change (setting, off by
    default); tests that the setting persists and restores.

