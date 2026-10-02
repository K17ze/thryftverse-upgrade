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

export const NEEDS_ACTION_BUYER_STATUSES = new Set(['created']);
export const NEEDS_ACTION_SELLER_STATUSES = new Set(['paid']);
export const ACTIVE_STATUSES = new Set([
  'created', 'paid', 'processing', 'preparing',
  'shipped', 'in transit', 'out for delivery',
  // Carrier-failure states stay Active — the shipment failed but money is
  // still in flight and the order needs resolution. Mirrors the backend
  // classification set; burying them in history would hide live money.
  'delivery failed', 'returned',
]);
export const COMPLETED_STATUSES = new Set(['delivered', 'completed']);
// 'refunding' groups with the cancelled bucket — the backend history filter
// does the same — but it is NOT terminal: the provider outcome is still
// resolving, so the UI shows it as pending money, not a settled loss.
export const CANCELLED_STATUSES = new Set(['cancelled', 'refunded', 'refunding']);
export const TERMINAL_STATUSES = new Set([
  'delivered', 'completed', 'cancelled', 'refunded', 'returned',
]);

// In-transit statuses where the parcel is moving through the carrier network.
// For these, the buyer's primary action is tracking — NOT confirming receipt
// (which releases escrowed funds and is a high-consequence action).
export const IN_TRANSIT_STATUSES = new Set([
  'shipped', 'in transit', 'out for delivery',
]);

// Carrier-failure statuses — the parcel is not moving toward the buyer but
// the tracking trail remains the authoritative evidence both parties need.
export const CARRIER_FAILURE_STATUSES = new Set(['delivery failed', 'returned']);

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

export const STATUS_LABELS: Record<string, string> = {
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
