// src/hooks/useFormPersist.js
import { useEffect, useRef, useState } from "react";

/**
 * Persist any object state to localStorage.
 * @param {string} key - unique storage key (can be dynamic)
 * @param {object} initial - initial state
 */
export default function useFormPersist(key, initial) {
  // initial load
  const read = (k) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  };

  const [state, setState] = useState(() => read(key));

  // rehydrate when the key itself changes
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      setState(read(key));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // save (debounced)
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {}
    }, 200);
    return () => clearTimeout(timer.current);
  }, [key, state]);

  // helpers
  const setField = (k, v) => setState((s) => ({ ...s, [k]: v }));

  const clear = () => {
    try { localStorage.removeItem(key); } catch {}
    setState(initial);
  };

  return [state, setState, setField, clear];
}
