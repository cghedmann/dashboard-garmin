#!/usr/bin/env node
/**
 * Training Dashboard — pulls your Garmin Connect data and shows it as a
 * self-contained dashboard website. Everything is done from the browser:
 *
 *   1. Deploy to Hostinger (hPanel → Add Website → Node.js web app). No
 *      environment variables are required.
 *   2. Open the site. The first visit shows /setup: enter the SETUP CODE from
 *      hPanel → your app → Runtime Logs, create your dashboard login and add
 *      your race.
 *   3. Sign in to Garmin on the /login page (password used once, never stored).
 *   4. Change race, PBs, units, refresh interval or password on /settings.
 *
 * The page refreshes from Garmin every few minutes (default 10). Past days are
 * cached in ~/.garmin-dashboard, so a refresh only re-downloads the last couple
 * of days, and redeploys keep your settings, Garmin sign-in and data.
 *
 * Optional extras: env vars (RACE_NAME, DASHBOARD_PASSWORD, GARMIN_OAUTH1_TOKEN,
 * ...) still work, and `node dashboard.js --build | --login | --print-token-env`
 * are available if you ever run it on a computer. None are needed on Hostinger.
 *
 * HRV, resting HR, sleep and VO2max come from undocumented Garmin Connect
 * endpoints; every call is wrapped and failures are listed in the page footer.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');

let GarminConnect;
try {
  ({ GarminConnect } = require('garmin-connect'));
} catch (e) {
  console.error('Missing dependency. Install it with:\n    npm install');
  process.exit(1);
}

// =============================================================================
// CONFIG — defaults. Normally you change these on the site's Settings page
// (saved to settings.json). Env vars also work and act as the starting values.
// =============================================================================
const env = process.env;
const CONFIG = {
  raceName: env.RACE_NAME || 'REPLACE_ME Marathon',
  raceDate: env.RACE_DATE || '2026-12-31', // YYYY-MM-DD
  heightCm: Number(env.HEIGHT_CM) || 178,
  weightKg: Number(env.WEIGHT_KG) || 70,
  personalBests: {
    '5K': env.PB_5K || 'REPLACE_ME',
    '10K': env.PB_10K || 'REPLACE_ME',
    'Half Marathon': env.PB_HALF || 'REPLACE_ME',
    Marathon: env.PB_MARATHON || 'REPLACE_ME',
  },
  units: env.UNITS === 'km' ? 'km' : 'mi', // 'mi' or 'km'
  refreshMinutes: Number(env.REFRESH_MINUTES) || 10,
  timezone: env.TZ || '', // e.g. America/Jamaica; the server's clock is UTC otherwise
};

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

const WEEKS_TRAINING_LOAD = 12; // CTL/ATL/TSB + weekly mileage window
const WEEKS_CTL_SEED = 6;       // extra history pulled (not displayed) so CTL isn't ramping from 0
const WEEKS_RECOVERY = 6;       // HRV / resting HR / sleep window
const WEEKS_RECENT_RUNS = 4;    // recent runs table + pace panel window

const PORT = Number(env.PORT) || 3000;
const MIN_MANUAL_REFRESH_SECONDS = 30;
// Optional: if set, these override the password created on the /setup page.
const ENV_DASHBOARD_USER = env.DASHBOARD_USER || 'runner';
const ENV_DASHBOARD_PASSWORD = env.DASHBOARD_PASSWORD || '';
const GARMIN_DOMAIN = env.GARMIN_DOMAIN === 'garmin.cn' ? 'garmin.cn' : 'garmin.com';

const TOKEN_DIR_CANDIDATES = [
  env.GARMIN_TOKEN_DIR,
  path.join(__dirname, '.garminconnect'),
  path.join(os.homedir(), '.garminconnect'),
].filter(Boolean);
// Where --login and the /login page save tokens. The home folder survives
// Hostinger redeploys (the app folder is replaced on every build).
const TOKEN_SAVE_DIR = env.GARMIN_TOKEN_DIR || path.join(os.homedir(), '.garminconnect');
const OUTPUT_FILE = path.join(__dirname, 'index.html');
// Settings and downloaded data live in the home folder, outside the app
// folder, so Hostinger redeploys keep them.
const DATA_DIR = env.DATA_DIR || path.join(os.homedir(), '.garmin-dashboard');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CACHE_FILE = env.CACHE_FILE || path.join(DATA_DIR, 'cache.json');

const RUNNING_TYPES = new Set([
  'running', 'track_running', 'trail_running', 'treadmill_running',
  'indoor_running', 'virtual_run', 'street_running',
]);
const WORKOUT_TE_LABELS = new Set(['TEMPO', 'THRESHOLD', 'ANAEROBIC_CAPACITY', 'SPEED', 'VO2MAX', 'SPRINT']);
const WORKOUT_KEYWORDS = ['interval', 'tempo', 'track', 'fartlek', 'threshold', 'repeat', 'race', 'vo2'];

let UNIT_METERS = 1609.344;
let PACE_UNIT = 'mi';
function applyDerived() {
  UNIT_METERS = CONFIG.units === 'mi' ? 1609.344 : 1000.0;
  PACE_UNIT = CONFIG.units === 'mi' ? 'mi' : 'km';
}
applyDerived();

// =============================================================================
// Settings file — race/profile settings and the dashboard login, edited from
// the website so nothing has to be changed in code or on another computer.
// =============================================================================
let SETTINGS = {};
const ORIGINAL_TZ = env.TZ || '';

function loadSettings() {
  try {
    SETTINGS = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
  } catch (_) {
    SETTINGS = {};
  }
  if (SETTINGS.config) {
    const c = SETTINGS.config;
    for (const k of ['raceName', 'raceDate', 'heightCm', 'weightKg', 'units', 'refreshMinutes', 'timezone']) {
      if (c[k] != null && c[k] !== '') CONFIG[k] = c[k];
    }
    if (c.personalBests) CONFIG.personalBests = { ...CONFIG.personalBests, ...c.personalBests };
  }
  // Node picks up a TZ change at runtime, so "today" follows your timezone.
  if (CONFIG.timezone && validTimezone(CONFIG.timezone)) process.env.TZ = CONFIG.timezone;
  else if (ORIGINAL_TZ) process.env.TZ = ORIGINAL_TZ;
  else delete process.env.TZ;
  applyDerived();
}

function saveSettings() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(SETTINGS, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, SETTINGS_FILE);
}

loadSettings();

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =============================================================================
// Diagnostics — tracks which fields actually came back. Reset on every build
// so a long-running server doesn't accumulate stale entries.
// =============================================================================
let SERVER_MODE = false;
let DIAGNOSTICS = { ok: new Set(), missing: new Set() };
function resetDiagnostics() {
  DIAGNOSTICS = { ok: new Set(), missing: new Set() };
}

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
// Garmin connection — reuses cached tokens only, never prompts for creds.
// Errors are thrown (not process.exit) so the web server stays up and can show
// the problem on the page instead of crash-looping.
// =============================================================================
class SetupError extends Error {}

function parseTokenEnv(name) {
  const rawVal = (env[name] || '').trim();
  if (!rawVal) return null;
  const text = rawVal.startsWith('{') ? rawVal : Buffer.from(rawVal, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new SetupError(`${name} is set but isn't valid JSON (or base64-encoded JSON).`);
  }
}

function findTokenDir() {
  for (const dir of TOKEN_DIR_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'oauth1_token.json')) && fs.existsSync(path.join(dir, 'oauth2_token.json'))) {
      return dir;
    }
  }
  const newFormat = TOKEN_DIR_CANDIDATES.find((d) => fs.existsSync(path.join(d, 'garmin_tokens.json')));
  if (newFormat) {
    throw new SetupError(
      `${newFormat} contains garmin_tokens.json (a newer bearer-token format used by some forks of ` +
      'the Python garminconnect library). The garmin-connect npm package needs the ' +
      'oauth1_token.json/oauth2_token.json pair instead. Do a one-time login with the npm package ' +
      'and save its tokens with exportTokenToFile(), then point GARMIN_TOKEN_DIR at that folder.'
    );
  }
  return null;
}

// Returns { oauth1, oauth2, source, dir|null }
// Token files are checked before env vars so a fresh login (which writes files)
// takes over from older tokens pasted into the environment.
function loadTokens() {
  const dir = findTokenDir();
  if (dir) {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { oauth1: read('oauth1_token.json'), oauth2: read('oauth2_token.json'), source: dir, dir };
  }
  const oauth1 = parseTokenEnv('GARMIN_OAUTH1_TOKEN');
  const oauth2 = parseTokenEnv('GARMIN_OAUTH2_TOKEN');
  if (oauth1 && oauth2) return { oauth1, oauth2, source: 'environment variables', dir: null };
  if (oauth1 || oauth2) {
    throw new SetupError('Set BOTH GARMIN_OAUTH1_TOKEN and GARMIN_OAUTH2_TOKEN (only one was found).');
  }
  throw new SetupError(
    "Garmin isn't connected yet. Use the button below to sign in to Garmin."
  );
}

// =============================================================================
// Garmin login — exchanges email + password for OAuth tokens and saves them.
// The password is used once and never stored or logged.
// Note: the garmin-connect package can't complete two-step verification (MFA).
// =============================================================================
function saveTokens(dir, tokens) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const write = (f, data) =>
    fs.writeFileSync(path.join(dir, f), JSON.stringify(data, null, 2), { mode: 0o600 });
  write('oauth1_token.json', tokens.oauth1);
  write('oauth2_token.json', tokens.oauth2);
}

async function loginToGarmin(email, password) {
  if (!email || !password) throw new SetupError('Enter your Garmin email and password.');
  const client = new GarminConnect({ username: email, password }, GARMIN_DOMAIN);
  try {
    await client.login();
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/ticket not found|mfa/i.test(msg)) {
      throw new SetupError(
        'Garmin rejected the login. Check your email and password. If your account uses two-step ' +
        'verification, this login can\'t complete it; turn it off, log in, then turn it back on.'
      );
    }
    if (/429|too many/i.test(msg)) {
      throw new SetupError('Garmin is limiting sign-ins right now. Wait about an hour, then try again.');
    }
    if (/403|cloudflare/i.test(msg)) {
      throw new SetupError('Garmin blocked this sign-in. This sometimes happens with requests from hosting servers and usually clears within a few hours; try again later.');
    }
    throw new SetupError(`Garmin login failed: ${msg.slice(0, 200)}`);
  }
  const tokens = client.exportToken();
  saveTokens(TOKEN_SAVE_DIR, tokens);
  // A different Garmin account means the cached data isn't yours any more.
  try {
    const profile = await client.getUserProfile();
    const name = profile && (profile.displayName || profile.userName);
    const cache = loadCache();
    if (name && cache.displayName && cache.displayName !== name) clearCache();
  } catch (_) { /* checked again on the next build */ }
  cachedClient = client; // use the new session straight away
  console.log(`Garmin login OK. Tokens saved to ${TOKEN_SAVE_DIR}.`);
  return tokens;
}

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const tokens = loadTokens();
  // The constructor only requires a truthy credentials object; no password is used.
  const client = new GarminConnect({ username: '', password: '' }, GARMIN_DOMAIN);
  client.loadToken(tokens.oauth1, tokens.oauth2);
  try {
    // Confirm the token works (this also refreshes an expired OAuth2 token via OAuth1).
    await client.getUserProfile();
  } catch (e) {
    throw new SetupError(
      `Could not resume the cached Garmin session (${e.name || 'Error'}: ${e.message}). ` +
      'The Garmin sign-in has probably expired. Use the button below to sign in again.'
    );
  }
  // Persist a refreshed OAuth2 token back to disk when the tokens came from a folder.
  if (tokens.dir) {
    try { client.exportTokenToFile(tokens.dir); } catch (_) { /* read-only disk is fine */ }
  }
  console.log(`Garmin session ready (tokens from ${tokens.source}).`);
  cachedClient = client;
  return client;
}

// Raw GET against the Garmin Connect API. garmin-connect's get() passes the
// URL straight to axios with no base URL, so paths must be made absolute.
async function raw(client, urlPath) {
  const base = (client.url && client.url.GC_API) || `https://connectapi.${GARMIN_DOMAIN}`;
  const url = urlPath.startsWith('http') ? urlPath : base + urlPath;
  if (typeof client.get === 'function') return client.get(url);
  if (client.client && typeof client.client.get === 'function') return client.client.get(url);
  throw new Error('no raw GET method found on GarminConnect client');
}

// =============================================================================
// Dates
// =============================================================================
// Local calendar date (not UTC), so keys and API dates match your timezone.
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// =============================================================================
// Incremental cache — past days are kept (in memory and on disk), so a refresh
// only re-downloads the last couple of days instead of ~130 requests.
// =============================================================================
const CACHE_VERSION = 1;
const RECHECK_DAYS = 2;              // today + yesterday are always re-fetched
const LATE_SYNC_DAYS = 7;            // incomplete days this recent are retried...
const LATE_SYNC_RETRY_HOURS = 6;     // ...at most this often
const FULL_ACTIVITY_SYNC_HOURS = 24; // re-read the whole activity window daily (catches edits/deletes)

let CACHE = null;
const CACHE_STATS = { recoveryFromCache: 0, recoveryFetched: 0, vo2FromCache: 0, vo2Fetched: 0, activityMode: '' };

function emptyCache() {
  return { version: CACHE_VERSION, units: CONFIG.units, displayName: '', runs: {}, runsCoveredFrom: null,
    lastFullActivitySync: 0, recovery: {}, vo2: {} };
}

function loadCache() {
  if (CACHE) return CACHE;
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (data.version === CACHE_VERSION && data.units === CONFIG.units) {
      CACHE = data;
      console.log(`Loaded cache from ${CACHE_FILE}.`);
      return CACHE;
    }
  } catch (_) { /* no cache yet */ }
  CACHE = emptyCache();
  return CACHE;
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true, mode: 0o700 });
    const tmp = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(CACHE), { mode: 0o600 });
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.warn(`Could not save cache (${e.message}); it stays in memory only.`);
  }
}

// Drop the cache (e.g. after signing in as a different Garmin user).
function clearCache() {
  CACHE = emptyCache();
  try { fs.unlinkSync(CACHE_FILE); } catch (_) { /* nothing to delete */ }
}

function pruneCache(cache, oldestNeeded) {
  const cutoff = toDateStr(oldestNeeded);
  for (const [k, r] of Object.entries(cache.runs)) if (r.day < cutoff) delete cache.runs[k];
  for (const k of Object.keys(cache.recovery)) if (k < cutoff) delete cache.recovery[k];
  for (const k of Object.keys(cache.vo2)) if (k < cutoff) delete cache.vo2[k];
}

// =============================================================================
// Fetch
// =============================================================================
function parseRun(a) {
  const typeKey = ((a.activityType || {}).typeKey || '').toLowerCase();
  const startLocal = a.startTimeLocal;
  if (!startLocal) return null;
  const dt = new Date(startLocal.replace(' ', 'T'));
  if (isNaN(dt)) return { dt: null };
  if (!RUNNING_TYPES.has(typeKey)) return { dt, run: null };
  const avgSpeed = a.averageSpeed || 0;
  return {
    dt,
    run: {
      id: String(a.activityId != null ? a.activityId : `${startLocal}|${a.activityName || ''}`),
      startLocal,
      day: toDateStr(dt),
      name: a.activityName || 'Run',
      distanceM: a.distance || 0,
      durationS: a.duration || 0,
      avgHr: a.averageHR || null,
      maxHr: a.maxHR || null,
      paceSecPerUnit: avgSpeed ? UNIT_METERS / avgSpeed : null,
      trainingLoad: a.activityTrainingLoad || null,
      aerobicTe: a.aerobicTrainingEffect || null,
      teLabel: (a.trainingEffectLabel || '').toUpperCase(),
      hasWorkout: a.workoutId != null,
    },
  };
}

// Reads activities newest-first until it passes `since`. Returns runs found,
// or null if a page failed (so we don't wrongly delete cached runs).
async function readActivitiesSince(client, since, pageSize) {
  const runs = [];
  let pageStart = 0;
  for (let page = 0; page < 15; page++) {
    const batch = await safe(`activities page ${page}`, () => client.getActivities(pageStart, pageSize));
    if (batch === null) return null; // a page failed: keep the cache as it is
    if (batch.length === 0) break;
    let oldest = null;
    for (const a of batch) {
      const parsed = parseRun(a);
      if (!parsed || !parsed.dt) continue;
      if (oldest === null || parsed.dt < oldest) oldest = parsed.dt;
      if (parsed.run && parsed.dt >= since) runs.push(parsed.run);
    }
    if (oldest !== null && oldest < since) break;
    if (batch.length < pageSize) break;
    pageStart += pageSize;
  }
  return runs;
}

async function fetchActivities(client, cache, start, today) {
  const now = Date.now();
  const coveredFrom = cache.runsCoveredFrom ? fromDateStr(cache.runsCoveredFrom) : null;
  const full = !coveredFrom || coveredFrom > start ||
    now - (cache.lastFullActivitySync || 0) > FULL_ACTIVITY_SYNC_HOURS * 3600 * 1000;

  // Incremental: re-read the last few days (small page); full: the whole window.
  const since = full ? start : addDays(today, -RECHECK_DAYS);
  const fresh = await readActivitiesSince(client, since, full ? 100 : 20);
  CACHE_STATS.activityMode = full ? 'full' : 'incremental';

  if (fresh) {
    // Replace everything in the re-read window so deleted/edited runs update.
    const sinceKey = toDateStr(since);
    for (const [k, r] of Object.entries(cache.runs)) if (r.day >= sinceKey) delete cache.runs[k];
    for (const r of fresh) cache.runs[r.id] = r;
    if (full) {
      cache.runsCoveredFrom = toDateStr(start);
      cache.lastFullActivitySync = now;
    }
  }

  const startKey = toDateStr(start);
  const todayKey = toDateStr(today);
  return Object.values(cache.runs)
    .filter((r) => r.day >= startKey && r.day <= todayKey)
    .map((r) => ({ ...r, date: fromDateStr(r.day) }))
    .sort((a, b) => a.date - b.date || a.startLocal.localeCompare(b.startLocal));
}

function recoveryNeedsFetch(entry, dateKey, today) {
  if (!entry) return true;
  const d = fromDateStr(dateKey);
  if (d >= addDays(today, -(RECHECK_DAYS - 1))) return true;
  const incomplete = entry.restingHr == null || entry.hrv == null || entry.sleepHours == null;
  const ageHours = (Date.now() - (entry.fetchedAt || 0)) / 3600000;
  return incomplete && d >= addDays(today, -LATE_SYNC_DAYS) && ageHours >= LATE_SYNC_RETRY_HOURS;
}

async function fetchRecoveryDay(client, displayName, cdate) {
  const stats = await safe(`daily stats ${cdate}`, () =>
    raw(client, `/usersummary-service/usersummary/daily/${displayName}?calendarDate=${cdate}`));
  const hrv = await safe(`hrv ${cdate}`, () => raw(client, `/hrv-service/hrv/${cdate}`));
  const sleep = await safe(`sleep ${cdate}`, () =>
    raw(client, `/wellness-service/wellness/dailySleepData/${displayName}?date=${cdate}&nonSleepBufferMinutes=60`));

  let hrvVal = null;
  if (hrv) {
    const summary = hrv.hrvSummary || {};
    hrvVal = summary.lastNightAvg || summary.weeklyAvg || null;
  }
  let sleepHours = null;
  let sleepScore = null;
  if (sleep) {
    const dto = sleep.dailySleepDTO || {};
    if (dto.sleepTimeSeconds) sleepHours = Math.round((dto.sleepTimeSeconds / 3600) * 100) / 100;
    sleepScore = ((sleep.sleepScores || {}).overall || {}).value || null;
  }
  return { restingHr: (stats && stats.restingHeartRate) || null, hrv: hrvVal, sleepHours, sleepScore };
}

async function fetchRecovery(client, cache, displayName, start, today) {
  const days = [];
  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const key = toDateStr(d);
    const old = cache.recovery[key];
    if (recoveryNeedsFetch(old, key, today)) {
      const fresh = await fetchRecoveryDay(client, displayName, key);
      // Keep previously good values if this attempt came back empty (e.g. a network blip).
      const merged = { fetchedAt: Date.now() };
      for (const f of ['restingHr', 'hrv', 'sleepHours', 'sleepScore']) {
        merged[f] = fresh[f] != null ? fresh[f] : (old ? old[f] : null);
      }
      cache.recovery[key] = merged;
      CACHE_STATS.recoveryFetched += 1;
    } else {
      CACHE_STATS.recoveryFromCache += 1;
    }
    const e = cache.recovery[key];
    days.push({ date: new Date(d), restingHr: e.restingHr, hrv: e.hrv, sleepHours: e.sleepHours, sleepScore: e.sleepScore });
  }
  return days;
}

// VO2max is sampled weekly on fixed Mondays (so samples stay cacheable), plus today.
async function fetchVo2max(client, cache, start, today) {
  const dates = [];
  const firstMonday = addDays(start, (8 - start.getDay()) % 7);
  for (let d = firstMonday; d < today; d = addDays(d, 7)) dates.push(new Date(d));
  dates.push(new Date(today));

  const todayKey = toDateStr(today);
  const points = [];
  for (const d of dates) {
    const key = toDateStr(d);
    if (!(key in cache.vo2) || key === todayKey || cache.vo2[key] == null) {
      const metrics = await safe(`max metrics ${key}`, () => raw(client, `/metrics-service/metrics/maxmet/day/${key}`));
      let val = null;
      if (metrics) {
        const entry = Array.isArray(metrics) ? metrics[0] : metrics;
        const generic = (entry || {}).generic || {};
        val = generic.vo2MaxPreciseValue || generic.vo2MaxValue || (entry || {}).vo2MaxValue || null;
      }
      cache.vo2[key] = val != null ? val : (cache.vo2[key] != null ? cache.vo2[key] : null);
      CACHE_STATS.vo2Fetched += 1;
    } else {
      CACHE_STATS.vo2FromCache += 1;
    }
    if (cache.vo2[key]) points.push({ date: d, vo2max: cache.vo2[key] });
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
// Build page context
// =============================================================================
async function buildContext(client) {
  resetDiagnostics();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const raceDate = new Date(CONFIG.raceDate + 'T00:00:00');
  if (isNaN(raceDate)) throw new SetupError(`The race date "${CONFIG.raceDate}" isn't valid. Fix it on the Settings page.`);
  const daysLeft = Math.round((raceDate - today) / 86400000);
  const weeksLeft = Math.floor(daysLeft / 7);

  const loadStart = addDays(today, -7 * (WEEKS_TRAINING_LOAD + WEEKS_CTL_SEED));
  const displayStart = addDays(today, -7 * WEEKS_TRAINING_LOAD);
  const recoveryStart = addDays(today, -7 * WEEKS_RECOVERY);
  const recentStart = addDays(today, -7 * WEEKS_RECENT_RUNS);

  const cache = loadCache();
  for (const k of Object.keys(CACHE_STATS)) CACHE_STATS[k] = typeof CACHE_STATS[k] === 'number' ? 0 : '';

  let displayName = cache.displayName;
  if (!displayName) {
    const profile = await safe('user profile', () => client.getUserProfile());
    displayName = (profile && (profile.displayName || profile.userName)) || '';
    cache.displayName = displayName;
  }

  const runs = await fetchActivities(client, cache, loadStart, today);
  const recoveryDays = await fetchRecovery(client, cache, displayName, recoveryStart, today);
  const vo2Points = await fetchVo2max(client, cache, displayStart, today);
  pruneCache(cache, loadStart);
  saveCache();

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
    .map(([k, v]) => `<div class="pb"><span class="pb-dist">${escapeHtml(k)}</span><span class="pb-time">${escapeHtml(v)}</span></div>`)
    .join('');

  const currentCtl = ctlD.length ? ctlD[ctlD.length - 1] : 0;
  const currentAtl = atlD.length ? atlD[atlD.length - 1] : 0;
  const currentTsb = tsbD.length ? tsbD[tsbD.length - 1] : 0;

  let diagnosticsHtml = '';
  if (DIAGNOSTICS.missing.size) {
    const items = [...DIAGNOSTICS.missing].sort().map((m) => `<li>${escapeHtml(m)}</li>`).join('');
    diagnosticsHtml =
      `<details class="diagnostics"><summary>Fields unavailable this run (${DIAGNOSTICS.missing.size})</summary><ul>${items}</ul></details>`;
  }

  const raceDateDisplay = raceDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    __RACE_NAME__: escapeHtml(CONFIG.raceName),
    __RACE_DATE_DISPLAY__: escapeHtml(raceDateDisplay),
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
    __GENERATED_AT__: escapeHtml(new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })),
    __BUILD_VERSION__: String(Date.now()),
    __FOOTER_LINKS__: SERVER_MODE
      ? ' &middot; <a href="/refresh" style="color:inherit">Refresh now</a> &middot; <a href="/settings" style="color:inherit">Settings</a>'
      : '',
  };
}

// =============================================================================
// Render / build
// =============================================================================
function renderHtml(ctx) {
  let html = HTML_TEMPLATE;
  for (const [token, value] of Object.entries(ctx)) {
    html = html.split(token).join(value);
  }
  return html;
}

async function buildDashboard() {
  const client = await getClient();
  try {
    const ctx = await buildContext(client);
    return renderHtml(ctx);
  } catch (e) {
    // If the session died mid-build, force a fresh token load next time.
    if (e && /401|403|unauthori[sz]ed/i.test(String(e.message))) cachedClient = null;
    throw e;
  }
}

// =============================================================================
// Pages
// =============================================================================
const PAGE_STYLE = `body{margin:0;background:#12151B;color:#EDEFF3;font-family:system-ui,sans-serif;line-height:1.55}
.wrap{max-width:640px;margin:8vh auto;padding:0 24px 60px}h1{font-size:22px;font-weight:600}
h2{font-size:16px;font-weight:600;margin:36px 0 4px;padding-top:20px;border-top:1px solid #2A2F3A}
p{color:#8A90A0;white-space:pre-wrap}a{color:#6E86FF}
label{display:block;margin:14px 0 6px;font-size:14px;color:#8A90A0}
input,select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #2A2F3A;background:#1A1E26;color:#EDEFF3;font-size:16px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
button,.btn{display:inline-block;margin-top:20px;padding:10px 18px;border:0;border-radius:8px;background:#6E86FF;color:#fff;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}
.btn-danger{background:#E94F64}.btn-quiet{background:#2A2F3A}
.err{color:#E94F64;background:#2a1a1f;border-radius:8px;padding:10px 12px}
.ok{color:#4FD1C5;background:#15282a;border-radius:8px;padding:10px 12px}
.note{font-size:13px}code{background:#1A1E26;padding:2px 6px;border-radius:4px}`;

function page(title, inner, autoRefreshSeconds = 0) {
  const refresh = autoRefreshSeconds ? `<meta http-equiv="refresh" content="${autoRefreshSeconds}">` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh}
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="wrap">${inner}</div></body></html>`;
}

function statusPage(title, message, autoRefreshSeconds, actionsHtml = '') {
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${actionsHtml}`, autoRefreshSeconds);
}

const msgHtml = (error, ok) =>
  (error ? `<p class="err">${escapeHtml(error)}</p>` : '') + (ok ? `<p class="ok">${escapeHtml(ok)}</p>` : '');

// Per-process token embedded in every form, so other sites can't submit them
// using your cached dashboard login (CSRF protection).
const FORM_TOKEN = crypto.randomBytes(24).toString('hex');
const csrfField = () => `<input type="hidden" name="csrf" value="${FORM_TOKEN}">`;
function csrfOk(form) {
  const t = form.get('csrf') || '';
  return t.length === FORM_TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(FORM_TOKEN));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) { reject(new Error('Request too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// =============================================================================
// Dashboard login (the password protecting this site)
// =============================================================================
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 32).toString('hex') };
}

function authMode() {
  if (ENV_DASHBOARD_PASSWORD) return 'env';
  if (SETTINGS.auth && SETTINGS.auth.hash) return 'settings';
  return 'setup';
}

function credentialsMatch(user, pass) {
  const mode = authMode();
  if (mode === 'env') {
    const a = crypto.createHash('sha256').update(`${user}:${pass}`).digest();
    const b = crypto.createHash('sha256').update(`${ENV_DASHBOARD_USER}:${ENV_DASHBOARD_PASSWORD}`).digest();
    return crypto.timingSafeEqual(a, b);
  }
  if (mode === 'settings') {
    const { user: u, salt, hash } = SETTINGS.auth;
    const got = Buffer.from(hashPassword(pass, salt).hash, 'hex');
    return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex')) && user === u;
  }
  return false;
}

// Remember the last accepted Authorization header so scrypt isn't re-run on every request.
let acceptedAuthHeader = null;

// Slow down password guessing: 10 failures per IP per 15 minutes.
const failures = new Map();
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}
function isLockedOut(req) {
  const f = failures.get(clientIp(req));
  return !!(f && f.count >= 10 && f.resetAt > Date.now());
}
function noteFailure(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || f.resetAt < now) failures.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else f.count += 1;
  if (failures.size > 5000) failures.clear();
}

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  if (acceptedAuthHeader && header === acceptedAuthHeader) return true;
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  const ok = credentialsMatch(user, rest.join(':'));
  if (ok) acceptedAuthHeader = header;
  else noteFailure(req);
  return ok;
}

// One-time code printed in the Runtime Logs, so only the site owner can do first-time setup.
const SETUP_CODE = String(crypto.randomInt(0, 100000000)).padStart(8, '0').replace(/(\d{4})(\d{4})/, '$1-$2');

// =============================================================================
// Settings form handling
// =============================================================================
function validateConfig(form) {
  const errors = [];
  const c = {};
  c.raceName = (form.get('raceName') || '').trim().slice(0, 80);
  if (!c.raceName) errors.push('Enter a race name.');
  c.raceDate = (form.get('raceDate') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.raceDate) || isNaN(new Date(c.raceDate + 'T00:00:00'))) {
    errors.push('Enter the race date.');
  }
  c.units = form.get('units') === 'km' ? 'km' : 'mi';
  c.timezone = (form.get('timezone') || '').trim();
  if (c.timezone && !validTimezone(c.timezone)) errors.push(`"${c.timezone}" isn't a timezone name (example: America/Jamaica).`);
  if (form.has('heightCm')) {
    c.heightCm = Number(form.get('heightCm'));
    if (!(c.heightCm >= 100 && c.heightCm <= 250)) errors.push('Height should be between 100 and 250 cm.');
    c.weightKg = Number(form.get('weightKg'));
    if (!(c.weightKg >= 30 && c.weightKg <= 250)) errors.push('Weight should be between 30 and 250 kg.');
    c.refreshMinutes = Math.round(Number(form.get('refreshMinutes')));
    if (!(c.refreshMinutes >= 5 && c.refreshMinutes <= 1440)) errors.push('Refresh every 5 to 1440 minutes.');
    c.personalBests = {};
    for (const [key, field] of [['5K', 'pb5k'], ['10K', 'pb10k'], ['Half Marathon', 'pbHalf'], ['Marathon', 'pbMarathon']]) {
      c.personalBests[key] = (form.get(field) || '').trim().slice(0, 20) || '—';
    }
  }
  return { config: c, errors };
}

function validateNewPassword(form, required) {
  const user = (form.get('username') || '').trim();
  const pw = form.get('password') || '';
  const pw2 = form.get('password2') || '';
  if (!required && !pw && !pw2) return { skip: true };
  if (!user || user.includes(':') || user.length > 64) return { error: 'Choose a username (no colons).' };
  if (pw.length < 10) return { error: 'Use a password of at least 10 characters.' };
  if (pw !== pw2) return { error: "The two passwords don't match." };
  return { user, pw };
}

function applyConfigChange(newConfig) {
  const unitsChanged = newConfig.units !== CONFIG.units;
  const refreshChanged = newConfig.refreshMinutes != null && newConfig.refreshMinutes !== CONFIG.refreshMinutes;
  SETTINGS.config = { ...(SETTINGS.config || {}), ...newConfig };
  saveSettings();
  loadSettings();
  if (unitsChanged) clearCache(); // cached paces are stored in the old unit
  if (refreshChanged) scheduleRefresh();
  rebuild({ queue: true });
}

function configFields(full) {
  const v = (x) => escapeHtml(x == null ? '' : x);
  const pb = CONFIG.personalBests || {};
  const pbVal = (k) => (pb[k] && pb[k] !== 'REPLACE_ME' && pb[k] !== '—' ? pb[k] : '');
  const raceName = /REPLACE_ME/.test(CONFIG.raceName) ? '' : CONFIG.raceName;
  let html = `
<label for="raceName">Race name</label><input id="raceName" name="raceName" required maxlength="80" value="${v(raceName)}">
<div class="row">
<div><label for="raceDate">Race date</label><input id="raceDate" name="raceDate" type="date" required value="${v(CONFIG.raceDate)}"></div>
<div><label for="units">Distance units</label><select id="units" name="units">
<option value="mi"${CONFIG.units === 'mi' ? ' selected' : ''}>Miles</option>
<option value="km"${CONFIG.units === 'km' ? ' selected' : ''}>Kilometres</option></select></div>
</div>
<label for="timezone">Your timezone</label>
<input id="timezone" name="timezone" maxlength="60" placeholder="America/Jamaica" value="${v(CONFIG.timezone)}">
<script>(function(){var t=document.getElementById('timezone');if(t&&!t.value){try{t.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}}})();</script>`;
  if (full) {
    html += `
<div class="row">
<div><label for="heightCm">Height (cm)</label><input id="heightCm" name="heightCm" type="number" min="100" max="250" value="${v(CONFIG.heightCm)}"></div>
<div><label for="weightKg">Weight (kg)</label><input id="weightKg" name="weightKg" type="number" min="30" max="250" step="0.1" value="${v(CONFIG.weightKg)}"></div>
</div>
<div class="row">
<div><label for="pb5k">5K best</label><input id="pb5k" name="pb5k" maxlength="20" placeholder="e.g. 21:30" value="${v(pbVal('5K'))}"></div>
<div><label for="pb10k">10K best</label><input id="pb10k" name="pb10k" maxlength="20" placeholder="e.g. 45:10" value="${v(pbVal('10K'))}"></div>
<div><label for="pbHalf">Half marathon best</label><input id="pbHalf" name="pbHalf" maxlength="20" placeholder="e.g. 1:39:00" value="${v(pbVal('Half Marathon'))}"></div>
<div><label for="pbMarathon">Marathon best</label><input id="pbMarathon" name="pbMarathon" maxlength="20" placeholder="e.g. 3:29:00" value="${v(pbVal('Marathon'))}"></div>
</div>
<label for="refreshMinutes">Refresh from Garmin every (minutes)</label>
<input id="refreshMinutes" name="refreshMinutes" type="number" min="5" max="1440" value="${v(CONFIG.refreshMinutes)}">`;
  }
  return html;
}

function setupPage(error = '') {
  return page('Set up your dashboard', `
<h1>Set up your training dashboard</h1>
<p>Create the login that protects this site, then add your race. You can change all of this later on the Settings page.</p>
${msgHtml(error)}
<form method="post" action="/setup">
${csrfField()}
<label for="code">Setup code</label>
<input id="code" name="code" required autocomplete="off" placeholder="1234-5678">
<p class="note">Find it in hPanel: your Node.js app → Runtime Logs, on the line starting <code>SETUP CODE</code>. It changes every time the app restarts.</p>
<h2>Your dashboard login</h2>
<label for="username">Username</label><input id="username" name="username" required value="runner" autocomplete="username">
<div class="row">
<div><label for="password">Password</label><input id="password" name="password" type="password" required minlength="10" autocomplete="new-password"></div>
<div><label for="password2">Password again</label><input id="password2" name="password2" type="password" required minlength="10" autocomplete="new-password"></div>
</div>
<h2>Your race</h2>
${configFields(false)}
<button type="submit">Save and continue</button>
</form>`);
}

function garminStatus() {
  try {
    const t = loadTokens();
    return { connected: true, fromEnv: t.dir === null };
  } catch (_) {
    return { connected: false, fromEnv: false };
  }
}

function settingsPage(error = '', ok = '') {
  const g = garminStatus();
  const envAuth = authMode() === 'env';
  const garminHtml = g.connected
    ? `<p>Connected.${g.fromEnv ? ' (Using tokens from environment variables; remove them in hPanel to disconnect.)' : ''}</p>
<a class="btn btn-quiet" href="/login">Sign in again</a>
${g.fromEnv ? '' : `<form method="post" action="/settings/disconnect" style="display:inline">${csrfField()}
<button class="btn-danger" type="submit" onclick="return confirm('Disconnect Garmin and delete the downloaded data?')">Disconnect Garmin</button></form>`}`
    : '<p>Not connected.</p><a class="btn" href="/login">Sign in to Garmin</a>';
  const pwHtml = envAuth
    ? '<p class="note">Your login is set by the DASHBOARD_PASSWORD environment variable, so it can only be changed in hPanel.</p>'
    : `<p class="note">Leave blank to keep your current password. You'll be asked to log in again after changing it.</p>
<label for="username">Username</label><input id="username" name="username" value="${escapeHtml((SETTINGS.auth || {}).user || '')}" autocomplete="username">
<div class="row">
<div><label for="password">New password</label><input id="password" name="password" type="password" minlength="10" autocomplete="new-password"></div>
<div><label for="password2">New password again</label><input id="password2" name="password2" type="password" minlength="10" autocomplete="new-password"></div>
</div>`;
  return page('Settings', `
<p><a href="/">← Back to dashboard</a></p>
<h1>Settings</h1>
${msgHtml(error, ok)}
<form method="post" action="/settings">
${csrfField()}
${configFields(true)}
<h2>Dashboard login</h2>
${pwHtml}
<button type="submit">Save settings</button>
</form>
<h2>Garmin account</h2>
${garminHtml}`);
}

// =============================================================================
// Garmin sign-in page
// =============================================================================
const loginGuard = { inFlight: false, failures: 0, lockedUntil: 0 };

function loginPage(errorMessage = '', email = '') {
  return page('Connect Garmin', `
<p><a href="/">← Back to dashboard</a></p>
<h1>Connect your Garmin account</h1>
<p>Your password is sent to Garmin once to get access tokens, then discarded. It is never stored.</p>
${msgHtml(errorMessage)}
<form method="post" action="/login" autocomplete="on">
${csrfField()}
<label for="email">Garmin email</label>
<input id="email" name="email" type="email" required autocomplete="username" value="${escapeHtml(email)}">
<label for="password">Garmin password</label>
<input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Sign in</button>
</form>
<p class="note">Two-step verification isn't supported by the Garmin library this app uses. If your account has it on, turn it off while you sign in, then turn it back on. The connection keeps working afterwards.</p>`);
}

async function handleLoginPost(req, res, form) {
  const now = Date.now();
  if (loginGuard.lockedUntil > now) {
    const mins = Math.ceil((loginGuard.lockedUntil - now) / 60000);
    return send(res, 429, loginPage(`Too many failed attempts. Try again in ${mins} minute(s) so Garmin doesn't lock your account.`));
  }
  if (loginGuard.inFlight) return send(res, 429, loginPage('A sign-in is already in progress. Wait a moment.'));
  const email = (form.get('email') || '').trim();
  const password = form.get('password') || '';

  loginGuard.inFlight = true;
  try {
    await loginToGarmin(email, password);
    loginGuard.failures = 0;
    state.lastError = null;
    rebuild({ queue: true });
    return redirect(res, '/');
  } catch (e) {
    loginGuard.failures += 1;
    if (loginGuard.failures >= 5) {
      loginGuard.lockedUntil = Date.now() + 15 * 60 * 1000;
      loginGuard.failures = 0;
    }
    const msg = e instanceof SetupError ? e.message : 'Sign-in failed unexpectedly. Check the Runtime Logs in hPanel.';
    if (!(e instanceof SetupError)) console.error('Garmin sign-in error:', e && e.message);
    return send(res, 401, loginPage(msg, email));
  } finally {
    loginGuard.inFlight = false;
  }
}

function disconnectGarmin() {
  for (const dir of new Set([TOKEN_SAVE_DIR, path.join(__dirname, '.garminconnect')])) {
    for (const f of ['oauth1_token.json', 'oauth2_token.json']) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) { /* already gone */ }
    }
  }
  cachedClient = null;
  clearCache();
  state.html = null;
  state.version = null;
  state.lastError = null;
}

// =============================================================================
// Web server (Hostinger Node.js app mode)
// =============================================================================
const state = { html: null, builtAt: null, version: null, lastError: null, building: null, queued: false };
let refreshTimer = null;

function rebuild({ queue = false } = {}) {
  if (state.building) {
    if (queue) state.queued = true; // settings changed mid-build: build again afterwards
    return state.building;
  }
  console.log(`[${new Date().toISOString()}] Building dashboard...`);
  state.building = buildDashboard()
    .then((html) => {
      state.html = html;
      state.builtAt = new Date();
      state.version = (html.match(/var v = '(\d+)'/) || [])[1] || String(Date.now());
      state.lastError = null;
      const c = CACHE_STATS;
      console.log(`[${new Date().toISOString()}] Dashboard built (${c.activityMode} activity sync; ` +
        `recovery days fetched ${c.recoveryFetched}, cached ${c.recoveryFromCache}; ` +
        `VO2 fetched ${c.vo2Fetched}, cached ${c.vo2FromCache}; unavailable fields: ${DIAGNOSTICS.missing.size}).`);
    })
    .catch((e) => {
      state.lastError = e instanceof SetupError ? e.message : `${e.name || 'Error'}: ${e.message}`;
      console.error(`[${new Date().toISOString()}] Build failed: ${state.lastError}`);
    })
    .finally(() => {
      state.building = null;
      if (state.queued) {
        state.queued = false;
        rebuild();
      }
    });
  return state.building;
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    rebuild();
    scheduleRefresh();
  }, CONFIG.refreshMinutes * 60 * 1000);
}

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const isPost = req.method === 'POST';

  if (route === '/health') {
    // Public on purpose (Hostinger and the page's auto-reload use it), so no details here.
    return send(res, 200, JSON.stringify({ ok: true, ready: !!state.html, version: state.version }), 'application/json');
  }
  if (route === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain');

  if (isLockedOut(req)) return send(res, 429, 'Too many failed attempts. Try again in 15 minutes.', 'text/plain');

  let form = null;
  if (isPost) {
    try {
      form = new URLSearchParams(await readBody(req));
    } catch (_) {
      return send(res, 413, 'Request too large', 'text/plain');
    }
    if (!csrfOk(form)) {
      return send(res, 403, statusPage('This form expired', 'The app restarted since the page was loaded. Go back, reload the page and try again.'));
    }
  }

  // ---- First-time setup (no dashboard password yet) ----
  if (authMode() === 'setup') {
    if (route !== '/setup') return redirect(res, '/setup');
    if (!isPost) return send(res, 200, setupPage());
    const code = (form.get('code') || '').replace(/\s/g, '');
    if (code.replace('-', '') !== SETUP_CODE.replace('-', '')) {
      noteFailure(req);
      return send(res, 403, setupPage("That setup code isn't right. Copy it from the Runtime Logs in hPanel."));
    }
    const pw = validateNewPassword(form, true);
    if (pw.error) return send(res, 400, setupPage(pw.error));
    const { config, errors } = validateConfig(form);
    if (errors.length) return send(res, 400, setupPage(errors.join(' ')));
    SETTINGS.auth = { user: pw.user, ...hashPassword(pw.pw) };
    applyConfigChange(config); // also saves SETTINGS.auth
    acceptedAuthHeader = null;
    console.log('Setup complete: dashboard login created.');
    return redirect(res, garminStatus().connected ? '/' : '/login');
  }
  if (route === '/setup') return redirect(res, '/');

  // ---- Everything below needs the dashboard login ----
  if (!isAuthorized(req)) {
    return send(res, 401, 'Login required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Training Dashboard", charset="UTF-8"' });
  }

  if (route === '/login') {
    if (isPost) return handleLoginPost(req, res, form);
    return send(res, 200, loginPage());
  }

  if (route === '/settings') {
    if (!isPost) return send(res, 200, settingsPage());
    const { config, errors } = validateConfig(form);
    let pw = { skip: true };
    if (authMode() === 'settings') pw = validateNewPassword(form, false);
    if (errors.length || pw.error) return send(res, 400, settingsPage([...errors, pw.error].filter(Boolean).join(' ')));
    if (!pw.skip) {
      SETTINGS.auth = { user: pw.user, ...hashPassword(pw.pw) };
      acceptedAuthHeader = null;
    }
    applyConfigChange(config);
    return send(res, 200, settingsPage('', pw.skip
      ? 'Saved. The dashboard is rebuilding with your changes.'
      : 'Saved. Your browser will ask for the new password next time you load a page.'));
  }

  if (route === '/settings/disconnect' && isPost) {
    disconnectGarmin();
    return send(res, 200, settingsPage('', 'Garmin disconnected and downloaded data deleted.'));
  }

  if (route === '/refresh') {
    const sinceLast = state.builtAt ? (Date.now() - state.builtAt) / 1000 : Infinity;
    if (sinceLast >= MIN_MANUAL_REFRESH_SECONDS || state.lastError) rebuild();
    return redirect(res, '/');
  }

  if (route === '/' || route === '/index.html') {
    if (state.html) return send(res, 200, state.html);
    if (state.building) {
      return send(res, 200, statusPage('Building your dashboard…',
        'Pulling data from Garmin Connect. The first build can take a minute or two; this page reloads itself.', 10));
    }
    const g = garminStatus();
    const actions = g.connected
      ? '<a class="btn" href="/refresh">Try again</a> &nbsp; <a href="/login">Sign in to Garmin again</a> &nbsp; <a href="/settings">Settings</a>'
      : '<a class="btn" href="/login">Sign in to Garmin</a> &nbsp; <a href="/settings">Settings</a>';
    return send(res, 503, statusPage(g.connected ? 'Dashboard unavailable' : 'Connect Garmin',
      state.lastError || 'Not built yet.', 0, actions));
  }

  send(res, 404, 'Not found', 'text/plain');
}

function startServer() {
  SERVER_MODE = true;
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      console.error('Request error:', e && e.stack ? e.stack : e);
      if (!res.headersSent) send(res, 500, 'Something went wrong. Check the Runtime Logs in hPanel.', 'text/plain');
    });
  });

  server.listen(PORT, () => {
    console.log(`Training dashboard listening on port ${PORT} (refresh every ${CONFIG.refreshMinutes} min).`);
    if (authMode() === 'setup') {
      console.log('============================================================');
      console.log(`SETUP CODE: ${SETUP_CODE}`);
      console.log('Open your site and enter this code to create your login.');
      console.log('============================================================');
    }
    rebuild();
    scheduleRefresh();
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// =============================================================================
// CLI modes
// =============================================================================
async function buildStatic() {
  console.log('Connecting to Garmin using cached tokens...');
  console.log('Pulling data (this can take a minute for daily recovery metrics)...');
  const html = await buildDashboard();
  fs.writeFileSync(OUTPUT_FILE, html);
  console.log(`\nWrote ${OUTPUT_FILE}`);
  console.log(`Fields returned OK: ${DIAGNOSTICS.ok.size}`);
  if (DIAGNOSTICS.missing.size) {
    console.log(`Fields unavailable/empty: ${DIAGNOSTICS.missing.size} (see the page footer for the list)`);
  }
}

function printTokenEnv() {
  const tokens = loadTokens();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  console.log(`# From ${tokens.source}. Paste these into Hostinger's environment variables.`);
  console.log('# Treat them like a password: they give access to your Garmin account.');
  console.log(`GARMIN_OAUTH1_TOKEN=${b64(tokens.oauth1)}`);
  console.log(`GARMIN_OAUTH2_TOKEN=${b64(tokens.oauth2)}`);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo the prompt but not the typed characters.
      rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function cliLogin() {
  if (!process.stdin.isTTY) {
    throw new SetupError('Run `npm run login` in an interactive terminal (it asks for your password).');
  }
  console.log('Sign in to Garmin Connect. Your password is used once and not saved.\n');
  const email = (await ask('Garmin email: ')).trim();
  const password = await ask('Garmin password: ', { hidden: true });
  console.log('Signing in...');
  await loginToGarmin(email, password);
  console.log('\nTo use these tokens on Hostinger, add these environment variables:\n');
  printTokenEnv();
}

function run() {
  const args = process.argv.slice(2);
  const fail = (e) => {
    console.error(e instanceof SetupError ? e.message : e);
    process.exit(1);
  };
  if (args.includes('--build')) return buildStatic().catch(fail);
  if (args.includes('--login')) return cliLogin().catch(fail);
  if (args.includes('--print-token-env')) {
    try { return printTokenEnv(); } catch (e) { return fail(e); }
  }
  return startServer();
}

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

  <footer>Generated __GENERATED_AT__ from your Garmin Connect data. Refreshes automatically.__FOOTER_LINKS__</footer>
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
<script>
// Reload when the server has a newer build (every minute, only while the tab is visible).
(function(){
  var v = '__BUILD_VERSION__';
  setInterval(function(){
    if (document.hidden) return;
    fetch('/health', {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(h){
      if (h && h.version && String(h.version) !== v) location.reload();
    }).catch(function(){});
  }, 60000);
})();
</script>
</body>
</html>
`;

// Entry point — runs after HTML_TEMPLATE is defined.
run();
