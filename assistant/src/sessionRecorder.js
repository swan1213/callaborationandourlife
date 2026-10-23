// The interview being recorded for Interview History in TailorBid: { id, company, role, stage, startedAt, endedAt,
// captions: [{ id, t, text, translation }], answers: [{ t, question, text, source }], report }.
// Plain functions with no React, so they can be called from any callback and tested on their own.
// `save(session)` and `remove(id)` return promises (the server calls in api.js).
export function createSessionRecorder({ save, remove, now = Date.now }) {
  let session = null;
  let dirty = false; // changed since the last save

  // Writes the session if anything changed since the last save. A failed save is tried again next time.
  function flush() {
    if (!session || !dirty) return;
    dirty = false;
    save(session).catch(() => {
      dirty = true;
    });
  }

  return {
    get session() {
      return session;
    },

    // `meta` comes from the Start dialog: { company, role, stage }.
    begin({ company = '', role = '', stage = '' } = {}) {
      const startedAt = now();
      session = {
        id: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
        company,
        role,
        stage,
        startedAt,
        endedAt: null,
        captions: [],
        answers: [],
        report: null,
      };
      dirty = true;
    },

    // `id` is the caption line's id, so a line Live Captions rewrites updates the same entry.
    recordCaption(id, text) {
      if (!session) return;
      const line = session.captions.find((c) => c.id === id);
      if (line) Object.assign(line, { text, translation: undefined });
      else session.captions.push({ id, t: now(), text });
      dirty = true;
    },

    recordTranslation(id, translation) {
      const line = session?.captions.find((c) => c.id === id);
      if (!line) return;
      line.translation = translation;
      dirty = true;
    },

    recordAnswer(question, text, source) {
      if (!session || !text) return;
      session.answers.push({ t: now(), question, text, source });
      dirty = true;
    },

    flush,

    // The page is closing mid-interview: save it with an end time, in case this is the last chance.
    flushOnClose() {
      if (session) session.endedAt = now();
      dirty = true;
      flush();
    },

    // Ends the interview. Resolves with the saved session, or null when there was nothing to keep
    // (nothing heard, nothing answered), in which case it is deleted. Rejects when the save fails.
    async finish() {
      const s = session;
      if (!s) return null;
      session = null;
      s.endedAt = now();
      if (!s.captions.length && !s.answers.length) {
        await remove(s.id).catch(() => {});
        return null;
      }
      await save(s);
      return s;
    },
  };
}
