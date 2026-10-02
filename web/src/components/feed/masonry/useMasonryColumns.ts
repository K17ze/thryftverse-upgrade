'use client';

import { useSyncExternalStore } from 'react';

/**
 * Responsive column count — 2 mobile → 3 md → 4 lg → 5 xl → 6 2xl.
 * Thresholds ride the Tailwind scale (768/1024/1280/1536) so column
 * counts reflow at the exact widths the utility classes do.
 * useSyncExternalStore corrects the server guess synchronously during the
 * hydration commit, so the first paint lands on the right column count.
 */
export function columnsForWidth(width: number): number {
  if (width < 768) return 2;
  if (width < 1024) return 3;
  if (width < 1280) return 4;
  if (width < 1536) return 5;
  return 6;
}

const subscribeToResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

export function useMasonryColumns(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => columnsForWidth(window.innerWidth),
    () => 4, // server snapshot — SSR markup, corrected before first paint
  );
}
