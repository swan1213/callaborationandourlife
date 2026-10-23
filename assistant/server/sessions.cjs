const fs = require('node:fs');
const { dataFile } = require('./paths.cjs');
const tailorbid = require('./tailorbid.cjs');
// The same answer parser the app uses (an ES module; Node loads it with require() since 20.19).
const { parseAnswer, spokenAnswer } = require('../src/answerFormat.js');

// Interviews are saved to Interview History in TailorBid, where they are reviewed and exported:
// admins see everyone's, users and callers their own. Nothing is kept on this PC.

// The recording as TailorBid stores it: each answer split into its sections.
function toTailorbid(s) {
  return {
    id: s.id,
    company: s.company,
    role: s.role,
    stage: s.stage,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    captions: s.captions.map((c) => ({ t: c.t, text: c.text, translation: c.translation || '' })),
    answers: s.answers.map((a) => {
      const p = parseAnswer(a.text);
      return {
        t: a.t,
        question: a.question,
        source: a.source,
        answer: spokenAnswer(a.text),
        keyPoints: p.keyPoints,
        meaning: p.meaning,
        mood: p.mood,
      };
    }),
  };
}

// Saves (again) the interview being recorded. { saved: false } when not connected to TailorBid.
async function save(session) {
  const result = await tailorbid.request('PUT', '/api/assistant/sessions', toTailorbid(session));
  return { saved: Boolean(result) };
}

// Drops a recording in which nothing was heard or answered.
async function remove(id) {
  await tailorbid.request('DELETE', `/api/assistant/sessions?id=${encodeURIComponent(id)}`);
}

// Interviews saved on this PC by earlier versions, when History was part of the assistant.
function clearAll() {
  fs.rmSync(dataFile('sessions'), { recursive: true, force: true });
}

module.exports = { save, remove, clearAll, toTailorbid };
