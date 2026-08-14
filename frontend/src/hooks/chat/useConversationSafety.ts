/**
 * useConversationSafety — off-platform-payment/scam warnings.
 *
 * Owns:
 * - Composer-level safety warning detection (real-time as user types)
 * - Danger/caution warning dismissal state
 * - Per-message dismissed warning IDs
 * - Reset dismissal when text changes enough to clear the pattern
 *
 * Per spec 16: Off-platform-payment/scam warnings remain platform-owned and
 * work with no AI connection.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  detectComposerSafetyWarning,
} from "../../utils/chatSafetyWarnings";

interface UseConversationSafetyOptions {
  input: string;
}

export function useConversationSafety({ input }: UseConversationSafetyOptions) {
  const [dangerWarningDismissed, setDangerWarningDismissed] = useState(false);
  const [cautionWarningDismissed, setCautionWarningDismissed] = useState(false);
  const [dismissedWarningIds, setDismissedWarningIds] = useState<Set<string>>(
    new Set(),
  );

  // Real-time composer safety detection — re-evaluates as the user types
  const composerSafetyWarning = useMemo(() => {
    if (dangerWarningDismissed && cautionWarningDismissed) return null;
    const detected = detectComposerSafetyWarning(input);
    if (!detected) return null;
    if (detected.level === "danger" && dangerWarningDismissed) return null;
    if (detected.level === "caution" && cautionWarningDismissed) return null;
    return detected;
  }, [input, dangerWarningDismissed, cautionWarningDismissed]);

  const composerDangerWarning =
    composerSafetyWarning?.level === "danger" ? composerSafetyWarning : null;
  const composerCautionWarning =
    composerSafetyWarning?.level === "caution" ? composerSafetyWarning : null;

  // Reset dismissal when the text changes enough to clear the pattern
  useEffect(() => {
    const detected = detectComposerSafetyWarning(input);
    if (!detected) {
      if (dangerWarningDismissed) setDangerWarningDismissed(false);
      if (cautionWarningDismissed) setCautionWarningDismissed(false);
    }
  }, [input, dangerWarningDismissed, cautionWarningDismissed]);

  const dismissMessageWarning = useCallback((msgId: string) => {
    setDismissedWarningIds((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });
  }, []);

  return {
    composerDangerWarning,
    composerCautionWarning,
    dismissedWarningIds,
    setDangerWarningDismissed,
    setCautionWarningDismissed,
    dismissMessageWarning,
  };
}
