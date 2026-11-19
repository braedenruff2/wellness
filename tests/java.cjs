/* Compiles the Android code and runs the plain-Java tests, if javac and an android.jar are around.
   ANDROID_JAR=... (default: the cloud's /home/claude/sdk/android-35/android.jar). Skips (passes) otherwise. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const jar = process.env.ANDROID_JAR || '/home/claude/sdk/android-35/android.jar';
try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); } catch (e) { console.log('skipped: no javac'); process.exit(0); }
if (!fs.existsSync(jar)) { console.log('skipped: no android.jar at ' + jar); process.exit(0); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fcj-'));
const gen = path.join(out, 'gen', 'app', 'faithcompanion'); fs.mkdirSync(gen, { recursive: true });
fs.writeFileSync(path.join(gen, 'R.java'), 'package app.faithcompanion; public final class R { public static final class drawable { public static final int ic_note = 1; } }');
const srcs = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.java')) srcs.push(p); } })(path.join(ROOT, 'android', 'src'));
srcs.push(path.join(gen, 'R.java'), path.join(ROOT, 'tests', 'java', 'app', 'faithcompanion', 'ReminderTest.java'));
execFileSync('javac', ['-nowarn', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-cp', jar, '-d', path.join(out, 'c')].concat(srcs), { stdio: 'inherit' });
execFileSync('java', ['-cp', path.join(out, 'c') + path.delimiter + jar, 'app.faithcompanion.ReminderTest'], { stdio: 'inherit' });
