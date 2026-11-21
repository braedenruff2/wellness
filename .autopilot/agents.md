# Two agents, one repo (Claude and Gemini)
Both autopilots work on `main` of braedenruff2/wellness. These rules keep them from colliding. Both must follow them.

## Lanes (who may change what)
| Area | Owner |
|---|---|
| `android/`, `pc/`, `tools/build-apk.sh`, `dist/` (APK builds: only Claude has the signing key) | claude |
| `modules/tagalog/packs/`, `app/www/modules/tagalog/tl-packs.js` (lesson weeks; need private data) | claude |
| `modules/faith/content*`, `modules/faith/source/` (Scripture text) | claude |
| everything else in `app/www/`, `modules/*/tests/`, `tests/` | either, by claim |
| `.autopilot/cloud-plan.md` task list | either: only edit your own task lines and add new tasks |
Tasks in cloud-plan.md carry an owner tag: `[claude]`, `[gemini]` or `[any]`. Take only your own or `[any]`.

## Claims (so nobody does the same task twice)
- Each agent has its own claims file: `.autopilot/claims-claude.md`, `.autopilot/claims-gemini.md`. Never edit the other's.
- Before starting a task: add `- <task id> | <ISO time>` to your file, commit, push. Then check the other agent's file:
  if they claimed the same task earlier, drop yours.
- A claim older than 8 hours is void. Remove your own claim when the task is done (mark it done in cloud-plan.md).

## Logs
- Claude: `.autopilot/cloud-log.md`. Gemini: `.autopilot/log-gemini.md`. Append only to your own.
- Technical only. The repo is public: nothing personal, ever.

## Every push
1. `git fetch origin && git rebase origin/main` (on a conflict in a file outside your lane, take theirs; inside your lane,
   merge both changes sensibly). Never force-push, never rewrite pushed history, never delete branches you didn't make.
2. Run the FULL suite after the rebase: `NODE_PATH=$(npm root -g) node tests/run-all.cjs`. It must say
   "all N suites passed" with NO "skipped" lines (Playwright, Java and Python must be installed; see cloud-plan.md).
3. Small commits, message starting with `[claude]` or `[gemini]`.
4. If you can't run the whole suite (something won't install), push to your branch instead (`gemini-work` or
   `claude-work`), never to main. The other agent merges it after running the full suite.

## Cross-review
Start each run by reading the other agent's commits since your last run (`git log --author` or the `[name]` prefix).
If you find a real bug, fix it with a test (inside your lane) or add a task tagged for its owner. Don't rewrite their
work for style.

## Shared rules (from cloud-plan.md "Rules")
Public repo: no personal data, keys or keystores; never a child's name or birthday (write `{child}`). Faith: public-domain
Scripture only (WEB), never speak as God, no invented quotes. Health/fitness: general guidance, nothing medical; Calm is
not therapy. Tagalog: natural, correct everyday Tagalog only; never invent words. No paid services, API keys, accounts or
required network for core use. Never create accounts, post, email or message anyone; spend $0.
