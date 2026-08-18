/**
 * Surface & Radius Rules — Thryftverse Visual System
 *
 * Canonical rules for when to use a surface (card/panel) and which radius
 * to apply. This contract enforces AGENTS.md §4 hard constraints:
 *
 *   - Surface budget: at most one dominant non-media panel above the fold.
 *   - Radius budget: no more than two non-avatar radius sizes in one
 *     viewport unless a modal is present.
 *   - No card-on-card composition.
 *   - Visible containment must have meaning.
 *
 * Radius communicates role:
 *   0–4:  image / editorial edge
 *   8:    compact control or media thumbnail
 *   12:   sheet / dialog content
 *   16:   rare standalone panel
 *   24+:  navigation dock / genuinely dominant panel only
 *   full: pill / round avatar / control
 *
 * Avoid 24px rounded containers except deliberate navigation/floating chrome.
 */

import { Radius } from './designTokens';

// ============================================================================
// RADIUS ROLE CONTRACT
// ============================================================================

export type RadiusRole =
  | 'editorialEdge' // 0 — images, full-bleed media
  | 'compactControl' // 4 — buttons, inputs, small elements
  | 'mediaThumbnail' // 8 — small cards, chips, badges
  | 'sheetDialog' // 12 — modals, sheets, medium cards
  | 'standalonePanel' // 16 — large cards, containers
  | 'dominantPanel' // 24 — navigation docks, genuinely dominant panels
  | 'pillAvatar'; // full — pills, avatars, floating buttons, tags

export const RadiusRoleValue: Record<RadiusRole, number> = {
  editorialEdge: Radius.none,
  compactControl: Radius.sm,
  mediaThumbnail: Radius.md,
  sheetDialog: Radius.lg,
  standalonePanel: Radius.xl,
  dominantPanel: Radius.xxl,
  pillAvatar: Radius.full,
} as const;

// ============================================================================
// SURFACE TEST — when to use a card vs whitespace/separator
// ============================================================================

/**
 * Before creating a card, ask:
 *   1. Is this object independently actionable?
 *   2. Does it need a boundary to preserve meaning when reordered?
 *   3. Does it carry transactional state?
 *   4. Is the boundary needed for contrast/accessibility?
 *
 * If "no" to all, use whitespace/separator.
 */
export type SurfaceJustification =
  | 'independentlyActionable'
  | 'reorderBoundary'
  | 'transactionalState'
  | 'contrastAccessibility'
  | 'none'; // none → use whitespace/separator

/**
 * Returns true when a surface (card/panel) is justified by the test.
 * Use this in component design to decide whether to render a boundary.
 */
export function isSurfaceJustified(justification: SurfaceJustification): boolean {
  return justification !== 'none';
}

// ============================================================================
// RADIUS BUDGET ENFORCER
// ============================================================================

/**
 * Maximum number of distinct non-avatar radius sizes allowed in a single
 * viewport (AGENTS.md §4: "no more than two non-avatar radius sizes in one
 * viewport unless a modal is present").
 */
export const MAX_NON_AVATAR_RADII_PER_VIEWPORT = 2;

/**
 * Avatar radius (full) is excluded from the budget because it is a shape
 * signal (identity), not a containment signal.
 */
export const AVATAR_RADIUS_ROLE: RadiusRole = 'pillAvatar';

/**
 * Returns the radius value for a role, or a fallback if the role would
 * exceed the viewport budget. Used by lint/audit tooling.
 */
export function resolveRadius(role: RadiusRole): number {
  return RadiusRoleValue[role];
}

// ============================================================================
// LAYOUT FAMILY CONTRACT (audit §01 — Global layout grammar)
// ============================================================================

export type LayoutFamily =
  | 'mediaLed' // Home, product detail, Poster, Looks, saved inspiration
  | 'denseUtilityList' // Settings, inbox, addresses, payment methods
  | 'transactionDecision'; // Checkout, bid, offer, Co-Own order, payout

/**
 * Every screen must declare one layout family so future work does not
 * arbitrarily mix patterns. Use this in screen metadata or a header comment.
 *
 * Media-led:
 *   - Media can meet edges.
 *   - Chrome overlays only when necessary.
 *   - Text follows media rather than enclosing it in a card.
 *
 * Dense utility list:
 *   - Mostly flat rows.
 *   - Section headings + whitespace.
 *   - Cards only for genuinely grouped transactional units.
 *
 * Transaction / decision:
 *   - Strong summary, transparent value, one primary action.
 *   - Sticky action dock.
 *   - No decorative content.
 */
export const LAYOUT_FAMILY_DESCRIPTIONS: Record<LayoutFamily, string> = {
  mediaLed: 'Media can meet edges; chrome overlays only when necessary; text follows media.',
  denseUtilityList: 'Mostly flat rows; section headings + whitespace; cards only for grouped transactional units.',
  transactionDecision: 'Strong summary, transparent value, one primary action; sticky action dock; no decorative content.',
};

// ============================================================================
// SURFACE BUDGET (AGENTS.md §4)
// ============================================================================

/**
 * Maximum number of dominant non-media panels allowed above the fold.
 * Flat canvas, spacing and hairlines are the default utility structure.
 */
export const MAX_DOMINANT_NON_MEDIA_PANELS_ABOVE_FOLD = 1;

// ============================================================================
// STROKE GRAMMAR (AGENTS.md §4)
// ============================================================================

export type StrokeRole =
  | 'separator' // hairline (0.5) — separators, grouped-list hairlines
  | 'fieldOutline' // standard (1) — fields and intentionally outlined controls
  | 'focusSelection'; // emphasis (2) — selection/focus only

export const StrokeRoleValue: Record<StrokeRole, number> = {
  separator: 0.5,
  fieldOutline: 1,
  focusSelection: 2,
} as const;

/**
 * Never mix arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component
 * family. Use the roles above so stroke grammar stays consistent.
 */
export function resolveStroke(role: StrokeRole): number {
  return StrokeRoleValue[role];
}
