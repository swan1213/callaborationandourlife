const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Loads TailorBid's .env.local before anything reads process.env.
const env = require('./env.cjs');
const settings = require('./settings.cjs');
const ai = require('./ai.cjs');
const importers = require('./importers.cjs');
const liveCaptions = require('./liveCaptions.cjs');
const prepared = require('./prepared.cjs');
const sessions = require('./sessions.cjs');
const projectAnalyzer = require('./projectAnalyzer.cjs');
const desktop = require('./desktop.cjs');
const hotkeys = require('./hotkeys.cjs');
const tailorbid = require('./tailorbid.cjs');

// Only reachable from this PC. The React app is served from here too (npm start), or proxied by Vite (npm run dev).
const HOST = '127.0.0.1';
const PORT = env.PORT;
const DIST = path.join(ROOT, 'dist');
const MAX_BODY = 30 * 1024 * 1024; // long interview transcripts and uploaded resumes fit easily

/* ---------- API ---------- */

// POST /api/<name> with a JSON body; the reply is { result } or { error }.
const routes = {
  'settings/get': () => settings.getPublic(),
  'settings/save': (patch) => {
    settings.save(patch);
    if ('apiKey' in patch) ai.reset();
    return settings.getPublic();
  },
  'settings/test-connection': (values) => ai.testConnection(values),
  'settings/save-connection': ({ apiKey, ...values }) => {
    // Models only: OpenAI access comes from the TailorBid connection, never from a key saved here.
    settings.saveConnection(values);
    ai.reset(); // the next request uses the new key and models
    return settings.getPublic();
  },
  'settings/delete-all': () => {
    settings.clearAll();
    prepared.clear();
    sessions.clearAll();
    projectAnalyzer.clearAll();
    ai.reset();
    return settings.getPublic();
  },
  'settings/show-data-folder': () => desktop.showInFolder(settings.location()),

  // Opened from TailorBid's Interview Assistant button: { origin, token } from the address (#tailorbid=…).
  'tailorbid/connect': async (link) => {
    await tailorbid.connect(link);
    ai.reset(); // answers now go through TailorBid
    return settings.getPublic();
  },
  'tailorbid/refresh': async () => {
    await tailorbid.refresh();
    return settings.getPublic();
  },
  'tailorbid/presence': ({ idleMs }) => tailorbid.request('POST', '/api/assistant/presence', { idleMs }),
  'tailorbid/disconnect': () => {
    tailorbid.disconnect();
    ai.reset();
    return settings.getPublic();
  },

  // The interview being recorded, saved to Interview History in TailorBid.
  'sessions/save': (session) => sessions.save(session),
  'sessions/delete': ({ id }) => sessions.remove(id),

  'project/pick': async () => {
    const folder = await desktop.pickFolder('Choose your take-home project folder');
    return folder ? projectAnalyzer.scan(folder) : null;
  },
  'project/analyze': ({ token }) => projectAnalyzer.analyze(token, ai, settings.get().profile),
  'project/list': () => projectAnalyzer.listSaved(),
  'project/delete': ({ id }) => {
    projectAnalyzer.remove(id);
    if (settings.get().activeProjectId === id) settings.save({ activeProjectId: null });
  },
  'project/related': (request) => projectAnalyzer.related(request),

  'ai/translate': ({ text, language, context }) => ai.translate(text, language, context),
  'ai/prepare': ({ profile, questions }) => prepared.prepare(profile, questions),
  'ai/keepalive': () => ai.ping(),
  'ai/warmup': ({ profile }) => {
    try {
      ai.warmup(profile);
    } catch {
      // No API key yet; nothing to warm up.
    }
  },
};

// Streaming replies: one JSON object per line, for as long as the request stays open.
const streams = {
  // { type: 'delta' | 'done' | 'error', data }. Closing the request cancels the answer.
  'ai/answer': (body, send, end, res) => {
    const id = crypto.randomUUID();
    res.on('close', () => ai.cancel(id));
    ai.answer(id, body, {
      onDelta: (d) => send({ type: 'delta', data: d }),
      onDone: () => end({ type: 'done' }),
      onError: (msg) => end({ type: 'error', data: msg }),
    });
  },
  // { status } or { text } from Windows Live Captions. Closing the request stops reading them.
  'captions/stream': (_body, send, end, res) => {
    captionsReply?.end();
    captionsReply = res;
    res.on('close', () => {
      if (captionsReply !== res) return;
      captionsReply = null;
      liveCaptions.stop();
    });
    liveCaptions.start((event) => (event.status === 'stopped' ? end(event) : send(event)));
  },
  // { hotkey } or { notice } for Ctrl+Shift+Space / M / H, which work even while the meeting has focus.
  'hotkeys/stream': (_body, send, _end, res) => {
    // Ctrl+Shift+H finds the app's browser windows by title: the tab title, or the origin shown by the on-top window.
    const marks = ['Interview Assistant', `127.0.0.1:${PORT}`, `localhost:${PORT}`, '127.0.0.1:5173', 'localhost:5173'];
    res.on('close', hotkeys.subscribe(send, marks));
  },
};
let captionsReply = null; // only one caption reader at a time

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('That file is too large.'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

// Requests must come from the app itself. A web page on another site can't add the custom header
// without a CORS preflight (which is never allowed), and the Host check stops DNS-rebinding tricks.
function isFromApp(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  return ['127.0.0.1', 'localhost'].includes(host) && req.headers['x-interview-assistant'] === '1';
}

async function handleApi(req, res, name) {
  if (req.method !== 'POST' || !isFromApp(req)) return sendJson(res, 403, { error: 'Forbidden.' });
  try {
    const raw = await readBody(req);

    // Raw file bytes; the file name comes in the query string.
    if (name === 'file/extract') {
      const fileName = new URL(req.url, 'http://x').searchParams.get('name') || 'file.txt';
      return sendJson(res, 200, { result: { name: fileName, text: await importers.extractText(fileName, raw) } });
    }

    const body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
    if (streams[name]) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
      const send = (msg) => !res.writableEnded && res.write(JSON.stringify(msg) + '\n');
      const end = (msg) => !res.writableEnded && res.end(JSON.stringify(msg) + '\n');
      return streams[name](body, send, end, res);
    }
    if (!routes[name]) return sendJson(res, 404, { error: `Unknown request: ${name}` });
    const result = await routes[name](body);
    sendJson(res, 200, { result: result ?? null });
  } catch (err) {
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || 'Something went wrong.' });
  }
}

/* ---------- the React app (built by `vite build`) ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('The app is not built yet. Run "npm start" (or "npm run dev" for development).');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    ...(ext === '.html' && {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    }),
  });
  fs.createReadStream(file).pipe(res);
}

/* ---------- start ---------- */

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname.slice(5));
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
  serveStatic(req, res);
});

const url = `http://${HOST}:${PORT}`;
const open = process.argv.includes('--open');

server.on('error', (err) => {
  // Already running (one copy only, so there is never a second caption reader): just show it.
  if (err.code === 'EADDRINUSE') {
    console.log(`Interview Assistant is already running at ${url}`);
    if (open) desktop.openBrowser(url);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  hotkeys.showHidden(); // windows left hidden by Ctrl+Shift+H if the last run was killed
  console.log(`Interview Assistant server: ${url}`);
  if (open) desktop.openBrowser(url);
});

const shutdown = () => {
  liveCaptions.stop();
  hotkeys.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown); // the terminal window was closed
process.on('exit', () => {
  liveCaptions.stop();
  hotkeys.stop();
});
