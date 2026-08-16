export type OrderClassification =
  | 'needs_action'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'unknown';

export type OrderRole = 'buyer' | 'seller';

export type StatusTone = 'pending' | 'active' | 'success' | 'danger' | 'muted';

export function normaliseOrderStatus(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const NEEDS_ACTION_BUYER_STATUSES = new Set(['created']);
const NEEDS_ACTION_SELLER_STATUSES = new Set(['paid']);
const ACTIVE_STATUSES = new Set([
  'created', 'paid', 'processing', 'preparing',
  'shipped', 'in transit', 'out for delivery',
]);
const COMPLETED_STATUSES = new Set(['delivered', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'refunded']);
const TERMINAL_STATUSES = new Set([
  'delivered', 'completed', 'cancelled', 'refunded', 'returned',
]);

// In-transit statuses where the parcel is moving through the carrier network.
// For these, the buyer's primary action is tracking — NOT confirming receipt
// (which releases escrowed funds and is a high-consequence action).
const IN_TRANSIT_STATUSES = new Set([
  'shipped', 'in transit', 'out for delivery',
]);

export function classifyOrder(status: string): OrderClassification {
  const key = normaliseOrderStatus(status);
  if (CANCELLED_STATUSES.has(key)) return 'cancelled';
  if (COMPLETED_STATUSES.has(key)) return 'completed';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'unknown';
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(normaliseOrderStatus(status));
}

export function isCancelledStatus(status: string): boolean {
  const key = normaliseOrderStatus(status);
  return key === 'cancelled' || key === 'refunded';
}

export function needsBuyerAction(status: string): boolean {
  return NEEDS_ACTION_BUYER_STATUSES.has(normaliseOrderStatus(status));
}

export function needsSellerAction(status: string): boolean {
  return NEEDS_ACTION_SELLER_STATUSES.has(normaliseOrderStatus(status));
}

export function needsAction(
  status: string,
  role: OrderRole
): boolean {
  return role === 'buyer'
    ? needsBuyerAction(status)
    : needsSellerAction(status);
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Processing',
  preparing: 'Preparing',
  shipped: 'Shipped',
  'in transit': 'In transit',
  'out for delivery': 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  'delivery failed': 'Delivery failed',
  returned: 'Returned',
};

export function humaniseStatus(status: string): string {
  const normalised = normaliseOrderStatus(status);
  if (!normalised) return 'Status unavailable';
  if (STATUS_LABELS[normalised]) return STATUS_LABELS[normalised];
  return normalised
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const STATUS_COLORS: Record<string, string> = {
  created: '#888',
  paid: '#666',
  processing: '#666',
  preparing: '#666',
  shipped: '#666',
  'in transit': '#666',
  'out for delivery': '#666',
  delivered: '#34a853',
  completed: '#34a853',
  cancelled: '#dc3545',
  refunded: '#dc3545',
  'delivery failed': '#dc3545',
  returned: '#dc3545',
};

export function getStatusColor(status: string, fallbackColor = '#888'): string {
  const key = normaliseOrderStatus(status);
  return STATUS_COLORS[key] ?? fallbackColor;
}

export function getStatusTone(status: string): StatusTone {
  const key = normaliseOrderStatus(status);
  if (CANCELLED_STATUSES.has(key)) return 'danger';
  if (COMPLETED_STATUSES.has(key)) return 'success';
  if (NEEDS_ACTION_BUYER_STATUSES.has(key) || NEEDS_ACTION_SELLER_STATUSES.has(key)) return 'pending';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'muted';
}

// ─── Immutable fulfilment snapshot ───────────────────────────────────────────
//
// The buyer's selected shipping service must survive purchase as an immutable
// snapshot on the order. This prevents a seller's later shipping-settings
// change from altering what the buyer paid for. See P0.2 / audit finding #2.

export interface FulfilmentSnapshot {
  quoteId: string | null;
  quoteHash: string | null;
  carrierId: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown';
  etaMinDays: number | null;
  etaMaxDays: number | null;
  trackingIncluded: boolean;
  shipByDate: string | null;
  destinationSummary: string | null;
  parcelProfile: { maxWeightKg: number | null; maxLengthCm: number | null } | null;
}

// ─── Capability resolution ──────────────────────────────────────────────────

export interface OrderCapabilityContext {
  status: string;
  role: OrderRole;
  hasOpenResolution: boolean;
  hasReview: boolean;
  hasTracking: boolean;
  /**
   * Immutable purchased-service snapshot. When present, the seller's guided
   * dispatch flow shows the exact service the buyer paid for and suppresses
   * the generic carrier picker.
   */
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  isSubmitting?: boolean;
}

export interface OrderCapability {
  primaryAction: OrderAction | null;
  secondaryActions: OrderAction[];
  statusLabel: string;
  statusTone: StatusTone;
  nextActionHint: string | null;
  /** Ship-by deadline ISO string, derived from the fulfilment snapshot. */
  shipByDate: string | null;
  /** Human-readable ETA window, e.g. "2–3 days". */
  etaWindow: string | null;
  /** The exact service the buyer paid for (from the immutable snapshot). */
  serviceName: string | null;
  /** Whether the purchased service is carrier-integrated (label/QR) vs manual. */
  deliveryMode: FulfilmentSnapshot['deliveryMode'];
  canDispatch: boolean;
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

/**
 * The single canonical capability resolver for order actions.
 *
 * Every surface that renders an order action — Order Detail, Orders list rows,
 * Chat transaction strip, Seller Hub, notifications — MUST consume this
 * resolver. Screens must not independently recompute canShip/canDeliver/
 * canCancel condition trees (audit finding #3).
 *
 * Key semantic rules (informed by Vinted/Depop August 2026 research):
 *
 *  - Seller paid → primary is `dispatch` (guided fulfilment), NEVER a direct
 *    generic "mark shipped" mutation. The guided flow knows the buyer-selected
 *    service, deadline, and label/QR requirements.
 *  - Buyer in-transit → primary is `track_order`, NOT `confirm_delivery`.
 *    Confirming receipt releases escrowed funds — a high-consequence action
 *    that belongs as a demoted secondary, not the calm in-transit primary.
 *  - Buyer delivered → primary is `inspect` (check your item). Only after the
 *    inspection window does the review become primary. This mirrors Vinted's
 *    2-day buyer protection window after delivery.
 */
export function resolveCapabilities(ctx: OrderCapabilityContext): OrderCapability {
  const key = normaliseOrderStatus(ctx.status);
  const isCancelled = CANCELLED_STATUSES.has(key);
  const isDelivered = key === 'delivered' || key === 'completed';
  const isInTransit = IN_TRANSIT_STATUSES.has(key);
  const isPaid = key === 'paid';
  const isCreated = key === 'created';
  const isTerminal = TERMINAL_STATUSES.has(key);
  const submitting = ctx.isSubmitting ?? false;

  const snap = ctx.fulfilmentSnapshot ?? null;
  const serviceName = snap?.serviceName ?? snap?.carrierId ?? null;
  const deliveryMode = snap?.deliveryMode ?? 'unknown';
  const shipByDate = snap?.shipByDate ?? null;
  const etaWindow = formatEtaWindow(snap?.etaMinDays ?? null, snap?.etaMaxDays ?? null);

  const canDispatch = ctx.role === 'seller' && isPaid && !submitting;
  const canTrack = isInTransit && ctx.hasTracking;
  const canInspect = ctx.role === 'buyer' && isDelivered && !ctx.hasReview && !submitting;
  // Early receipt confirmation is a demoted secondary, available in-transit and
  // after delivery. It releases funds — never the calm primary.
  const canConfirmDelivery = ctx.role === 'buyer' && (isInTransit || isDelivered) && !submitting;
  const canCancel = ctx.role === 'buyer' && (isCreated || isPaid) && !ctx.hasOpenResolution && !submitting;
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
      // Track parcel is the calm in-transit primary.
      // Confirm receipt is a demoted secondary (releases funds).
      primaryAction = canTrack ? 'track_order' : 'confirm_delivery';
    } else if (isDelivered) {
      // After delivery, the buyer should inspect before confirming/reviewing.
      primaryAction = canInspect ? 'inspect' : (ctx.hasReview ? 'view_review' : 'leave_review');
    }
  } else {
    // Seller: paid → guided dispatch. Never a direct generic mark-shipped.
    if (isPaid) primaryAction = 'dispatch';
  }

  // Secondary actions — ordered by priority/relevance.
  if (shouldViewResolution) {
    secondaryActions.push('view_resolution');
  }
  // Tracking is always useful when in-transit, even if it's the primary.
  if (canTrack && primaryAction !== 'track_order') {
    secondaryActions.push('track_order');
  }
  // Early receipt confirmation — demoted. Available in-transit + delivered,
  // but never the primary in-transit action.
  if (canConfirmDelivery && primaryAction !== 'confirm_delivery') {
    secondaryActions.push('confirm_delivery');
  }
  if (canReportIssue && !shouldViewResolution) {
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
    key, ctx.role, ctx.hasOpenResolution, ctx.hasReview, isInTransit, isDelivered,
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

function formatEtaWindow(minDays: number | null, maxDays: number | null): string | null {
  if (minDays == null && maxDays == null) return null;
  if (minDays != null && maxDays != null && minDays !== maxDays) {
    return `${minDays}–${maxDays} days`;
  }
  const single = minDays ?? maxDays;
  if (single == null) return null;
  return `${single} day${single === 1 ? '' : 's'}`;
}

function getNextActionHintInternal(
  key: string,
  role: OrderRole,
  hasOpenResolution: boolean,
  hasReview: boolean,
  isInTransit: boolean,
  isDelivered: boolean,
): string | null {
  if (hasOpenResolution) return 'Issue request open';

  if (role === 'buyer') {
    if (key === 'created') return 'Complete payment';
    if (isInTransit) return 'Track your parcel';
    if (isDelivered) {
      // Inspection window first, then review.
      return hasReview ? 'Review submitted' : 'Check your item';
    }
  }

  if (role === 'seller') {
    if (key === 'paid') return 'Dispatch this order';
    if (isDelivered) return 'Order complete';
  }

  if (key === 'cancelled' || key === 'refunded') return null;

  return null;
}

export function getNextActionHint(
  status: string,
  role: OrderRole
): string | null {
  const key = normaliseOrderStatus(status);
  return getNextActionHintInternal(
    key, role, false, false,
    IN_TRANSIT_STATUSES.has(key),
    key === 'delivered' || key === 'completed',
  );
}
