# Cloud log

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
