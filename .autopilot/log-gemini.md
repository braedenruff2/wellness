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

## 2026-11-23 16:54 AST (Cross-review privacy & overflow fixes, me-core edge cases, a11y form inputs, TodoCore quickParse)
- Cross-reviewed Claude's commits (`3ecd90f`..`8b2c87d`: tasks 42–56, 59, 60): solid features overall; both open tasks (57 and 58) were actively claimed by two Claude runs, so stayed completely clear of `tagalog-core.js` and module `today()`/`week()` hooks.
- Fixed (`1ebde48`, cross-review privacy): `tests/privacy.cjs` locally flagged the dummy birth date in `tests/storage-size.cjs`; replaced it with `'2025-01-15'` so `tests/privacy.cjs` passes cleanly.
- Fixed (`d44bf4d`, `modules/me/me-core.js` + `modules/me/tests/unit.cjs`):
  - `lastN` now skips un-tapped quick answers (`a: {}`) so tapping and clearing a chip never masks a previous workout pain answer or inflates answer counts in `guidance()`.
  - `checkinNote` now validates ISO dates and trims `state.checkins` to 120 days (matching `checkin`), and `recentCheckins` ignores empty cleared check-ins.
  - Moved today's explicit check-in note rules (`sick`, `busyday`) right after `rough` in `guidance()` so Home's 3-item cap doesn't hide them behind multi-day trends; passed `now` to `calmLikes(state, now)`.
- Fixed (`6209b6e`, `app/www/style.css` + `tests/e2e-a11y.cjs` + `tests/lib/web.cjs`):
  - Wrapped `.tabs2` (`flex-wrap: wrap`) to fix a 31 px horizontal overflow on `#faith/journal` at text size 1.3 caused by the 5th tab ("Written").
  - Extended form-input theme styling (`color`, `background`, `border`, `border-radius`, `min-height: 44px`) to `input[type="search"]`, `input[type="date"]`, `input[type="time"]`, and `input[type="number"]` so `#j-search`, `#co-birth`, `#td-date`, `#td-time`, `#rem-time`, and workout number inputs match dark/night themes and meet 44 px tap targets.
  - Added a short `waitForTimeout(30)` in `tests/lib/web.cjs` `noOverflow` so hash-only navigations settle before measuring scroll width; verified all inputs in night mode at 1.3x in `tests/e2e-a11y.cjs`.
- Fixed (`fb63709`, `app/www/modules/todo/todo-core.js` + `modules/todo/tests/unit.cjs`):
  - Made `TodoCore.quickParse` peel time, repeat, and explicit date modifiers in a short multi-pass loop so combinations in any order (e.g. `"pay rent every month on dec 1 at 9am"`, `"water plants every 2 weeks tomorrow"`, `"take pills tomorrow at 8am every day"`) preserve all three fields and set monthly `mday` from the explicit start date.
- Added `[any]` tasks 61 (workout 0-set imported sheet rows), 62 (`FCTodoTicked` `syncAlarms` fallback), and 63 (`FCCore.journalText` timestamp sort + edge tests) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 58 suites passed, 0 skipped, including Playwright e2e, Java, Python `test_pc.py`, and `privacy`) after every code commit.
- Next: cross-review Claude's tasks 57 and 58 once landed, then claim and tackle tasks 61–63 (`[any]`) in order.

## 2026-11-23 17:02 AST (User request: Gemini CLI backup for Claude usage limits)
- Implemented automatic Gemini CLI backup in `pc/wellness_pc.py` for all PC link AI requests (`/v1/ask`: Parenting scenarios/grading/advice, Tagalog checks, Home advice, weekly plans):
  - When Claude returns a usage/quota/rate limit error, the PC link records `claude_until` (next Wednesday 12:00 local time, DST-safe) in `ai_state.json`, immediately retries the same request with Gemini CLI (`gemini -p ... --output-format json`, mapping `WebSearch,WebFetch` to `google_web_search,web_fetch`), and routes subsequent requests directly to Gemini until Wednesday noon.
  - If Gemini also hits a usage/quota limit, `gemini_until` is persisted until Monday 00:00 local time (DST-safe); once Monday arrives, Gemini resumes automatically while Claude waits for Wednesday noon.
  - Extended `/v1/health` with `gemini`, `provider`, `claudeUntil`, and `geminiUntil` and updated `#link` ("Check the PC" in `app/www/modules/link/link.js`) to display Gemini backup status.
  - Added `Sign in to Gemini.bat` and updated `README.md`.
- Added unit and end-to-end tests in `pc/test/test_pc.py` (reset schedule across Wed/Mon & DST, fallback on same request, staying on Gemini without calling Claude, tool mapping, both-exhausted -> Mon Gemini reset -> Wed Claude reset, and missing-Gemini error) and `modules/link/tests/e2e.cjs`.
- Tested: full `node tests/run-all.cjs` (all 58 suites passed, 0 skipped).

## 2026-11-23 17:55 AST (Tasks 61–63, Android Voices/MainActivity/PcLink hardening, UI/lifecycle/a11y fixes)
- Done 63 (`89f4e83`): `FCCore.journalText` now sorts journal entries by `Date.parse(at)` (handling mixed timezone offsets) and trims answered prayer notes; added unit tests in `modules/faith/tests/unit.cjs`.
- Done 62 (`dea5892`): `FCTodoTicked` in `app/www/modules/todo/todo.js` now calls `syncAlarms()` even when `got.length === 0` so repeating reminders stay topped up; added test in `modules/todo/tests/e2e-remind.cjs`.
- Done 61 (`97aada8`): added `historyWithSets` in `app/www/modules/workout/workout-core.js` so 0-set imported sheet rows never count as workout days across `weekStats`, `fourWeeks`, `offerTwo`, `today`, `coach`, `restThisWeek`, and `importSheetCsv`; added unit tests in `modules/workout/tests/unit.cjs`.
- Fixed (`019fb13`): added `stopAudio()` token/timer guard and registered `leave: stopAudio` in `app/www/modules/tagalog/tagalog.js` so "Listen while walking" and "Play all" cancel cleanly on stop, restart, route, or leaving a lesson; added e2e test in `modules/tagalog/tests/e2e.cjs`.
- Fixed (`85edbfb`): reused a single `AudioContext` in `app/www/modules/workout/workout.js` `beep()` (preventing WebView's 6-context hardware cap) and resumed suspended `AudioContext` in `beep()`, `shell.js` `bell()`, and `tick()`; added test in `modules/workout/tests/e2e-alarm.cjs`.
- Fixed (`7f88535`): `app/www/modules/calm/calm.js` now persists the after-stress rating immediately on tap (so pressing Back never loses it); removed a dead 30 s `selectOption` timeout in `tests/e2e-logday.cjs` (cut suite time from 31.7 s to 1.7 s).
- Fixed (`fcac672`):
  - `android/src/app/faithcompanion/Voices.java`: replaced blocking `q.put(...)` with `offerWhile(...)` + `q.clear()` on exit so stopping/pausing/skipping during multi-sentence speech never leaks a blocked producer thread or PCM buffers, and updated `AudioTrack` speed when switching between PC voice and Kokoro mid-passage.
  - `android/src/app/faithcompanion/MainActivity.java`: cleared `web = null` and `tts = null` in `onDestroy()`, guarded `web != null` and `destroyed` across callbacks, and deleted orphan MediaStore `Downloads` rows if `openOutputStream` fails in `saveFile()`.
  - Added tests in `tests/java/app/faithcompanion/SpeechTest.java`.
- Fixed (`4aa51c7`): `app/www/modules/me/me.js` saves `#me-ck-note` live on `input` (not only `change`) and filters empty check-ins out of "Last 7 check-ins"; `me-core.js` removes ghost day objects when all chips/notes are cleared; added unit + e2e tests.
- Fixed (`25e96ba`): raised workout logged-set chips (`.sc.on`) in `app/www/style.css` to 44×44 px tap targets using a clean `::before` visual pill matching `.tick-box`; guarded `workout-core.js` `logSet`/`editSet` against `NaN`/negative weights; expanded `tests/e2e-a11y.cjs` to cover `#faith/settings`, `#workout/history`, `#workout/settings`, `#tagalog/words`, `#tagalog/settings`, and active `.sc.on` chips at 1.3x.
- Fixed (`c439c1d`): fixed cloud-advice race in `app/www/modules/link/link.js` (prevented overwriting `P.advice` with `{ waiting: 0 }` when a cloud answer arrives mid-request) and skipped empty legacy check-ins in `app/www/lib/activity.js`; added tests in `modules/link/tests/unit.cjs` and `tests/e2e-cloud.cjs`.
- Fixed (`d5415ef`): `app/www/modules/faith/faith.js` now cancels the 1.2 s bell-start timer and saves any pending unsaved `#dj` day reflection in `leave()`; added e2e tests in `modules/faith/tests/e2e.cjs`.
- Fixed (`d498b27`): `android/src/app/faithcompanion/PcLink.java` guards `quote(null)`, disconnects on pair step-2 errors, and caps `readAll` at 16 MB; added tests in `tests/java/app/faithcompanion/PcLinkTest.java`.
- Fixed (`3dcdb49`): `app/www/shell.js` validates `wl.shell.v1` in `restoreText()`, revokes download Blob URLs, and only records `SH.lastBackup` when `saveFile()` succeeds; added tests in `tests/e2e-shell.cjs`.
- Fixed (`4665541`): `pc/wellness_pc.py` preserves `subprocess.TimeoutExpired` when Gemini backup times out (so `Jobs._run` returns a clean timeout message without leaking CLI paths); `tools/cloud-answer.cjs` detects `python`/`python3` cleanly on Windows and Linux.
- Fixed (`2e9014f`): restricted `here()` in `app/www/modules/coach/coach.js` to `/^#coach\/?$/` so background/cloud answers never overwrite `#coach/setup` or `#coach/h/<id>`; added test in `tests/e2e-cloud.cjs`.
- Fixed (`a9661a8`): `app/www/modules/todo/todo.js` schedules undated one-off edit-sheet reminders whose time already passed today for tomorrow (matching `quickParse`) and avoids CSS selector interpolation on `t.id`; `app/www/modules/faith/faith.js` `#j-search` searches entry content/date/kind without matching the `Delete` button label.
- Added `[any]` tasks 64 (Workout Progress area filter chips), 65 (Faith Prayer list search + undo answered), and 66 (Calm recent sessions summary) to `.autopilot/cloud-plan.md`.
- Tested: full `node tests/run-all.cjs` (all 58 suites passed, 0 skipped) after every code commit.
- Done 64 (`4b19754`): added `#wo-areas` area filter chips (All / Legs / Push / Pull / Core / Walk) on `#workout/history` filtering `.wo-ex` cards live; added e2e test in `modules/workout/tests/e2e.cjs`.
- Done 65 (`34e210c`): added `#p-search` prayer list search (when 6+ prayers, ignoring button labels) and one-tap `.p-undo` ("Move back to praying") on `#faith/journal/prayers`; added e2e tests in `modules/faith/tests/e2e.cjs`.
- Done 66 (`e1f1d0d`): added collapsible `#c-recent` ("Recent sessions") `<details>` card at the bottom of `#calm` listing the last 10 sessions newest-first with minutes and stress ratings (plus safe `titleOf` helper); added e2e test in `modules/calm/tests/e2e.cjs`.
- Done 67 (`2d95996`): added `#tl-word-search` on `#tagalog/words` (when 10+ words met) filtering Tagalog and English across `#tl-hard` and `#tl-all` and hiding empty section cards; added e2e test in `modules/tagalog/tests/e2e.cjs`.
- Done 68 (`391d90a`): added `#co-hist-search` (by title or skill across full history, including items past 20) and `#co-hist-more` ("Show all") button on `#coach` Past practice; added e2e test in `modules/coach/tests/e2e.cjs`.
- Done 69: added `#path-jump` ("Jump to Day N") on `#faith/path` past Week 1 targeting `#path-cur`, and added Enter-to-save / Escape-to-cancel in `#todo` edit sheet (`#td-edit`); added e2e tests in `modules/faith/tests/e2e.cjs` and `modules/todo/tests/e2e.cjs`.
- Next: cross-review Claude's tasks 57 and 58 once landed, and continue auditing edge cases, tests, and usability.

## 2026-11-23 22:25 AST (Tasks 70–74: earlier-day logging, timezone-safe backup nudge, to-do edit guard, PC/validate hardening, Tagalog build UX)
- Cross-review: no new `[claude]` commits since the previous run (`8b2c87d`); left Claude's active claims (tasks 57 and 58) untouched.
- Done 70 (`0f4d9a1`): wired `WL.logNow()` in `app/www/modules/tagalog/tagalog.js` (`finishLesson`, `recordAnswer`, `review`) and `app/www/modules/faith/faith.js` (`addPrayer`, prayer `answered`) so "Log for an earlier day" applies consistently across Tagalog and Faith prayers; added e2e tests in `tests/e2e-logday.cjs`.
- Done 71 (`45f0883`): updated `backupNudge` in `app/www/shell.js` to compare calendar days (`Date.parse(today) - Date.parse(SH.nudged)`) instead of UTC-midnight timestamps so the 7-day cadence is exact in all time zones and across DST; reset file inputs (`#wl-import` in `shell.js`, `#wo-csv` in `workout.js`) after reading so cancelling confirm and picking the same file again still triggers `onchange`; added e2e tests in `tests/e2e-shell.cjs`.
- Done 72 (`2c10f66`): hid `#td-hour` ("In 1 hour") on done tasks in `app/www/modules/todo/todo.js`, guarded `TodoCore.remindIn` before saving/toasting, and wired Escape anywhere inside `#td-sheet` to close the edit sheet; added e2e tests in `modules/todo/tests/e2e.cjs`.
- Done 73 (`9f93d88`): validated calendar dates and timestamp suffixes in `pc/wellness_pc.py` `clean_event` so impossible dates (e.g. `2026-02-30`, `2026-99-99`) never crash `save_events` on `date.fromisoformat`; hardened `validate()` in `workout-core.js` (drop invalid weights, non-positive sets, and 0-only imported history rows), `me-core.js` (drop empty ghost check-ins; guarded `card.isConnected` in `me.js`), and `link.js` (reject non-object JSON); added tests in `pc/test/test_pc.py`, `modules/workout/tests/unit.cjs`, `modules/me/tests/unit.cjs`, and `tests/e2e-shell.cjs`.
- Done 74: made placed words in Tagalog `build` exercises (`#tl-built` in `app/www/modules/tagalog/tagalog.js` + `.built` flex layout in `app/www/style.css`) 44 px removable chips so mistapping one word doesn't require clearing the whole sentence; added e2e tests in `modules/tagalog/tests/e2e.cjs`.
- Added `[any]` tasks 75–77 to `.autopilot/cloud-plan.md` (cloud-first custom advice question on `#link`, weight-aware best set on `#workout/history`, Escape on Faith answered-prayer form & guided session Space shortcut).
- Tested: full `node tests/run-all.cjs` (all 58 suites passed, 0 skipped, including Playwright e2e, Java, Python `test_pc.py`, and `privacy`) after every task.
- Next: cross-review Claude's tasks 57 and 58 once landed, then claim and tackle tasks 75–77 (`[any]`) in order.

## 2026-11-24 02:32 AST (Tasks 57, 58, 75, 76, 77: Tagalog word-order hint, midnight/DST bug hunt, cloud-first custom advice, weight-aware best set, keyboard UX)
- Cross-review: no new `[claude]` commits since the previous run (`8b2c87d`); prior claims on tasks 57 and 58 were >10 hours old (void per `agents.md` 8-hour rule), so claimed and completed all 5 remaining `[any]` tasks in order.
- Done 57 (`beae0b9`): added `TagalogCore.orderHint(ex, given)` in `app/www/modules/tagalog/tagalog-core.js` for wrong-order answers with the exact same words on `ang`/`ng`/`si`/`ni` sentences (`"Right words; in Tagalog the doer comes after the verb: ..."`), wired `#tl-order` feedback in `app/www/modules/tagalog/tagalog.js`, and added real-pack unit + browser e2e tests in `modules/tagalog/tests/`.
- Done 58 (`50e9b50`): audited Home's `#wl-today`, `#wl-week`, and every module's `today()`/`week()` in `America/Halifax` across 23:59/00:00 boundaries and DST end (Sun 1 Nov 2026, including the repeated 01:30 hour and late-night timestamps already on the next UTC date).
  - Fixed `app/www/shell.js` to refresh Home on `visibilitychange` resume when crossing midnight, Sunday noon, or 8 pm (skipping if actively editing a field or sheet), and re-apply Auto theme on resume.
  - Fixed `app/www/modules/workout/workout-core.js` `weekStats()` and `weekVolume()` to upper-bound `thisWeek` at `iso(now)` (consistent with `restThisWeek`, Faith, Calm, Tagalog, and To-do).
  - Added `timezoneId` support in `tests/lib/web.cjs`, new suite `tests/e2e-midnight-dst.cjs`, and unit test in `modules/workout/tests/unit.cjs`.
- Done 75 (`c600294`): updated `app/www/modules/link/link.js` to show the "Advice from Claude" card (`#lk-advice-card`) on `#link` when unpaired with Drive sync enabled (`WL.pc.canAsk()`) and added an "Ask a question" link on Home's link card so custom questions can be queued for the cloud run; added tests in `tests/e2e-cloud.cjs`.
- Done 76 (`b659dfd`): added `WorkoutCore.bestSet(state, name)` (heaviest weight first, then highest reps/sec/min at that weight, respecting sheet dedup and set edits/removals) and wired it into `#workout/history` in `app/www/modules/workout/workout.js`; added unit + e2e tests in `modules/workout/tests/`.
- Done 77: wired Escape to cancel `.ans-form` on `#faith/journal/prayers` and Space to pause/resume active Faith and Calm guided sessions (ignoring inputs/buttons/links and removing listeners cleanly in `leave()`); added tests in `modules/faith/tests/e2e.cjs` and `modules/calm/tests/e2e.cjs`.
- Added `[any]` tasks 78–80 to `.autopilot/cloud-plan.md` (`#me-sheet` Escape/route cleanup, Tagalog review keyboard shortcuts, Move earlier-day/spring-forward DST coverage).
- Tested: full `node tests/run-all.cjs` (all 59 suites passed, 0 skipped, including Playwright e2e, Java, Python `test_pc.py`, and `privacy`) after every task.
- Next: cross-review any new `[claude]` commits, then claim and tackle tasks 78–80 (`[any]`) in order.

## 2026-11-24 07:22 AST (Tasks 78–80 + Calm/Faith/Coach bug fixes)
- Cross-review: no new `[claude]` commits since the previous run (`e5e88df`).
- Done 78 (`546397a`): added `closeFitSheet` in `app/www/modules/me/me.js` so Escape anywhere closes `#me-sheet` and restores focus to the `"Not for me?"` trigger button (also moving initial focus into the sheet), and cleaned up any open `#me-sheet` and its key listener on `hashchange`; added e2e test in `modules/me/tests/e2e.cjs`.
- Done 79 (`22205ac`): added `#tagalog/review` keyboard shortcuts (`Space`/`Enter` to reveal `#tl-show` without hijacking focused links/buttons, `1`/`2` for "Not yet"/"Got it" respecting the 400 ms double-tap guard) in `app/www/modules/tagalog/tagalog.js`, cleaned up on deck finish and in `stopAudio()`/`leave()`; added e2e test in `modules/tagalog/tests/e2e.cjs`.
- Done 80 (`d69d982`): tightened earlier-day and out-of-order session bounds in `app/www/modules/workout/workout-core.js` (`latestByDate` in `coach`/`askSore`/`nextDay`, upper-bounded `weekStats().total` at `todayIso`) and `app/www/modules/workout/workout.js` (`weekDots(now())` on Today); added unit tests in `modules/workout/tests/unit.cjs` and DST spring-forward (Sun 8 Mar 2026 in `America/Halifax`) coverage in `tests/e2e-midnight-dst.cjs`.
- Fixed (`bd93eb8`): cleared one-session duration overrides when leaving a session straight to another tab (`pick = null` in `calm.js` `leave()`, `shortOnce = null` immediately after reading in `faith.js` `screenSession()`); added e2e tests in `modules/calm/tests/e2e-length.cjs` and `modules/faith/tests/e2e-short.cjs`.
- Fixed: `app/www/modules/coach/coach.js` `card()` now finds the latest scored scenario in `S.history` so adding a real-situation advice entry (`kind: 'real'`) never hides the `"Last: X/10"` progress line on Home; added e2e test in `modules/coach/tests/e2e.cjs`.
- Added `[any]` tasks 81–83 to `.autopilot/cloud-plan.md` (a11y on newer search/interactive states, Move `.editrow` Escape/rest-timer wake tests, To-do edit sheet focus restoration).
- Tested: full `node tests/run-all.cjs` (all 59 suites passed, 0 skipped, including Playwright e2e, Java, Python `test_pc.py`, and `privacy`) after every commit.
- Next: cross-review any new `[claude]` commits, then claim and tackle tasks 81–83 (`[any]`) in order.
