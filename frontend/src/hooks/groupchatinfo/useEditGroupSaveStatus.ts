/**
 * useEditGroupSaveStatus — the shared save-outcome state for the edit-group
 * screen: the inline issue copy, the "outcome unknown" flag that surfaces
 * the Check-result recovery action, and the idempotency key pinned across
 * retries. Kept separate from the save flow itself so the staged media
 * draft (useEditGroupMedia) can invalidate a pending save without a
 * circular hook dependency. Extracted verbatim from EditGroupScreen.
 */

import { useCallback, useRef, useState } from 'react';

export function useEditGroupSaveStatus() {
  const pendingSaveKeyRef = useRef<string | null>(null);
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  /** Any draft change invalidates a previously pinned idempotency key. */
  const clearPendingSave = useCallback(() => {
    pendingSaveKeyRef.current = null;
    setSaveIssue(null);
    setOutcomeUnknown(false);
  }, []);

  return {
    pendingSaveKeyRef,
    saveIssue,
    setSaveIssue,
    outcomeUnknown,
    setOutcomeUnknown,
    clearPendingSave,
  };
}

export type EditGroupSaveStatus = ReturnType<typeof useEditGroupSaveStatus>;
