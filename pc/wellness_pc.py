"""Wellness PC link: the phone app's helper on Braeden's own PC.

What it does for a paired phone (home Wi-Fi only):
  * Activity log: the phone sends what he does in every part of the app (faith days and prayers, calm sessions and
    stress ratings, workout sets, Tagalog lessons/answers/reviews, to-dos; journal text only if he turns that on).
    It is appended to Desktop/wellness-progress/activity/<date>.jsonl, one event per line, never twice.
    `python wellness_pc.py summary` prints the trends Claude's autopilot reads every run.
  * Claude: the parenting coach (scenarios and grading), Tagalog answer checks and advice run through Claude Code's
    own `claude -p` on this PC, signed in as him, using his own plan. Nothing else is installed or stored for it:
    no keys, no tokens copied anywhere. Each request is one `claude -p` run in wellness-progress/claude-work.
  * Tagalog: "my week" goes to wellness-progress/tagalog-week-<date>.json for the weekly lesson run.

Security (same design as Loudbook's PC voice): HTTPS with the PC's own certificate, which the phone pins at pairing;
pairing needs a one-time code shown on the PC (PBKDF2-stretched, the PC proves it first, 5 tries, 10 minutes);
each phone then has its own 256-bit key (the PC keeps only its hash); private network addresses only; size limits.

  python wellness_pc.py serve      run it (the setup starts it when Windows starts)
  python wellness_pc.py pair       show a pairing code and wait for the phone
  python wellness_pc.py forget     unpair every phone
  python wellness_pc.py summary [days]   the activity trends (default 7 days)
"""
import base64, datetime, glob, hashlib, hmac, http.server, ipaddress, json, os, re, secrets, shutil, socket, ssl
import subprocess, sys, threading, time

VERSION = 1
PORT = int(os.environ.get("WELLNESS_PORT", "8780"))
DISCOVERY_PORT = PORT + 1
MAX_BODY = 1024 * 1024             # one batch of events (the phone sends at most ~200 KB at a time)
MAX_EVENTS = 5000
MAX_TEXT = 6000
PAIR_MINUTES = 10
PAIR_TRIES = 5
CLAUDE_TIMEOUT = int(os.environ.get("WELLNESS_CLAUDE_TIMEOUT", "300"))
STATE = os.environ.get("WELLNESS_STATE") or os.path.join(
    os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.local/share"), "Wellness", "pc")
PROGRESS = os.environ.get("WELLNESS_PROGRESS") or os.path.join(os.path.expanduser("~"), "Desktop", "wellness-progress")
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"   # no 0/O, 1/I/L
# the app's newest build (tools/build-apk.sh writes it): the phone updates itself from here at home
DIST = os.environ.get("WELLNESS_DIST") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
LOCAL = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.local/share")

# ---- voices (Loudbook's): the phone downloads its voice files from here once, and the PC reads with Loudbook's PC voice
# Kokoro (English): the copy Loudbook's PC voice setup downloaded. Tagalog: Meta's MMS Tagalog voice (facebook/mms-tts-tgl,
# CC BY-NC 4.0, personal use), converted for the phone, in the wellness folder's voices\ (not in git: too big).
VOICE_PACKS = {
    # (WELLNESS_KOKORO / WELLNESS_TAGALOG: another folder instead, e.g. for tests)
    "kokoro": {"dirs": [os.environ.get("WELLNESS_KOKORO") or os.path.join(LOCAL, "Loudbook", "models", "kokoro-multi-lang-v1_0")],
               "files": ["model.onnx", "voices.bin"]},
    "tagalog": {"dirs": [os.environ.get("WELLNESS_TAGALOG") or
                         os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "voices", "mms-tgl")],
                "files": ["model.onnx"]},
}
LB_STATE = os.environ.get("LOUDBOOK_STATE") or os.path.join(LOCAL, "Loudbook", "server")
LB_PORT = int(os.environ.get("LOUDBOOK_PORT", "8770"))


def voice_dir(pack):
    v = VOICE_PACKS.get(pack)
    if not v: return None
    for d in v["dirs"]:
        if d and all(os.path.isfile(os.path.join(d, f)) for f in v["files"]): return d
    return None


def voice_info():
    out = {}
    for k, v in VOICE_PACKS.items():
        d = voice_dir(k)
        out[k] = {"files": [{"name": f, "size": os.path.getsize(os.path.join(d, f))} for f in v["files"]]} if d else None
    out["pcVoice"] = os.path.isfile(os.path.join(LB_STATE, "cert.pem"))
    return out


def loudbook_link():
    """(token, fingerprint) for talking to Loudbook's PC voice on this PC. This server is one of its devices (its own key,
    kept in this server's state; Loudbook keeps only the key's hash, like for a phone)."""
    try:
        with open(os.path.join(LB_STATE, "cert.pem"), "rb") as f: fp = hashlib.sha256(ssl.PEM_cert_to_DER_cert(f.read().decode())).hexdigest()
    except (OSError, ValueError): raise RuntimeError("Loudbook's PC voice isn't set up on this PC")
    me = read_json("loudbook.json", {})
    tok = me.get("token")
    devs_path = os.path.join(LB_STATE, "devices.json")
    try:
        with open(devs_path, encoding="utf-8") as f: devs = json.load(f)
    except (OSError, ValueError): devs = []
    if not tok or not any(d.get("hash") == hashlib.sha256(unb64(tok)).hexdigest() for d in devs):
        t = secrets.token_bytes(32); tok = b64(t)
        devs.append({"name": "Wellness PC link (this PC)", "hash": hashlib.sha256(t).hexdigest(), "added": now_iso()})
        tmp = devs_path + ".tmp.wellness"
        with open(tmp, "w", encoding="utf-8") as f: json.dump(devs, f, indent=1)
        swap_in(tmp, devs_path)
        write_json("loudbook.json", {"token": tok})
    return tok, fp


def loudbook_speak(text, sid, speed, engine="natural", timeout=60):
    """Asks Loudbook's PC voice (natural voice on the graphics card, else Kokoro) for one piece of speech.
    Returns (16-bit PCM bytes, sample rate, engine used, speed it was made at)."""
    tok, fp = loudbook_link()
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE   # pinned below
    import http.client
    c = http.client.HTTPSConnection("127.0.0.1", LB_PORT, context=ctx, timeout=timeout)
    try:
        body = json.dumps({"text": text, "sid": sid, "speed": speed, "engine": engine}).encode()
        c.connect()
        if hashlib.sha256(c.sock.getpeercert(binary_form=True)).hexdigest() != fp: raise RuntimeError("not Loudbook's PC voice")
        c.request("POST", "/v1/speak", body=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + tok})
        r = c.getresponse(); data = r.read()
        if r.status != 200:
            try: msg = json.loads(data).get("error")
            except ValueError: msg = None
            raise RuntimeError("Loudbook's PC voice said " + str(msg or r.status))
        return data, int(r.getheader("X-Sample-Rate") or 24000), r.getheader("X-Engine") or "", r.getheader("X-Made-At") or "1.0"
    except (OSError, http.client.HTTPException) as e:
        raise RuntimeError("Loudbook's PC voice isn't running (" + str(e)[:80] + ")")
    finally: c.close()
PARTS = ("faith", "calm", "workout", "tagalog", "todo", "coach", "checkin", "app")


def path(name):
    os.makedirs(STATE, exist_ok=True)
    return os.path.join(STATE, name)


def progress(*names):
    p = os.path.join(PROGRESS, *names)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def b64(b): return base64.urlsafe_b64encode(b).decode().rstrip("=")
def unb64(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
def now_iso(): return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def read_json(name, default):
    try:
        with open(path(name), encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return default


def write_json(name, data):
    tmp = path(name + ".tmp." + str(threading.get_ident()))
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, indent=1)
    swap_in(tmp, path(name))


def swap_in(part, dest, wait=20.0):
    """os.replace, retried for a while: on Windows a file someone has open can't be replaced for a moment."""
    t0 = time.time()
    while True:
        try:
            os.replace(part, dest); return
        except PermissionError:
            if time.time() - t0 > wait:
                try: os.remove(part)
                except OSError: pass
                raise
            time.sleep(0.25)


# ------------------------------------------------------------------ certificate
def ensure_cert():
    cert, key = path("cert.pem"), path("key.pem")
    if not (os.path.exists(cert) and os.path.exists(key)):
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509.oid import NameOID
        k = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Wellness PC")])
        now = datetime.datetime.now(datetime.timezone.utc)
        c = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
             .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
             .not_valid_after(now + datetime.timedelta(days=3650)).sign(k, hashes.SHA256()))
        with open(key, "wb") as f:
            f.write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        with open(cert, "wb") as f: f.write(c.public_bytes(serialization.Encoding.PEM))
    return cert, key


def fingerprint():
    with open(path("cert.pem"), "rb") as f: der = ssl.PEM_cert_to_DER_cert(f.read().decode())
    return hashlib.sha256(der).digest()


# ------------------------------------------------------------------ pairing (as Loudbook's, own salt)
def pair_key(code):
    code = "".join(ch for ch in code.upper() if ch in ALPHABET)
    return hashlib.pbkdf2_hmac("sha256", code.encode(), b"wellness-pair-v1", 200_000, 32)


def mac(key, who, nc, ns, fp):
    return hmac.new(key, who + b"|" + nc + ns + fp, hashlib.sha256).digest()


class Pairing:
    """Pairing mode is switched on by `pair` (a file only this Windows user can write)."""
    lock = threading.Lock()
    sessions = {}
    starts = {}

    @classmethod
    def active(cls):
        p = read_json("pairing.json", None)
        if not p or time.time() > p.get("expires", 0) or p.get("tries", 0) >= PAIR_TRIES: return None
        return p

    @classmethod
    def start(cls, nc, fp):
        with cls.lock:
            p = cls.active()
            if not p: return None
            n = cls.starts.get(p["key"], 0) + 1
            cls.starts = {p["key"]: n}
            if n > 30: return None                              # no harvesting answers to guess from
            ns = secrets.token_bytes(16)
            cls.sessions = {k: v for k, v in cls.sessions.items() if v > time.time()}
            cls.sessions[(nc, ns)] = time.time() + 60
            return {"ns": b64(ns), "mac": b64(mac(unb64(p["key"]), b"server", nc, ns, fp)), "fp": fp.hex()}

    @classmethod
    def finish(cls, nc, ns, client_mac, name, fp):
        with cls.lock:
            p = cls.active()
            if not p or cls.sessions.pop((nc, ns), 0) < time.time(): return None
            if not hmac.compare_digest(mac(unb64(p["key"]), b"client", nc, ns, fp), client_mac):
                p["tries"] = p.get("tries", 0) + 1
                write_json("pairing.json", p)
                return None
            token = secrets.token_bytes(32)
            devices = read_json("devices.json", [])
            devices.append({"name": str(name)[:60], "hash": hashlib.sha256(token).hexdigest(), "added": now_iso()})
            write_json("devices.json", devices)
            p["expires"] = 0                                   # one phone per code
            write_json("pairing.json", p)
            return b64(token)


def token_ok(token):
    try: h = hashlib.sha256(unb64(token)).hexdigest()
    except Exception: return False
    ok = False
    for d in read_json("devices.json", []):
        ok |= hmac.compare_digest(d.get("hash", ""), h)
    return ok


def new_code():
    raw = "".join(secrets.choice(ALPHABET) for _ in range(12))
    return raw[:4] + "-" + raw[4:8] + "-" + raw[8:]


# ------------------------------------------------------------------ the activity log
activity_lock = threading.Lock()
DATE_RE = re.compile(r"^\d{4}-\d\d-\d\d")


def clean_event(e):
    """One event from the phone, checked: {id, at, part, kind, text?, data?}. None if it isn't one."""
    if not isinstance(e, dict): return None
    eid, at, part, kind = e.get("id"), e.get("at"), e.get("part"), e.get("kind")
    if not (isinstance(eid, str) and 0 < len(eid) <= 120 and isinstance(at, str) and DATE_RE.match(at)
            and part in PARTS and isinstance(kind, str) and 0 < len(kind) <= 40):
        return None
    out = {"id": eid, "at": at[:40], "part": part, "kind": kind}
    if isinstance(e.get("text"), str): out["text"] = e["text"][:MAX_TEXT]
    if isinstance(e.get("data"), dict):
        d = json.dumps(e["data"], ensure_ascii=False)
        if len(d) <= MAX_TEXT: out["data"] = e["data"]
    return out


def day_file(day): return progress("activity", day + ".jsonl")


def local_day(at):
    """The PC's local date of an event time. The phone sends UTC ("...Z"), so an evening in Halifax is already the
    next day in UTC: filing by at[:10] put 20:00-midnight activity under tomorrow (and out of today's summary)."""
    try:
        t = datetime.datetime.fromisoformat(str(at).replace("Z", "+00:00"))
        return (t.astimezone() if t.tzinfo else t).date().isoformat()
    except (ValueError, OverflowError, OSError):
        return str(at)[:10]


def read_day(day):
    out = []
    try:
        with open(day_file(day), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try: out.append(json.loads(line))
                except ValueError: pass                       # a line cut short by a crash: skip it
    except OSError: pass
    return out


def append_lines(path, recs):
    """Appends one JSON line per record. A line cut short by a crash has no newline: end it first, or the next
    record would join it and be lost."""
    with open(path, "a+b") as f:
        if f.tell() > 0:
            f.seek(-1, os.SEEK_END)
            if f.read(1) != b"\n": f.write(b"\n")
        for r in recs: f.write((json.dumps(r, ensure_ascii=False) + "\n").encode("utf-8"))


def save_events(events):
    """Appends the events not already in their day's file. Returns how many were new."""
    by_day = {}
    for e in events:
        c = clean_event(e)
        if c: by_day.setdefault(local_day(c["at"]), []).append(c)
    new = 0
    with activity_lock:
        for day, evs in sorted(by_day.items()):
            # older versions filed by the UTC date: an event already there (the next day's file west of UTC, the day
            # before east of it) is not saved again
            d0 = datetime.date.fromisoformat(day)
            nxt, prv = (d0 + datetime.timedelta(days=1)).isoformat(), (d0 - datetime.timedelta(days=1)).isoformat()
            seen = {x.get("id") for x in read_day(day) + read_day(nxt) + read_day(prv)}
            fresh = []
            for e in sorted(evs, key=lambda x: x["at"]):
                if e["id"] in seen: continue
                seen.add(e["id"]); fresh.append(e)
            if not fresh: continue
            append_lines(day_file(day), fresh)
            new += len(fresh)
    return new


def recent_events(days, today=None):
    today = today or datetime.date.today()
    out, first, ids0 = [], (today - datetime.timedelta(days=days - 1)).isoformat(), set()
    # one file more each side: older versions filed by the UTC date (evening events under the next day west of UTC,
    # early-morning ones under the day before east of it)
    for i in range(days, -2, -1):
        for e in read_day((today - datetime.timedelta(days=i)).isoformat()):
            d = local_day(e.get("at", ""))
            if first <= d <= today.isoformat() and e.get("id") not in ids0:
                ids0.add(e.get("id")); out.append(e)
    # Journal / prayer events sent again with their words get the old id + "/t": count each once (the one with words).
    ids = {e.get("id") for e in out}
    out = [e for e in out if not (isinstance(e.get("id"), str) and e["id"] + "/t" in ids)]
    # Workout sets fixed on the phone come again as <id>/e<ms> (newest wins); removed ones as <id>/x (all dropped).
    # A finished workout and a ticked to-do carry their time the same way (finished again after "Carry on": newest wins),
    # and so do a changed check-in (checkin/<day>/e<ms>) a changed quick answer (fb/<id>/e<ms>) and a calm session rated afterwards (calm/<at>/<id>/e<ms>).
    newest, gone = {}, set()
    for e in out:
        m = re.match(r"^((?:workout|todo|checkin|fb|calm)/.+)/(e(\d+)|x)$", str(e.get("id", "")))
        if not m: continue
        if m.group(2) == "x": gone.add(m.group(1))
        elif int(m.group(3)) > newest.get(m.group(1), -1): newest[m.group(1)] = int(m.group(3))
    def keep(e):
        i = str(e.get("id", ""))
        m = re.match(r"^((?:workout|todo|checkin|fb|calm)/.+)/(e(\d+)|x)$", i)
        base = m.group(1) if m else i
        if base in gone: return False
        if base in newest: return bool(m) and m.group(2) != "x" and int(m.group(3)) == newest[base]
        return not (m and m.group(2) == "x")
    return [e for e in out if keep(e)]


def first_day():
    """The PC's local date of the first event it ever got (None before any). Older files were named by the UTC date,
    so the earliest two files are read and the earliest local date in them wins."""
    try: names = sorted(f[:-6] for f in os.listdir(os.path.join(PROGRESS, "activity"))
                        if re.match(r"^\d{4}-\d\d-\d\d\.jsonl$", f))
    except OSError: return None
    days = [local_day(e["at"]) for n in names[:2] for e in read_day(n) if e.get("at")]
    return min(days) if days else None


def summarize(days=7, today=None):
    """Plain-words trends for the last `days` days: what Claude reads to choose next steps."""
    today = today or datetime.date.today()
    ev = recent_events(days, today)
    lines = [f"Activity {(today - datetime.timedelta(days=days - 1)).isoformat()} to {today.isoformat()}: {len(ev)} events."]
    if not ev:
        lines.append("Nothing logged yet (the phone sends its log when it is on home Wi-Fi with the PC link paired).")
        return "\n".join(lines)
    active_days = sorted({local_day(e["at"]) for e in ev})
    # count from the first day there is any data: a 2-day-old app is "active 2 of 2 days", not "2 of 14"
    span, first = days, first_day()
    if first:
        try: span = max(1, min(days, (today - datetime.date.fromisoformat(first)).days + 1))
        except ValueError: pass
    span = max(span, len(active_days))
    lines.append(f"Active on {len(active_days)} of {span} days" + (f" (the log starts {first})." if span < days else "."))
    per = {}
    for e in ev: per.setdefault(e["part"], []).append(e)

    def kinds(es):
        k = {}
        for e in es: k[e["kind"]] = k.get(e["kind"], 0) + 1
        return ", ".join(f"{n} {name}" for name, n in sorted(k.items(), key=lambda x: -x[1]))

    for part in PARTS:
        es = [e for e in per.get(part, []) if e["kind"] not in ("feedback", "not-for-me")]
        if part == "checkin":
            if es: lines.append("- check-ins (his own words, newest last): " + "; ".join(
                local_day(e["at"]) + " " + ", ".join(f"{k} {v}" for k, v in (e.get("data") or {}).items())
                + (f" ({e['text']})" if e.get("text") else "") for e in es[-10:]))
            else: lines.append("- check-ins: none")
            continue
        if not es: lines.append(f"- {part}: nothing"); continue
        d = len({local_day(e["at"]) for e in es})
        extra = ""
        if part == "calm":
            r = [e["data"] for e in es if e["kind"] == "session" and isinstance(e.get("data"), dict)
                 and e["data"].get("before") and e["data"].get("after")]
            mins = sum(float((e.get("data") or {}).get("mins") or 0) for e in es if e["kind"] == "session")
            extra = f"; {mins:.0f} min"
            if r: extra += f"; stress {sum(x['before'] for x in r) / len(r):.1f} -> {sum(x['after'] for x in r) / len(r):.1f} (1-5)"
        elif part == "workout":
            sets = [e for e in es if e["kind"] == "set"]
            ex = {}
            for s in sets:
                dd = s.get("data") or {}
                ex.setdefault(dd.get("ex", "?"), []).append(dd)
            extra = "; " + "; ".join(f"{name}: " + ", ".join(str(x.get("val")) + (f"@{x.get('w')}lb" if x.get("w") else "") for x in v[-6:])
                                     for name, v in list(ex.items())[:10]) if ex else ""
        elif part == "tagalog":
            ans = [e for e in es if e["kind"] in ("answer", "review")]
            ok = [e for e in ans if (e.get("data") or {}).get("ok") or (e.get("data") or {}).get("right")]
            if ans: extra = f"; {len(ok)}/{len(ans)} right"
            said = [e for e in ans if (e.get("data") or {}).get("dir") == "say"]
            if said: extra += f"; said in Tagalog {sum(1 for e in said if (e.get('data') or {}).get('right'))}/{len(said)}"
            wrong = [(e.get("data") or {}).get("tl") or (e.get("data") or {}).get("prompt") for e in ans
                     if not ((e.get("data") or {}).get("ok") or (e.get("data") or {}).get("right"))]
            wrong = [w for w in wrong if w]
            if wrong: extra += "; missed: " + ", ".join(sorted(set(wrong))[:12])
        elif part == "coach":
            sc = [(e.get("data") or {}) for e in es if e["kind"] == "graded"]
            if sc: extra = "; scores " + ", ".join(f"{x.get('skill', '?')} {x.get('score')}" for x in sc[-8:])
        elif part == "todo":
            done = [e.get("text", "") for e in es if e["kind"] == "done"]
            if done: extra = "; done: " + ", ".join(t for t in done[-8:] if t)
        lines.append(f"- {part}: {kinds(es)} on {d} day(s){extra}")
    fb = [e for e in ev if e["kind"] in ("feedback", "not-for-me")]
    if fb:
        lines.append("His quick answers (after things he did) and \"not for me\" flags, newest last:")
        for e in fb[-40:]:
            d = e.get("data") or {}
            a = d.get("a") or {}
            ans = "; ".join(f"{k}: {', '.join(str(x) for x in v) if isinstance(v, list) else v}" for k, v in a.items()) if isinstance(a, dict) else str(a)
            lines.append(f"  - {local_day(e['at'])} {e['part']} {'NOT FOR ME' if e['kind'] == 'not-for-me' else 'answers'}"
                         f" [{d.get('about', '')}] {ans}" + (f" | {e['text']}" if e.get("text") else ""))
    last = max(e["at"] for e in ev)
    lines.append(f"Last event: {last}.")
    return "\n".join(lines)


# ------------------------------------------------------------------ Claude (his own Claude Code CLI)
def find_claude():
    env = os.environ.get("WELLNESS_CLAUDE")
    if env: return env if os.path.exists(env) else shutil.which(env)
    found = shutil.which("claude")
    if found: return found
    home = os.path.expanduser("~")
    for p in (os.path.join(home, ".local", "bin", "claude.exe"), os.path.join(home, ".local", "bin", "claude"),
              os.path.join(os.environ.get("APPDATA", ""), "npm", "claude.cmd")):
        if p and os.path.exists(p): return p
    return None


SKILLS = ["Connection", "Calm under stress", "Sleep", "Feeding", "Play and learning", "Safety", "Routines",
          "Crying and comfort", "Looking after yourself", "Family and partner"]

def j(x): return json.dumps(x, ensure_ascii=False)


def can_do(inp):
    """What she can do now, from her dad's own setup on the phone: trusted over typical milestones."""
    c = str(inp.get("can") or "").strip()[:500]
    if not c: return ""
    return (f"What she can already do, from her dad (trust this over typical milestones for her age): {j(c)}. "
            "Keep everything within what she can and can't do yet: treat what's listed as things she does easily "
            "now (not new or worrying), and don't have her do things a child her age usually can't. ")


PROMPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
# the tools each task may use (the rest get none); cloud runs answering queued requests use the same prompts
TOOLS = {"coach-grade": "WebSearch,WebFetch", "coach-advice": "WebSearch,WebFetch"}
# what a prompt says when the phone sent nothing for a field
DEFAULTS = {"coach-scenario": {"child": "his baby", "age": "about one year old",
                               "skill": "pick the one he needs most from his recent scores"},
            "coach-grade": {"age": "about one"}, "coach-advice": {"age": "about one"},
            "weekly-plan": {"age": "about one year old"}}


def prompt_values(task, inp):
    """The {{name}} values for pc/prompts/<task>.md. Plain fields go in as text, quoted fields as JSON."""
    d = DEFAULTS.get(task, {})
    v = {k: str(inp.get(k) or d.get(k, "")) for k in ("child", "age", "skill")}
    v.update({k: j(inp.get(k) or "") for k in ("scenario", "question", "answer", "situation", "task", "expected")})
    v["recent"] = j(inp.get("recent") or []); v["avoid"] = j(inp.get("avoid") or [])
    v["summary"] = str(inp.get("summary") or "")
    v["phone"] = j({"checkins": inp.get("checkins"), "feedback": inp.get("feedback")})[:20000]
    v["can"] = can_do(inp); v["skills"] = j(SKILLS); v["rules"] = read_prompt("rules")
    return v


def fill(template, values):
    """{{name}} -> values[name], in one pass (text he typed that looks like {{x}} stays as it is)."""
    def one(m):
        if m.group(1) not in values: raise ValueError("prompt template needs " + m.group(1))
        return values[m.group(1)]
    return re.sub(r"\{\{([a-z]+)\}\}", one, template)


def read_prompt(name):
    try:
        with open(os.path.join(PROMPTS, name + ".md"), encoding="utf-8") as f: return f.read().rstrip("\n")
    except OSError: raise RuntimeError("The PC link's prompt file prompts/" + name + ".md is missing. Update the wellness folder.")


def prompt_for(task, inp):
    """(prompt, tools allowed) for a task. inp is the phone's checked input. The text is pc/prompts/<task>.md."""
    if task not in TASKS: raise ValueError("unknown task")
    return fill(read_prompt(task), prompt_values(task, inp)), TOOLS.get(task, "")


def run_claude(prompt, tools):
    exe = find_claude()
    if not exe: raise RuntimeError("Claude Code isn't on this PC (or not on PATH). Install it and sign in once, then try again.")
    work = progress("claude-work", "README.txt")
    if not os.path.exists(work):
        with open(work, "w", encoding="utf-8") as f:
            f.write("Working folder for the Wellness app's Claude requests (claude -p). Safe to empty.\n")
    args = [exe, "-p", "--output-format", "json", "--max-turns", "12"]
    # only the tools a task needs (checked with Claude Code 2.1: --tools "" = none; listed ones are also pre-approved,
    # since nobody is there to approve them)
    args += ["--tools", tools, "--allowedTools", tools] if tools else ["--tools", ""]
    t0 = time.time()
    r = subprocess.run(args, input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       cwd=os.path.dirname(work), timeout=CLAUDE_TIMEOUT,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    secs = round(time.time() - t0, 1)
    out = (r.stdout or "").strip()
    try: env = json.loads(out)
    except ValueError: env = None
    if not isinstance(env, dict):
        tail = (r.stderr or out or "").strip().splitlines()[-3:]
        said = " ".join(tail)[:300]
        if said and explain_error(said) != "Claude: " + said: raise RuntimeError(explain_error(said))
        raise RuntimeError("Claude didn't answer" + (": " + said if said else f" (exit {r.returncode})"))
    if env.get("is_error") or env.get("subtype", "success") != "success":
        raise RuntimeError(explain_error(str(env.get("result") or env.get("subtype") or "error")))
    return parse_answer(str(env.get("result") or "")), secs


def explain_error(msg):
    """Claude Code's error, in words he can act on."""
    m = msg.lower()
    if "401" in m or "authenticate" in m or "oauth" in m or "revoked" in m or "not logged in" in m or "/login" in m:
        return ("Claude Code on your PC needs you to sign in again (its login ran out). On the PC, double-click "
                "\"Sign in to Claude Code.bat\" in the wellness folder, then try again.")
    if "429" in m or "rate limit" in m or "usage limit" in m or "limit reached" in m:
        return "Your Claude usage limit is reached for now; it resets in a few hours. Try again then."
    return "Claude: " + msg[:300]


def parse_answer(text):
    """The JSON object in Claude's answer (it may be wrapped in a ``` block or have words around it)."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m: t = m.group(1)
    start = t.find("{")
    while start >= 0:
        depth, instr, esc = 0, False, False
        for i in range(start, len(t)):
            ch = t[i]
            if instr:
                if esc: esc = False
                elif ch == "\\": esc = True
                elif ch == '"': instr = False
            elif ch == '"': instr = True
            elif ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        o = json.loads(t[start:i + 1])
                        if isinstance(o, dict): return o
                    except ValueError: pass
                    break
        start = t.find("{", start + 1)
    return {"text": text.strip()[:MAX_TEXT]}


TASKS = ("coach-scenario", "coach-grade", "coach-advice", "tagalog-check", "advice", "weekly-plan")


class Jobs:
    """Claude runs one at a time (each takes 10 s to a few minutes); the phone polls /v1/job."""
    lock = threading.Lock()
    run_lock = threading.Lock()
    jobs = {}

    @classmethod
    def start(cls, task, inp):
        if task not in TASKS: raise ValueError("unknown task")
        if not isinstance(inp, dict): raise ValueError("input must be an object")
        inp = {k: (v[:MAX_TEXT] if isinstance(v, str) else v) for k, v in list(inp.items())[:20]}
        if task in ("advice", "weekly-plan"): inp["summary"] = summarize(14)
        prompt, tools = prompt_for(task, inp)
        jid = secrets.token_hex(8)
        with cls.lock:
            old = [k for k, v in cls.jobs.items() if v["state"] != "running" and time.time() - v["t"] > 3600]
            for k in old: del cls.jobs[k]
            if sum(1 for v in cls.jobs.values() if v["state"] == "running") >= 3:
                raise RuntimeError("Claude is busy with three requests already; try again in a minute")
            cls.jobs[jid] = {"state": "running", "task": task, "t": time.time()}
        threading.Thread(target=cls._run, args=(jid, task, inp, prompt, tools), daemon=True).start()
        return jid

    @classmethod
    def _run(cls, jid, task, inp, prompt, tools):
        with cls.run_lock:
            try:
                ans, secs = run_claude(prompt, tools)
                res = {"state": "done", "answer": ans, "secs": secs}
                cls.remember(task, inp, ans)
            except subprocess.TimeoutExpired:
                res = {"state": "error", "error": "Claude took too long (over %d s)" % CLAUDE_TIMEOUT}
            except Exception as e:                                       # noqa: BLE001 (any failure goes to the phone)
                res = {"state": "error", "error": str(e)[:400]}
        with cls.lock:
            cls.jobs[jid].update(res); cls.jobs[jid]["t"] = time.time()
        print(f"{now_iso()} {task}: {res['state']}" + (f" in {res.get('secs')} s" if "secs" in res else f" ({res.get('error')})"), flush=True)

    @staticmethod
    def remember(task, inp, ans):
        """Coach answers are kept on the PC too (progress over time, for him and for Claude's runs)."""
        if task == "weekly-plan":
            # kept on the PC (his progress folder) so autopilot runs and later plans can see what was planned
            with activity_lock: append_lines(progress("plans", "weekly.jsonl"), [{"at": now_iso(), "answer": ans}])
            return
        if not task.startswith("coach"): return
        rec = {"at": now_iso(), "task": task, "input": {k: v for k, v in inp.items() if k != "summary"}, "answer": ans}
        with activity_lock: append_lines(progress("coach", "history.jsonl"), [rec])

    @classmethod
    def get(cls, jid):
        with cls.lock:
            j_ = cls.jobs.get(jid)
            return dict(j_) if j_ else None


# ------------------------------------------------------------------ HTTP
class RateLimit:
    lock = threading.Lock(); hits = {}

    @classmethod
    def ok(cls, ip, per_minute=240):
        with cls.lock:
            t = time.time()
            h = [x for x in cls.hits.get(ip, []) if t - x < 60]
            h.append(t); cls.hits[ip] = h
            return len(h) <= per_minute


def private_ip(ip):
    try:
        a = ipaddress.ip_address(ip)
        if getattr(a, "ipv4_mapped", None): a = a.ipv4_mapped
        return a.is_private or a.is_loopback or a in ipaddress.ip_network("100.64.0.0/10")
    except ValueError: return False


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "WellnessPC/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args): pass

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def send_bytes(self, code, data, ctype, headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def send_file(self, f, ctype):
        try: fh = open(f, "rb")
        except OSError: return self.reply(404, {"error": "not on the PC"})
        with fh:
            size = os.fstat(fh.fileno()).st_size
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header("Connection", "close")
            self.end_headers()
            shutil.copyfileobj(fh, self.wfile, 1 << 20)
        self.close_connection = True

    def send_apk(self):
        f = os.path.join(DIST, "Wellness.apk")
        try: fh = open(f, "rb")
        except OSError: return self.reply(404, {"error": "no app build on the PC"})
        with fh:
            size = os.fstat(fh.fileno()).st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header("Content-Length", str(size))
            self.send_header("Connection", "close")
            self.end_headers()
            shutil.copyfileobj(fh, self.wfile, 65536)
        self.close_connection = True

    def guard(self):
        ip = self.client_address[0]
        if not private_ip(ip): self.reply(403, {"error": "home network only"}); return False
        if not RateLimit.ok(ip): self.reply(429, {"error": "too many requests"}); return False
        return True

    def authed(self):
        a = self.headers.get("Authorization", "")
        if a.startswith("Bearer ") and token_ok(a[7:].strip()): return True
        self.reply(401, {"error": "this phone isn't paired with the PC (pair it again)"}); return False

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY: raise ValueError("request too big" if n else "empty request")
        o = json.loads(self.rfile.read(n).decode("utf-8"))
        if not isinstance(o, dict): raise ValueError("expected an object")
        return o

    def do_GET(self):
        if not self.guard(): return
        p = self.path.split("?", 1)
        if p[0] == "/v1/hello":
            return self.reply(200, {"app": "wellness", "version": VERSION})
        if not self.authed(): return
        if p[0] == "/v1/health":
            return self.reply(200, {"app": "wellness", "version": VERSION, "claude": bool(find_claude()),
                                    "name": socket.gethostname()})
        if p[0] == "/v1/app/version":
            try:
                with open(os.path.join(DIST, "version.json"), encoding="utf-8") as f: v = json.load(f)
                return self.reply(200, {"code": int(v["code"]), "name": str(v.get("name", "")), "size": int(v.get("size", 0))})
            except (OSError, ValueError, KeyError, TypeError): return self.reply(404, {"error": "no app build on the PC"})
        if p[0] == "/v1/voice/info":
            return self.reply(200, voice_info())
        if p[0] == "/v1/voice/get":
            q = dict(x.split("=", 1) for x in (p[1] if len(p) > 1 else "").split("&") if "=" in x)
            pack, name = q.get("pack", ""), q.get("f", "")
            d = voice_dir(pack)
            if not d or name not in VOICE_PACKS[pack]["files"]: return self.reply(404, {"error": "that voice isn't on the PC"})
            return self.send_file(os.path.join(d, name), "application/octet-stream")
        if p[0] == "/v1/app/apk":
            return self.send_apk()
        if p[0] == "/v1/job":
            q = dict(x.split("=", 1) for x in (p[1] if len(p) > 1 else "").split("&") if "=" in x)
            jb = Jobs.get(q.get("id", ""))
            if not jb: return self.reply(404, {"error": "no such request (the PC may have restarted)"})
            jb.pop("t", None)
            return self.reply(200, jb)
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if not self.guard(): return
        try: b = self.body()
        except ValueError as e: return self.reply(400, {"error": str(e)})
        p = self.path
        fp = fingerprint()
        if p == "/v1/pair/start":
            try: nc = unb64(b["nc"])
            except Exception: return self.reply(400, {"error": "bad request"})
            r = Pairing.start(nc, fp)
            return self.reply(200, r) if r else self.reply(403, {"error": "pairing isn't on: run \"Pair a phone.bat\" on the PC"})
        if p == "/v1/pair/finish":
            try: nc, ns, cm = unb64(b["nc"]), unb64(b["ns"]), unb64(b["mac"])
            except Exception: return self.reply(400, {"error": "bad request"})
            t = Pairing.finish(nc, ns, cm, b.get("name", "phone"), fp)
            if t: print(f"{now_iso()} paired: {str(b.get('name', 'phone'))[:60]}", flush=True)
            return self.reply(200, {"token": t}) if t else self.reply(403, {"error": "wrong code"})
        if not self.authed(): return
        if p == "/v1/activity":
            ev = b.get("events")
            if not isinstance(ev, list) or len(ev) > MAX_EVENTS: return self.reply(400, {"error": "events must be a list"})
            n = save_events(ev)
            if isinstance(b.get("tagalogWeek"), dict):
                save_tagalog_week(b["tagalogWeek"])
            return self.reply(200, {"saved": n, "got": len(ev)})
        if p == "/v1/ask":
            try: return self.reply(200, {"job": Jobs.start(b.get("task"), b.get("input") or {})})
            except (ValueError, RuntimeError) as e: return self.reply(400, {"error": str(e)})
        if p == "/v1/speak":
            text = b.get("text")
            if not isinstance(text, str) or not text.strip() or len(text) > 2000: return self.reply(400, {"error": "bad text"})
            try: sid = max(0, min(52, int(b.get("sid", 6)))); speed = max(0.5, min(2.0, float(b.get("speed", 1.0))))
            except (TypeError, ValueError): return self.reply(400, {"error": "bad request"})
            engine = "kokoro" if b.get("engine") == "kokoro" else "natural"
            try: pcm, rate, used, made = loudbook_speak(text, sid, speed, engine)
            except RuntimeError as e: return self.reply(503, {"error": str(e)})
            return self.send_bytes(200, pcm, "audio/L16", {"X-Sample-Rate": str(rate), "X-Engine": used, "X-Made-At": made})
        if p == "/v1/summary":
            try: days = max(1, min(90, int(b.get("days", 7))))
            except (TypeError, ValueError): days = 7
            return self.reply(200, {"summary": summarize(days)})
        self.reply(404, {"error": "not found"})


def save_tagalog_week(summary):
    """The phone's Tagalog "my week" (weeklySummary) for the weekly lesson run: one file per week (its Monday)."""
    s = json.dumps(summary, ensure_ascii=False, indent=1)
    if len(s) > MAX_BODY: return
    d = datetime.date.today()
    monday = d - datetime.timedelta(days=d.weekday())
    with open(progress(f"tagalog-week-{monday.isoformat()}.json"), "w", encoding="utf-8") as f: f.write(s)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32

    def get_request(self):
        sock, addr = super().get_request()
        sock.settimeout(30)
        return sock, addr


def discovery_loop(fp_hex):
    """Answers the phone's "WELLNESS?" broadcast with where to find this PC."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", DISCOVERY_PORT))
    except OSError as e:
        print("discovery off:", e, flush=True); return
    msg = json.dumps({"app": "wellness", "port": PORT, "fp": fp_hex, "name": socket.gethostname()}).encode()
    while True:
        try:
            data, addr = s.recvfrom(64)
            if data.strip() == b"WELLNESS?" and private_ip(addr[0]): s.sendto(msg, addr)
        except OSError: time.sleep(1)


def restart_on_update(every=20):
    """When Claude updates this file (the autopilot syncs new versions into the folder), restart into the new code:
    exit code 3 makes start-pc.cmd start it again at once. A run that was started before an update kept serving the
    old version, so the phone's new requests (its voice download, app updates) got "not found"."""
    me = os.path.abspath(__file__)
    try: t0 = os.path.getmtime(me)
    except OSError: return
    while True:
        time.sleep(every)
        try: t = os.path.getmtime(me)
        except OSError: continue
        if t != t0:
            time.sleep(3)                                              # (the file may still be being written)
            try:
                compile(open(me, encoding="utf-8").read(), me, "exec")  # only restart into code that at least parses
            except (SyntaxError, OSError, ValueError):
                t0 = t; continue
            while Jobs.run_lock.locked(): time.sleep(5)                # never in the middle of a Claude request
            print(f"{now_iso()} the PC link was updated: restarting", flush=True)
            os._exit(3)


def serve():
    cert, key = ensure_cert()
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(cert, key)
    httpd = Server(("0.0.0.0", PORT), Handler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    threading.Thread(target=discovery_loop, args=(fingerprint().hex(),), daemon=True).start()
    threading.Thread(target=restart_on_update, args=(float(os.environ.get("WELLNESS_UPDATE_CHECK", "20")),), daemon=True).start()
    os.makedirs(PROGRESS, exist_ok=True)
    print(f"{now_iso()} Wellness PC link ready on port {PORT}; Claude Code: {find_claude() or 'NOT FOUND'}; "
          f"progress folder: {PROGRESS}", flush=True)
    httpd.serve_forever()


def lan_addresses():
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("192.168.1.1", 9)); out.append(s.getsockname()[0]); s.close()
    except OSError: pass
    try:
        for a in socket.gethostbyname_ex(socket.gethostname())[2]:
            if a not in out and private_ip(a) and not a.startswith("127."): out.append(a)
    except OSError: pass
    return out


def pair():
    ensure_cert()
    code = new_code()
    write_json("pairing.json", {"key": b64(pair_key(code)), "expires": time.time() + PAIR_MINUTES * 60, "tries": 0})
    print()
    print("  Pair your phone with this PC")
    print("  ============================")
    print("  On the phone: Wellness > Settings > PC link > Pair. The phone usually finds this PC by itself;")
    print("  if not, type this PC's address: " + (" or ".join(lan_addresses()) or "(see ipconfig)"))
    print()
    print("     Code:  " + code)
    print()
    print(f"  The code works once, for {PAIR_MINUTES} minutes. Waiting...")
    n0 = len(read_json("devices.json", []))
    t_end = time.time() + PAIR_MINUTES * 60
    while time.time() < t_end:
        time.sleep(1)
        devs = read_json("devices.json", [])
        if len(devs) > n0:
            print(f"  Paired: {devs[-1].get('name')}. You can close this window."); return 0
        p = read_json("pairing.json", {})
        if p.get("tries", 0) >= PAIR_TRIES:
            print("  Too many wrong codes. Run this again for a new one."); return 1
    print("  The code ran out. Run this again for a new one.")
    return 1


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "serve"
    if cmd == "serve": serve()
    elif cmd == "pair": return pair()
    elif cmd == "forget":
        write_json("devices.json", []); print("Every phone is unpaired.")
    elif cmd == "summary":
        print(summarize(int(argv[2]) if len(argv) > 2 else 7))
    else:
        print(__doc__); return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv) or 0)
