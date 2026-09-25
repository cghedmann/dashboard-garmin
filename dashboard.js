#!/usr/bin/env node
/**
 * Training Dashboard — pulls your Garmin Connect data using cached OAuth
 * tokens and renders a single self-contained index.html you can open in
 * any browser. Never prompts for a password.
 *
 * SETUP (one-time)
 * -----------------
 *     npm install garmin-connect
 *
 * This uses the `garmin-connect` npm package (GCClient), which stores/reuses
 * OAuth1 + OAuth2 tokens as oauth1_token.json / oauth2_token.json in a
 * directory — the same file layout the Python `garminconnect` (garth-based)
 * library uses at ~/.garminconnect. If your ~/.garminconnect was created by
 * a DIFFERENT auth flow (some forks of the Python library use a newer
 * `garmin_tokens.json` bearer-token format), this script will detect that
 * and tell you rather than silently failing — see checkTokenStore() below.
 *
 * IMPORTANT CAVEAT: unlike the official-ish Python library, this JS package
 * only has first-class built-in methods for profile + activities. HRV,
 * resting HR, sleep, and VO2max are pulled via the same undocumented
 * Garmin Connect endpoints the Python library uses internally, called
 * through GCClient's raw GET support. Those exact paths aren't publicly
 * documented and can change — every one of those calls is wrapped and
 * logged to a diagnostics list so you can see exactly what worked.
 *
 * USAGE
 * -----
 *     node dashboard.js
 *
 * Re-run any time to refresh index.html.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let GarminConnect;
try {
  ({ GarminConnect } = require('garmin-connect'));
} catch (e) {
  console.error('Missing dependency. Install it with:\n    npm install garmin-connect');
  process.exit(1);
}

// =============================================================================
// CONFIG — edit this block
// =============================================================================
const CONFIG = {
  raceName: 'REPLACE_ME Marathon',
  raceDate: '2026-12-31', // YYYY-MM-DD
  heightCm: 178,
  weightKg: 70,
  personalBests: {
    '5K': 'REPLACE_ME',
    '10K': 'REPLACE_ME',
    'Half Marathon': 'REPLACE_ME',
    Marathon: 'REPLACE_ME',
  },
  units: 'mi', // 'mi' or 'km'
};

const WEEKS_TRAINING_LOAD = 12; // CTL/ATL/TSB + weekly mileage window
const WEEKS_CTL_SEED = 6;       // extra history pulled (not displayed) so CTL isn't ramping from 0
const WEEKS_RECOVERY = 6;       // HRV / resting HR / sleep window
const WEEKS_RECENT_RUNS = 4;    // recent runs table + pace panel window

const TOKENSTORE = path.join(os.homedir(), '.garminconnect');
const OUTPUT_FILE = path.join(__dirname, 'index.html');

const RUNNING_TYPES = new Set([
  'running', 'track_running', 'trail_running', 'treadmill_running',
  'indoor_running', 'virtual_run', 'street_running',
]);
const WORKOUT_TE_LABELS = new Set(['TEMPO', 'THRESHOLD', 'ANAEROBIC_CAPACITY', 'SPEED', 'VO2MAX', 'SPRINT']);
const WORKOUT_KEYWORDS = ['interval', 'tempo', 'track', 'fartlek', 'threshold', 'repeat', 'race', 'vo2'];

const UNIT_METERS = CONFIG.units === 'mi' ? 1609.344 : 1000.0;
const PACE_UNIT = CONFIG.units === 'mi' ? 'mi' : 'km';

// =============================================================================
// Diagnostics — tracks which fields actually came back, so the console/page
// tell you exactly what your account does and doesn't expose.
// =============================================================================
const DIAGNOSTICS = { ok: new Set(), missing: new Set() };

async function safe(label, fn) {
  try {
    const result = await fn();
    if (result) {
      DIAGNOSTICS.ok.add(label);
      return result;
    }
    DIAGNOSTICS.missing.add(`${label} (empty response)`);
    return null;
  } catch (e) {
    DIAGNOSTICS.missing.add(`${label} (${e.name || 'Error'}: ${(e.message || '').slice(0, 80)})`);
    return null;
  }
}

// =============================================================================
// Garmin connection — reuses cached tokens only, never prompts for creds
// =============================================================================
function checkTokenStore() {
  if (!fs.existsSync(TOKENSTORE)) {
    console.error(
      `No cached Garmin tokens found at ${TOKENSTORE}.\n` +
      'This script never prompts for a password. Log in once via the ' +
      'garmin-connect package\'s normal interactive flow (or the Python ' +
      'garminconnect library) to create the token cache, then re-run this script.'
    );
    process.exit(1);
  }
  const hasOauth = fs.existsSync(path.join(TOKENSTORE, 'oauth1_token.json'))
    && fs.existsSync(path.join(TOKENSTORE, 'oauth2_token.json'));
  const hasNewFormat = fs.existsSync(path.join(TOKENSTORE, 'garmin_tokens.json'));

  if (!hasOauth && hasNewFormat) {
    console.error(
      `${TOKENSTORE} contains garmin_tokens.json (a newer DI-OAuth bearer-token\n` +
      'format used by some forks of the Python garminconnect library). The\n' +
      '`garmin-connect` npm package this script uses expects the older\n' +
      'oauth1_token.json/oauth2_token.json pair instead, so it can\'t reuse\n' +
      'that file directly. Options:\n' +
      '  1. Do a one-time interactive login through the garmin-connect npm\n' +
      '     package (see its README) and save its tokens to a separate\n' +
      "     directory with GCClient.saveTokenToFile(), then point TOKENSTORE\n" +
      '     at that directory instead.\n' +
      '  2. Keep using the Python dashboard.py, whose garminconnect version\n' +
      '     matches your cached tokens.'
    );
    process.exit(1);
  }
  if (!hasOauth) {
    console.error(
      `${TOKENSTORE} exists but doesn't contain oauth1_token.json + oauth2_token.json.\n` +
      'This script never prompts for a password — recreate the token cache in that ' +
      'format first, then re-run.'
    );
    process.exit(1);
  }
}

async function getClient() {
  checkTokenStore();
  const client = new GarminConnect({});
  try {
    client.loadTokenByFile(TOKENSTORE);
    // Confirm the token actually works before we build the whole page on it.
    await client.getUserProfile();
  } catch (e) {
    console.error(
      `Could not resume the cached Garmin session (${e.name || 'Error'}: ${e.message}).\n` +
      'Your cached tokens have likely expired. Re-authenticate once via the ' +
      'normal login flow to refresh the token cache, then re-run this script.'
    );
    process.exit(1);
  }
  return client;
}

// Best-effort raw GET against the Garmin Connect proxy, working around the
// fact that garmin-connect's exact "custom request" method name has moved
// around between versions.
async function raw(client, urlPath) {
  if (typeof client.get === 'function') return client.get(urlPath);
  if (client.client && typeof client.client.get === 'function') return client.client.get(urlPath);
  throw new Error('no raw GET method found on GarminConnect client');
}

// =============================================================================
// Fetch
// =============================================================================
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function fetchActivities(client, start, end) {
  const runs = [];
  let pageStart = 0;
  const pageSize = 100;
  const maxPages = 12; // safety cap (~1200 activities)
  for (let page = 0; page < maxPages; page++) {
    const batch = await safe(`activities page ${page}`, () => client.getActivities(pageStart, pageSize));
    if (!batch || batch.length === 0) break;

    let oldestInBatch = null;
    for (const a of batch) {
      const typeKey = ((a.activityType || {}).typeKey || '').toLowerCase();
      const startLocal = a.startTimeLocal;
      if (!startLocal) continue;
      const dt = new Date(startLocal.replace(' ', 'T'));
      if (isNaN(dt)) continue;
      if (oldestInBatch === null || dt < oldestInBatch) oldestInBatch = dt;
      if (dt < start || dt > end) continue;
      if (!RUNNING_TYPES.has(typeKey)) continue;

      const distanceM = a.distance || 0;
      const durationS = a.duration || 0;
      const avgSpeed = a.averageSpeed || 0;
      runs.push({
        date: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()),
        name: a.activityName || 'Run',
        distanceM,
        durationS,
        avgHr: a.averageHR || null,
        maxHr: a.maxHR || null,
        paceSecPerUnit: avgSpeed ? UNIT_METERS / avgSpeed : null,
        trainingLoad: a.activityTrainingLoad || null,
        aerobicTe: a.aerobicTrainingEffect || null,
        teLabel: (a.trainingEffectLabel || '').toUpperCase(),
        hasWorkout: a.workoutId != null,
      });
    }
    if (oldestInBatch !== null && oldestInBatch < start) break;
    pageStart += pageSize;
  }
  runs.sort((a, b) => a.date - b.date);
  return runs;
}

async function fetchRecovery(client, displayName, start, end) {
  const days = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const cdate = toDateStr(d);
    const stats = await safe(`daily stats ${cdate}`, () =>
      raw(client, `/usersummary-service/usersummary/daily/${displayName}?calendarDate=${cdate}`));
    const hrv = await safe(`hrv ${cdate}`, () => raw(client, `/hrv-service/hrv/${cdate}`));
    const sleep = await safe(`sleep ${cdate}`, () =>
      raw(client, `/wellness-service/wellness/dailySleepData/${displayName}?date=${cdate}&nonSleepBufferMinutes=60`));

    const restingHr = stats ? stats.restingHeartRate : null;

    let hrvVal = null;
    if (hrv) {
      const summary = hrv.hrvSummary || {};
      hrvVal = summary.lastNightAvg || summary.weeklyAvg || null;
    }

    let sleepHours = null;
    let sleepScore = null;
    if (sleep) {
      const dto = sleep.dailySleepDTO || {};
      const secs = dto.sleepTimeSeconds;
      if (secs) sleepHours = Math.round((secs / 3600) * 100) / 100;
      const scores = sleep.sleepScores || {};
      const overall = scores.overall || {};
      sleepScore = overall.value || null;
    }

    days.push({ date: new Date(d), restingHr, hrv: hrvVal, sleepHours, sleepScore });
  }
  return days;
}

async function fetchVo2max(client, start, end) {
  const points = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 7)) {
    const cdate = toDateStr(d);
    const metrics = await safe(`max metrics ${cdate}`, () =>
      raw(client, `/metrics-service/metrics/maxmet/day/${cdate}`));
    let val = null;
    if (metrics) {
      const entry = Array.isArray(metrics) ? metrics[0] : metrics;
      const generic = (entry || {}).generic || {};
      val = generic.vo2MaxPreciseValue || generic.vo2MaxValue || (entry || {}).vo2MaxValue || null;
    }
    if (val) points.push({ date: new Date(d), vo2max: val });
  }
  return points;
}

// =============================================================================
// Compute
// =============================================================================
function estimateHrBounds(runs, recoveryDays) {
  const maxHrs = runs.map((r) => r.maxHr).filter(Boolean);
  const maxHr = maxHrs.length ? Math.max(...maxHrs) : 190;
  const restingVals = recoveryDays.map((d) => d.restingHr).filter(Boolean).sort((a, b) => a - b);
  const restHr = restingVals.length ? restingVals[Math.floor(restingVals.length / 2)] : 55;
  return { maxHr, restHr };
}

function dateKey(d) {
  return toDateStr(d);
}

function dailyLoadSeries(runs, start, end, maxHr, restHr) {
  const totals = {};
  for (const r of runs) {
    let load;
    if (r.trainingLoad) {
      load = r.trainingLoad;
    } else {
      const hr = r.avgHr;
      const durationMin = (r.durationS || 0) / 60;
      if (hr && maxHr > restHr) {
        const hrr = Math.max(0, Math.min(1, (hr - restHr) / (maxHr - restHr)));
        load = durationMin * hrr * 0.64 * Math.exp(1.92 * hrr) * 0.1;
      } else {
        load = durationMin * 0.8;
      }
    }
    const k = dateKey(r.date);
    totals[k] = (totals[k] || 0) + load;
  }
  const series = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    series.push(totals[dateKey(d)] || 0);
  }
  return series;
}

function computeCtlAtlTsb(loads) {
  const ctl = [], atl = [], tsb = [];
  let c = 0, a = 0;
  for (const load of loads) {
    tsb.push(c - a);
    c = c + (load - c) / 42;
    a = a + (load - a) / 7;
    ctl.push(c);
    atl.push(a);
  }
  return { ctl, atl, tsb };
}

// ISO week key, e.g. "2026-W07"
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weeklyMileage(runs, weeks) {
  const totals = {};
  for (const r of runs) {
    const wk = isoWeekKey(r.date);
    totals[wk] = (totals[wk] || 0) + r.distanceM / UNIT_METERS;
  }
  const keys = Object.keys(totals).sort().slice(-weeks);
  const values = keys.map((k) => Math.round(totals[k] * 10) / 10);
  return { labels: keys, values };
}

function linearTrend(values) {
  const n = values.length;
  if (n < 2) return values.slice();
  const xs = [...Array(n).keys()];
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = meanY - slope * meanX;
  return xs.map((x) => Math.round((slope * x + intercept) * 100) / 100);
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function classifyRuns(runs) {
  for (const r of runs) {
    const name = r.name.toLowerCase();
    r._flaggedWorkout = (
      r.hasWorkout
      || WORKOUT_TE_LABELS.has(r.teLabel)
      || WORKOUT_KEYWORDS.some((k) => name.includes(k))
    );
  }
  const easyPaces = runs.filter((r) => !r._flaggedWorkout && r.paceSecPerUnit).map((r) => r.paceSecPerUnit);
  const baseline = median(easyPaces);

  const byWeek = {};
  for (const r of runs) {
    const wk = isoWeekKey(r.date);
    (byWeek[wk] = byWeek[wk] || []).push(r);
  }
  const longThresholdM = (CONFIG.units === 'km' ? 16 : 10) * UNIT_METERS;
  for (const wk of Object.keys(byWeek)) {
    const longest = byWeek[wk].reduce((a, b) => (b.distanceM > a.distanceM ? b : a));
    if (longest.distanceM >= longThresholdM) longest._longRun = true;
  }

  for (const r of runs) {
    if (r._longRun && !r._flaggedWorkout) r.type = 'Long run';
    else if (r._flaggedWorkout) r.type = 'Workout';
    else if (baseline && r.paceSecPerUnit && r.paceSecPerUnit < baseline * 0.90) r.type = 'Workout';
    else r.type = 'Easy';
  }
  return baseline;
}

function pacePanel(runs, weeks) {
  const byWeek = {};
  for (const r of runs) {
    if (!r.paceSecPerUnit) continue;
    const wk = isoWeekKey(r.date);
    byWeek[wk] = byWeek[wk] || { Easy: [], Workout: [] };
    const bucket = r.type === 'Workout' ? 'Workout' : 'Easy';
    byWeek[wk][bucket].push(r.paceSecPerUnit);
  }
  const keys = Object.keys(byWeek).sort().slice(-weeks);
  const easy = keys.map((k) => (byWeek[k].Easy.length ? Math.round(median(byWeek[k].Easy) * 10) / 10 : null));
  const workout = keys.map((k) => (byWeek[k].Workout.length ? Math.round(median(byWeek[k].Workout) * 10) / 10 : null));
  return { labels: keys, easy, workout };
}

function fmtPace(seconds) {
  if (!seconds) return '—';
  let m = Math.floor(seconds / 60);
  let s = Math.round(seconds % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' });
}

// =============================================================================
// Render
// =============================================================================
function renderHtml(ctx) {
  let html = HTML_TEMPLATE;
  for (const [token, value] of Object.entries(ctx)) {
    html = html.split(token).join(value);
  }
  fs.writeFileSync(OUTPUT_FILE, html);
}

async function buildContext(client) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const raceDate = new Date(CONFIG.raceDate + 'T00:00:00');
  const daysLeft = Math.round((raceDate - today) / 86400000);
  const weeksLeft = Math.floor(daysLeft / 7);

  const loadStart = addDays(today, -7 * (WEEKS_TRAINING_LOAD + WEEKS_CTL_SEED));
  const displayStart = addDays(today, -7 * WEEKS_TRAINING_LOAD);
  const recoveryStart = addDays(today, -7 * WEEKS_RECOVERY);
  const recentStart = addDays(today, -7 * WEEKS_RECENT_RUNS);

  const profile = await safe('user profile', () => client.getUserProfile());
  const displayName = (profile && (profile.displayName || profile.userName)) || '';

  const runs = await fetchActivities(client, loadStart, today);
  const recoveryDays = await fetchRecovery(client, displayName, recoveryStart, today);
  const vo2Points = await fetchVo2max(client, displayStart, today);

  const { maxHr, restHr } = estimateHrBounds(runs, recoveryDays);
  const loads = dailyLoadSeries(runs, loadStart, today, maxHr, restHr);
  const { ctl, atl, tsb } = computeCtlAtlTsb(loads);

  const seedDays = Math.round((displayStart - loadStart) / 86400000);
  const ctlD = ctl.slice(seedDays).map((v) => Math.round(v * 10) / 10);
  const atlD = atl.slice(seedDays).map((v) => Math.round(v * 10) / 10);
  const tsbD = tsb.slice(seedDays).map((v) => Math.round(v * 10) / 10);
  const loadLabels = [];
  for (let d = new Date(displayStart); d <= today; d = addDays(d, 1)) loadLabels.push(toDateStr(d));

  const { labels: mileageLabels, values: mileageValues } = weeklyMileage(runs, WEEKS_TRAINING_LOAD);
  const mileageTrend = linearTrend(mileageValues);

  const easyPaceBaseline = classifyRuns(runs);
  const { labels: paceLabels, easy: paceEasy, workout: paceWorkout } = pacePanel(runs, WEEKS_TRAINING_LOAD);

  const recentRuns = runs.filter((r) => r.date >= recentStart).sort((a, b) => b.date - a.date);

  const recoveryLabels = recoveryDays.map((d) => toDateStr(d.date));
  const hrvValues = recoveryDays.map((d) => d.hrv);
  const rhrValues = recoveryDays.map((d) => d.restingHr);
  const sleepHours = recoveryDays.map((d) => d.sleepHours);
  const sleepScores = recoveryDays.map((d) => d.sleepScore);

  const vo2Labels = vo2Points.map((p) => toDateStr(p.date));
  const vo2Values = vo2Points.map((p) => p.vo2max);

  let runsRows = '';
  for (const r of recentRuns) {
    const dist = r.distanceM / UNIT_METERS;
    const typeClass = r.type.split(' ')[0].toLowerCase();
    runsRows +=
      `<tr><td>${fmtDate(r.date)}</td><td>${dist.toFixed(2)} ${CONFIG.units}</td>` +
      `<td>${fmtPace(r.paceSecPerUnit)}/${PACE_UNIT}</td><td>${r.avgHr || '—'}</td>` +
      `<td><span class="tag tag-${typeClass}">${r.type}</span></td></tr>\n`;
  }
  if (!runsRows) runsRows = '<tr><td colspan="5" class="empty">No runs found in this window.</td></tr>';

  const pbsHtml = Object.entries(CONFIG.personalBests)
    .map(([k, v]) => `<div class="pb"><span class="pb-dist">${k}</span><span class="pb-time">${v}</span></div>`)
    .join('');

  const currentCtl = ctlD.length ? ctlD[ctlD.length - 1] : 0;
  const currentAtl = atlD.length ? atlD[atlD.length - 1] : 0;
  const currentTsb = tsbD.length ? tsbD[tsbD.length - 1] : 0;

  let diagnosticsHtml = '';
  if (DIAGNOSTICS.missing.size) {
    const items = [...DIAGNOSTICS.missing].sort().map((m) => `<li>${m}</li>`).join('');
    diagnosticsHtml =
      `<details class="diagnostics"><summary>Fields unavailable this run (${DIAGNOSTICS.missing.size})</summary><ul>${items}</ul></details>`;
  }

  const raceDateDisplay = raceDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    __RACE_NAME__: CONFIG.raceName,
    __RACE_DATE_DISPLAY__: raceDateDisplay,
    __DAYS_LEFT__: String(Math.max(daysLeft, 0)),
    __WEEKS_LEFT__: String(Math.max(weeksLeft, 0)),
    __HEIGHT_WEIGHT__: `${CONFIG.heightCm} cm &middot; ${CONFIG.weightKg} kg`,
    __PBS_HTML__: pbsHtml,
    __CURRENT_CTL__: currentCtl.toFixed(0),
    __CURRENT_ATL__: currentAtl.toFixed(0),
    __CURRENT_TSB__: (currentTsb >= 0 ? '+' : '') + currentTsb.toFixed(0),
    __LOAD_LABELS__: JSON.stringify(loadLabels),
    __CTL_DATA__: JSON.stringify(ctlD),
    __ATL_DATA__: JSON.stringify(atlD),
    __TSB_DATA__: JSON.stringify(tsbD),
    __MILEAGE_LABELS__: JSON.stringify(mileageLabels),
    __MILEAGE_DATA__: JSON.stringify(mileageValues),
    __MILEAGE_TREND__: JSON.stringify(mileageTrend),
    __UNIT_LABEL__: CONFIG.units,
    __RECOVERY_LABELS__: JSON.stringify(recoveryLabels),
    __HRV_DATA__: JSON.stringify(hrvValues),
    __RHR_DATA__: JSON.stringify(rhrValues),
    __SLEEP_HOURS_DATA__: JSON.stringify(sleepHours),
    __SLEEP_SCORE_DATA__: JSON.stringify(sleepScores),
    __VO2_LABELS__: JSON.stringify(vo2Labels),
    __VO2_DATA__: JSON.stringify(vo2Values),
    __PACE_LABELS__: JSON.stringify(paceLabels),
    __PACE_EASY__: JSON.stringify(paceEasy),
    __PACE_WORKOUT__: JSON.stringify(paceWorkout),
    __PACE_UNIT__: PACE_UNIT,
    __EASY_BASELINE__: easyPaceBaseline ? fmtPace(easyPaceBaseline) : '—',
    __RUNS_ROWS__: runsRows,
    __DIAGNOSTICS_HTML__: diagnosticsHtml,
    __GENERATED_AT__: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

async function main() {
  console.log('Connecting to Garmin using cached tokens...');
  const client = await getClient();
  console.log('Connected. Pulling data (this can take a minute for daily recovery metrics)...');

  const ctx = await buildContext(client);
  renderHtml(ctx);

  console.log(`\nWrote ${OUTPUT_FILE}`);
  console.log(`Fields returned OK: ${DIAGNOSTICS.ok.size}`);
  if (DIAGNOSTICS.missing.size) {
    console.log(`Fields unavailable/empty: ${DIAGNOSTICS.missing.size} (see the page footer for the list)`);
  }
  console.log('Open index.html in your browser. Re-run this script any time to refresh.');
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});

// =============================================================================
// HTML template — dark, data-dense "performance lab" layout.
// Tokens (__LIKE_THIS__) are replaced in renderHtml().
// =============================================================================
const HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__RACE_NAME__ — Training Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
<style>
  :root{
    --bg:#12151B; --surface:#1A1E26; --surface-2:#20242D; --border:#2A2F3A;
    --text:#EDEFF3; --text-dim:#8A90A0;
    --easy:#4FD1C5; --hard:#E94F64; --gold:#E8B84B; --line:#6E86FF;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; background:var(--bg); color:var(--text);
    font-family:'Inter',system-ui,sans-serif; line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  h1,h2,h3,.num{font-family:'Space Grotesk',system-ui,sans-serif;}
  .wrap{max-width:1180px; margin:0 auto; padding:32px 24px 80px;}

  header.hero{
    display:flex; flex-wrap:wrap; gap:28px; align-items:flex-end; justify-content:space-between;
    padding-bottom:28px; border-bottom:1px solid var(--border); margin-bottom:32px;
  }
  .hero-left h1{font-size:26px; font-weight:600; margin:0 0 6px;}
  .hero-left .race-date{color:var(--text-dim); font-size:14px;}
  .countdown{text-align:right;}
  .countdown .num{font-size:56px; font-weight:700; line-height:1; color:var(--gold);}
  .countdown .label{color:var(--text-dim); font-size:13px; margin-top:4px;}
  .countdown .sub{font-size:14px; color:var(--text-dim); margin-top:2px;}

  .context-row{display:flex; flex-wrap:wrap; gap:28px; margin-bottom:36px; color:var(--text-dim); font-size:14px;}
  .pbs{display:flex; flex-wrap:wrap; gap:18px;}
  .pb{display:flex; flex-direction:column; gap:2px;}
  .pb-dist{font-size:12px; color:var(--text-dim);}
  .pb-time{font-family:'Space Grotesk',sans-serif; font-weight:600; color:var(--text); font-size:15px;}

  section{margin-bottom:36px;}
  .section-head{display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;}
  .section-head h2{font-size:16px; font-weight:600; margin:0;}
  .section-head .note{font-size:13px; color:var(--text-dim);}

  .card{
    background:var(--surface); border:1px solid var(--border); border-radius:6px;
    padding:20px;
  }
  .grid-3{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
  .grid-2{display:grid; grid-template-columns:1.3fr 1fr; gap:16px;}
  @media(max-width:820px){ .grid-3{grid-template-columns:1fr;} .grid-2{grid-template-columns:1fr;} }

  .status-strip{display:flex; gap:28px; margin-bottom:16px; flex-wrap:wrap;}
  .status-item .v{font-family:'Space Grotesk',sans-serif; font-size:28px; font-weight:600;}
  .status-item .k{font-size:12px; color:var(--text-dim); margin-top:2px;}
  .v.ctl{color:var(--line);} .v.atl{color:var(--hard);} .v.tsb{color:var(--gold);}

  canvas{max-width:100%;}

  table{width:100%; border-collapse:collapse; font-size:14px;}
  th{text-align:left; font-weight:500; color:var(--text-dim); font-size:12px; padding:8px 10px; border-bottom:1px solid var(--border);}
  td{padding:9px 10px; border-bottom:1px solid var(--border);}
  tr:last-child td{border-bottom:none;}
  td.empty{color:var(--text-dim); text-align:center; padding:24px;}

  .tag{display:inline-block; padding:2px 9px; border-radius:4px; font-size:12px; font-weight:500;}
  .tag-easy{background:rgba(79,209,197,0.15); color:var(--easy);}
  .tag-workout{background:rgba(233,79,100,0.15); color:var(--hard);}
  .tag-long{background:rgba(232,184,75,0.15); color:var(--gold);}

  .diagnostics{margin-top:36px; font-size:13px; color:var(--text-dim);}
  .diagnostics summary{cursor:pointer;}
  .diagnostics ul{columns:2; margin:10px 0 0;}
  footer{color:var(--text-dim); font-size:12px; margin-top:40px; border-top:1px solid var(--border); padding-top:16px;}
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <div class="hero-left">
      <h1>__RACE_NAME__</h1>
      <div class="race-date">Race day: __RACE_DATE_DISPLAY__</div>
    </div>
    <div class="countdown">
      <div class="num">__DAYS_LEFT__</div>
      <div class="label">days to go</div>
      <div class="sub">__WEEKS_LEFT__ weeks remaining</div>
    </div>
  </header>

  <div class="context-row">
    <div>__HEIGHT_WEIGHT__</div>
    <div class="pbs">__PBS_HTML__</div>
  </div>

  <section>
    <div class="section-head">
      <h2>Training load — fitness, fatigue, form</h2>
      <span class="note">last 12 weeks</span>
    </div>
    <div class="card">
      <div class="status-strip">
        <div class="status-item"><div class="v ctl">__CURRENT_CTL__</div><div class="k">CTL &middot; fitness</div></div>
        <div class="status-item"><div class="v atl">__CURRENT_ATL__</div><div class="k">ATL &middot; fatigue</div></div>
        <div class="status-item"><div class="v tsb">__CURRENT_TSB__</div><div class="k">TSB &middot; form</div></div>
      </div>
      <canvas id="loadChart" height="90"></canvas>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Weekly mileage</h2>
      <span class="note">__UNIT_LABEL__ per week, with trend</span>
    </div>
    <div class="card"><canvas id="mileageChart" height="70"></canvas></div>
  </section>

  <section>
    <div class="section-head"><h2>Recovery</h2><span class="note">last few weeks</span></div>
    <div class="grid-3">
      <div class="card"><h3 style="font-size:13px;color:var(--text-dim);margin:0 0 10px;">HRV (ms)</h3><canvas id="hrvChart" height="140"></canvas></div>
      <div class="card"><h3 style="font-size:13px;color:var(--text-dim);margin:0 0 10px;">Resting heart rate</h3><canvas id="rhrChart" height="140"></canvas></div>
      <div class="card"><h3 style="font-size:13px;color:var(--text-dim);margin:0 0 10px;">Sleep</h3><canvas id="sleepChart" height="140"></canvas></div>
    </div>
  </section>

  <section>
    <div class="grid-2">
      <div>
        <div class="section-head"><h2>Pace: easy vs. workout</h2><span class="note">median per week, min/__PACE_UNIT__</span></div>
        <div class="card">
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">Baseline easy pace: __EASY_BASELINE__ /__PACE_UNIT__</div>
          <canvas id="paceChart" height="130"></canvas>
        </div>
      </div>
      <div>
        <div class="section-head"><h2>VO2 max</h2><span class="note">trend</span></div>
        <div class="card"><canvas id="vo2Chart" height="130"></canvas></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><h2>Recent runs</h2><span class="note">last few weeks</span></div>
    <div class="card">
      <table>
        <thead><tr><th>Date</th><th>Distance</th><th>Pace</th><th>Avg HR</th><th>Type</th></tr></thead>
        <tbody>
__RUNS_ROWS__
        </tbody>
      </table>
    </div>
  </section>

  __DIAGNOSTICS_HTML__

  <footer>Generated __GENERATED_AT__ from your Garmin Connect data. Re-run dashboard.js to refresh.</footer>
</div>

<script>
Chart.defaults.color = '#8A90A0';
Chart.defaults.borderColor = '#2A2F3A';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

function grid(){ return { grid:{ color:'#2A2F3A' } }; }

new Chart(document.getElementById('loadChart'), {
  type:'line',
  data:{
    labels: __LOAD_LABELS__,
    datasets:[
      {label:'CTL (fitness)', data: __CTL_DATA__, borderColor:'#6E86FF', backgroundColor:'transparent', tension:0.25, pointRadius:0, borderWidth:2},
      {label:'ATL (fatigue)', data: __ATL_DATA__, borderColor:'#E94F64', backgroundColor:'transparent', tension:0.25, pointRadius:0, borderWidth:2},
      {label:'TSB (form)', data: __TSB_DATA__, borderColor:'#E8B84B', backgroundColor:'transparent', tension:0.25, pointRadius:0, borderWidth:2, yAxisID:'y1'},
    ]
  },
  options:{
    interaction:{mode:'index', intersect:false},
    scales:{
      x:{ticks:{maxTicksLimit:10}, grid:{display:false}},
      y:{title:{display:true,text:'load'}, ...grid()},
      y1:{position:'right', grid:{display:false}, title:{display:true,text:'form'}},
    },
    plugins:{legend:{position:'top', align:'start', labels:{boxWidth:10}}}
  }
});

new Chart(document.getElementById('mileageChart'), {
  data:{
    labels: __MILEAGE_LABELS__,
    datasets:[
      {type:'bar', label:'__UNIT_LABEL__', data: __MILEAGE_DATA__, backgroundColor:'#4FD1C5', borderRadius:3},
      {type:'line', label:'trend', data: __MILEAGE_TREND__, borderColor:'#E8B84B', borderWidth:2, pointRadius:0, tension:0},
    ]
  },
  options:{
    scales:{ x:{grid:{display:false}}, y:{...grid(), title:{display:true,text:'__UNIT_LABEL__'}} },
    plugins:{legend:{position:'top', align:'start', labels:{boxWidth:10}}}
  }
});

function smallLine(id, labels, data, color){
  new Chart(document.getElementById(id), {
    type:'line',
    data:{labels: labels, datasets:[{data: data, borderColor: color, backgroundColor:'transparent', tension:0.3, pointRadius:0, borderWidth:2, spanGaps:true}]},
    options:{
      plugins:{legend:{display:false}},
      scales:{ x:{ticks:{maxTicksLimit:6}, grid:{display:false}}, y:{...grid()} }
    }
  });
}
smallLine('hrvChart', __RECOVERY_LABELS__, __HRV_DATA__, '#4FD1C5');
smallLine('rhrChart', __RECOVERY_LABELS__, __RHR_DATA__, '#E94F64');

new Chart(document.getElementById('sleepChart'), {
  data:{
    labels: __RECOVERY_LABELS__,
    datasets:[
      {type:'bar', label:'hours', data: __SLEEP_HOURS_DATA__, backgroundColor:'#6E86FF', borderRadius:2},
      {type:'line', label:'score', data: __SLEEP_SCORE_DATA__, borderColor:'#E8B84B', pointRadius:0, borderWidth:2, yAxisID:'y1', spanGaps:true},
    ]
  },
  options:{
    plugins:{legend:{display:false}},
    scales:{
      x:{ticks:{maxTicksLimit:6}, grid:{display:false}},
      y:{...grid(), title:{display:true,text:'hrs'}},
      y1:{position:'right', grid:{display:false}, min:0, max:100, title:{display:true,text:'score'}},
    }
  }
});

new Chart(document.getElementById('paceChart'), {
  type:'line',
  data:{
    labels: __PACE_LABELS__,
    datasets:[
      {label:'Easy', data: __PACE_EASY__, borderColor:'#4FD1C5', backgroundColor:'transparent', tension:0.25, pointRadius:3, borderWidth:2, spanGaps:true},
      {label:'Workout', data: __PACE_WORKOUT__, borderColor:'#E94F64', backgroundColor:'transparent', tension:0.25, pointRadius:3, borderWidth:2, spanGaps:true},
    ]
  },
  options:{
    scales:{
      x:{ticks:{maxTicksLimit:8}, grid:{display:false}},
      y:{reverse:true, ...grid(), title:{display:true,text:'sec/__PACE_UNIT__ (lower = faster, axis flipped)'}},
    },
    plugins:{legend:{position:'top', align:'start', labels:{boxWidth:10}}}
  }
});

new Chart(document.getElementById('vo2Chart'), {
  type:'line',
  data:{labels: __VO2_LABELS__, datasets:[{label:'VO2max', data: __VO2_DATA__, borderColor:'#E8B84B', backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2, spanGaps:true}]},
  options:{
    plugins:{legend:{display:false}},
    scales:{ x:{ticks:{maxTicksLimit:8}, grid:{display:false}}, y:{...grid()} }
  }
});
</script>
</body>
</html>
`;
