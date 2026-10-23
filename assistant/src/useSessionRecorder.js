import { useEffect, useRef, useState } from 'react';
import { deleteSession, saveSession } from './api.js';
import { createSessionRecorder } from './sessionRecorder.js';
import { useEvent } from './useEvent.js';

// The interview being recorded is written to disk this often (and once more when it ends).
const SAVE_EVERY_MS = 10 * 1000;

// The recorder for the interview (see sessionRecorder.js). The same object on every render.
export function useSessionRecorder() {
  const [recorder] = useState(() => createSessionRecorder({ save: saveSession, remove: deleteSession }));
  return recorder;
}

/**
 * Saves the recording regularly while `listening`, so a crash or closed window loses at most a few
 * seconds, and once more when listening stops. onSaved(session) is called with an interview that was
 * kept; onError(message) when it could not be saved.
 */
export function useSaveWhileListening(recorder, listening, { onSaved, onError }) {
  const saved = useEvent(onSaved);
  const failed = useEvent(onError);

  // Stopped by the button or by Live Captions closing: either way the interview is over.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !listening) {
      recorder.finish().then(
        (session) => session && saved(session),
        (err) => failed(`Could not save this interview: ${err.message}`),
      );
    }
    wasListening.current = listening;
  }, [listening, recorder, saved, failed]);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(recorder.flush, SAVE_EVERY_MS);
    window.addEventListener('beforeunload', recorder.flushOnClose);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', recorder.flushOnClose);
    };
  }, [listening, recorder]);
}
