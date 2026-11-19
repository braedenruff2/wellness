# Wellness (Braeden's personal app)

One phone app with separate parts for what he cares about, built and improved by Claude autopilot.
Started 18 Nov 2026 as "Faith Companion"; became this app the same day at his request.

## Install on your Pixel
- `dist\Wellness.apk`: copy it to the phone (Google Drive, USB) and tap it; allow installing from that app.
  Once lesson updates are on (below) the newest APK is also at github.com/braedenruff2/wellness/raw/main/dist/Wellness.apk.
- Updates install over the top and keep everything. On the PC: open `app\www\index.html` in Chrome to try it.

## Weekly Tagalog lessons (one-time setup)
Double-click **Turn on lesson updates.bat** once. It makes a public GitHub repo `wellness` and pushes this folder every
15 minutes. Every Wednesday at noon (when your Claude usage resets) a scheduled Claude run writes next week's 7 lessons
into `modules\tagalog\packs\`; the app downloads them when you open Tagalog. To tailor them, save Tagalog > Lessons &
sharing > "Send my week" on the phone and put the file in `Desktop\wellness-progress\` before Wednesday noon.
Nothing personal goes to GitHub: journal, workouts, to-dos and progress stay on the phone.

## What's in it
- **Home**: today across everything (faith day, workout, calm practice, Tagalog lesson, to-dos due), with advice.
- **Faith** (`modules/faith`): the 120-day guided path (WEB Scripture), guided prayer read aloud, 11 Pray-now practices,
  journal / awe moments / prayer list, look-backs, "walk it again", daily reminder. Its own README: modules/faith/README.md.
- **Calm** (`modules/calm`): one-minute reset, slow and box breathing with a breathing circle, body scan, 5-4-3-2-1
  grounding, mindful feed, kindness practice, sleep wind-down, quiet timer; stress before/after; minutes per week.
- **Move** (`modules/workout`): his Google Sheet routine, ported and improved: 3 full-body days A/B/C that rotate
  (each muscle 2-3x a week; a skipped day never leaves a gap), supersets with transition and rest timer (beep +
  vibrate), "last time" numbers and progression ("ready for harder" with the 10 lb pair; "go up to N lb" once set to
  adjustable dumbbells), session clock, progress per exercise, week dots, coaching line, import of the sheet's Log CSV.
- **Tagalog** (`modules/tagalog`): weekly packs of 7 lessons (words with Filipino voice, conversation, grammar,
  family tip, 4 exercise types), spaced review of every word, progress, "Send my week".
- **To do** (`modules/todo`, on Home): quick add with plain words ("call Mom tomorrow", "stretch every day"),
  repeating tasks, overdue nudges.

## For Claude (how it's built)
- `app/www/`: shell.js (router, Home, look, speech incl. `fil-PH`, backup of every part), lib/guided.js (voice-guided
  session engine), modules/<id>/ (each part's code; own storage key `fc.v1` / `wl.<id>.v1`).
- `modules/<id>/`: each part's sources, tools and tests, kept separate. Faith content: `modules/faith/tools/build-content.cjs`.
  Tagalog packs: `modules/tagalog/packs/*.json` -> `node modules/tagalog/tools/build-packs.cjs` (checks the format).
- `android/` WebView shell (TTS with language switch, keep-awake, backup to Downloads, file picker, reminder);
  `tools/build-apk.sh` builds dist/Wellness.apk (key android/faith.keystore: keep it, it's not in git).
- Tests: `node tests/run-all.cjs` runs every module's tests (unit in three time zones, browser tests with Playwright)
  plus the shell's. Browser tests never touch the internet.
