const fs = require('node:fs');
const { dataFile, writeJson } = require('./paths.cjs');
const secret = require('./secret.cjs');

const DEFAULTS = {
  apiKey: '',
  model: 'gpt-5.6-terra',
  reasoningEffort: 'low',
  translateModel: 'gpt-6-luna',
  serviceTier: 'priority',
  translateCaptions: false,
  activeProjectId: null, // take-home project used during interviews (Prepare tab)
  activeProjectName: '',
  tailorbid: null, // TailorBid connection (server/tailorbid.cjs); its token is encrypted
  viewMode: 'full', // 'full' | 'medium' | 'mini'
  answerFontScale: 1, // text size of the suggested answer (A− / A+)
  theme: 'system', // 'system' | 'light' | 'dark'
  accent: 'blue', // see ACCENTS in src/Setup.jsx
  profile: {
    resume: '',
    jobDescription: '',
    englishLevel: 'intermediate',
    answerLength: 'medium',
    nativeLanguage: 'English',
    customPrompt: '',
    deliveryCues: true,
    cueAmount: 'some', // 'few' | 'some' | 'many'
    tone: 'casual',
    earlyAnswers: true,
    preparedAnswers: true,
  },
};

const file = () => dataFile('settings.json');
let cache;

const { encrypt, decrypt } = secret;

// The OpenAI connection settings. Each one comes from (highest priority first):
//   1. Setup → Connection ("set in app", saved under `connection` in settings.json),
//   2. TailorBid's .env.local (server/env.cjs) / environment,
//   3. the default above.
const ENV_KEYS = {
  apiKey: 'OPENAI_API_KEY', // TailorBid's own key: one key for both apps
  model: 'ASSISTANT_MODEL',
  reasoningEffort: 'ASSISTANT_REASONING_EFFORT',
  translateModel: 'ASSISTANT_TRANSLATE_MODEL',
  serviceTier: 'ASSISTANT_SERVICE_TIER',
};
const CONNECTION_KEYS = Object.keys(ENV_KEYS);

function fromEnv() {
  const values = {};
  for (const [key, name] of Object.entries(ENV_KEYS)) {
    if (process.env[name]?.trim()) values[key] = process.env[name].trim();
  }
  return values;
}

// Values set in the app (decrypted). Empty values mean "not set here".
function fromApp() {
  const conn = stored().connection || {};
  const values = {};
  for (const key of CONNECTION_KEYS) {
    const value = key === 'apiKey' ? decrypt(conn.apiKey) : conn[key];
    if (value?.trim?.()) values[key] = value.trim();
  }
  return values;
}

function get() {
  const s = stored();
  const env = fromEnv();
  const set = fromApp();
  const result = { ...s, connection: undefined };
  for (const key of CONNECTION_KEYS) {
    // Older versions saved every default at the top level; only the API key there is meaningful.
    const legacy = key === 'apiKey' ? s.apiKey : undefined;
    result[key] = set[key] || env[key] || legacy || DEFAULTS[key];
  }
  return result;
}

// Where each connection value currently comes from: 'app' | 'env' | 'default'.
function sources() {
  const env = fromEnv();
  const set = fromApp();
  const s = stored();
  return Object.fromEntries(
    CONNECTION_KEYS.map((key) => [
      key,
      set[key] ? 'app' : env[key] ? 'env' : key === 'apiKey' && s.apiKey ? 'app' : 'default',
    ]),
  );
}

// Saves connection values set in the app. '' (or null) removes a value, so .env.local/default applies again.
function saveConnection(values) {
  const conn = { ...(stored().connection || {}) };
  for (const [key, value] of Object.entries(values)) {
    if (!CONNECTION_KEYS.includes(key)) continue;
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) delete conn[key];
    else conn[key] = key === 'apiKey' ? encrypt(clean) : clean;
  }
  // Removing the key in the app also removes a key saved by older versions.
  const patch = { connection: conn };
  if ('apiKey' in values && !values.apiKey) patch.apiKey = '';
  save(patch);
}

function stored() {
  if (!cache) {
    let stored = {};
    try {
      stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
    } catch {}
    cache = { ...DEFAULTS, ...stored, profile: { ...DEFAULTS.profile, ...stored.profile } };
    cache.apiKey = decrypt(cache.apiKey);
  }
  return cache;
}

function save(patch) {
  const current = stored();
  cache = { ...current, ...patch, profile: { ...current.profile, ...patch.profile } };
  writeJson(file(), { ...cache, apiKey: encrypt(cache.apiKey) });
}

// The TailorBid connection without its token.
function tailorbidPublic(tb) {
  if (!tb?.token) return null;
  const { token, ...rest } = tb;
  return { ...rest, expired: new Date(tb.expiresAt) <= new Date() };
}

// What the renderer is allowed to see: never the raw key, only its last 4 characters to recognize it.
// Connected to TailorBid, answers use TailorBid's key (through TailorBid) instead of one set here.
function getPublic() {
  // Window fields saved by the old desktop version are left out.
  const { apiKey, bounds, maximized, alwaysOnTop, opacity, tailorbid, ...rest } = get();
  const tb = tailorbidPublic(tailorbid);
  const viaTailorbid = Boolean(tb && !tb.expired);
  return {
    ...rest,
    tailorbid: tb,
    // OpenAI access comes only through a live TailorBid connection.
    hasApiKey: viaTailorbid,
    // The TailorBid site the assistant connects to (shown on the "connect through TailorBid" screen).
    site: (process.env.APP_URL || '').split(',')[0].trim(),
    apiKeyHint: apiKey ? `…${apiKey.slice(-4)}` : '',
    sources: viaTailorbid ? { ...sources(), apiKey: 'tailorbid' } : sources(),
    fromEnv: Object.keys(fromEnv()),
    dataLocation: file(),
  };
}

// Deletes everything saved in Setup (profile, saved key, window position). .env.local is not touched.
function clearAll() {
  cache = null;
  fs.rmSync(file(), { force: true });
}

// Where the settings live, shown on the Setup page so the user knows what is stored and where.
const location = () => file();

module.exports = { get, save, saveConnection, getPublic, clearAll, location };
