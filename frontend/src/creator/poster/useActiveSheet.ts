/**
 * useActiveSheet — consolidates mutually exclusive sheet/overlay visibility
 * states into a single discriminated union.
 *
 * Why this exists:
 *   PosterComposerScreen had ~20 independent `useState(false)` booleans for
 *   sheet visibility. Each keystroke or gesture that touched any state caused
 *   the entire 3387-line component to re-render. Most sheets are mutually
 *   exclusive (confirmed by the cascading Escape/back handlers), so a single
 *   discriminated union state replaces 13 booleans with 1 useReducer.
 *
 * Benefits:
 *   - 13 useState → 1 useReducer (fewer state slots, fewer re-renders)
 *   - Mutual exclusivity is enforced by the type system, not by discipline
 *   - Escape/back handler simplifies to `if (activeSheet) { close(); return; }`
 *   - Opening a sheet automatically closes the previous one
 *
 * Usage:
 *   const { activeSheet, open, close } = useActiveSheet();
 *   if (activeSheet === 'layers') { return <LayersSheet onClose={close} /> }
 *   open('publish'); // closes any previously open sheet
 */
import { useReducer, useCallback } from 'react';

export type ActiveSheet =
  | 'layers'
  | 'publish'
  | 'settings'
  | 'overflow'
  | 'help'
  | 'a11yMove'
  | 'a11yZOrder'
  | 'transitions'
  | 'keyframes'
  | 'speedCurve'
  | 'reverse'
  | 'freezeFrame'
  | 'audioFade'
  | null;

type SheetAction =
  | { type: 'open'; sheet: Exclude<ActiveSheet, null> }
  | { type: 'close' };

function sheetReducer(_state: ActiveSheet, action: SheetAction): ActiveSheet {
  switch (action.type) {
    case 'open':
      return action.sheet;
    case 'close':
      return null;
  }
}

export function useActiveSheet() {
  const [activeSheet, dispatch] = useReducer(sheetReducer, null);

  const open = useCallback(
    (sheet: Exclude<ActiveSheet, null>) => dispatch({ type: 'open', sheet }),
    [],
  );

  const close = useCallback(() => dispatch({ type: 'close' }), []);

  return { activeSheet, open, close } as const;
}
