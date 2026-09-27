/**
 * Order capabilities — 1:1 port of the mobile orderCapabilities.ts
 * (frontend/src/components/orders/orderCapabilities.ts), minus the theme
 * dependency. This is the single canonical status classifier + action
 * resolver: every orders surface consumes it instead of re-deriving
 * status semantics locally.
 *
 * Web delta: legacy fixture orders carry status 'pending' — the web
 * vocabulary for what the backend calls 'paid' (buyer paid, awaiting
 * dispatch). normaliseOrderStatus aliases it so the whole capability tree
 * below stays identical to mobile.
 */

export type OrderClassification =
  | 'needs_action'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'unknown';

export type OrderRole = 'buyer' | 'seller';

export type StatusTone = 'pending' | 'active' | 'success' | 'danger' | 'muted';

export function normaliseOrderStatus(status: string): string {
  const key = status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  // Legacy web fixture vocabulary: 'pending' === the backend's 'paid'.
  if (key === 'pending') return 'paid';
  return key;
}

const NEEDS_ACTION_BUYER_STATUSES = new Set(['created']);
const NEEDS_ACTION_SELLER_STATUSES = new Set(['paid']);
const ACTIVE_STATUSES = new Set([
  'created', 'paid', 'processing', 'preparing',
  'shipped', 'in transit', 'out for delivery',
  // Carrier-failure states stay Active — the shipment failed but money is
  // still in flight and the order needs resolution. Mirrors the backend
  // classification set; burying them in history would hide live money.
  'delivery failed', 'returned',
]);
const COMPLETED_STATUSES = new Set(['delivered', 'completed']);
// 'refunding' groups with the cancelled bucket — the backend history filter
// does the same — but it is NOT terminal: the provider outcome is still
// resolving, so the UI shows it as pending money, not a settled loss.
const CANCELLED_STATUSES = new Set(['cancelled', 'refunded', 'refunding']);
const TERMINAL_STATUSES = new Set([
  'delivered', 'completed', 'cancelled', 'refunded', 'returned',
]);

// In-transit statuses where the parcel is moving through the carrier network.
// For these, the buyer's primary action is tracking — NOT confirming receipt
// (which releases escrowed funds and is a high-consequence action).
const IN_TRANSIT_STATUSES = new Set([
  'shipped', 'in transit', 'out for delivery',
]);

// Carrier-failure statuses — the parcel is not moving toward the buyer but
// the tracking trail remains the authoritative evidence both parties need.
const CARRIER_FAILURE_STATUSES = new Set(['delivery failed', 'returned']);

export function classifyOrder(status: string): OrderClassification {
  const key = normaliseOrderStatus(status);
  if (CANCELLED_STATUSES.has(key)) return 'cancelled';
  if (COMPLETED_STATUSES.has(key)) return 'completed';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'unknown';
}

/** Role-aware classification — 'needs_action' is who-dependent. */
export function classifyOrderForRole(
  status: string,
  role: OrderRole,
): OrderClassification {
  if (needsAction(status, role)) return 'needs_action';
  return classifyOrder(status);
}

export function isInTransitStatus(status: string): boolean {
  return IN_TRANSIT_STATUSES.has(normaliseOrderStatus(status));
}

export function isCarrierFailureStatus(status: string): boolean {
  return CARRIER_FAILURE_STATUSES.has(normaliseOrderStatus(status));
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(normaliseOrderStatus(status));
}

export function isCancelledStatus(status: string): boolean {
  const key = normaliseOrderStatus(status);
  return key === 'cancelled' || key === 'refunded' || key === 'refunding';
}

export function needsBuyerAction(status: string): boolean {
  return NEEDS_ACTION_BUYER_STATUSES.has(normaliseOrderStatus(status));
}

export function needsSellerAction(status: string): boolean {
  return NEEDS_ACTION_SELLER_STATUSES.has(normaliseOrderStatus(status));
}

export function needsAction(status: string, role: OrderRole): boolean {
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
  refunding: 'Refund in progress',
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

export function getStatusTone(status: string): StatusTone {
  const key = normaliseOrderStatus(status);
  if (key === 'refunding') return 'pending';
  // Carrier failure is not a calm active state — it needs attention.
  if (key === 'delivery failed' || key === 'returned') return 'danger';
  if (CANCELLED_STATUSES.has(key)) return 'danger';
  if (COMPLETED_STATUSES.has(key)) return 'success';
  if (NEEDS_ACTION_BUYER_STATUSES.has(key) || NEEDS_ACTION_SELLER_STATUSES.has(key)) return 'pending';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'muted';
}

/** StatusTone → Badge variant. Transit stages get the quieter brand tint,
 *  mirroring the mobile 'social' hue that separates shipped from processing. */
export function statusBadgeVariant(
  status: string,
): 'neutral' | 'success' | 'warning' | 'danger' | 'trust' | 'brand' {
  const key = normaliseOrderStatus(status);
  const tone = getStatusTone(key);
  switch (tone) {
    case 'success': return 'success';
    case 'danger': return 'danger';
    case 'pending': return 'warning';
    case 'active':
      return IN_TRANSIT_STATUSES.has(key) ? 'brand' : 'trust';
    default: return 'neutral';
  }
}

// ─── Capability resolution ──────────────────────────────────────────────────

import type { DispatchExtension, FulfilmentSnapshot } from '@/lib/contracts/domain';

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

// ─── Needs-attention derivation ─────────────────────────────────────────────
//
// The Orders "Needs attention" lane consumes this. It is deliberately broader
// than the backend `needs_action` classification (which only covers
// created/paid): it also bubbles the buyer's post-delivery work — receipt
// confirmation, inspection, review — and pending extension responses, the
// same way eBay's purchase history pulls "pay / confirm / review" rows out of
// the chronological list. Every reason is an OrderAction the capability
// resolver actually offers, so a lane row never promises a state the detail
// surface can't act on. Tracking is NOT attention — the ball is the
// carrier's, not the viewer's.

export interface OrderAttention {
  /** The capability the row is calling out. */
  action: OrderAction;
  /** Flat caption for the lane row (e.g. 'Complete payment'). */
  label: string;
  /** Urgency ordering — lower means act sooner. */
  rank: number;
}

const ATTENTION_LABEL: Partial<Record<OrderAction, string>> = {
  pay: 'Complete payment',
  respond_extension: 'Respond to the dispatch extension',
  dispatch: 'Dispatch this order',
  view_resolution: 'Return request in progress',
  report_issue: 'Report the problem',
  inspect: 'Check your item',
  confirm_delivery: 'Confirm receipt',
  leave_review: 'Leave a review',
};

const ATTENTION_RANK: Partial<Record<OrderAction, number>> = {
  pay: 0,
  respond_extension: 1,
  dispatch: 2,
  view_resolution: 3,
  report_issue: 4,
  inspect: 5,
  confirm_delivery: 5,
  leave_review: 6,
};

function attentionFor(action: OrderAction): OrderAttention {
  return {
    action,
    label: ATTENTION_LABEL[action] ?? action,
    rank: ATTENTION_RANK[action] ?? 9,
  };
}

/** Resolve the one attention item an order presents to the viewer, if any. */
export function orderAttention(ctx: OrderCapabilityContext): OrderAttention | null {
  const caps = resolveCapabilities(ctx);
  const key = normaliseOrderStatus(ctx.status);

  if (caps.primaryAction === 'pay') return attentionFor('pay');
  if (caps.canRespondExtension) return attentionFor('respond_extension');
  if (caps.primaryAction === 'dispatch') return attentionFor('dispatch');
  // An open dispute outranks inspection — it is live money, not housekeeping.
  if (caps.shouldViewResolution) return attentionFor('view_resolution');
  if (caps.primaryAction === 'report_issue') return attentionFor('report_issue');
  // Delivered, unconfirmed — the inspection banner leads when the item is
  // unchecked; once reviewed, confirm receipt is the remaining money action.
  if (ctx.role === 'buyer' && key === 'delivered') {
    return attentionFor(caps.canInspect ? 'inspect' : 'confirm_delivery');
  }
  // Review is a secondary capability in the canonical model (inspect leads
  // while the item is unchecked) — a completed order only surfaces it once
  // nothing above it is still owed.
  if (caps.canReview) return attentionFor('leave_review');
  return null;
}

// ─── Canonical order experience projection ──────────────────────────────────
//
// Per P0-3: screens consume the projection; they do not reinterpret status
// strings. This eliminates the semantic duplication between the capability
// resolver and the detail screen.

export interface OrderExperienceContext {
  status: string;
  role: OrderRole;
  hasOpenResolution: boolean;
  hasReview: boolean;
  reviewIsAuto?: boolean;
  hasTracking: boolean;
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  shipByDate?: string | null;
  dispatchExtension?: DispatchExtension | null;
  isSubmitting?: boolean;
  inspectionDeadlineAt?: string | null;
  estimatedDeliveryAt?: string | null;
  estimatedReleaseAt?: string | null;
}

export interface OrderExperience {
  stateKey: string;
  label: string;
  tone: StatusTone;
  terminal: boolean;
  explanation: string;
  nextActionHint: string | null;
  primaryAction: OrderAction | null;
  secondaryActions: OrderAction[];
  capabilities: OrderCapability;
  inspectionDeadlineAt: string | null;
  estimatedDeliveryAt: string | null;
  estimatedReleaseAt: string | null;
  inspectionWindowOpen: boolean;
}

function getExplanation(key: string, role: OrderRole): string {
  if (key === 'created') return role === 'buyer' ? 'Payment pending.' : 'Awaiting buyer payment.';
  if (key === 'paid') return role === 'seller' ? 'Buyer has paid. Dispatch your item.' : 'Payment received. The seller is preparing your order.';
  if (key === 'shipped' || key === 'in transit') return 'Your parcel is on its way.';
  if (key === 'out for delivery') return 'Your parcel is out for delivery today.';
  if (key === 'delivered') return role === 'buyer' ? 'Your item has been delivered. Check it before confirming.' : 'Item delivered to buyer.';
  if (key === 'completed') return 'Order complete.';
  if (key === 'cancelled') return 'This order was cancelled.';
  if (key === 'refunded') return 'This order was refunded.';
  if (key === 'refunding') return 'Refund in progress.';
  if (key === 'returned') return 'This order was returned.';
  if (key === 'delivery failed') return 'Delivery was attempted but failed.';
  return '';
}

/** The single canonical order experience projection (P0-3). */
export function resolveOrderExperience(ctx: OrderExperienceContext): OrderExperience {
  const capabilities = resolveCapabilities(ctx);
  const key = normaliseOrderStatus(ctx.status);
  const terminal = TERMINAL_STATUSES.has(key);
  const inspectionDeadlineAt = ctx.inspectionDeadlineAt ?? null;
  const estimatedDeliveryAt = ctx.estimatedDeliveryAt ?? null;
  const estimatedReleaseAt = ctx.estimatedReleaseAt ?? null;

  const isDelivered = key === 'delivered' || key === 'completed';
  const inspectionWindowOpen = isDelivered && !ctx.hasReview && (
    inspectionDeadlineAt == null || new Date(inspectionDeadlineAt).getTime() > Date.now()
  );

  return {
    stateKey: key,
    label: capabilities.statusLabel,
    tone: capabilities.statusTone,
    terminal,
    explanation: getExplanation(key, ctx.role),
    nextActionHint: capabilities.nextActionHint,
    primaryAction: capabilities.primaryAction,
    secondaryActions: capabilities.secondaryActions,
    capabilities,
    inspectionDeadlineAt,
    estimatedDeliveryAt,
    estimatedReleaseAt,
    inspectionWindowOpen,
  };
}
