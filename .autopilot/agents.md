# Two agents, one repo (Claude and Gemini)
Both autopilots work on `main` of braedenruff2/wellness. These rules keep them from colliding. Both must follow them.

## Who can do what
Either agent can take any task or improve any part of the app, by claiming it first (below). The only limits are
access, not ownership:
- Building the APK (`dist/`) needs the signing key (`faith.keystore`), and writing the weekly Tagalog lessons or answering queued app
  requests needs the owner's data. Both live in his private Google Drive folder. Any agent that can read that
  folder (via the Drive connector / `gdrive` CLI) builds and ships `dist/Wellness.apk`, `dist/version.json`, and
  `dist/version.txt` at the end of its run whenever `app/www/`, `android/`, or `modules/` changed since the last build
  (always download `faith.keystore` outside the repo, verify cert SHA-256 `6795e499...`, 16 KB align `.so` libs, verify
  with `apksigner`, and delete the local keystore copy immediately after signing).
- Never commit `dist/` unless you built it with the real key. Never commit `faith.keystore`.
- Two agents changing the same file at once is the main risk: claim the task, keep commits small, push often.
Tasks in cloud-plan.md are tagged `[any]` unless they need the private folder (`[drive]`).

## Claims (so nobody does the same task twice)
- Each agent has its own claims file: `.autopilot/claims-claude.md`, `.autopilot/claims-gemini.md`. Never edit the other's.
- Before starting a task: add `- <task id> | <ISO time>` to your file, commit, push. Then check the other agent's file:
  if they claimed the same task earlier, drop yours.
- Claim only what you are starting now: at most ONE open claim at a time (claim the next task when this one is done),
  so the other agent always has work.
- A claim older than 8 hours is void. Remove your own claim when the task is done (mark it done in cloud-plan.md).

## Logs
- Claude: `.autopilot/cloud-log.md`. Gemini: `.autopilot/log-gemini.md`. Append only to your own.
- Technical only. The repo is public: nothing personal, ever.

## Every push
1. `git fetch origin && git rebase origin/main` (on a conflict, keep both changes where they fit together; if they
   don't, take theirs and redo yours on top). Never force-push, never rewrite pushed history, never delete branches you didn't make.
2. Run the FULL suite after the rebase: `NODE_PATH=$(npm root -g) node tests/run-all.cjs`. It must say
   "all N suites passed" with NO "skipped" lines (Playwright, Java and Python must be installed; see cloud-plan.md).
3. Small commits, message starting with `[claude]` or `[gemini]`.
4. If you can't run the whole suite (something won't install), push to your branch instead (`gemini-work` or
   `claude-work`), never to main. The other agent merges it after running the full suite.

## Cross-review
Start each run by reading the other agent's commits since your last run (`git log --author` or the `[name]` prefix).
If you find a real bug, fix it with a test (claim it first), or add a task for it. Don't rewrite their
work for style.

## Shared rules (from cloud-plan.md "Rules")
Public repo: no personal data, keys or keystores; never a child's name or birthday (write `{child}`). Faith: public-domain
Scripture only (WEB), never speak as God, no invented quotes. Health/fitness: general guidance, nothing medical; Calm is
not therapy. Tagalog: natural, correct everyday Tagalog only; never invent words. No paid services, API keys, accounts or
required network for core use. Never create accounts, post, email or message anyone; spend $0.
