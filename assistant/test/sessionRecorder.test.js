import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRecorder } from '../src/sessionRecorder.js';

// A recorder whose saves are recorded (copies, so later changes don't leak in) and can be made to fail.
function setup() {
  let clock = 1000;
  const saves = [];
  const removed = [];
  const state = { failSave: false };
  const recorder = createSessionRecorder({
    save: async (s) => {
      if (state.failSave) throw new Error('disk full');
      saves.push(structuredClone(s));
    },
    remove: async (id) => removed.push(id),
    now: () => clock,
  });
  return { recorder, saves, removed, state, tick: (ms) => (clock += ms) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('a rewritten caption line updates its entry instead of adding one', () => {
  const { recorder } = setup();
  recorder.begin({ company: 'Acme' });
  recorder.recordCaption(1, 'How do you');
  recorder.recordTranslation(1, '¿Cómo');
  recorder.recordCaption(1, 'How do you handle conflict?');
  recorder.recordCaption(2, 'Take your time.');
  assert.deepEqual(
    recorder.session.captions.map((c) => [c.id, c.text, c.translation]),
    [
      [1, 'How do you handle conflict?', undefined], // the old translation no longer fits
      [2, 'Take your time.', undefined],
    ],
  );
});

test('nothing is recorded before an interview starts', () => {
  const { recorder } = setup();
  recorder.recordCaption(1, 'Hello');
  recorder.recordAnswer('Q', 'A', 'live');
  assert.equal(recorder.session, null);
});

test('flush saves only when something changed, and retries after a failed save', async () => {
  const { recorder, saves, state } = setup();
  recorder.begin();
  recorder.flush();
  recorder.flush(); // nothing new
  await settle();
  assert.equal(saves.length, 1);

  state.failSave = true;
  recorder.recordAnswer('Why us?', 'ANSWER:\nBecause.', 'live');
  recorder.flush();
  await settle();
  state.failSave = false;
  recorder.flush(); // still unsaved: tried again
  await settle();
  assert.equal(saves.length, 2);
  assert.equal(saves[1].answers[0].question, 'Why us?');
});

test('finish keeps an interview with content and records when it ended', async () => {
  const { recorder, saves, tick } = setup();
  recorder.begin({ company: 'Acme', role: 'Dev', stage: 'hr' });
  recorder.recordCaption(1, 'Tell me about yourself.');
  tick(60000);
  const s = await recorder.finish();
  assert.equal(s.endedAt - s.startedAt, 60000);
  assert.equal(saves.at(-1).company, 'Acme');
  assert.equal(recorder.session, null);
  assert.equal(await recorder.finish(), null); // already finished
});

test('finish deletes an empty interview instead of keeping it', async () => {
  const { recorder, removed } = setup();
  recorder.begin();
  const id = recorder.session.id;
  assert.equal(await recorder.finish(), null);
  assert.deepEqual(removed, [id]);
});

test('finish rejects when the final save fails, so the app can say so', async () => {
  const { recorder, state } = setup();
  recorder.begin();
  recorder.recordAnswer('Q', 'A', 'live');
  state.failSave = true;
  await assert.rejects(recorder.finish(), /disk full/);
});
