/* Shared dark screen for long practices (Calm sits, Quiet timer, late-night Faith prayers, Tagalog walking):
   after a wait, a black cover goes over the page and Android window brightness drops to 0.01; a tap, Space, Enter,
   Android Back (FCBack) or returning to the app lights it and re-arms. Loaded before shell.js in index.html. */
(function (root) {
  'use strict';

  function dimScreen(on) {
    var n = root.FCAndroid;
    if (n && n.dimScreen) try { n.dimScreen(!!on); } catch (e) {}
  }

  var darkSt = { on: false, t: null, id: 'wl-dark', label: '', after: 10000 };
  function darkEl() { return document.getElementById(darkSt.id); }
  function darkArm() {
    clearTimeout(darkSt.t);
    if (!darkSt.on) return;
    darkSt.t = setTimeout(function () {
      if (!darkSt.on || darkEl()) return;
      var d = document.createElement('div');
      d.id = darkSt.id; d.className = 'c-dark wl-dark'; d.tabIndex = 0; d.setAttribute('role', 'button');
      d.setAttribute('aria-label', darkSt.label || 'Dark screen. Tap to show the page.');
      d.onclick = function () { darkLight(); };
      document.body.appendChild(d); dimScreen(true);
      // a screen reader: the page under the cover is out of reach, and the cover has focus, so a double-tap lights
      // the screen instead of pressing whatever was focused underneath (Pause)
      var v = document.getElementById('view'); if (v) { v.setAttribute('inert', ''); v.setAttribute('aria-hidden', 'true'); }
      try { d.focus(); } catch (e) {}
    }, typeof darkSt.after === 'function' ? darkSt.after() : darkSt.after); // after: ms, or a function asked each time
  }
  function darkUncover() {
    clearTimeout(darkSt.t);
    var d = darkEl();
    if (d) {
      d.parentNode.removeChild(d); dimScreen(false);
      var v = document.getElementById('view'); if (v) { v.removeAttribute('inert'); v.removeAttribute('aria-hidden'); }
    }
  }
  function darkLight() { darkUncover(); darkArm(); }
  function darkStart(o) {
    o = o || {};
    if (darkSt.on && darkSt.id !== (o.id || 'wl-dark')) darkUncover();
    darkSt.on = true; darkSt.id = o.id || 'wl-dark'; darkSt.label = o.label || ''; darkSt.after = o.after || 10000;
    darkLight();
  }
  function darkStop() { darkSt.on = false; darkUncover(); }

  document.addEventListener('keydown', function (ev) {
    if (!darkEl() || !(ev.key === ' ' || ev.code === 'Space' || ev.key === 'Enter')) return;
    ev.preventDefault(); ev.stopPropagation(); darkLight(); // a key only lights the screen (it doesn't also pause)
  }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && darkEl()) darkLight(); });

  // Android's Back: with a dark screen up it only lights the screen (true); otherwise Android goes back as usual
  root.FCBack = function () { if (darkEl()) { darkLight(); return true; } return false; };

  var darkScreen = { start: darkStart, light: darkLight, stop: darkStop, isDark: function () { return !!darkEl(); } };
  root.WLDark = { dimScreen: dimScreen, darkScreen: darkScreen };
})(typeof window !== 'undefined' ? window : this);
