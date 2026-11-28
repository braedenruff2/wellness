/* Ambient background noise for Calm sits & quiet timer (pure Web Audio API, 100% offline, zero audio files).
   Kinds: 'off' | 'brown' (warm, deep) | 'pink' (soft rain-like) | 'white' | 'fan' (steady, mid) | 'ocean' (slow swells).
   Uses AudioBufferSourceNode + BiquadFilterNode + GainNode (never OscillatorNode, so bell-tone tests stay untouched). */
(function (root) {
  'use strict';
  var KINDS = ['off', 'brown', 'pink', 'white', 'fan', 'ocean'];
  var LABELS = { off: 'Off', brown: 'Warm brown', pink: 'Soft rain', white: 'White noise', fan: 'Fan', ocean: 'Slow waves' };
  var GAIN = { brown: 0.2, pink: 0.08, white: 0.045, fan: 0.09, ocean: 0.15 };
  /* Loudness before GAIN (RMS): pink and white as they always were; brown as before (gain moved into GAIN) with fewer clipped peaks. */
  var LEVEL = { brown: 0.22, pink: 0.19, white: 0.577, fan: 0.22, ocean: 0.16 };
  var FREQ = { brown: 420, pink: 1400, white: 4200, fan: 900, ocean: 1100 };
  /* Loop lengths: long enough that the ear can't hear the loop repeat (a 3 s brown loop sounded like a drum beat). */
  var SECS = { brown: 23, pink: 19, white: 11, fan: 17, ocean: 37 };

  var ctx = null, active = null, curKind = 'off', previewT = null;

  function getCtx() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended' && ctx.resume) try { ctx.resume(); } catch (e) {}
    return ctx;
  }

  /* The samples of one loop of a kind (pure, for tests). Seamless by construction, with no cross-fade: each filter
     runs over the white noise twice (circularly), so the state the loop starts from is the state it ends in, and
     the last sample flows into the first like any two neighbours. Level set by RMS, not by the loudest peak. */
  function samples(kind, rate, secs, rand) {
    rand = rand || Math.random;
    var len = Math.max(64, Math.floor((rate || 44100) * (secs || SECS[kind] || 10)));
    var w = new Float32Array(len), out = new Float32Array(len), i, p;
    for (i = 0; i < len; i++) w[i] = rand() * 2 - 1;
    if (kind === 'white') {
      out.set(w);
    } else if (kind === 'pink' || kind === 'ocean') {
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, x;
      for (p = 0; p < 2; p++) for (i = 0; i < len; i++) {
        x = w[i];
        b0 = 0.99886 * b0 + x * 0.0555179;
        b1 = 0.99332 * b1 + x * 0.0750759;
        b2 = 0.96900 * b2 + x * 0.1538520;
        b3 = 0.86650 * b3 + x * 0.3104856;
        b4 = 0.55000 * b4 + x * 0.5329522;
        b5 = -0.7616 * b5 - x * 0.0168980;
        if (p) out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
        b6 = x * 0.115926;
      }
    } else { // brown (deep) and fan (steady, mid): leaky integration of white noise, then a DC blocker
      var leak = kind === 'fan' ? 0.9 : 0.98, last = 0;
      for (p = 0; p < 2; p++) for (i = 0; i < len; i++) {
        last = leak * last + (1 - leak) * w[i];
        if (p) out[i] = last;
      }
    }
    if (kind !== 'white') { // a gentle high-pass (~4 Hz), also run circularly: no slow drift that would thump
      var pole = Math.exp(-2 * Math.PI * 4 / (rate || 44100)), hx = 0, hy = 0, v;
      for (p = 0; p < 2; p++) for (i = 0; i < len; i++) {
        v = out[i] - hx + pole * hy; hx = out[i]; hy = v;
        if (p) w[i] = v; // w (the white noise) is no longer needed: it holds the result
      }
      out.set(w);
    }
    if (kind === 'ocean') {
      // slow swells, irregular but periodic over the loop (2, 3 and 5 swells a loop: 7-18 s apart), never silent
      var T = len, a = rand() * 6.283, b = rand() * 6.283, c = rand() * 6.283, e;
      var env = function (j) {
        var ph = 6.283185307 * j / T;
        e = 0.5 + 0.5 * (0.5 * Math.sin(2 * ph + a) + 0.3 * Math.sin(3 * ph + b) + 0.2 * Math.sin(5 * ph + c));
        return 0.3 + 0.7 * e * e;
      };
      for (var j0 = 0; j0 < len; j0 += 256) { // the swell changes slowly: worked out every 256 samples, joined in straight lines
        var e0 = env(j0), e1 = env(j0 + 256), n = Math.min(256, len - j0);
        for (i = 0; i < n; i++) out[j0 + i] *= e0 + (e1 - e0) * i / 256;
      }
    }
    var sum = 0;
    for (i = 0; i < len; i++) sum += out[i] * out[i];
    var rms = Math.sqrt(sum / len) || 1, k = (LEVEL[kind] || 0.22) / rms;
    for (i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i] * k));
    return out;
  }

  /* Made once per kind and kept (the last 3), so switching sounds during a sit is instant the second time. */
  var made = [];
  function makeBuffer(c, kind) {
    var rate = c.sampleRate || 44100;
    for (var i = 0; i < made.length; i++) if (made[i].kind === kind && made[i].c === c) return made[i].buf;
    var data = samples(kind, rate);
    var buf = c.createBuffer(1, data.length, rate);
    if (buf.copyToChannel) buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data);
    made.push({ kind: kind, c: c, buf: buf }); if (made.length > 3) made.shift();
    return buf;
  }

  function stop() {
    clearTimeout(previewT); previewT = null;
    curKind = 'off';
    if (!active) return;
    var a = active; active = null;
    try {
      var t = a.ctx.currentTime;
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(Math.max(0.0001, a.gain.gain.value || 0.001), t);
      a.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      a.src.stop(t + 0.28);
    } catch (e) {
      try { a.src.stop(); } catch (e2) {}
    }
  }

  function start(kind) {
    clearTimeout(previewT); previewT = null; // a sit starting during a preview keeps the sound going
    if (KINDS.indexOf(kind) < 0 || kind === 'off') { stop(); return false; }
    if (active && curKind === kind) return true;
    stop();
    try {
      var c = getCtx(); if (!c || !c.createBufferSource || !c.createBuffer) return false;
      var src = c.createBufferSource();
      src.buffer = makeBuffer(c, kind);
      src.loop = true;
      var gain = c.createGain(), t = c.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(GAIN[kind] || 0.08, t + 1.0);
      if (c.createBiquadFilter) {
        var flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = FREQ[kind] || 1200;
        src.connect(flt); flt.connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(c.destination);
      src.start(t);
      active = { ctx: c, src: src, gain: gain };
      curKind = kind;
      return true;
    } catch (e) { curKind = 'off'; active = null; return false; }
  }

  /* The soft interval bell rings: the sound dips to a third for its 2.5 s, so the bell is heard over it. */
  function duck(secs) {
    if (!active) return false;
    try {
      var g = active.gain.gain, t = active.ctx.currentTime, full = GAIN[curKind] || 0.08, d = secs || 2.5;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value || full), t);
      g.linearRampToValueAtTime(full / 3, t + 0.15);
      g.setValueAtTime(full / 3, t + d);
      g.linearRampToValueAtTime(full, t + d + 0.8);
      return true;
    } catch (e) { return false; }
  }

  /* A few seconds of a sound so it can be chosen before a sit (it fades out by itself; start() keeps it going). */
  function preview(kind, secs) {
    if (KINDS.indexOf(kind) < 0 || kind === 'off') { stop(); return false; }
    if (!start(kind)) return false;
    previewT = setTimeout(function () { previewT = null; stop(); }, (secs || 4) * 1000);
    return true;
  }

  var api = { KINDS: KINDS, LABELS: LABELS, samples: samples, preview: preview, previewing: function () { return !!previewT; }, start: start, stop: stop, duck: duck, current: function () { return curKind; } };
  root.WLNoise = api;
  if (root.WL) root.WL.noise = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
