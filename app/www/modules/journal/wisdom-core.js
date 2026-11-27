/* Wisdom toolkit logic (no DOM): Zoom Out (self-distancing & wise reasoning), Decision Log (intentional 14/30/90-day
   revisits), and Personal Principles (weekly lessons handbook). Storage key 'wl.wisdom.v1'.
   General reflective practice only — not therapy, medical, or legal advice. */
(function (root) {
  'use strict';
  var WLD = root.WLDates || require('../../lib/dates.js');
  var iso = WLD.iso, isDate = WLD.isDate, addDays = WLD.addDays;

  var REVIEW_DAYS = [14, 30, 90];
  var OUTCOMES = ['As expected', 'Better than expected', 'Mixed', 'Learned a lesson'];
  var TAGS = ['Family', 'Parenting', 'Calm', 'Work', 'Faith', 'Health', 'Money', 'Character'];

  function defaults() {
    return { zoomouts: [], decisions: [], principles: [] };
  }

  var idn = 0;
  function newId(when) {
    idn++;
    return (when || new Date()).getTime().toString(36) + '-' + idn;
  }

  function trim(s, max) {
    return String(s == null ? '' : s).trim().slice(0, max || 800);
  }

  function insertNewest(list, item) {
    var t = Date.parse(item.at), i = 0;
    if (!isNaN(t)) {
      while (i < list.length) {
        var cur = list[i] && Date.parse(list[i].at);
        if (isNaN(cur) || cur <= t) break;
        i++;
      }
    }
    list.splice(i, 0, item);
  }

  function cleanFeedback(fb) {
    if (!fb || typeof fb !== 'object') return null;
    var bs = Array.isArray(fb.blindSpots)
      ? fb.blindSpots.filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return trim(x, 300); }).slice(0, 4)
      : [];
    var otherSide = typeof fb.otherSide === 'string' ? trim(fb.otherSide, 500) : '';
    var reframe = typeof fb.reframe === 'string' ? trim(fb.reframe, 500) : '';
    var nextStep = typeof fb.nextStep === 'string' ? trim(fb.nextStep, 400) : '';
    if (!bs.length && !otherSide && !reframe && !nextStep) return null;
    return { blindSpots: bs, otherSide: otherSide, reframe: reframe, nextStep: nextStep };
  }

  /* ---- 1) Zoom Out (third-person self-distancing & wise reasoning) ---- */
  function addZoomOut(state, inp, now) {
    if (!state || !inp) return null;
    var sit = trim(inp.situation, 1200);
    if (!sit) return null;
    now = now || new Date();
    var date = isDate(inp.date) ? inp.date : iso(now);
    var rec = {
      id: newId(now),
      at: now.toISOString(),
      date: date,
      situation: sit,
      assuming: trim(inp.assuming, 800),
      otherSide: trim(inp.otherSide, 800),
      yearView: trim(inp.yearView, 600),
      nextStep: trim(inp.nextStep, 500)
    };
    var fb = cleanFeedback(inp.feedback);
    if (fb) rec.feedback = fb;
    if (!Array.isArray(state.zoomouts)) state.zoomouts = [];
    insertNewest(state.zoomouts, rec);
    if (state.zoomouts.length > 200) state.zoomouts.length = 200;
    return rec;
  }

  function setZoomOutFeedback(state, id, fb) {
    if (!state || !Array.isArray(state.zoomouts) || !id) return null;
    var clean = cleanFeedback(fb);
    if (!clean) return null;
    for (var i = 0; i < state.zoomouts.length; i++) {
      if (state.zoomouts[i] && state.zoomouts[i].id === id) {
        state.zoomouts[i].feedback = clean;
        return clean;
      }
    }
    return null;
  }

  function removeZoomOut(state, id) {
    if (!state || !Array.isArray(state.zoomouts)) return false;
    var before = state.zoomouts.length;
    state.zoomouts = state.zoomouts.filter(function (x) { return x && x.id !== id; });
    return state.zoomouts.length !== before;
  }

  /* ---- 2) Decision Log (intentional 14 / 30 / 90-day revisit) ---- */
  function cleanReviewDays(n) {
    var d = Math.round(+n);
    return isFinite(d) && d >= 7 && d <= 365 ? d : 30;
  }

  function addDecision(state, inp, now) {
    if (!state || !inp) return null;
    var choice = trim(inp.choice, 500);
    if (!choice) return null;
    now = now || new Date();
    var date = isDate(inp.date) ? inp.date : iso(now);
    var days = cleanReviewDays(inp.reviewDays);
    var reviewOn = isDate(inp.reviewOn) && inp.reviewOn >= date ? inp.reviewOn : addDays(date, days);
    var rec = {
      id: newId(now),
      at: now.toISOString(),
      date: date,
      choice: choice,
      why: trim(inp.why, 800),
      expect: trim(inp.expect, 800),
      reviewDays: days,
      reviewOn: reviewOn,
      review: null
    };
    if (!Array.isArray(state.decisions)) state.decisions = [];
    insertNewest(state.decisions, rec);
    if (state.decisions.length > 200) state.decisions.length = 200;
    return rec;
  }

  function dueDecisions(state, now) {
    if (!state || !Array.isArray(state.decisions)) return [];
    var today = iso(now || new Date());
    return state.decisions
      .filter(function (d) { return d && !d.review && isDate(d.reviewOn) && d.reviewOn <= today; })
      .sort(function (a, b) {
        if (a.reviewOn !== b.reviewOn) return a.reviewOn < b.reviewOn ? -1 : 1;
        return (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
      });
  }

  function reviewDecision(state, id, inp, now) {
    if (!state || !Array.isArray(state.decisions) || !id || !inp) return null;
    var actual = trim(inp.actual, 1000);
    var lesson = trim(inp.lesson, 500);
    var outcome = OUTCOMES.indexOf(inp.outcome) >= 0 ? inp.outcome : '';
    if (!outcome && !actual && !lesson) return null;
    now = now || new Date();
    for (var i = 0; i < state.decisions.length; i++) {
      var d = state.decisions[i];
      if (d && d.id === id) {
        d.review = {
          at: now.toISOString(),
          date: iso(now),
          outcome: outcome || 'Learned a lesson',
          actual: actual,
          lesson: lesson
        };
        return d.review;
      }
    }
    return null;
  }

  function snoozeDecision(state, id, days, now) {
    if (!state || !Array.isArray(state.decisions) || !id) return null;
    var step = Math.round(+days);
    if (!isFinite(step) || step < 1 || step > 180) step = 14;
    var today = iso(now || new Date());
    for (var i = 0; i < state.decisions.length; i++) {
      var d = state.decisions[i];
      if (d && d.id === id && !d.review) {
        var base = isDate(d.reviewOn) && d.reviewOn > today ? d.reviewOn : today;
        d.reviewOn = addDays(base, step);
        return d.reviewOn;
      }
    }
    return null;
  }

  function removeDecision(state, id) {
    if (!state || !Array.isArray(state.decisions)) return false;
    var before = state.decisions.length;
    state.decisions = state.decisions.filter(function (x) { return x && x.id !== id; });
    return state.decisions.length !== before;
  }

  /* ---- 3) Personal Principles (weekly lessons handbook) ---- */
  function addPrinciple(state, inp, now) {
    if (!state || !inp) return null;
    var text = trim(inp.text, 500);
    if (!text) return null;
    now = now || new Date();
    var date = isDate(inp.date) ? inp.date : iso(now);
    var tag = TAGS.indexOf(inp.tag) >= 0 ? inp.tag : '';
    var rec = {
      id: newId(now),
      at: now.toISOString(),
      date: date,
      text: text,
      context: trim(inp.context, 800),
      tag: tag
    };
    if (typeof inp.fromDecisionId === 'string' && inp.fromDecisionId.trim()) {
      rec.fromDecisionId = trim(inp.fromDecisionId, 60);
    }
    if (!Array.isArray(state.principles)) state.principles = [];
    insertNewest(state.principles, rec);
    if (state.principles.length > 250) state.principles.length = 250;
    return rec;
  }

  function removePrinciple(state, id) {
    if (!state || !Array.isArray(state.principles)) return false;
    var before = state.principles.length;
    state.principles = state.principles.filter(function (x) { return x && x.id !== id; });
    return state.principles.length !== before;
  }

  /* ---- Plain-text export ---- */
  function exportText(state, now) {
    if (!state) return '';
    var ps = Array.isArray(state.principles) ? state.principles : [];
    var ds = Array.isArray(state.decisions) ? state.decisions : [];
    var zs = Array.isArray(state.zoomouts) ? state.zoomouts : [];
    if (!ps.length && !ds.length && !zs.length) return '';
    var out = ['My wisdom notes (Wellness app)', 'Saved ' + iso(now || new Date()), ''];
    if (ps.length) {
      out.push('=== Personal Principles ===', '');
      ps.forEach(function (p) {
        out.push(p.date + (p.tag ? '  [' + p.tag + ']' : '') + '  —  ' + p.text);
        if (p.context) out.push('  Context: ' + p.context);
        out.push('');
      });
    }
    if (ds.length) {
      out.push('=== Decision Log ===', '');
      ds.forEach(function (d) {
        out.push(d.date + '  —  ' + d.choice + ' (revisit ' + d.reviewOn + ')');
        if (d.why) out.push('  Why: ' + d.why);
        if (d.expect) out.push('  Expected: ' + d.expect);
        if (d.review) {
          out.push('  Reviewed ' + d.review.date + ' (' + d.review.outcome + '): ' + (d.review.actual || ''));
          if (d.review.lesson) out.push('  Lesson: ' + d.review.lesson);
        }
        out.push('');
      });
    }
    if (zs.length) {
      out.push('=== Zoom Out Reflections ===', '');
      zs.forEach(function (z) {
        out.push(z.date + '  —  ' + z.situation);
        if (z.assuming) out.push('  Might be assuming/missing: ' + z.assuming);
        if (z.otherSide) out.push('  Other side: ' + z.otherSide);
        if (z.yearView) out.push('  In a year: ' + z.yearView);
        if (z.nextStep) out.push('  Next step: ' + z.nextStep);
        if (z.feedback) {
          if (z.feedback.blindSpots && z.feedback.blindSpots.length) out.push('  Blind spots: ' + z.feedback.blindSpots.join(' | '));
          if (z.feedback.reframe) out.push('  Long view: ' + z.feedback.reframe);
        }
        out.push('');
      });
    }
    return out.join('\n').trim() + '\n';
  }

  /* ---- Strict restore validation (never throws; idempotent) ---- */
  function validAt(at, date) {
    if (typeof at === 'string' && !isNaN(Date.parse(at))) return at;
    if (isDate(date)) return date + 'T12:00:00.000Z';
    return null;
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || (!Array.isArray(s.zoomouts) && !Array.isArray(s.decisions) && !Array.isArray(s.principles))) return null;
    var d = defaults();
    if (Array.isArray(s.zoomouts)) {
      s.zoomouts.slice(0, 200).forEach(function (z) {
        if (!z || typeof z !== 'object') return;
        var sit = typeof z.situation === 'string' ? trim(z.situation, 1200) : '';
        var date = isDate(z.date) ? z.date : null;
        var at = validAt(z.at, date);
        if (!sit || !at) return;
        if (!date) date = iso(new Date(at));
        var rec = {
          id: typeof z.id === 'string' && z.id.trim() ? trim(z.id, 60) : newId(new Date(at)),
          at: at, date: date, situation: sit,
          assuming: typeof z.assuming === 'string' ? trim(z.assuming, 800) : '',
          otherSide: typeof z.otherSide === 'string' ? trim(z.otherSide, 800) : '',
          yearView: typeof z.yearView === 'string' ? trim(z.yearView, 600) : '',
          nextStep: typeof z.nextStep === 'string' ? trim(z.nextStep, 500) : ''
        };
        var fb = cleanFeedback(z.feedback);
        if (fb) rec.feedback = fb;
        d.zoomouts.push(rec);
      });
    }
    if (Array.isArray(s.decisions)) {
      s.decisions.slice(0, 200).forEach(function (x) {
        if (!x || typeof x !== 'object') return;
        var choice = typeof x.choice === 'string' ? trim(x.choice, 500) : '';
        var date = isDate(x.date) ? x.date : null;
        var at = validAt(x.at, date);
        if (!choice || !at) return;
        if (!date) date = iso(new Date(at));
        var days = cleanReviewDays(x.reviewDays);
        var reviewOn = isDate(x.reviewOn) ? x.reviewOn : addDays(date, days);
        var rev = null;
        if (x.review && typeof x.review === 'object') {
          var rDate = isDate(x.review.date) ? x.review.date : null;
          var rAt = validAt(x.review.at, rDate);
          if (rAt) {
            if (!rDate) rDate = iso(new Date(rAt));
            rev = {
              at: rAt, date: rDate,
              outcome: OUTCOMES.indexOf(x.review.outcome) >= 0 ? x.review.outcome : 'Learned a lesson',
              actual: typeof x.review.actual === 'string' ? trim(x.review.actual, 1000) : '',
              lesson: typeof x.review.lesson === 'string' ? trim(x.review.lesson, 500) : ''
            };
          }
        }
        d.decisions.push({
          id: typeof x.id === 'string' && x.id.trim() ? trim(x.id, 60) : newId(new Date(at)),
          at: at, date: date, choice: choice,
          why: typeof x.why === 'string' ? trim(x.why, 800) : '',
          expect: typeof x.expect === 'string' ? trim(x.expect, 800) : '',
          reviewDays: days, reviewOn: reviewOn, review: rev
        });
      });
    }
    if (Array.isArray(s.principles)) {
      s.principles.slice(0, 250).forEach(function (p) {
        if (!p || typeof p !== 'object') return;
        var text = typeof p.text === 'string' ? trim(p.text, 500) : '';
        var date = isDate(p.date) ? p.date : null;
        var at = validAt(p.at, date);
        if (!text || !at) return;
        if (!date) date = iso(new Date(at));
        var rec = {
          id: typeof p.id === 'string' && p.id.trim() ? trim(p.id, 60) : newId(new Date(at)),
          at: at, date: date, text: text,
          context: typeof p.context === 'string' ? trim(p.context, 800) : '',
          tag: TAGS.indexOf(p.tag) >= 0 ? p.tag : ''
        };
        if (typeof p.fromDecisionId === 'string' && p.fromDecisionId.trim()) {
          rec.fromDecisionId = trim(p.fromDecisionId, 60);
        }
        d.principles.push(rec);
      });
    }
    return d;
  }

  var api = {
    REVIEW_DAYS: REVIEW_DAYS, OUTCOMES: OUTCOMES, TAGS: TAGS,
    defaults: defaults, cleanFeedback: cleanFeedback,
    addZoomOut: addZoomOut, setZoomOutFeedback: setZoomOutFeedback, removeZoomOut: removeZoomOut,
    addDecision: addDecision, dueDecisions: dueDecisions, reviewDecision: reviewDecision,
    snoozeDecision: snoozeDecision, removeDecision: removeDecision,
    addPrinciple: addPrinciple, removePrinciple: removePrinciple,
    exportText: exportText, validate: validate, iso: iso
  };
  root.WisdomCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
