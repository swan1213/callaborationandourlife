const crypto = require('node:crypto');
const fs = require('node:fs');
const { dataFile, writeJson } = require('./paths.cjs');
const ai = require('./ai.cjs');

// Answers to common interview questions, generated once per profile and kept on disk, so they can
// be shown instantly during the interview. Regenerated when the profile, model or prompt changes.
const file = () => dataFile('prepared-answers.json');

function cacheKey(profile, questions) {
  const [system] = ai.answerMessages({ question: '', profile });
  const data = JSON.stringify({
    system: system.content,
    profile,
    questions,
    model: require('./settings.cjs').get().model,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return {};
  }
}

let inFlight = null; // { key, promise }

// questions: [{ id, question }]. Resolves to { [id]: answerText }; failed ones are left out.
function prepare(profile, questions) {
  const key = cacheKey(profile, questions);
  const cached = readCache();
  if (cached.key === key) return Promise.resolve(cached.answers);
  if (inFlight?.key === key) return inFlight.promise;

  const promise = Promise.allSettled(questions.map((q) => ai.generate(q.question, profile))).then((results) => {
    const answers = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) answers[questions[i].id] = r.value;
    });
    // Only cache a complete set, so a network hiccup doesn't leave gaps until the profile changes.
    if (Object.keys(answers).length === questions.length) {
      writeJson(file(), { key, answers });
    }
    return answers;
  });
  inFlight = { key, promise };
  promise.finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  return promise;
}

function clear() {
  fs.rmSync(file(), { force: true });
}

module.exports = { prepare, clear };
