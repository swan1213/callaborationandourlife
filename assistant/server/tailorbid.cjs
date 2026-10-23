// TailorBid connection. TailorBid's Interview Assistant button opens this app with
// #tailorbid={ origin, token } in the address. The token (valid for 12 hours) reads the interview's
// resume and job description from TailorBid, and is the key for OpenAI calls: they go through
// TailorBid (<origin>/api/assistant/openai), so TailorBid's OpenAI key never reaches this PC.
const settings = require('./settings.cjs');
const { encrypt, decrypt } = require('./secret.cjs');

const origin = (url) => {
  try {
    return new URL(String(url).trim()).origin;
  } catch {
    return '';
  }
};

// Only these TailorBid sites may connect: a link from any other site could otherwise receive your
// interview: TailorBid's APP_URL (.env.local) and TailorBid in development.
// Each site counts with and without "www.", since the live site may redirect from one to the other.
const withAndWithoutWww = (site) => {
  if (!site) return [];
  const url = new URL(site);
  const other = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
  return [site, `${url.protocol}//${other}${url.port ? `:${url.port}` : ''}`];
};

function allowedOrigins() {
  const extra = (process.env.APP_URL || '').split(',').map(origin).flatMap(withAndWithoutWww);
  return ['http://localhost:3000', 'http://127.0.0.1:3000', ...extra].filter(Boolean);
}

// When the token expires (from its JWT payload; TailorBid checks the signature).
function expiry(token) {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return new Date(exp * 1000).toISOString();
  } catch {
    return null;
  }
}

async function fetchContext(site, token) {
  let res;
  try {
    res = await fetch(`${site}/api/assistant/context`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(`Can't reach TailorBid at ${site}. Check your internet connection and try again.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `TailorBid answered with an error (${res.status}).`);
  return data;
}

// Connects to TailorBid and loads the interview's resume and job description into the profile.
// Opened without an interview, only the OpenAI connection is used and the profile stays as it is.
async function connect({ origin: from, token }) {
  const site = origin(from || '');
  if (!site || !allowedOrigins().includes(site)) {
    throw Object.assign(
      new Error(
        `This assistant only connects to ${allowedOrigins().find((o) => o.startsWith('https:')) || 'its own TailorBid site'}, not ${from}.`,
      ),
      { status: 403 },
    );
  }
  const expiresAt = typeof token === 'string' && expiry(token);
  if (!expiresAt)
    throw Object.assign(new Error('The link from TailorBid is incomplete. Click it again.'), { status: 400 });

  const context = await fetchContext(site, token);
  save(site, token, expiresAt, context);
  return context;
}

// Loads the resume and job description again (they may have changed in TailorBid).
async function refresh() {
  const tb = current();
  if (!tb) throw new Error('Not connected to TailorBid.');
  const context = await fetchContext(tb.origin, tb.token);
  save(tb.origin, tb.token, tb.expiresAt, context, { start: false });
}

// What belongs to one interview: cleared when the assistant is opened for another one, or disconnected,
// so nothing from the last meeting (resume, job description, instructions, take-home project) is used by mistake.
const NO_INTERVIEW = {
  profile: { resume: '', jobDescription: '', customPrompt: '' },
  activeProjectId: null,
  activeProjectName: '',
};

// `start`: opened from TailorBid's button (a new start); otherwise only the resume and job description reload.
function save(site, token, expiresAt, { user, interview, resume, jobDescription }, { start = true } = {}) {
  settings.save({
    ...(start && NO_INTERVIEW),
    // connectedAt changes on every load, so the app shows the new fields even in a page left open.
    tailorbid: {
      origin: site,
      token: encrypt(token),
      expiresAt,
      user: user?.name || '',
      interview,
      connectedAt: new Date().toISOString(),
    },
    profile: { ...(start && NO_INTERVIEW.profile), resume: resume || '', jobDescription: jobDescription || '' },
  });
}

function disconnect() {
  settings.save({ ...NO_INTERVIEW, tailorbid: null });
}

// The live connection with its token, or null (none, or expired).
function current() {
  const tb = settings.get().tailorbid;
  const token = tb?.token && decrypt(tb.token);
  if (!token || new Date(tb.expiresAt) <= new Date()) return null;
  return { ...tb, token };
}

// A call to TailorBid's assistant API with the connection's token. Resolves null when not connected.
async function request(method, path, body) {
  const tb = current();
  if (!tb) return null;
  let res;
  try {
    res = await fetch(`${tb.origin}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tb.token}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(`Can't reach TailorBid at ${tb.origin}. Check your internet connection.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `TailorBid answered with an error (${res.status}).`);
  return data;
}

// OpenAI client options that send requests through TailorBid, or null when not connected.
function clientOptions() {
  const tb = current();
  return tb ? { apiKey: tb.token, baseURL: `${tb.origin}/api/assistant/openai` } : null;
}

module.exports = { connect, refresh, disconnect, request, clientOptions, allowedOrigins };
