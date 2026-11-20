/* Calendar-date helpers shared by the shell and every part (local time, 'YYYY-MM-DD'). Loaded first in index.html;
   the cores also require() it in Node tests. */
(function (root) {
  'use strict';
  /* A Date's local calendar date (today when left out). */
  function iso(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, x = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x;
  }
  /* 'YYYY-MM-DD' plus n calendar days (whole days, so DST changes don't matter). */
  function addDays(s, n) { var p = String(s).split('-'); return iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
  var api = { iso: iso, addDays: addDays };
  root.WLDates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
