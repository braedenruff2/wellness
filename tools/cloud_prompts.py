"""Fills pc/prompts/<task>.md for queued requests, the same way the PC link does (used by tools/cloud-answer.cjs).
stdin: {"events": [...activity events from the synced stores...], "requests": [{id, task, input}], "work": dir}
stdout: {"<id>": {"task": ..., "prompt": ..., "tools": ...} or {"task": ..., "error": ...}}
The events go into <work>/progress (the PC's own activity-log format) so advice/weekly-plan get the same summary."""
import json, os, sys

def main():
    if hasattr(sys.stdin, "reconfigure"): sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    req = json.load(sys.stdin)
    work = req["work"]
    os.environ["WELLNESS_PROGRESS"] = os.path.join(work, "progress")
    os.environ["WELLNESS_STATE"] = os.path.join(work, "state")
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pc"))
    import wellness_pc as W
    W.save_events(req.get("events") or [])
    out = {}
    for r in req.get("requests") or []:
        task, inp = r.get("task"), r.get("input")
        try:
            if task not in W.TASKS: raise ValueError("unknown task " + str(task))
            if not isinstance(inp, dict): raise ValueError("input must be an object")
            photo_b64 = inp.get("imageBase64") if task == "cook-photo" and isinstance(inp.get("imageBase64"), str) else None
            inp = {k: (v[:W.MAX_TEXT] if isinstance(v, str) else v) for k, v in list(inp.items())[:20] if k != "imageBase64"}
            if task == "cook-photo" and photo_b64:
                import base64
                raw = base64.b64decode(photo_b64)
                pfile = os.path.join(work, str(r["id"]) + ".jpg")
                with open(pfile, "wb") as pf: pf.write(raw)
                inp["photopath"] = pfile
            if task in ("advice", "weekly-plan"): inp["summary"] = W.summarize(14)
            prompt, tools = W.prompt_for(task, inp)
            out[r["id"]] = {"task": task, "prompt": prompt, "tools": tools}
        except Exception as e:
            out[r["id"]] = {"task": task, "error": str(e)}
    json.dump(out, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
