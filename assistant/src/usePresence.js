import { useEffect, useRef } from 'react';
import { sendPresence } from './api.js';

const HEARTBEAT_MS = 60 * 1000;
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'];

// Tells TailorBid every minute that the assistant is open, and how long since the last input, for the
// online status and Work Time there. A running interview counts as active: the person is in a call.
export function usePresence(connected, listening) {
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  useEffect(() => {
    if (!connected) return;
    let lastInput = Date.now();
    const markInput = () => {
      lastInput = Date.now();
    };
    const beat = () => sendPresence(listeningRef.current ? 0 : Date.now() - lastInput);
    INPUT_EVENTS.forEach((e) => window.addEventListener(e, markInput, { passive: true, capture: true }));
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      INPUT_EVENTS.forEach((e) => window.removeEventListener(e, markInput, { capture: true }));
    };
  }, [connected]);
}
