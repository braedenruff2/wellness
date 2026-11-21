/* Compiles the Android code and runs the plain-Java tests, if javac and an android.jar are around.
   ANDROID_JAR=... (default: the cloud's /home/claude/sdk/android-35/android.jar). Skips only on Windows; elsewhere a missing javac or android.jar fails. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const jar = process.env.ANDROID_JAR || '/home/claude/sdk/android-35/android.jar';
// On his Windows PC this may skip; anywhere else (the cloud agents) a missing tool is a failure, so a skip can't pass as green.
const skip = (why) => { if (process.platform === 'win32') { console.log('skipped: ' + why); process.exit(0); }
  console.error('FAILED: ' + why + ' (get platform-35_r02.zip from https://dl.google.com/android/repository/ and set ANDROID_JAR; see .autopilot/cloud-plan.md)'); process.exit(1); };
try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); } catch (e) { skip('no javac'); }
if (!fs.existsSync(jar)) skip('no android.jar at ' + jar);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fcj-'));
const gen = path.join(out, 'gen', 'app', 'faithcompanion'); fs.mkdirSync(gen, { recursive: true });
fs.writeFileSync(path.join(gen, 'R.java'), 'package app.faithcompanion; public final class R { public static final class drawable { public static final int ic_note = 1; } }');
const srcs = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.java')) srcs.push(p); } })(path.join(ROOT, 'android', 'src'));
srcs.push(path.join(gen, 'R.java'), path.join(ROOT, 'tests', 'java', 'app', 'faithcompanion', 'ReminderTest.java'),
  path.join(ROOT, 'tests', 'java', 'app', 'faithcompanion', 'PcLinkTest.java'), path.join(ROOT, 'tests', 'java', 'app', 'faithcompanion', 'SpeechTest.java'),
  path.join(ROOT, 'tests', 'java', 'app', 'faithcompanion', 'TodoAlarmTest.java'));
execFileSync('javac', ['-nowarn', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-cp', jar, '-d', path.join(out, 'c')].concat(srcs), { stdio: 'inherit' });
execFileSync('java', ['-cp', path.join(out, 'c') + path.delimiter + jar, 'app.faithcompanion.ReminderTest'], { stdio: 'inherit' });
execFileSync('java', ['-cp', path.join(out, 'c') + path.delimiter + jar, 'app.faithcompanion.SpeechTest'], { stdio: 'inherit' });
execFileSync('java', ['-cp', path.join(out, 'c') + path.delimiter + jar, 'app.faithcompanion.TodoAlarmTest'], { stdio: 'inherit' });

// PcLink against the real PC server (needs python3 with the cryptography package; skipped otherwise)
const { spawn, spawnSync } = require('child_process');
const py = process.platform === 'win32' ? 'python' : 'python3';
if (spawnSync(py, ['-c', 'import cryptography'], { stdio: 'ignore' }).status !== 0) { console.log('PcLink test skipped: no python3 + cryptography'); process.exit(0); }
const port = 20000 + Math.floor(Math.random() * 20000);
const env = Object.assign({}, process.env, { WELLNESS_STATE: path.join(out, 'state'), WELLNESS_PROGRESS: path.join(out, 'progress'), WELLNESS_PORT: String(port), WELLNESS_CLAUDE: '/nonexistent', WELLNESS_DIST: path.join(out, 'dist') });
fs.mkdirSync(path.join(out, 'dist'));
fs.writeFileSync(path.join(out, 'dist', 'Wellness.apk'), Buffer.alloc(250000, 7));
fs.writeFileSync(path.join(out, 'dist', 'version.json'), '{"code": 30463999, "name": "0.1.test", "size": 250000}\n');
const PCDIR = path.join(ROOT, 'pc');
const code = 'ABCD-EFGH-JKMN';
const keyHex = execFileSync(py, ['-c', `import sys; sys.path.insert(0, r'${PCDIR}'); import wellness_pc as W, time; W.write_json('pairing.json', {'key': W.b64(W.pair_key('${code}')), 'expires': time.time() + 600, 'tries': 0}); print(W.pair_key('${code}').hex())`], { env, encoding: 'utf8' }).trim();
const srv = spawn(py, [path.join(PCDIR, 'wellness_pc.py'), 'serve'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
let up = '';
srv.stdout.on('data', (d) => { up += d; });
const t0 = Date.now();
(function wait() {
  if (!/ready on port/.test(up)) { if (Date.now() - t0 > 15000) { console.log('server did not start'); srv.kill(); process.exit(1); } return setTimeout(wait, 100); }
  let code2 = 0;
  try { execFileSync('java', ['-cp', path.join(out, 'c') + path.delimiter + jar, 'app.faithcompanion.PcLinkTest', String(port), code, keyHex], { stdio: 'inherit' }); }
  catch (e) { code2 = 1; }
  srv.kill(); process.exit(code2);
})();
