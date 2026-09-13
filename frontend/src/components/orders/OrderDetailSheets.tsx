import React from 'react';
import { OrderActionsSheet, type OrderActionItem } from './OrderActionsSheet';
import { ReviewPromptSheet } from './ReviewPromptSheet';
import { IssueCategorySelector, type IssueCategory } from './IssueCategorySelector';
import { ConfirmationSheet } from '../ConfirmationSheet';
import type { OrderRole } from './orderCapabilities';
import type { OrderDetailConfirmSheetState } from '../../hooks/orderdetail/useOrderDetailSheets';

interface OrderDetailSheetsProps {
  // Overflow actions sheet
  actionsSheetVisible: boolean;
  orderStatus: string;
  role: OrderRole;
  orderId: string;
  listingAvailable: boolean;
  overflowActions: OrderActionItem[];
  onCloseActionsSheet: () => void;
  // Review prompt
  reviewPromptVisible: boolean;
  reviewItemTitle?: string;
  reviewItemImage?: string | null;
  reviewSellerName?: string;
  onCloseReviewPrompt: () => void;
  onDeferReviewPrompt: () => void;
  onWriteReview: (rating?: number) => void;
  // Issue category selector
  issueSelectorVisible: boolean;
  contextualIssues: IssueCategory[];
  onSelectIssue: (category: IssueCategory) => void;
  onCloseIssueSelector: () => void;
  // Shared confirmation sheet
  confirmSheet: OrderDetailConfirmSheetState;
  onDismissConfirmSheet: () => void;
}

/**
 * Bottom-sheet layer for OrderDetailScreen: overflow actions, review
 * prompt, contextual issue selector, and the shared confirmation sheet.
 * Relocated verbatim from OrderDetailScreen.
 */
export function OrderDetailSheets({
  actionsSheetVisible,
  orderStatus,
  role,
  orderId,
  listingAvailable,
  overflowActions,
  onCloseActionsSheet,
  reviewPromptVisible,
  reviewItemTitle,
  reviewItemImage,
  reviewSellerName,
  onCloseReviewPrompt,
  onDeferReviewPrompt,
  onWriteReview,
  issueSelectorVisible,
  contextualIssues,
  onSelectIssue,
  onCloseIssueSelector,
  confirmSheet,
  onDismissConfirmSheet }: OrderDetailSheetsProps) {
  return (
    <>
      {/* Overflow actions sheet */}
      <OrderActionsSheet
        visible={actionsSheetVisible}
        orderStatus={orderStatus}
        role={role}
        orderId={orderId}
        listingAvailable={listingAvailable}
        actions={overflowActions}
        onClose={onCloseActionsSheet}
      />

      {/* Review prompt — appears for delivered orders without a review */}
      <ReviewPromptSheet
        visible={reviewPromptVisible}
        itemTitle={reviewItemTitle}
        itemImage={reviewItemImage ?? null}
        sellerName={reviewSellerName}
        onClose={onCloseReviewPrompt}
        onDefer={onDeferReviewPrompt}
        onWriteReview={onWriteReview}
      />

      {/* Issue category selector — buyer picks specific issue type before support */}
      {issueSelectorVisible ? (
        <IssueCategorySelector
          onSelect={onSelectIssue}
          onClose={onCloseIssueSelector}
          contextualIssues={contextualIssues}
        />
      ) : null}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </>
  );
}
