/* Shared guided-session engine (faith prayers, meditation): a script is a list of steps {say, wait};
   Player plays it through injected speak/timer functions so it can be tested without a browser. */
(function (root) {
  'use strict';
  /* ---- Guided sessions ----
     A script is a list of steps: {say: 'text to read', wait: seconds of quiet after it}.
     scaleScript stretches the quiet so the whole thing lasts about `minutes`. */
  function wordsSeconds(text, rate) {
    var w = String(text || '').split(/\s+/).filter(Boolean).length;
    return w / (2.4 * (rate || 1)) + 0.4;
  }

  function scaleScript(steps, minutes, rate) {
    var speak = 0, quiet = 0;
    steps.forEach(function (s) { speak += wordsSeconds(s.say, rate); quiet += s.wait || 0; });
    var target = Math.max(30, (minutes || 5) * 60);
    var spare = target - speak;
    var k = quiet > 0 ? Math.max(0.5, Math.min(10, spare / quiet)) : 1;
    return steps.map(function (s) {
      var w = Math.round((s.wait || 0) * k);
      if ((s.wait || 0) > 0) w = Math.max(2, w);
      return { say: s.say, wait: w, kind: s.kind || '' };
    });
  }

  function scriptLength(steps, rate) {
    var t = 0;
    steps.forEach(function (s) { t += wordsSeconds(s.say, rate) + (s.wait || 0); });
    return t;
  }

  /* A small state machine that plays a script through injected speak/timer functions,
     so it can be tested without a browser. env: {speak(text, done), stopSpeech(), setTimeout, clearTimeout, now, onStep(i, step), onEnd()} */
  function Player(steps, env) {
    this.steps = steps; this.env = env;
    this.i = -1; this.phase = 'idle'; // idle | speaking | quiet | paused | ended
    this.from = 0; this.timer = null; this.token = 0; this.quietLeft = 0; this.quietStart = 0; this.pausedPhase = null;
  }
  Player.prototype.start = function (from) { if (from != null) this.from = from; this.go(this.from || 0); };
  Player.prototype.go = function (i) {
    var self = this, env = this.env;
    this.clear();
    if (i >= this.steps.length) { this.phase = 'ended'; this.i = this.steps.length; if (env.onEnd) env.onEnd(); return; }
    this.i = i; this.phase = 'speaking';
    var tok = ++this.token, step = this.steps[i];
    if (env.onStep) env.onStep(i, step);
    var done = function () { if (tok === self.token && self.phase === 'speaking') self.quiet(step.wait || 0); };
    if (step.say) env.speak(step.say, done); else done();
  };
  Player.prototype.quiet = function (secs) {
    var self = this, tok = this.token;
    this.phase = 'quiet'; this.quietLeft = secs * 1000; this.quietStart = this.env.now();
    this.timer = this.env.setTimeout(function () { if (tok === self.token) self.go(self.i + 1); }, secs * 1000);
  };
  Player.prototype.clear = function () {
    if (this.timer != null) { this.env.clearTimeout(this.timer); this.timer = null; }
    this.token++;
  };
  Player.prototype.pause = function () {
    if (this.phase === 'idle') { this.pausedPhase = 'idle'; this.phase = 'paused'; return; } // paused before it began
    if (this.phase === 'speaking') { this.clear(); this.env.stopSpeech(); this.pausedPhase = 'speaking'; }
    else if (this.phase === 'quiet') {
      this.clear();
      this.quietLeft = Math.max(0, this.quietLeft - (this.env.now() - this.quietStart));
      this.pausedPhase = 'quiet';
    } else return;
    this.phase = 'paused';
  };
  Player.prototype.resume = function () {
    if (this.phase !== 'paused') return;
    if (this.pausedPhase === 'idle') { this.go(this.from || 0); return; }
    if (this.pausedPhase === 'quiet') {
      var self = this, tok = ++this.token;
      this.phase = 'quiet'; this.quietStart = this.env.now();
      this.timer = this.env.setTimeout(function () { if (tok === self.token) self.go(self.i + 1); }, this.quietLeft);
    } else this.go(this.i); // say the interrupted sentence again from its start
  };
  Player.prototype.skip = function () { if (this.phase !== 'ended') { this.env.stopSpeech(); this.go(this.i + 1); } };
  Player.prototype.back = function () { if (this.phase === 'ended' || this.phase === 'idle') return; this.env.stopSpeech(); this.go(Math.max(0, this.i - (this.phase === 'speaking' ? 1 : 0))); };
  Player.prototype.stop = function () { this.clear(); this.env.stopSpeech(); this.phase = 'ended'; };

  var api = { wordsSeconds: wordsSeconds, scaleScript: scaleScript, scriptLength: scriptLength, Player: Player };
  root.WLGuided = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
