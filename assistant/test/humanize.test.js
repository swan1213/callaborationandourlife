import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { humanizeAnswer, spokenAnswer } from '../src/answerFormat.js';

const require = createRequire(import.meta.url);
const { buildAnswerMessages } = require('../server/prompts.cjs');

const answer = (lines) => `ANSWER:\n${lines}\nKEY POINTS:\n- In order to ship\nMOOD: calm - warm`;

test('written-English words become plain spoken ones, keeping capital letters', () => {
  assert.equal(
    spokenAnswer(
      humanizeAnswer(answer('In order to fix it, we utilized Redis.\nI leveraged approximately ten tools.')),
    ),
    'To fix it, we used Redis.\nI used about ten tools.',
  );
  assert.equal(
    spokenAnswer(
      humanizeAnswer(answer("I'm passionate about testing.\nWe tried a wide range of tools prior to that.")),
    ),
    'I really like testing.\nWe tried all kinds of tools before that.',
  );
});

test('stock openers are dropped or made casual, after a [cue] too', () => {
  const text = humanizeAnswer(
    answer(
      'Great question.\n[smile] Additionally, we wrote tests.\nOverall, it went well.\nAbsolutely, I can do that.\nIt is worth noting that we had no QA.',
    ),
  );
  assert.equal(spokenAnswer(text), '[smile] Also, we wrote tests.\nIt went well.\nYeah, I can do that.\nWe had no QA.');
});

test('long forms are contracted only where the short form stays correct', () => {
  assert.equal(
    spokenAnswer(humanizeAnswer(answer('I am not sure. It is really fast. We did not know.'))),
    "I'm not sure. It's really fast. We didn't know.",
  );
  // Contracting these would be wrong English.
  assert.equal(
    spokenAnswer(humanizeAnswer(answer("That's what it is. Yes, I am. I know who they are."))),
    "That's what it is. Yes, I am. I know who they are.",
  );
});

test('a semicolon starts a new sentence line', () => {
  assert.equal(spokenAnswer(humanizeAnswer(answer('It was slow; we fixed it.'))), 'It was slow.\nWe fixed it.');
});

test('a sentence too long to say in one breath is split at ", and" / ", but" / ", so"', () => {
  assert.equal(
    spokenAnswer(
      humanizeAnswer(
        answer(
          "I didn't want to just say no to the designer, so I showed them the accessibility check and two close options.",
        ),
      ),
    ),
    "I didn't want to just say no to the designer.\nSo I showed them the accessibility check and two close options.",
  );
  // Short sentences, long ones without a natural break, questions, and a missing subject stay as they are.
  for (const kept of [
    'It was slow, and we fixed it.',
    'We used the React Profiler and the browser tools to see whether the page was rendering far too often.',
    'How is the frontend team set up, and how do engineers usually work with product and design?',
    'I helped move a patient portal from Vue to React, and worked closely with two designers on accessibility fixes.',
  ]) {
    assert.equal(spokenAnswer(humanizeAnswer(answer(kept))), kept);
  }
});

test('only the ANSWER section changes, and paragraphs stay apart', () => {
  const text = humanizeAnswer(answer('Great question.\nSo it was fine.\n\nIn order to ship, we cut scope.'));
  assert.match(text, /KEY POINTS:\n- In order to ship\nMOOD: calm - warm$/);
  assert.equal(spokenAnswer(text), 'So it was fine.\n\nTo ship, we cut scope.');
});

test('works on a partial answer while it streams in', () => {
  assert.equal(humanizeAnswer('ANSWER:\nIn order to'), 'ANSWER:\nTo');
  assert.equal(humanizeAnswer('ANSWER:\nAdditionally'), 'ANSWER:\nAdditionally'); // no comma yet: wait
  assert.equal(humanizeAnswer('ANSWER:\nGreat questions are rare'), 'ANSWER:\nGreat questions are rare');
  assert.equal(humanizeAnswer(''), '');
});

test('text without sections is rewritten whole; other sections alone are kept', () => {
  assert.equal(humanizeAnswer('We utilized it.'), 'We used it.');
  assert.equal(humanizeAnswer('MOOD: in order to'), 'MOOD: in order to');
});

test('the prompt shows a whole human answer and bans scripted idioms and STAR labels', () => {
  const [system] = buildAnswerMessages({ question: 'Why us?' });
  assert.match(system.content, /A whole answer that sounds right/);
  assert.match(system.content, /never name its parts/);
  assert.match(system.content, /hit the ground running/);
});
