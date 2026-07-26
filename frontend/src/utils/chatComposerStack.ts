/**
 * P0-8: Chat composer-stack height enforcement.
 *
 * The composer area can stack multiple contextual banners above the input
 * bar simultaneously:
 *   - reply quote
 *   - emoji reaction picker
 *   - offline banner
 *   - undo-deletion banner
 *   - offer composer prefill
 *   - linked-listing card
 *
 * Stacking all of these at once pushes the input bar off-screen on small
 * devices and creates jarring state combinations. This helper enforces a
 * maximum visible stack height by assigning each slot a priority and
 * keeping only the highest-priority slots whose cumulative height fits
 * the budget.
 *
 * Priorities reflect user intent, not visual size:
 *   1. reply quote — user explicitly tapped Reply; must stay visible
 *   2. undo banner — time-sensitive, dismisses itself
 *   3. offline banner — blocks send, must be visible when offline
 *   4. reaction picker — user explicitly opened it
 *   5. linked-listing card — ambient context, can drop first
 *   6. offer prefill — ambient context, can drop
 *
 * The budget is in pixels and refers to the cumulative stack height
 * above the input bar, not including the input bar itself.
 */

export type ComposerStackSlot =
  | 'replyQuote'
  | 'undoBanner'
  | 'offlineBanner'
  | 'reactionPicker'
  | 'linkedListingCard'
  | 'offerPrefill';

export interface ComposerStackSlotState {
  slot: ComposerStackSlot;
  visible: boolean;
  /** Estimated rendered height in pixels, including margins. */
  estimatedHeight: number;
}

const SLOT_PRIORITY: Record<ComposerStackSlot, number> = {
  replyQuote: 1,
  undoBanner: 2,
  offlineBanner: 3,
  reactionPicker: 4,
  linkedListingCard: 5,
  offerPrefill: 6,
};

/**
 * Default stack budget. On a 5.4" device (~390pt logical width, ~667pt
 * height) the keyboard consumes ~336pt. Reserving ~280pt for the message
 * list + input bar leaves ~50pt for the stack — roughly one banner. On
 * larger devices the budget can be relaxed by the caller.
 */
export const DEFAULT_COMPOSER_STACK_BUDGET_PIXELS = 120;

export interface ComposerStackResolution {
  /** Slots that should remain visible. */
  visible: ComposerStackSlot[];
  /** Slots that were suppressed to fit the budget, with the reason. */
  suppressed: Array<{ slot: ComposerStackSlot; reason: 'budget' | 'not_visible' }>;
  /** Total estimated height of the visible stack. */
  totalHeight: number;
}

/**
 * Resolve which composer-stack slots should be visible given a budget.
 * Slots are kept in priority order until the cumulative height would
 * exceed the budget. Lower priority slots are suppressed rather than
 * overflowing.
 *
 * This is a pure function so it can be unit-tested without React.
 */
export function resolveComposerStack(
  slots: ComposerStackSlotState[],
  budgetPixels: number = DEFAULT_COMPOSER_STACK_BUDGET_PIXELS,
): ComposerStackResolution {
  const active = slots
    .filter((s) => s.visible && s.estimatedHeight > 0)
    .sort((a, b) => SLOT_PRIORITY[a.slot] - SLOT_PRIORITY[b.slot]);

  const visible: ComposerStackSlot[] = [];
  const suppressed: Array<{ slot: ComposerStackSlot; reason: 'budget' | 'not_visible' }> = [];
  let totalHeight = 0;

  for (const slot of active) {
    // The first (highest-priority) slot is always admitted even if it
    // alone exceeds the budget — otherwise a single tall reply quote
    // would be suppressed and the user's explicit Reply action would
    // vanish. Subsequent slots are admitted only while the cumulative
    // height fits.
    if (visible.length === 0 || totalHeight + slot.estimatedHeight <= budgetPixels) {
      visible.push(slot.slot);
      totalHeight += slot.estimatedHeight;
    } else {
      suppressed.push({ slot: slot.slot, reason: 'budget' });
    }
  }

  // Also record slots that were not visible to begin with — useful for
  // telemetry and tests that assert the full input shape.
  for (const slot of slots) {
    if (!slot.visible) {
      suppressed.push({ slot: slot.slot, reason: 'not_visible' });
    }
  }

  return { visible, suppressed, totalHeight };
}

/**
 * Convenience helper: given a resolution and a slot, return whether the
 * slot should be rendered. Components consume this instead of branching
 * on the raw `visible` array.
 */
export function isSlotVisible(
  resolution: ComposerStackResolution,
  slot: ComposerStackSlot,
): boolean {
  return resolution.visible.includes(slot);
}
