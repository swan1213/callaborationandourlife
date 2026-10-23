import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Server modules read IA_DATA_DIR when they load: point it at a temp folder first, never the real data.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-storage-'));
process.env.IA_DATA_DIR = dataDir;
for (const name of [
  'OPENAI_API_KEY',
  'ASSISTANT_MODEL',
  'ASSISTANT_REASONING_EFFORT',
  'ASSISTANT_TRANSLATE_MODEL',
  'ASSISTANT_SERVICE_TIER',
]) {
  delete process.env[name];
}
const require = createRequire(import.meta.url);
let paths, settings, sessions;

before(() => {
  paths = require('../server/paths.cjs');
  settings = require('../server/settings.cjs');
  sessions = require('../server/sessions.cjs');
});
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

/* ---------- writeJson ---------- */

test('writeJson replaces a file and leaves no temp file behind', () => {
  const file = path.join(dataDir, 'nested', 'a.json');
  paths.writeJson(file, { v: 1 });
  paths.writeJson(file, { v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['a.json']);
});

test('writeJson keeps the old file when the write fails', () => {
  const file = path.join(dataDir, 'b.json');
  paths.writeJson(file, { v: 1 });
  fs.mkdirSync(`${file}.tmp`); // the temp file can't be written
  assert.throws(() => paths.writeJson(file, { v: 2 }));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 1 });
  fs.rmdirSync(`${file}.tmp`);
});

/* ---------- settings ---------- */

test('connection settings: set in app beats .env, which beats the default', () => {
  assert.equal(settings.get().model, 'gpt-5.6-terra');
  assert.equal(settings.getPublic().sources.model, 'default');

  process.env.ASSISTANT_MODEL = 'env-model';
  assert.equal(settings.get().model, 'env-model');
  assert.equal(settings.getPublic().sources.model, 'env');

  settings.saveConnection({ model: 'app-model' });
  assert.equal(settings.get().model, 'app-model');
  assert.equal(settings.getPublic().sources.model, 'app');

  settings.saveConnection({ model: '' }); // Reset
  assert.equal(settings.get().model, 'env-model');
  delete process.env.ASSISTANT_MODEL;
});

test(
  'the API key is never written as plain text on Windows, nor sent to the app',
  { skip: process.platform !== 'win32' && 'DPAPI is Windows only' },
  () => {
    settings.saveConnection({ apiKey: 'sk-test-secret-1234' });
    assert.equal(settings.get().apiKey, 'sk-test-secret-1234');
    assert.ok(!fs.readFileSync(settings.location(), 'utf8').includes('sk-test-secret-1234'));

    const pub = settings.getPublic();
    assert.equal(pub.apiKey, undefined);
    // A key saved by an older version gives no access: only a TailorBid connection does.
    assert.equal(pub.hasApiKey, false);

    settings.saveConnection({ apiKey: '' });
    assert.equal(settings.get().apiKey, '');
  },
);

test('profile changes merge with the saved profile and survive a reload', () => {
  settings.save({ profile: { tone: 'formal' } });
  settings.save({ profile: { answerLength: 'short' } });
  const saved = JSON.parse(fs.readFileSync(settings.location(), 'utf8'));
  assert.equal(saved.profile.tone, 'formal');
  assert.equal(saved.profile.answerLength, 'short');
  assert.equal(saved.profile.englishLevel, 'intermediate'); // defaults kept
});

/* ---------- sessions ---------- */

const START = Date.UTC(2026, 9, 18, 10, 0, 0);
const session = (over = {}) => ({
  id: `${START}-abc123`,
  company: 'Acme',
  role: 'Frontend developer',
  stage: 'technical',
  startedAt: START,
  endedAt: START + 30 * 60000,
  captions: [{ id: 1, t: START + 5000, text: 'Tell me about yourself.', translation: 'Cuéntame de ti.' }],
  answers: [
    {
      t: START + 65000,
      question: 'Tell me about yourself.',
      source: 'live',
      text: 'ANSWER:\nYeah, so I build React apps.\nKEY POINTS:\n- React\nMOOD: Friendly - warm\nMEANING: Who are you?',
    },
  ],
  report: null,
  ...over,
});

test('sessions go to TailorBid with each answer split into its sections', () => {
  const out = sessions.toTailorbid(session());
  assert.equal(out.id, `${START}-abc123`);
  assert.equal(out.company, 'Acme');
  assert.deepEqual(out.captions, [
    { t: START + 5000, text: 'Tell me about yourself.', translation: 'Cuéntame de ti.' },
  ]);
  assert.deepEqual(out.answers, [
    {
      t: START + 65000,
      question: 'Tell me about yourself.',
      source: 'live',
      answer: 'Yeah, so I build React apps.',
      keyPoints: '- React',
      meaning: 'Who are you?',
      mood: 'Friendly - warm',
    },
  ]);
});

test('an answer without sections is sent as it is', () => {
  const out = sessions.toTailorbid(
    session({ answers: [{ t: START, question: 'Hi?', source: 'prepared', text: 'Just a plain answer.' }] }),
  );
  assert.equal(out.answers[0].answer, 'Just a plain answer.');
  assert.equal(out.answers[0].source, 'prepared');
});

test('without a TailorBid connection nothing is sent and the session is not saved', async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}');
  };
  try {
    assert.deepEqual(await sessions.save(session()), { saved: false });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
