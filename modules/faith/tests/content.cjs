/* Content checks: every day complete, Scripture exactly as in the WEB source, content.js up to date. */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const B = require('../tools/build-content.cjs');
const ROOT = path.join(__dirname, '..');
const src = require('../content/days-src.cjs');
const practices = require('../content/practices-src.cjs');
const bible = B.loadBible(path.join(ROOT, 'source', 'engwebp_vpl.txt'));
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.error('FAIL', msg); } }

assert.ok(bible.size > 30000, 'Bible text loaded');
const nums = src.days.map((d) => d.n);
nums.forEach((n, i) => check(n === i + 1, 'days numbered 1..N in order (got ' + n + ' at ' + i + ')'));

// quotes in a reflection may come from its own passage or (look-back days) from any passage of the path
const allPassages = src.days.map((d) => d.refs.map((r) => { try { return B.plain(B.passage(bible, r)); } catch (e) { return ''; } }).join(' ')).join(' ').replace(/\s+/g, ' ');
for (const d of src.days) {
  const id = 'day ' + d.n;
  for (const k of ['title', 'intro', 'keyVerse', 'sitWith', 'prayer', 'practice', 'journal']) {
    check(typeof d[k] === 'string' && d[k].trim().length > 3, id + ' has ' + k);
  }
  check(Array.isArray(d.reflection) && d.reflection.length >= 2, id + ' has a reflection of 2+ paragraphs');
  const words = d.reflection.join(' ').split(/\s+/).length;
  check(words >= 60 && words <= 260, id + ' reflection length ' + words + ' words (60-260: short enough for a tired parent)');
  check(d.prayer.trim().endsWith('Amen.'), id + ' prayer ends with Amen.');
  check(Array.isArray(d.refs) && d.refs.length, id + ' has refs');
  let text = '';
  for (const r of d.refs) {
    try { const p = B.passage(bible, r); text += ' ' + B.plain(p); check(p.verses.length <= 25, id + ' ' + r + ' is short enough'); }
    catch (e) { check(false, id + ': ' + e.message); }
  }
  const norm = (s) => s.replace(/\s+/g, ' ');
  const kv = norm(d.keyVerse);
  check(norm(text).includes(kv) || norm(text).includes(kv[0].toLowerCase() + kv.slice(1)), id + ' keyVerse is word-for-word in the passage: ' + d.keyVerse);
  // our writing must not put words in God's mouth as a quote; quotes inside reflections must come from the passage
  for (const para of d.reflection) {
    const quotes = para.match(/“([^”]+)”/g) || [];
    for (const q of quotes) {
      const inner = q.slice(1, -1).replace(/[.,!?]$/, '');
      const okQuote = norm(text).toLowerCase().includes(inner.toLowerCase()) || allPassages.toLowerCase().includes(inner.toLowerCase()) || /^(if you can do anything|Help my unbelief|I’m here|Come after me|Talitha cumi|like a little child|their faith|valley of the shadow of death|from the lips of babes and infants|Who then is this, that even the wind and the sea obey him\?|You are not far from God’s Kingdom|Don’t you care|You knit me together in my mother’s womb|You are the Christ|But who do you say that I am\?|What do you want me to do for you\?|You are my beloved Son, in whom I am well pleased|Don’t be afraid, only believe|receive like a child|better|I’m here\. You’re here)$/i.test(inner);
      check(okQuote, id + ' quote in reflection is from the passage or a known phrase: ' + q);
    }
  }
  // a quote anywhere else that uses the WEB's "LORD" is presented as Scripture, so it must be word-for-word from the path
  for (const k of ['intro', 'sitWith', 'prayer', 'practice', 'journal']) {
    for (const q of d[k].match(/“([^”]+)”/g) || []) {
      const inner = q.slice(1, -1).replace(/[.,!?]$/, '');
      if (/\bLORD\b/.test(inner)) check(allPassages.includes(inner), id + ' ' + k + ' Scripture quote is word-for-word: ' + q);
    }
  }
  const all = JSON.stringify(d);
  check(!/\bI am the Lord\b|\bthus says the Lord\b|\bGod told me\b/i.test(all), id + ' does not speak as God');
}

// weeks cover all days with no gaps or overlaps
const covered = [];
for (const w of src.weeks) for (let n = w.days[0]; n <= w.days[1]; n++) covered.push(n);
check(JSON.stringify(covered) === JSON.stringify(nums), 'weeks cover every day exactly once');

// practices
const ids = new Set();
for (const p of practices) {
  check(!ids.has(p.id), 'practice id unique: ' + p.id); ids.add(p.id);
  check(p.title && p.blurb && p.when && p.steps.length >= 3, p.id + ' complete');
  check(p.steps[p.steps.length - 1].wait === 0, p.id + ' last step has no quiet after it');
  for (const s of p.steps) {
    for (const m of s.say.matchAll(/\{\{([^}]+)\}\}/g)) {
      if (m[1] === 'TODAY') continue;
      try { B.passage(bible, m[1]); } catch (e) { check(false, p.id + ': ' + e.message); }
    }
  }
}

// Lord's Prayer lines match Matthew 6:9-13 (WEB)
const lords = practices.find((p) => p.id === 'lords');
const mt = B.plain(B.passage(bible, 'MAT 6:9-13'));
for (const s of lords.steps.slice(1)) {
  const line = s.say.replace(/ Amen\.$/, '');
  check(mt.includes(line), "Lord's Prayer line matches WEB: " + line);
}

// Psalm titles all match their verse 1
for (const k of Object.keys(B.TITLES)) check(bible.get('PSA ' + k + ':1').startsWith(B.TITLES[k]), 'psalm title ' + k);

// quote trimming
check(B.trimQuotes('“Come to me, all you who labor.') === 'Come to me, all you who labor.', 'trimQuotes opening');
check(B.trimQuotes('‘The LORD bless you. give you peace.’') === 'The LORD bless you. give you peace.', 'trimQuotes single');
check(B.trimQuotes('the LORD’s house forever.') === 'the LORD’s house forever.', 'trimQuotes keeps apostrophes');

// generated file is current
const built = B.build();
const cur = fs.readFileSync(path.join(ROOT, '..', '..', 'app', 'www', 'modules', 'faith', 'content.js'), 'utf8');
check(built === cur, 'app/www/content.js is up to date (run node modules/faith/tools/build-content.cjs)');

if (fails) { console.error(fails + ' content check(s) failed'); process.exit(1); }
console.log('content ok: ' + src.days.length + ' days, ' + practices.length + ' practices');
