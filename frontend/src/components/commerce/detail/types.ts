/**
 * Shared family-aware types for the commerce detail system.
 *
 * These types let the three product-detail families (direct, auction,
 * co_own) share one set of primitives while expressing different
 * transaction priorities through typed variants — without creating
 * duplicate V2 components.
 *
 * Per spec 05 (Shared Component Art Direction):
 *   - one shared system;
 *   - consistency through spacing, typography, motion, interaction,
 *     disclosure and dock behaviour — not through identical rounded
 *     cards;
 *   - family variants change composition weight, not the component
 *     boundary.
 */

/** The three product-detail families. */
export type CommerceDetailFamily = 'direct' | 'auction' | 'co_own';

/**
 * Section rhythm variants.
 *
 * Per spec 05 §2:
 *   - standard: existing simple section.
 *   - editorial: stronger heading, more breathing room, no divider.
 *   - compact: disclosure row with minimal vertical spacing.
 *   - continuation: no heading or divider.
 *   - legal: subdued, collapsed-first.
 *   - discovery: visual heading and rail spacing.
 */
export type CommerceDetailSectionVariant =
  | 'standard'
  | 'editorial'
  | 'compact'
  | 'continuation'
  | 'legal'
  | 'discovery';

/** Identity density — controls title size and vertical rhythm. */
export type CommerceDetailIdentityDensity = 'compact' | 'standard';

/**
 * Dock layout strategy.
 *
 * Per spec 05 §4:
 *   - inline: actions sit on the right of the value cluster.
 *   - stacked: actions sit below the value cluster, full width.
 *   - auto: inline on sufficient width, stacked on compact widths.
 */
export type CommerceDetailDockLayout = 'inline' | 'stacked' | 'auto';
