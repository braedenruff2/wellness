# Cloud plan (for autopilot runs)
status: active
mode: cloud-first
repo: braedenruff2/wellness
branch: main (since 21 Nov 2026 cloud runs commit to main after the FULL test suite passes; the PC is optional)

## Test in a Linux container
Needs Node 20+, Java 17+ (javac), Python 3.11+, and Playwright with Chromium: npm install -g playwright && npx playwright install --with-deps chromium.
ANDROID_JAR=<dir>/android-35/android.jar for the Java suite (same download as the APK build below; it fails without it).
npm install -g as needed, then: NODE_PATH=$(npm root -g) node tests/run-all.cjs (every suite must pass before a push).
Browser tests block the internet (tests/lib/web.cjs).

## Build the APK in the container (only when app/www, android/ or modules/ changed since the last build)
- Android tools: build-tools_r35.0.1_linux.zip and platform-35_r02.zip from https://dl.google.com/android/repository/
  (unzip: BT=<dir>/android-15, ANDROID_JAR=<dir>/android-35/android.jar); PARTS=<dir> bash tools/get-voice-parts.sh.
- Signing key: faith.keystore in the owner's private Google Drive folder "Wellness (private)" (Drive connector,
  download_file_content, base64). Save it OUTSIDE the repo (e.g. the scratchpad) and pass FC_KEYSTORE=<path>.
  Never commit it, never copy it anywhere else. If it isn't in Drive yet, don't build (build-apk.sh refuses without it).
- Then: BT=... ANDROID_JAR=... PARTS=... FC_KEYSTORE=... bash tools/build-apk.sh; commit dist/Wellness.apk,
  dist/version.json, dist/version.txt with the change. The phone updates itself from main/dist/.

## Private inputs (Google Drive folder "Wellness (private)", never copied into this repo)
- The phone's data (backup JSON, later the sync file with queued requests) and the owner's notes for the autopilot.
  Read them to decide what to build; write nothing personal here.

## Rules
- Public repo: technical content only. No personal data, keys or keystores. Never a child's name or birthday in content:
  write {child} (see README "Personal words").
- Faith content: public-domain Scripture only (WEB), never speak as God, no invented quotes.
- Health/fitness: general guidance only, nothing medical. Calm: not therapy.
- Tagalog: natural, correct everyday Tagalog only; never invent words.
- No paid services, API keys, accounts or required network for core use.

## Tasks (cloud-first move, 21 Nov; do these first, in order)
Two agents work here: read .autopilot/agents.md first (who can do what, claims, push rules). Tasks are [any] (claim first); [drive] ones need the private Drive folder.
Note for B/C: C sends milestones in coach-* input; B moves prompts to pc/prompts/ — whoever lands second rebases onto the first.
A. [any] Drive sync on the phone. Settings > "Sync with Google Drive": once, Android's file picker (SAF ACTION_CREATE_DOCUMENT,
   application/json, name wellness-sync.json; takePersistableUriPermission) so he can pick his Drive folder. Then the
   app writes the same JSON as "Save a backup" plus `requests` (queue, see B) to that file when the app opens and
   when it goes to the background (at most every 30 min) and on "Sync now". Before writing it reads the file and takes
   `answers` (written by cloud runs, keyed by request id) and keeps them until shown; it writes `acked: [ids]`.
   Java: a small Sync class + JS bridge (like the backup one), fake bridge in browser tests, Java unit test like the
   others in tests/java.cjs. Show "last synced" and any error plainly. If Drive's provider refuses writes, say so.
B. [any] Request queue for the Claude features when the PC link fails (coach-scenario, coach-grade, coach-advice,
   tagalog-check, advice, weekly-plan): queue {id, task, input, at} (input = exactly what the PC task gets), show
   "Your PC isn't answering, so this will be answered by the next cloud run (within about 5 hours)", and render the
   answer through the same code as a PC result when it arrives. Move each task's prompt text out of
   pc/wellness_pc.py into pc/prompts/<task>.md (PC reads them from there; tests) so cloud runs answer with the same
   prompt and the same JSON shape. [drive] part: the agent with Drive access answers queued requests, then writes `answers` into the Drive file
   (keep the phone's other content; update_file).
C. (done 21 Nov 00:40, Claude: coach-core CAN/canText, input.can, pc can_do()) Parenting setup: "What she can do now" (chips: walks, gets down by herself, climbs, waves/bless, first words,
   points; plus free text), saved on the phone, sent in coach-scenario / coach-grade / coach-advice input; the prompt
   must keep scenarios within what she can and can't do yet. Tests.
D. (done 21 Nov 00:40, Claude: first_day()) Advice summary: count active days from the first day there is any data, not a fixed 14-day window
   ("active 2 of 2 days", not "2 of 14"); pc/wellness_pc.py summarize + its test.
E. (done 21 Nov 00:40, Claude: key mindracing) me-core guidance: a calm wind-down rated "Mind racing" -> next evening suggest writing it down first (journal)
   before the wind-down; stable key + unit test.
F. (done 21 Nov 00:40, Claude: planFailed; queue part waits for B) Weekly plan: if a weekly-plan request fails, keep a visible "Couldn't make your plan - Try again" instead of nothing
   (planTried set, plan null); e2e with the fake PC failing; then it goes through the queue (B).
G. Done 21 Nov: tools/publish.bat fetches and merges origin/main (GitHub wins on a clash) before pushing, because the
   cloud now pushes to main. The PC picks it up when it next takes main.
H. Done 21 Nov: bundled lesson weeks re-download when corrected (TL_PACK_HASH); build-apk.sh refuses to make a new
   signing key unless FC_NEW_KEY=1 (FC_KEYSTORE sets the key path).

## Earlier tasks (keep going down this list after A-F)
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
27. (done 20 Nov 20:45, cloud) To-do quick add: real weekday names only ("call friend"), "every <day>", "every other <day>", "in N days",
    "next week", "this weekend", month names, "tonight at 7" = pm. Tagalog typed answers: accents and hyphens forgiven.
28. (done 21 Nov 00:50, Claude: month2/month3/yearly, MONTH_STEP) To-do: "every 2 months" / "every 3 months" / "every year" repeats (month-end and Feb 29 rules like monthly); tests.
29. (done 21 Nov 00:50, Claude: exercise field poOptional, T.missedPo note) Tagalog: typed answers: accept a missing "po"/"ho" only where the lesson marks it optional (pack field), never by default; tests.
