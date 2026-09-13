import React from 'react';
import { AddCardSheet } from './AddCardSheet';
import { CheckoutPaymentSelector } from './CheckoutPaymentSelector';
import { CheckoutBreakdownSheet } from './CheckoutBreakdownSheet';
import { ConfirmationSheet } from '../ConfirmationSheet';
import type { CommercePaymentMethod } from '../../services/commerceApi';

interface ConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant: 'default' | 'danger';
}

interface BreakdownLabels {
  itemLabel: string;
  protectionLabel: string;
  deliveryRowLabel: string;
  deliveryLabel: string;
  walletAppliedLabel?: string;
  useBalance: boolean;
  totalLabel: string;
}

interface Props {
  // Add-card sheet
  addCardSheetVisible: boolean;
  onDismissAddCard: () => void;
  onAddCardSuccess: () => void;
  // Saved payment-method selector
  paymentSelectorVisible: boolean;
  onDismissPaymentSelector: () => void;
  paymentMethods: CommercePaymentMethod[];
  selectedPaymentMethodId: number | undefined;
  onSelectPaymentMethod: (method: CommercePaymentMethod) => void;
  isSelectingPayment: boolean;
  onShowAddCard: () => void;
  // Full cost-breakdown sheet
  breakdownSheetVisible: boolean;
  onDismissBreakdown: () => void;
  breakdown: BreakdownLabels;
  // Destructive-action confirmation (e.g. leaving mid-payment)
  confirmSheet: ConfirmSheetState;
  onDismissConfirm: () => void;
}

// All checkout sheets/modals in one place — they render outside the
// a11y-hidden content wrap so they stay reachable while open (audit M2).
export function CheckoutSheets({
  addCardSheetVisible,
  onDismissAddCard,
  onAddCardSuccess,
  paymentSelectorVisible,
  onDismissPaymentSelector,
  paymentMethods,
  selectedPaymentMethodId,
  onSelectPaymentMethod,
  isSelectingPayment,
  onShowAddCard,
  breakdownSheetVisible,
  onDismissBreakdown,
  breakdown,
  confirmSheet,
  onDismissConfirm,
}: Props) {
  return (
    <>
      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={onDismissAddCard}
        onSuccess={onAddCardSuccess}
      />
      <CheckoutPaymentSelector
        visible={paymentSelectorVisible}
        onDismiss={onDismissPaymentSelector}
        methods={paymentMethods}
        selectedId={selectedPaymentMethodId}
        onSelect={onSelectPaymentMethod}
        isSelecting={isSelectingPayment}
        onAddCard={onShowAddCard}
      />
      <CheckoutBreakdownSheet
        visible={breakdownSheetVisible}
        onDismiss={onDismissBreakdown}
        itemLabel={breakdown.itemLabel}
        protectionLabel={breakdown.protectionLabel}
        deliveryRowLabel={breakdown.deliveryRowLabel}
        deliveryLabel={breakdown.deliveryLabel}
        walletAppliedLabel={breakdown.walletAppliedLabel}
        useBalance={breakdown.useBalance}
        totalLabel={breakdown.totalLabel}
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirm}
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
