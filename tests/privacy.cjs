/* The repo may be public: no personal words in it. Words to look for come from a file OUTSIDE the repo,
   WELLNESS_PRIVATE_WORDS or ../wellness-progress/private-words.txt (one per line: names, birthdays...).
   Without that file (cloud) only the {child} placeholder handling is checked. node tests/privacy.cjs */
'use strict';
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const P = require('../app/www/lib/personal.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)';
const DAY_NUM = '(?:[12]\\d|3[01]|0?[1-9])(?:st|nd|rd|th)?';
const BIRTHDAY_RE = new RegExp('\\b\\d{4}-\\d\\d-\\d\\d\\b|\\b' + MONTHS + '\\.?\\s+' + DAY_NUM + '\\b|\\b' + DAY_NUM + '(?:\\s+of)?\\s+' + MONTHS + '\\b', 'ig');

/* Scan a Tagalog pack object for written-out dates (month + day number, or YYYY-MM-DD) anywhere outside top-level id / made. */
function findBirthdayDates(pack, label) {
  const hits = [];
  function walk(v, topKey) {
    if (typeof v === 'string') {
      const ms = v.match(BIRTHDAY_RE);
      if (ms) ms.forEach((m) => hits.push(label + ': ' + m));
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, false)); return; }
    if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        if (topKey && (k === 'id' || k === 'made')) return;
        walk(v[k], false);
      });
    }
  }
  walk(pack, true);
  return hits;
}

function scanTlPacksJs(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  const packs = Array.isArray(sandbox.window.TL_PACKS) ? sandbox.window.TL_PACKS : [];
  const hits = [];
  const allowedIso = new Set();
  packs.forEach((p) => {
    if (p && typeof p.id === 'string') allowedIso.add(p.id);
    if (p && typeof p.made === 'string') (p.made.match(/\b\d{4}-\d\d-\d\d\b/g) || []).forEach((d) => allowedIso.add(d));
    hits.push(...findBirthdayDates(p, 'tl-packs.js#' + ((p && p.id) || '?')));
  });
  (src.match(/\b\d{4}-\d\d-\d\d\b/g) || []).forEach((d) => {
    if (!allowedIso.has(d)) hits.push('tl-packs.js(raw): ' + d);
  });
  return hits;
}

function loadDenyList(file) {
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((w) => w.trim()).filter((w) => w.length >= 2 && !w.startsWith('#'));
}

function findDenyNames(items, names) {
  if (!names || !names.length) return [];
  const res = names.map((w) => new RegExp('(?:^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^a-z0-9])', 'i'));
  const hits = [];
  items.forEach((it) => {
    res.forEach((re, idx) => {
      if (re.test(it.text)) hits.push(it.label + ': deny #' + (idx + 1));
    });
  });
  return hits;
}

t('{child}: her name, or a fallback with a capital at the start of a sentence', () => {
  assert.strictEqual(P.fill('Bless {child} today. {child} is a gift.', 'Ana', 'your daughter'), 'Bless Ana today. Ana is a gift.');
  assert.strictEqual(P.fill('Bless {child} today. {child} is a gift. “{child} smiled”', '', 'your daughter'),
    'Bless your daughter today. Your daughter is a gift. “Your daughter smiled”');
  assert.strictEqual(P.fill('Keep {child|my daughter} safe. Watch {child}.', '', 'your daughter'), 'Keep my daughter safe. Watch your daughter.');
  assert.strictEqual(P.fill('Keep {child|my daughter} safe.', 'Ana', 'x'), 'Keep Ana safe.');
  assert.strictEqual(P.fill('Tulog na si {child}.', '', 'Baby'), 'Tulog na si Baby.');
  assert.strictEqual(P.fill('no token', 'Ana', 'x'), 'no token');
  assert.strictEqual(P.fill(7, 'Ana', 'x'), 7);
});

t('personalize copies the whole object and leaves the original alone', () => {
  const src = { a: ['{child} x', { b: '{child}' }], n: 3, z: null, t: true };
  const out = P.personalize(src, 'Ana');
  assert.deepStrictEqual(out, { a: ['Ana x', { b: 'Ana' }], n: 3, z: null, t: true });
  assert.strictEqual(src.a[0], '{child} x');
});

t('childName reads Parenting setup; junk or nothing gives ""', () => {
  const st = (v) => ({ getItem: () => v });
  assert.strictEqual(P.childName(st(JSON.stringify({ child: { name: ' Ana ', birth: '2025-01-01' } }))), 'Ana');
  assert.strictEqual(P.childName(st(JSON.stringify({ child: { name: '<b>{x}</b>' } }))), 'bx/b', 'no markup or braces');
  assert.strictEqual(P.childName(st(null)), '');
  assert.strictEqual(P.childName(st('{bad')), '');
  assert.strictEqual(P.childName({ getItem: () => { throw new Error('blocked'); } }), '');
});

t('the shipped content uses {child} (and every {child...} token is well formed)', () => {
  const content = fs.readFileSync(path.join(ROOT, 'app/www/modules/faith/content.js'), 'utf8');
  const packs = fs.readFileSync(path.join(ROOT, 'app/www/modules/tagalog/tl-packs.js'), 'utf8');
  assert.ok(/\{child/.test(content) && /\{child\}/.test(packs));
  for (const s of [content, packs]) assert.deepStrictEqual((s.match(/\{child[^}]*\}?/g) || []).filter((m) => !/^\{child(\|[^{}|]+)?\}$/.test(m)), []);
});

t('Tagalog pack privacy scanner catches written-out birthdays and deny-list names while allowing id, made, and bare months', () => {
  const clean = {
    id: '2026-11-18',
    made: '2026-11-18, built for week 1 (20 Nov)',
    title: 'Family first',
    lessons: [{ day: 1, title: 'Months', intro: 'In December (Sa Disyembre), 4 months of leave.', dialogue: [{ tl: 'Sa Disyembre.', en: 'In December.' }] }]
  };
  assert.deepStrictEqual(findBirthdayDates(clean, 'clean'), []);
  const leaky = JSON.parse(JSON.stringify(clean));
  leaky.lessons[0].intro = 'Born November 18th, also Nov 4, 15th of May, 2025-07-09, and Nobyembre 22.';
  const hits = findBirthdayDates(leaky, 'leaky');
  assert.strictEqual(hits.length, 5, JSON.stringify(hits));
  assert.deepStrictEqual(scanTlPacksJs('window.TL_PACKS = ' + JSON.stringify([clean]) + '; window.TL_PACK_HASH = {"2026-11-18":"abc"};'), []);
  assert.ok(scanTlPacksJs('window.TL_PACKS = ' + JSON.stringify([leaky]) + ';').length >= 5);
  assert.ok(scanTlPacksJs('window.TL_PACKS = ' + JSON.stringify([clean]) + '; // 2025-01-02').some((x) => /2025-01-02/.test(x)));

  const tmp = path.join(os.tmpdir(), 'wl-deny-test-' + process.pid + '.txt');
  try {
    fs.writeFileSync(tmp, '# comment\n\nSecretName\nAnotherName\n', 'utf8');
    const names = loadDenyList(tmp);
    assert.deepStrictEqual(names, ['SecretName', 'AnotherName']);
    assert.deepStrictEqual(findDenyNames([{ label: 'ok', text: 'Sa Disyembre. {child} smiled. PrefixSecretNameSuffix.' }], names), []);
    assert.deepStrictEqual(findDenyNames([{ label: 'bad', text: 'Happy birthday, secretname!' }], names), ['bad: deny #1']);
    assert.strictEqual(loadDenyList(tmp + '.missing'), null);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

t('shipped Tagalog packs and tl-packs.js have no written-out birthdays or denied names', () => {
  const packDir = path.join(ROOT, 'modules/tagalog/packs');
  const packFiles = fs.readdirSync(packDir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
  assert.ok(packFiles.length >= 1);
  const dateHits = [];
  const rawItems = [];
  packFiles.forEach((f) => {
    const p = path.join(packDir, f);
    const raw = fs.readFileSync(p, 'utf8');
    rawItems.push({ label: 'modules/tagalog/packs/' + f, text: raw });
    dateHits.push(...findBirthdayDates(JSON.parse(raw), f));
  });
  const tlPacksPath = path.join(ROOT, 'app/www/modules/tagalog/tl-packs.js');
  const tlPacksSrc = fs.readFileSync(tlPacksPath, 'utf8');
  rawItems.push({ label: 'app/www/modules/tagalog/tl-packs.js', text: tlPacksSrc });
  dateHits.push(...scanTlPacksJs(tlPacksSrc));
  assert.deepStrictEqual(dateHits, [], 'unexpected date/birthday in Tagalog packs: ' + dateHits.join(', '));

  const denyFile = process.env.WELLNESS_DENY_NAMES || path.join(ROOT, '..', 'wellness-progress', 'deny-names.txt');
  const names = loadDenyList(denyFile);
  if (names) {
    assert.deepStrictEqual(findDenyNames(rawItems, names), [], 'denied name found in Tagalog packs');
  }
});

const wordsFile = process.env.WELLNESS_PRIVATE_WORDS || path.join(ROOT, '..', 'wellness-progress', 'private-words.txt');
if (fs.existsSync(wordsFile)) {
  t('no private words anywhere in the repo folder', () => {
    const words = fs.readFileSync(wordsFile, 'utf8').split(/\r?\n/).map((w) => w.trim()).filter((w) => w.length >= 3 && !w.startsWith('#'));
    const hits = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        if (['.git', 'node_modules', 'dist', 'voices', '_to_delete'].includes(f)) continue;
        const p = path.join(d, f), st = fs.statSync(p);
        if (st.isDirectory()) { walk(p); continue; }
        if (st.size > 5e6 || !/\.(js|cjs|json|md|txt|py|java|xml|html|css|bat|cmd|vbs|sh|ps1)$/i.test(f)) continue;
        const s = fs.readFileSync(p, 'utf8').toLowerCase();
        for (const w of words) if (s.includes(w.toLowerCase())) hits.push(path.relative(ROOT, p) + ': word #' + (words.indexOf(w) + 1));
      }
    })(ROOT);
    assert.deepStrictEqual(hits, [], 'private words found (the message shows only the word number)');
  });
} else console.log('-- private word check skipped: no ' + wordsFile);
console.log(n + ' privacy tests passed');
