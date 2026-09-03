/**
 * Chat contextual-stack resolver.
 *
 * The audit defines a strict priority for the contextual elements that
 * compete for vertical space around the message list. Only the
 * highest-priority contextual elements that fit the height budget are
 * shown, so the message list is never squeezed below ~40% of screen
 * height. Persistent elements (top bar, message list, composer) are
 * always visible and not part of this resolver.
 *
 * Priority order (highest first):
 *   1. safetyWarning       — user safety, always wins
 *   2. listingTransaction  — active commerce state only
 *   3. agentRow            — only when an agent is deployed/active
 *   4. suggestedReplies    — only when useful and not dismissed
 */

export type ContextualStackSlot =
  | "safetyWarning"
  | "listingTransaction"
  | "agentRow"
  | "suggestedReplies";

const CONTEXTUAL_SLOT_PRIORITY: Record<ContextualStackSlot, number> = {
  safetyWarning: 1,
  listingTransaction: 2,
  agentRow: 3,
  suggestedReplies: 4,
};

export interface ContextualSlotState {
  slot: ContextualStackSlot;
  visible: boolean;
  /** Estimated rendered height in pixels, including margins. */
  estimatedHeight: number;
}

export interface ContextualStackResolution {
  /** Slots that should remain visible, in priority order. */
  visible: Set<ContextualStackSlot>;
  /** Slots suppressed to fit the height budget. */
  suppressed: ContextualStackSlot[];
  /** Total estimated height of the visible contextual stack. */
  totalHeight: number;
}

/**
 * Resolve which contextual stack slots should be visible given a pixel
 * budget. Slots are kept in priority order until the cumulative height
 * would exceed the budget; lower-priority slots are suppressed rather
 * than overflowing. The highest-priority active slot is always admitted
 * even if it alone exceeds the budget (e.g. a safety warning must never
 * be hidden by the budget).
 */
export function resolveContextualStack(
  slots: ContextualSlotState[],
  budgetPixels: number,
): ContextualStackResolution {
  const active = slots
    .filter((s) => s.visible && s.estimatedHeight > 0)
    .sort(
      (a, b) =>
        CONTEXTUAL_SLOT_PRIORITY[a.slot] - CONTEXTUAL_SLOT_PRIORITY[b.slot],
    );

  const visible = new Set<ContextualStackSlot>();
  const suppressed: ContextualStackSlot[] = [];
  let totalHeight = 0;

  for (const slot of active) {
    if (
      visible.size === 0 ||
      totalHeight + slot.estimatedHeight <= budgetPixels
    ) {
      visible.add(slot.slot);
      totalHeight += slot.estimatedHeight;
    } else {
      suppressed.push(slot.slot);
    }
  }

  return { visible, suppressed, totalHeight };
}

/** Minimum share of screen height reserved for the message list. */
export const MESSAGE_LIST_MIN_HEIGHT_RATIO = 0.4;
