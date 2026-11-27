#!/usr/bin/env node
/* During a guided prayer or Calm sit (body.in-session -> native.setBusy) MainActivity holds audio focus with
   GAIN_TRANSIENT_MAY_DUCK (his music ducks, it doesn't stop), pauses the session through FCPauseSession on a full or
   transient loss (a phone call), never on a duck, and gives focus back when the session ends or the app closes.
   Checked in the source (the behaviour itself needs a phone). */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'android', 'src', 'app', 'faithcompanion', 'MainActivity.java'), 'utf8');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
t('setBusy asks for focus when a session starts and gives it back when it ends', () => {
  const sb = src.slice(src.indexOf('public void setBusy('), src.indexOf('public void setBusy(') + 300);
  assert.ok(/sessionFocus\(busy\)/.test(sb) && /busy != was/.test(sb), sb);
  assert.ok(/AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK/.test(src), 'other apps duck, not stop');
  assert.ok(/abandonAudioFocusRequest\(focusReq\)/.test(src));
  const od = src.slice(src.indexOf('protected void onDestroy()'), src.indexOf('protected void onDestroy()') + 120);
  assert.ok(/sessionFocus\(false\)/.test(od), 'released on close');
});
t('only a call pauses (focus lost while ringing / in a call), never a duck or the app own sound', () => {
  const m = src.match(/static boolean pausesOn\(int focusChange, int audioMode\) \{([\s\S]*?)\n    \}/);
  assert.ok(m, 'pausesOn helper');
  assert.ok(/AUDIOFOCUS_LOSS\b/.test(m[1]) && /AUDIOFOCUS_LOSS_TRANSIENT\b/.test(m[1]) && !/CAN_DUCK/.test(m[1]));
  assert.ok(/MODE_RINGTONE/.test(m[1]) && /MODE_IN_CALL/.test(m[1]) && /lost &&/.test(m[1]), 'and the phone is ringing or in a call');
  assert.ok(/pausesOn\(ch, am\.getMode\(\)\)[^;]*FCPauseSession/.test(src));
});
console.log(n + ' android audio focus tests passed');
