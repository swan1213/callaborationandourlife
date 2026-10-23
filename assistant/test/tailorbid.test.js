import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Server modules read IA_DATA_DIR when they load: point it at a temp folder first, never the real data.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-tailorbid-'));
process.env.IA_DATA_DIR = dataDir;
const require = createRequire(import.meta.url);
let settings, tailorbid;
const realFetch = globalThis.fetch;

// A token TailorBid would sign (only its expiry is read here) and what /api/assistant/context returns.
const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.y`;
let context;

before(() => {
  settings = require('../server/settings.cjs');
  tailorbid = require('../server/tailorbid.cjs');
  globalThis.fetch = async () => new Response(JSON.stringify(context), { status: 200 });
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const link = { origin: 'http://localhost:3000', token };
const interview = (id) => ({ id, company: `Company ${id}`, jobTitle: 'Engineer', step: 1, candidate: 'Ana' });

test('opening for an interview replaces everything left from the last one', async () => {
  settings.save({
    profile: { resume: 'old resume', jobDescription: 'old job', customPrompt: 'old notes', tone: 'formal' },
    activeProjectId: 'p1',
    activeProjectName: 'Old project',
  });
  context = { user: { name: 'Caller' }, interview: interview('a'), resume: 'resume A', jobDescription: 'job A' };
  await tailorbid.connect(link);

  const s = settings.get();
  assert.equal(s.profile.resume, 'resume A');
  assert.equal(s.profile.jobDescription, 'job A');
  assert.equal(s.profile.customPrompt, '');
  assert.equal(s.profile.tone, 'formal'); // preferences stay
  assert.equal(s.activeProjectId, null);
  assert.equal(settings.getPublic().tailorbid.interview.id, 'a');
});

test('opening without an interview clears the last interview fields', async () => {
  const before = settings.get().tailorbid.connectedAt;
  context = { user: { name: 'Caller' }, interview: null, resume: '', jobDescription: '' };
  await new Promise((r) => setTimeout(r, 5));
  await tailorbid.connect(link);

  const s = settings.get();
  assert.equal(s.profile.resume, '');
  assert.equal(s.profile.jobDescription, '');
  assert.notEqual(s.tailorbid.connectedAt, before); // the app reloads its fields
});

test('reload keeps your instructions and only refreshes resume and job', async () => {
  context = { user: { name: 'Caller' }, interview: interview('b'), resume: 'resume B', jobDescription: 'job B' };
  await tailorbid.connect(link);
  settings.save({ profile: { customPrompt: 'mention AWS' } });
  context = { ...context, resume: 'resume B v2' };
  await tailorbid.refresh();

  const s = settings.get();
  assert.equal(s.profile.resume, 'resume B v2');
  assert.equal(s.profile.customPrompt, 'mention AWS');
});

test('disconnect clears the interview fields', () => {
  tailorbid.disconnect();
  const s = settings.get();
  assert.equal(s.tailorbid, null);
  assert.equal(s.profile.resume, '');
  assert.equal(s.profile.customPrompt, '');
});

test('without a TailorBid connection nothing reaches OpenAI, not even with a personal key', async () => {
  tailorbid.disconnect();
  const ai = require('../server/ai.cjs');
  ai.reset();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('{}');
  };
  const test = await ai.testConnection({ apiKey: 'sk-not-a-real-key' });
  assert.equal(test.ok, false);
  assert.match(test.error, /TailorBid/);
  await assert.rejects(ai.translate('Hello', 'Spanish'), /TailorBid/);
  assert.equal(calls, 0);
  assert.equal(settings.getPublic().hasApiKey, false);
});
