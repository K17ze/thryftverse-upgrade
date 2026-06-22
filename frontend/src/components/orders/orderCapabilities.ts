export type OrderClassification =
  | 'needs_action'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'unknown';

export type OrderRole = 'buyer' | 'seller';

export function normaliseOrderStatus(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const NEEDS_ACTION_BUYER_STATUSES = new Set(['created']);
const NEEDS_ACTION_SELLER_STATUSES = new Set(['paid']);
const ACTIVE_STATUSES = new Set(['created', 'paid', 'shipped', 'in transit']);
const COMPLETED_STATUSES = new Set(['delivered', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'refunded']);
const TERMINAL_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'refunded']);

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

export function getNextActionHint(
  status: string,
  role: OrderRole
): string | null {
  const key = normaliseOrderStatus(status);

  if (role === 'buyer') {
    if (key === 'created') return 'Complete payment';
    if (key === 'shipped' || key === 'in transit') return 'Confirm delivery';
  }

  if (role === 'seller') {
    if (key === 'paid') return 'Dispatch item';
  }

  return null;
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Awaiting payment',
  paid: 'Paid',
  shipped: 'Shipped',
  'in transit': 'In transit',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
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
  shipped: '#666',
  'in transit': '#666',
  delivered: '#34a853',
  completed: '#34a853',
  cancelled: '#dc3545',
  refunded: '#dc3545',
};

export function getStatusColor(status: string, fallbackColor = '#888'): string {
  const key = normaliseOrderStatus(status);
  return STATUS_COLORS[key] ?? fallbackColor;
}
