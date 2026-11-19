/* The repo may be public: no personal words in it. Words to look for come from a file OUTSIDE the repo,
   WELLNESS_PRIVATE_WORDS or ../wellness-progress/private-words.txt (one per line: names, birthdays...).
   Without that file (cloud) only the {child} placeholder handling is checked. node tests/privacy.cjs */
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../app/www/lib/personal.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

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
