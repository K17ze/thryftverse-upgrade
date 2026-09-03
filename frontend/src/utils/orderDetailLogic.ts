import type { ThemeColors } from '../theme/ThemeContext';
import type { CommerceOrder, OrderParcelEvent } from '../services/commerceApi';
import type { TimelineEntry } from '../components/orders/OrderTrackingTimeline';

// --- Status normalisation ---

export function normaliseOrderStatus(status?: string): string {
  return (status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export const KNOWN_STATUSES = new Set([
  'created',
  'paid',
  'processing',
  'preparing',
  'shipped',
  'in transit',
  'out for delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'delivery failed',
  'returned',
]);

export function isKnownStatus(normalised: string): boolean {
  return KNOWN_STATUSES.has(normalised);
}

export function humaniseStatus(normalised: string): string {
  if (!normalised) {
    return 'Status unavailable';
  }

  const map: Record<string, string> = {
    'created': 'Awaiting payment',
    'paid': 'Paid',
    'processing': 'Processing',
    'preparing': 'Preparing',
    'shipped': 'Shipped',
    'in transit': 'In transit',
    'out for delivery': 'Out for delivery',
    'delivered': 'Delivered',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'refunded': 'Refunded',
    'delivery failed': 'Delivery failed',
    'returned': 'Returned',
  };

  if (map[normalised]) {
    return map[normalised];
  }

  return normalised
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getStatusExplanation(normalised: string): string {
  if (!normalised) {
    return 'The current status of this order is unavailable.';
  }

  const map: Record<string, string> = {
    'created': 'Payment has not been confirmed yet.',
    'paid': 'Payment has been confirmed. The seller has been notified.',
    'processing': 'The order is being processed.',
    'preparing': 'The seller is preparing the item.',
    'shipped': 'The parcel has been dispatched.',
    'in transit': 'The carrier has your parcel.',
    'out for delivery': 'The parcel is out for delivery today.',
    'delivered': 'Delivery has been confirmed.',
    'completed': 'This order is complete.',
    'cancelled': 'This order was cancelled.',
    'refunded': 'This order was refunded.',
    'delivery failed': 'The carrier could not complete delivery.',
    'returned': 'The parcel was returned to the sender.',
  };

  if (map[normalised]) {
    return map[normalised];
  }

  return 'The current status of this order is not fully recognised.';
}

export type StatusTone = 'pending' | 'active' | 'success' | 'danger' | 'muted';

export function getStatusTone(normalised: string): StatusTone {
  if (normalised === 'created') return 'pending';
  if (normalised === 'paid' || normalised === 'processing' || normalised === 'preparing') return 'active';
  if (normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery') return 'active';
  if (normalised === 'delivered' || normalised === 'completed') return 'success';
  if (normalised === 'cancelled' || normalised === 'refunded' || normalised === 'delivery failed' || normalised === 'returned') return 'danger';
  return 'muted';
}

export function resolveStatusColor(tone: StatusTone, colors: ThemeColors): string {
  switch (tone) {
    case 'success': return colors.success;
    case 'active': return colors.brand;
    case 'danger': return colors.danger;
    case 'pending': return colors.warning;
    default: return colors.textMuted;
  }
}

// --- Date formatting ---

export function formatTimelineDate(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Terminal status check ---

export const TERMINAL_STATUSES = new Set([
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'returned',
]);

export function isTerminalStatus(normalised: string): boolean {
  return TERMINAL_STATUSES.has(normalised);
}

// --- Parcel event display ---

export function getParcelEventDisplay(
  eventType: OrderParcelEvent['eventType']
): { label: string; subtitle: string } {
  switch (eventType) {
    case 'picked_up':
      return { label: 'Picked up', subtitle: 'Carrier collected the parcel from the seller.' };
    case 'in_transit':
      return { label: 'In transit', subtitle: 'Parcel is moving through the carrier network.' };
    case 'out_for_delivery':
      return { label: 'Out for delivery', subtitle: 'Parcel is out for delivery today.' };
    case 'delivered':
      return { label: 'Delivered', subtitle: 'Delivery confirmed.' };
    case 'collection_confirmed':
      return { label: 'Collection confirmed', subtitle: 'Collection has been confirmed.' };
    case 'delivery_failed':
      return { label: 'Delivery failed', subtitle: 'Carrier attempted delivery but could not complete it.' };
    case 'returned':
      return { label: 'Returned', subtitle: 'Parcel is being returned to the sender.' };
    default:
      return { label: 'Carrier update', subtitle: 'Carrier event received.' };
  }
}

// --- Timeline semantic keys ---

export type TimelineSemanticKey =
  | 'created'
  | 'paid'
  | 'shipped'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'collection_confirmed'
  | 'delivery_failed'
  | 'returned'
  | 'cancelled'
  | 'refunded'
  | 'completed'
  | 'processing'
  | 'preparing'
  | 'issue_reported'
  | 'review_submitted'
  | 'unknown';

export const PARCEL_EVENT_SEMANTIC_KEY: Record<OrderParcelEvent['eventType'], TimelineSemanticKey> = {
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  collection_confirmed: 'collection_confirmed',
  delivery_failed: 'delivery_failed',
  returned: 'returned',
};

export function getStatusSemanticKey(normalisedStatus: string): TimelineSemanticKey {
  const map: Record<string, TimelineSemanticKey> = {
    'created': 'created',
    'paid': 'paid',
    'processing': 'processing',
    'preparing': 'preparing',
    'shipped': 'shipped',
    'in transit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    'delivered': 'delivered',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
    'delivery failed': 'delivery_failed',
    'returned': 'returned',
  };

  return map[normalisedStatus] ?? 'unknown';
}

// --- Parcel event timestamp ---

export function parcelEventTimestamp(event: OrderParcelEvent): number {
  const value = event.occurredAt ?? event.receivedAt;
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.MAX_SAFE_INTEGER;
}

// --- Timeline builder ---

export interface TimelineExtras {
  hasOpenResolution?: boolean;
  hasReview?: boolean;
  deliveredAt?: string | null;
}

export function buildTimelineEntries(
  normalisedStatus: string,
  order: CommerceOrder | null,
  parcelEvents: OrderParcelEvent[],
  extras?: TimelineExtras
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const represented = new Set<TimelineSemanticKey>();

  entries.push({
    id: 'created',
    label: 'Order created',
    subtitle: 'The order was placed.',
    date: formatTimelineDate(order?.createdAt),
    state: 'completed',
  });
  represented.add('created');

  const paymentProvenStatuses: TimelineSemanticKey[] = [
    'paid', 'processing', 'preparing', 'shipped', 'in_transit',
    'out_for_delivery', 'delivered', 'completed', 'refunded',
    'returned', 'delivery_failed',
  ];
  const currentSemanticKey = getStatusSemanticKey(normalisedStatus);

  if (paymentProvenStatuses.includes(currentSemanticKey)) {
    entries.push({
      id: 'paid',
      label: 'Payment confirmed',
      subtitle: 'Payment has been confirmed.',
      state: 'completed',
    });
    represented.add('paid');
  }

  const hasShippedParcelEvent = parcelEvents.some(
    (e) => e.eventType === 'picked_up' || e.eventType === 'in_transit'
  );
  if (order?.shippedAt && !hasShippedParcelEvent) {
    entries.push({
      id: 'shipped',
      label: 'Shipped',
      subtitle: 'The parcel has been dispatched.',
      date: formatTimelineDate(order.shippedAt),
      state: 'completed',
    });
    represented.add('shipped');
  }

  const sortedEvents = [...parcelEvents].sort(
    (a, b) => parcelEventTimestamp(a) - parcelEventTimestamp(b)
  );

  for (const event of sortedEvents) {
    const display = getParcelEventDisplay(event.eventType);
    const isFailure = event.eventType === 'delivery_failed' || event.eventType === 'returned';
    const semanticKey = PARCEL_EVENT_SEMANTIC_KEY[event.eventType];
    entries.push({
      id: `parcel_${event.id}`,
      label: display.label,
      subtitle: display.subtitle,
      date: formatTimelineDate(event.occurredAt ?? event.receivedAt),
      state: isFailure ? 'failure' : 'completed',
    });
    represented.add(semanticKey);
  }

  const hasDeliveredParcelEvent = parcelEvents.some(
    (e) => e.eventType === 'delivered' || e.eventType === 'collection_confirmed'
  );
  if (order?.deliveredAt && !hasDeliveredParcelEvent) {
    entries.push({
      id: 'delivered',
      label: 'Delivered',
      subtitle: 'Delivery has been confirmed.',
      date: formatTimelineDate(order.deliveredAt),
      state: 'completed',
    });
    represented.add('delivered');
  }

  if (normalisedStatus !== 'created' && !represented.has(currentSemanticKey)) {
    const isFailure =
      currentSemanticKey === 'delivery_failed' ||
      currentSemanticKey === 'returned' ||
      currentSemanticKey === 'cancelled' ||
      currentSemanticKey === 'refunded';
    const isTerminal = isTerminalStatus(normalisedStatus);
    entries.push({
      id: 'current_status',
      label: humaniseStatus(normalisedStatus),
      subtitle: getStatusExplanation(normalisedStatus),
      state: isFailure ? 'failure' : isTerminal ? 'completed' : 'active',
    });
    represented.add(currentSemanticKey);
  }

  if (extras?.hasOpenResolution && !represented.has('issue_reported')) {
    entries.push({
      id: 'issue_reported',
      label: 'Issue reported',
      subtitle: 'A support request is open for this order. Funds remain held in escrow.',
      state: 'active',
    });
    represented.add('issue_reported');
  }

  if (extras?.hasReview && !represented.has('review_submitted')) {
    entries.push({
      id: 'review_submitted',
      label: 'Review submitted',
      subtitle: 'You reviewed this order.',
      date: formatTimelineDate(extras?.deliveredAt),
      state: 'completed',
    });
    represented.add('review_submitted');
  }

  return entries;
}

// --- Review eligibility timestamp ---

/**
 * Computes the timestamp (ms) at which a buyer becomes eligible to review
 * an order. Prefers a server-derived `reviewEligibleAt`; falls back to
 * `deliveredAt + eligibleHours` (default 72h). Returns null when no
 * delivery timestamp is available.
 */
export function computeReviewEligibleAtMs(
  order: CommerceOrder | null,
  eligibleHours = 72
): number | null {
  if (!order) return null;
  const serverEligible = (order as any)?.reviewEligibleAt;
  if (serverEligible) {
    const ms = new Date(serverEligible).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const deliveredAt = order.deliveredAt;
  if (!deliveredAt) return null;
  const ms = new Date(deliveredAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms + eligibleHours * 60 * 60 * 1000;
}

// --- ETA window formatting from fulfilment snapshot ---

/**
 * Formats a human-readable ETA window (e.g. "2–3 days", "1 day") from a
 * fulfilment snapshot's min/max day fields. Returns null when neither is
 * present.
 */
export function formatEtaWindowFromSnapshot(
  snapshot: { etaMinDays: number | null; etaMaxDays: number | null } | null | undefined
): string | null {
  if (!snapshot) return null;
  const min = snapshot.etaMinDays;
  const max = snapshot.etaMaxDays;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) {
    return `${min}–${max} days`;
  }
  const single = min ?? max;
  if (single == null) return null;
  return `${single} day${single === 1 ? '' : 's'}`;
}

// --- Estimated delivery date parsing ---

/**
 * Parses the server-derived `estimatedDeliveryAt` ISO string on an order
 * into a Date. Returns null when absent or invalid. The client must not
 * invent a delivery date — it only formats the server value.
 */
export function parseEstimatedDeliveryDate(
  order: CommerceOrder | null
): Date | null {
  if (!order) return null;
  const serverEta = (order as any)?.estimatedDeliveryAt;
  if (!serverEta) return null;
  const d = new Date(serverEta);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// --- Stale tracking detection ---

/**
 * Determines whether the latest parcel event is stale (> 48h old) while the
 * order is still in a transit state. Used to surface a "tracking may be
 * delayed" warning to the buyer.
 */
export function isStaleTrackingEvent(
  latestParcelEvent: OrderParcelEvent | null,
  normalisedStatus: string,
  staleThresholdHours = 48
): boolean {
  if (!latestParcelEvent) return false;
  if (
    normalisedStatus !== 'shipped' &&
    normalisedStatus !== 'in transit' &&
    normalisedStatus !== 'out for delivery'
  ) {
    return false;
  }
  const lastTime = latestParcelEvent.occurredAt ?? latestParcelEvent.receivedAt;
  const lastMs = new Date(lastTime).getTime();
  if (Number.isNaN(lastMs)) return false;
  const hoursSince = (Date.now() - lastMs) / (60 * 60 * 1000);
  return hoursSince > staleThresholdHours;
}

// --- Package summary formatting ---

/**
 * Formats a compact package summary (weight · dimensions) from a
 * fulfilment snapshot's parcel profile. Returns null when no profile data
 * is available.
 */
export function formatPackageSummary(
  snapshot: { parcelProfile: { maxWeightKg: number | null; maxLengthCm: number | null } | null } | null | undefined
): string | null {
  if (!snapshot) return null;
  const profile = snapshot.parcelProfile;
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.maxWeightKg != null) {
    parts.push(profile.maxWeightKg < 1
      ? `${Math.round(profile.maxWeightKg * 1000)}g`
      : `${profile.maxWeightKg}kg`);
  }
  if (profile.maxLengthCm != null) {
    parts.push(`≤${profile.maxLengthCm}cm`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
