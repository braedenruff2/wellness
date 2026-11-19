"""Tests for the Wellness PC link (pc/wellness_pc.py): pairing, the activity log, Claude jobs (with a stand-in
`claude` that answers like `claude -p --output-format json`), the summary, and the security checks.
Runs a real server on a free port with temporary folders.   python pc/test/test_pc.py"""
import datetime, hashlib, http.client, json, os, secrets, socket, ssl, stat, sys, tempfile, threading, time

# his PC's time zone (the phone sends UTC times; the PC files them by its local date)
os.environ["TZ"] = "America/Halifax"
if hasattr(time, "tzset"): time.tzset()
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="wpc-")
os.environ["WELLNESS_STATE"] = os.path.join(TMP, "state")
os.environ["WELLNESS_PROGRESS"] = os.path.join(TMP, "progress")
s = socket.socket(); s.bind(("127.0.0.1", 0)); PORT = s.getsockname()[1]; s.close()
os.environ["WELLNESS_PORT"] = str(PORT)
os.environ["WELLNESS_DIST"] = os.path.join(TMP, "dist")
os.environ["LOUDBOOK_STATE"] = os.path.join(TMP, "lbstate")
os.environ["WELLNESS_KOKORO"] = os.path.join(TMP, "kokoro")
os.environ["WELLNESS_TAGALOG"] = os.path.join(TMP, "tgl")
s = socket.socket(); s.bind(("127.0.0.1", 0)); os.environ["LOUDBOOK_PORT"] = str(s.getsockname()[1]); s.close()

# a stand-in for Claude Code: echoes what it was asked in the shape of `claude -p --output-format json`
FAKE = os.path.join(TMP, "claude")
with open(FAKE, "w") as f:
    f.write("""#!/usr/bin/env python3
import json, sys
p = sys.stdin.read()
args = sys.argv[1:]
open(sys.argv[0] + '.args', 'w').write(json.dumps(args))
if 'FAIL-PLEASE' in p:
    print(json.dumps({"type": "result", "subtype": "error_max_turns", "is_error": True, "result": ""})); sys.exit(1)
if 'REVOKED' in p:
    print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "Failed to authenticate. API Error: 401 OAuth access token has been revoked"})); sys.exit(1)
if 'NOT-JSON' in p:
    print('Invalid API key'); sys.exit(1)
if 'practical coach' in p:
    ans = json.dumps({"headline": "h", "points": [p[p.find('Activity'):p.find('Activity') + 60]], "next": "n"})
elif 'Grade a dad' in p:
    ans = 'Here you go:\\n```json\\n{"score": 7, "verdict": "Good start {really}.", "good": ["stayed calm"], "improve": ["name the feeling"], "better": "x", "why": "y", "practice": "z", "sources": []}\\n```'
elif 'ONE realistic' in p:
    ans = '{"title": "Teething at 3am", "skill": "Crying and comfort", "scenario": "S", "question": "Q"}'
elif 'Tagalog' in p:
    ans = 'Sure! {"ok": false, "corrected": "Kumain ka na ba?", "meaning": "Have you eaten?", "explain": "e", "tip": "t"} Hope that helps.'
else:
    ans = json.dumps({"headline": "h", "points": [p[p.find('Activity'):p.find('Activity') + 60]], "next": "n"})
print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": ans}))
""")
os.chmod(FAKE, os.stat(FAKE).st_mode | stat.S_IEXEC)
os.environ["WELLNESS_CLAUDE"] = FAKE

sys.path.insert(0, os.path.join(HERE, ".."))
import wellness_pc as W  # noqa: E402

fails = 0
def check(name, cond, extra=""):
    global fails
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else "  " + str(extra)))
    if not cond: fails += 1


# ---------------------------------------------------------------- pure parts
check("parse_answer: fenced json", W.parse_answer('x ```json\n{"a": 1}\n``` y') == {"a": 1})
check("parse_answer: words around, braces in strings", W.parse_answer('Sure {"a": "b}{", "c": {"d": 2}} ok') == {"a": "b}{", "c": {"d": 2}})
check("parse_answer: a stray brace first", W.parse_answer('{ oops } then {"a": 1}') == {"a": 1})
check("parse_answer: no json keeps the text", W.parse_answer("just words") == {"text": "just words"})
check("clean_event: good", W.clean_event({"id": "a", "at": "2026-11-19T10:00:00Z", "part": "calm", "kind": "session"}) is not None)
check("clean_event: unknown part", W.clean_event({"id": "a", "at": "2026-11-19T10:00:00Z", "part": "evil", "kind": "x"}) is None)
check("clean_event: bad date", W.clean_event({"id": "a", "at": "../../x", "part": "calm", "kind": "x"}) is None)
check("clean_event: long id", W.clean_event({"id": "a" * 500, "at": "2026-11-19", "part": "calm", "kind": "x"}) is None)
check("clean_event: huge data dropped", "data" not in W.clean_event({"id": "a", "at": "2026-11-19", "part": "calm", "kind": "x", "data": {"t": "y" * 10000}}))
check("private_ip", W.private_ip("192.168.1.5") and W.private_ip("10.0.0.1") and W.private_ip("100.101.1.1")
      and W.private_ip("::ffff:192.168.0.2") and not W.private_ip("8.8.8.8"))
check("pair codes: 12 letters from the alphabet", all(c in W.ALPHABET for c in W.new_code().replace("-", "")) and len(W.new_code()) == 14)
for t in W.TASKS:
    pr, tools = W.prompt_for(t, {"child": "Kid", "age": "11 months", "answer": "a", "summary": "S"})
    check("prompt " + t + " asks for JSON", "JSON" in pr and "ONE JSON object" in pr)
check("only grading and real-situation advice may search the web", W.prompt_for("coach-grade", {})[1] == "WebSearch,WebFetch"
      and W.prompt_for("coach-advice", {})[1] == "WebSearch,WebFetch" and W.prompt_for("advice", {})[1] == "" and W.prompt_for("coach-scenario", {})[1] == "")
check("real-situation prompt carries his words and the age", "car seat" in W.prompt_for("coach-advice", {"situation": "car seat", "age": "11 months old"})[0]
      and "11 months old" in W.prompt_for("coach-advice", {"situation": "car seat", "age": "11 months old"})[0])

# ---------------------------------------------------------------- the server
threading.Thread(target=W.serve, daemon=True).start()
for _ in range(100):
    try: socket.create_connection(("127.0.0.1", PORT), 0.2).close(); break
    except OSError: time.sleep(0.1)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE


def req(method, p, body=None, token=None, raw=None):
    c = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=20)
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    c.request(method, p, body=data, headers=h)
    der = c.sock.getpeercert(binary_form=True) if c.sock else None
    r = c.getresponse(); t = r.read().decode()
    c.close()
    try: o = json.loads(t)
    except ValueError: o = {"raw": t}
    return r.status, o, der


st, o, der = req("GET", "/v1/hello")
check("hello without a key", st == 200 and o.get("app") == "wellness", o)
st, o, _ = req("GET", "/v1/health")
check("health needs a key", st == 401, st)
st, o, _ = req("POST", "/v1/activity", {"events": []}, token="nope")
check("activity needs a key", st == 401, st)

# pairing off -> refused
nc = secrets.token_bytes(16)
st, o, _ = req("POST", "/v1/pair/start", {"nc": W.b64(nc)})
check("pairing refused when not switched on", st == 403, o)

# switch pairing on like `pair` does, with a known code
code = "ABCD-EFGH-JKMN"
W.write_json("pairing.json", {"key": W.b64(W.pair_key(code)), "expires": time.time() + 600, "tries": 0})
st, o, der = req("POST", "/v1/pair/start", {"nc": W.b64(nc)})
fp = hashlib.sha256(der).digest()
check("pair start answers with the cert fingerprint", st == 200 and o.get("fp") == fp.hex(), o)
ns = W.unb64(o["ns"]); key = W.pair_key(code)
check("the PC proves the code", W.unb64(o["mac"]) == W.mac(key, b"server", nc, ns, fp))
# a wrong code counts a try
st, o2, _ = req("POST", "/v1/pair/finish", {"nc": W.b64(nc), "ns": o["ns"], "mac": W.b64(W.mac(W.pair_key("WRNG-WRNG-WRNG"), b"client", nc, ns, fp)), "name": "x"})
check("wrong code refused", st == 403 and W.read_json("pairing.json", {}).get("tries") == 1, (st, o2))
st, o, der = req("POST", "/v1/pair/start", {"nc": W.b64(nc)})
ns = W.unb64(o["ns"])
st, o, _ = req("POST", "/v1/pair/finish", {"nc": W.b64(nc), "ns": o["ns"], "mac": W.b64(W.mac(key, b"client", nc, ns, fp)), "name": "Pixel 10 Pro"})
token = o.get("token")
check("right code pairs and gives a key", st == 200 and token and len(W.unb64(token)) == 32, o)
check("the PC keeps only a hash", token not in json.dumps(W.read_json("devices.json", [])))
st, o, _ = req("POST", "/v1/pair/start", {"nc": W.b64(nc)})
check("a code works once", st == 403, st)

st, o, _ = req("GET", "/v1/health", token=token)
check("health with the key", st == 200 and o.get("claude") is True, o)

# ---------------------------------------------------------------- app updates from the PC
st, o, _ = req("GET", "/v1/app/version", token=token)
check("no build yet: says so", st == 404 and "no app build" in o.get("error", ""), (st, o))
os.makedirs(os.path.join(TMP, "dist"))
open(os.path.join(TMP, "dist", "Wellness.apk"), "wb").write(b"PK" + os.urandom(300000))
json.dump({"code": 30463800, "name": "0.1.x", "size": 300002}, open(os.path.join(TMP, "dist", "version.json"), "w"))
st, o, _ = req("GET", "/v1/app/version", token=token)
check("version of the PC's build", st == 200 and o == {"code": 30463800, "name": "0.1.x", "size": 300002}, o)
st, o, _ = req("GET", "/v1/app/version")
check("app version needs the key", st == 401, st)
c = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=20)
c.request("GET", "/v1/app/apk", headers={"Authorization": "Bearer " + token}); r = c.getresponse(); body = r.read(); c.close()
check("the APK streams in full", r.status == 200 and body == open(os.path.join(TMP, "dist", "Wellness.apk"), "rb").read(), (r.status, len(body)))

# ---------------------------------------------------------------- voices
st, o, _ = req("GET", "/v1/voice/info", token=token)
check("voice info: nothing on this PC yet", st == 200 and o == {"kokoro": None, "tagalog": None, "pcVoice": False}, o)
os.makedirs(os.path.join(TMP, "kokoro")); os.makedirs(os.path.join(TMP, "tgl"))
open(os.path.join(TMP, "kokoro", "model.onnx"), "wb").write(os.urandom(3 * 1024 * 1024 + 7))
open(os.path.join(TMP, "kokoro", "voices.bin"), "wb").write(b"v" * 1000)
st, o, _ = req("GET", "/v1/voice/info", token=token)
check("voice info: Kokoro found, Tagalog not (a file missing)", o.get("kokoro") == {"files": [{"name": "model.onnx", "size": 3 * 1024 * 1024 + 7}, {"name": "voices.bin", "size": 1000}]} and o.get("tagalog") is None, o)
c = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=20)
c.request("GET", "/v1/voice/get?pack=kokoro&f=model.onnx", headers={"Authorization": "Bearer " + token}); r = c.getresponse(); body = r.read(); c.close()
check("voice file streams in full", r.status == 200 and body == open(os.path.join(TMP, "kokoro", "model.onnx"), "rb").read(), (r.status, len(body)))
for bad in ["pack=kokoro&f=../../x", "pack=kokoro&f=tokens.txt", "pack=evil&f=model.onnx", "pack=tagalog&f=model.onnx"]:
    st, o, _ = req("GET", "/v1/voice/get?" + bad, token=token)
    check("voice get refuses " + bad, st == 404, st)
st, o, _ = req("GET", "/v1/voice/get?pack=kokoro&f=model.onnx")
check("voice files need the key", st == 401, st)
st, o, _ = req("POST", "/v1/speak", {"text": "Hello"}, token=token)
check("speak without Loudbook's PC voice: says so", st == 503 and "isn't set up" in o.get("error", ""), (st, o))

# a stand-in for Loudbook's PC voice: its own certificate and devices.json, answers /v1/speak with PCM
import http.server as HS
os.makedirs(os.path.join(TMP, "lbstate"))
saved_state = W.STATE
W.STATE = os.path.join(TMP, "lbstate"); lb_cert, lb_key = W.ensure_cert(); W.STATE = saved_state
json.dump([{"name": "Pixel", "hash": "abc"}], open(os.path.join(TMP, "lbstate", "devices.json"), "w"))
lb_seen = []
class LB(HS.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers["Content-Length"]); body = json.loads(self.rfile.read(n))
        tok = self.headers.get("Authorization", "")[7:]
        hashes = [d["hash"] for d in json.load(open(os.path.join(TMP, "lbstate", "devices.json")))]
        if hashlib.sha256(W.unb64(tok)).hexdigest() not in hashes:
            self.send_response(401); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}"); return
        lb_seen.append(body)
        pcm = b"\x01\x00" * 2400
        self.send_response(200); self.send_header("Content-Type", "audio/L16"); self.send_header("X-Sample-Rate", "24000")
        self.send_header("X-Engine", "natural"); self.send_header("X-Made-At", "1.000"); self.send_header("Content-Length", str(len(pcm)))
        self.end_headers(); self.wfile.write(pcm)
lb = HS.ThreadingHTTPServer(("127.0.0.1", int(os.environ["LOUDBOOK_PORT"])), LB)
lctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); lctx.load_cert_chain(lb_cert, lb_key)
lb.socket = lctx.wrap_socket(lb.socket, server_side=True)
threading.Thread(target=lb.serve_forever, daemon=True).start()
c = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=20)
c.request("POST", "/v1/speak", body=json.dumps({"text": "Be still and know", "sid": 6, "speed": 0.9}), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
r = c.getresponse(); body = r.read(); c.close()
check("speak goes through Loudbook's PC voice", r.status == 200 and len(body) == 4800 and r.getheader("X-Sample-Rate") == "24000" and r.getheader("X-Engine") == "natural", (r.status, len(body)))
check("asked for the natural voice, Nicole, at his speed", lb_seen and lb_seen[-1] == {"text": "Be still and know", "sid": 6, "speed": 0.9, "engine": "natural"}, lb_seen)
devs = json.load(open(os.path.join(TMP, "lbstate", "devices.json")))
check("this server became one of Loudbook's devices (hash only), the phone's kept", len(devs) == 2 and devs[0]["hash"] == "abc" and W.read_json("loudbook.json", {}).get("token") not in json.dumps(devs), devs)
c = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=20)
c.request("POST", "/v1/speak", body=json.dumps({"text": "again"}), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}); r = c.getresponse(); r.read(); c.close()
check("its key is reused, not added again", r.status == 200 and len(json.load(open(os.path.join(TMP, "lbstate", "devices.json")))) == 2, r.status)
# a different machine answering on Loudbook's port (other certificate) is refused
W.STATE = os.path.join(TMP, "other"); other_cert, _ = W.ensure_cert(); W.STATE = saved_state
import shutil as _sh
_sh.copy(other_cert, os.path.join(TMP, "lbstate", "cert.pem"))
st, o, _ = req("POST", "/v1/speak", {"text": "x"}, token=token)
check("speak refuses a stand-in with another certificate", st == 503 and "not Loudbook" in o.get("error", ""), (st, o))
lb.shutdown()
for bad in [{"text": ""}, {"text": "x" * 3000}, {"text": "x", "sid": "a"}]:
    st, o, _ = req("POST", "/v1/speak", bad, token=token)
    check("speak refuses " + json.dumps(bad)[:30], st == 400, st)

# ---------------------------------------------------------------- activity
today = datetime.date.today().isoformat()
yday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
ev = [
    {"id": "calm/1", "at": today + "T08:00:00-04:00", "part": "calm", "kind": "session", "text": "Slow breathing", "data": {"mins": 5, "before": 4, "after": 2}},
    {"id": "wo/1", "at": today + "T09:00:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Push-ups", "n": 1, "val": 18, "w": None}},
    {"id": "wo/2", "at": today + "T09:02:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Push-ups", "n": 2, "val": 17}},
    {"id": "tl/1", "at": yday + "T20:00:00-04:00", "part": "tagalog", "kind": "review", "data": {"tl": "salamat", "right": False}},
    {"id": "tl/2", "at": yday + "T20:01:00-04:00", "part": "tagalog", "kind": "answer", "data": {"prompt": "Thank you", "ok": True}},
    {"id": "todo/1", "at": today + "T10:00:00-04:00", "part": "todo", "kind": "done", "text": "call Mom"},
    {"id": "bad", "at": "nope", "part": "calm", "kind": "x"},
]
week = {"lessonsDone": ["2026-11-18/1"], "weakWords": [{"tl": "salamat"}]}
st, o, _ = req("POST", "/v1/activity", {"events": ev, "tagalogWeek": week}, token=token)
check("activity saved (bad one skipped)", st == 200 and o == {"saved": 6, "got": 7}, o)
st, o, _ = req("POST", "/v1/activity", {"events": ev[:3] + [{"id": "calm/2", "at": today + "T21:00:00-04:00", "part": "calm", "kind": "session", "data": {"mins": 3}}]}, token=token)
check("sending again saves only what's new", o.get("saved") == 1, o)
lines = open(os.path.join(TMP, "progress", "activity", today + ".jsonl"), encoding="utf-8").read().splitlines()
check("one line per event in the day's file", len(lines) == 5 and all(json.loads(x)["id"] for x in lines), lines)
check("yesterday's events in yesterday's file", len(W.read_day(yday)) == 2)
check("the Tagalog week file is written", any(n.startswith("tagalog-week-") for n in os.listdir(os.path.join(TMP, "progress"))))
# a line cut short by a crash doesn't break anything
with open(os.path.join(TMP, "progress", "activity", today + ".jsonl"), "a", encoding="utf-8") as f: f.write('{"id": "half')
st, o, _ = req("POST", "/v1/activity", {"events": ev[:1]}, token=token)
check("a broken line is skipped, no duplicates", st == 200 and o.get("saved") == 0, o)
# a journal entry sent first without its words, then again with them (the phone gives it a new id ending /t):
# the day keeps both lines, the summary counts it once
req("POST", "/v1/activity", {"events": [{"id": "faith/j/x1", "at": today + "T08:00:00-04:00", "part": "faith", "kind": "awe", "data": {"chars": 5}}]}, token=token)
req("POST", "/v1/activity", {"events": [{"id": "faith/j/x1/t", "at": today + "T08:00:00-04:00", "part": "faith", "kind": "awe", "text": "Wow.", "data": {"chars": 5}}]}, token=token)
fa = [e for e in W.recent_events(7) if e["part"] == "faith"]
check("an event saved after a half-written line is kept", any(e["id"] == "faith/j/x1" for e in W.read_day(today)))
check("journal sent again with words counts once (the one with words)", len(fa) == 1 and fa[0].get("text") == "Wow.", fa)
check("summary: faith awe once", "- faith: 1 awe" in W.summarize(7), W.summarize(7))
summ = W.summarize(7)
check("summary: calm stress", "stress 4.0 -> 2.0" in summ, summ)
check("summary: workout sets", "Push-ups: 18, 17" in summ, summ)
check("summary: tagalog misses", "1/2 right" in summ and "salamat" in summ, summ)
check("summary: todo", "call Mom" in summ, summ)
check("summary: nothing for a part with no events", "- coach: nothing" in summ, summ)
req("POST", "/v1/activity", {"events": [{"id": "tl/3", "at": today + "T07:00:00-04:00", "part": "tagalog", "kind": "review", "data": {"tl": "opo", "right": True, "dir": "say"}}]}, token=token)
summ = W.summarize(7)
check("summary: Tagalog said (English first) counted apart", "2/3 right" in summ and "said in Tagalog 1/1" in summ, summ)
# a workout set fixed on the phone (id + /e<ms>, newest wins) and one removed (id + /x)
b1, b2 = "workout/s1/" + today + "T08:00:00Z/0", "workout/s1/" + today + "T08:05:00Z/1"
req("POST", "/v1/activity", {"events": [
    {"id": b1, "at": today + "T08:00:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Squat", "n": 1, "val": 71}},
    {"id": b2, "at": today + "T08:05:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Row", "n": 1, "val": 9}}]}, token=token)
req("POST", "/v1/activity", {"events": [
    {"id": b1 + "/e100", "at": today + "T08:00:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Squat", "n": 1, "val": 18}},
    {"id": b1 + "/e200", "at": today + "T08:00:00-04:00", "part": "workout", "kind": "set", "data": {"ex": "Squat", "n": 1, "val": 17}},
    {"id": b2 + "/x", "at": today + "T08:05:00-04:00", "part": "workout", "kind": "set-removed"}]}, token=token)
wo = [e for e in W.recent_events(7) if e["part"] == "workout" and e["id"].startswith("workout/s1/")]
check("fixed set: only the newest value; removed set: gone", [(e["data"] or {}).get("val") for e in wo] == [17], wo)
# a workout finished, "Carry on", finished again: both ends arrive; only the newest counts (and the old-style id too)
req("POST", "/v1/activity", {"events": [
    {"id": "workout/end/s9", "at": today + "T09:30:00-04:00", "part": "workout", "kind": "workout-done", "data": {"sets": 8, "mins": 30}},
    {"id": "workout/end/s9/e100", "at": today + "T09:30:00-04:00", "part": "workout", "kind": "workout-done", "data": {"sets": 8, "mins": 30}},
    {"id": "workout/end/s9/e200", "at": today + "T10:10:00-04:00", "part": "workout", "kind": "workout-done", "data": {"sets": 12, "mins": 70}},
    {"id": "todo/done/t1/e100", "at": today + "T10:00:00-04:00", "part": "todo", "kind": "done", "text": "x"},
    {"id": "todo/done/t1/e300", "at": today + "T10:20:00-04:00", "part": "todo", "kind": "done", "text": "x"}]}, token=token)
ends = [e for e in W.recent_events(7) if e["id"].startswith("workout/end/s9")]
check("finished again: only the newest end counts", [e["data"]["sets"] for e in ends] == [12], ends)
check("a to-do ticked again: counted once", len([e for e in W.recent_events(7) if e["id"].startswith("todo/done/t1")]) == 1)
# the phone sends UTC ("Z"): 22:30 in Halifax is already tomorrow in UTC, but it's today's activity
late = (datetime.datetime.combine(datetime.date.today(), datetime.time(22, 30)).astimezone().astimezone(datetime.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
check("(test set-up: the UTC date is tomorrow's)", late[:10] != today, late)
req("POST", "/v1/activity", {"events": [{"id": "calm/late", "at": late, "part": "calm", "kind": "session", "data": {"mins": 7}}]}, token=token)
check("an evening event (UTC time) is filed under the local day", any(e["id"] == "calm/late" for e in W.read_day(today)), late)
check("... and counted in today's summary", any(e["id"] == "calm/late" for e in W.recent_events(1)))
# a file written by an older version (filed under the UTC date): counted once, for its local day; not saved again
W.append_lines(W.day_file(late[:10]), [{"id": "calm/old", "at": late, "part": "calm", "kind": "session", "data": {"mins": 2}}])
st, o, _ = req("POST", "/v1/activity", {"events": [{"id": "calm/old", "at": late, "part": "calm", "kind": "session", "data": {"mins": 2}}]}, token=token)
check("an event already in the older (UTC-day) file is not saved twice", o.get("saved") == 0, o)
check("... and counts for its local day once", [e["id"] for e in W.recent_events(1)].count("calm/old") == 1)
check("... not for tomorrow", not any(e["id"] == "calm/old" for e in W.recent_events(1, datetime.date.today() + datetime.timedelta(days=1))))
st, o, _ = req("POST", "/v1/summary", {"days": 3}, token=token)
check("summary over the link", st == 200 and "Activity" in o.get("summary", ""), o)
# (the server answers 400 without reading the body, so the sender may see the connection close first: both are a refusal)
try: st, o, _ = req("POST", "/v1/activity", raw=b"x" * (W.MAX_BODY + 10), token=token)
except (ssl.SSLError, ConnectionError): st = 400
check("too big refused", st == 400, st)
st, o, _ = req("GET", "/v1/health", token=token)
check("still fine after a refused big request", st == 200, st)
st, o, _ = req("POST", "/v1/activity", raw=b"[1,2]", token=token)
check("not an object refused", st == 400, st)


# ---------------------------------------------------------------- Claude jobs
def ask(task, inp):
    st, o, _ = req("POST", "/v1/ask", {"task": task, "input": inp}, token=token)
    if st != 200: return st, o
    for _ in range(100):
        st, r, _ = req("GET", "/v1/job?id=" + o["job"], token=token)
        if r.get("state") != "running": return st, r
        time.sleep(0.1)
    return 0, {"state": "timeout"}


st, r = ask("coach-scenario", {"child": "Kid", "age": "11 months", "recent": [{"skill": "Sleep", "score": 6}]})
check("scenario", r.get("state") == "done" and r["answer"].get("title") == "Teething at 3am", r)
st, r = ask("coach-grade", {"child": "Kid", "age": "11 months", "scenario": "S", "question": "Q", "answer": "I pick her up"})
check("grading (fenced JSON with a brace in a string)", r.get("state") == "done" and r["answer"].get("score") == 7 and r["answer"]["verdict"] == "Good start {really}.", r)
args = json.load(open(FAKE + ".args"))
check("grading may use web search, nothing else", args[args.index("--tools") + 1] == "WebSearch,WebFetch" and args[args.index("--allowedTools") + 1] == "WebSearch,WebFetch" and "-p" in args, args)
hist = open(os.path.join(TMP, "progress", "coach", "history.jsonl"), encoding="utf-8").read().splitlines()
check("coach history kept on the PC", len(hist) == 2 and json.loads(hist[1])["answer"]["score"] == 7, hist)
st, r = ask("tagalog-check", {"task": "Ask: have you eaten?", "expected": "Kumain ka na ba?", "answer": "kain ka ba"})
check("tagalog check", r.get("state") == "done" and r["answer"].get("corrected") == "Kumain ka na ba?", r)
args = json.load(open(FAKE + ".args"))
check("tagalog check can't use tools", args[args.index("--tools") + 1] == "" and "--allowedTools" not in args, args)
st, r = ask("advice", {"question": ""})
check("advice gets the activity summary", r.get("state") == "done" and "Activity" in (r["answer"].get("points") or [""])[0], r)
st, r = ask("advice", {"question": "FAIL-PLEASE"})
check("a Claude error reaches the phone", r.get("state") == "error" and "error_max_turns" in r.get("error", ""), r)
st, r = ask("advice", {"question": "NOT-JSON"})
check("a broken Claude reply says what it said", r.get("state") == "error" and "Invalid API key" in r.get("error", ""), r)
st, r = ask("advice", {"question": "REVOKED"})
check("a revoked Claude login says how to sign in again", r.get("state") == "error" and "Sign in to Claude Code.bat" in r.get("error", ""), r)
check("explain_error: usage limit", "usage limit" in W.explain_error("API Error: 429 rate limit"))
st, r = ask("rm -rf", {})
check("unknown task refused", st == 400, (st, r))
st, r, _ = req("GET", "/v1/job?id=nope", token=token)
check("unknown job", st == 404, st)
os.environ["WELLNESS_CLAUDE"] = os.path.join(TMP, "no-such-claude")
st, r = ask("advice", {})
check("no Claude Code: says how to fix it", r.get("state") == "error" and "Claude Code" in r.get("error", ""), r)
os.environ["WELLNESS_CLAUDE"] = FAKE

# an updated wellness_pc.py restarts the running server (exit 3 -> start-pc.cmd starts the new code)
import subprocess as sp
cp = os.path.join(TMP, "copy"); os.makedirs(cp)
src = open(os.path.join(HERE, "..", "wellness_pc.py"), encoding="utf-8").read()
open(os.path.join(cp, "wellness_pc.py"), "w", encoding="utf-8").write(src)
s2 = socket.socket(); s2.bind(("127.0.0.1", 0)); p2 = s2.getsockname()[1]; s2.close()
env = dict(os.environ, WELLNESS_PORT=str(p2), WELLNESS_STATE=os.path.join(TMP, "state2"), WELLNESS_UPDATE_CHECK="0.5")
proc = sp.Popen([sys.executable, os.path.join(cp, "wellness_pc.py"), "serve"], env=env, stdout=sp.PIPE, stderr=sp.STDOUT, text=True)
time.sleep(2.5)
open(os.path.join(cp, "wellness_pc.py"), "w", encoding="utf-8").write(src + "\n(broken")     # a half-written update
time.sleep(5)
check("a broken update doesn't restart it", proc.poll() is None, proc.poll())
time.sleep(1.1)
open(os.path.join(cp, "wellness_pc.py"), "w", encoding="utf-8").write(src + "\n# v2\n")
try: code = proc.wait(timeout=15)
except sp.TimeoutExpired: proc.kill(); code = None
check("an update restarts the server (exit 3)", code == 3, code)

# forget
W.main(["x", "forget"])
st, o, _ = req("GET", "/v1/health", token=token)
check("forget unpairs", st == 401, st)

print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
