import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asksAboutAnswering } from '../src/selfAnswer.js';

test('questions about how the candidate is answering get no suggestion', () => {
  for (const q of [
    // From a real interview
    "You're not speaking as I do hundreds of interviews a month and you're not really speaking as usual candidates would speak when talking about their own experience. So I just it sounds like you might be using AI to answer the questions or reading. Are you reading from a screen at all",
    "OK, you're just you're not speaking as I do. OK. Are you using AI to answer these questions? OK.",
    'OK are you using? OK. Are you using AI to answer these questions',
    'Are you using ChatGPT right now?',
    'Did you get help from an AI tool for that answer?',
    'Are you reading from a script?',
    'Are you looking at something on another screen?',
    'Is someone else in the room helping you?',
    'Those sound like AI-generated answers.',
    "It sounds like you're reading.",
  ]) {
    assert.equal(asksAboutAnswering(q), true, q);
  }
});

test('questions about AI as a skill are normal questions', () => {
  for (const q of [
    'How do you use AI tools in your day-to-day work?',
    "We encourage all our engineers to incorporate AI into their workflows. What's your experience with Copilot?",
    'Have you used ChatGPT or Claude to build any features?',
    'Tell me about a time you had to read code from another team.',
    'How do you handle on-call incidents?',
    'Do you have any questions for us?',
  ]) {
    assert.equal(asksAboutAnswering(q), false, q);
  }
});

test('the server writes nothing for them either', async () => {
  const { createRequire } = await import('node:module');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');
  process.env.IA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-self-'));
  const ai = createRequire(import.meta.url)('../server/ai.cjs');
  const result = await new Promise((resolve) =>
    ai.answer(
      'x',
      { question: 'Are you using AI to answer these questions?', transcript: '', profile: {} },
      {
        onDelta: () => resolve('wrote text'),
        onDone: () => resolve('done, nothing written'),
        onError: (e) => resolve(`error: ${e}`),
      },
    ),
  );
  assert.equal(result, 'done, nothing written');
});
