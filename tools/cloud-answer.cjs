#!/usr/bin/env node
/* Cloud runs answering the phone's queued Claude requests (cloud-plan.md task B / 34; pc/prompts/README.md).
   Work in a private scratch dir OUTSIDE the repo: the sync file and answers are his data.

   1. node tools/cloud-answer.cjs prepare <wellness-sync.json> <work> [<sheet-export.csv>]
      Lists the requests not yet acked (and not already answered in the sheet); writes <work>/<id>.prompt.md (the same prompt the PC link would run,
      advice/weekly-plan with the same 14-day summary, made from the synced data) and <work>/requests.json.
   2. Answer each prompt as it says (one JSON object) into <work>/answers/<id>.json, or {"error": "..."}.
   3. node tools/cloud-answer.cjs rows <wellness-sync.json> <work> [<sheet-export.csv>]
      Writes <work>/rows.json: the full wellness-answers sheet (header, rows still unacked, new answers, then blank
      rows over any old ones), ready for Sheets update_values on Sheet1!A1:D<rows.length>. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'app/www/lib/activity.js'));
const C = require(path.join(ROOT, 'app/www/lib/sync-core.js'));
const HEADER = ['id', 'task', 'answer-json', 'at'];
let cachedPy = null;
function pythonBin() {
  if (cachedPy) return cachedPy;
  const cands = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const c of cands) { if (spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) return (cachedPy = c); }
  return (cachedPy = cands[0]);
}

function readSync(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const o = JSON.parse(raw);
  if (!o || o.app !== 'wellness' || typeof o.stores !== 'object') throw new Error(file + ' is not a wellness sync file');
  return o;
}
function states(sync) {
  const out = {};
  for (const k of Object.keys(sync.stores || {})) { try { out[k] = JSON.parse(sync.stores[k]); } catch (e) { /* skip odd */ } }
  return out;
}
function answeredIds(csvFile) {
  if (!csvFile || !fs.existsSync(csvFile)) return new Set();
  const ans = C.rowsToAnswers(C.parseCsv(fs.readFileSync(csvFile, 'utf8')));
  return new Set(Object.keys(ans));
}
function pending(sync, csvFile) {
  const acked = new Set(Array.isArray(sync.acked) ? sync.acked : []);
  const already = answeredIds(csvFile);
  return (Array.isArray(sync.requests) ? sync.requests : []).filter((r) => r && r.id && r.task && !acked.has(r.id) && !already.has(r.id));
}

function prepare(syncFile, work, csvOrNow, maybeNow) {
  const csvFile = csvOrNow instanceof Date ? null : csvOrNow;
  const now = csvOrNow instanceof Date ? csvOrNow : maybeNow;
  const sync = readSync(syncFile), st = states(sync), reqs = pending(sync, csvFile);
  fs.mkdirSync(path.join(work, 'answers'), { recursive: true });
  const journalText = !!(st['wl.pc.v1'] && st['wl.pc.v1'].journalText);
  const events = A.collect(st, { journalText }, now || new Date());
  const filled = reqs.length ? JSON.parse(execFileSync(pythonBin(), [path.join(__dirname, 'cloud_prompts.py')], {
    input: JSON.stringify({ events, requests: reqs, work: path.resolve(work) }), encoding: 'utf8', maxBuffer: 64 << 20
  })) : {};
  const list = reqs.map((r) => {
    const f = filled[r.id] || { error: 'not filled' };
    const item = { id: r.id, task: r.task, at: r.at, tools: f.tools || '', prompt: f.prompt ? r.id + '.prompt.md' : null, error: f.error || null };
    if (f.prompt) fs.writeFileSync(path.join(work, r.id + '.prompt.md'), f.prompt + '\n');
    return item;
  });
  fs.writeFileSync(path.join(work, 'requests.json'), JSON.stringify(list, null, 1));
  return list;
}

function rows(syncFile, work, csvFile, now) {
  const sync = readSync(syncFile), acked = new Set(Array.isArray(sync.acked) ? sync.acked : []);
  const tasks = {}; for (const r of Array.isArray(sync.requests) ? sync.requests : []) if (r && r.id) tasks[r.id] = r.task;
  const old = csvFile && fs.existsSync(csvFile) ? C.parseCsv(fs.readFileSync(csvFile, 'utf8')) : [];
  const oldData = old.filter((r, i) => !(i === 0 && String(r[0]).trim().toLowerCase() === 'id'));
  const dir = path.join(work, 'answers'), fresh = [], problems = [];
  const at = (now || new Date()).toISOString();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort() : []) {
    const id = f.slice(0, -5);
    if (!tasks[id]) { problems.push(id + ': not a request in the sync file'); continue; }
    if (acked.has(id)) continue; // the phone already has an answer for it
    let obj;
    try { obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(id + ': not JSON (' + e.message + ')'); continue; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { problems.push(id + ': not one JSON object'); continue; }
    const cell = typeof obj.error === 'string' && Object.keys(obj).length === 1 ? { task: tasks[id], error: obj.error.slice(0, 400) } : { task: tasks[id], answer: obj };
    fresh.push([id, tasks[id], JSON.stringify(cell), at]);
  }
  const freshIds = new Set(fresh.map((r) => r[0]));
  const kept = oldData.filter((r) => r[0] && !acked.has(String(r[0]).trim()) && !freshIds.has(String(r[0]).trim()))
    .map((r) => [0, 1, 2, 3].map((i) => String(r[i] == null ? '' : r[i])));
  const out = [HEADER].concat(kept, fresh);
  while (out.length < oldData.length + 1) out.push(['', '', '', '']);
  // what the phone will read back from this sheet (a check that every cell parses)
  const csv = out.map((r) => r.map((c) => /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\n');
  const back = C.rowsToAnswers(C.parseCsv(csv));
  for (const r of fresh) if (!back[r[0]]) problems.push(r[0] + ': does not read back');
  fs.writeFileSync(path.join(work, 'rows.json'), JSON.stringify(out));
  return { rows: out, kept: kept.length, added: fresh.length, dropped: oldData.filter((r) => r[0]).length - kept.length, problems };
}

module.exports = { prepare, rows, pending, HEADER };

if (require.main === module) {
  const [cmd, syncFile, work, csv] = process.argv.slice(2);
  if (cmd === 'prepare' && syncFile && work) {
    const l = prepare(syncFile, work, csv);
    if (!l.length) console.log('No requests waiting.');
    for (const x of l) console.log(x.id + '  ' + x.task + '  ' + (x.error ? 'ERROR ' + x.error : path.join(work, x.prompt)) + (x.tools ? '  (web: ' + x.tools + ')' : ''));
  } else if (cmd === 'rows' && syncFile && work) {
    const r = rows(syncFile, work, csv);
    console.log('rows.json: ' + r.rows.length + ' rows (kept ' + r.kept + ', added ' + r.added + ', dropped ' + r.dropped + '); range Sheet1!A1:D' + r.rows.length);
    for (const p of r.problems) console.log('PROBLEM ' + p);
    if (r.problems.length) process.exitCode = 1;
  } else {
    console.log('usage: node tools/cloud-answer.cjs prepare <wellness-sync.json> <work> [<sheet.csv>]\n       node tools/cloud-answer.cjs rows <wellness-sync.json> <work> [<sheet.csv>]');
    process.exitCode = 2;
  }
}
