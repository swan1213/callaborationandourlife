import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spokenAnswer } from '../src/answerFormat.js';

process.env.IA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-answers-'));
const require = createRequire(import.meta.url);
const { readAnswerStream, completedText } = require('../server/ai.cjs');

// A fake OpenAI stream: yields the given events, then optionally never ends.
async function* events(list, { hang = false } = {}) {
  for (const e of list) yield e;
  if (hang) await new Promise(() => {});
}
const delta = (text) => ({ type: 'response.output_text.delta', delta: text });

async function read(list, opts) {
  let text = '';
  await readAnswerStream(events(list, opts), (d) => (text += d), 50);
  return text;
}

test('spokenAnswer is the ANSWER section, or the whole text when there are no sections', () => {
  assert.equal(spokenAnswer('ANSWER:\nYeah.\nMOOD: calm'), 'Yeah.');
  assert.equal(spokenAnswer('  Just text.  '), 'Just text.');
});

test('a finished stream passes on its text, with plain quotes and dashes', async () => {
  const text = await read([delta('It’s fine'), delta(' — really'), { type: 'response.completed' }]);
  assert.equal(text, "It's fine, really");
});

test('a stream that ends without finishing is an error, not a short answer', async () => {
  await assert.rejects(read([delta('Half an ans')]), /stopped before it was finished/);
});

test('a failed or cut-off answer reports why', async () => {
  await assert.rejects(
    read([delta('So'), { type: 'response.failed', response: { error: { message: 'Server overloaded' } } }]),
    /Server overloaded/,
  );
  await assert.rejects(
    read([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }]),
    /content filter/,
  );
  await assert.rejects(read([{ type: 'error', message: 'Rate limited' }]), /Rate limited/);
});

test('a stream that goes silent gives up instead of hanging', async () => {
  const started = Date.now();
  await assert.rejects(read([delta('So')], { hang: true }), /stopped sending/);
  assert.ok(Date.now() - started < 1000);
});

test('completedText refuses half-finished replies', () => {
  assert.equal(completedText({ status: 'completed', output_text: '{"a":1}' }), '{"a":1}');
  assert.throws(
    () => completedText({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
    /too long/,
  );
  assert.throws(() => completedText({ status: 'failed', error: { message: 'Boom' } }), /Boom/);
});
