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
0. "About you" (modules/me): done 20 Nov 04:50 UTC for Faith day/Tagalog lesson/review. Next: "Not for me?" on Home
   advice lines from the PC (shell advice card) and on workout exercise cues; a quick question after Faith practices
   that end without the guided player (journal-only days); keep everything optional and one tap.
1. Bug hunting: read modules and shell code, add tests for untested paths, fix what they find. (20 Nov 05:20: faith, tagalog, shell restore reviewed + fixed. 19 Nov evening: coach,
   workout undo/log-day, to-do reminders, activity ids and PC day filing reviewed; next: link, me, calm, todo.)
2. Calm (reworked 20 Nov: one practice a day, "done for today", rotation, wording variants): review it for edge cases
   (log-for-earlier-day, midnight, restore) and add tests; more short practices (content + tests + VARIANTS).
3. Faith: the same "today" clarity check: does every screen say plainly what to do today and when it's done?
   Wording variants for guided prayer steps where the script repeats daily (keep Scripture text exact, WEB only).
4. Workout: volumeAdvice is shown on the Move screen; next: a plain note on Home when an area is behind late in the week.
5. Home: one clear "today" list across parts (what's done, what's left), consistent with each part's own card.
6. Tagalog: review/practice UX polish; tests for edge cases (no packs, pack replaced, very long answers).
7. To-do: edge cases (repeats across DST change 2027-03-14, month ends, Feb 29) with tests.
8. Accessibility pass: font scaling, contrast in night mode, tap target sizes (tests/lib/web.cjs noOverflow at 200%).
9. Code health: dead code, duplicated helpers, slow tests.
