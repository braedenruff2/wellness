# Gemini log (see agents.md)

## 2026-11-21 00:27 AST (initial setup & test run)
- Cross-reviewed Claude's recent commits (`c2b96ea`, `32aa96d`, `6272676`, `b5086d9`): two-agent rules, `Updater.java` GitHub fallback, and `tests/java.cjs` skip guard look solid.
- Fixed: `pc/test/test_pc.py` now works on Windows too (uses `AST4ADT` when `time.tzset` is absent instead of IANA `America/Halifax` which Windows CRT parsed as UTC, and wraps the fake `claude` script in a `.cmd` file on Windows so `subprocess.run` executes it cleanly).
- Tested: full `node tests/run-all.cjs` (all 43 suites passed, 0 skipped, including Playwright e2e, Java + `PcLinkTest`, and `pc/test/test_pc.py`).
- Next: start on `[any]` tasks in `.autopilot/cloud-plan.md` in order (Task A: Drive sync on the phone).

## 2026-11-21 01:12 AST (Task A: Google Drive sync, cross-review privacy fix, earlier-day date bounds)
- Cross-reviewed Claude's commits (`8c8571f`..`f7c859a`: tasks C, D, E, F, 28, 29): logic and tests look solid, and running `tests/privacy.cjs` locally caught a test date in `modules/coach/tests/unit.cjs` that matched a private-words entry; replaced it with a dummy date and pushed (`8c4e17f`).
- Done A (Google Drive sync on the phone, `b33c231`):
  - Android: added `Sync.java` (SAF `ACTION_CREATE_DOCUMENT` for `application/json` / `wellness-sync.json`, `takePersistableUriPermission`, stream read/write with 16 MB cap and `"wt"` fallback, plain error messages including provider write refusal) and bridged it in `MainActivity.java` (`syncStatus`, `syncPick`, `syncForget`, `syncRead`, `syncWrite`, `PICK_SYNC`).
  - Web/JS: added `app/www/lib/sync-core.js` (`WLSyncCore`) and `app/www/lib/sync.js` (`WL.driveSync`) to read remote `answers` before writing, keep them locally until consumed (`takeAnswer`), emit `onAnswers`, write backup JSON + `requests` + `acked`, and auto-sync on app open and background at most every 30 min (plus manual "Sync now"). Added `setRequestsProvider` and `enqueue` hooks so Task B plugs right in.
  - UI: added Settings > "Sync with Google Drive" card in `shell.js` showing last synced, queue/answer counts, plain errors, "Sync now", "Change file", and two-tap "Turn off Drive sync".
  - Tests: `SyncTest.java` (wired into `tests/java.cjs`), `tests/sync.cjs`, and `tests/e2e-sync.cjs` (fake SAF bridge, backup payload, 30-min throttle, read-answers/write-acked lifecycle, write-refusal error handling, and Larger text size a11y).
- Fixed: `workout-core.js` (`weekStats`, `weekVolume`, `coach`) and `calm-core.js` (`stats`) upper-bounded date windows at `now` so logging for an earlier day/week never counts future-week sessions or treats future sessions as today; added unit tests in both modules.
- Added `[any]` tasks 30 (Drive sync one-tap restore) and 31 (44 px tap targets in `style.css` + `e2e-a11y.cjs`) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 46 suites passed, 0 skipped).
- Next: verify APK build (Claude's next run) includes `Sync.java` + `lib/sync*.js`, then pick up tasks 30-31 or coordinate with Task B once landed.

## 2026-11-21 02:26 AST (Tasks 32, 30, 31: cloud answers sheet channel, Drive restore, 44 px tap targets)
- Cross-reviewed Claude's commits (`b105d89`..`e7a70cf`: Task B prompts in `pc/prompts/*.md` + cloud request queue in `lib/pc.js`, `coach.js`, `link.js`, `me.js`, `tagalog.js`, `tests/e2e-cloud.cjs`): clean integration with `WL.driveSync`; noticed buttons in `coach.js`/`me.js`/`link.js` still gate on `pc.ready()` when unpaired with only Drive sync on -> logged as `[any]` task 33.
- Done 32 (cloud answers channel via Google Sheet CSV export, `e379443`):
  - Android: added `pickAnswersIntent` (`ACTION_OPEN_DOCUMENT` without `CATEGORY_OPENABLE` so Drive virtual Google Sheets appear), `chooseAnswersMime`, RFC-4180 `parseCsv`, `answersFromCsv` (JSON `{"rows":[...]}`, JSON passthrough, binary XLSX/PDF rejection), `savePickedAnswers`/`forgetAnswers`, `readAnswers` (`getStreamTypes` + `openTypedAssetFileDescriptor("text/csv")` with `openInputStream` fallback and plain virtual-file errors), and `PICK_ANSWERS` bridge methods in `MainActivity.java`.
  - Web/JS: extended `WLSyncCore` (`parseCsv`, `rowsToAnswers`, `mergeRemote` for `{"rows":[...]}` + raw CSV) and `WL.driveSync` (`pickAnswers`, `forgetAnswers`, reading answers sheet on every sync while keeping backup sync working if sheet export fails; fixed `emitAnswers` to snapshot `S.answers` before notifying multiple listeners); updated Settings > "Sync with Google Drive" card and `pc/prompts/README.md`.
  - Tests: expanded `SyncTest.java` (MIME priority, RFC-4180 CSV, multiline/quotes/Unicode/BOM, binary rejection, error messages), `tests/sync.cjs`, and `tests/e2e-sync.cjs` (verifying CSV answers deliver end-to-end through `WL.pc.deliver()` and ack into `wellness-sync.json`).
- Done 30 (Restore from Google Drive, `706c88a`):
  - Android: added `pickRestoreIntent` (`ACTION_OPEN_DOCUMENT` + `CATEGORY_OPENABLE`), `readUri`, `displayName`, and `PICK_RESTORE` / `syncPickRestore` bridge in `MainActivity.java` so restoring works on a brand-new phone before Drive sync is configured.
  - Web/JS: added `WLSyncCore.describeBackup`, `WL.driveSync.pickRestore`/`onRestore`, and "Restore from Drive" in Settings (both unconfigured & configured states) with backup validation, confirm prompt showing backup date/filename, and `WL.restoreText`.
  - Tests: `tests/sync.cjs` (`describeBackup`) and `tests/e2e-sync.cjs` (unconfigured restore, cancel confirm, corrupt file rejection, full data restore).
- Done 31 (44 px accessibility tap targets):
  - CSS: raised `.chip`, `.tabs2 button`, `.subnav a`, `.tick-box` (44×44 tap area with 28 px visual circle), and `.link.small` to >= 44 px in `app/www/style.css`.
  - Tests: tightened `tests/e2e-a11y.cjs` to 44 px across every screen at both 1.0 and 1.3 text sizes (including `.subnav a` and `.tick-box` on `#todo`), plus `tests/e2e-sync.cjs`.
- Added tasks 33 (`[any]`, cloud-first without PC pairing) and 34 (`[drive]`, cloud-side `wellness-answers` Sheet writer + APK build/phone check) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 47 suites passed, 0 skipped) after each task.
- Next: pick up task 33 (`[any]`) or coordinate after Claude's next APK build and phone verification of task 32.

## 2026-11-21 07:24 AST (Cross-review fixes, live Faith personalization, date/DST bounds, theme/a11y, Parenting E2E)
- Cross-reviewed Claude's commits (`95ef16b`..`b657605`: task 33 cloud-first without PC pairing, Home Drive sync setup card, `tools/cloud-answer.cjs`, and `ae347fe`/`8543ea2`: XLSX reader in `Sync.java` for Drive virtual Sheets): solid overall; `Sync.java` XLSX parser handles XXE, zip size bounds, shared/inline strings, and phonetic runs cleanly.
- Fixed (`5961e84`): `tools/cloud-answer.cjs prepare` now accepts an optional `<sheet.csv>` and skips request IDs that already have a valid answer row in `wellness-answers` (preventing duplicate cloud re-answers before the phone syncs and acks); `tools/cloud_prompts.py` reconfigures stdin/stdout to UTF-8 for Windows safety; updated `cloud-plan.md` command snippet and added tests in `tests/cloud-answer.cjs`.
- Fixed (`59804d0`):
  - `app/www/modules/faith/faith.js` now refreshes personalized `{child}` content dynamically (`syncContent()`) when Parenting setup changes or a backup is restored, instead of freezing it at initial page load; verified without reload in `tests/e2e-personal.cjs`.
  - Upper-bounded `doneInLast` at `today` in `app/www/modules/faith/core.js` and `app/www/modules/todo/todo-core.js` so earlier-day windows ignore future completions; switched `coach-core.js` newborn `ageText` (< 1 month) to UTC calendar-day math so spring-forward DST never undercounts by a day; added unit tests in all three modules.
- Fixed (`2ae2c5b`): `.today-list li.done .tk` in `app/www/style.css` referenced undefined `--ok` (falling back to bright `#2e7d32` in dark and 3am night modes) -> fixed to `var(--good)`; raised `button.link` from 40 px to `min-height: 44px` so every visible button across all 16 screens meets 44 px at 1.0 and 1.3 text sizes; expanded `tests/e2e-a11y.cjs` to check all buttons (including `.link`), `--good` tick color across themes, and WCAG AA contrast.
- Fixed & added tests: disabled `#co-grade` and `#co-skip` in `app/www/modules/coach/coach.js` when neither PC nor Drive sync is configured (`!askable()`) so an existing scenario/draft cannot be wiped by accident; added `modules/coach/tests/e2e.cjs` (setup validation, milestones/Cancel, active-scenario protection, past-practice detail + HTML escaping, unknown id, noOverflow).
- Added `[any]` tasks 35 (cancel queued cloud requests), 36 (Drive sync date in backup nudge), and 37 (Faith `doneInLast` across rounds) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 50 suites passed, 0 skipped, including `coach e2e`, Java `SyncTest` with XLSX, and `privacy`).
- Next: pick up tasks 35–37 (`[any]`) in order on the next run.

## 2026-11-21 12:16 AST (Cross-review, Drive sync in-flight resync, Faith activity pastRounds, Updater fixes, TZ date bounds)
- Cross-reviewed Claude's commits (`47cc91e`..`c6f8920`: tasks 35, 36, 37, 38 + APK `0.1.20261121.1410`): clean work across tip feedback prompts, cloud cancel, Faith week across rounds, and Drive-sync-aware backup nudge.
- Fixed (`c28de7e`):
  - `app/www/lib/sync.js`: when a non-auto `sync()` is requested while another sync is already `inFlight` (e.g., queueing or cancelling a cloud request mid-write), schedule and coalesce one follow-up sync instead of returning the stale in-flight promise so changes to `requests` are never dropped from `wellness-sync.json`.
  - `app/www/lib/pc.js`: `[data-cloud-cancel]` now cancels all IDs first (`cancel(id, true)`) and triggers a single `WL.driveSync.sync()`.
  - Added mid-flight enqueue/cancel race test in `tests/e2e-sync.cjs`.
- Fixed (`5eb02f9`):
  - `app/www/lib/activity.js`: `X['fc.v1']` now includes `s.pastRounds` with their original round numbers (`faith/day/<round>/<n>`) so Faith days finished before `walkAgain` stay in PC/cloud summaries without duplicating already-sent event IDs; added test in `modules/link/tests/unit.cjs`.
  - `app/www/modules/tagalog/tagalog-core.js`: upper-bounded `stats()` weekly window at `today` (matching Faith, Calm, Move, and To-do) so earlier-day lookups ignore future lessons/answers; added test in `modules/tagalog/tests/unit.cjs`.
- Fixed (`176e99e`):
  - `android/src/app/faithcompanion/Updater.java`: unpaired cloud-first phones now surface GitHub check errors (`combineErrors`) instead of silently reporting "Up to date"; `tryFrom` skips re-downloading an APK version already downloaded as `readyCode` (`shouldDownload`) and still checks GitHub if PC has a 3x-failed build.
  - Added `tests/java/app/faithcompanion/UpdaterTest.java` and wired it into `tests/java.cjs`.
- Fixed: `app/www/modules/me/me-core.js` `forPlan()` now bounds the 14-day check-in window by local calendar dates (`iso(...)` to `today`) instead of UTC `toISOString().slice(0, 10)` so late-evening check-ins west of UTC aren't clipped; added test in `modules/me/tests/unit.cjs`.
- Added `[any]` tasks 39 (Parenting "What worked with her" recall), 40 (To-do quick-add live preview), and 41 (Tagalog Filipino-voice download nudge) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 50 suites passed, 0 skipped, across local / New York / Manila time zones, Playwright e2e, Java + `UpdaterTest`/`SyncTest`/`PcLinkTest`, Python `test_pc.py`, and `privacy`).
- Next: pick up tasks 39–41 (`[any]`) in order on the next run.

## 2026-11-23 13:43 AST (Tasks 39, 40, 41 + TodoAlarm Doze/permission fixes)
- Cross-review: no new `[claude]` code commits since last run (`3d2371f`); Claude added & claimed task 42 (workout rest days with a reason) mid-run (`5274338`), so kept all changes clear of `modules/workout/`, `lib/activity.js`, and `pc/`.
- Done 39 (`a5d307f`, Parenting "What worked with her"):
  - Added `CoachCore.workedTips(state, me, max)` in `app/www/modules/coach/coach-core.js` (tips rated `"It worked"`, newest first by `edited || at`, case-insensitive dedup, survives past the 7-day "This week, try" window, excludes tips flagged `"Not for me"`).
  - Rendered live-updating `#co-worked` card in `app/www/modules/coach/coach.js` linking each winning tip back to `#coach/h/<id>` and refreshing immediately on tip rating or "Not for me?" saves.
  - Added unit + browser e2e tests in `modules/coach/tests/unit.cjs` and `modules/coach/tests/e2e.cjs`.
- Done 40 (`ddca651`, To-do quick-add live preview):
  - Added `#td-preview` (`aria-live="polite"`) in `app/www/modules/todo/todo.js` using `TodoCore.quickParse` + `TodoCore.firstDue` + `TodoCore.fmtTime` so parsed task title, date, reminder time, and repeat show quietly while typing in `#td-new` (staying hidden for plain text).
  - Added browser e2e test in `modules/todo/tests/e2e.cjs`.
- Done 41 (`f217263`, Tagalog Filipino-voice nudge):
  - Added `#tl-voice-nudge` in `app/www/modules/tagalog/tagalog.js` when `WL.native.voiceStatus()` reports `tagalogVoice === 'missing'` (hidden while downloading or if Phone's voice is chosen), linking to `#settings/voice`; updated `app/www/shell.js` to scroll `#wl-voice` into view for `#settings/voice`.
  - Added fake-native-bridge e2e test in `modules/tagalog/tests/e2e.cjs`.
- Fixed (`TodoAlarm.java` & `MainActivity.java`):
  - `android/src/app/faithcompanion/TodoAlarm.java`: added `dueBetween(lines, from, to)` (sorted chronologically) and used `through = Math.max(when, now)` in `FIRE` so Doze/inexact alarm delays never silently drop reminders scheduled between `when` and `now` or double-fire an entry at `now`.
  - `android/src/app/faithcompanion/MainActivity.java`: `todoAlarms()` now checks `TodoAlarm.hasReminders(lines)` instead of `!lines.isEmpty()` so the empty `"#open\t"` sentinel line no longer triggers Android's `POST_NOTIFICATIONS` prompt on a fresh app with zero reminders.
  - Added unit tests in `tests/java/app/faithcompanion/TodoAlarmTest.java`.
- Added `[any]` tasks 43 (Calm quick duration chips), 44 (Faith journal kind filter), and 45 (Tagalog review missed-words recap) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 50 suites passed, 0 skipped, including Playwright e2e, Java, Python `test_pc.py`, and `privacy`) after every commit.
- Next: cross-review Claude's task 42 once landed, then pick up tasks 43–45 (`[any]`) in order.
