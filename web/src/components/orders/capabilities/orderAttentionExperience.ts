import type { DispatchExtension, FulfilmentSnapshot } from '@/lib/contracts/domain';
import {
  type OrderRole,
  type StatusTone,
  normaliseOrderStatus,
  TERMINAL_STATUSES,
} from './orderStatusModel';
import {
  type OrderCapability,
  type OrderCapabilityContext,
  type OrderAction,
  resolveCapabilities,
} from './orderActionCapabilities';

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

export const ATTENTION_LABEL: Partial<Record<OrderAction, string>> = {
  pay: 'Complete payment',
  respond_extension: 'Respond to the dispatch extension',
  dispatch: 'Dispatch this order',
  view_resolution: 'Return request in progress',
  report_issue: 'Report the problem',
  inspect: 'Check your item',
  confirm_delivery: 'Confirm receipt',
  leave_review: 'Leave a review',
};

export const ATTENTION_RANK: Partial<Record<OrderAction, number>> = {
  pay: 0,
  respond_extension: 1,
  dispatch: 2,
  view_resolution: 3,
  report_issue: 4,
  inspect: 5,
  confirm_delivery: 5,
  leave_review: 6,
};

export function attentionFor(action: OrderAction): OrderAttention {
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

export function getExplanation(key: string, role: OrderRole): string {
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
