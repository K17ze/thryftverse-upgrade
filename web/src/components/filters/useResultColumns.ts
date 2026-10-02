import { useSyncExternalStore } from 'react';

/**
 * useResultColumns — dense-browsing column rhythm for results/discovery
 * masonry: 2 mobile · 3 md · 4 lg · 5 xl+. Capped at 5 — beyond that
 * tiles read as a spreadsheet, not a catalogue.
 *
 * Same Tailwind breakpoints as useMasonryColumns (768/1024/1280/1536)
 * so every feed surface reflows at the same widths the utility classes
 * do; the cap folds the 2xl bucket back to 5.
 *
 * useSyncExternalStore corrects the server guess synchronously during
 * hydration commit, so the grid lands on the right column count without
 * the post-paint reflow a useState+useEffect pair produces.
 */
function columnsForWidth(width: number): number {
  if (width < 768) return 2;
  if (width < 1024) return 3;
  if (width < 1280) return 4;
  return 5;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

export function useResultColumns(): number {
  return useSyncExternalStore(
    subscribe,
    () => columnsForWidth(window.innerWidth),
    () => 4, // server snapshot — SSR markup, corrected before first paint
  );
}
