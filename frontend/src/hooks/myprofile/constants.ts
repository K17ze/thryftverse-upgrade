// Layout geometry for the owner-profile (MyProfile) surface — shared between
// the screen orchestrator, the scroll hook, and the extracted components.
import { Space } from '../../theme/designTokens';

// A profile cover is identity media, not a thin toolbar backdrop. At 200pt it
// retains a useful crop on common phone widths while leaving the avatar/stats
// seam outside the cover-control layer.
export const COVER_HEIGHT = 200;

// 3:4 portrait grid — three columns with token-driven gutters.
export const GRID_GAP = Space.xs;
export const GRID_COLS = 3;
export const CARD_ASPECT = 4 / 3;

/** Maximum number of pinned/featured listings in the shop grid. */
export const MAX_FEATURED = 8;
