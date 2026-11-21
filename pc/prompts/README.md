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

## Answering a queued request (cloud runs; see .autopilot/cloud-plan.md task B)
The phone's `wellness-sync.json` has `requests: [{id, task, input, at}]`. For each one not yet answered, fill the
task's prompt with its input, answer it as the prompt says (one JSON object), and add it to the file's `answers`:
`"answers": {"<id>": {"task": "<task>", "answer": {...}}}` (or `{"task": ..., "error": "why it couldn't be answered"}`).
Keep everything else in the file as it is. The phone shows the answer through the same code as a PC answer.
