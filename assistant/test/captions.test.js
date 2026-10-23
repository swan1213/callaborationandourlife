import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newText, splitSentences } from '../src/captionDiff.js';

test('splitSentences splits on sentence endings and line breaks', () => {
  assert.deepEqual(splitSentences('Hi there. How are you?\nGood'), ['Hi there.', 'How are you?', 'Good']);
});

test('newText returns only what was added since the last commit', () => {
  const before = 'That was perfect. Nice to meet you.\nThank you.';
  const after = `${before}\nCan you tell me about yourself?`;
  assert.equal(newText(before, after), 'Can you tell me about yourself?');
});

test('newText ignores lines that scrolled out of the Live Captions window', () => {
  assert.equal(
    newText('Nice to meet you. Thank you. Ready?', 'Thank you. Ready?\nWhat brings you here?'),
    'What brings you here?',
  );
});

test('newText returns nothing when nothing changed', () => {
  assert.equal(newText('A b. C d?', 'A b. C d?'), '');
});

test('newText picks up a sentence that was unfinished at the last commit', () => {
  const before = 'Hi there. Thanks for joining us today. Can you tell me about';
  const after = 'Hi there. Thanks for joining us today. Can you tell me about yourself?';
  assert.equal(newText(before, after), 'Can you tell me about yourself?');
});

test('newText treats everything as new on the first read', () => {
  assert.equal(newText('', 'Hello there. Ready?'), 'Hello there. Ready?');
});

test('newText is not fooled by an old sentence repeated later', () => {
  const before = 'Old stuff. Thanks for joining us today. Can you tell me about yourself?';
  const after = `${before}\nThanks for joining us today. So, why do you want to work here?`;
  assert.equal(newText(before, after), 'Thanks for joining us today. So, why do you want to work here?');
});

test('newText is not fooled by a short repeated word', () => {
  assert.equal(
    newText('We use React. Great.', 'We use React. Great.\nTell me about yourself? Great.'),
    'Tell me about yourself? Great.',
  );
});

// Live Captions re-punctuates text it already showed, so none of the last committed sentences match
// exactly any more. Only the new words may come out, never the whole caption window again.
const EARLIER = 'Where are you currently based? OK and what is your availability to start a new role? OK and then. ';
test('newText survives Live Captions re-punctuating the sentences it already showed', () => {
  const before = `${EARLIER}Are you a Canadian citizen? All right, perfect. That's everything from me. So as part of our recruitment process, we go through three stages after today next step would be meeting with`;
  const after = `${EARLIER}Are you a Canadian citizen, all right? Perfect, that's everything from me so as part of our recruitment process. We go through three stages after today, next step would be meeting with the hiring managers. This would be our engineering manager.`;
  const text = newText(before, after);
  assert.ok(!text.includes('Canadian') && !text.includes('availability'), text);
  assert.match(text, /hiring managers\. This would be our engineering manager\.$/);
});

test('newText survives a re-punctuated window when the speaker only extends the last sentence', () => {
  const before = `${EARLIER}All right, perfect. That's everything from me. So as part of our process, we go through three stages`;
  const after = `${EARLIER}All right. Perfect, that's everything from me. So as part of our process, we go through three stages after today.`;
  // The unfinished sentence comes back whole, so the caption line is revised instead of repeated.
  assert.equal(newText(before, after), 'So as part of our process, we go through three stages after today.');
});

test('newText still treats text as new after everything scrolled away', () => {
  assert.equal(
    newText('Tell me about yourself. I am a developer.', 'What is your biggest strength? Let us talk about it.'),
    'What is your biggest strength? Let us talk about it.',
  );
});
