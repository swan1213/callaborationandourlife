import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftDelay,
  extendsQuestion,
  looksLikeQuestion,
  openQuestionBefore,
  parseAnswer,
  parseFileRefs,
  questionPart,
  sameQuestion,
  turnLines,
} from '../src/questions.js';
import { matchCommonQuestion, openerFor } from '../src/commonQuestions.js';

test('looksLikeQuestion finds questions, including ones that start with "So," / "Okay,"', () => {
  for (const q of [
    'So can you tell me why you want to work here',
    'Okay, great, tell me about yourself',
    'And why did you leave your last job',
    'Alright so walk me through your resume',
    'Great. Now, what is your biggest weakness',
    'Is this working?',
  ]) {
    assert.equal(looksLikeQuestion(q), true, q);
  }
});

test('looksLikeQuestion ignores statements and tiny fragments', () => {
  for (const s of ['Thanks for joining us today', 'So we are a small team based in Berlin', 'Okay']) {
    assert.equal(looksLikeQuestion(s), false, s);
  }
});

test('questionPart finds a question mid-sentence in unpunctuated running speech', () => {
  assert.equal(
    questionPart("that's great so tell me how you handled the database migration"),
    'tell me how you handled the database migration',
  );
  assert.equal(questionPart('We use React. So what is your experience with it'), 'So what is your experience with it');
  assert.equal(questionPart('Thanks. Can you hear me'), 'Can you hear me');
  assert.equal(looksLikeQuestion('okay perfect and could you walk me through your last project'), true);
  for (const s of [
    'we would like to tell you about the role',
    'let me explain how the process works',
    'So we are a small team',
  ]) {
    assert.equal(questionPart(s), '', s);
  }
});

test('extendsQuestion: the speaker kept going (the last word may have been finished or fixed)', () => {
  assert.equal(extendsQuestion('Tell me about your experi', 'Tell me about your experience with React'), true);
  assert.equal(extendsQuestion('Tell me about your', 'Tell me about your last project'), true);
  assert.equal(extendsQuestion('Tell me about your team', 'Why did you leave'), false);
  assert.equal(extendsQuestion('Tell me about your last project', 'Tell me about'), false);
});

test('parseAnswer reads sections in any order, and while streaming', () => {
  const full = parseAnswer(
    'ANSWER:\nYeah, so.\n\nSecond.\nKEY POINTS:\n- a\nFILES:\n- src/a.js | foo\nMOOD: Friendly - warm\nMEANING: m',
  );
  assert.equal(full.answer, 'Yeah, so.\n\nSecond.');
  assert.equal(full.keyPoints, '- a');
  assert.equal(full.mood, 'Friendly - warm');
  assert.equal(full.meaning, 'm');
  assert.equal(parseAnswer('ANSWER:\nYeah, so I').answer, 'Yeah, so I');
  assert.equal(parseAnswer('MOOD: x\nMEANING: y\nANSWER:\nOld order.').answer, 'Old order.');
});

test('parseFileRefs reads "path | symbol" lines and ignores "none"', () => {
  assert.deepEqual(parseFileRefs('- src/store/cart.js | useCartStore()\n- `src/api.js` | fetchItems'), [
    { path: 'src/store/cart.js', symbol: 'useCartStore' },
    { path: 'src/api.js', symbol: 'fetchItems' },
  ]);
  assert.deepEqual(parseFileRefs('none'), []);
});

test('sameQuestion keeps a draft only when the finished question adds nothing but filler', () => {
  assert.equal(sameQuestion('Can you tell me about yourself', 'Can you tell me about yourself?'), true);
  assert.equal(sameQuestion('Can you tell me about yourself', 'Can you tell me about yourself please?'), true);
  assert.equal(sameQuestion('Can you tell me about', 'Can you tell me about your biggest weakness?'), false);
  assert.equal(sameQuestion('Why do you want to work hear', 'Why do you want to work here?'), false);
});

test('matchCommonQuestion matches common questions and nothing else', () => {
  const cases = {
    'So can you tell me a little bit about yourself?': 'about-yourself',
    'Walk me through your resume': 'about-yourself',
    'Why do you want to work here': 'why-company',
    'What are your strengths and weaknesses?': 'strengths-weaknesses',
    'What would you say is your biggest weakness': 'weakness',
    'Where do you see yourself in five years?': 'five-years',
    'Do you have any questions for us?': 'questions-for-us',
    // Must not match: a wrong instant answer is worse than a short wait.
    'Tell me about your experience with GraphQL': null,
    'Tell me about your background in data engineering': null,
    'Our salary bands are posted online': null,
    'Why did you choose React over Vue in that project?': null,
  };
  for (const [text, id] of Object.entries(cases)) {
    assert.equal(matchCommonQuestion(text)?.id ?? null, id, text);
  }
});

test('openerFor always gives something to say', () => {
  assert.ok(openerFor('What is your biggest weakness?').length > 0);
  assert.ok(openerFor('Completely unexpected question').length > 0);
});

test('openerFor fits the kind of question', () => {
  const pick = (q) => openerFor(q, [], () => 0); // the first choice of its pool
  assert.match(pick('Tell me about yourself'), /^Sure/);
  assert.match(pick('Tell me about a time you disagreed with a teammate'), /good one/);
  assert.match(pick('What are your salary expectations?'), /^Sure\. So/);
  assert.match(pick('Can you explain the difference between REST and GraphQL?'), /basically/);
  assert.doesNotMatch(pick('What is your availability to start?'), /basically/);
});

test('openerFor never repeats a recent opener or the same first word twice in a row', () => {
  const recent = [];
  let seed = 7;
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const questions = ['Where are you based?', 'Why this role?', 'How did you handle on-call?', 'Any questions for us?'];
  for (let i = 0; i < 40; i++) {
    const opener = openerFor(questions[i % questions.length], recent.slice(-6), random);
    assert.ok(!recent.slice(-6).includes(opener), `repeated "${opener}"`);
    if (recent.length) {
      const first = (s) => s.toLowerCase().match(/[a-z']+/)[0];
      assert.notEqual(first(opener), first(recent.at(-1)), `"${recent.at(-1)}" then "${opener}"`);
    }
    recent.push(opener);
  }
  assert.ok(new Set(recent).size >= 10, 'openers vary over an interview');
});

test('draftDelay: no draft until the words ask something', () => {
  const none = { key: '', draft: false };
  assert.equal(draftDelay('yeah that sounds great', none, 5000), null);
  assert.equal(draftDelay('so can you', none, 5000), null); // too short to answer yet
});

test('draftDelay: a clear new question is answered at once, a short one at the next small pause', () => {
  const none = { key: '', draft: false };
  assert.equal(draftDelay('so can you tell me about your last project', none, 5000), 0);
  assert.equal(draftDelay('why did you leave', none, 5000), 250);
});

test('draftDelay: a growing question is redrafted, but never more often than the minimum gap', () => {
  const current = { key: 'can you tell me about', draft: true };
  // One more word: update at the next short pause.
  assert.equal(draftDelay('can you tell me about your', current, 5000), 250);
  // Four or more new words: redraft about every 1.5 s.
  assert.equal(draftDelay('can you tell me about your biggest project at work', current, 500), 1000);
  assert.equal(draftDelay('can you tell me about your biggest project at work', current, 5000), 0);
  // Even a brand-new question waits until 700 ms have passed since the last draft.
  assert.equal(draftDelay('what are your salary expectations for this role', current, 200), 500);
});

test('small questions count even before Live Captions adds the "?"', () => {
  for (const q of [
    "How's your day going",
    "What's the weather like there",
    "Where's home for you",
    'Is that okay with you',
    'Any questions for us',
    'Anything else you want to add',
    'Does that make sense',
    'Are we good to start',
    'Should we get started',
    'Can I ask where you are based',
    'So is it raining there',
  ]) {
    assert.ok(looksLikeQuestion(q), q);
  }
  for (const s of ['Let me explain the role', 'I think that is great', 'Thanks so much for your time', 'Okay great']) {
    assert.ok(!looksLikeQuestion(s), s);
  }
});

const lines = (...texts) => texts.map((text, i) => ({ id: i + 1, text }));

test('turnLines: a turn with several questions sends all of them, not just the last line', () => {
  const segs = lines('Thanks for that answer.', 'Can you hear me okay?', 'Great.');
  const turn = turnLines(segs, { id: 4, text: 'So tell me about yourself.' }, 1);
  assert.deepEqual(
    turn.map((s) => s.text),
    ['Can you hear me okay?', 'Great.', 'So tell me about yourself.'],
  );
});

test('turnLines: a question whose answer never finished is carried into the next answer', () => {
  const segs = lines('Where are you based?', 'And how much notice do you need?');
  // Nothing finished yet (answeredUpTo 0): the first question is still open.
  assert.deepEqual(
    turnLines(segs, { id: 3, text: 'Also, are you open to travel?' }, 0).map((s) => s.id),
    [1, 2, 3],
  );
});

test('turnLines: when everything before was answered, only the previous line is added', () => {
  const segs = lines('Where are you based?', 'So tell me about');
  assert.deepEqual(
    turnLines(segs, { id: 3, text: 'your last project.' }, 2).map((s) => s.id),
    [2, 3],
  );
});

test('turnLines: a long monologue keeps only its last lines', () => {
  const segs = lines('One.', 'Two.', 'Three.', 'Four.', 'Five.');
  assert.deepEqual(
    turnLines(segs, { id: 6, text: 'Any questions?' }, 0).map((s) => s.id),
    [3, 4, 5, 6],
  );
});

test('openQuestionBefore: an unanswered question earlier in the turn blocks a prepared answer', () => {
  const segs = lines('Can you hear me okay?', 'Great, thanks.');
  const line = { id: 3, text: 'Tell me about yourself.' };
  assert.equal(openQuestionBefore(segs, line, 0), true);
  assert.equal(openQuestionBefore(segs, line, 1), false); // already answered
});
