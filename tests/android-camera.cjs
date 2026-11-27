#!/usr/bin/env node
/* The fridge-photo chooser (MainActivity onShowFileChooser / onActivityResult), checked in the source:
   - Android 11+ only lets resolveActivity() see a camera app the manifest <queries> for, or the camera never shows;
   - the camera app gets write access to the photo's uri (it's started from the chooser);
   - the photo a camera app hands back as data.getData() (the same uri) is never deleted before the page reads it. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const A = path.join(__dirname, '..', 'android');
const man = fs.readFileSync(path.join(A, 'AndroidManifest.xml'), 'utf8');
const src = fs.readFileSync(path.join(A, 'src', 'app', 'faithcompanion', 'MainActivity.java'), 'utf8');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }
t('the camera intent the chooser checks is declared in <queries>', () => {
  if (!/ACTION_IMAGE_CAPTURE/.test(src) || !/resolveActivity/.test(src)) return;
  const q = man.match(/<queries>([\s\S]*?)<\/queries>/);
  assert.ok(q && /android\.media\.action\.IMAGE_CAPTURE/.test(q[1]), 'manifest <queries> has IMAGE_CAPTURE');
});
t('the camera app may write the photo uri', () => {
  if (!/ACTION_IMAGE_CAPTURE/.test(src)) return;
  assert.ok(/FLAG_GRANT_WRITE_URI_PERMISSION/.test(src) && /setClipData\(ClipData\.newRawUri/.test(src));
});
t('onActivityResult deletes the empty camera row only when it is not the uri handed to the page', () => {
  const r = src.slice(src.indexOf('protected void onActivityResult'));
  const del = r.indexOf('getContentResolver().delete(cameraPhotoUri');
  assert.ok(del > 0);
  const guard = r.slice(0, del).split('\n').slice(-3).join('\n');
  assert.ok(/!cameraPhotoUri\.equals\(u\)/.test(guard), 'guarded by !cameraPhotoUri.equals(u): ' + guard);
});
console.log(n + ' android camera tests passed');
