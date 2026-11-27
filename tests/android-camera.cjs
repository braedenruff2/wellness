#!/usr/bin/env node
/* The fridge-photo chooser (MainActivity onShowFileChooser / onActivityResult, FridgePhoto, FridgePhotoProvider):
   - Android 11+ only lets resolveActivity() see a camera app the manifest <queries> for, or the camera never shows;
   - the camera writes to app-private cache storage via a non-exported ContentProvider (never public MediaStore/Pictures);
   - the camera app gets read+write URI permission on EXTRA_OUTPUT;
   - onActivityResult removes the empty app-cache photo only when it is not the uri handed to the page. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const A = path.join(__dirname, '..', 'android');
const man = fs.readFileSync(path.join(A, 'AndroidManifest.xml'), 'utf8');
const src = fs.readFileSync(path.join(A, 'src', 'app', 'faithcompanion', 'MainActivity.java'), 'utf8');
const fp = fs.readFileSync(path.join(A, 'src', 'app', 'faithcompanion', 'FridgePhoto.java'), 'utf8');
const prov = fs.readFileSync(path.join(A, 'src', 'app', 'faithcompanion', 'FridgePhotoProvider.java'), 'utf8');
let n = 0;
function t(name, f) { f(); n++; console.log('ok', name); }

t('the camera intent the chooser checks is declared in <queries>', () => {
  if (!/ACTION_IMAGE_CAPTURE/.test(src) || !/resolveActivity/.test(src)) return;
  const q = man.match(/<queries>([\s\S]*?)<\/queries>/);
  assert.ok(q && /android\.media\.action\.IMAGE_CAPTURE/.test(q[1]), 'manifest <queries> has IMAGE_CAPTURE');
});

t('app-private FridgePhotoProvider is declared non-exported with grantUriPermissions', () => {
  const p = man.match(/<provider[\s\S]*?FridgePhotoProvider[\s\S]*?\/>/);
  assert.ok(p, 'FridgePhotoProvider declared in AndroidManifest.xml');
  assert.ok(/android:authorities="app\.faithcompanion\.fridgephoto"/.test(p[0]), 'authority matches FridgePhoto.AUTHORITY');
  assert.ok(/android:exported="false"/.test(p[0]), 'provider is not exported');
  assert.ok(/android:grantUriPermissions="true"/.test(p[0]), 'provider allows temporary URI grants to camera');
  assert.ok(/OpenableColumns\.DISPLAY_NAME/.test(prov) && /OpenableColumns\.SIZE/.test(prov), 'provider serves DISPLAY_NAME and SIZE for WebView');
});

t('fridge photos stay in app-private cache storage and never touch public MediaStore', () => {
  const fpCode = fp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert.ok(/getCacheDir\(\)/.test(fpCode), 'FridgePhoto uses app-private cache dir');
  assert.ok(!/MediaStore/.test(fpCode), 'FridgePhoto never imports or calls MediaStore');
  assert.ok(!/getContentResolver\(\)\.delete\(\s*(?:cameraPhotoUri|camUri)/.test(src), 'MainActivity never deletes camera photos via ContentResolver/MediaStore');
});

t('the camera app may write the photo uri', () => {
  if (!/ACTION_IMAGE_CAPTURE/.test(src)) return;
  assert.ok(/FLAG_GRANT_WRITE_URI_PERMISSION/.test(src) && /setClipData\(ClipData\.newRawUri/.test(src));
});

t('onActivityResult deletes the empty temp file only when it is not the uri handed to the page', () => {
  const r = src.slice(src.indexOf('protected void onActivityResult'));
  const del = r.indexOf('FridgePhoto.deleteTemp(MainActivity.this, cameraPhotoUri)');
  assert.ok(del > 0);
  const guard = r.slice(0, del).split('\n').slice(-4).join('\n');
  assert.ok(/!cameraPhotoUri\.equals\(u\)/.test(guard), 'guarded by !cameraPhotoUri.equals(u): ' + guard);
});

t('temporary fridge photos are created in cache and cleaned up on launch and after the page reads them', () => {
  assert.ok(/FridgePhoto\.createTemp/.test(src), 'creates temp file in app cache');
  assert.ok(/FridgePhoto\.cleanup/.test(src), 'sweeps leftover cache files on launch');
  assert.ok(/public void clearFridgePhotos\(\)/.test(src), 'JS bridge deletes cache file after reading');
});

console.log(n + ' android camera tests passed');
