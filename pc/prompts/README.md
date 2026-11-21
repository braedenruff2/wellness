# Prompts for the app's Claude requests

One file per task the phone can ask for (`coach-scenario`, `coach-grade`, `coach-advice`, `tagalog-check`, `advice`,
`weekly-plan`), plus `rules.md`, which every prompt includes. The PC link (`pc/wellness_pc.py`, `prompt_for`) reads
them, fills each `{{name}}` from the phone's input and runs `claude -p` with it. Cloud runs answer queued requests
with exactly the same text, so both paths give the same JSON shape.

## Filling a prompt (what `prompt_values` does)
- `{{child}}`, `{{age}}`, `{{skill}}`, `{{summary}}`: the input's text as it is. When it's missing: coach-scenario uses
  "his baby", "about one year old" and "pick the one he needs most from his recent scores"; coach-grade and
  coach-advice use age "about one"; weekly-plan uses age "about one year old"; otherwise empty.
- `{{scenario}}`, `{{question}}`, `{{answer}}`, `{{situation}}`, `{{task}}`, `{{expected}}`: the input's text as a
  JSON string (quoted), `""` when missing.
- `{{recent}}`, `{{avoid}}`: JSON lists (`[]` when missing).
- `{{phone}}`: `{"checkins": ..., "feedback": ...}` from the input, as JSON, cut at 20000 characters.
- `{{can}}`: the "what she can already do" sentence (`can_do()` in wellness_pc.py), empty when the input has no `can`.
- `{{skills}}`: the parenting skill names as a JSON list; `{{rules}}`: the text of `rules.md`.
- `{{summary}}` for `advice` and `weekly-plan` is made by the PC from its activity log (`summarize(14)`); a cloud run
  writes the same kind of summary from the synced data instead.

Web tools: only coach-grade and coach-advice may search the web (`TOOLS` in wellness_pc.py).

## Answering a queued request (cloud runs; see .autopilot/cloud-plan.md task B & task 32)
The phone's `wellness-sync.json` has `requests: [{id, task, input, at}]` and `acked: [ids]`. For each request whose `id`
is not in `acked` and not yet answered, fill the task's prompt with its input and answer it as the prompt says (one JSON
object). Write answers to the `wellness-answers` Google Sheet in the private Drive folder (columns `id | task |
answer-json | at`), where `answer-json` is `{"task":"<task>","answer":{...}}` (or `{"task":"<task>","error":"..."}`,
or the bare answer JSON object). The phone exports that sheet as CSV on each sync and feeds rows through the same
`answers` / `acked` path as `wellness-sync.json` (the `answers` map in `wellness-sync.json` still works too).

Keeping the sheet small: row 1 is the header `id,task,answer-json,at`; give every row `at` (ISO time of the answer).
Each run, before adding rows, drop the rows whose `id` is already in the sync file's `acked` (the phone has them),
and keep the rest. The phone ignores an answer it isn't waiting for once it is over a week old (`WL.pc.deliver`).
`tools/cloud-answer.cjs` does both halves (prompts from the sync file; sheet rows from the answers); see cloud-plan.md.
