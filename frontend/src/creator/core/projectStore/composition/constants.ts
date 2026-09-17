// ── Canonical aspect-ratio constants ───────────────────────────────
// aspectRatio is ALWAYS width / height.
// Poster (Stories) default: 9:16 portrait → 9 / 16 = 0.5625
// Look default: 4:5 portrait → 4 / 5 = 0.8
export const POSTER_DEFAULT_ASPECT_RATIO = 9 / 16; // 0.5625
export const LOOK_DEFAULT_ASPECT_RATIO = 4 / 5; // 0.8

// Legacy Poster ratio that some old drafts may carry (16:9 landscape).
// Used by the migration path to detect and correct stale documents.
export const LEGACY_POSTER_LANDSCAPE_RATIO = 16 / 9; // 1.777…

// ── Default background colors ──────────────────────────────────────
// Used to detect whether the canvas background is still the factory
// default (no user customisation). When a full-bleed media layer is
// present AND the background is still the default, the renderer skips
// the background fill — the media IS the canvas surface, not a layer
// on top of a card. This eliminates the "card between media and edits"
// defect: edits land directly on the media, chrome floats over it.
export const LOOK_DEFAULT_BACKGROUND = '#000000';
export const POSTER_DEFAULT_BACKGROUND = '#1a1a1a';
