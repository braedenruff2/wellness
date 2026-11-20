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
1. Faith: wording variants for guided-prayer steps that repeat daily (like Calm's VARIANTS; Scripture text exact, WEB
   only, never speak as God); unit test that every variant keeps the same timing.
2. Calm: 2-3 more short practices (2-4 min) for a parent: "Breathing with the baby asleep on you", "Before you pick her
   up (30-second reset)", "Kitchen-sink mindfulness" (content + VARIANTS + tests). Not therapy, no medical claims.
3. Workout: a plain note on Home's Move line late in the week when an area (legs / push / pull / core) is behind
   (volumeAdvice exists); unit tests across Mon/Sun and DST.
4. To-do: today() could name the first task ("To do: call Mom + 2 more"); tests.
5. Tagalog: edge-case tests (no packs at all, a pack replaced by a newer version with the same id, very long typed
   answers, a lesson with no dialogue/grammar); fix what they find.
6. Accessibility: run tests/lib/web.cjs noOverflow at text size "Larger" (1.3) on every screen; tap targets >= 44 px
   on Home's today list, chips and quick-question buttons; night-mode contrast of .meta text (>= 4.5:1).
7. PC server (pc/wellness_pc.py): east-of-UTC de-dup (save_events checks only day+1 for old-style files; also check
   day-1) + tests in pc/test/test_pc.py.
8. Code health: dead code and duplicated date helpers (iso/addDays in several cores); keep behaviour identical (tests).
9. More guidance rules in me-core guidance() from combinations (e.g. short sleep + workout planned -> lighter workout),
   each with a stable key and unit test.
