import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAnswerMessages } = require('../server/prompts.cjs');

test('the answer prompt requires every question in the turn to be answered', () => {
  const [system, user] = buildAnswerMessages({ question: 'Can you hear me? So tell me about yourself.' });
  assert.match(system.content, /ANSWER EVERY QUESTION/);
  assert.match(system.content, /in the order they were asked/);
  assert.match(
    user.content,
    /TURN TO ANSWER NOW \(may hold several questions; answer every one\):\nCan you hear me\? So tell me about yourself\./,
  );
});

test('the answer prompt keeps its output format for the app', () => {
  const [system] = buildAnswerMessages({ question: 'Why us?' });
  assert.match(system.content, /ANSWER:\n<the spoken answer/);
  assert.match(system.content, /KEY POINTS:/);
  assert.match(system.content, /MOOD:/);
  assert.match(system.content, /MEANING:/);
});

test('the answer continues from the opener the candidate already said', () => {
  const [, withOpener] = buildAnswerMessages({ question: 'Why this role?', opener: 'Hmm, a few reasons, really…' });
  assert.match(withOpener.content, /ALREADY STARTED WITH: "Hmm, a few reasons, really…"/);
  assert.match(withOpener.content, /don't repeat them/);
  const [, without] = buildAnswerMessages({ question: 'Why this role?' });
  assert.doesNotMatch(without.content, /ALREADY STARTED/);
});
