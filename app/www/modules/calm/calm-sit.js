/* Calm meditation-path & quiet-timer sit-screen helpers (rough-day note, quiet-sit chip, dark screen, alarms,
   interval bells, midnight-crossing timestamp). Extracted from calm.js for code health; loaded before calm.js. */
(function (root) {
  'use strict';

  function usesAlarm(p) { return !!(p && (p.path || p.kind === 'timer')); }
  /* "Quiet timer · 20 min", or "Quiet timer · 1:40" for an exact time with seconds. */
  function alarmLabel(p, m) {
    var secs = Math.round((+m || 0) * 60);
    return p.title + ' · ' + (secs % 60 ? Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + secs % 60 : secs / 60 + ' min');
  }
  /* Android end-of-session bell when the phone locks during a sit or Quiet timer (the page's own bell rings on screen). */
  function calmAlarm(ms, label) {
    var n = root.WL && root.WL.native;
    if (n && n.calmAlarm) try { n.calmAlarm(ms > 0 ? Math.round(ms) : 0, label || ''); } catch (e) {}
  }

  /* A path sit on a rough day (short sleep, broken night or low energy in today's check-in): a shorter sit is fine.
     The 10-min chip picks it for this sit only; the saved length stays. */
  function roughDay(S, p) {
    return !!(p && p.path && root.WLMe && root.WLMe.rough && root.WLMe.rough() && (S.settings.sitMinutes || 20) > 10);
  }
  function roughLine(S, p) {
    if (!roughDay(S, p)) return '';
    return '<p class="meta" id="c-rough" style="text-align:center;margin:0 0 6px">Short night: a 10-minute sit counts just as much today.</p>';
  }
  function quietChip(S, p) {
    if (!p || !p.path) return '';
    return '<div class="row" id="c-quiet-row" style="justify-content:center;margin:0 0 6px;gap:6px"><button class="chip" id="c-quiet" aria-pressed="' + !!S.settings.sitQuiet + '">Quiet sit: only the opening and the close</button></div>';
  }
  /* Mention Quiet sit and the optional interval bell once, on his very first meditation-path sit. */
  function firstSitTip(S, p) {
    var K = root.CalmCore;
    if (!p || !p.path || S.sessions.some(function (x) { return x && K.PATH.indexOf(x.id) >= 0; })) return '';
    return '<p class="meta" id="c-first-tip" style="text-align:center;margin:0 0 6px">Tip: try Quiet sit for silence after the opening, or turn on a soft bell every 5 or 10 min in Calm settings.</p>';
  }
  /* After a sit on the path: how steady attention was, and what got in the way (optional; kept on the session). */
  function sitQuestions() {
    var K = root.CalmCore, esc = root.WL.esc;
    return '<div class="ui rate" id="c-focus"><div class="meta">How steady was your attention?</div><div class="chips">' + K.FOCUS.map(function (f, i) {
      return '<button class="chip" data-f="' + (i + 1) + '">' + esc(f) + '</button>'; }).join('') + '</div></div>' +
      '<div class="ui rate" id="c-hind"><div class="meta">What got in the way? (any)</div><div class="chips">' + K.HIND.map(function (x) {
      return '<button class="chip" data-h="' + esc(x) + '" aria-pressed="false">' + esc(x) + '</button>'; }).join('') + '</div></div>';
  }

  /* A dark screen during sits and the quiet timer (setting, on by default): the app stays awake, so the voice,
     interval bells and end bell keep working, without a lit screen in a dark room. Tap shows the time again. */
  function darkOn(S, p) { return usesAlarm(p) && S.settings.dark !== false; }
  /* The "screen goes dark" hint, for his first 3 sits or quiet timers (after that he knows). */
  function darkHint(S) {
    var K = root.CalmCore;
    return S.sessions.filter(function (x) { return x && (K.PATH.indexOf(x.id) >= 0 || x.id === 'timer'); }).length < 3;
  }
  /* (the cover itself is WL.darkScreen, shared with late-night prayers and Tagalog walking) */
  function scheduleDark(S, run) {
    if (!run || run.done || run.paused || !darkOn(S, run.p)) return;
    root.WL.darkScreen.start({ id: 'c-dark', label: 'Dark screen for your sit. Tap to show the time.', after: 10000 });
  }
  function lightUp() { if (root.WL && root.WL.darkScreen) root.WL.darkScreen.stop(); }

  /* Interval bells during sits and the quiet timer (0 = off; none in the last 30 s). */
  function intervalEvery(S, p) { return usesAlarm(p) ? S.settings.interval || 0 : 0; }
  function ringInterval(run, every, elapsedSec) {
    var K = root.CalmCore;
    var k = every && run && !run.paused ? K.intervalBell(every, elapsedSec, run.total) : 0;
    if (k > run.iv) {
      run.iv = k;
      if (root.WL && root.WL.softBell) root.WL.softBell();
      return true;
    }
    return false;
  }

  /* When to file a session: now (or the earlier day he's logging for); a sit that began before midnight and ended
     after it belongs to the evening it began (a late sit shouldn't count as tomorrow's practice). */
  function sessionTime(started) {
    var K = root.CalmCore, WL = root.WL;
    var when = WL && WL.logNow ? WL.logNow() : new Date(), now = Date.now();
    if (started && Math.abs(when.getTime() - now) < 60000 && K.iso(new Date(started)) !== K.iso(when) && now - started < 6 * 3600000) return new Date(started);
    return when;
  }

  root.CalmSit = {
    usesAlarm: usesAlarm, alarmLabel: alarmLabel, calmAlarm: calmAlarm,
    roughDay: roughDay, roughLine: roughLine, quietChip: quietChip, firstSitTip: firstSitTip, sitQuestions: sitQuestions,
    darkOn: darkOn, darkHint: darkHint, scheduleDark: scheduleDark, lightUp: lightUp,
    intervalEvery: intervalEvery, ringInterval: ringInterval, sessionTime: sessionTime
  };
})(typeof window !== 'undefined' ? window : this);
