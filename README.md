# Wellness (Braeden's personal app)

One phone app with separate parts for what he cares about, built and improved by Claude autopilot.
Started 18 Nov 2026 as "Faith Companion"; became this app the same day at his request.

## Install on your Pixel
- `dist\Wellness.apk`: copy it to the phone (Google Drive, USB) and tap it; allow installing from that app. You only do
  this once (for a version from 19 Nov 2026 or later).
- **After that it updates itself**: Settings > App updates > "Allow updates" once (Android's "Install unknown apps" switch
  for Wellness). The app then looks for a newer build on your PC (through the PC link, at home) or on GitHub (once
  lesson updates are on), downloads it, and installs it when you leave the app, never during a prayer or calm session.
  Settings > App updates also has "Check now" and "Update now". Everything you've entered is kept.
- On the PC: open `app\www\index.html` in Chrome to try it.

## Weekly Tagalog lessons (one-time setup)
Double-click **Turn on lesson updates.bat** once. It makes a public GitHub repo `wellness` and pushes this folder every
15 minutes. Every Wednesday at noon (when your Claude usage resets) a scheduled Claude run writes next week's 7 lessons
into `modules\tagalog\packs\`; the app downloads them when you open Tagalog. To tailor them, save Tagalog > Lessons &
sharing > "Send my week" on the phone and put the file in `Desktop\wellness-progress\` before Wednesday noon.
Nothing personal goes to GitHub: journal, workouts, to-dos and progress stay on the phone (and, with the PC link, in Desktop\wellness-progress).

## PC link (activity log + Claude on your PC)
Double-click **Set up PC link.bat** once (it shows a code; later, to pair again, **Pair a phone.bat**). On the phone:
Settings > PC link > Find my PC, type the code, Pair. Same home Wi-Fi only.
- The phone then sends what you do in every part (faith days, guided prayers, calm sessions with stress ratings, every
  workout set, Tagalog lessons/answers/reviews, to-dos, parenting practice) to `Desktop\wellness-progress\activity\<date>.jsonl`.
  Journal and prayer text only if you switch that on. The PC link screen lists exactly what is logged.
- **Parenting practice** (the 🧸 tab), **advice** (Home) and **Ask Claude about my answer** (Tagalog) run through
  Claude Code on the PC (`claude -p`, signed in as you, your own plan). Nothing is stored anywhere else.
- Claude's autopilot reads the log every run (`python pc\wellness_pc.py summary 7`) to choose what to build next.
- It starts with Windows (log: `%LOCALAPPDATA%\Wellness\pc.log`) and restarts by itself when Claude updates it.
  Stop: delete `%LOCALAPPDATA%\Wellness\run.on`. **Finish setup (click in the morning).bat** restarts it by hand and
  turns on the GitHub upload every 15 minutes (scheduled task "Wellness upload").

## Voices (Loudbook's, and a Filipino voice for Tagalog)
Settings > Voice. English is read by the voices you built for Loudbook (not Gemini): **Kokoro on the phone** (download
once, 354 MB, from your PC or Loudbook's GitHub release) and, at home, **Loudbook's PC voice** (the natural voice on your
graphics card; the PC link asks Loudbook's PC voice on the same PC, so that has to be set up and running). Default voice:
Nicole (soft, calm), at your speed. **Tagalog** is read by a Filipino voice, Meta's MMS Tagalog model (download once,
114 MB, from your PC: `voices\mms-tgl\`, credit and licence there; personal, non-commercial use). The phone's own voice
reads anything they can't (before the downloads, or if something fails).

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
  family tip, 4 exercise types), spaced review of every word (two-way: once a word is recognised, it comes back
  English first so you practise saying it; a miss sends it back to meaning first), mixed practice (8 exercises from
  finished lessons, most-missed first: something to do while waiting for Wednesday), progress, "Send my week".
- **Parenting** (`modules/coach`): scenarios for your daughter's exact age, you answer, Claude grades against current
  guidance (what went well, what to change, what an expert would do and why, sources), progress per skill. Needs the PC link.
- **PC link** (`modules/link`, Settings): pairing, what's logged, send now, advice from Claude.
- **To do** (`modules/todo`, on Home): quick add with plain words ("call Mom tomorrow", "stretch every day"),
  repeating tasks, overdue nudges. Reminders: end a task with a time ("bins fri at 7pm", "meds 8:30 pm") or set
  one in its ⋯ sheet; the phone notifies at that time even when the app is closed (TodoAlarm.java, exact alarm,
  re-armed after a reboot/update; repeating tasks get each coming day's reminder). The notification has "Done"
  (ticks the task next time the app is open, or at once if it is) and "Snooze 1 hour".

## For Claude (how it's built)
- `app/www/`: shell.js (router, Home, look, speech incl. `fil-PH`, backup of every part), lib/guided.js (voice-guided
  session engine), modules/<id>/ (each part's code; own storage key `fc.v1` / `wl.<id>.v1`).
- `modules/<id>/`: each part's sources, tools and tests, kept separate. Faith content: `modules/faith/tools/build-content.cjs`.
  Tagalog packs: `modules/tagalog/packs/*.json` -> `node modules/tagalog/tools/build-packs.cjs` (checks the format).
- `lib/activity.js`: the activity log, read from each part's saved data; `lib/pc.js` (WL.pc): sync and Claude requests.
- `android/.../Voices.java` + `Speech.java`: Kokoro / MMS Tagalog through sherpa-onnx (Loudbook's engine, `com/k2fsa/...`),
  Loudbook's PC voice through the PC link; the build needs `tools/get-voice-parts.sh` (sherpa-onnx libs, Kokoro small files).
- `pc/wellness_pc.py`: the PC side (pairing, HTTPS pinned at pairing, activity files, `claude -p` jobs, `summary`, voice
  files for the phone, /v1/speak through Loudbook's PC voice);
  tests `pc/test/test_pc.py`; the phone side is `android/.../PcLink.java` (tested against the real server).
- `android/` WebView shell (TTS with language switch, keep-awake, backup to Downloads, file picker, reminder, PC link);
  `tools/build-apk.sh` builds dist/Wellness.apk + dist/version.json (key android/faith.keystore: keep it, it's not in git;
  updates only install over the app with the same key). Updater.java: the app's self-update (PC link /v1/app/*, then GitHub raw).
- Personal words: this folder is a public repo. Content never names his daughter or gives her birthday: write `{child}`
  (faith prayers: `{child|my daughter}`); `lib/personal.js` fills in the name he typed in Parenting setup on the phone,
  or "your daughter" / "Baby" (Tagalog). Applies to new Tagalog packs too. `tests/privacy.cjs` checks the folder against
  `Desktop\wellness-progress\private-words.txt` (outside the repo; one word per line) when that file exists.
- Tests: `node tests/run-all.cjs` runs every module's tests (unit in three time zones, browser tests with Playwright)
  plus the shell's. Browser tests never touch the internet.
