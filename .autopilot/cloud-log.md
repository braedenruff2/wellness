# Cloud log

## 2026-11-27 04:42-05:15 AST (new run after the usage reset; APK 0.1.20261127.0927, real key, cert 6795e499...)
- Cross-review of Gemini 122f7ae..eb3301e with an independent subagent. Fixed with tests:
  - bug: an automatic Parenting scenario that finished while an advice request was running cleared the advice's saved job and spinner (could be sent twice, lost on restart) / cause: start() set S.pending = null and finish() for any request / fixed: each request clears only its own job and spinner; no auto start while typing on #coach / test: modules/coach/tests/e2e-auto.cjs (fails without the fix) (task 315).
  - bug: a paired PC that never answers (Drive sync off) got an automatic scenario request every 15 min all day / fixed: back off 1 h, 3 h, max 3 a day; manual Generate still works / test: e2e-auto (315).
  - bug: Move's coach line "Not for me?" keyed by program day hid every later line on that day (incl. "Very sore today") for good / fixed: keyed by the line (numbers ignored), hidden 14 days / test: modules/workout/tests/e2e-coachfit.cjs (316).
  - No way back from a "Not for me" tap after the UI stopped showing marked items: Settings > "Hidden as not for me (N)" (collapsed) with Bring back (317; unit + modules/me/tests/e2e-hidden.cjs).
  - bug: PC is_usage_limit took "file size limit reached" / tokens / recursion limits for running out of Claude usage (Gemini until the reset) / fixed: NOT_QUOTA_RE unless the message names usage/rate/429/resets / test: test_pc (318).
  - bug: the 600-answer cap dropped old "Not for me" marks (hidden items came back) / fixed: oldest quick answers go first / test: me unit (319).
- Second independent review (of this run's changes): bug: "Finish and send" (#coach/real) left the advice spinner up after the answer came and never opened it / cause: here() matched only #coach / fixed: here() takes #coach/real; a manual request whose spinner was cleared by another still shows its result or error; an advice job older than 15 min no longer hides the draft line; old per-day Move marks not listed as hidden; Tagalog tips not called parenting tips / test: e2e-draft (fails without the fix), me unit. Done 320, 323, 324 (tests; no bugs found).
- bug: with text in Past practice search, New scenario left Get advice usable and both requests went out / fixed: one request at a time (busy() toast) / test: e2e-auto (326). Done 321 (PC reads a reset time in the zone the message names), 322 (a dateless cloud meal plan asked last week doesn't fill this week), 327 (auto scenario back-off kept across app restarts). Added 326-331.
- Done 330 (readable names in the Hidden list), 333 (e2e: a PC job that never finishes), 328 (path tips e2e for every obstacle; the Restless tip on counting breaths said "go back to counting": now "count to four and start again"). 331 dropped (storage-size covers the sync file).
- Done 332: a Faith day's Think/Practice marked "Not for me" in one walk of the path shows again on the next walk (key day:N:what@rR); e2e-roundfit. 329 dropped (covered by the tagalog unit).
- Done 336 (Home Parenting card's Finish and send is a 44 px button; checked at 320 px / 1.3), 337 (Hidden list: newest 50 + Show all). Added 334-337.
- Done 334: a note for the autopilot typed but not saved comes back next time (tag kept, Clear it); e2e-notes-draft.
- Done 338: tests/validate-fuzz.cjs (every store's restore check fed damaged copies of a month: never throws, stays usable, stable); nothing found. Added 338-341.
- Done 342: Parenting "What to teach now" has "Falling asleep in the crib with you nearby" (9-24 months; a gentle step-by-step approach, general guidance). 339, 340 dropped (exist).
- Checked, not a bug: body.hide-bar after leaving an open workout (route() resets body classes).
- Done 325: an unsent Parenting question (draft kept as he types) says "Saved on this phone, not sent yet" on #coach, and Home's Parenting card adds "Finish and send" (#coach/real, Get advice focused); e2e-draft.
- Added tasks 320-325.
- Tested: full suite at the APK's commit (106+ suites, none skipped).
- Check on the phone: Settings > Hidden as not for me (only appears once something is marked); Parenting: start typing a real situation, nothing interrupts.

## 2026-11-26 21:15-21:35 AST (same run, continued; APK 0.1.20261127.0131, real key, cert 6795e499...)
- Done 293 (Tagalog weekly summary: slips per kind + still wrong), 295 (an unread note takes a second tap to delete), 294 (Home Cooking card at its fullest at 320 px), 296 (Filipino recipes show their Tagalog words with 🔊), 297 (offline plan: no 45+ min dish on a workout day, weeks differ), 308 (the soft bell dips background noise), 300 (bug: AI recipes piled up forever; each AI plan keeps the plan's + newest 40; Cooking pages in e2e-perf). 292, 307 existed.
- Tested: full suite at 6b10c2a (103 suites, none skipped; this APK's code).
- Check on the phone: Cooking > a Filipino dish > How to make it > In Tagalog 🔊; interval bell over brown noise.

## 2026-11-26 21:00-21:15 AST (same run, continued; APK 0.1.20261127.0111, real key, cert 6795e499...)
- Done 289 (Cooking: six Filipino family dishes, {child}'s portion before the fish sauce / salty mix; pork cuts match pork), 290 (e2e: a call pauses the Quiet timer and a guided prayer), 288 (e2e: extra linker in lesson 2 -> hint + Watch for next time).
- Tested: full suite at 964af4b (103 suites, none skipped; this APK's code).
- Check on the phone: Cooking > Week: the Filipino dishes come up in the plan; recipe steps read well.

## 2026-11-26 20:15-21:00 AST (same run, continued; APK 0.1.20261127.0057, real key, cert 6795e499...)
- Done 258 (Tagalog stats/dueCards/weeklySummary across DST in 4 zones; lessonsDone on an earlier day counts only lessons done by then), 265 (Calm exact timer: 75 s = 1:15, 120 min cap, plain "At least 10 seconds." / "A sit is at least 1 minute.", cleared or too short -> back to the chip), 266 (Cooking plan/fridge/shopping always use today; only the food log uses the earlier day), 267 (photo answers: amount kept, damaged answers render safely, nothing usable says so), 272 (notes for the autopilot: "Read by the autopilot" via `cloud-answer.cjs ack-notes` -> notes-ack row), 275 (audio focus while in-session; a ringing/ongoing call pauses a prayer or sit), 277, 280 (Mama cooked: one tap + inline optional field, no window.prompt), 281 (to-dos tidy on app start), 283, 259, 285, 286 (extralinker slip kind), 287 (note sheet says where it goes; Settings shows unread notes). Also: the no-linker hint after hindi when the rest differs.
- Independent review of 260-281 (subagent) -> 282: sameFood false negatives (blueberries/berries, garlic cloves, "onion, diced", sweet onion) fixed with specific different-food pairs; recipe name "canned tuna" kept (Bought ticks); Week tab "Today" from the real date; exact-timer note hidden on Begin / chip.
- Dropped as existing or not applicable: 268, 269, 271.
- Tested: full suite at 10cb473 (102 suites, none skipped; this APK's code).
- Check on the phone: a call during a Calm sit pauses it (and his music ducks during a sit); Cooking > Mama cooked > the field; Settings > Sync line shows notes not read yet.

## 2026-11-26 19:43-20:15 AST (new run after the usage reset; APK 0.1.20261127.0010, real key, cert 6795e499...)
- Done 260: Tagalog typed answers with an extra -ng on a short word ("Hindi akong pagod" for "Hindi ako pagod") get "Almost: no linker here (ako, not akong, after hindi)..." (linkerHint, kind linker). Week 2026-11-25 lesson 2 also accepts "hindi pa siya tulog" / "nakakatulog" for "She hasn't slept yet".
- Done 244 (run2's claim had ended with that run): tests/lib/year.cjs makes to-dos, Parenting tip answers + Not for me, Cooking and autopilot notes too. bug: a ticked repeating to-do's done copy came back from a restore with a new `at` field / cause: TodoCore.complete's copy had no `at`, validate adds it / fixed: the copy carries at: null / test: todo unit + e2e-backup-year (now names the first differing item).
- Cross-review of Gemini b22758e + PC upload 9c849b5 (Cooking, notes, noise, exact timer, camera chooser) with an independent subagent; fixed (tasks 261-263, units for each): a log day in an earlier week replaced this week's meal plan (made / Mama cooked marks lost); ingredient matching by substring (peanut butter = butter, chicken broth = chicken, tomato sauce = tomato) now whole words with describing words / cuts; a restore kept the 40 OLDEST AI recipes and dropped a waiting photo scan; a null AI ingredient threw (button stuck on "Asking Claude..."); Calm alarm label "1.6666666666666667 min"; camera never offered on Android 11+ (no <queries>), no write grant for the camera app, and a photo returned as the result uri was deleted (tests/android-camera.cjs); toddler portions (eggs cooked through, light tuna, low-sodium broth, cucumber strips) + cook-plan prompt lists choking hazards.
- Tested: full suite at a2c15cd (99 suites, none skipped; this APK's code).
- Check on the phone: Cooking > Fridge > photo: does the chooser offer the camera, and does the photo arrive? Tagalog: type "Hindi akong pagod" in lesson 2 -> the no-linker hint.

## 2026-11-26 17:05-17:25 AST (run2, continued; APK 0.1.20261126.2051, real key, cert 6795e499...)
- Done 247 (tests/e2e-a11y-names.cjs: every control on 20 pages has a name TalkBack reads; none missing), 248 (lessons check on a bad connection: old lessons kept; the message now says plainly "does this Wi-Fi need a sign-in?" / "no internet?" / HTTP n; a non-index answer is refused; e2e-fetchbad), 250 (cloud-answer: a year of data keeps the weekly-plan prompt ~4.6 KB). 252 existed. Added 247-252.
- Tested: full suite after rebase (87 suites, none skipped; this APK's code).
- Check on the phone: Tagalog > Settings > Check for new lessons on a café Wi-Fi shows the plain message.

## 2026-11-26 16:35-17:05 AST (run2, continued; APK 0.1.20261126.2041, real key, cert 6795e499...)
- bug: after "Restore from Drive" (or a backup file) while a sync write was on its way, Drive kept the old data for up to 30 min / cause: nothing synced after a restore; the in-flight write carried the old snapshot / fixed: shell.js syncAfterRestore() runs a sync right after any restore (queued behind an in-flight write) / test: e2e-sync +2 (fails without the fix).
- Done 240, 241 (e2e-narrow: 20 pages at 320 px / 1.3 with a year of data), 242 (e2e-perf also times history, Faith journal, Pray now). 243 and 245 existed.
- Tested: full suite after rebase (85 suites, none skipped; this APK's code).

## 2026-11-26 16:00-16:45 AST (run2, continued; APK 0.1.20261126.2016, real key, cert 6795e499...)
- Done 233 (tests/e2e-perf.cjs: a year of data at CPU 4x: Home ~55 ms, every card and page well under budget; tests/lib/year.cjs now shared with storage-size), 232 (tests/e2e-backup-year.cjs: a year's backup restores exactly), 246 (tests/e2e-backup-old.cjs: an older version's backup restores, every part opens). 231/237 existed; 239 dropped. Added 239-246.
- bug: restoring a backup dropped each Tagalog card's last-review day / cause: validate() didn't copy card.last / fixed: kept when a date / test: unit + e2e-backup-year.
- bug: restoring a backup added an empty "removed" list to every workout session (the restored file differed from the phone's) / cause: validate() always wrote removed / fixed: only when non-empty / test: unit + e2e-backup-year.
- Tested: full suite after rebase (85 suites, none skipped; this APK's code).

## 2026-11-26 15:50-16:00 AST (run2, back from Singing Helper; APK 0.1.20261126.1959, real key, cert 6795e499...)
- Done 234 (a11y: Slips > Practise these run + finish), 235 (slipSet leaves out exercises a corrected pack no longer has: unit), 236 (e2e: undoing a rest day, also Home's "Rest today (tired)", plans the workout again on Home), 238 (unit: repeating to-dos done late keep their rhythm, also the 31st, weekdays, DST). Added 231-238.
- Cross-review: Gemini d04e484 (Gemini CLI path) and bb703a1 (Antigravity CLI `agy` with stream-json as the PC backup): read; no bug found in the code; the agy flags themselves can't be checked here.
- Tested: full suite at 9140705 (82 suites, none skipped; this APK's code).
- Check on the phone: Tagalog > Your words > Slips to watch > Practise these.

## 2026-11-26 14:42-15:20 AST (run2, a second run alongside the 12:37 one; no APK: the other run builds)
- Done 230 (tests/e2e-narrow.cjs: Home at 320 px, text 1.3, light/dark/night, every card in its fullest state; nothing overflows or is clipped), 228 (modules/tagalog/tests/perf.cjs: slips/practiceSet with 2000 answers and 4 packs ~1 ms), 227 (Your words > Slips to watch > "Practise these": #tagalog/slips runs those exercises once via TagalogCore.slipSet; answers recorded, no box/due change). My 229 duplicated the other run's (its claim wasn't pushed in time); theirs kept.
- Cross-review: no Gemini commits since its last log entry; no gemini-work branch.
- Tested: full suite at 844c1b2 (82 suites, none skipped).
- Check on the phone (next APK): Tagalog > Your words > Slips to watch > Practise these.

## 2026-11-26 13:20-14:35 AST (same run, continued; APK 0.1.20261126.1834, real key, cert 6795e499...)
- Done 217 (Home's Calm card asks "What do you want from Calm?" until answered; a done day keeps the done card), 218 (the live session clock leaves out breaks over 90 min: WorkoutCore.activeTime; history has no length, so only the clock), 215 (weeklySummary hints carry `about`, HINT_ABOUT), 216 (no false hints across every bundled pack), 219 (Your words: "Slips to watch"), 220 (a11y), 221 (practice tie-break), 213 (rough-day 10-min sit also in Home's today list). Added 215-222 (222 dropped: exists).
- Independent review (subagent) of today's diff: bug: a doubled letter ("sallamat", "kumainn", "umagaa") got the verb-form hint / cause: redup accepted any doubled letter / fixed: one-letter copies only a vowel at the root start, CV copies only at the root start or after -um- / test: unit. Also "after kailangan" now found with the linker (kailangang). Its second finding (session clock vs "Log for an earlier day") can't happen: the clock is hidden in that mode; e2e-break pins it.
- Tested: full suite at 308cb2a (80 suites, none skipped; this APK's code).
- Check on the phone: Home's Calm card shows the "What do you want from Calm?" chips.

## 2026-11-26 12:37-13:20 AST (new run; APK 0.1.20261126.1716, real key, cert 6795e499...)
- Done 209 (Your words: "missed again once / N×"). Tagalog typed answers: a dropped prefix hyphen before a vowel is right ("magaral" = "mag-aral", "pagibig"; a doubled word like "araw-araw" keeps its break); the verb with an extra or missing repeated syllable gets "Almost: after gusto the verb stays plain: mag-aral..." (TagalogCore.aspectHint, hint kind 'aspect', "Verb form" under Watch for next time).
- Also wrote 195/206/207 without claiming them; Gemini had claimed and shipped them meanwhile, so mine were dropped in the rebase (theirs kept). Lesson: claim every task first.
- Cross-review: Gemini's 190 (calm-sit.js), 195 (wake lock), 206, 207, 211 (lib/dark.js), inert #tabs/#logday: read, no bugs found; full suite passes on top.
- Tested: full suite at e52f658 (77 suites, none skipped; this APK's code).
- Check on the phone: Tagalog typed answer "gusto kong magaaral ng tagalog" shows the verb-form hint.

## 2026-11-26 03:00-12:20 AST (same run, continued; APK 0.1.20261126.1617, real key, cert 6795e499...)
- Done 197, 203-205 (e2e: keyboard focus under the dark cover, bell tones, leaving a dark sit for another screen; Faith settings has the late-night dark-screen choice), 198 (Home: "Check-in ✓ · change" -> #me/checkin), 210 (three low-energy check-ins -> guidance key lowenergy), 208 (two late, sleepy, wandering sits -> #c-path-late suggests his steadier time). Added 203-211.
- Tested: full suite at 594ab93 (77 suites, none skipped; this APK's code).
- Check on the phone: Home after the check-in shows "Check-in ✓ · change".

## 2026-11-26 02:45-02:55 AST (same run, continued; APK 0.1.20261126.0654, real key, cert 6795e499...)
- Done 199 (a word still missed when going through the misses again counts toward Hard words via card.againMiss; no box/due change; kept by validate), 201 (Settings > Backup: "Which parts use it" breakdown). Added 203-206.
- Tested: full suite at f53caa5 (77 suites, none skipped; this APK's code).

## 2026-11-26 02:25-02:45 AST (same run, continued; APK 0.1.20261126.0644, real key, cert 6795e499...)
- Took Gemini's open [any] tasks 145, 146, 147 (no Gemini commits or claims since 22:28): a11y for the path's "Back to" offer; Calm path unit tests across DST and mixed UTC offsets; journal e2e for earlier-day entries and the gentle note. No fixes needed. Also 193 (earlier-day logging across midnight: e2e), 200 (the day after a "Tired" rest day: "as planned, or two sets of each"), 202 (a year as a backup/sync file: 3.1 M chars; Java 4 MB round-trip).
- Independent review (subagent) of today's changes found 3 bugs, fixed in 95e484a: bug: from Home's rough-day link, tapping 20 then 10 saved 10 as his sit length / cause: the guard looked for #c-rough, not drawn at 10 min / fixed: roughDay() / test: e2e-rough. bug: Faith "Carry on" at night sized the dark wait from step 0 / fixed: player.from set before keepAwake. bug: with TalkBack a double-tap on the dark cover pressed Pause underneath / fixed: the cover takes focus, #view inert + aria-hidden while dark / test: e2e-shell.
- Tested: full suite at 28248da (77 suites, none skipped; this APK's code); storage-size and java after 57b2126.

## 2026-11-26 01:50-02:25 AST (same run, continued; APK 0.1.20261126.0622, real key, cert 6795e499...)
- Second singing-helper turn in between (Claude Autopilot logs\singing-helper.md).
- Done 191 (Your week: "..., steadiest in the morning"), 192 (dark-screen hint only for the first 3 sits/timers, counted from sessions), 179 (e2e: Home rest days read as rest days he chose), 194 (bug: Android Back during a dark sit or prayer went back in history and ended it / fixed: MainActivity.goBack asks window.FCBack first, which only lights the screen / test: CalmAlarmTest.backHandled, e2e-shell), 196 (README dark-screen summary). Dropped 189. Added 193-196.
- Tested: full suite at 1a353b5 (77 suites, none skipped; this APK's code).
- Check on the phone: during a dark Calm sit press Back once: the screen lights, the sit goes on; press Back again to leave.

## 2026-11-26 01:35-01:50 AST (same run, continued; APK 0.1.20261126.0546, real key, cert 6795e499...)
- Done 165 (Calm sit settings under "Sits and the quiet timer"), 183-185 (a11y for the review repeat; blocked storage in Settings; bad lengths in #calm/s/<id>/<min>: no fixes needed), 186 (path note points long sitters to Quiet sit), 187 (weekly-plan prompt knows the sit options and the time-of-day note), 188 (late-night practices go dark: e2e). Added 186-192.
- Tested: full suite at 107963c (77 suites, none skipped; this APK's code); test_pc after 920633e.

## 2026-11-26 01:10-01:35 AST (same run, continued; APK 0.1.20261126.0533, real key, cert 6795e499...)
- Done 178 (every route change ends the dark screen), 177 (Tagalog "Dark screen while listening" setting), 168 (Settings > Backup: "Saved on this phone: about N% of the space", warning from 70%), 175 (Tagalog review ends with "Go through these again" for the missed words: extra rounds, no rescheduling), 180 (rough day: Home's Calm card offers the sit at 10 min via #calm/s/<id>/<min>, his length unchanged), 181 (Faith dark wait follows the current line; WL.darkScreen takes a function), 182 (a11y for the rough-day cards). Added 180-185.
- Tested: full suite at a06d462 (77 suites, none skipped; this APK's code).
- Check on the phone: Tagalog review with misses: "Go through these again"; Settings > Backup shows the space line.

## 2026-11-26 01:00-01:10 AST (same run, continued; APK 0.1.20261126.0509, real key, cert 6795e499...)
- Done 174 (Home's Move card: "Rest today (tired)" after a check-in with sleep under 4 h or energy Low; Not for me hides it), 169 (bug: Tagalog "Listen while walking" had no keepAwake, so the screen locking stopped the voice / fixed: walkScreen() keeps it on and dark after 15 s, off on stop, end or any route / test: tagalog e2e + e2e-walk). Dropped 176. Added 177-179.
- Tested: full suite at 5b284fc (76 suites, none skipped; this APK's code).
- Check on the phone: Tagalog lesson > Listen while walking: screen goes black after 15 s and the voice carries on.

## 2026-11-26 00:30-01:00 AST (same run, continued; APK 0.1.20261126.0457, real key, cert 6795e499...)
- Rotation turn on singing-helper in between (PC folder; see Claude Autopilot logs\singing-helper.md).
- Done 149, 173 (a11y for the new Calm and Faith controls), 162 (WL.darkScreen in shell.js shared by Calm sits and Faith guided prayers 21:00-05:00 after 20 s, setting darkPray), 163 (storage: a year of daily sits), 166 (whole Quiet sit e2e), 167 (bug: a sit 23:50-00:10 was filed under the next day / cause: dated at finish / fixed: calm.js sessionTime() uses the start unless logging for an earlier day / test: e2e-rough), 170 (shell e2e for darkScreen), 171 (CalmAlarm.allowedHash + Java test), 172 (stage round-trip unit). Added 167-176.
- Tested: full suite at 2a73c68 (74 suites, none skipped; this APK's code); calm/faith unit in 4 zones; a11y suite after 1c7aa78.
- Check on the phone: a guided prayer after 9 pm goes dark after 20 s (tap shows the words); Pray now has "Dark screen late at night".

## 2026-11-25 23:42 - 2026-11-26 00:30 AST (cloud run; PC reachable; APK 0.1.20261126.0422, real key, cert 6795e499...)
- Cross-reviewed Gemini's ed2262a..c7364ed (validate fix, 138-140, 144 CalmAlarm, #c-recent sit info). bug: CalmAlarm used notification id 7 (Updater's "Wellness updated") and tap request code 8 (TodoAlarm's MainActivity intent, so FLAG_UPDATE_CURRENT could make a to-do reminder open Calm) / cause: copied numbers / fixed: own ids 9 (3ae2994) / test: tests/android-ids.cjs scans every Java file for shared notification ids and MainActivity tap request codes.
- Done 148+152: Calm sits and the quiet timer go dark after 10 s (black overlay + window brightness 0.01 via new MainActivity.dimScreen; tap/Space/Enter shows the time, dark again 10 s later; pause, end, finish and coming back to the app light it), so the phone never needs locking and the voice keeps going; setting "Dark screen during sits and the quiet timer" (on). "Soft bell during sits" every 5/10 min (WL.softBell; none in the last 30 s).
- Done 150 (rough-day line on a path sit; 10 min then isn't saved as his length), 151 (CalmCore.pathWhen: the time of day his sits go best, on the path card), 155 (to-do: "tonight at 12" was 12:00 today, already gone: now midnight; "at midnight" parsed), 156 (pack checks: duplicate options, empty accept entries, a word twice), 157 (Quiet sit: opening and close only), 158 (Home's Calm line is the sit when training the mind), 159 (What's working adds the time of day), 160 (advice/plan summary: sit_times), 161 (recent path sits show the time), 164 (soft-bell edge e2e). Dropped 153, 154 (already covered). Added 157-166.
- Tested: full suite (73 suites, none skipped) at a526eaa (this APK's code); calm/me/todo unit in 4 zones; test_pc.
- Check on the phone: start a path sit: the screen goes black after 10 s and the end bell rings with the screen on; Calm settings has "Dark screen" and "Soft bell during sits"; a sit's start screen has "Quiet sit".

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
