'use client';

/**
 * useOrderDetailActions — encapsulates order mutations, confirm sheets,
 * counterparty thread navigation, and support/claim submissions.
 */

import { useState } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { QueryClient } from '@tanstack/react-query';
import type { CommerceOrder } from '@/lib/contracts/domain';
import type { ConfirmSheetState } from './ConfirmSheet';
import type { IssueCategory } from './IssueReportSheet';
import type { OrderAction } from './orderCapabilities';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { parseApiError } from '@/lib/api/http';
import { formatPrice } from '@/lib/utils/format';

import type { useOrderActions } from '@/lib/hooks/queries';
import type { useSupportActions } from '@/components/support/useSupportTickets';

interface CounterpartyView {
  id: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  rating: number | null;
}

interface UseOrderDetailActionsOptions {
  order: CommerceOrder;
  counterparty: CounterpartyView | null;
  actions: ReturnType<typeof useOrderActions>;
  createConversation: {
    mutateAsync: (args: { memberIds: string[] }) => Promise<{ id: string }>;
  };
  createTicket: ReturnType<typeof useSupportActions>['createTicket'];
  show: (msg: string, variant?: 'success' | 'error' | 'info') => void;
  router: AppRouterInstance;
  queryClient: QueryClient;
}

export function useOrderDetailActions({
  order,
  counterparty,
  actions,
  createConversation,
  createTicket,
  show,
  router,
  queryClient,
}: UseOrderDetailActionsOptions) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);

  const refreshOrderCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
  };

  const run = (fn: () => Promise<unknown>, toast?: string) => {
    setBusy(true);
    void fn()
      .then(() => {
        if (toast) show(toast, 'success');
      })
      .catch((error) => {
        show(
          parseApiError(error, 'Something went wrong — try again.').message,
          'error',
        );
      })
      .finally(() => {
        setBusy(false);
        setConfirmSheet(null);
        refreshOrderCaches();
      });
  };

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const openCounterpartyThread = () => {
    if (!counterparty) {
      router.push('/inbox');
      return;
    }
    void createConversation
      .mutateAsync({ memberIds: [counterparty.id] })
      .then((conversation) => router.push(`/inbox/${conversation.id}`))
      .catch(() => show('Could not open the conversation', 'error'));
  };

  const copyTracking = async () => {
    if (!order.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(order.trackingNumber);
      show('Tracking number copied', 'success');
    } catch {
      show(order.trackingNumber, 'info');
    }
  };

  const copyOrderNumber = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      show('Order number copied', 'success');
    } catch {
      show(order.id, 'info');
    }
  };

  const handleAction = (action: OrderAction) => {
    switch (action) {
      case 'pay':
        if (DATA_MODE === 'live') {
          router.push(`/checkout?order=${encodeURIComponent(order.id)}`);
          break;
        }
        setConfirmSheet({
          title: `Pay ${formatPrice(order.totalPrice)}?`,
          message:
            'Your saved payment method will be charged and the seller will be asked to dispatch.',
          confirmLabel: 'Pay now',
          onConfirm: () => run(() => actions.payOrder(), 'Payment confirmed.'),
        });
        break;
      case 'dispatch':
        setDispatchOpen(true);
        break;
      case 'track_order':
        scrollTo('tracking');
        break;
      case 'inspect':
        scrollTo('inspection');
        break;
      case 'confirm_delivery':
        setConfirmSheet({
          title: 'Everything is OK?',
          message:
            'By confirming, you confirm the item matches the listing. This releases the held funds to the seller. This action cannot be undone.',
          confirmLabel: 'Confirm receipt',
          onConfirm: () =>
            run(() => actions.confirmReceipt(), 'Receipt confirmed — funds released to the seller.'),
        });
        break;
      case 'cancel':
        setConfirmSheet({
          title: 'Cancel this order?',
          message: 'The listing stays live and no payment is taken.',
          confirmLabel: 'Cancel order',
          cancelLabel: 'Keep order',
          variant: 'destructive',
          onConfirm: () => run(() => actions.cancelOrder(), 'Order cancelled.'),
        });
        break;
      case 'report_issue':
        setIssueOpen(true);
        break;
      case 'view_resolution':
        scrollTo('resolution');
        break;
      case 'leave_review':
      case 'view_review':
        router.push(`/review/${order.id}`);
        break;
      case 'view_receipt':
        router.push(`/orders/${order.id}/receipt`);
        break;
      case 'contact':
        openCounterpartyThread();
        break;
      default:
        break;
    }
  };

  const handleIssueSelect = async (
    category: IssueCategory,
    note: string,
    evidenceUris: string[],
  ) => {
    try {
      const ticket = await createTicket({
        topicId: category.id === 'counterfeit' ? 'verification' : 'order_issue',
        orderRef: order.id,
        message: `${category.label}${note ? ` — ${note}` : ''} (order ${order.id})`,
        evidenceUris: evidenceUris.length ? evidenceUris : undefined,
      });
      setIssueOpen(false);
      show('Support request opened', 'success');
      router.push(`/support/${ticket.id}`);
    } catch (error) {
      show(
        parseApiError(error, 'Could not open the support request — try again.').message,
        'error',
      );
    }
  };

  const submitProtectionClaim = async (input: { reason: string; description: string }) => {
    setClaimBusy(true);
    try {
      if (DATA_MODE === 'live') {
        await commerceService.createProtectionClaim(order.id, input);
        show('Claim submitted — our team will review it.', 'success');
        await queryClient.invalidateQueries({
          queryKey: ['order', order.id, 'protection'],
        });
        void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
        return;
      }
      const ticket = await createTicket({
        topicId: 'order_issue',
        orderRef: order.id,
        message: `Buyer protection claim — ${input.reason} — ${input.description} (order ${order.id})`,
      });
      setProtectionOpen(false);
      show('Claim submitted — our team will review it.', 'success');
      router.push(`/support/${ticket.id}`);
    } catch (error) {
      show(
        parseApiError(error, 'Could not submit the claim — try again.').message,
        'error',
      );
    } finally {
      setClaimBusy(false);
    }
  };

  return {
    actionsOpen,
    setActionsOpen,
    issueOpen,
    setIssueOpen,
    returnOpen,
    setReturnOpen,
    dispatchOpen,
    setDispatchOpen,
    protectionOpen,
    setProtectionOpen,
    confirmSheet,
    setConfirmSheet,
    busy,
    claimBusy,
    run,
    handleAction,
    handleIssueSelect,
    submitProtectionClaim,
    openCounterpartyThread,
    copyTracking,
    copyOrderNumber,
  };
}
