import { useCallback, useMemo } from "react";

import { Dimensions } from "react-native";

import {
  resolveContextualStack,
  type ContextualStackSlot,
  type ContextualSlotState,
  MESSAGE_LIST_MIN_HEIGHT_RATIO } from "../../utils/chatContextualStack";

export interface UseChatContextualStackOptions {
  hasSafetyWarning: boolean;
  isGroup: boolean;
  /** True when a linked listing exists and is sold. */
  hasSoldLinkedListing: boolean;
  deployedAgentsCount: number;
  agentSuggestionsActive: boolean;
  suggestedRepliesDismissed: boolean;
}

/**
 * Memoized contextual-stack resolver. Determines which contextual
 * elements (safety warning, listing transaction strip, agent row,
 * suggested replies) may be visible simultaneously. When the combined
 * height would squeeze the message list below ~40% of the screen,
 * only the highest-priority elements are kept.
 */
export function useChatContextualStack({
  hasSafetyWarning,
  isGroup,
  hasSoldLinkedListing,
  deployedAgentsCount,
  agentSuggestionsActive,
  suggestedRepliesDismissed,
}: UseChatContextualStackOptions) {
  // Screen height (stable for the session) used to budget the
  // contextual stack and guarantee the message list keeps ≥40% of the
  // screen height.
  const screenHeight = useMemo(() => Dimensions.get("window").height, []);

  const contextualStack = useMemo(() => {
    const TOP_BAR_EST = 52;
    const COMPOSER_BASE_EST = 72;
    // Reserve space for the composer-area banner stack (reply/undo/
    // offline/reaction), which has its own resolver.
    const COMPOSER_BANNER_EST = 120;
    const minMessageListHeight = Math.floor(
      screenHeight * MESSAGE_LIST_MIN_HEIGHT_RATIO,
    );
    const budget = Math.max(
      0,
      screenHeight -
        TOP_BAR_EST -
        COMPOSER_BASE_EST -
        COMPOSER_BANNER_EST -
        minMessageListHeight,
    );

    const slots: ContextualSlotState[] = [
      {
        slot: "safetyWarning",
        visible: hasSafetyWarning,
        estimatedHeight: 52 },
      {
        slot: "listingTransaction",
        visible:
          !isGroup && hasSoldLinkedListing,
        estimatedHeight: 48 },
      {
        slot: "agentRow",
        visible: deployedAgentsCount > 0,
        estimatedHeight: 36 },
      {
        slot: "suggestedReplies",
        visible:
          agentSuggestionsActive && !suggestedRepliesDismissed,
        estimatedHeight: 52 },
    ];

    return resolveContextualStack(slots, budget);
  }, [
    screenHeight,
    hasSafetyWarning,
    isGroup,
    hasSoldLinkedListing,
    deployedAgentsCount,
    agentSuggestionsActive,
    suggestedRepliesDismissed,
  ]);

  const isContextualSlotVisible = useCallback(
    (slot: ContextualStackSlot) => contextualStack.visible.has(slot),
    [contextualStack],
  );

  return { isContextualSlotVisible };
}
