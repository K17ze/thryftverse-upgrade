import { useState, useCallback, useMemo } from 'react';
import type { MutableRefObject, RefObject, Dispatch, SetStateAction } from 'react';
import { Linking, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { haptics } from '../../utils/haptics';
import { t } from '../../i18n';
import { createDmConversationOnApi } from '../../services/chatApi';
import { respondDispatchExtension } from '../../services/commerceApi';
import type { CommerceOrder } from '../../services/commerceApi';
import type { OrderMutation } from '../useOrderDetail';
import { parseApiError } from '../../lib/apiClient';
import type { OrderCapability, DispatchExtension } from '../../components/orders/orderCapabilities';
import type { CounterpartyInfo } from '../../components/orders/OrderCounterpartySection';
import type { OrderActionConfig } from '../../components/orders/OrderActionFooter';
import type { OrderActionItem } from '../../components/orders/OrderActionsSheet';
import type { IssueCategory } from '../../components/orders/IssueCategorySelector';
import type { SupportTicket } from '../../store/useStore';
import type { OrderDetailConfirmSheetState } from './useOrderDetailSheets';

export interface UseOrderDetailActionsParams {
  orderId: string;
  backendOrder: CommerceOrder | null;
  isBuyer: boolean;
  isKnown: boolean;
  capabilities: OrderCapability | null;
  counterparty: CounterpartyInfo | null;
  openTicket: SupportTicket | undefined;
  carrierTrackingUrl: string | null;
  pendingExtension: DispatchExtension | null;
  normalisedStatus: string;
  orderMutation: OrderMutation;
  mutationLocked: boolean;
  isMountedRef: MutableRefObject<boolean>;
  refreshOrder: (isManual?: boolean) => Promise<CommerceOrder | null | undefined>;
  handleCancel: () => Promise<void>;
  handleDeliver: () => Promise<void>;
  scrollViewRef: RefObject<ScrollView | null>;
  timelineYRef: MutableRefObject<number>;
  openReviewPrompt: () => void;
  setIssueSelectorVisible: Dispatch<SetStateAction<boolean>>;
  setConfirmSheet: Dispatch<SetStateAction<OrderDetailConfirmSheetState>>;
}

export interface UseOrderDetailActionsResult {
  resolveAndOpenConversation: (
    recipientUserId: string,
    itemId: string | undefined,
    focusQuery?: string,
  ) => Promise<void>;
  handleTrackOnCarrierSite: () => Promise<void>;
  handleIssueCategorySelect: (category: IssueCategory) => void;
  isRespondingExtension: boolean;
  handleRespondExtension: (accept: boolean) => Promise<void>;
  handleCopyTracking: (trackingNumber: string) => Promise<void>;
  handleOpenShippingLabel: (url: string) => Promise<void>;
  handleManualRefresh: () => void;
  footerActions: { primary?: OrderActionConfig; secondary?: OrderActionConfig };
  overflowActions: OrderActionItem[];
}

/**
 * Interaction handlers for OrderDetailScreen: DM conversation resolution,
 * carrier-site tracking, clipboard copy, shipping label, manual refresh,
 * dispatch-extension accept/decline, and the footer/overflow action
 * configs built from the canonical capability resolver.
 *
 * All logic relocated verbatim from OrderDetailScreen.
 */
export function useOrderDetailActions({
  orderId,
  backendOrder,
  isBuyer,
  isKnown,
  capabilities,
  counterparty,
  openTicket,
  carrierTrackingUrl,
  pendingExtension,
  normalisedStatus,
  orderMutation,
  mutationLocked,
  isMountedRef,
  refreshOrder,
  handleCancel,
  handleDeliver,
  scrollViewRef,
  timelineYRef,
  openReviewPrompt,
  setIssueSelectorVisible,
  setConfirmSheet }: UseOrderDetailActionsParams): UseOrderDetailActionsResult {
  const navigation = useNavigation<any>();
  const { show } = useToast();
  const upsertConversation = useStore((state) => state.upsertConversation);

  // Resolve a real DM conversation via the backend before navigating to Chat.
  // Replaces fabricated IDs like `${counterparty.id}_${listingId}`.
  const resolveAndOpenConversation = useCallback(async (
    recipientUserId: string,
    itemId: string | undefined,
    focusQuery?: string,
  ) => {
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId,
        itemId,
      });
      upsertConversation(conversation);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        focusQuery,
        partnerUserId: recipientUserId,
        itemId,
      });
    } catch {
      show('Could not start conversation. Try again.', 'error');
    }
  }, [navigation, upsertConversation, show]);

  const handleTrackOnCarrierSite = useCallback(async () => {
    if (!carrierTrackingUrl) return;
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(carrierTrackingUrl);
      if (!supported) {
        show(t('orderDetail.toast.unableOpenCarrier'), 'error');
        return;
      }
      await Linking.openURL(carrierTrackingUrl);
    } catch {
      show(t('orderDetail.toast.unableOpenCarrier'), 'error');
    }
  }, [carrierTrackingUrl, show]);

  // --- Issue category selection ---
  // Opens an in-screen category selector so the buyer picks a specific
  // issue type before navigating to support. The selected category is
  // passed as an extra navigation param for the support screen to consume.
  const handleIssueCategorySelect = useCallback((category: IssueCategory) => {
    setIssueSelectorVisible(false);
    haptics.tap();
    navigation.navigate('OrderSupport', {
      orderId,
      categoryId: category.id,
      categoryLabel: category.label });
  }, [navigation, orderId, setIssueSelectorVisible]);

  const [isRespondingExtension, setIsRespondingExtension] = useState(false);

  const handleRespondExtension = useCallback(async (accept: boolean) => {
    if (isRespondingExtension || !pendingExtension) return;
    setIsRespondingExtension(true);
    haptics.tap();
    try {
      await respondDispatchExtension(orderId, accept, pendingExtension.id);
      show(
        accept
          ? 'Extension accepted — the seller has a new dispatch deadline.'
          : 'Extension declined.',
        accept ? 'success' : 'info'
      );
      // Refetch so the accepted shipByDate / cleared extension flows through.
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsRespondingExtension(false);
    }
  }, [isRespondingExtension, pendingExtension, orderId, show, refreshOrder, isMountedRef]);

  // --- Build action footer from canonical capabilities ---
  const footerActions = useMemo((): { primary?: OrderActionConfig; secondary?: OrderActionConfig } => {
    if (!backendOrder || !isKnown || !capabilities) return {};

    const primary = capabilities.primaryAction;
    const secondary = capabilities.secondaryActions[0] ?? null;

    const buildAction = (action: typeof primary): OrderActionConfig | undefined => {
      if (!action) return undefined;
      switch (action) {
        case 'pay':
          return {
            label: t('orderDetail.action.completePayment'),
            onPress: () => { haptics.heavyPress(); navigation.navigate('Checkout', { orderId }); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.completePaymentA11y') };
        case 'dispatch':
          // Seller paid → guided fulfilment. NEVER a direct generic mark-shipped.
          return {
            label: t('orderDetail.action.shipItem'),
            onPress: () => { haptics.heavyPress(); navigation.navigate('SellerFulfilment', { orderId }); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.shipItemA11y') };
        case 'track_order':
          return {
            label: t('orderDetail.action.trackParcel'),
            onPress: () => {
              haptics.tap();
              if (carrierTrackingUrl) {
                handleTrackOnCarrierSite();
              } else {
                // Scroll to timeline — the tracking section is below.
                scrollViewRef.current?.scrollTo({ y: timelineYRef.current, animated: true });
              }
            },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.trackParcelA11y') };
        case 'inspect':
          // Buyer delivered → check your item before confirming/reviewing.
          return {
            label: t('orderDetail.action.checkItem'),
            onPress: () => { haptics.tap(); openReviewPrompt(); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.checkItemA11y') };
        case 'leave_review':
          return {
            label: t('orderDetail.action.leaveReview'),
            onPress: () => { haptics.tap(); openReviewPrompt(); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.leaveReviewA11y') };
        case 'view_review':
          return {
            label: t('orderDetail.action.viewReview'),
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewReviewA11y') };
        case 'confirm_delivery':
          // Demoted secondary — releases escrowed funds (high-consequence).
          return {
            label: t('orderDetail.action.confirmReceipt'),
            onPress: () => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: t('orderDetail.action.confirmReceiptTitle'),
                message: t('orderDetail.action.confirmReceiptBody'),
                confirmLabel: t('orderDetail.action.confirmReceipt'),
                cancelLabel: t('orderDetail.action.notYet'),
                onConfirm: handleDeliver,
                variant: 'default' });
            },
            variant: 'secondary',
            loading: orderMutation === 'deliver',
            disabled: mutationLocked && orderMutation !== 'deliver',
            accessibilityLabel: 'Confirm delivery — releases funds to seller' };
        case 'cancel':
          return {
            label: t('orderDetail.action.cancelOrder'),
            onPress: () => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: t('orderDetail.action.cancelOrderTitle'),
                message: isBuyer
                  ? t('orderDetail.action.cancelOrderBodyBuyer')
                  : t('orderDetail.action.cancelOrderBodySeller'),
                confirmLabel: t('orderDetail.action.cancelOrder'),
                cancelLabel: t('orderDetail.action.keepOrder'),
                onConfirm: handleCancel,
                variant: 'danger' });
            },
            variant: 'destructive',
            loading: orderMutation === 'cancel',
            disabled: mutationLocked && orderMutation !== 'cancel',
            accessibilityLabel: t('orderDetail.action.cancelOrder') };
        case 'report_issue':
          return {
            label: t('orderDetail.action.reportIssue'),
            onPress: () => { haptics.tap(); setIssueSelectorVisible(true); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.reportIssueA11y') };
        case 'view_resolution':
          return {
            label: t('orderDetail.action.viewResolution'),
            onPress: () => { haptics.tap(); navigation.navigate('SupportTicketDetail', { ticketId: openTicket?.id ?? '' }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewResolutionA11y') };
        case 'contact':
          if (!counterparty) return undefined;
          return {
            label: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }),
            onPress: () => {
              haptics.tap();
              resolveAndOpenConversation(
                counterparty.id,
                backendOrder.listingId,
                counterparty.username,
              );
            },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }) };
        case 'view_receipt':
          return {
            label: t('orderDetail.action.viewReceipt'),
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewReceiptA11y') };
        default:
          return undefined;
      }
    };

    return {
      primary: buildAction(primary),
      secondary: buildAction(secondary) ?? undefined };
  }, [backendOrder, isKnown, capabilities, carrierTrackingUrl, handleTrackOnCarrierSite, handleDeliver, handleCancel, navigation, orderId, isBuyer, counterparty, openTicket, orderMutation, mutationLocked, openReviewPrompt, setIssueSelectorVisible, setConfirmSheet, resolveAndOpenConversation, scrollViewRef, timelineYRef]);

  // --- Copy tracking number ---
  const handleCopyTracking = useCallback(async (trackingNumber: string) => {
    haptics.tap();
    try {
      await Clipboard.setStringAsync(trackingNumber);
      show(t('orderDetail.toast.trackingCopied'), 'success');
    } catch {
      show(t('orderDetail.toast.trackingCopyFailed'), 'error');
    }
  }, [show]);

  // --- Open shipping label ---
  const handleOpenShippingLabel = useCallback(async (url: string) => {
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        show(t('orderDetail.toast.unableOpenShippingLabelUrl'), 'error');
        return;
      }
      await Linking.openURL(url);
    } catch {
      show(t('orderDetail.toast.unableOpenShippingLabel'), 'error');
    }
  }, [show]);

  // --- Manual refresh ---
  const handleManualRefresh = useCallback(() => {
    haptics.tap();
    void refreshOrder(true);
  }, [refreshOrder]);

  // --- Build overflow actions ---
  const overflowActions = useMemo((): OrderActionItem[] => {
    const actions: OrderActionItem[] = [];

    actions.push({
      key: 'receipt',
      label: t('orderDetail.action.viewReceipt'),
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('OrderReceipt', { orderId }) });

    // Guided dispatch is now the primary footer action when the seller can
    // ship — do not duplicate it in overflow (audit finding #1/#9).

    if (counterparty) {
      actions.push({
        key: 'contact',
        label: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }),
        icon: 'chatbubble-outline',
        onPress: () => resolveAndOpenConversation(
          counterparty.id,
          backendOrder?.listingId,
          counterparty.username,
        ) });
    }

    actions.push({
      key: 'support',
      label: t('orderDetail.overflow.getHelp'),
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('OrderSupport', { orderId }) });

    if (isBuyer) {
      actions.push({
        key: 'buyer_protection',
        label: t('orderDetail.overflow.buyerProtection'),
        icon: 'checkmark-circle-outline',
        onPress: () => navigation.navigate('BuyerProtection', { orderId }) });
    }


    if (openTicket) {
      actions.push({
        key: 'view_resolution',
        label: t('orderDetail.action.viewResolution'),
        icon: 'folder-open-outline',
        onPress: () => navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id }),
        variant: 'primary' });
    }

    if (isBuyer && (normalisedStatus === 'delivered' || normalisedStatus === 'completed')) {
      actions.push({
        key: 'review',
        label: t('orderDetail.overflow.writeReview'),
        icon: 'star-outline',
        onPress: () => { haptics.tap(); openReviewPrompt(); },
        variant: 'primary' });
    }

    return actions;
  }, [navigation, orderId, counterparty, backendOrder, openTicket, isBuyer, normalisedStatus, resolveAndOpenConversation, openReviewPrompt]);

  return {
    resolveAndOpenConversation,
    handleTrackOnCarrierSite,
    handleIssueCategorySelect,
    isRespondingExtension,
    handleRespondExtension,
    handleCopyTracking,
    handleOpenShippingLabel,
    handleManualRefresh,
    footerActions,
    overflowActions,
  };
}
