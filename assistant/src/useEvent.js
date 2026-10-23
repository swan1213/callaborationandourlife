import { useCallback, useLayoutEffect, useRef } from 'react';

// A function with the same identity on every render that always runs the latest version of `fn`.
// For callbacks that outlive a render (caption events, hotkeys, timers, streamed answers), so they
// never see stale state and never need to be re-subscribed.
export function useEvent(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}
