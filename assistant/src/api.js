// Talks to the local server (server/index.cjs), which runs OpenAI calls, reads Windows Live Captions
// and keeps settings on this PC. The OpenAI API key never reaches the browser.

const HEADERS = { 'Content-Type': 'application/json', 'X-Interview-Assistant': '1' };
const OFFLINE = 'Can\'t reach the Interview Assistant server. Make sure "npm start" is still running, then reload.';

async function post(name, body, init = {}) {
  let res;
  try {
    res = await fetch(`/api/${name}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}), ...init });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(OFFLINE, { cause: err });
  }
  return res;
}

async function call(name, body) {
  const res = await post(name, body);
  const data = await res.json().catch(() => ({ error: `The server answered with an error (${res.status}).` }));
  if (!res.ok) throw new Error(data.error);
  return data.result;
}

// Reads a reply that sends one JSON object per line.
async function readLines(res, onMessage) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) onMessage(JSON.parse(line));
    }
  }
}

export const getSettings = () => call('settings/get');
export const saveSettings = (patch) => call('settings/save', patch);
export const testConnection = (values) => call('settings/test-connection', values);
export const saveConnection = (values) => call('settings/save-connection', values);
export const deleteAllData = () => call('settings/delete-all');
export const showDataFolder = () => call('settings/show-data-folder');
export const connectTailorbid = (link) => call('tailorbid/connect', link);
export const refreshTailorbid = () => call('tailorbid/refresh');
export const disconnectTailorbid = () => call('tailorbid/disconnect');
// Heartbeat for the online status and Work Time in TailorBid. Failures don't matter: the next one follows.
export const sendPresence = (idleMs) => call('tailorbid/presence', { idleMs }).catch(() => {});
export const warmup = (profile) => call('ai/warmup', { profile }).catch(() => {});
// Keeps the connection to OpenAI (through TailorBid when connected) open; see server/ai.cjs ping().
export const keepAlive = () => call('ai/keepalive').catch(() => {});
export const prepareAnswers = (profile, questions) => call('ai/prepare', { profile, questions });
export const translate = (text, language, context) => call('ai/translate', { text, language, context });
// Interviews are saved to Interview History in TailorBid (through the local server).
export const saveSession = (session) => call('sessions/save', session);
export const deleteSession = (id) => call('sessions/delete', { id });
export const pickProject = () => call('project/pick');
export const analyzeProject = (token) => call('project/analyze', { token });
export const listProjects = () => call('project/list');
export const deleteProject = (id) => call('project/delete', { id });
export const relatedCode = (request) => call('project/related', request);

// Asks for a PDF, Word or text file and returns { name, text }, or null if nothing was chosen.
export function importTextFile() {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.pdf,.docx,.txt,.md,text/plain',
    });
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        let res;
        try {
          res = await fetch(`/api/file/extract?name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Interview-Assistant': '1' },
            body: file,
          });
        } catch {
          throw new Error(OFFLINE);
        }
        const data = await res.json().catch(() => ({ error: `The server answered with an error (${res.status}).` }));
        if (!res.ok) throw new Error(data.error);
        resolve(data.result);
      } catch (err) {
        reject(err);
      }
    });
    input.click();
  });
}

/* ---------- Windows Live Captions ---------- */

const captionListeners = new Set();
let captionsController = null;

// Events: { status: 'waiting' | 'connected' | 'stopped' } or { text }.
export const onLiveCaptions = (cb) => {
  captionListeners.add(cb);
  return () => captionListeners.delete(cb);
};

export function startLiveCaptions() {
  captionsController?.abort();
  const controller = new AbortController();
  captionsController = controller;
  const emit = (event) => captionListeners.forEach((cb) => cb(event));
  post('captions/stream', {}, { signal: controller.signal })
    .then((res) => (res.ok ? readLines(res, emit) : null))
    .catch(() => {})
    .finally(() => {
      // The stream ended without being stopped here (server stopped, PowerShell failed…).
      if (captionsController !== controller) return;
      captionsController = null;
      if (!controller.signal.aborted) emit({ status: 'stopped' });
    });
}

export function stopLiveCaptions() {
  captionsController?.abort();
  captionsController = null;
}

/* ---------- global hotkeys ---------- */

const HOTKEY_RETRY_MS = 3000;

// Hotkeys registered by the server, so they work while the meeting window has focus.
// cb({ hotkey: 'answer' | 'view' | 'hide' }) or cb({ notice }). Reconnects if the server restarts.
export function onHotkey(cb) {
  let controller = null;
  let retryTimer = null;
  let stopped = false;
  const connect = () => {
    controller = new AbortController();
    post('hotkeys/stream', {}, { signal: controller.signal })
      .then((res) => (res.ok ? readLines(res, cb) : null))
      .catch(() => {})
      .finally(() => {
        if (!stopped) retryTimer = setTimeout(connect, HOTKEY_RETRY_MS);
      });
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
  };
}

/* ---------- answers ---------- */

// Streams an answer from the server; resolves with the full text.
// `earlier`: spoken text of the last few answers in this interview, so the new one doesn't repeat them.
export async function streamAnswer({ question, transcript, opener = '', profile, earlier = [], signal, onDelta }) {
  const res = await post('ai/answer', { question, transcript, opener, profile, earlier }, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `The server answered with an error (${res.status}).`);
  }
  let full = '';
  let result = null;
  await readLines(res, (msg) => {
    if (msg.type === 'delta') {
      full += msg.data;
      onDelta(msg.data);
    } else result = msg;
  });
  if (result?.type === 'error') throw new Error(result.data);
  if (result?.type !== 'done') throw new Error('The answer stopped before it was finished. Try again.');
  return full;
}
