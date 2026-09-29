'use client';

/**
 * useDebouncedValue — returns `value` trailing the input by `delayMs`.
 * For typeahead network calls: the query key only advances once typing
 * pauses, so in-flight requests abort (react-query signal) instead of
 * stacking per keystroke.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
