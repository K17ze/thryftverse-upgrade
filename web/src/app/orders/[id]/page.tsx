'use client';

/**
 * /orders/[id] — order detail. One capability-driven surface, ported from
 * the mobile OrderDetailScreen: status header + explanation, dispatch
 * countdown, escrow/ETA/carrier-failure/inspection/extension banners,
 * tracking trail, the eBay purchase-summary box (item, postage, itemized
 * fees, copyable order number, payment method, delivery address),
 * counterparty, authentication, return case, 4-milestone timeline, "Need
 * help?" entries, and a capability-driven action set with a "More actions"
 * sheet. Skeleton, error, not-found and populated states.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { OrderStatusBadge } from '@/components/orders/OrderRow';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { OrderDetailSkeleton } from '@/components/orders/OrderDetailSkeleton';
import { EscrowBanner } from '@/components/orders/EscrowBanner';
import { CarrierFailureBanner } from '@/components/orders/CarrierFailureBanner';
import { DispatchCountdown } from '@/components/orders/DispatchCountdown';
import { DispatchExtensionBanner } from '@/components/orders/DispatchExtensionBanner';
import { InspectionBanner } from '@/components/orders/InspectionBanner';
import { OrderTrackingSection } from '@/components/orders/OrderTrackingSection';
import { OrderAuthenticationSection } from '@/components/orders/OrderAuthenticationSection';
import { ReturnCaseCard } from '@/components/orders/ReturnCaseCard';
import { OrderSupportSection } from '@/components/orders/OrderSupportSection';
import {
  OrderActionsSheet,
  type OrderActionItem,
} from '@/components/orders/OrderActionsSheet';
import {
  IssueReportSheet,
  type IssueCategory,
} from '@/components/orders/IssueReportSheet';
import { ReturnRequestSheet } from '@/components/orders/ReturnRequestSheet';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import {
  isCancelledStatus,
  isCarrierFailureStatus,
  normaliseOrderStatus,
  resolveOrderExperience,
  type OrderAction,
  type OrderRole,
} from '@/components/orders/orderCapabilities';
import { useCommerceOrders, useOrderActions } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses, useSavedPaymentMethods } from '@/lib/store/userPaymentData';
import { useSupportActions, useSupportTickets } from '@/components/support/useSupportTickets';
import { listingById, userById } from '@/lib/data/fixtures';
import {
  commerceOrderDetailFor,
  orderEnrichmentFor,
} from '@/lib/data/fixtures-commerce';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

import type { AppIconName } from '@/components/ui/Icon';

const ACTION_LABEL: Record<OrderAction, string> = {
  pay: 'Pay now',
  dispatch: 'Mark as dispatched',
  propose_extension: 'Propose dispatch extension',
  respond_extension: 'Respond to extension',
  confirm_delivery: 'Confirm receipt',
  cancel: 'Cancel order',
  report_issue: 'Report a problem',
  view_resolution: 'View return request',
  leave_review: 'Leave a review',
  view_review: 'Reviewed — thanks',
  view_receipt: 'View payment details',
  track_order: 'Track parcel',
  inspect: 'Check your item',
  contact: 'Message',
};

const ACTION_ICON: Partial<Record<OrderAction, AppIconName>> = {
  confirm_delivery: 'check',
  cancel: 'closeCircle',
  report_issue: 'flag',
  view_resolution: 'shield',
  leave_review: 'star',
  view_review: 'star',
  view_receipt: 'receipt',
  track_order: 'box',
  contact: 'chat',
  pay: 'card',
  dispatch: 'send',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useCommerceOrders();

  const orderId = params?.id ?? '';
  const actions = useOrderActions(orderId);
  const { data: tickets } = useSupportTickets();
  const { createTicket } = useSupportActions();

  const order = useMemo(
    () => (orders ?? []).find((o) => o.id === orderId) ?? null,
    [orders, orderId],
  );

  // Purchase-summary truth — the payment method and delivery address the
  // session actually holds (fixture seeds + session additions). The order
  // contract carries no per-order payment snapshot, so the session's
  // resolved default stands in; nothing here is invented per order.
  const { defaultAddress } = useSavedAddresses();
  const { defaultMethod } = useSavedPaymentMethods();

  const [actionsOpen, setActionsOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<unknown>, toast?: string) => {
    setBusy(true);
    void fn()
      .then(() => {
        if (toast) show(toast, 'success');
      })
      .finally(() => {
        setBusy(false);
        setConfirmSheet(null);
      });
  };

  if (isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this order"
        subtitle="Check your connection and try again — the order is safe."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon="receipt"
        title="Order not found"
        subtitle="This order may have been removed, or the link is incomplete."
        actionLabel="View all orders"
        onAction={() => router.push('/orders')}
      />
    );
  }

  const viewerId = user?.id ?? 'me';
  const isBuyer = order.buyerId === viewerId;
  const role: OrderRole = isBuyer ? 'buyer' : 'seller';
  const listing = listingById(order.listingId);
  const counterparty = userById(isBuyer ? order.sellerId : order.buyerId);
  const detail = commerceOrderDetailFor(order);
  const enrichment = orderEnrichmentFor(order.id);
  const returnCase = enrichment.returnCase ?? null;
  const openTicket = (tickets ?? []).find(
    (t) => t.orderRef === order.id && (t.status === 'open' || t.status === 'in_review'),
  );

  const key = normaliseOrderStatus(order.status);
  const isCompleted = key === 'completed';
  const caseOpen =
    !!openTicket ||
    (returnCase != null && returnCase.status !== 'closed' && returnCase.status !== 'refund_confirmed');

  const experience = resolveOrderExperience({
    status: order.status,
    role,
    hasOpenResolution: caseOpen,
    hasReview: enrichment.hasReview === true,
    reviewIsAuto: enrichment.reviewIsAuto === true,
    hasTracking: !!order.trackingNumber || (enrichment.trackingEvents?.length ?? 0) > 0,
    fulfilmentSnapshot: order.fulfilmentSnapshot ?? enrichment.fulfilmentSnapshot ?? null,
    shipByDate: order.shipByDate ?? enrichment.shipByDate ?? null,
    dispatchExtension:
      enrichment.dispatchExtension !== undefined
        ? enrichment.dispatchExtension
        : (order.dispatchExtension ?? null),
    inspectionDeadlineAt: order.inspectionDeadlineAt ?? enrichment.inspectionDeadlineAt ?? null,
    estimatedDeliveryAt: order.estimatedDeliveryAt ?? enrichment.estimatedDeliveryAt ?? null,
    estimatedReleaseAt: order.estimatedReleaseAt ?? enrichment.estimatedReleaseAt ?? null,
  });
  const caps = experience.capabilities;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

  // ── Action handlers — capability → sheet/navigation/mutation ─────────────

  const handleAction = (action: OrderAction) => {
    switch (action) {
      case 'pay':
        router.push(`/checkout?item=${order.listingId}`);
        break;
      case 'dispatch':
        setConfirmSheet({
          title: 'Mark as dispatched?',
          message:
            'The buyer will be notified and the parcel trail opens. Funds are released once the buyer confirms receipt.',
          confirmLabel: 'Mark as dispatched',
          onConfirm: () => run(() => actions.markDispatched(), 'Marked as dispatched'),
        });
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
        // The composer lives on its own route — /review/[orderId] owns the
        // write and the read-only published states.
        router.push(`/review/${order.id}`);
        break;
      case 'view_receipt':
        scrollTo('payment');
        break;
      case 'contact':
        router.push('/inbox');
        break;
      default:
        break;
    }
  };

  const handleIssueSelect = async (category: IssueCategory, note: string) => {
    const ticket = await createTicket({
      topicId: category.id === 'counterfeit' ? 'verification' : 'order_issue',
      orderRef: order.id,
      message: `${category.label}${note ? ` — ${note}` : ''} (order ${order.id})`,
    });
    setIssueOpen(false);
    show('Support request opened', 'success');
    router.push(`/support/${ticket.id}`);
  };

  const contextualIssues: IssueCategory[] =
    key === 'delivery failed'
      ? [{ id: 'delivery_failed', label: 'Delivery failed', description: 'The carrier could not deliver your parcel' }]
      : key === 'returned'
        ? [{ id: 'returned', label: 'Parcel returned', description: 'Your parcel was sent back to the seller' }]
        : [];

  // ── Actions sheet rows — secondary capabilities + housekeeping ───────────

  const pendingExtension =
    (enrichment.dispatchExtension !== undefined
      ? enrichment.dispatchExtension
      : (order.dispatchExtension ?? null));

  const sheetActions: OrderActionItem[] = [
    ...caps.secondaryActions.map((a) => ({
      key: a,
      label:
        a === 'contact'
          ? isBuyer
            ? 'Message seller'
            : 'Message buyer'
          : ACTION_LABEL[a],
      icon: ACTION_ICON[a] ?? 'forward',
      variant: (a === 'cancel' ? 'destructive' : a === 'confirm_delivery' ? 'primary' : 'default') as
        | 'default'
        | 'primary'
        | 'destructive',
      onPress: () => handleAction(a),
    })),
    // Request a return — buyer, post-delivery, no open case.
    ...(isBuyer && (key === 'delivered' || key === 'completed') && !returnCase
      ? [
          {
            key: 'request_return',
            label: 'Request a return',
            icon: 'repeat' as const,
            variant: 'default' as const,
            onPress: () => setReturnOpen(true),
          },
        ]
      : []),
    {
      key: 'view_listing',
      label: 'View listing',
      icon: 'tag',
      variant: 'default',
      onPress: () => router.push(`/item/${order.listingId}`),
    },
  ];

  const showEscrow =
    isBuyer &&
    !isCompleted &&
    ['paid', 'shipped', 'in transit', 'out for delivery'].includes(key);
  const showInspection = isBuyer && key === 'delivered' && experience.inspectionWindowOpen;
  const showCountdown = role === 'seller' && key === 'paid';
  const trackingEvents = enrichment.trackingEvents ?? [];
  const showTracking =
    !isCompleted && (!!order.trackingNumber || trackingEvents.length > 0);

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      {/* Status header */}
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back to orders" onClick={() => router.push('/orders')} className="-ml-2" />
        <p className="text-caption text-text-muted">
          Order <span className="tnum font-semibold text-text-secondary">{order.id}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title font-bold text-text-primary">
          {isBuyer ? 'Your purchase' : 'Your sale'}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-caption text-text-secondary">
        Placed {formatDate(order.createdAt)}
      </p>
      {experience.explanation ? (
        <p className="mt-2 text-body text-text-secondary">{experience.explanation}</p>
      ) : null}
      {experience.nextActionHint && !isCompleted && !isCancelledStatus(order.status) ? (
        <p className="mt-1 flex items-center gap-1.5 text-caption font-medium text-warning-text">
          <Icon name="alert" size={14} />
          {experience.nextActionHint}
        </p>
      ) : null}

      {/* Seller dispatch countdown — server deadline, ticking. */}
      {showCountdown ? (
        <div className="mt-4">
          <DispatchCountdown shipByDate={caps.shipByDate} shipped={false} />
        </div>
      ) : null}

      {/* Carrier failure — money still in flight. */}
      {isCarrierFailureStatus(order.status) ? (
        <div className="mt-4">
          <CarrierFailureBanner status={order.status} isBuyer={isBuyer} />
        </div>
      ) : null}

      {/* Purchase summary — the eBay box: item line with thumbnail and
          per-unit price, postage, the itemized fees, total, the copyable
          order number, the payment method used and the delivery address. */}
      <section className="mt-6 border-y border-border-subtle py-4" id="payment">
        <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
          {isBuyer ? 'Purchase summary' : 'Sale summary'}
        </h2>
        <Link href={`/item/${order.listingId}`} className="pressable flex items-center gap-3">
          <span className="w-16 shrink-0 overflow-hidden rounded-md">
            <AppImage
              src={getListingCoverUri(listing?.images)}
              alt={listing?.title ?? 'Order item'}
              aspectRatio={0.8}
              focalPoint={getCategoryFocalPoint(listing?.category)}
              sizes="64px"
              className="w-full"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="clamp-1 text-body font-medium text-text-primary">
              {listing?.title ?? 'Item'}
            </span>
            <span className="mt-0.5 block text-caption text-text-secondary">
              {[listing?.brand, listing?.size ? `Size ${listing.size}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className="tnum shrink-0 text-body font-semibold text-text-primary">
            {formatPrice(detail.itemPrice)}
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
        <dl className="mt-3 flex flex-col gap-2">
          <div className="flex justify-between text-body text-text-secondary">
            <dt>
              Postage
              {detail.carrier
                ? ` · ${[detail.carrier, detail.service].filter(Boolean).join(' ')}`
                : ''}
            </dt>
            <dd className="tnum text-text-primary">
              {detail.shippingFee > 0 ? formatPrice(detail.shippingFee) : 'Included'}
            </dd>
          </div>
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Buyer Protection</dt>
            <dd className="tnum text-text-primary">{formatPrice(detail.protectionFee)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-border-subtle pt-3">
            <dt className="text-body-emphasis font-semibold text-text-primary">
              {isBuyer ? 'Total paid' : 'You earned'}
            </dt>
            <dd className="tnum text-price-list font-bold text-text-primary">
              {formatPrice(isBuyer ? order.totalPrice : detail.itemPrice)}
            </dd>
          </div>
        </dl>
        {/* Order number — copyable; the reference support asks for. */}
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
          <span className="text-caption text-text-muted">Order number</span>
          <button
            type="button"
            onClick={copyOrderNumber}
            aria-label={`Copy order number ${order.id}`}
            className="pressable -my-2 flex items-center gap-1.5 rounded-sm py-2 text-caption text-text-secondary hover:text-text-primary"
          >
            <span className="tnum">{order.id}</span>
            <Icon name="document" size={14} />
          </button>
        </div>
        {/* Payment method used — the session's real saved method; the order
            contract carries no per-order snapshot, so nothing is invented. */}
        {isBuyer && defaultMethod ? (
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-caption text-text-muted">Paid with</span>
            <span className="flex items-center gap-1.5 text-caption text-text-secondary">
              <Icon name={defaultMethod.type === 'card' ? 'card' : 'wallet'} size={14} />
              {defaultMethod.type === 'bank_account'
                ? (defaultMethod.bankName ?? 'Bank account')
                : `${
                    defaultMethod.brand
                      ? defaultMethod.brand[0].toUpperCase() + defaultMethod.brand.slice(1)
                      : 'Card'
                  } •••• ${defaultMethod.last4}`}
            </span>
          </div>
        ) : null}
        {/* Delivery address — the buyer's real saved address; sellers see
            only the snapshot destination summary the fulfilment record holds. */}
        {isBuyer && defaultAddress ? (
          <div className="mt-2.5 flex items-start justify-between gap-3">
            <span className="shrink-0 text-caption text-text-muted">Delivery address</span>
            <span className="text-right text-caption text-text-secondary">
              <span className="block font-medium text-text-primary">{defaultAddress.name}</span>
              <span className="block">{defaultAddress.street}</span>
              <span className="block">
                {defaultAddress.city} {defaultAddress.postcode}
              </span>
            </span>
          </div>
        ) : null}
        {!isBuyer &&
        (order.fulfilmentSnapshot?.destinationSummary ??
          enrichment.fulfilmentSnapshot?.destinationSummary) ? (
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-caption text-text-muted">Deliver to</span>
            <span className="text-caption text-text-secondary">
              {order.fulfilmentSnapshot?.destinationSummary ??
                enrichment.fulfilmentSnapshot?.destinationSummary}
            </span>
          </div>
        ) : null}
      </section>

      {/* Counterparty */}
      {counterparty ? (
        <section className="flex items-center gap-3 border-b border-border-subtle py-4">
          <Avatar src={counterparty.avatar} name={counterparty.username} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-body font-medium text-text-primary">
              <span className="clamp-1">@{counterparty.username}</span>
              {counterparty.isVerified ? (
                <Icon name="verified" size={12} className="shrink-0 text-success-text" />
              ) : null}
            </p>
            <p className="text-caption text-text-secondary">
              {isBuyer ? 'Seller' : 'Buyer'} ·{' '}
              <span className="tnum">{counterparty.rating.toFixed(1)}</span> rating
            </p>
          </div>
          <Link
            href={`/u/${counterparty.username}`}
            className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            View profile
          </Link>
        </section>
      ) : null}

      {/* Escrow — funds held until confirmed receipt */}
      {showEscrow ? (
        <section className="border-b border-border-subtle py-4">
          <EscrowBanner status={order.status} estimatedReleaseAt={experience.estimatedReleaseAt} />
        </section>
      ) : null}

      {/* Pending dispatch extension — buyer responds inline */}
      {pendingExtension?.status === 'pending' ? (
        <section className="border-b border-border-subtle py-4">
          <DispatchExtensionBanner
            extension={pendingExtension}
            isBuyer={isBuyer}
            canRespondExtension={caps.canRespondExtension}
            isResponding={busy}
            onRespond={(accept) =>
              run(
                () => actions.respondExtension(accept),
                accept ? 'Extension accepted — new deadline applies.' : 'Extension declined.',
              )
            }
          />
        </section>
      ) : null}

      {/* Buyer inspection window */}
      {showInspection ? (
        <section id="inspection" className="border-b border-border-subtle py-4">
          <InspectionBanner
            inspectionDeadlineAt={experience.inspectionDeadlineAt}
            onConfirmReceipt={() => handleAction('confirm_delivery')}
            onReportIssue={() => setIssueOpen(true)}
          />
        </section>
      ) : null}

      {/* Tracking trail — carrier-scan evidence. */}
      {showTracking ? (
        <section className="border-b border-border-subtle py-4">
          <OrderTrackingSection
            trackingNumber={order.trackingNumber}
            carrier={detail.carrier}
            service={detail.service}
            isBuyer={isBuyer}
            status={order.status}
            etaWindow={caps.etaWindow}
            estimatedDeliveryAt={experience.estimatedDeliveryAt}
            serviceName={caps.serviceName}
            events={trackingEvents}
            onCopyTracking={copyTracking}
          />
        </section>
      ) : null}

      {/* Milestones — ordered → paid → shipped → delivered. Always rendered:
          the parcel trail above is carrier evidence; this is the order state
          machine. Cancelled/refunded orders render the honest banner inside
          OrderTimeline instead of fake progress; carrier failures skip this
          section — the dedicated CarrierFailureBanner already owns that
          state above. */}
      {!isCarrierFailureStatus(order.status) ? (
        <section className="border-b border-border-subtle py-4">
          <OrderTimeline order={order} detail={detail} />
        </section>
      ) : null}

      {/* Authentication — physical verification on qualifying orders */}
      {order.verificationRequested || enrichment.authentication ? (
        <section className="border-b border-border-subtle py-4">
          <OrderAuthenticationSection
            authentication={enrichment.authentication ?? null}
            verificationRequested={order.verificationRequested === true}
          />
        </section>
      ) : null}

      {/* Return case — status + legal transitions */}
      {returnCase ? (
        <section className="border-b border-border-subtle py-4">
          <ReturnCaseCard
            returnCase={returnCase}
            isBuyer={isBuyer}
            isSubmitting={busy}
            onStepIn={() =>
              setConfirmSheet({
                title: 'Ask Thryft to step in?',
                message:
                  'Our team will review the case and decide the outcome. The seller will no longer be able to resolve it directly.',
                confirmLabel: 'Ask Thryft to step in',
                cancelLabel: 'Not yet',
                onConfirm: () => run(() => actions.stepIn(), 'Thryft is now reviewing this case.'),
              })
            }
            onAction={(action) =>
              run(() => actions.returnCaseAction(action), 'Return case updated.')
            }
          />
        </section>
      ) : null}

      {/* Need help? — contact the counterparty (real /inbox route) and the
          support flow, after the timeline. The open-ticket row leads when
          one exists. */}
      <section className="border-b border-border-subtle py-4">
        <OrderSupportSection
          openTicket={openTicket ? { id: openTicket.id, topicLabel: openTicket.topicLabel } : null}
          onPressOpenTicket={(ticketId) => router.push(`/support/${ticketId}`)}
          contactLabel={isBuyer ? 'Contact seller' : 'Contact buyer'}
          onContact={() => router.push('/inbox')}
          onPressGetSupport={() => setIssueOpen(true)}
        />
      </section>

      {/* Actions — capability primary, then the overflow sheet */}
      <section className="flex flex-col gap-2 pt-5">
        {experience.primaryAction ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={busy}
            onClick={() => handleAction(experience.primaryAction!)}
          >
            {ACTION_LABEL[experience.primaryAction]}
          </Button>
        ) : listing && !listing.isSold ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push(`/item/${order.listingId}`)}
          >
            Buy again
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="md"
          fullWidth
          icon="more"
          onClick={() => setActionsOpen(true)}
        >
          More actions
        </Button>
      </section>

      {/* Sheets */}
      <OrderActionsSheet
        open={actionsOpen}
        orderStatus={order.status}
        role={role}
        orderId={order.id}
        actions={sheetActions}
        onClose={() => setActionsOpen(false)}
      />
      <IssueReportSheet
        open={issueOpen}
        contextualIssues={contextualIssues}
        onSelect={handleIssueSelect}
        onClose={() => setIssueOpen(false)}
      />
      <ReturnRequestSheet
        open={returnOpen}
        orderTotalGbp={order.totalPrice}
        itemTitle={listing?.title}
        onSubmit={(input) => {
          setReturnOpen(false);
          run(() => actions.requestReturn(input), 'Return requested — the seller has been notified.');
        }}
        onClose={() => setReturnOpen(false)}
      />
      <ConfirmSheet sheet={confirmSheet} busy={busy} onDismiss={() => setConfirmSheet(null)} />
    </div>
  );
}
