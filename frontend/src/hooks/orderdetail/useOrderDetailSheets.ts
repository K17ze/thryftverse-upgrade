import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** State for the reusable ConfirmationSheet (cancel / confirm-delivery flows). */
export interface OrderDetailConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant: 'default' | 'danger';
}

export interface UseOrderDetailSheetsResult {
  actionsSheetVisible: boolean;
  setActionsSheetVisible: Dispatch<SetStateAction<boolean>>;
  issueSelectorVisible: boolean;
  setIssueSelectorVisible: Dispatch<SetStateAction<boolean>>;
  confirmSheet: OrderDetailConfirmSheetState;
  setConfirmSheet: Dispatch<SetStateAction<OrderDetailConfirmSheetState>>;
  dismissConfirmSheet: () => void;
}

/**
 * Sheet/overlay visibility state for OrderDetailScreen — the overflow
 * actions sheet, the contextual issue selector, and the shared
 * confirmation sheet. The review prompt lives in `useReviewPrompt`
 * because it carries the eligibility/defer timing logic.
 */
export function useOrderDetailSheets(): UseOrderDetailSheetsResult {
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [issueSelectorVisible, setIssueSelectorVisible] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<OrderDetailConfirmSheetState>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    actionsSheetVisible,
    setActionsSheetVisible,
    issueSelectorVisible,
    setIssueSelectorVisible,
    confirmSheet,
    setConfirmSheet,
    dismissConfirmSheet,
  };
}
