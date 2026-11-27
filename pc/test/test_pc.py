"""Tests for the Wellness PC link (pc/wellness_pc.py): pairing, the activity log, Claude jobs (with a stand-in
`claude` that answers like `claude -p --output-format json`), the summary, and the security checks.
Runs a real server on a free port with temporary folders.   python pc/test/test_pc.py"""
import datetime, hashlib, http.client, json, os, re, secrets, socket, ssl, stat, subprocess, sys, tempfile, threading, time

# his PC's time zone (the phone sends UTC times; the PC files them by its local date)
if hasattr(time, "tzset"):
    os.environ["TZ"] = "America/Halifax"
    time.tzset()
else:
    os.environ["TZ"] = "AST4ADT"
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
FAKE_PY = os.path.join(TMP, "claude.py" if os.name == "nt" else "claude")
FAKE = os.path.join(TMP, "claude.cmd") if os.name == "nt" else FAKE_PY
with open(FAKE_PY, "w", encoding="utf-8") as f:
    f.write("""#!/usr/bin/env python3
import json, os, sys
p = sys.stdin.read()
args = sys.argv[1:]
open(os.environ.get("WELLNESS_FAKE_ARGS", sys.argv[0] + '.args'), 'w', encoding='utf-8').write(json.dumps(args))
if os.environ.get("WELLNESS_CLAUDE_CALLS"):
    open(os.environ["WELLNESS_CLAUDE_CALLS"], "a", encoding="utf-8").write("1\\n")
if 'LIMIT-CLAUDE' in p:
    print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "You've reached your weekly usage limit (429 rate limit)"})); sys.exit(1)
if 'FAIL-PLEASE' in p:
    print(json.dumps({"type": "result", "subtype": "error_max_turns", "is_error": True, "result": ""})); sys.exit(1)
if 'REVOKED' in p:
    print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "Failed to authenticate. API Error: 401 OAuth access token has been revoked"})); sys.exit(1)
if 'CLAUDE-SESSION-LIMIT' in p:
    print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "You've hit your session limit · resets 12:40am (America/Halifax)"})); sys.exit(1)
if 'NOT-JSON' in p:
    print('Invalid API key'); sys.exit(1)
if 'writing his plan for the coming week' in p:
    ans = json.dumps({"headline": "plan " + ("SAW-CHECKIN" if "teething-note" in p else "") + (" SAW-NOTFIT" if "NOT FOR ME" in p else ""),
                      "parts": {"calm": {"focus": "f", "why": "w", "prefer": ["body"]}}, "check": "c"})
elif 'practical coach' in p:
    ans = json.dumps({"headline": "h", "points": [p[p.find('Activity'):p.find('Activity') + 60]], "next": "n"})
elif 'Grade a dad' in p:
    ans = 'Here you go:\\n```json\\n{"score": 7, "verdict": "Good start {really}.", "good": ["stayed calm"], "improve": ["name the feeling"], "better": "x", "why": "y", "practice": "z", "sources": []}\\n```'
elif 'ONE realistic' in p:
    ans = '{"title": "Teething at 3am", "skill": "Crying and comfort", "scenario": "S", "question": "Q"}'
elif 'Tagalog' in p and '7-day meal plan' not in p:  # the meal-plan prompt mentions Tagalog dish words too
    ans = 'Sure! {"ok": false, "corrected": "Kumain ka na ba?", "meaning": "Have you eaten?", "explain": "e", "tip": "t"} Hope that helps.'
elif 'Read and inspect the photo at:' in p:
    import re as _re
    m = _re.search(r'photo at:\\s*(\\S+)', p)
    exists = bool(m and os.path.exists(m.group(1)))
    ans = json.dumps({"summary": "photo-exists=" + str(exists), "items": [{"name": "milk", "qty": 0.5, "unit": "L", "status": "low", "cat": "dairy", "expiresInDays": 3, "amount": "half full"}]})
elif '7-day meal plan' in p:
    ans = json.dumps({"note": "Use expiring salmon first.", "days": [{"date": "2026-11-26", "breakfast": {"recipeId": "eggs-toast", "title": "Soft scrambled eggs, spinach & toast"}, "lunch": {"recipeId": "tuna-rice", "title": "10-minute tuna, avocado & cucumber rice bowl"}, "dinner": {"recipeId": "salmon-tray", "title": "20-minute baked salmon, spinach & potatoes"}}]})
else:
    ans = json.dumps({"headline": "h", "points": [p[p.find('Activity'):p.find('Activity') + 60]], "next": "n"})
print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": ans}))
""")
if os.name == "nt":
    with open(FAKE, "w", encoding="utf-8") as f:
        f.write(f'@echo off\r\n"{sys.executable}" "{FAKE_PY}" %*\r\n')
else:
    os.chmod(FAKE, os.stat(FAKE).st_mode | stat.S_IEXEC)
os.environ["WELLNESS_FAKE_ARGS"] = FAKE + ".args"
os.environ["WELLNESS_CLAUDE_CALLS"] = FAKE + ".calls"
os.environ["WELLNESS_CLAUDE"] = FAKE

# a stand-in for Gemini CLI (`gemini -p ... --output-format json`)
FAKE_G_PY = os.path.join(TMP, "gemini.py" if os.name == "nt" else "gemini")
FAKE_G = os.path.join(TMP, "gemini.cmd") if os.name == "nt" else FAKE_G_PY
with open(FAKE_G_PY, "w", encoding="utf-8") as f:
    f.write("""#!/usr/bin/env python3
import json, os, sys
p = sys.stdin.read()
args = sys.argv[1:]
open(os.environ.get("WELLNESS_GEMINI_ARGS", sys.argv[0] + '.args'), 'w', encoding='utf-8').write(json.dumps(args))
if os.environ.get("WELLNESS_GEMINI_CALLS"):
    open(os.environ["WELLNESS_GEMINI_CALLS"], "a", encoding="utf-8").write("1\\n")
if 'LIMIT-GEMINI' in p:
    print(json.dumps({"error": {"type": "QuotaError", "message": "429 RESOURCE_EXHAUSTED: quota exceeded"}})); sys.exit(1)
if 'AUTH-GEMINI' in p:
    print(json.dumps({"error": {"message": "401 unauthenticated credentials"}})); sys.exit(1)
if 'Grade a dad' in p:
    ans = '```json\\n{"score": 8, "verdict": "Gemini graded.", "good": ["calm"], "improve": ["pause"], "better": "b", "why": "w", "practice": "p", "sources": []}\\n```'
else:
    ans = json.dumps({"headline": "from gemini", "points": ["backup ok"], "next": "keep going"})
print(json.dumps({"response": ans, "stats": {"totalTokens": 42}}))
""")
if os.name == "nt":
    with open(FAKE_G, "w", encoding="utf-8") as f:
        f.write(f'@echo off\r\n"{sys.executable}" "{FAKE_G_PY}" %*\r\n')
else:
    os.chmod(FAKE_G, os.stat(FAKE_G).st_mode | stat.S_IEXEC)
os.environ["WELLNESS_GEMINI_ARGS"] = FAKE_G + ".args"
os.environ["WELLNESS_GEMINI_CALLS"] = FAKE_G + ".calls"
os.environ["WELLNESS_GEMINI"] = os.path.join(TMP, "no-such-gemini")  # turned on explicitly in the backup tests below

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
for _t in ("coach-scenario", "coach-grade", "coach-advice"):
    _p = W.prompt_for(_t, {"can": "walks; gets down by herself", "age": "12 months old"})[0]
    check(_t + ": what she can do now is in the prompt", "walks; gets down by herself" in _p and "can and can't do yet" in _p, _p[:600])
    check(_t + ": nothing said, no can-do line", "can already do" not in W.prompt_for(_t, {"age": "12 months old"})[0])
_tn = [{"tip": "Pause one beat after a wobble", "notForMe": True, "reasons": ["I know this already"], "note": "She already does this"},
       {"tip": "Same bedtime song", "tried": "Didn\u2019t work"}, {"tip": "  "}, "x", {"tip": "No answer"}]
for _t in ("coach-scenario", "coach-grade", "coach-advice"):
    _p = W.prompt_for(_t, {"age": "12 months old", "tipNotes": _tn})[0]
    check(_t + ": his tip answers are in the prompt", "She already does this" in _p and "Same bedtime song" in _p
          and "Don't suggest again" in _p and "No answer" not in _p, _p[:900])
    check(_t + ": no tip answers, no tip line", "try this week\" tips" not in W.prompt_for(_t, {"age": "1", "tipNotes": "x"})[0])
_pp = W.prompt_for("coach-scenario", {"age": "12 months old", "practising": ["Falling asleep in the crib with you nearby", "", 5]})[0]
check("coach-scenario: what he is working on (teach list) is in the prompt", "Falling asleep in the crib with you nearby" in _pp and "Now and then set the moment" in _pp and "{{practising}}" not in _pp, _pp[:900])
check("coach-scenario: nothing marked doing, no line", "What he is working on" not in W.prompt_for("coach-scenario", {"age": "1"})[0])
check("tip notes keep the last 6", W.tip_notes({"tipNotes": [{"tip": "t%d" % i, "tried": "It worked"} for i in range(9)]}).count("It worked") == 6)
check("tip notes are not sent to the other tasks", "try this week" not in W.prompt_for("advice", {"summary": "S", "tipNotes": _tn})[0])
check("real-situation prompt carries his words and the age", "car seat" in W.prompt_for("coach-advice", {"situation": "car seat", "age": "11 months old"})[0]
      and "11 months old" in W.prompt_for("coach-advice", {"situation": "car seat", "age": "11 months old"})[0])

for t in W.TASKS:
    _tpl = W.read_prompt(t)
    _names = set(re.findall(r"\{\{([a-z]+)\}\}", _tpl))
    check("prompts/" + t + ".md: every {{name}} has a value", _names <= set(W.prompt_values(t, {})), _names)
    check("prompts/" + t + ".md: nothing left unfilled", "{{" not in W.prompt_for(t, {})[0])
check("prompt files: what he typed that looks like {{rules}} stays as typed",
      '"{{rules}} and {{nope}}"' in W.prompt_for("coach-advice", {"situation": "{{rules}} and {{nope}}"})[0])
check("prompt files: rules come from prompts/rules.md", W.read_prompt("rules") in W.prompt_for("advice", {})[0])
try: W.fill("a {{nope}}", {}); check("fill: an unknown name is an error", False)
except ValueError: check("fill: an unknown name is an error", True)
_old = W.PROMPTS; W.PROMPTS = os.path.join(TMP, "no-prompts")
try: W.prompt_for("advice", {}); check("missing prompt file: a clear error", False)
except RuntimeError as e: check("missing prompt file: a clear error", "prompts/advice.md" in str(e), e)
W.PROMPTS = _old

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
fbx = lambda i, h, about, helped: {"id": "fb/calm/after/" + i, "at": today + "T%02d:00:00-04:00" % h, "part": "calm", "kind": "feedback", "data": {"about": about, "a": {"helped": helped} if helped else {"block": ["Nothing"]}}}
req("POST", "/v1/activity", {"events": [fbx("a", 1, "ground@1", "A bit"), fbx("b", 2, "ground@2", "Not really"), fbx("c", 3, "sigh@3", "Not really"),
                                        fbx("d", 4, "ground@4", None), fbx("e", 5, "ground@5", "Not really")]}, token=token)
cline = [l for l in W.summarize(7).splitlines() if l.startswith("- calm:")][0]
check("summary: calm helped per practice and a 'Not really' run", "helped (his answers): ground 1 of 3, sigh 0 of 1" in cline and "the last 3 said \"Not really\" in a row" in cline, cline)
# meditation-path sits (attention 1-3, what got in the way) and what Calm is for (the last aim sent wins; not an active day)
sit = lambda i, h, pid, f, hind: {"id": "calm/" + today + "T%02d:00:00-04:00/" % h + pid + "/e" + str(i), "at": today + "T%02d:00:00-04:00" % h, "part": "calm", "kind": "session",
                                   "data": {"practice": pid, "mins": 20, "before": None, "after": None, "focus": f, "hind": hind}}
req("POST", "/v1/activity", {"events": [sit(1, 6, "count", 3, ["Nothing much"]), sit(2, 7, "count", 1, ["Sleepy"]), sit(3, 9, "follow", 3, ["Sleepy", "Restless"]),
    {"id": "calm/aim/" + (datetime.date.today() - datetime.timedelta(days=1)).isoformat() + "/calm/", "at": (datetime.date.today() - datetime.timedelta(days=1)).isoformat() + "T12:00:00-04:00", "part": "calm", "kind": "target", "data": {"aim": "calm", "stage": None}},
    {"id": "calm/aim/" + today + "/train/follow", "at": today + "T12:00:00-04:00", "part": "calm", "kind": "target", "data": {"aim": "train", "stage": "follow"}}]}, token=token)
cline = [l for l in W.summarize(7).splitlines() if l.startswith("- calm:")][0]
check("summary: meditation-path sits per stage, attention, obstacles", "meditation-path sits: count 2, follow 1" in cline
      and "attention mostly steady in 2 of 3 rated sits (1 mostly lost in thought)" in cline and "got in the way: Sleepy 2, Restless 1" in cline, cline)
check("summary: the newest sit in the app's words", "last sit: follow 20 min, mostly steady, in the way: Sleepy, Restless" in cline, cline)
check("summary: no time-of-day line with all sits in the morning", "steadiest sits" not in cline, cline)
req("POST", "/v1/activity", {"events": [sit(4, 23, "follow", 1, ["Sleepy"]), sit(5, 22, "follow", 1, [])]}, token=token)
cline2 = [l for l in W.summarize(7).splitlines() if l.startswith("- calm:")][0]
check("summary: the time of day his sits go best", "steadiest sits in the morning (2 of 3 mostly steady; late at night 0 of 2)" in cline2, cline2)
check("sit_times: like CalmCore.pathWhen", W.sit_times([(6, 3), (7, 3), (9, 2), (23, 1), (0, 1)]).startswith("steadiest sits in the morning")
      and W.sit_times([(6, 3), (7, 1), (23, 3), (22, 1)]) == "" and W.sit_times([(6, 3), (7, 3), (8, 3), (9, 3)]) == "" and W.sit_times([(None, 3)]) == "")
check("summary: Calm aim (the newest wins)", "he uses Calm to train the mind (the meditation path, now at stage follow)" in cline, cline)
check("prompts: the weekly plan knows the sit options and the time-of-day note", all(x in open(os.path.join(os.path.dirname(os.path.abspath(W.__file__)), "prompts", "weekly-plan.md"), encoding="utf-8").read()
      for x in ("Quiet sit", "soft bell every 5 or 10 min", "steadiest sits")))
check("prompts: the weekly plan follows his meditation path", "put his current stage's id in calm.prefer" in open(os.path.join(os.path.dirname(os.path.abspath(W.__file__)), "prompts", "weekly-plan.md"), encoding="utf-8").read())
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
# rest days he logged with a reason: in the summary as "not missed"; one undone (/x) is dropped
r1, r2 = "workout/rest/" + today + "/" + today + "T20:00:00.000Z", "workout/rest/" + today + "/" + today + "T19:00:00.000Z"
req("POST", "/v1/activity", {"events": [
    {"id": r2, "at": today + "T12:00:00-04:00", "part": "workout", "kind": "rest-day", "text": "Tired", "data": {"date": today, "why": "Tired"}},
    {"id": r2 + "/x", "at": today + "T12:00:00-04:00", "part": "workout", "kind": "rest-removed"},
    {"id": r1, "at": today + "T12:00:00-04:00", "part": "workout", "kind": "rest-day", "text": "Busy day", "data": {"date": today, "why": "Busy day"}}]}, token=token)
rests = [e for e in W.recent_events(7) if e["id"].startswith("workout/rest/")]
check("rest day: the undone one and its /x are dropped", [e["data"]["why"] for e in rests] == ["Busy day"], rests)
summ = W.summarize(7)
check("summary: rest days named as not missed", "rest days he logged on purpose (not missed workouts): " + today + " Busy day" in summ and "Tired" not in summ, summ)
req("POST", "/v1/activity", {"events": [
    {"id": "workout/target/" + today + "/3", "at": today + "T12:00:00-04:00", "part": "workout", "kind": "target", "data": {"perWeek": 3}},
    {"id": "workout/target/" + today + "/2", "at": today + "T12:00:00-04:00", "part": "workout", "kind": "target", "data": {"perWeek": 2}}]}, token=token)
summ = W.summarize(7)
wline = [l for l in summ.splitlines() if l.startswith("- workout:")][0]
check("summary: the last weekly target sent is named; it isn't a workout kind", "he aims for 2 workouts a week (his setting)" in wline and "target" not in wline, summ)
check("prompts: plan around his weekly target", all("workouts a week" in open(os.path.join(os.path.dirname(os.path.abspath(W.__file__)), "prompts", f), encoding="utf-8").read() for f in ("weekly-plan.md", "advice.md")))
check("prompts: the weekly plan uses his Calm 'helped' answers", "never put one at 0 of 2 or more in calm.prefer" in open(os.path.join(os.path.dirname(os.path.abspath(W.__file__)), "prompts", "weekly-plan.md"), encoding="utf-8").read())
check("prompts: rest days are never 'inconsistent'", all("never call him inconsistent" in open(os.path.join(os.path.dirname(os.path.abspath(W.__file__)), "prompts", f), encoding="utf-8").read() for f in ("weekly-plan.md", "advice.md")))
req("POST", "/v1/activity", {"events": [
    {"id": "workout/sore/" + today + "/e100", "at": today + "T12:00:00-04:00", "part": "workout", "kind": "sore", "data": {"date": today, "level": "A bit"}},
    {"id": "workout/sore/" + today + "/e200", "at": today + "T12:00:00-04:00", "part": "workout", "kind": "sore", "data": {"date": today, "level": "Very"}}]}, token=token)
summ = W.summarize(7)
check("summary: soreness before a workout, newest answer only", "sore before a workout: " + today + " Very" in summ and today + " A bit" not in summ, summ)
req("POST", "/v1/activity", {"events": [
    {"id": "fb/calm/after/empty@x", "at": today + "T13:00:00-04:00", "part": "calm", "kind": "feedback", "data": {"about": "slow@emptycheck", "a": {}}}]}, token=token)
check("summary: an un-tapped (empty) quick answer isn't listed", "slow@emptycheck" not in W.summarize(7), W.summarize(7))
req("POST", "/v1/activity", {"events": [
    {"id": "calm/" + today + "T12:00:00.000Z/body", "at": today + "T12:00:00.000Z", "part": "calm", "kind": "session", "data": {"practice": "body", "mins": 8, "before": 4, "after": None}},
    {"id": "calm/" + today + "T12:00:00.000Z/body/e500", "at": today + "T12:00:00.000Z", "part": "calm", "kind": "session", "data": {"practice": "body", "mins": 8, "before": 4, "after": 2}}]}, token=token)
cs = [e for e in W.recent_events(7) if e["id"].startswith("calm/" + today + "T12:00:00.000Z/body")]
check("a calm session rated after it was sent: counted once, with the rating", [e["data"]["after"] for e in cs] == [2], cs)
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
# east of UTC the old files held early-morning events under the day before: also found there (and counted once)
early = datetime.datetime.combine(datetime.date.today(), datetime.time(6, 0)).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
yday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
W.append_lines(W.day_file(yday), [{"id": "calm/east", "at": early, "part": "calm", "kind": "session", "data": {"mins": 3}}])
st, o, _ = req("POST", "/v1/activity", {"events": [{"id": "calm/east", "at": early, "part": "calm", "kind": "session", "data": {"mins": 3}}]}, token=token)
check("an event already in the day-before file (east-of-UTC old version) is not saved twice", o.get("saved") == 0, o)
check("... and counts once for today", [e["id"] for e in W.recent_events(1)].count("calm/east") == 1)
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
# About you: check-ins and quick answers reach the summary and the weekly plan; a changed answer replaces the old one
evs = [{"id": "checkin/2026-11-19/e1", "at": "2026-11-19T12:00:00Z", "part": "checkin", "kind": "checkin", "data": {"sleep": "4–5 h", "wakes": "3+"}},
       {"id": "checkin/2026-11-19/e2", "at": "2026-11-19T12:00:00Z", "part": "checkin", "kind": "checkin", "data": {"sleep": "5–6 h", "wakes": "2"}, "text": "teething-note"},
       {"id": "fb/calm/after/body@x/e5", "at": "2026-11-19T13:00:00Z", "part": "calm", "kind": "feedback", "data": {"about": "body@x", "a": {"helped": "A bit"}}},
       {"id": "fb/calm/after/body@x/e9", "at": "2026-11-19T13:00:00Z", "part": "calm", "kind": "feedback", "data": {"about": "body@x", "a": {"helped": "A lot"}}},
       {"id": "fb/workout/notfit/coach:A/7", "at": "2026-11-19T14:00:00Z", "part": "workout", "kind": "not-for-me", "data": {"about": "coach:A", "a": {"reasons": ["Too generic"]}}, "text": "shown words | my note"}]
st, o, _ = req("POST", "/v1/activity", {"events": evs}, token=token)
check("check-in and answers accepted", st == 200, (st, o))
sm = W.summarize(14, datetime.date(2026, 11, 20))
check("summary has the newest check-in only", "sleep 5–6 h" in sm and "sleep 4–5 h" not in sm and "teething-note" in sm, sm)
check("summary has the newest answer and the not-for-me flag", "helped: A lot" in sm and "helped: A bit" not in sm and "NOT FOR ME" in sm and "my note" in sm, sm)
check("feedback isn't counted as activity", "1 feedback" not in sm, sm)
# a "not for me" he brought back (Settings) comes again as <id>/x: the plan stops counting it
req("POST", "/v1/activity", {"events": [{"id": "fb/calm/notfit/ground/9", "at": "2026-11-19T15:00:00Z", "part": "calm", "kind": "not-for-me", "data": {"about": "ground-unfit-test", "a": {"reasons": []}}},
    {"id": "fb/calm/notfit/ground/9/x", "at": "2026-11-19T16:00:00Z", "part": "calm", "kind": "not-for-me-removed"}]}, token=token)
sm2 = W.summarize(14, datetime.date(2026, 11, 20))
check("a not-for-me brought back is gone from the summary (and not counted as activity)", "ground-unfit-test" not in sm2 and "not-for-me-removed" not in sm2 and "NOT FOR ME [coach:A]" in sm2, sm2)
st, r = ask("weekly-plan", {"age": "12 months old", "checkins": {"2026-11-19": {"note": "teething-note"}}, "feedback": []})
check("weekly plan sees his check-ins", r.get("state") == "done" and "SAW-CHECKIN" in r["answer"].get("headline", ""), r)
plans = open(os.path.join(TMP, "progress", "plans", "weekly.jsonl"), encoding="utf-8").read().splitlines()
check("weekly plan kept on the PC", len(plans) == 1 and json.loads(plans[0])["answer"]["parts"]["calm"]["prefer"] == ["body"], plans)
args = json.load(open(FAKE + ".args"))
check("weekly plan can't use tools", args[args.index("--tools") + 1] == "", args)
# Cooking tasks (cook-plan & cook-photo with temp image file + cleanup) and autopilot notes in summary
st, r = ask("cook-plan", {"weekStart": "2026-11-23", "expiring": [{"name": "salmon", "daysLeft": 1}]})
check("cook-plan returns 7-day plan", r.get("state") == "done" and "salmon" in r["answer"].get("note", "").lower(), r)
import base64 as _b64
_tiny_jpg = _b64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 32 + b"\xff\xd9").decode("ascii")
st, r = ask("cook-photo", {"imageBase64": _tiny_jpg, "note": "fridge shelf", "pantry": []})
check("cook-photo writes temp image for Read tool and returns items",
      r.get("state") == "done" and r["answer"].get("summary") == "photo-exists=True" and len(r["answer"].get("items") or []) == 1, r)
args = json.load(open(FAKE + ".args"))
check("cook-photo allows Read tool only", args[args.index("--tools") + 1] == "Read" and args[args.index("--allowedTools") + 1] == "Read", args)
check("cook-photo cleans up temp image files after job", not any(f.startswith("cook-photo-") for f in os.listdir(W.STATE)))
st, o, _ = req("POST", "/v1/activity", {"events": [
    {"id": "note/n1", "at": today + "T15:00:00-04:00", "part": "app", "kind": "autopilot-note", "text": "Add exact timer to Calm", "data": {"where": "#calm", "tag": "Feature", "nid": "n1"}},
    {"id": "note/n1/r", "at": today + "T15:00:00-04:00", "part": "app", "kind": "autopilot-note", "text": "Add exact timer to Calm", "data": {"where": "#calm", "tag": "Feature", "nid": "n1", "read": today + "T20:00:00-04:00"}},
    {"id": "note/n2", "at": today + "T16:00:00-04:00", "part": "app", "kind": "autopilot-note", "text": "More Filipino recipes", "data": {"where": "#cook", "tag": "Idea", "nid": "n2"}},
    {"id": "cook/m1", "at": today + "T18:00:00-04:00", "part": "cook", "kind": "me-meal", "text": "Baked salmon", "data": {"meal": "dinner", "portion": "Large"}},
    {"id": "cook/c1", "at": today + "T12:00:00-04:00", "part": "cook", "kind": "child-meal", "text": "Soft egg", "data": {"meal": "lunch", "ate": "Most of it"}}
]}, token=token)
check("autopilot notes and cook events accepted", st == 200 and o.get("saved") == 5, (st, o))
_sm2 = W.summarize(7)
check("summary includes cook counts and autopilot notes section",
      "his meals: Baked salmon" in _sm2 and "little one: Soft egg" in _sm2 and "Notes he left for the autopilot" in _sm2 and "Add exact timer to Calm" in _sm2, _sm2)
check("summary: one line per note, read ones marked, new ones NEW",
      _sm2.count("Add exact timer to Calm") == 1 and "[read] Add exact timer to Calm" in _sm2 and "[NEW] More Filipino recipes" in _sm2, _sm2)

os.environ["WELLNESS_CLAUDE"] = os.path.join(TMP, "no-such-claude")
st, r = ask("advice", {})
check("no Claude Code: says how to fix it", r.get("state") == "error" and "Claude Code" in r.get("error", ""), r)
os.environ["WELLNESS_CLAUDE"] = FAKE

# ---------------------------------------------------------------- Gemini backup & reset schedule (Wed Claude / Mon Gemini)
_r_tue = W.next_reset(W.CLAUDE_RESET_DAY, W.CLAUDE_RESET_HOUR, datetime.datetime(2026, 11, 24, 18, 0))
check("Claude reset from Tue evening -> Wed noon", (_r_tue.year, _r_tue.month, _r_tue.day, _r_tue.hour, _r_tue.weekday()) == (2026, 11, 25, 12, 2), _r_tue)
_r_wed_am = W.next_reset(W.CLAUDE_RESET_DAY, W.CLAUDE_RESET_HOUR, datetime.datetime(2026, 11, 25, 9, 0))
check("Claude reset from Wed 9am -> same Wed noon", (_r_wed_am.day, _r_wed_am.hour) == (25, 12), _r_wed_am)
_r_wed_noon = W.next_reset(W.CLAUDE_RESET_DAY, W.CLAUDE_RESET_HOUR, datetime.datetime(2026, 11, 25, 12, 0))
check("Claude reset at/after Wed noon -> next Wed noon", (_r_wed_noon.month, _r_wed_noon.day, _r_wed_noon.hour) == (12, 2, 12), _r_wed_noon)
_r_sun = W.next_reset(W.GEMINI_RESET_DAY, W.GEMINI_RESET_HOUR, datetime.datetime(2026, 11, 29, 22, 0))
check("Gemini reset from Sun night -> Mon 00:00", (_r_sun.month, _r_sun.day, _r_sun.hour, _r_sun.weekday()) == (11, 30, 0, 0), _r_sun)
_r_mon = W.next_reset(W.GEMINI_RESET_DAY, W.GEMINI_RESET_HOUR, datetime.datetime(2026, 11, 30, 0, 0))
check("Gemini reset at Mon 00:00 -> next Mon 00:00", (_r_mon.month, _r_mon.day, _r_mon.hour, _r_mon.weekday()) == (12, 7, 0, 0), _r_mon)
_r_dst = W.next_reset(W.CLAUDE_RESET_DAY, W.CLAUDE_RESET_HOUR, datetime.datetime(2026, 10, 31, 15, 0))
check("Claude reset across DST end (1 Nov 2026) stays Wed 12:00 local", (_r_dst.month, _r_dst.day, _r_dst.hour) == (11, 4, 12), _r_dst)
check("is_usage_limit: catches quota/429/session limits, ignores auth/syntax/context limits",
      W.is_usage_limit("429 rate limit") and W.is_usage_limit("RESOURCE_EXHAUSTED") and W.is_usage_limit("weekly usage limit")
      and W.is_usage_limit("You've hit your session limit · resets 12:40am (America/Halifax)")
      and W.is_usage_limit("You've hit your 5-hour limit · resets 3pm")
      and not W.is_usage_limit("401 OAuth revoked") and not W.is_usage_limit("Invalid API key")
      and not W.is_usage_limit("Context length limit exceeded"))
check("is_usage_limit: a file size / tokens / recursion limit is not running out of usage (no Gemini hand-off until Wednesday)",
      not W.is_usage_limit("You have hit the file size limit") and not W.is_usage_limit("File size limit reached")
      and not W.is_usage_limit("Maximum recursion depth limit reached") and not W.is_usage_limit("reached the max output tokens limit")
      and W.is_usage_limit("Claude AI usage limit reached|1764000000") and W.is_usage_limit("You've hit your limit · resets 3pm")
      and W.is_usage_limit("429 Too Many Requests: token limit per minute"))
_sess_now = datetime.datetime(2026, 11, 26, 22, 50)
_sess_u = W.claude_reset_until("You've hit your session limit · resets 12:40am (America/Halifax)", _sess_now)
check("session limit with 'resets 12:40am' sets claude_until to 00:41 next day (not Wednesday)",
      (_sess_u.year, _sess_u.month, _sess_u.day, _sess_u.hour, _sess_u.minute) == (2026, 11, 27, 0, 41), _sess_u)
_sess_pm = W.claude_reset_until("You've hit your session limit · resets 3pm (America/Halifax)", datetime.datetime(2026, 11, 26, 11, 0))
check("session limit with 'resets 3pm' same day sets claude_until to 15:01 today",
      (_sess_pm.day, _sess_pm.hour, _sess_pm.minute) == (26, 15, 1), _sess_pm)
_sess_wk = W.claude_reset_until("You've hit your weekly limit · resets Wed 12pm (America/Halifax)", _sess_now)
check("weekly limit still resets on Wednesday noon",
      (_sess_wk.month, _sess_wk.day, _sess_wk.hour, _sess_wk.weekday()) == (12, 2, 12, 2), _sess_wk)
# the zone in the message wins over the PC's own zone (a PC set to Manila time, a Halifax reset time)
_zr = subprocess.run([sys.executable, "-c", "import datetime, sys; sys.path.insert(0, sys.argv[1]); import wellness_pc as W; "
                      "n = datetime.datetime(2026, 11, 27, 2, 50, tzinfo=datetime.timezone.utc); "
                      "u = W.claude_reset_until(\"You've hit your session limit \u00b7 resets 12:40am (America/Halifax)\", n); "
                      "print(u.astimezone(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M'))", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))],
                     capture_output=True, text=True, env=dict(os.environ, TZ="Asia/Manila"))
check("reset time read in the zone the message names (PC in Manila time): 00:41 Halifax = 04:41 UTC",
      _zr.stdout.strip() == "2026-11-27 04:41", (_zr.stdout + _zr.stderr)[-300:])
# summer DST (ADT = UTC-3) and UTC zone name, plus direct fallback check for Windows without tzdata
_z_sum = W.claude_reset_until("You've hit your session limit · resets 12:40am (America/Halifax)",
                              datetime.datetime(2026, 7, 15, 2, 50, tzinfo=datetime.timezone.utc))
check("summer Halifax reset uses ADT (UTC-3): 00:41 ADT = 03:41 UTC",
      _z_sum.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M") == "2026-07-15 03:41", _z_sum)
_z_utc = W.claude_reset_until("You've hit your session limit · resets 5am (UTC)",
                              datetime.datetime(2026, 11, 27, 2, 50, tzinfo=datetime.timezone.utc))
check("UTC zone in reset message parses cleanly",
      _z_utc.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M") == "2026-11-27 05:01", _z_utc)
_fb_hfx = W._NaDstZone("America/Halifax", -240)
check("fallback _NaDstZone matches Halifax winter (-4h), summer (-3h), and Nov 1 fall-back",
      datetime.datetime(2026, 11, 27, 4, 40, tzinfo=datetime.timezone.utc).astimezone(_fb_hfx).strftime("%H:%M %z") == "00:40 -0400"
      and datetime.datetime(2026, 7, 15, 3, 40, tzinfo=datetime.timezone.utc).astimezone(_fb_hfx).strftime("%H:%M %z") == "00:40 -0300"
      and datetime.datetime(2026, 11, 1, 4, 30, tzinfo=datetime.timezone.utc).astimezone(_fb_hfx).strftime("%H:%M %z") == "01:30 -0300"
      and datetime.datetime(2026, 11, 1, 5, 30, tzinfo=datetime.timezone.utc).astimezone(_fb_hfx).strftime("%H:%M %z") == "01:30 -0400")
_sess_fb = W.claude_reset_until("You've hit your session limit", _sess_now)
check("session limit without clock time falls back to +5 hours",
      (_sess_fb.day, _sess_fb.hour, _sess_fb.minute) == (27, 3, 50), _sess_fb)
check("gemini_tools_arg maps web search/fetch", W.gemini_tools_arg("WebSearch,WebFetch") == "google_web_search,web_fetch" and W.gemini_tools_arg("") == "")

# Claude limit with no Gemini installed -> clear error mentioning Wednesday + Gemini backup
st, r = ask("advice", {"question": "LIMIT-CLAUDE"})
check("Claude limit without Gemini CLI names Wednesday reset and Gemini backup",
      r.get("state") == "error" and "Wednesday" in r.get("error", "") and "Gemini" in r.get("error", ""), r)
W.write_json(W.AI_STATE_FILE, {})  # reset state before enabling Gemini

# Enable Gemini backup CLI
os.environ["WELLNESS_GEMINI"] = FAKE_G
for p in (FAKE + ".calls", FAKE_G + ".calls"):
    if os.path.exists(p): os.remove(p)

# 1. Claude hits usage limit -> same request succeeds on Gemini, and persists claude_until until Wednesday
st, r = ask("advice", {"question": "LIMIT-CLAUDE"})
check("Claude limit falls back to Gemini on the same request",
      r.get("state") == "done" and r.get("provider") == "gemini" and r["answer"].get("headline") == "from gemini", r)
g_args = json.load(open(FAKE_G + ".args"))
check("Gemini advice call has --output-format json and no --allowed-tools",
      "--output-format" in g_args and "json" in g_args and "--allowed-tools" not in g_args, g_args)
st_h, h, _ = req("GET", "/v1/health", token=token)
check("health reports Gemini backup active until Wednesday",
      st_h == 200 and h.get("gemini") is True and h.get("provider") == "gemini" and bool(h.get("claudeUntil")), h)

# 2. Next request skips Claude completely and stays on Gemini (grading gets google_web_search,web_fetch)
c_before = len(open(FAKE + ".calls").read().splitlines()) if os.path.exists(FAKE + ".calls") else 0
st, r = ask("coach-grade", {"child": "Kid", "age": "11 months", "scenario": "S", "question": "Q", "answer": "I pause"})
c_after = len(open(FAKE + ".calls").read().splitlines()) if os.path.exists(FAKE + ".calls") else 0
check("stays on Gemini without calling Claude again",
      c_after == c_before and r.get("state") == "done" and r.get("provider") == "gemini" and r["answer"].get("score") == 8, (c_before, c_after, r))
g_args = json.load(open(FAKE_G + ".args"))
check("Gemini grading maps tools to google_web_search,web_fetch",
      "--allowed-tools" in g_args and g_args[g_args.index("--allowed-tools") + 1] == "google_web_search,web_fetch", g_args)
hist_last = json.loads(open(os.path.join(TMP, "progress", "coach", "history.jsonl"), encoding="utf-8").read().splitlines()[-1])
check("coach history records provider=gemini", hist_last.get("provider") == "gemini", hist_last)

# 3. Gemini also hits its usage limit -> remembers Monday reset, tells user both resets
st, r = ask("advice", {"question": "LIMIT-GEMINI"})
check("both limits hit: names Wednesday (Claude) and Monday (Gemini)",
      r.get("state") == "error" and "Wednesday" in r.get("error", "") and "Monday" in r.get("error", ""), r)
ai_st = W.read_ai_state()
check("ai_state.json stores both claude_until and gemini_until", bool(ai_st.get("claude_until")) and bool(ai_st.get("gemini_until")), ai_st)

# 4. Time-travel: Thu Claude limit -> Sat Gemini limit -> Sun both out -> Mon Gemini resets -> Wed noon Claude resets
W.write_json(W.AI_STATE_FILE, {})
thu = datetime.datetime(2026, 11, 26, 10, 0)
sat = datetime.datetime(2026, 11, 28, 15, 0)
sun = datetime.datetime(2026, 11, 29, 12, 0)
mon = datetime.datetime(2026, 11, 30, 0, 5)
wed_before = datetime.datetime(2026, 12, 2, 11, 59)
wed_reset = datetime.datetime(2026, 12, 2, 12, 0)
ans, _, prov = W.run_ai("LIMIT-CLAUDE practical coach", "", now=thu)
check("Thu: Claude limit switches to Gemini (until Wed Dec 2 noon)", prov == "gemini" and W.read_ai_state()["claude_until"].startswith("2026-12-02T12:00:00"), W.read_ai_state())
try:
    W.run_ai("LIMIT-GEMINI practical coach", "", now=sat)
    check("Sat: Gemini limit recorded for Mon Nov 30", False)
except W.UsageLimitError as e:
    check("Sat: Gemini limit recorded for Mon Nov 30", "Monday" in str(e) and W.read_ai_state()["gemini_until"].startswith("2026-11-30T00:00:00"), (str(e), W.read_ai_state()))
g_before = len(open(FAKE_G + ".calls").read().splitlines())
try:
    W.run_ai("practical coach", "", now=sun)
    check("Sun: both still exhausted (neither CLI called)", False)
except W.UsageLimitError:
    g_after = len(open(FAKE_G + ".calls").read().splitlines())
    check("Sun: both still exhausted (neither CLI called)", g_after == g_before)
ans, _, prov = W.run_ai("practical coach", "", now=mon)
check("Mon 00:05: Gemini resets while Claude waits for Wed -> uses Gemini", prov == "gemini" and ans.get("headline") == "from gemini", (prov, ans))
ans, _, prov = W.run_ai("practical coach", "", now=wed_before)
check("Wed 11:59: still on Gemini just before Claude noon reset", prov == "gemini", prov)
ans, _, prov = W.run_ai("practical coach", "", now=wed_reset)
check("Wed 12:00: Claude resets -> automatically back on Claude", prov == "claude", prov)

# 5. Session limit ("You've hit your session limit · resets 12:40am (America/Halifax)") -> Gemini until 00:41, then back to Claude
W.write_json(W.AI_STATE_FILE, {})
t_hit = datetime.datetime(2026, 11, 26, 22, 50)
t_before = datetime.datetime(2026, 11, 27, 0, 40)
t_after = datetime.datetime(2026, 11, 27, 0, 41)
ans, _, prov = W.run_ai("CLAUDE-SESSION-LIMIT practical coach", "WebSearch,WebFetch", now=t_hit)
check("Session limit falls back to Gemini on same request and stores 00:41 reset",
      prov == "gemini" and ans.get("headline") == "from gemini"
      and W.read_ai_state()["claude_until"].startswith("2026-11-27T00:41:00"),
      (prov, ans, W.read_ai_state()))
ans, _, prov = W.run_ai("practical coach", "", now=t_before)
check("00:40: still on Gemini just before session reset", prov == "gemini", prov)
ans, _, prov = W.run_ai("practical coach", "", now=t_after)
check("00:41: automatically back on Claude after session reset", prov == "claude", prov)

# Gemini backup TimeoutExpired propagates cleanly (doesn't leak CLI command path via RuntimeError)
W.write_json(W.AI_STATE_FILE, {})
_orig_run_gemini = W.run_gemini
def _timeout_gemini(prompt, tools):
    raise subprocess.TimeoutExpired(["gemini", "-p"], 300)
W.run_gemini = _timeout_gemini
try:
    W.run_ai("LIMIT-CLAUDE practical coach", "", now=thu)
    check("Gemini backup timeout propagates TimeoutExpired cleanly", False)
except subprocess.TimeoutExpired:
    check("Gemini backup timeout propagates TimeoutExpired cleanly", True)
except Exception as e:
    check("Gemini backup timeout propagates TimeoutExpired cleanly", False, type(e).__name__ + ": " + str(e))
finally:
    W.run_gemini = _orig_run_gemini

# Clean up Gemini state/env for remaining tests
W.write_json(W.AI_STATE_FILE, {})
# find_gemini prefers Antigravity CLI (agy) and falls back to Desktop/Loudbook/tools/node/gemini.cmd
_fake_home = os.path.join(TMP, "fake-home")
_fake_local = os.path.join(TMP, "fake-local")
_lb_gem = os.path.join(_fake_home, "Desktop", "Loudbook", "tools", "node", "gemini.cmd")
_agy_exe = os.path.join(_fake_local, "agy", "bin", "agy.exe")
os.makedirs(os.path.dirname(_lb_gem), exist_ok=True)
open(_lb_gem, "w", encoding="utf-8").write("@echo off\n")
_old_wg, _old_which, _old_exp, _old_local = os.environ.pop("WELLNESS_GEMINI", None), W.shutil.which, W.os.path.expanduser, W.LOCAL
try:
    W.shutil.which = lambda _name: None
    W.os.path.expanduser = lambda p: _fake_home if p == "~" else _old_exp(p)
    W.LOCAL = _fake_local
    _found_lb = W.find_gemini()
    check("find_gemini locates Desktop/Loudbook/tools/node/gemini.cmd when agy absent", _found_lb == _lb_gem, _found_lb)
    os.makedirs(os.path.dirname(_agy_exe), exist_ok=True)
    open(_agy_exe, "w", encoding="utf-8").write("")
    _found_agy = W.find_gemini()
    check("find_gemini prefers LOCAL/agy/bin/agy.exe over legacy gemini.cmd", _found_agy == _agy_exe, _found_agy)
finally:
    W.shutil.which, W.os.path.expanduser, W.LOCAL = _old_which, _old_exp, _old_local
    if _old_wg is not None: os.environ["WELLNESS_GEMINI"] = _old_wg

# Fake Antigravity CLI (agy): stream-json stdin/stdout envelope, auth error, and quota error
_agy_dir = os.path.join(TMP, "agy-test")
os.makedirs(_agy_dir, exist_ok=True)
_agy_py = os.path.join(_agy_dir, "fake_agy.py")
open(_agy_py, "w", encoding="utf-8").write("""import json, sys
open(sys.argv[1] + ".args", "w", encoding="utf-8").write(json.dumps(sys.argv[2:]))
raw = sys.stdin.read().strip()
msg = json.loads(raw)
content = msg["message"]["content"]
print(json.dumps({"event": "init", "conversation_id": "c1"}))
if "AGY-AUTH" in content:
    print(json.dumps({"event": "result", "result": {"status": "ERROR", "response": "", "error": "authentication required"}}))
    sys.exit(1)
if "AGY-QUOTA" in content:
    print(json.dumps({"event": "result", "result": {"status": "ERROR", "response": "", "error": "429 out of credits"}}))
    sys.exit(1)
print(json.dumps({"event": "result", "result": {"status": "SUCCESS", "response": json.dumps({"headline": "from agy", "seen": content[:20]})}}))
""")
if os.name == "nt":
    _fake_agy = os.path.join(_agy_dir, "agy.cmd")
    open(_fake_agy, "w", encoding="utf-8").write(f'@echo off\r\n"{sys.executable}" "{_agy_py}" "{_fake_agy}" %*\r\n')
else:
    _fake_agy = os.path.join(_agy_dir, "agy")
    open(_fake_agy, "w", encoding="utf-8").write(f'#!{sys.executable}\nimport os, sys\nos.execv("{sys.executable}", ["{sys.executable}", "{_agy_py}", "{_fake_agy}"] + sys.argv[1:])\n')
    os.chmod(_fake_agy, 0o755)
os.environ["WELLNESS_GEMINI"] = _fake_agy
_agy_ans, _ = W.run_gemini("Hello from wellness prompt", "WebSearch")
_agy_args = json.load(open(_fake_agy + ".args", encoding="utf-8"))
check("agy stream-json sends --input-format/--output-format stream-json and parses result",
      _agy_ans.get("headline") == "from agy" and _agy_ans.get("seen") == "Hello from wellness "
      and "--input-format" in _agy_args and "stream-json" in _agy_args and "--disable-slash-commands" in _agy_args, (_agy_ans, _agy_args))
try:
    W.run_gemini("AGY-AUTH", "")
    check("agy authentication error tells user to run Sign in to Gemini.bat", False)
except RuntimeError as e:
    check("agy authentication error tells user to run Sign in to Gemini.bat", "Sign in to Gemini.bat" in str(e), str(e))
try:
    W.run_gemini("AGY-QUOTA", "")
    check("agy quota error raises UsageLimitError", False)
except W.UsageLimitError as e:
    check("agy quota error raises UsageLimitError", "Monday" in str(e), str(e))

os.environ["WELLNESS_GEMINI"] = os.path.join(TMP, "no-such-gemini")

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

# Advice summary counts active days from the first day there is any data, not a fixed window
_old = W.PROGRESS
W.PROGRESS = tempfile.mkdtemp(prefix="wpc-first-")
check("no data: no first day", W.first_day() is None, W.first_day())
W.append_lines(W.day_file("2026-11-19"), [{"id": "a1", "at": "2026-11-19T15:00:00Z", "part": "calm", "kind": "session", "data": {"mins": 5}}])
W.append_lines(W.day_file("2026-11-20"), [{"id": "a2", "at": "2026-11-20T15:00:00Z", "part": "faith", "kind": "awe"}])
check("first day is the earliest event", W.first_day() == "2026-11-19", W.first_day())
sm = W.summarize(14, datetime.date(2026, 11, 20))
check("2-day-old app: active 2 of 2 days", "Active on 2 of 2 days (the log starts 2026-11-19)." in sm, sm)
W.append_lines(W.day_file("2026-11-30"), [{"id": "a3", "at": "2026-11-30T15:00:00Z", "part": "faith", "kind": "awe"}])
sm = W.summarize(7, datetime.date(2026, 12, 1))
check("old enough: the full window", "Active on 1 of 7 days." in sm and "log starts" not in sm, sm)
# an evening event filed under the next UTC day (old-style file name) still counts from its local day
W.append_lines(W.day_file("2026-11-18"), [{"id": "a0", "at": "2026-11-18T01:30:00Z", "part": "faith", "kind": "awe"}])
check("old-style file: local day wins", W.first_day() == "2026-11-17", W.first_day())
# impossible calendar dates never crash save_events
check("clean_event rejects impossible date 2026-02-30", W.clean_event({"id": "bad1", "at": "2026-02-30T10:00:00Z", "part": "faith", "kind": "awe"}) is None)
check("clean_event rejects impossible date 2026-99-99", W.clean_event({"id": "bad2", "at": "2026-99-99", "part": "faith", "kind": "awe"}) is None)
check("clean_event rejects bad time suffix", W.clean_event({"id": "bad3", "at": "2026-11-20T99:99:99Z", "part": "faith", "kind": "awe"}) is None)
check("save_events ignores impossible dates without crashing", W.save_events([
    {"id": "bad1", "at": "2026-02-30T10:00:00Z", "part": "faith", "kind": "awe"},
    {"id": "good1", "at": "2026-11-21T15:00:00Z", "part": "faith", "kind": "awe"}
]) == 1)
W.PROGRESS = _old

# forget
W.main(["x", "forget"])
st, o, _ = req("GET", "/v1/health", token=token)
check("forget unpairs", st == 401, st)

print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
