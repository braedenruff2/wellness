# Cloud log

## 2026-11-25 20:10-20:20 AST (same run, continued; APK 0.1.20261126.0018, real key)
- Done 143 (path offers "Back to <previous stage>" after 3 of the last 5 rated sits at a later stage were "Mostly lost in thought"), 142 (Sunday "Your week" names path sits and stage; #me / Home "What's working" says "Meditation: attention mostly steady in N of M sits" instead of the stress line when he trains the mind). 142 wasn't claimed separately (my own follow-up task, nobody else had it).
- Tested: full suite, 68 suites, none skipped, at f73021f (this APK's code); calm + me unit in 4 zones.
- Check on the phone: after a few sits, About you > What's working starts with "Meditation: ...".

## 2026-11-25 19:40-20:10 AST (cloud run; PC reachable; APK 0.1.20261126.0005, real key, cert 6795e499...)
- Cross-reviewed Gemini's 05fb17c..3efdf32 (tasks 99-101, 123, 124, 134, 136, 137): sound, nothing to fix.
- Done 141: Calm meditation path. #calm asks once what Calm is for (feeling calmer / training the mind; switch in the Calm settings card). With "train": a path card (stage N of 5, sits and steadiness, a tip from the last sit's obstacle, "Move on" after 6+ sits with 3 of the last 5 "Mostly steady", any stage selectable) and the stage sit leads the today card and Home once a day from 05:00. Sits: count, follow, note, change, open; 10/15/20/30 min (remembered, default 20); no stress ratings; afterwards "How steady was your attention?" + "What got in the way?" saved on the session (no "Did it help?"). Activity sends focus/hind and a daily calm/aim; pc summary + weekly-plan prompt use them. Link's log lists each part's daily setting once (it kept only one target overall).
- bug: a new local name in pc summarize (`per`) shadowed the per-part events dict, blanking every later part / cause: my first version / fixed before commit / test: test_pc summary checks.
- Tested: full suite, 68 suites, none skipped (at 7e4ab0c + the e2e-length selector fix); calm unit in 4 zones; e2e-path; a11y (1.0/1.3, light/dark/night).
- Check on the phone: Calm shows "What do you want from Calm?"; pick "Training my mind": Counting breaths 20 min leads; after a sit, the attention and "got in the way" chips save.

## 2026-11-25 17:00-17:15 AST (same run, continued as run2; APK 0.1.20261125.1912, real key)
- Done 120+122 (hint kind kept with wrong answers; lesson end "Watch for next time"; weekly summary hints), 126 (a11y for #tl-watch and #c-how), 128 (weekly plan prompt uses Calm "helped"), 129 (Calm list: never-helped practice last), 130 (#me "What's working"). 127 dropped (covered). Added 126-134.
- Tested: full suite (67 suites, none skipped) at a63c7c7 and at da7893c (this APK's code).
- Check on the phone: a Tagalog lesson with a word-order or linker slip ends with "Watch for next time"; About you shows "What's working".

## 2026-11-25 16:10-17:00 AST (same run, continued as run2; APK 0.1.20261125.1901, real key)
- Done 118 (🐢 slow conversation line), 111 (after 5+ "Not really", the daytime suggestion is the mindful walk), 119 (a11y checks for today's UI: all pass), 125 (shuffle explainer until done once), 121 (advice/plan summary: which Calm practices helped, "Not really" run). Dropped 115 and 117 (already in the app). Added 119-125.
- Tested: full suite (67 suites, none skipped) at d06a704 and at 23f0c74 (this APK's code).
- Check on the phone: Calm after 9 pm shows "New: a slow game of picturing..." on the shuffle card; Tagalog conversation lines have a 🐢 button.

## 2026-11-25 15:45-16:10 AST (same run, continued; APK 0.1.20261125.1850, real key)
- Done 107 (guard: fake next-week ids must be 2090+; another Claude run had claimed 107 at 18:43 UTC without pushing work, this one finished it: drop that claim), 110 (linker hint), 112 (Halifax-time unit runs: 67 suites), 113 (review example sentence), 114 (Your words: right N of M, Practise these). 116 dropped (brokennights exists). Added 114-118.
- Tested: full suite at the same code (a90e315 before rebasing onto the claim commit), 67 suites, none skipped.
- Check on the phone: Tagalog > Your words > Practise these; typing "gusto ko mag-aral ng Tagalog" says "Almost: add the linker -ng (kong)".

## 2026-11-25 15:30-15:45 AST (same run, continued; APK 0.1.20261125.1841, real key)
- Done 105 (Calm weighs his own before/after ratings, 2+ rated), 106 (Calm list "Helped N of M times"), 108 (plan calm.prefer only real ids), 109 (Tagalog pronoun-second hint). Added tasks 110-113.
- Tested: full suite at 0caef80, 59 suites, none skipped.
- Check on the phone: Calm list shows "Helped 1 of 3 times" under practices with 2+ answers; Tagalog: typing "bakit umiiyak siya" says short words like siya go right after the first word.

## 2026-11-25 14:05-15:30 AST (cloud run; PC reachable; APK 0.1.20261125.1823, real key, cert 6795e499...)
- Cross-reviewed Gemini since 23 Nov (tasks 57-98 and the 25 Nov feature batch): sound. Checked the new content for accuracy: Calm goal research note (cyclic sighing ~5 min/day; ~13 min/day mindfulness over 8 weeks) matches published studies; push-up age norms are in line with CSEP's; the plank "age norms" have no published source behind them (label says "general reference"); Parenting "What to teach now" list reads fine.
- bug: main's suite failed (tagalog e2e "next week downloads") / cause: the real week 2026-11-25 landed (PC lesson job, 13:11) and the test faked a "new" week with that same id, now bundled / fixed: the fake week uses 2099-12-30 / test: tagalog e2e (task 107 adds a guard).
- Week 2026-11-25 (written on the PC): reviewed every sentence; fixed "manga" -> "mangga" (mango), one dialogue line now matches what the child can do; added 2 exercises per lesson (lesson 4: 3) with more typing and longer sentences, ang/ng with -um- verbs. checkPack + build-packs; pushed early (2eb2dee) so phones get it.
- Done 102-104 (see cloud-plan.md).
- Tested: full suite (59 suites, none skipped) at 2eb2dee, 8214de4 and the final rebased head; per-suite runs after each change.
- Check on the phone: Calm after 9 pm shows "Picture-word shuffle" (and the "didn't help much" line after 3+ "Not really"); Tagalog week 2 downloads (7-8 exercises a lesson); a typed answer in other accepted words shows "The lesson's version".

## 2026-11-23 15:40-16:25 AST (first run, continued; a second Claude run ("run2") is active and takes tasks from the bottom)
- Done 54: Move 2 or 3 workouts a week (Setup chips; Today offers 2 once after 2 busy weeks of the last 3; Not now = 4 weeks). run2 then sent the setting to the activity log/prompts.
- Done 52 (e2e only, no bug), 53 (<summary> openers were 22 px: now 44 px everywhere; tests/e2e-a11y-new.cjs), 51 (Faith settings "Save my journal as text"; Sync.mimeFor so Android saves .txt as text/plain), 43 (Calm length chips per session, e2e-length), 46 ("Sore from last time?" on Move 1-3 days after a workout; coach lines; activity + summary).
- Tested: full suite after each, 58 suites pass, none skipped.
- Check on the phone: Move the day after a workout shows "Sore from last time?"; Calm start screens have length chips; Faith settings > Save my journal as text lands in Downloads as .txt.

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
