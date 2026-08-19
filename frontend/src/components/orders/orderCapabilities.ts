export type OrderClassification =
  | 'needs_action'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'unknown';

import type { ThemeColors } from '../../theme/ThemeContext';

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

/**
 * Maps a normalised order status to a semantic tone, then resolves that tone
 * to a theme token colour. This replaces the former hardcoded hex map and
 * ensures status badges are fully theme-aware (light/dark/high-contrast).
 *
 * Tone mapping (informed by August 2026 mobile UX research):
 *  - pending  (created/awaiting payment)  → warning (amber)
 *  - active   (processing/preparing)      → commerceTrust (blue)
 *  - active   (shipped/in transit/OFD)    → social (muted mauve — distinct from processing blue)
 *  - success  (delivered/completed)       → success (green)
 *  - danger   (cancelled/refunded/failed) → danger (red)
 *  - muted    (unknown)                   → textMuted
 */
export function getStatusColor(
  status: string,
  colorsOrFallback: ThemeColors | string = '#888',
): string {
  const key = normaliseOrderStatus(status);
  const tone = getStatusTone(key);

  // Backward-compat: if a plain string fallback is passed, use legacy hex.
  if (typeof colorsOrFallback === 'string') {
    const LEGACY_HEX: Record<StatusTone, string> = {
      pending: '#B8742E',
      active: key === 'shipped' || key === 'in transit' || key === 'out for delivery' ? '#6B3245' : '#06489A',
      success: '#215634',
      danger: '#9b0202',
      muted: colorsOrFallback,
    };
    return LEGACY_HEX[tone];
  }

  const colors = colorsOrFallback;
  switch (tone) {
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    case 'pending':
      return colors.warning;
    case 'active':
      // Transit stages get a distinct hue from processing stages so buyers
      // can scan the list and immediately see "shipped" vs "preparing".
      if (key === 'shipped' || key === 'in transit' || key === 'out for delivery') {
        return colors.social;
      }
      return colors.commerceTrust;
    default:
      return colors.textMuted;
  }
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
 *  - Buyer in-transit → primary is `track_order`. Receipt confirmation is
 *    NOT available during transit — it releases escrowed funds and must
 *    only be available after authoritative delivery.
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
  // Receipt confirmation releases escrowed funds — a high-consequence money
  // action. It must NOT be available while the parcel is merely in transit.
  // Only authoritative delivery (status='delivered') grants this capability
  // by default. A server capability envelope may grant an exception with
  // an explicit policy version/reason, but the client must never infer it
  // from a transit status string.
  const canConfirmDelivery = ctx.role === 'buyer' && isDelivered && !submitting;
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
  // Receipt confirmation — only after authoritative delivery.
  // It releases funds and is never available during transit.
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

// ─── Canonical order experience projection ───────────────────────────────────
//
// Per P0-3: "Create one domain projection: resolveOrderExperience(...)"
// Screens consume the projection; they do not reinterpret status strings.
// This eliminates the semantic duplication between orderCapabilities.ts
// and OrderDetailScreen.tsx (local status normalization, labels, tones,
// terminal sets, timeline mapping).

export interface OrderExperienceContext {
  status: string;
  role: OrderRole;
  hasOpenResolution: boolean;
  hasReview: boolean;
  hasTracking: boolean;
  fulfilmentSnapshot?: FulfilmentSnapshot | null;
  isSubmitting?: boolean;
  /** Server-provided inspection window deadline (ISO). */
  inspectionDeadlineAt?: string | null;
  /** Server-provided estimated delivery date (ISO). */
  estimatedDeliveryAt?: string | null;
  /** Server-provided escrow release estimate (ISO). */
  estimatedReleaseAt?: string | null;
}

export interface OrderExperience {
  /** Canonical state key (normalised status). */
  stateKey: string;
  /** Human-readable display label. */
  label: string;
  /** Visual tone for badges/indicators. */
  tone: StatusTone;
  /** Whether this is a terminal state. */
  terminal: boolean;
  /** Passive explanation of the current state. */
  explanation: string;
  /** Next action hint for the viewer. */
  nextActionHint: string | null;
  /** Primary action for the viewer. */
  primaryAction: OrderAction | null;
  /** Secondary actions, ordered by relevance. */
  secondaryActions: OrderAction[];
  /** Capabilities (same as resolveCapabilities). */
  capabilities: OrderCapability;
  /** Server-derived inspection deadline (ISO), if available. */
  inspectionDeadlineAt: string | null;
  /** Server-derived estimated delivery (ISO), if available. */
  estimatedDeliveryAt: string | null;
  /** Server-derived escrow release estimate (ISO), if available. */
  estimatedReleaseAt: string | null;
  /** Whether the inspection window is open. */
  inspectionWindowOpen: boolean;
}

function getExplanation(key: string, role: OrderRole): string {
  if (key === 'created') return role === 'buyer' ? 'Payment pending.' : 'Awaiting buyer payment.';
  if (key === 'paid') return role === 'seller' ? 'Buyer has paid. Dispatch your item.' : 'Payment received. Seller is preparing your order.';
  if (key === 'shipped' || key === 'in transit') return 'Your parcel is on its way.';
  if (key === 'out for delivery') return 'Your parcel is out for delivery today.';
  if (key === 'delivered') return role === 'buyer' ? 'Your item has been delivered. Check it before confirming.' : 'Item delivered to buyer.';
  if (key === 'completed') return 'Order complete.';
  if (key === 'cancelled') return 'This order was cancelled.';
  if (key === 'refunded') return 'This order was refunded.';
  if (key === 'returned') return 'This order was returned.';
  if (key === 'delivery failed') return 'Delivery was attempted but failed.';
  return '';
}

/**
 * The single canonical order experience projection.
 *
 * Every surface that renders order state — Order Detail, My Orders, Chat
 * transaction strip, Seller Hub, notifications — MUST consume this
 * projection. Screens must not independently normalize status strings,
 * compute labels, tones, or terminal sets.
 *
 * Per P0-3: "No route screen may normalize status strings independently."
 */
export function resolveOrderExperience(ctx: OrderExperienceContext): OrderExperience {
  const capabilities = resolveCapabilities(ctx);
  const key = normaliseOrderStatus(ctx.status);
  const terminal = TERMINAL_STATUSES.has(key);
  const inspectionDeadlineAt = ctx.inspectionDeadlineAt ?? null;
  const estimatedDeliveryAt = ctx.estimatedDeliveryAt ?? null;
  const estimatedReleaseAt = ctx.estimatedReleaseAt ?? null;

  // Inspection window is open only after delivery and before the deadline.
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
