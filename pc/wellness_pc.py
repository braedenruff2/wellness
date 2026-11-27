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
PARTS = ("faith", "calm", "workout", "tagalog", "todo", "coach", "cook", "checkin", "app")


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
    try:
        datetime.date.fromisoformat(at[:10])
        if len(at) > 10: datetime.datetime.fromisoformat(at.replace("Z", "+00:00"))
    except ValueError:
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


def local_hour(at):
    """The PC's local hour of an event time (None when it can't be read)."""
    try:
        t = datetime.datetime.fromisoformat(str(at).replace("Z", "+00:00"))
        return (t.astimezone() if t.tzinfo else t).hour
    except (ValueError, OverflowError, OSError):
        return None


SIT_PARTS = (("morning", "in the morning"), ("afternoon", "in the afternoon"), ("evening", "in the evening"), ("late", "late at night"))


def sit_times(sits):
    """Which time of day his meditation-path sits go best, the same rule as CalmCore.pathWhen in the app: 4+ rated
    sits, a part of the day with 2+ sits (1+ mostly steady) beating another with 2+ by a third or more. sits: (hour, focus)."""
    g = [[0, 0] for _ in SIT_PARTS]
    n = 0
    for h, f in sits:
        if h is None or f not in (1, 2, 3): continue
        k = 0 if 5 <= h < 12 else 1 if 12 <= h < 18 else 2 if 18 <= h < 22 else 3
        g[k][0] += 1; g[k][1] += 1 if f == 3 else 0; n += 1
    ok = [(i, c, st, st / c) for i, (c, st) in enumerate(g) if c >= 2]
    if n < 4 or len(ok) < 2: return ""
    best = sorted(ok, key=lambda x: (-x[3], -x[1]))[0]
    worst = sorted(ok, key=lambda x: (x[3], -x[1]))[0]
    if best[0] == worst[0] or best[2] < 1 or best[3] - worst[3] < 1 / 3 - 1e-9: return ""
    return (f"steadiest sits {SIT_PARTS[best[0]][1]} ({best[2]} of {best[1]} mostly steady; "
            f"{SIT_PARTS[worst[0]][1]} {worst[2]} of {worst[1]})")


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
    # (the daily weekly-target event is a setting, not something he did that day)
    active_days = sorted({local_day(e["at"]) for e in ev if e.get("kind") != "target"})
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
            # what Calm is for (his setting; the last one sent wins), not something he did
            tg = sorted([e for e in es if e["kind"] == "target" and isinstance(e.get("data"), dict)], key=lambda e: e["at"])
            es = [e for e in es if e["kind"] != "target"]
            aim = (tg[-1]["data"] if tg else {}) or {}
            aim_txt = ("he uses Calm to train the mind (the meditation path, now at stage " + str(aim.get("stage") or "count")
                       + "), not mainly for stress") if aim.get("aim") == "train" else ("he uses Calm mainly to feel calmer" if aim.get("aim") == "calm" else "")
            if not es:
                lines.append("- calm: nothing" + (f"; {aim_txt}" if aim_txt else "")); continue
            d = len({local_day(e["at"]) for e in es})
            r = [e["data"] for e in es if e["kind"] == "session" and isinstance(e.get("data"), dict)
                 and e["data"].get("before") and e["data"].get("after")]
            mins = sum(float((e.get("data") or {}).get("mins") or 0) for e in es if e["kind"] == "session")
            extra = f"; {mins:.0f} min"
            if r: extra += f"; stress {sum(x['before'] for x in r) / len(r):.1f} -> {sum(x['after'] for x in r) / len(r):.1f} (1-5)"
            # his "Did it help?" answers per practice, and how many of the newest said "Not really" in a row
            hp = sorted([e for e in ev if e["part"] == "calm" and e["kind"] == "feedback" and isinstance(e.get("data"), dict)
                         and isinstance(e["data"].get("a"), dict) and e["data"]["a"].get("helped")], key=lambda e: e["at"])
            if hp:
                tally = {}
                for e in hp:
                    pid = str(e["data"].get("about", "")).split("@")[0] or "?"
                    y, n = tally.get(pid, (0, 0))
                    tally[pid] = (y + (1 if e["data"]["a"]["helped"] in ("A lot", "A bit") else 0), n + 1)
                extra += "; helped (his answers): " + ", ".join(f"{k} {y} of {n}" for k, (y, n) in tally.items())
                flat = 0
                for e in reversed(hp):
                    if e["data"]["a"]["helped"] != "Not really": break
                    flat += 1
                if flat >= 3: extra += f"; the last {flat} said \"Not really\" in a row: suggest something different, not more of the same"
            # sits on the meditation path: how many per stage, how steady his attention was, what got in the way
            sits = [e["data"] for e in es if e["kind"] == "session" and isinstance(e.get("data"), dict)
                    and e["data"].get("practice") in ("count", "follow", "note", "change", "open")]
            if sits:
                stg = {}
                for x in sits: stg[x["practice"]] = stg.get(x["practice"], 0) + 1
                extra += "; meditation-path sits: " + ", ".join(f"{k} {n}" for k, n in stg.items())
                fr = [x["focus"] for x in sits if x.get("focus") in (1, 2, 3)]
                if fr: extra += f"; attention mostly steady in {fr.count(3)} of {len(fr)} rated sits ({fr.count(1)} mostly lost in thought)"
                hd = {}
                for x in sits:
                    for h in x.get("hind") or []:
                        if h != "Nothing much": hd[h] = hd.get(h, 0) + 1
                if hd: extra += "; got in the way: " + ", ".join(f"{k} {n}" for k, n in hd.items())
                tw = sit_times([(local_hour(e["at"]), e["data"].get("focus")) for e in es if e["kind"] == "session" and isinstance(e.get("data"), dict)
                                and e["data"].get("practice") in ("count", "follow", "note", "change", "open")])
                if tw: extra += "; " + tw
            if aim_txt: extra += "; " + aim_txt
        elif part == "workout":
            # his weekly target: the last one sent (sorted() is stable, so on the same day the later one wins)
            tg = [e for e in es if e["kind"] == "target"]
            es = [e for e in es if e["kind"] != "target"]
            aim = f"he aims for {(sorted(tg, key=lambda e: e['at'])[-1].get('data') or {}).get('perWeek')} workouts a week (his setting)" if tg else ""
            if not es:
                lines.append("- workout: nothing" + (f"; {aim}" if aim else "")); continue
            # days he trained (a rest day or a soreness answer isn't one)
            d = len({local_day(e["at"]) for e in es if e["kind"] not in ("rest-day", "sore")})
            sets = [e for e in es if e["kind"] == "set"]
            ex = {}
            for s in sets:
                dd = s.get("data") or {}
                ex.setdefault(dd.get("ex", "?"), []).append(dd)
            extra = "; " + "; ".join(f"{name}: " + ", ".join(str(x.get("val")) + (f"@{x.get('w')}lb" if x.get("w") else "") for x in v[-6:])
                                     for name, v in list(ex.items())[:10]) if ex else ""
            sore = [e for e in es if e["kind"] == "sore" and (e.get("data") or {}).get("level") in ("A bit", "Very")]
            if sore:
                extra += "; sore before a workout: " + ", ".join(f"{(e.get('data') or {}).get('date') or local_day(e['at'])} {(e['data'] or {}).get('level')}" for e in sore[-8:])
            rests = [e for e in es if e["kind"] == "rest-day"]
            if rests:
                extra += ("; rest days he logged on purpose (not missed workouts): "
                          + ", ".join(f"{(e.get('data') or {}).get('date') or local_day(e['at'])} {(e.get('data') or {}).get('why') or e.get('text', '')}" for e in rests[-10:]))
            if aim: extra += "; " + aim
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
        elif part == "cook":
            me_m = [e.get("text", "") for e in es if e["kind"] == "me-meal"]
            ch_m = [e.get("text", "") for e in es if e["kind"] == "child-meal"]
            bits = []
            if me_m: bits.append("his meals: " + ", ".join(me_m[-5:]))
            if ch_m: bits.append("little one: " + ", ".join(ch_m[-5:]))
            if bits: extra = "; " + "; ".join(bits)
        lines.append(f"- {part}: {kinds(es)} on {d} day(s){extra}")
    notes = [e for e in ev if e["part"] == "app" and e["kind"] == "autopilot-note" and e.get("text")]
    if notes:
        lines.append("Notes he left for the autopilot (newest last):")
        for e in notes[-20:]:
            lines.append(f"  - {local_day(e['at'])} {e['text']}")
    # an answer he tapped and then un-tapped arrives as an empty one (newest wins on the PC): nothing to say about it
    fb = [e for e in ev if e["kind"] == "not-for-me" or (e["kind"] == "feedback" and (e.get("text") or ((e.get("data") or {}).get("a") or {})))]
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


# ------------------------------------------------------------------ Claude & Gemini backup (his own CLIs)
CLAUDE_RESET_DAY = 2   # Wednesday (0=Mon .. 6=Sun), noon local time
CLAUDE_RESET_HOUR = 12
GEMINI_RESET_DAY = 0   # Monday, start of day local time
GEMINI_RESET_HOUR = 0
GEMINI_TOOLS = {"WebSearch": "google_web_search", "WebFetch": "web_fetch", "Read": "read_file"}
AI_STATE_FILE = "ai_state.json"
ai_state_lock = threading.Lock()


class UsageLimitError(RuntimeError):
    """Raised when Claude or Gemini rejects a request because its usage/quota is used up."""


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


def is_agy_exe(exe):
    """True when exe is the Antigravity CLI (agy / agy.exe / agy.cmd)."""
    base = os.path.basename(str(exe or "")).lower()
    return base in ("agy", "agy.exe", "agy.cmd", "agy.bat")


def find_gemini():
    env = os.environ.get("WELLNESS_GEMINI")
    if env: return env if os.path.exists(env) else shutil.which(env)
    home = os.path.expanduser("~")
    # Prefer Antigravity CLI (agy: supports personal Google accounts), then legacy Gemini CLI.
    found = shutil.which("agy")
    if found: return found
    for p in (os.path.join(LOCAL, "agy", "bin", "agy.exe"),
              os.path.join(home, ".local", "bin", "agy")):
        if p and os.path.exists(p): return p
    found = shutil.which("gemini")
    if found: return found
    for p in (os.path.join(os.environ.get("APPDATA", ""), "npm", "gemini.cmd"),
              os.path.join(home, "Desktop", "Loudbook", "tools", "node", "gemini.cmd"),
              os.path.join(home, ".local", "bin", "gemini.exe"),
              os.path.join(home, ".local", "bin", "gemini"),
              os.path.join(home, ".npm-global", "bin", "gemini")):
        if p and os.path.exists(p): return p
    return None


def _local_now(now=None):
    if now is None: return datetime.datetime.now().astimezone()
    return now.astimezone() if now.tzinfo else now.astimezone()


def next_reset(weekday, hour=0, now=None):
    """Next local occurrence of (weekday 0=Mon..6=Sun, hour:00) strictly after now (DST-safe)."""
    n = _local_now(now)
    days = (weekday - n.weekday()) % 7
    d = n.date() + datetime.timedelta(days=days)
    cand = datetime.datetime(d.year, d.month, d.day, hour, 0, 0).astimezone()
    if cand <= n:
        d = d + datetime.timedelta(days=7)
        cand = datetime.datetime(d.year, d.month, d.day, hour, 0, 0).astimezone()
    return cand


LIMIT_RE = re.compile(
    r"\b(?:hit|reached)\s+(?:your\s+)?(?:[\w-]+\s+){0,3}limit\b"
    r"|\bexceeded\s+(?:your\s+)?(?:rate|usage|quota|session|weekly|daily|hourly|credit)\s+limit\b"
    r"|\blimit\b[^\n]{0,40}\bresets?\b",
    re.I,
)
RESET_TIME_RE = re.compile(r"\bresets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", re.I)
RESET_DATE_RE = re.compile(
    r"\bresets?\s+(?:on\s+)?(?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)",
    re.I,
)


def is_usage_limit(msg):
    """True when a Claude or Gemini error means usage/quota is exhausted (not an auth or syntax error)."""
    m = str(msg or "").lower()
    if any(k in m for k in (
        "429", "rate limit", "rate_limit", "usage limit", "session limit", "weekly limit",
        "daily limit", "hourly limit", "5-hour limit", "limit reached", "hit your limit",
        "out of usage", "out of extra usage", "you've reached your",
        "quota", "resource_exhausted", "resource exhausted", "too many requests", "exhausted your capacity",
        "out of credits", "insufficient credits"
    )):
        return True
    return bool(LIMIT_RE.search(m))


def claude_reset_until(msg, now=None):
    """When Claude's limit ends: for a short session/5-hour limit with a clock time (e.g. 'resets 12:40am'),
    use the next local occurrence of that clock time (+1 min buffer); otherwise Wednesday noon."""
    n = _local_now(now)
    m = str(msg or "")
    ml = m.lower()
    weekly_until = next_reset(CLAUDE_RESET_DAY, CLAUDE_RESET_HOUR, n)
    if "weekly" in ml or RESET_DATE_RE.search(m):
        return weekly_until
    tm = RESET_TIME_RE.search(m)
    if tm:
        hr, mn, ap = int(tm.group(1)), int(tm.group(2) or 0), tm.group(3).lower()
        if 1 <= hr <= 12 and 0 <= mn <= 59:
            hr24 = (0 if hr == 12 else hr) if ap == "am" else (12 if hr == 12 else hr + 12)
            d = n.date()
            cand = datetime.datetime(d.year, d.month, d.day, hr24, mn, 0).astimezone()
            if cand <= n:
                d = d + datetime.timedelta(days=1)
                cand = datetime.datetime(d.year, d.month, d.day, hr24, mn, 0).astimezone()
            return min(cand + datetime.timedelta(minutes=1), weekly_until)
    if "session limit" in ml or "5-hour" in ml:
        return min(n + datetime.timedelta(hours=5), weekly_until)
    return weekly_until


def read_ai_state():
    with ai_state_lock:
        st = read_json(AI_STATE_FILE, {})
        return st if isinstance(st, dict) else {}


def is_exhausted(st, provider, now=None):
    raw = (st or {}).get(provider + "_until")
    if not isinstance(raw, str) or not raw: return False
    try:
        until = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if until.tzinfo is None: until = until.astimezone()
        return _local_now(now) < until
    except ValueError:
        return False


def mark_exhausted(provider, now=None, msg=""):
    until = (claude_reset_until(msg, now) if provider == "claude"
             else next_reset(GEMINI_RESET_DAY, GEMINI_RESET_HOUR, now))
    with ai_state_lock:
        st = read_json(AI_STATE_FILE, {})
        if not isinstance(st, dict): st = {}
        st[provider + "_until"] = until.isoformat()
        write_json(AI_STATE_FILE, st)
    return until


def ai_status(now=None):
    st = read_ai_state()
    c_out = is_exhausted(st, "claude", now)
    g_out = is_exhausted(st, "gemini", now)
    c_ok = bool(find_claude()) and not c_out
    g_ok = bool(find_gemini()) and not g_out
    prov = "claude" if c_ok else ("gemini" if g_ok else "none")
    return {
        "provider": prov,
        "claudeUntil": st.get("claude_until") if c_out else None,
        "geminiUntil": st.get("gemini_until") if g_out else None,
    }


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


def tip_notes(inp):
    """His answers on earlier "try this week" tips (tried it / not for me + his note), from the phone's tipNotes."""
    t = inp.get("tipNotes")
    if not isinstance(t, list): return ""
    out = []
    for x in t[-6:]:
        if not isinstance(x, dict) or not isinstance(x.get("tip"), str) or not x["tip"].strip(): continue
        o = {"tip": x["tip"].strip()[:300]}
        if isinstance(x.get("tried"), str) and x["tried"].strip(): o["tried it"] = x["tried"].strip()[:40]
        if x.get("notForMe"):
            o["not for me"] = True
            rs = [str(r)[:40] for r in x.get("reasons") or [] if isinstance(r, str)][:5] if isinstance(x.get("reasons"), list) else []
            if rs: o["reasons"] = rs
        if isinstance(x.get("note"), str) and x["note"].strip(): o["his note"] = x["note"].strip()[:600]
        if len(o) > 1: out.append(o)
    if not out: return ""
    return (f"His answers on earlier \"try this week\" tips, newest last: {j(out)}. Don't suggest again anything he says "
            "he already does, she already does, or that didn't fit; build on what worked, and where something didn't work "
            "try a different angle. ")


PROMPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
# the tools each task may use (the rest get none); cloud runs answering queued requests use the same prompts
TOOLS = {"coach-grade": "WebSearch,WebFetch", "coach-advice": "WebSearch,WebFetch", "cook-photo": "Read"}
# what a prompt says when the phone sent nothing for a field
DEFAULTS = {"coach-scenario": {"child": "his baby", "age": "about one year old",
                               "skill": "pick the one he needs most from his recent scores"},
            "coach-grade": {"age": "about one"}, "coach-advice": {"age": "about one"},
            "weekly-plan": {"age": "about one year old"}}


def prompt_values(task, inp):
    """The {{name}} values for pc/prompts/<task>.md. Plain fields go in as text, quoted fields as JSON."""
    d = DEFAULTS.get(task, {})
    v = {k: str(inp.get(k) or d.get(k, "")) for k in ("child", "age", "skill")}
    v.update({k: j(inp.get(k) or "") for k in ("scenario", "question", "answer", "situation", "task", "expected", "note")})
    v["recent"] = j(inp.get("recent") or []); v["avoid"] = j(inp.get("avoid") or [])
    v["summary"] = str(inp.get("summary") or "")
    v["phone"] = j({"checkins": inp.get("checkins"), "feedback": inp.get("feedback")})[:20000]
    v["pantry"] = j(inp.get("pantry") or [])[:12000]
    v["cookdata"] = j({k: inp.get(k) for k in ("weekStart", "expiring", "pantry", "workout", "childAge", "childSummary", "recentMeals") if k in inp})[:20000]
    v["photopath"] = str(inp.get("photopath") or "(photo attached in request)")
    v["can"] = can_do(inp); v["tips"] = tip_notes(inp); v["skills"] = j(SKILLS); v["rules"] = read_prompt("rules")
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
        if said and is_usage_limit(said):
            e = UsageLimitError(explain_error(said)); e.raw = said; raise e
        if said and explain_error(said) != "Claude: " + said: raise RuntimeError(explain_error(said))
        raise RuntimeError("Claude didn't answer" + (": " + said if said else f" (exit {r.returncode})"))
    if env.get("is_error") or env.get("subtype", "success") != "success":
        raw = str(env.get("result") or env.get("subtype") or "error")
        if is_usage_limit(raw):
            e = UsageLimitError(explain_error(raw)); e.raw = raw; raise e
        raise RuntimeError(explain_error(raw))
    return parse_answer(str(env.get("result") or "")), secs


def explain_error(msg):
    """Claude Code's error, in words he can act on."""
    m = msg.lower()
    if "401" in m or "authenticate" in m or "oauth" in m or "revoked" in m or "not logged in" in m or "/login" in m:
        return ("Claude Code on your PC needs you to sign in again (its login ran out). On the PC, double-click "
                "\"Sign in to Claude Code.bat\" in the wellness folder, then try again.")
    if is_usage_limit(msg):
        return "Your Claude usage limit is reached for now; it resets on Wednesday."
    return "Claude: " + msg[:300]


def gemini_tools_arg(tools):
    """Map Claude tool names (WebSearch,WebFetch) to Gemini CLI tool names."""
    out = []
    for t in str(tools or "").split(","):
        g = GEMINI_TOOLS.get(t.strip())
        if g and g not in out: out.append(g)
    return ",".join(out)


def explain_gemini_error(msg):
    """Antigravity / Gemini CLI's error, in words he can act on."""
    m = str(msg or "").lower()
    if any(k in m for k in ("401", "403", "unauthenticated", "authenticate", "authentication", "oauth", "not logged in", "credentials", "sign in", "/login")):
        return ("Gemini backup (Antigravity CLI) on your PC needs you to sign in again. On the PC, double-click "
                "\"Sign in to Gemini.bat\" in the wellness folder, then try again.")
    if is_usage_limit(msg):
        return "Your Gemini usage limit is reached for now; it resets on Monday."
    return "Gemini: " + str(msg or "")[:300]


def _parse_ndjson_result(out):
    """Extract the final result envelope from agy --output-format stream-json (or a single JSON envelope)."""
    try:
        obj = json.loads(out)
        if isinstance(obj, dict):
            return obj.get("result") if obj.get("event") == "result" and isinstance(obj.get("result"), dict) else obj
    except ValueError:
        pass
    last = None
    for line in out.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"): continue
        try: obj = json.loads(line)
        except ValueError: continue
        if not isinstance(obj, dict): continue
        if obj.get("event") == "result":
            return obj.get("result") if isinstance(obj.get("result"), dict) else obj
        last = obj
    return last


def run_gemini(prompt, tools):
    """Run Antigravity CLI (agy) or legacy Gemini CLI headless with the prompt on stdin and JSON output."""
    exe = find_gemini()
    if not exe: raise RuntimeError("Antigravity CLI (agy) isn't on this PC (or not on PATH). Install it and sign in once, then try again.")
    work = progress("claude-work", "README.txt")
    if not os.path.exists(work):
        with open(work, "w", encoding="utf-8") as f:
            f.write("Working folder for the Wellness app's AI requests. Safe to empty.\n")
    agy = is_agy_exe(exe)
    if agy:
        args = [exe, "--input-format", "stream-json", "--output-format", "stream-json",
                "--disable-slash-commands", "--print-timeout", f"{CLAUDE_TIMEOUT}s"]
        stdin_text = json.dumps({"event": "user", "message": {"content": prompt}}, ensure_ascii=False) + "\n"
    else:
        args = [exe, "-p", "Follow the instructions from stdin and return only the requested JSON object.", "--output-format", "json"]
        gtools = gemini_tools_arg(tools)
        if gtools: args += ["--allowed-tools", gtools]
        stdin_text = prompt
    t0 = time.time()
    r = subprocess.run(args, input=stdin_text, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       cwd=os.path.dirname(work), timeout=CLAUDE_TIMEOUT,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    secs = round(time.time() - t0, 1)
    out = (r.stdout or "").strip()
    env = _parse_ndjson_result(out) if agy else None
    if not agy:
        try: env = json.loads(out)
        except ValueError: env = None
    if isinstance(env, dict):
        if env.get("error"):
            err = env["error"]
            raw = str(err.get("message") if isinstance(err, dict) else err)
            if is_usage_limit(raw): raise UsageLimitError(explain_gemini_error(raw))
            raise RuntimeError(explain_gemini_error(raw))
        if env.get("is_error") or (env.get("status") and env.get("status") != "SUCCESS"):
            raw = str(env.get("error") or env.get("result") or env.get("response") or env.get("status") or "error")
            if is_usage_limit(raw): raise UsageLimitError(explain_gemini_error(raw))
            raise RuntimeError(explain_gemini_error(raw))
        text = env.get("response") if isinstance(env.get("response"), str) else (env.get("result") if isinstance(env.get("result"), str) else None)
        if text is not None:
            if not text.strip() and r.returncode != 0:
                tail = (r.stderr or "").strip().splitlines()[-3:]
                said = " ".join(tail)[:300]
                if said and is_usage_limit(said): raise UsageLimitError(explain_gemini_error(said))
                raise RuntimeError(explain_gemini_error(said) if said else f"Gemini didn't answer (exit {r.returncode})")
            return parse_answer(text), secs
        if r.returncode == 0 and env:
            return env, secs
    tail = (r.stderr or out or "").strip().splitlines()[-3:]
    said = " ".join(tail)[:300]
    if r.returncode == 0 and out:
        parsed = parse_answer(out)
        if not (len(parsed) == 1 and "text" in parsed): return parsed, secs
    if said and is_usage_limit(said): raise UsageLimitError(explain_gemini_error(said))
    if said and explain_gemini_error(said) != "Gemini: " + said: raise RuntimeError(explain_gemini_error(said))
    raise RuntimeError("Gemini didn't answer" + (": " + said if said else f" (exit {r.returncode})"))


def run_ai(prompt, tools, now=None):
    """Run Claude first; if Claude's usage is used up, switch to Gemini and keep using Gemini until Claude resets
    on Wednesday (noon local time). If Gemini's usage is also used up, remember it until Gemini resets on Monday."""
    st = read_ai_state()
    claude_out = is_exhausted(st, "claude", now)
    gemini_out = is_exhausted(st, "gemini", now)

    def try_gemini(claude_limited):
        if gemini_out:
            if claude_limited or claude_out:
                raise UsageLimitError("Both Claude (resets Wednesday) and Gemini (resets Monday) have reached their usage limit for now.")
            raise UsageLimitError("Your Gemini usage limit is reached for now; it resets on Monday.")
        if not find_gemini():
            if claude_limited or claude_out:
                raise UsageLimitError("Your Claude usage limit is reached (resets Wednesday). Install Gemini CLI (or run \"Sign in to Gemini.bat\") on your PC to use Gemini as a backup.")
            raise RuntimeError("Claude Code isn't on this PC (or not on PATH). Install it and sign in once, then try again.")
        try:
            ans, secs = run_gemini(prompt, tools)
            return ans, secs, "gemini"
        except UsageLimitError:
            mark_exhausted("gemini", now)
            if claude_limited or claude_out:
                raise UsageLimitError("Both Claude (resets Wednesday) and Gemini (resets Monday) have reached their usage limit for now.")
            raise
        except subprocess.TimeoutExpired:
            raise
        except Exception as ge:
            if claude_limited:
                raise RuntimeError("Claude's usage limit is reached (resets Wednesday), and the Gemini backup failed: " + str(ge))
            raise

    if claude_out:
        return try_gemini(claude_limited=False)
    if not find_claude():
        if find_gemini() and not gemini_out:
            return try_gemini(claude_limited=False)
        raise RuntimeError("Claude Code isn't on this PC (or not on PATH). Install it and sign in once, then try again.")
    try:
        ans, secs = run_claude(prompt, tools)
        return ans, secs, "claude"
    except UsageLimitError as ce:
        mark_exhausted("claude", now, getattr(ce, "raw", str(ce)))
        return try_gemini(claude_limited=True)


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


TASKS = ("coach-scenario", "coach-grade", "coach-advice", "tagalog-check", "advice", "weekly-plan", "cook-plan", "cook-photo")
MAX_PHOTO_B64 = 750_000


class Jobs:
    """Claude runs one at a time (each takes 10 s to a few minutes); the phone polls /v1/job."""
    lock = threading.Lock()
    run_lock = threading.Lock()
    jobs = {}

    @classmethod
    def start(cls, task, inp):
        if task not in TASKS: raise ValueError("unknown task")
        if not isinstance(inp, dict): raise ValueError("input must be an object")
        photo_b64 = inp.get("imageBase64") if task == "cook-photo" and isinstance(inp.get("imageBase64"), str) else None
        inp = {k: (v[:MAX_TEXT] if isinstance(v, str) else v) for k, v in list(inp.items())[:20] if k != "imageBase64"}
        if task in ("advice", "weekly-plan"): inp["summary"] = summarize(14)
        jid = secrets.token_hex(8)
        photo_path = None
        if task == "cook-photo":
            if not photo_b64 or len(photo_b64) > MAX_PHOTO_B64: raise ValueError("photo is missing or too large")
            try: raw = base64.b64decode(photo_b64, validate=True)
            except Exception: raise ValueError("photo data is not valid base64")
            if len(raw) > 550_000: raise ValueError("photo is too large")
            photo_path = progress("claude-work", f"photo-{jid}.jpg")
            with open(photo_path, "wb") as f: f.write(raw)
            inp["photopath"] = photo_path
        prompt, tools = prompt_for(task, inp)
        with cls.lock:
            old = [k for k, v in cls.jobs.items() if v["state"] != "running" and time.time() - v["t"] > 3600]
            for k in old: del cls.jobs[k]
            if sum(1 for v in cls.jobs.values() if v["state"] == "running") >= 3:
                if photo_path:
                    try: os.remove(photo_path)
                    except OSError: pass
                raise RuntimeError("Claude is busy with three requests already; try again in a minute")
            cls.jobs[jid] = {"state": "running", "task": task, "t": time.time()}
        threading.Thread(target=cls._run, args=(jid, task, inp, prompt, tools, photo_path), daemon=True).start()
        return jid

    @classmethod
    def _run(cls, jid, task, inp, prompt, tools, photo_path=None):
        try:
            with cls.run_lock:
                try:
                    ans, secs, provider = run_ai(prompt, tools)
                    res = {"state": "done", "answer": ans, "secs": secs, "provider": provider}
                    cls.remember(task, inp, ans, provider)
                except subprocess.TimeoutExpired:
                    res = {"state": "error", "error": "The AI request took too long (over %d s)" % CLAUDE_TIMEOUT}
                except Exception as e:                                       # noqa: BLE001 (any failure goes to the phone)
                    res = {"state": "error", "error": str(e)[:400]}
        finally:
            if photo_path:
                try: os.remove(photo_path)
                except OSError: pass
        with cls.lock:
            cls.jobs[jid].update(res); cls.jobs[jid]["t"] = time.time()
        who = f" ({res['provider']})" if "provider" in res else ""
        print(f"{now_iso()} {task}{who}: {res['state']}" + (f" in {res.get('secs')} s" if "secs" in res else f" ({res.get('error')})"), flush=True)

    @staticmethod
    def remember(task, inp, ans, provider="claude"):
        """Coach answers are kept on the PC too (progress over time, for him and for autopilot runs)."""
        if task == "weekly-plan":
            # kept on the PC (his progress folder) so autopilot runs and later plans can see what was planned
            rec = {"at": now_iso(), "answer": ans}
            if provider != "claude": rec["provider"] = provider
            with activity_lock: append_lines(progress("plans", "weekly.jsonl"), [rec])
            return
        if not task.startswith("coach"): return
        rec = {"at": now_iso(), "task": task, "input": {k: v for k, v in inp.items() if k != "summary"}, "answer": ans}
        if provider != "claude": rec["provider"] = provider
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
            st = ai_status()
            return self.reply(200, {"app": "wellness", "version": VERSION, "claude": bool(find_claude()),
                                    "gemini": bool(find_gemini()), "provider": st["provider"],
                                    "claudeUntil": st["claudeUntil"], "geminiUntil": st["geminiUntil"],
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
          f"Gemini CLI: {find_gemini() or 'not installed'}; progress folder: {PROGRESS}", flush=True)
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
