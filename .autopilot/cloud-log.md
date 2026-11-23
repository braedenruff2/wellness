# Cloud log

## 2026-11-23 14:30-15:40 AST (same run, continued)
- Done: training on a day logged as rest clears that rest day (restRemoved -> PC drops it); pc summary skips un-tapped (empty) quick answers.
- Done 49: logs were already capped at runtime; tests/storage-size.cjs (120 heavy days 1.4M chars; caps hold for a year, 2.8M). New: a save the phone refuses (quota/blocked) shows a toast once and a card on Home + Settings until a save of that part works (tests/e2e-savefail.cjs).
- Done 44: Faith journal "Written" tab (other tabs + search already existed); unknown tab -> All.
- Done 45: Tagalog review "All done" lists the "Not yet" words with hear buttons (e2e-recap).
- Done 47 (forgot to claim first; nobody else had it): Faith Today from 21:00-05:00 offers a shorter guided prayer for that session only; says why after a late "Hard to focus" (e2e-short). 50 dropped (covered by coach()).
- Note: an assert on a Playwright ElementHandle that fails makes console.error dump it and OOM-kills node; compare `!!(await page.$(...))` instead.
- Tested: full suite, 55 suites pass, none skipped. APK 0.1.20261123.1834 (real key).
- Check on the phone: Faith after 9 pm shows "A shorter one tonight"; Tagalog Review with a "Not yet" lists it at the end.

## 2026-11-23 13:35-14:30 AST (cloud run; PC reachable)
- Cross-reviewed Gemini's c28de7e (coalesced resync), 5eb02f9 (pastRounds in activity, Tagalog stats bound), 176e99e (Updater), 3d2371f (forPlan local dates), ddca651 (to-do preview), f217263 (voice nudge): sound, nothing to fix.
- Drive: wellness-sync.json synced today; no queued requests.
- Done 42: Move > Today "Not training today?" (Busy day / Sore / Tired / Sick / Planned rest, Undo). Logged rest = done on Home's today list, its own coach line (Sore: normal soreness + sharp pain = rest/doctor/physio; next day "two sets of each"), "A busy week (N rest days logged)", Sunday "Your week" names them. activity.js sends rest-day (undone: <id>/x, PC drops it); pc summary lists them as "not missed workouts"; advice + weekly-plan prompts say never call him inconsistent for them.
- Done: coach line for the first 1-2 workouts in 4 weeks: stop each set 2-3 reps short; soreness after the first workouts is normal.
- Tested: full suite after each change, all 51 pass, none skipped (new modules/workout/tests/e2e-rest.cjs; unit in 3 zones; link unit; test_pc). APK 0.1.20261123.1753 (real key, cert 6795e499...).
- Check on the phone: Move > Today > "Not training today?" > Sore: Home shows "Move: rest day (sore)"; tomorrow's Move line says two sets of each.

## 2026-11-21 11:10 AST (cloud run; PC awake but no folder connected to the session)
- Cross-reviewed Gemini's 5961e84 (prepare skips ids already in the answers sheet), 59804d0 (live {child} refresh, doneInLast bounds, DST-safe ageText), 2ae2c5b (--good tick, 44 px links), 4534aeb (coach guards + e2e): sound, nothing to fix.
- Drive: wellness-sync.json is syncing from the phone; no queued requests, so nothing to answer.
- Done 38: Parenting requests (scenario, grade, real-situation advice) carry `tipNotes` (his "Did you try it?" and "Not for me?" answers on earlier "This week, try" tips, with his note); pc prompts get {{tips}} (tip_notes) so Claude doesn't suggest again what he or she already does.
- Done 35: Cancel on waiting cloud requests (Parenting queued card, Home advice, weekly plan, Tagalog checks). WL.pc.cancel drops it from the sync queue; an answer that still arrives for it is acked and not shown (P.cancelled); a cancelled plan isn't re-asked by itself that day (planCancelled).
- Done 37: Faith "Your week" counts days finished earlier in the week after Walk again.
- Done 36: backup nudge says "Drive sync last worked N days ago" (link to the sync card) when sync stopped and no newer backup file.
- Tested: full suite after each task, all 50 pass, none skipped. APK 0.1.20261121.1410 (real key, cert 6795e499...).
- Check on the phone: with the PC off, Parenting > New scenario > Cancel in the waiting card: the New scenario button is back. Home advice/plan Cancel buttons fit at text size Larger.

## 2026-11-21 07:15 AST (live: owner reported the answers sheet error)
- Phone said "The answers sheet could not be opened ... Drive refused CSV export". Cause: Drive serves a Google Sheet as a virtual document and offers it as XLSX/PDF, not CSV; Sync.java only tried text types.
- Fixed: Sync.java reads the sheet's XLSX export (zip + javax.xml DOM: shared/inline/str cells, workbook's first sheet), tries CSV/text first when offered; if nothing works the error says what Drive offered. Checked against the real Drive XLSX export of wellness-answers (test row written, parsed, cleared).
- Tested: full suite, all 49 pass, none skipped (SyncTest has the XLSX cases). APK 0.1.20261121.1115 (real key).
- Check on the phone: after the update, Settings > Sync with Google Drive > Sync now: no answers-sheet error. If one shows, it now lists the types Drive offered.

## 2026-11-21 05:30 AST (same run, continued)
- Done: Home shows one card until Drive sync and the answers sheet are set up ("Set it up" opens Settings at the sync card; "Not now" hides it a week). A recent Drive sync now counts as a backup, so no backup nudge while it syncs.
- Done: tools/cloud-answer.cjs + tools/cloud_prompts.py: `prepare` turns unacked requests in wellness-sync.json into the PC link's own prompts (advice/weekly-plan get summarize(14) from the synced stores); `rows` turns answers into the full wellness-answers sheet (acked rows pruned, old rows blanked) and checks it reads back through WLSyncCore. Steps in cloud-plan.md.
- Tested: full suite, all 49 pass, none skipped. APK 0.1.20261121.0900 (real key).
- Check on the phone: Home shows the Drive sync card until both steps are done.

## 2026-11-21 05:15 AST (cloud run; PC asleep/no folder connected)
- Cross-reviewed Gemini's 30, 31, 32 (sync-core/sync.js, Sync.java, style.css, tests): sound. One gap fixed: sheet rows stay until pruned and the phone keeps only 200 acked ids, so an old row could be shown again; deliver() now drops an answer it isn't waiting for once it's over a week old, and pc/prompts/README.md says cloud runs prune acked rows.
- Done 33: with no PC paired but Drive sync on, Parenting (New scenario, Get advice), Home advice card, weekly plan (#me + Home) and Tagalog "Ask Claude" queue straight for the cloud (WL.pc.canAsk; ask() queues when unpaired; note "This will be answered by the next cloud run" without "PC isn't answering"). No PC and no Drive: buttons off, note names both ways.
- 34 (cloud side): made the `wellness-answers` Google Sheet in the private folder (header id,task,answer-json,at); Drive's CSV export of it parses with WLSyncCore.mergeRemote.
- Tested: full suite, all 47 pass, none skipped. APK 0.1.20261121.0853 (real key, cert 6795e499...), includes Gemini's 30/31/32.
- Check on the phone: Settings > Sync with Google Drive > choose answers sheet > pick `wellness-answers` (Drive virtual file; it should say it's set, no error after Sync now). With the PC unpaired, Parenting > New scenario shows the cloud note. Restore from Drive lists wellness-sync.json once it exists.
- No wellness-sync.json in Drive yet, so no queued requests to answer.

## 2026-11-21 01:50 AST (cloud run; PC asleep/unreachable)
- Cross-review: Gemini's A (Drive sync, WL.driveSync), date-window bounds and the Windows test fix read fine; B builds on A's enqueue/takeAnswer/onAnswers and e2e-cloud exercises them together.
- Done B: PC prompts now live in pc/prompts/<task>.md + rules.md (README there says how each {{name}} is filled); prompt_for fills them and gives byte-identical prompts to before (checked on 1200 random inputs). Tests: every placeholder has a value, typed {{x}} stays as typed, missing file is a clear error.
- Done B (phone): when the PC can't be reached and Drive sync is on, coach scenario/grade/advice, Home advice, weekly plan and Tagalog checks go into the sync file's queue with "Your PC isn't answering, so this will be answered by the next cloud run (within about 5 hours)". Cloud answers ({task, answer} or {task, error} under answers[id]) show through the same code as PC answers; Tagalog checks land in a "Claude checked your answers" card on the Tagalog page. One waiting scenario/plan/advice at a time. Without Drive sync the error says to turn it on.
- Tested: full suite, all 47 suites pass, none skipped (new tests/e2e-cloud.cjs). APK 0.1.20261121.0533 built with the real key (cert SHA-256 6795e499...).
- Check on the phone: Settings > Sync with Google Drive (pick the Drive folder); with the PC off, Parenting > New scenario shows the cloud note and the request appears in wellness-sync.json.
- Found: the Drive connector can't write content into an existing file, so cloud runs can't put `answers` into wellness-sync.json. Added task 32 (answers through a Google Sheet the phone reads); noted what task 30 really needs.
- Next: task 32 (unblocks cloud answers), then 30-31.

## 2026-11-21 00:50 AST (same run, continued)
- Done 28: to-do repeats "every 2 months" / "every other month", "every 3 months" / "quarterly", "every year" / "yearly" / "annually" (repeat month2 / month3 / yearly; month ends and Feb 29 like monthly); edit sheet chips; README.
- Done 29: Tagalog type exercises may set `"poOptional": true`; only then a missing po/ho is accepted, with a meta note "With an elder, add po". checkPack rejects it elsewhere. No existing exercise uses it (all current po prompts ask for politeness).
- Tested: full suite, all 44 pass, none skipped. APK 0.1.20261121.0447 (real key).
- Check on the phone: add "filter every 3 months", it shows "↻ every 3 months"; the edit sheet's repeat chips wrap without overflow.

## 2026-11-21 00:45 AST (cloud run; PC awake but no folder connected to the session)
- Done C: Parenting setup has "What she can do now" chips (walks, gets down by herself, climbs, waves/"bless", first words, points, finger food, cup) and a note; saved on the phone, sent as `can` with coach-scenario / coach-grade / coach-advice; PC prompts (can_do) keep scenarios within it. The coach screen shows "She can: ..." and a nudge until it's set.
- Done D: advice summary counts active days from the first day with data ("Active on 2 of 2 days (the log starts ...)"); pc first_day().
- Done E: guidance key `mindracing`: a sleep/night wind-down rated "Mind racing" -> the next evening (from 17:00) suggests writing it down first.
- Done F: a failed weekly-plan try leaves "Couldn't make your plan this time" + Try again on Home and About you (no PC link: "It tries again when your PC answers."); me-core planFailed; tests/e2e-planfail.
- Tested: full suite, all 44 suites pass, none skipped. APK 0.1.20261121.0438 built with the real key (cert SHA-256 6795e499...).
- Check on the phone: Parenting > Change: tap chips, Save, "She can: ..." line; Home's About-you card after a failed plan.
- Next: task B (request queue + pc/prompts/), then A unless Gemini has it claimed.

## 2026-11-20 23:30 AST (live session with the owner: cloud-first)
- The owner asked for everything to run in the cloud. From now on cloud runs commit to main after the full suite passes.
- Done: harder lessons 4-7 in week 2026-11-18 (more typed answers and longer builds); bundled weeks re-download when corrected; build-apk.sh key guard; publish.bat merges origin/main before pushing.
- Verified: a full APK build works in the container (throwaway key, not committed); full suite passes.
- Next: tasks A-F in cloud-plan.md. The signing key must be in the private Drive folder before the cloud can ship an APK.

## 2026-11-20 20:45 AST (cloud run; the PC was awake but no folder was connected to the session)
- Fixed: to-do quick add read words like "friend", "wedding", "month", "sundeck" as weekdays ("call friend" became "call", due Friday). Weekday names now match only real spellings.
- Done: to-do quick add understands "bins every thursday" (weekly on that day; before, "every" stayed in the text and it didn't repeat), "every other friday", "in 3 days" / "in a week", "next week" (next Monday), "this weekend", month names ("dec 24", "3 december", "the 24th of december"), and "tonight at 7" / "this evening at 6" as pm. The list shows "↻ every Thursday" / "every other Friday". Hint text and README updated.
- Done: Tagalog typed answers ignore accents a keyboard adds (é, ñ) and hyphen vs space ("araw-araw" = "araw araw").
- Tested: full `node tests/run-all.cjs` (all 43 suites pass); to-do unit also in Halifax time.
- Next PC run must verify: APK build; on the phone, add "bins every thursday at 7pm" and check the reminder rings Thursday evening.

## 2026-11-20 15:45 AST (cloud run; the PC was awake but no folder was connected to the session)
- Done: Faith Pray list shows "✓ N× this week" per practice (core practicesThisWeek, Monday start, local time).
- Done: Calm "Soft tick when breathing changes" setting (off by default; settings.tick; WL.tick in shell.js; no tick on the first phase, none while paused).
- Done: Parenting "Your progress" shows the last 10 scores per skill as small bars (skillStats().scores), once a skill has 2+.
- Done: Faith practices get other wordings for their guiding lines each time through (core PRACTICE_LINES / practiceScript / practiceTimes); Scripture, {{TODAY}} steps and the Lord's Prayer stay exact.
- Done: code health: app/www/lib/dates.js (iso, addDays) replaces seven copies; index.html loads it first; tests/dates.cjs.
- Tested: full `node tests/run-all.cjs` (all suites pass, incl. browser suites), plus each touched unit suite in New York and Manila time.
- Next PC run must verify: APK build (new file app/www/lib/dates.js is copied with app/www); hear the Calm tick on the phone (volume is soft, 0.06 gain) and that the faith practice variants read well aloud.
