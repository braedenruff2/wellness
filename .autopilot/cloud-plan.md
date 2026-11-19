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

## Tasks (pick in order; update this list on the PC)
1. Bug hunting: read modules and shell code, add tests for untested paths, fix what they find.
2. Calm: more short practices (content + tests).
3. Workout: weekly volume summary + plain advice on the Move screen (tests).
4. To-do: (snooze done 19 Nov: notification "Snooze 1 hour" + sheet "In 1 hour") a "Done" button on the notification
   (needs the page to pick up ticks made in Android: design it, with tests).
5. Code health: dead code, duplicated helpers, slow tests (calm e2e was cut from 104 s to 11 s with clock.fastForward).
