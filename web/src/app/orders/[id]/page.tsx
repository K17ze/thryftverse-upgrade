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

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { OrderReviewCard } from '@/components/orders/OrderReviewCard';
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
import { DispatchSheet } from '@/components/orders/DispatchSheet';
import {
  BuyerProtectionSheet,
  type ProtectionCoverage,
} from '@/components/orders/BuyerProtectionSheet';
import { ReservationCountdown } from '@/components/orders/ReservationCountdown';
import {
  isCancelledStatus,
  isCarrierFailureStatus,
  normaliseOrderStatus,
  resolveOrderExperience,
  type OrderAction,
  type OrderRole,
} from '@/components/orders/orderCapabilities';
import {
  useCreateConversation,
  useOrderActions,
  useOrderReturnCase,
} from '@/lib/hooks/queries';
import { useOrder, useOrderAuthentication } from '@/lib/hooks/order-queries';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { parseApiError } from '@/lib/api/http';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses, useSavedPaymentMethods } from '@/lib/store/userPaymentData';
import { useOrderInstrumentFacts } from '@/lib/hooks/instrument-queries';
import { useSupportActions, useSupportTickets } from '@/components/support/useSupportTickets';
import { Skeleton } from '@/components/ui/Skeleton';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { listingById, userById } from '@/lib/data/fixtures';
import {
  commerceOrderDetailFor,
  orderEnrichmentFor,
} from '@/lib/data/fixtures-commerce';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

import type { AppIconName } from '@/components/ui/Icon';
import type { User } from '@/lib/contracts/domain';
import type { SellerSummary } from '@/lib/api/services/users';

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
  view_receipt: 'View receipt',
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

/** Stable empty for the pre-resolution order — keeps the id-list query
 *  identity stable while the order itself is still loading. */
const EMPTY_IDS: string[] = [];

/** The counterparty fields the detail surface renders — both the fixture
 *  user row and the live seller summary map onto it. */
interface CounterpartyView {
  id: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  rating: number | null;
}

function toCounterparty(
  source: User | SellerSummary | null | undefined,
): CounterpartyView | null {
  if (!source) return null;
  if ('isVerified' in source) {
    return {
      id: source.id,
      username: source.username,
      avatar: source.avatar,
      isVerified: source.isVerified,
      rating: source.rating,
    };
  }
  return {
    id: source.id,
    username: source.username,
    avatar: source.avatar,
    isVerified: source.verified,
    rating: source.rating,
  };
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
  const orderId = params?.id ?? '';
  // The order itself — GET /orders/:id, not a list-find over the paginated
  // orders feed (a deep link can reference an order outside that page).
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useOrder(orderId);
  const actions = useOrderActions(orderId);
  const createConversation = useCreateConversation();
  const { data: tickets } = useSupportTickets();
  const { createTicket } = useSupportActions();
  // Live mode pulls the real return case (404 → none); fixture mode reads
  // the enrichment store inline below — no flash for session-local cases.
  const { data: liveReturnCase } = useOrderReturnCase(orderId);

  // Verification pipeline — GET /orders/:id/authentication. The pipeline
  // record is Redis-backed and ephemeral; 'request_pending' is the honest
  // state for a durable flag with no live record — never rendered as a
  // check already running. Fixture mode resolves the session enrichment.
  const authenticationQuery = useOrderAuthentication(orderId);
  const authentication = authenticationQuery.data ?? null;

  // Live resolution — the listing and counterparty come off the wire
  // (GET /listings/:id, GET /sellers/:id); fixture keeps the catalogue.
  // Hooks run before the guards; ids stay null until the order resolves.
  const liveListing = useListingIds(order ? [order.listingId] : EMPTY_IDS);
  const liveSeller = useSellerSummary(
    order && user ? (order.buyerId === user.id ? order.sellerId : order.buyerId) : null,
  );

  // Purchase-summary truth. Fixture keeps the session's resolved defaults
  // (fixture orders carry no instrument refs, so the local default stands
  // in — unchanged). Live resolves the ids stamped on THIS order — GET
  // /orders/:id carries addressId/paymentMethodId — against the real saved
  // rails; an unresolvable ref (wallet-paid, detached method, deleted
  // address) omits the row rather than falling back to a local default.
  const { defaultAddress: fixtureDefaultAddress } = useSavedAddresses();
  const { defaultMethod: fixtureDefaultMethod } = useSavedPaymentMethods();
  const orderFacts = useOrderInstrumentFacts(
    orderId,
    !!user && !!order && order.buyerId === user.id,
  );
  const deliveryAddress =
    DATA_MODE === 'live' ? orderFacts.deliveryAddress : fixtureDefaultAddress;
  const paidWith =
    DATA_MODE === 'live' ? orderFacts.paymentMethod : fixtureDefaultMethod;

  const queryClient = useQueryClient();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);

  // Parcel trail — GET /orders/:id/parcel/events, the carrier's own scans.
  // Live mode only: fixture orders read the authored enrichment trail.
  const { data: parcelTrail } = useQuery({
    queryKey: ['order', orderId, 'parcel-events'],
    queryFn: ({ signal }) => commerceService.fetchParcelEvents(orderId, signal),
    enabled: DATA_MODE === 'live' && !!orderId,
  });

  // Review truth — GET /orders/:id/review. The detail wire row carries no
  // review flag (the list projection emits hasReview, the detail omits
  // it), so the persisted review row is the verdict. Same key the
  // /review/[orderId] composer reads — the cache is shared.
  const { data: orderReview } = useQuery({
    queryKey: ['order', orderId, 'review'],
    queryFn: ({ signal }) => commerceService.fetchOrderReview(orderId, signal),
    enabled: DATA_MODE === 'live' && !!orderId,
    staleTime: 60_000,
  });

  // Buyer-protection coverage — GET /orders/:id/protection is buyer-gated
  // and only fetched while the sheet is open. Fixture mode derives the
  // same coverage shape from the order's fee split below.
  const protectionQuery = useQuery({
    queryKey: ['order', orderId, 'protection'],
    queryFn: ({ signal }) => commerceService.fetchOrderProtection(orderId, signal),
    enabled:
      DATA_MODE === 'live' &&
      protectionOpen &&
      !!order &&
      !!user &&
      order.buyerId === user.id,
  });

  /** Order-action writes invalidate the list cache (queries.ts); the
   *  detail read is its own key — refresh it so the status header and
   *  capability set move with the mutation, not just the list. */
  const refreshOrderCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  };

  const run = (fn: () => Promise<unknown>, toast?: string) => {
    setBusy(true);
    void fn()
      .then(() => {
        if (toast) show(toast, 'success');
      })
      .catch((error) => {
        // Surface the server's own message — a rejected write must never
        // pass silently for the success path it interrupted.
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

  if (sessionLoading || isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (!user) {
    // An order is account-bound — a guest has no order to show.
    return (
      <EmptyState
        icon="profile"
        title="Sign in to view this order"
        subtitle="Purchases and sales are tied to your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
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

  const viewerId = user.id;
  const isBuyer = order.buyerId === viewerId;
  const role: OrderRole = isBuyer ? 'buyer' : 'seller';
  // Live: the wire rows; fixture: the catalogue. An unresolved live id
  // renders the honest placeholder — never a fixture ghost.
  const listing =
    DATA_MODE === 'live'
      ? (liveListing.byId.get(order.listingId) ?? null)
      : listingById(order.listingId);
  const counterparty = toCounterparty(
    DATA_MODE === 'live'
      ? (liveSeller.data ?? null)
      : userById(isBuyer ? order.sellerId : order.buyerId),
  );
  const detail = commerceOrderDetailFor(order);
  const enrichment = orderEnrichmentFor(order.id);
  // Live: the carrier's parcel-event scans are the trail; fixture keeps
  // the authored enrichment events.
  const trackingEvents =
    DATA_MODE === 'live' ? (parcelTrail?.events ?? []) : (enrichment.trackingEvents ?? []);
  // Live: the returns API is the truth. Fixture: the enrichment store.
  const returnCase =
    DATA_MODE === 'live' ? (liveReturnCase ?? null) : (enrichment.returnCase ?? null);
  const openTicket = (tickets ?? []).find(
    (t) => t.orderId === order.id && (t.status === 'open' || t.status === 'in_review'),
  );

  const key = normaliseOrderStatus(order.status);
  const isCompleted = key === 'completed';
  const caseOpen =
    !!openTicket ||
    (returnCase != null && returnCase.status !== 'closed' && returnCase.status !== 'refund_confirmed');
  // Live truth: the server's own open-resolution flag (it covers support
  // tickets AND return cases, so it stands even before the ticket store
  // resolves); the session-locals stay OR'd in for the just-filed case.
  const hasOpenResolution =
    DATA_MODE === 'live' ? order.hasOpenResolution === true || caseOpen : caseOpen;
  // Live truth: only a buyer-authored review counts — a platform
  // auto-feedback row (isAuto) stays supersedeable, so the composer
  // action is still offered (mobile useOrderDetail.ts rule).
  const hasReview =
    DATA_MODE === 'live'
      ? (order.hasReview === true || (orderReview != null && orderReview.isAuto !== true))
      : enrichment.hasReview === true;
  const reviewIsAuto =
    DATA_MODE === 'live' ? orderReview?.isAuto === true : enrichment.reviewIsAuto === true;

  // Seller's read of the order review — the persisted row carries the
  // seller response (live GET /orders/:id/review; fixture enrichment).
  // The respond affordance posts POST /reviews/:id/response and edits in
  // place while the server's window is open.
  const sellerReview = !isBuyer
    ? DATA_MODE === 'live'
      ? orderReview
        ? {
            rating: orderReview.rating,
            text: orderReview.comment,
            isAuto: orderReview.isAuto,
            createdAt: orderReview.createdAt,
            sellerResponse: orderReview.sellerResponse ?? null,
          }
        : null
      : enrichment.hasReview
        ? {
            rating: enrichment.reviewRating ?? 0,
            text: enrichment.reviewText ?? null,
            isAuto: enrichment.reviewIsAuto === true,
            sellerResponse: enrichment.reviewResponse ?? null,
          }
        : null
    : null;

  const experience = resolveOrderExperience({
    status: order.status,
    role,
    hasOpenResolution,
    hasReview,
    reviewIsAuto,
    hasTracking: !!order.trackingNumber || trackingEvents.length > 0,
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

  /**
   * Contact the counterparty — create-or-reuse the DM thread and land
   * inside it (/inbox/[id]), never just the inbox list. Falls back to
   * the inbox only when the counterparty record itself is missing.
   */
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

  // ── Action handlers — capability → sheet/navigation/mutation ─────────────

  const handleAction = (action: OrderAction) => {
    switch (action) {
      case 'pay':
        // Pay THIS order — never a second listing checkout (which would
        // create a duplicate order). Live follows the native grammar:
        // 'pay' returns the buyer to order-bound checkout
        // (CheckoutScreen { orderId }) — /checkout?order= resumes with
        // the stored address/payment/quote seeded, re-binds via PATCH
        // /orders/:id/checkout only when selections diverge, then
        // re-attaches the payment intent. Fixture mode flips the overlay.
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
        // The ship endpoint requires a real tracking number + carrier —
        // collect them in the dispatch sheet rather than firing a bare
        // confirm that 422s.
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
        // The composer lives on its own route — /review/[orderId] owns the
        // write and the read-only published states.
        router.push(`/review/${order.id}`);
        break;
      case 'view_receipt':
        // The receipt is its own printable/shareable surface — the payment
        // section on this page is the summary, not the document.
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
      // The ticket POST is a real server write — a rejected create (409
      // duplicate open request, 422 unowned evidence) must surface the
      // server's own message, not pass silently.
      show(
        parseApiError(error, 'Could not open the support request — try again.').message,
        'error',
      );
    }
  };

  /**
   * Buyer-protection claim — live mode posts the real claim contract
   * (POST /orders/:id/protection/claim) and the sheet's claims list
   * re-reads; fixture mode files the equivalent support ticket and lands
   * on its thread, the same as "Report a problem".
   */
  const submitProtectionClaim = async (input: { reason: string; description: string }) => {
    setClaimBusy(true);
    try {
      if (DATA_MODE === 'live') {
        await commerceService.createProtectionClaim(order.id, input);
        show('Claim submitted — our team will review it.', 'success');
        await queryClient.invalidateQueries({
          queryKey: ['order', orderId, 'protection'],
        });
        // The new claim flips hasOpenResolution — the order read follows.
        void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
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
    // Buyer protection — coverage + claim entry. Paid orders and later;
    // an unpaid or cancelled order has no cover to claim against.
    ...(isBuyer && key !== 'created' && !isCancelledStatus(order.status)
      ? [
          {
            key: 'buyer_protection',
            label: 'Buyer protection',
            icon: 'shield' as const,
            variant: 'default' as const,
            onPress: () => setProtectionOpen(true),
          },
        ]
      : []),
    // Hosted carrier label — the artifact the label path provisioned.
    ...(!isBuyer && order.shippingLabelUrl
      ? [
          {
            key: 'shipping_label',
            label: 'Shipping label',
            icon: 'document' as const,
            variant: 'default' as const,
            onPress: () =>
              window.open(order.shippingLabelUrl!, '_blank', 'noopener,noreferrer'),
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
  const showTracking =
    !isCompleted && (!!order.trackingNumber || trackingEvents.length > 0);
  const showReservationHold = key === 'created' && !!order.checkoutExpiresAt;

  /**
   * Buyer-protection coverage — live mode renders the GET
   * /orders/:id/protection read as-is (amounts arrive in pence). Fixture
   * mode projects the same shape from the order's own fee split under the
   * server's rules (cap £500; window = delivered+30d or created+60d), with
   * the session's order tickets standing in for the claims history.
   */
  const protectionCoverage: ProtectionCoverage | null =
    DATA_MODE === 'live'
      ? protectionQuery.data
        ? {
            covered: protectionQuery.data.status === 'covered',
            feeGbp: protectionQuery.data.feeGbpMinor / 100,
            coverageCapGbp: protectionQuery.data.coverageAmountGbpMinor / 100,
            eligibleUntil: protectionQuery.data.eligibleUntil,
            claims: protectionQuery.data.claims.map((c) => ({
              ticketId: c.ticketId,
              label: c.topicLabel,
              status: c.status,
              createdAt: c.createdAt,
            })),
          }
        : null
      : {
          covered: detail.protectionFee > 0,
          feeGbp: detail.protectionFee,
          coverageCapGbp: Math.min(order.totalPrice, 500),
          eligibleUntil: order.deliveredAt
            ? new Date(Date.parse(order.deliveredAt) + 30 * 86_400_000).toISOString()
            : new Date(Date.parse(order.createdAt) + 60 * 86_400_000).toISOString(),
          claims: (tickets ?? [])
            .filter(
              (t) =>
                t.orderId === order.id &&
                (t.topicId === 'order_issue' || t.topicId === 'refund'),
            )
            .map((t) => ({
              ticketId: t.id,
              label: t.topicLabel,
              status: t.status,
              createdAt: t.createdAt,
            })),
        };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:max-w-[1100px]">
      {/* Status header */}
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back to orders" onClick={() => router.push('/orders')} className="-ml-2" />
        <p className="text-caption text-text-muted">
          Order <span className="tnum font-semibold text-text-secondary">{order.id}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">
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

      {/* Two-pane at lg — the order narrative (summary, fulfilment
          evidence, timeline, resolution) flows down the left column while
          the instrument/fulfilment facts, the capability actions and the
          support entries pin into a sticky right rail (eBay order-detail
          grammar). Mobile stacks the rail after the narrative — identical
          order to the single column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
      <div className="min-w-0">
      {/* Seller dispatch countdown — server deadline, ticking. */}
      {showCountdown ? (
        <div className="mt-4">
          <DispatchCountdown shipByDate={caps.shipByDate} shipped={false} />
        </div>
      ) : null}

      {/* Checkout reservation — an unpaid order's hold on the listing,
          ticking down to release. */}
      {showReservationHold ? (
        <div className="mt-4">
          <ReservationCountdown expiresAt={order.checkoutExpiresAt} />
        </div>
      ) : null}

      {/* Recorded SLA breach — the platform's auto-feedback sweep flagged
          this order past its ship-by while awaiting dispatch. */}
      {!isBuyer && order.slaBreach ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-danger-border bg-danger-subtle px-4 py-2.5 text-caption font-medium text-danger-text">
          <Icon name="alert" size={14} />
          Dispatch deadline missed — recorded on this order.
        </p>
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
        {/* Receipt — the standalone printable/shareable document surface. */}
        <div className="mt-3 border-t border-border-subtle pt-3">
          <Link
            href={`/orders/${order.id}/receipt`}
            className="pressable -my-1.5 flex min-h-11 items-center gap-2.5 text-body text-text-secondary hover:text-text-primary"
          >
            <Icon name="receipt" size={18} className="shrink-0" />
            <span className="flex-1 font-medium">Receipt — printable record</span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </Link>
        </div>
        {/* Order number — copyable; the reference support asks for. At
            lg this fact moves to the instrument rail (hidden here so it
            never renders twice). */}
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 lg:hidden">
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
        {/* Payment method used — fixture renders the session default; live
            resolves the paymentMethodId stamped on this order against the
            real provider rail (omits when unresolvable — wallet-paid or
            detached — never a local stand-in). */}
        {isBuyer && paidWith ? (
          <div className="mt-2.5 flex items-center justify-between lg:hidden">
            <span className="text-caption text-text-muted">Paid with</span>
            <span className="flex items-center gap-1.5 text-caption text-text-secondary">
              <Icon name={paidWith.type === 'card' ? 'card' : 'wallet'} size={14} />
              {paidWith.type === 'bank_account'
                ? (paidWith.bankName ?? 'Bank account')
                : `${
                    paidWith.brand
                      ? paidWith.brand[0].toUpperCase() + paidWith.brand.slice(1)
                      : 'Card'
                  } •••• ${paidWith.last4}`}
            </span>
          </div>
        ) : null}
        {/* Delivery address — the buyer's address this order was placed
            against (live resolves the order's addressId); sellers see only
            the snapshot destination summary the fulfilment record holds. */}
        {isBuyer && deliveryAddress ? (
          <div className="mt-2.5 flex items-start justify-between gap-3 lg:hidden">
            <span className="shrink-0 text-caption text-text-muted">Delivery address</span>
            <span className="text-right text-caption text-text-secondary">
              <span className="block font-medium text-text-primary">{deliveryAddress.name}</span>
              <span className="block">{deliveryAddress.street}</span>
              <span className="block">
                {deliveryAddress.city} {deliveryAddress.postcode}
              </span>
            </span>
          </div>
        ) : null}
        {!isBuyer &&
        (order.fulfilmentSnapshot?.destinationSummary ??
          enrichment.fulfilmentSnapshot?.destinationSummary) ? (
          <div className="mt-2.5 flex items-center justify-between lg:hidden">
            <span className="text-caption text-text-muted">Deliver to</span>
            <span className="text-caption text-text-secondary">
              {order.fulfilmentSnapshot?.destinationSummary ??
                enrichment.fulfilmentSnapshot?.destinationSummary}
            </span>
          </div>
        ) : null}
      </section>

      {/* Counterparty — the identity itself is the profile link (mobile
          OrderCounterpartySection), with Message + View profile actions.
          While the live seller read is in flight the row holds its
          skeleton; a failed read renders nothing (never a ghost). */}
      {!counterparty && DATA_MODE === 'live' && liveSeller.isLoading ? (
        <section className="flex items-center gap-3 border-b border-border-subtle py-4" aria-busy>
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        </section>
      ) : counterparty ? (
        <section className="flex items-center gap-3 border-b border-border-subtle py-4">
          <Link
            href={`/u/${counterparty.username}`}
            aria-label={`Open @${counterparty.username}'s profile`}
            className="pressable flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar src={counterparty.avatar} name={counterparty.username} size={40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-body font-medium text-text-primary">
                <span className="clamp-1">@{counterparty.username}</span>
                {counterparty.isVerified ? (
                  <Icon name="verified" size={12} className="shrink-0 text-commerce-trust" />
                ) : null}
              </span>
              <span className="mt-0.5 block text-caption text-text-secondary">
                {isBuyer ? 'Seller' : 'Buyer'}
                {counterparty.rating != null ? (
                  <>
                    {' · '}
                    <span className="tnum">{counterparty.rating.toFixed(1)}</span> rating
                  </>
                ) : null}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={openCounterpartyThread}
            className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Message
          </button>
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
                () => actions.respondExtension(accept, pendingExtension.id),
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

      {/* Authentication — physical verification on qualifying orders.
          Live reads GET /orders/:id/authentication: the pipeline record
          when it's live, 'request_pending' when only the durable flag
          exists. A failed read keeps the recorded-request state and says
          the live detail couldn't refresh — never a fabricated verdict. */}
      {order.verificationRequested || authentication ? (
        <section className="border-b border-border-subtle py-4">
          <OrderAuthenticationSection
            authentication={authentication}
            verificationRequested={order.verificationRequested === true}
          />
          {DATA_MODE === 'live' && authenticationQuery.isError ? (
            <p className="mt-1 text-caption text-text-muted">
              Verification status couldn’t be refreshed — the recorded request is shown.
            </p>
          ) : null}
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
                onConfirm: () =>
                  run(
                    () => actions.stepIn(returnCase.id),
                    'Thryft is now reviewing this case.',
                  ),
              })
            }
            onAction={(action) =>
              run(() => actions.returnCaseAction(action, returnCase.id), 'Return case updated.')
            }
          />
        </section>
      ) : null}

      {/* Buyer review — the seller's read + their single public response
          (POST /reviews/:id/response; edits version server-side until the
          window closes). Buyer-facing surfaces render the response via
          the reviews read — this card is the seller's authoring spot. */}
      {sellerReview ? (
        <section className="border-b border-border-subtle py-4">
          <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
            Buyer review
          </h2>
          <OrderReviewCard
            review={sellerReview}
            busy={busy}
            onSubmit={(text) =>
              run(
                () =>
                  actions.respondToReview(
                    DATA_MODE === 'live' ? orderReview!.id : order.id,
                    text,
                  ),
                'Response published.',
              )
            }
          />
        </section>
      ) : null}
      </div>

      {/* Right rail — instrument + fulfilment facts, the capability
          action set and the support entries, pinned under the header for
          the whole scroll (the buy-box behaviour the PDP uses). On mobile
          the instrument panel stays hidden — those facts live in the
          purchase summary below 1024px — and the rail stacks in DOM order
          (support → actions), identical to the single column. */}
      <aside className="lg:sticky lg:top-20 lg:flex lg:flex-col lg:self-start">
        {/* Delivery & payment — the instrument facts the summary renders
            inline on mobile, composed as the right-hand column at lg. */}
        <section
          aria-label="Delivery and payment"
          className="hidden lg:order-2 lg:mt-5 lg:block lg:border-y lg:border-border-subtle lg:py-4"
        >
          <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
            Delivery &amp; payment
          </h2>
          <div className="flex items-center justify-between">
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
          {isBuyer && paidWith ? (
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-caption text-text-muted">Paid with</span>
              <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                <Icon name={paidWith.type === 'card' ? 'card' : 'wallet'} size={14} />
                {paidWith.type === 'bank_account'
                  ? (paidWith.bankName ?? 'Bank account')
                  : `${
                      paidWith.brand
                        ? paidWith.brand[0].toUpperCase() + paidWith.brand.slice(1)
                        : 'Card'
                    } •••• ${paidWith.last4}`}
              </span>
            </div>
          ) : null}
          {isBuyer && deliveryAddress ? (
            <div className="mt-2.5 flex items-start justify-between gap-3">
              <span className="shrink-0 text-caption text-text-muted">Delivery address</span>
              <span className="text-right text-caption text-text-secondary">
                <span className="block font-medium text-text-primary">{deliveryAddress.name}</span>
                <span className="block">{deliveryAddress.street}</span>
                <span className="block">
                  {deliveryAddress.city} {deliveryAddress.postcode}
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

      {/* Need help? — contact the counterparty (real /inbox route) and the
          support flow, after the timeline. The open-ticket row leads when
          one exists. */}
      <section className="border-b border-border-subtle py-4 lg:order-3">
        <OrderSupportSection
          openTicket={openTicket ? { id: openTicket.id, topicLabel: openTicket.topicLabel } : null}
          onPressOpenTicket={(ticketId) => router.push(`/support/${ticketId}`)}
          contactLabel={isBuyer ? 'Contact seller' : 'Contact buyer'}
          onContact={openCounterpartyThread}
          onPressGetSupport={() => setIssueOpen(true)}
        />
      </section>

      {/* Actions — capability primary, then the overflow sheet. Live 'pay'
          returns the buyer to order-bound checkout (/checkout?order=) —
          the native CheckoutScreen { orderId } grammar — where changed
          selections re-bind and the payment intent re-attaches. */}
      <section className="flex flex-col gap-2 pt-5 lg:order-1 lg:pt-0">
        {DATA_MODE === 'live' && experience.primaryAction === 'pay' ? (
          <p className="text-center text-caption text-text-secondary">
            Payment isn’t confirmed yet — pay now, or the order can be cancelled below.
          </p>
        ) : null}
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
        ) : !experience.primaryAction && listing && !listing.isSold ? (
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
      </aside>
      </div>

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
      {/* Dispatch — the tracking number + carrier the ship endpoint
          requires. Live posts /orders/:id/ship directly with both; the
          fixture overlay records the same reference. */}
      <DispatchSheet
        open={dispatchOpen}
        defaultCarrier={caps.serviceName}
        busy={busy}
        onSubmit={({ trackingNumber, carrier }) => {
          setDispatchOpen(false);
          run(
            () =>
              DATA_MODE === 'live'
                ? commerceService.shipOrder(order.id, {
                    trackingNumber,
                    shippingProvider: carrier,
                  })
                : actions.markDispatched(trackingNumber),
            'Marked as dispatched — the buyer has been notified.',
          );
        }}
        /* Already dropped off but no scan yet — records the seller's
           claim (handoff_asserted parcel event). It never marks the
           order dispatched; the copy says what the carrier still owes. */
        onAssertHandoff={(input) => {
          setDispatchOpen(false);
          run(
            () =>
              actions.assertHandoff({
                trackingNumber: input.trackingNumber,
                shippingProvider: input.carrier,
              }),
            'Handoff recorded — tracking updates when the carrier scans.',
          );
        }}
        onClose={() => setDispatchOpen(false)}
      />
      <BuyerProtectionSheet
        open={protectionOpen}
        coverage={protectionCoverage}
        loading={DATA_MODE === 'live' && protectionQuery.isLoading}
        error={DATA_MODE === 'live' && protectionQuery.isError}
        canClaim={isBuyer}
        claimBusy={claimBusy}
        onSubmitClaim={(input) => void submitProtectionClaim(input)}
        onClose={() => setProtectionOpen(false)}
      />
    </div>
  );
}
