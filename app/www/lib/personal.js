/* Personal words in shared content. The app's code and content live in a public repo, so they never hold his
   daughter's name: content writes {child} and the phone fills in the name he typed in Parenting setup
   (wl.coach.v1, kept only on the phone), or a fallback ("your daughter" in English, "Baby" in Tagalog lessons). */
(function (root) {
  'use strict';
  var KEY = 'wl.coach.v1', TOKEN = /\{child(?:\|([^{}]*))?\}/g;

  function childName(storage) {
    try {
      var raw = (storage || root.localStorage).getItem(KEY), s = raw ? JSON.parse(raw) : null;
      var n = s && s.child && typeof s.child.name === 'string' ? s.child.name.replace(/[{}<>\n\r\t]/g, '').trim() : '';
      return n.slice(0, 40);
    } catch (e) { return ''; }
  }

  /* "{child}" -> name; without a name the fallback, with a capital at the start of a sentence or quote.
     "{child|my daughter}" gives its own fallback (prayers are said in the first person). */
  function fill(text, name, fallback) {
    if (typeof text !== 'string' || text.indexOf('{child') < 0) return text;
    return text.replace(TOKEN, function (m, alt, off, str) {
      if (name) return name;
      var fb = alt || fallback;
      var start = /(^|[.!?]\s+|[“"‘(]\s*|\n\s*)$/.test(str.slice(0, off));
      return start ? fb.charAt(0).toUpperCase() + fb.slice(1) : fb;
    });
  }

  /* A copy of any JSON-like value with every string filled in. Unchanged values are returned as they are. */
  function personalize(x, name, fallback) {
    fallback = fallback || 'your daughter';
    if (typeof x === 'string') return fill(x, name, fallback);
    if (Array.isArray(x)) return x.map(function (v) { return personalize(v, name, fallback); });
    if (x && typeof x === 'object') {
      var o = {};
      for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = personalize(x[k], name, fallback);
      return o;
    }
    return x;
  }

  var api = { childName: childName, fill: fill, personalize: personalize, KEY: KEY };
  root.WLPersonal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
