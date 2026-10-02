import type { DispatchExtension, FulfilmentSnapshot } from '@/lib/contracts/domain';
import {
  type OrderRole,
  type StatusTone,
  normaliseOrderStatus,
  CANCELLED_STATUSES,
  IN_TRANSIT_STATUSES,
  CARRIER_FAILURE_STATUSES,
  humaniseStatus,
  getStatusTone,
} from './orderStatusModel';

export interface OrderCapabilityContext {
  status: string;
  role: OrderRole;
  hasOpenResolution: boolean;
  hasReview: boolean;
  /**
   * TRUE when the order's review row is platform-generated auto feedback
   * (is_auto). Hints copy labels it "Automatic feedback recorded", never
   * "Review submitted" — the buyer did not author it.
   */
  reviewIsAuto?: boolean;
  hasTracking: boolean;
  /** Immutable purchased-service snapshot. */
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  /** Server-computed ship-by deadline — wins over the snapshot value. */
  shipByDate?: string | null;
  /** Latest pending dispatch extension (server-provided). */
  dispatchExtension?: DispatchExtension | null;
  isSubmitting?: boolean;
}

export interface OrderCapability {
  primaryAction: OrderAction | null;
  secondaryActions: OrderAction[];
  statusLabel: string;
  statusTone: StatusTone;
  nextActionHint: string | null;
  shipByDate: string | null;
  etaWindow: string | null;
  serviceName: string | null;
  deliveryMode: FulfilmentSnapshot['deliveryMode'];
  canDispatch: boolean;
  canProposeExtension: boolean;
  canRespondExtension: boolean;
  canConfirmDelivery: boolean;
  canTrack: boolean;
  canInspect: boolean;
  canCancel: boolean;
  canReportIssue: boolean;
  shouldViewResolution: boolean;
  canReview: boolean;
  shouldViewReview: boolean;
  canViewReceipt: boolean;
  canContact: boolean;
}

export type OrderAction =
  | 'pay'
  | 'dispatch'
  | 'propose_extension'
  | 'respond_extension'
  | 'confirm_delivery'
  | 'cancel'
  | 'report_issue'
  | 'view_resolution'
  | 'leave_review'
  | 'view_review'
  | 'view_receipt'
  | 'track_order'
  | 'inspect'
  | 'contact';

export function formatEtaWindow(minDays: number | null, maxDays: number | null): string | null {
  if (minDays == null && maxDays == null) return null;
  if (minDays != null && maxDays != null && minDays !== maxDays) {
    return `${minDays}–${maxDays} days`;
  }
  const single = minDays ?? maxDays;
  if (single == null) return null;
  return `${single} day${single === 1 ? '' : 's'}`;
}

export function getNextActionHintInternal(
  key: string,
  role: OrderRole,
  hasOpenResolution: boolean,
  hasReview: boolean,
  reviewIsAuto: boolean,
  isInTransit: boolean,
  isDelivered: boolean,
): string | null {
  if (hasOpenResolution) return 'Issue request open';

  if (role === 'buyer') {
    if (key === 'created') return 'Complete payment';
    if (key === 'delivery failed') return 'Report the failed delivery';
    if (key === 'returned') return 'Report the returned parcel';
    if (isInTransit) return 'Track your parcel';
    if (isDelivered) {
      if (hasReview) return reviewIsAuto ? 'Automatic feedback recorded' : 'Review submitted';
      return 'Check your item';
    }
  }

  if (role === 'seller') {
    if (key === 'paid') return 'Dispatch this order';
    if (key === 'delivery failed') return 'Carrier reported a failed delivery';
    if (key === 'returned') return 'Parcel is being returned to you';
    if (isDelivered) return 'Order complete';
  }

  if (key === 'cancelled' || key === 'refunded') return null;

  return null;
}

/**
 * The single canonical capability resolver for order actions.
 *
 * Every surface that renders an order action — Order Detail, Orders list
 * rows, inbox strips — MUST consume this resolver rather than recomputing
 * canShip/canDeliver condition trees (audit finding #3).
 *
 * Key semantic rules:
 *  - Seller paid → primary is `dispatch` (guided fulfilment), never a bare
 *    "mark shipped" mutation.
 *  - Buyer in-transit → primary is `track_order`. Receipt confirmation is
 *    NOT available during transit — it releases escrowed funds and must
 *    only be available after authoritative delivery.
 *  - Buyer delivered → primary is `inspect` (check your item); receipt
 *    confirmation sits behind the inspection banner's explicit confirm.
 */
export function resolveCapabilities(ctx: OrderCapabilityContext): OrderCapability {
  const key = normaliseOrderStatus(ctx.status);
  const isCancelled = CANCELLED_STATUSES.has(key);
  const isDelivered = key === 'delivered' || key === 'completed';
  const isInTransit = IN_TRANSIT_STATUSES.has(key);
  const isCarrierFailure = CARRIER_FAILURE_STATUSES.has(key);
  const isPaid = key === 'paid';
  const isCreated = key === 'created';
  const submitting = ctx.isSubmitting ?? false;

  const snap = ctx.fulfilmentSnapshot ?? null;
  const serviceName = snap?.serviceName ?? snap?.carrierId ?? null;
  const deliveryMode = snap?.deliveryMode ?? 'unknown';
  const shipByDate = ctx.shipByDate ?? snap?.shipByDate ?? null;
  const etaWindow = formatEtaWindow(snap?.etaMinDays ?? null, snap?.etaMaxDays ?? null);

  const canDispatch = ctx.role === 'seller' && isPaid && !submitting;
  const pendingExtension = ctx.dispatchExtension?.status === 'pending'
    ? ctx.dispatchExtension
    : null;
  const canProposeExtension = ctx.role === 'seller' && isPaid && !pendingExtension && !submitting;
  const canRespondExtension = ctx.role === 'buyer' && isPaid && pendingExtension != null && !submitting;
  const canTrack = (isInTransit || isCarrierFailure) && ctx.hasTracking;
  const canInspect = ctx.role === 'buyer' && isDelivered && !ctx.hasReview && !submitting;
  // Receipt confirmation releases escrowed funds — a high-consequence money
  // action. It must NOT be available while the parcel is merely in transit.
  const canConfirmDelivery = ctx.role === 'buyer' && isDelivered && !submitting;
  // Cancellation is only legal while the order is unpaid ('created') —
  // paid orders route through the return/refund flow instead.
  const canCancel = ctx.role === 'buyer' && isCreated && !ctx.hasOpenResolution && !submitting;
  const canReportIssue = !isCancelled && !isCreated && !ctx.hasOpenResolution && !submitting;
  const shouldViewResolution = ctx.hasOpenResolution;
  const canReview = ctx.role === 'buyer' && isDelivered && !ctx.hasReview && !submitting;
  const shouldViewReview = ctx.role === 'buyer' && isDelivered && ctx.hasReview;
  const canViewReceipt = true;
  const canContact = !isCancelled;

  let primaryAction: OrderAction | null = null;
  const secondaryActions: OrderAction[] = [];

  if (ctx.role === 'buyer') {
    if (isCreated) {
      primaryAction = 'pay';
    } else if (isInTransit) {
      primaryAction = canTrack ? 'track_order' : null;
    } else if (isCarrierFailure) {
      primaryAction = ctx.hasOpenResolution ? 'view_resolution' : 'report_issue';
    } else if (isDelivered) {
      primaryAction = canInspect ? 'inspect' : (ctx.hasReview ? 'view_review' : 'leave_review');
    }
  } else {
    if (isPaid) primaryAction = 'dispatch';
    else if (isCarrierFailure && canTrack) primaryAction = 'track_order';
  }

  if (shouldViewResolution && primaryAction !== 'view_resolution') {
    secondaryActions.push('view_resolution');
  }
  if (canTrack && primaryAction !== 'track_order') {
    secondaryActions.push('track_order');
  }
  if (canConfirmDelivery) {
    secondaryActions.push('confirm_delivery');
  }
  if (canReportIssue && !shouldViewResolution && primaryAction !== 'report_issue') {
    secondaryActions.push('report_issue');
  }
  if (canReview && primaryAction !== 'leave_review') {
    secondaryActions.push('leave_review');
  }
  if (canCancel && primaryAction !== 'pay') {
    secondaryActions.push('cancel');
  }
  if (canContact) {
    secondaryActions.push('contact');
  }
  if (canViewReceipt) {
    secondaryActions.push('view_receipt');
  }
  if (shouldViewReview && primaryAction !== 'view_review') {
    secondaryActions.push('view_review');
  }

  const nextActionHint = getNextActionHintInternal(
    key, ctx.role, ctx.hasOpenResolution, ctx.hasReview,
    ctx.reviewIsAuto === true, isInTransit, isDelivered,
  );

  return {
    primaryAction,
    secondaryActions,
    statusLabel: humaniseStatus(ctx.status),
    statusTone: getStatusTone(ctx.status),
    nextActionHint,
    shipByDate,
    etaWindow,
    serviceName,
    deliveryMode,
    canDispatch,
    canProposeExtension,
    canRespondExtension,
    canConfirmDelivery,
    canTrack,
    canInspect,
    canCancel,
    canReportIssue,
    shouldViewResolution,
    canReview,
    shouldViewReview,
    canViewReceipt,
    canContact,
  };
}

export function getNextActionHint(
  status: string,
  role: OrderRole,
): string | null {
  const key = normaliseOrderStatus(status);
  return getNextActionHintInternal(
    key, role, false, false, false,
    IN_TRANSIT_STATUSES.has(key),
    key === 'delivered' || key === 'completed',
  );
}
