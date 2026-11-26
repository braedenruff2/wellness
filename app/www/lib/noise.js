/* Ambient background noise for Calm sits & quiet timer (pure Web Audio API, 100% offline, zero audio files).
   Kinds: 'off' | 'brown' (warm, deep) | 'pink' (soft rain-like) | 'white'.
   Uses AudioBufferSourceNode + BiquadFilterNode + GainNode (never OscillatorNode, so bell-tone tests stay untouched). */
(function (root) {
  'use strict';
  var KINDS = ['off', 'brown', 'pink', 'white'];
  var LABELS = { off: 'Off', brown: 'Warm brown', pink: 'Soft rain', white: 'White noise' };
  var GAIN = { brown: 0.14, pink: 0.08, white: 0.045 };
  var FREQ = { brown: 420, pink: 1400, white: 4200 };

  var ctx = null, active = null, curKind = 'off';

  function getCtx() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended' && ctx.resume) try { ctx.resume(); } catch (e) {}
    return ctx;
  }

  /* Generate a 3-second seamless noise buffer of the requested colour. */
  function makeBuffer(c, kind) {
    var rate = c.sampleRate || 44100, len = Math.floor(rate * 3);
    var buf = c.createBuffer(1, len, rate), data = buf.getChannelData(0);
    var i, w;
    if (kind === 'brown') {
      var last = 0;
      for (i = 0; i < len; i++) {
        w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = Math.max(-1, Math.min(1, last * 3.2));
      }
    } else if (kind === 'pink') {
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (i = 0; i < len; i++) {
        w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11));
        b6 = w * 0.115926;
      }
    } else {
      for (i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Cross-fade the loop ends over 40 ms so looping has zero click
    var fade = Math.min(Math.floor(rate * 0.04), Math.floor(len / 4));
    for (i = 0; i < fade; i++) {
      var k = i / fade;
      data[i] = data[i] * k + data[len - fade + i] * (1 - k);
    }
    return buf;
  }

  function stop() {
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

  var api = { KINDS: KINDS, LABELS: LABELS, start: start, stop: stop, current: function () { return curKind; } };
  root.WLNoise = api;
  if (root.WL) root.WL.noise = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
