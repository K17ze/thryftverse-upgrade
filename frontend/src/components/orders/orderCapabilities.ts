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

export function getStatusTone(status: string): StatusTone {
  const key = normaliseOrderStatus(status);
  if (CANCELLED_STATUSES.has(key)) return 'danger';
  if (COMPLETED_STATUSES.has(key)) return 'success';
  if (NEEDS_ACTION_BUYER_STATUSES.has(key) || NEEDS_ACTION_SELLER_STATUSES.has(key)) return 'pending';
  if (ACTIVE_STATUSES.has(key)) return 'active';
  return 'muted';
}

// ─── Capability resolution ──────────────────────────────────────────────────

export interface OrderCapabilityContext {
  status: string;
  role: OrderRole;
  hasOpenResolution: boolean;
  hasReview: boolean;
  hasTracking: boolean;
  isSubmitting?: boolean;
}

export interface OrderCapability {
  primaryAction: OrderAction | null;
  secondaryActions: OrderAction[];
  statusLabel: string;
  statusTone: StatusTone;
  nextActionHint: string | null;
  canDispatch: boolean;
  canConfirmDelivery: boolean;
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
  | 'contact';

export function resolveCapabilities(ctx: OrderCapabilityContext): OrderCapability {
  const key = normaliseOrderStatus(ctx.status);
  const isCancelled = CANCELLED_STATUSES.has(key);
  const isDelivered = key === 'delivered' || key === 'completed';
  const isShipped = key === 'shipped' || key === 'in transit';
  const isPaid = key === 'paid';
  const isCreated = key === 'created';
  const isTerminal = TERMINAL_STATUSES.has(key);
  const submitting = ctx.isSubmitting ?? false;

  const canDispatch = ctx.role === 'seller' && isPaid && !submitting;
  const canConfirmDelivery = ctx.role === 'buyer' && isShipped && !submitting;
  const canCancel = ctx.role === 'buyer' && (isCreated || isPaid) && !ctx.hasOpenResolution && !submitting;
  const canReportIssue = !isCancelled && !isCreated && !ctx.hasOpenResolution && !submitting;
  const shouldViewResolution = ctx.hasOpenResolution;
  const canReview = ctx.role === 'buyer' && isDelivered && !ctx.hasReview && !submitting;
  const shouldViewReview = ctx.role === 'buyer' && isDelivered && ctx.hasReview;
  const canViewReceipt = true;
  const canContact = !isCancelled;
  const canTrack = isShipped && ctx.hasTracking;

  let primaryAction: OrderAction | null = null;
  const secondaryActions: OrderAction[] = [];

  if (ctx.role === 'buyer') {
    if (isCreated) primaryAction = 'pay';
    else if (isShipped) primaryAction = 'confirm_delivery';
    else if (isDelivered && !ctx.hasReview) primaryAction = 'leave_review';
    else if (isDelivered && ctx.hasReview) primaryAction = 'view_review';
  } else {
    if (isPaid) primaryAction = 'dispatch';
  }

  if (shouldViewResolution) {
    secondaryActions.push('view_resolution');
  }
  if (canTrack && primaryAction !== 'confirm_delivery') {
    secondaryActions.push('track_order');
  }
  if (canReportIssue && !shouldViewResolution) {
    secondaryActions.push('report_issue');
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

  const nextActionHint = getNextActionHintInternal(key, ctx.role, ctx.hasOpenResolution, ctx.hasReview);

  return {
    primaryAction,
    secondaryActions,
    statusLabel: humaniseStatus(ctx.status),
    statusTone: getStatusTone(ctx.status),
    nextActionHint,
    canDispatch,
    canConfirmDelivery,
    canCancel,
    canReportIssue,
    shouldViewResolution,
    canReview,
    shouldViewReview,
    canViewReceipt,
    canContact,
  };
}

function getNextActionHintInternal(
  key: string,
  role: OrderRole,
  hasOpenResolution: boolean,
  hasReview: boolean
): string | null {
  if (hasOpenResolution) return 'Issue request open';

  if (role === 'buyer') {
    if (key === 'created') return 'Complete payment';
    if (key === 'shipped' || key === 'in transit') return 'Confirm delivery';
    if (key === 'delivered' || key === 'completed') {
      return hasReview ? 'Review submitted' : 'Leave a review';
    }
  }

  if (role === 'seller') {
    if (key === 'paid') return 'Dispatch this order';
    if (key === 'delivered' || key === 'completed') return 'Order complete';
  }

  if (key === 'cancelled' || key === 'refunded') return null;

  return null;
}

export function getNextActionHint(
  status: string,
  role: OrderRole
): string | null {
  return getNextActionHintInternal(normaliseOrderStatus(status), role, false, false);
}
