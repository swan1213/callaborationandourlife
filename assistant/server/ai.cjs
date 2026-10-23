const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { OpenAI } = require('openai');
const settings = require('./settings.cjs');
const { buildAnswerMessages } = require('./prompts.cjs');
const projectAnalyzer = require('./projectAnalyzer.cjs');
const tailorbid = require('./tailorbid.cjs');
// Shared with the app, which runs it on live answers as they stream in.
const { humanizeAnswer } = require('../src/answerFormat.js');
const { asksAboutAnswering } = require('../src/selfAnswer.js');

// Answer prompts always include the take-home project marked "Use in interview", if any.
function answerMessages(args) {
  const active = settings.get().activeProjectId;
  const project = active ? projectAnalyzer.brief(projectAnalyzer.get(active)) : '';
  return buildAnswerMessages({ ...args, project });
}

let client;
const running = new Map(); // answer id -> AbortController

/* ---------- prompt cache ---------- */

// An answer starts about a second sooner when OpenAI already holds its prompt (instructions, resume and job
// description: ~90% of it) in its cache. The same cache key for every request of one interview routes them
// to the servers that hold it, and 24-hour retention keeps it between questions.
// The conversation part of the input changes with each question, so only what comes before it is cached.
const CONVERSATION = '\nRECENT CONVERSATION';
const stablePart = (input) => input.split(CONVERSATION)[0];
const noRetention = new Set(); // models that refused prompt_cache_retention

function cacheHints(model, instructions, input) {
  const key = crypto
    .createHash('sha256')
    .update(`${instructions}\n${stablePart(input)}`)
    .digest('hex')
    .slice(0, 32);
  return { prompt_cache_key: `ia-${key}`, ...(!noRetention.has(model) && { prompt_cache_retention: '24h' }) };
}

// responses.create with the cache hints; tried again without 24-hour retention if the model refuses it.
async function createCached(params, options) {
  const full = { ...params, ...cacheHints(params.model, params.instructions, params.input) };
  try {
    return await getClient().responses.create(full, options);
  } catch (err) {
    if (err?.status !== 400 || !/prompt_cache_retention/i.test(err?.message || '')) throw err;
    noRetention.add(params.model);
    const { prompt_cache_retention, ...rest } = full;
    return getClient().responses.create(rest, options);
  }
}

// Live answers must not hang: give up after this long and retry a failed request only once.
const REQUEST_TIMEOUT_MS = 45000;
// The SDK timeout only covers the start of a request. Once an answer is streaming, give up if
// nothing arrives for this long (the connection dropped silently or OpenAI stalled).
const STREAM_IDLE_MS = 30000;

const NOT_CONNECTED =
  'Not connected to TailorBid. Open the assistant from the Interview Assistant button in TailorBid (admins, users and callers).';

function getClient() {
  if (client) return client;
  // Only through a TailorBid connection: the assistant works for signed-in TailorBid admins, users and callers.
  const options = tailorbid.clientOptions();
  if (!options) throw new Error(NOT_CONNECTED);
  client = new OpenAI({
    ...options,
    httpAgent: keepAliveAgent(options.baseURL),
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

// Connections stay open between requests: the SDK's own agent closes them after 4 idle seconds, and a new
// one can cost over a second on some networks (answers started after 2.2 s instead of 0.7 s after a pause).
const agents = {};
function keepAliveAgent(baseURL = 'https://api.openai.com') {
  const lib = baseURL.startsWith('http:') ? http : https;
  return (agents[lib === http ? 'http' : 'https'] ??= new lib.Agent({ keepAlive: true, maxSockets: 16 }));
}

// Called every 45 seconds while the app is open (see api.js keepAlive): a free request (the model's details,
// no tokens) so OpenAI, and TailorBid when connected, never close the connection as idle before an answer.
function ping() {
  try {
    getClient()
      .models.retrieve(settings.get().model)
      .catch(() => {});
  } catch {
    // No key yet: nothing to keep open.
  }
}

// Errors from TailorBid itself (not connected, expired, no access, no key) come with code "tailorbid".
const tailorbidMessage = (err) =>
  (err?.code || err?.error?.code) === 'tailorbid' ? err.error?.message || err.message : null;

// Short, readable messages for the problems people actually hit, instead of raw API errors.
function friendlyError(err) {
  const status = err?.status;
  const code = err?.code || err?.error?.code;
  const fromTailorbid = tailorbidMessage(err);
  if (fromTailorbid) return fromTailorbid;
  const viaTailorbid = Boolean(tailorbid.clientOptions());
  if (status === 401)
    return viaTailorbid
      ? "OpenAI rejected TailorBid's API key. Ask a TailorBid administrator to check it."
      : 'OpenAI rejected the API key. Check it in Setup or OPENAI_API_KEY in .env.local.';
  if (code === 'insufficient_quota')
    return viaTailorbid
      ? "TailorBid's OpenAI account has no credit left. Ask a TailorBid administrator."
      : 'Your OpenAI account has no credit left. Add credit on the OpenAI billing page.';
  if (status === 429)
    return 'OpenAI is limiting requests right now (too many at once). Wait a few seconds and try again.';
  if (status === 404)
    return `Your OpenAI account can't use the model "${settings.get().model}". Check the model name in Setup or .env.local.`;
  if (status >= 500) return 'OpenAI is having problems right now. Try again in a moment.';
  if (err?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(err?.message || ''))
    return 'OpenAI took too long to respond. Check your internet connection and try again.';
  if (err?.name === 'APIConnectionError') return 'Could not reach OpenAI. Check your internet connection.';
  return err?.message || 'Something went wrong talking to OpenAI.';
}

// Re-throws with a friendly message (used by calls the renderer awaits directly).
async function friendly(promise) {
  try {
    return await promise;
  } catch (err) {
    throw new Error(friendlyError(err), { cause: err });
  }
}

function reset() {
  client = undefined;
}

// Tests a connection with one tiny real request, so the key, the model, the speed tier and the
// reasoning effort are all checked together. Any value not given uses the current setting.
// Costs a fraction of a cent. Never throws.
async function testConnection(values = {}) {
  const current = settings.get();
  const v = { ...current, ...Object.fromEntries(Object.entries(values).filter(([, x]) => x)) };
  const via = tailorbid.clientOptions();
  if (!via) return { ok: false, error: NOT_CONNECTED };
  const t0 = Date.now();
  try {
    const client = new OpenAI({ ...via, maxRetries: 0, timeout: 20000 });
    await client.responses.create({
      model: v.model,
      input: 'Reply with OK.',
      reasoning: { effort: v.reasoningEffort },
      ...(v.serviceTier && { service_tier: v.serviceTier }),
      max_output_tokens: 16,
    });
    await client.models.retrieve(v.translateModel);
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    const message = String(err?.message || '');
    const error =
      tailorbidMessage(err) ||
      (err?.status === 401
        ? 'OpenAI rejected this key. Check that it was copied completely and is still active.'
        : err?.status === 404
          ? `The key works, but your account can't use "${/translate|luna/i.test(message) ? v.translateModel : v.model}". Check the model name.`
          : /service_tier/i.test(message)
            ? `The speed tier "${v.serviceTier}" isn't available for ${v.model}. Choose "priority" or "default".`
            : /reasoning|effort/i.test(message)
              ? `The reasoning effort "${v.reasoningEffort}" isn't supported by ${v.model}. Choose another one.`
              : friendlyError(err));
    return { ok: false, error };
  }
}

// Curly quotes and long dashes look machine-written when the answer is read or copied: use plain ones.
const plainTypography = (text) =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[—–]\s*/g, ', ');

// Why OpenAI stopped an answer early (response.incomplete), in words the candidate understands.
function incompleteMessage(reason) {
  if (reason === 'content_filter')
    return "OpenAI's content filter stopped this answer. Try asking again in other words.";
  if (reason === 'max_output_tokens')
    return 'The answer was too long and got cut off. Try a shorter answer length in Setup.';
  return 'OpenAI stopped the answer before it was finished. Try again.';
}

// Text of a finished non-streamed response. A failed or cut-off one throws instead of returning
// half a reply (which would be cached as a prepared answer, or break JSON.parse).
function completedText(result) {
  if (result.status === 'failed') throw new Error(result.error?.message || 'OpenAI could not finish this request.');
  if (result.status === 'incomplete') throw new Error(incompleteMessage(result.incomplete_details?.reason));
  return result.output_text || '';
}

// Reads a streamed answer, passing each piece of text to onDelta. Throws when OpenAI reports a failure,
// cuts the answer short, ends the stream without finishing it, or sends nothing for `idleMs`.
async function readAnswerStream(stream, onDelta, idleMs = STREAM_IDLE_MS) {
  const events = stream[Symbol.asyncIterator]();
  let timer;
  const idle = () =>
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('OpenAI stopped sending the answer. Try again.')), idleMs);
    });
  try {
    for (;;) {
      const { value: event, done } = await Promise.race([events.next(), idle()]);
      clearTimeout(timer);
      if (done) throw new Error('The answer stopped before it was finished. Try again.');
      if (event.type === 'response.output_text.delta') onDelta(plainTypography(event.delta));
      else if (event.type === 'response.completed') return;
      else if (event.type === 'response.incomplete')
        throw new Error(incompleteMessage(event.response?.incomplete_details?.reason));
      else if (event.type === 'response.failed')
        throw new Error(event.response?.error?.message || 'OpenAI could not finish this answer. Try again.');
      else if (event.type === 'error')
        throw new Error(event.message || 'OpenAI could not finish this answer. Try again.');
    }
  } finally {
    clearTimeout(timer);
  }
}

async function answer(id, { question, transcript, opener = '', profile, earlier = [] }, { onDelta, onDone, onError }) {
  // No suggestion for questions about how the candidate is answering (the app doesn't ask; this is a second check).
  if (asksAboutAnswering(question)) return onDone();
  const controller = new AbortController();
  running.set(id, controller);
  try {
    const { model, reasoningEffort, serviceTier } = settings.get();
    const [system, user] = answerMessages({ question, transcript, opener, profile, earlier });
    // Responses API: the fast service tiers (priority, ultrafast) are only fully supported here.
    const stream = await createCached(
      {
        model,
        instructions: system.content,
        input: user.content,
        reasoning: { effort: reasoningEffort }, // reasoning models ignore temperature
        ...(serviceTier && { service_tier: serviceTier }),
        stream: true,
      },
      { signal: controller.signal },
    );
    await readAnswerStream(stream, onDelta);
    onDone();
  } catch (err) {
    if (!controller.signal.aborted) onError(friendlyError(err));
  } finally {
    running.delete(id);
    controller.abort(); // closes the connection if the stream stalled or failed partway
  }
}

// One complete answer without streaming, at the standard (cheaper) speed tier.
// Used to prepare answers to common questions ahead of time, where speed doesn't matter.
async function generate(question, profile) {
  const { model, reasoningEffort } = settings.get();
  const [system, user] = answerMessages({ question, transcript: '', profile });
  const result = await createCached({
    model,
    instructions: system.content,
    input: user.content,
    reasoning: { effort: reasoningEffort },
  });
  return humanizeAnswer(plainTypography(completedText(result).trim()));
}

// A structured reply that must match a JSON schema (reports, project prep). Standard speed tier.
// `effort` overrides the reasoning effort for slower, deeper tasks.
async function json({ name, schema, instructions, input, effort }) {
  const { model, reasoningEffort } = settings.get();
  const result = await getClient().responses.create({
    model,
    instructions,
    input,
    reasoning: { effort: effort || reasoningEffort },
    text: { format: { type: 'json_schema', name, schema, strict: true } },
  });
  return JSON.parse(completedText(result));
}

// Translates one caption line. The previous line is passed as context only (not translated).
async function translate(text, language, context) {
  const result = await getClient().chat.completions.create({
    model: settings.get().translateModel,
    reasoning_effort: 'none', // plain translation needs no reasoning; keeps it fast
    messages: [
      {
        role: 'system',
        content: `You translate live job-interview captions from English into ${language}.
Output ONLY the translation of the TEXT, nothing else. Keep names, company names and technical terms
(React, SQL, AWS…) in English. Captions may have recognition errors: translate the intended meaning.`,
      },
      { role: 'user', content: `${context ? `PREVIOUS (context only): ${context}\n` : ''}TEXT: ${text}` },
    ],
  });
  return result.choices[0]?.message?.content?.trim() || '';
}

// Sends a tiny request that starts exactly like a real answer (instructions, resume, job description).
// This opens the connections (and TailorBid's, when connected) and fills OpenAI's prompt cache, so the next
// real answer starts about a second sooner. Costs a fraction of a cent. Errors are ignored; the real
// request will report them.
function warmup(profile) {
  const { model, reasoningEffort, serviceTier } = settings.get();
  const [system, user] = answerMessages({ question: '', profile });
  createCached({
    model,
    instructions: system.content,
    input: `${stablePart(user.content)}\nWarm-up request. Reply with OK.`,
    reasoning: { effort: reasoningEffort },
    ...(serviceTier && { service_tier: serviceTier }),
    max_output_tokens: 16,
  }).catch(() => {});
}

function cancel(id) {
  running.get(id)?.abort();
}

module.exports = {
  translate: (...args) => friendly(translate(...args)),
  generate: (...args) => friendly(generate(...args)),
  json: (...args) => friendly(json(...args)),
  answer,
  readAnswerStream,
  completedText,
  answerMessages,
  warmup,
  ping,
  testConnection,
  cancel,
  reset,
};
