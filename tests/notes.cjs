/* Unit tests for app/www/lib/notes.js (everywhere "Note for autopilot" store). node tests/notes.cjs */
'use strict';
const assert = require('assert');
const N = require('../app/www/lib/notes.js');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

t('add: trims, sets defaults, newest first, ignores blank input', () => {
  const s = N.defaults();
  assert.strictEqual(N.add(s, '   ', '#calm', 'Idea'), null);
  const a = N.add(s, '  add white noise to sits  ', '#calm/s/count', 'Feature', new Date('2026-11-26T12:00:00Z'));
  const b = N.add(s, 'exact timer please', '', 'UnknownTag', new Date('2026-11-26T12:05:00Z'));
  assert.strictEqual(s.notes.length, 2);
  assert.strictEqual(s.notes[0].id, b.id, 'newest first');
  assert.strictEqual(a.text, 'add white noise to sits');
  assert.strictEqual(a.tag, 'Feature');
  assert.strictEqual(a.where, '#calm/s/count');
  assert.strictEqual(b.tag, 'Idea', 'unknown tag falls back to Idea');
  assert.strictEqual(b.where, '#home', 'blank where falls back to #home');
});

t('remove: deletes matching id and returns boolean', () => {
  const s = N.defaults();
  const a = N.add(s, 'one', '#home', 'Bug', new Date('2026-11-26T12:00:00Z'));
  const b = N.add(s, 'two', '#cook', 'Idea', new Date('2026-11-26T12:01:00Z'));
  assert.strictEqual(N.remove(s, 'nope'), false);
  assert.strictEqual(N.remove(s, a.id), true);
  assert.deepStrictEqual(s.notes.map((x) => x.id), [b.id]);
});

t('add caps at 200 notes and truncates overly long text', () => {
  const s = N.defaults();
  for (let i = 0; i < 210; i++) N.add(s, 'note ' + i, '#home', 'Idea', new Date(2026, 10, 26, 12, 0, i));
  assert.strictEqual(s.notes.length, 200);
  const big = N.add(s, 'x'.repeat(2000), '#home', 'Wording', new Date('2026-11-26T15:00:00Z'));
  assert.strictEqual(big.text.length, 1200);
});

t('validate: keeps valid notes, drops junk, rejects non-object', () => {
  assert.strictEqual(N.validate(null), null);
  assert.strictEqual(N.validate({}), null);
  const v = N.validate({
    notes: [
      null,
      { id: 'ok1', at: '2026-11-26T10:00:00Z', where: '#calm', tag: 'Bug', text: '  fix timer  ' },
      { id: 'bad-date', at: 'not-a-date', where: '#home', tag: 'Idea', text: 'hello' },
      { id: 'blank', at: '2026-11-26T10:00:00Z', where: '#home', tag: 'Idea', text: '   ' },
      { id: 'ok2', at: '2026-11-26T11:00:00Z', where: '', tag: 'Weird', text: 'keep me' }
    ]
  });
  assert.strictEqual(v.notes.length, 2);
  assert.deepStrictEqual(v.notes.map((x) => [x.id, x.tag, x.text, x.where]), [
    ['ok1', 'Bug', 'fix timer', '#calm'],
    ['ok2', 'Idea', 'keep me', '#home']
  ]);
});

t('markRead: a cloud run\'s ack marks those notes read (once); validate keeps it; unread lists the rest', () => {
  const s = N.defaults();
  const a = N.add(s, 'first', '#home', 'Idea', new Date('2026-11-26T10:00:00Z')), b = N.add(s, 'second', '#calm', 'Bug', new Date('2026-11-26T11:00:00Z'));
  assert.strictEqual(N.markRead(s, [a.id, 'nope'], '2026-11-27T01:00:00Z'), 1);
  assert.strictEqual(N.markRead(s, [a.id], '2026-11-28T01:00:00Z'), 0, 'already read');
  assert.strictEqual(s.notes.find((x) => x.id === a.id).read, '2026-11-27T01:00:00.000Z');
  assert.deepStrictEqual(N.unread(s).map((x) => x.id), [b.id]);
  const v = N.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.notes.find((x) => x.id === a.id).read, '2026-11-27T01:00:00.000Z');
  assert.ok(!('read' in v.notes.find((x) => x.id === b.id)));
  assert.strictEqual(N.markRead(s, null), 0); assert.strictEqual(N.markRead(null, [a.id]), 0);
});

t('423: unseenReplies, markRepliesSeen, replySeen persistence, and updated reply resets seen', () => {
  const s = N.defaults();
  const a = N.add(s, 'first', '#home', 'Idea', new Date('2026-11-26T10:00:00Z'));
  const b = N.add(s, 'second', '#calm', 'Bug', new Date('2026-11-26T11:00:00Z'));
  assert.strictEqual(N.unseenReplies(s).length, 0);
  N.markRead(s, [a.id], '2026-11-27T01:00:00Z', { [a.id]: 'Done in next update.' });
  assert.deepStrictEqual(N.unseenReplies(s).map((x) => x.id), [a.id], 'new reply is unseen');
  assert.strictEqual(N.markRepliesSeen(s, new Date('2026-11-27T02:00:00Z')), 1);
  assert.strictEqual(N.unseenReplies(s).length, 0, 'seen after opening');
  assert.strictEqual(N.markRepliesSeen(s), 0, 'idempotent');
  // validate keeps replySeen
  const v = N.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v.notes.find((x) => x.id === a.id).replySeen, '2026-11-27T02:00:00.000Z');
  assert.strictEqual(N.unseenReplies(v).length, 0);
  // same reply text keeps replySeen; updated reply text makes it unseen again
  assert.strictEqual(N.markRead(v, [a.id], '2026-11-27T03:00:00Z', { [a.id]: 'Done in next update.' }), 0);
  assert.strictEqual(N.unseenReplies(v).length, 0);
  assert.strictEqual(N.markRead(v, [a.id], '2026-11-27T04:00:00Z', { [a.id]: 'Shipped in APK 2.' }), 1);
  assert.deepStrictEqual(N.unseenReplies(v).map((x) => x.id), [a.id], 'updated reply resets seen');
  assert.strictEqual(N.unseenReplies(null).length, 0);
  assert.strictEqual(N.markRepliesSeen(null), 0);
});
console.log(n + ' notes unit tests passed');
