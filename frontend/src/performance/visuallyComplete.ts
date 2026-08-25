import { useEffect } from 'react';

const marks = new Map<string, number>();

export function markVisuallyComplete(surface: string): void {
  const ts =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  marks.set(surface, ts);
  if (__DEV__) {
    console.info(`[visually-complete] ${surface}: ${ts.toFixed(1)}ms`);
  }
}

export function useVisuallyComplete(surface: string): void {
  useEffect(() => {
    markVisuallyComplete(surface);
  }, [surface]);
}
