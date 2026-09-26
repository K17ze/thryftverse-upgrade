import { useSyncExternalStore } from 'react';

/**
 * useResultColumns — dense-browsing column rhythm for results/discovery
 * masonry: 2 mobile · 3 tablet · 4 desktop · 5 wide. Capped at 5 — beyond
 * that tiles read as a spreadsheet, not a catalogue.
 *
 * useSyncExternalStore corrects the server guess synchronously during
 * hydration commit, so the grid lands on the right column count without
 * the post-paint reflow a useState+useEffect pair produces.
 */
function columnsForWidth(width: number): number {
  if (width < 640) return 2;
  if (width < 1024) return 3;
  if (width < 1536) return 4;
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
