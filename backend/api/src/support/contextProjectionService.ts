import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type {
  ProjectedOrderContext,
  ProjectedPayoutContext,
  ProjectedListingContext,
  ProjectedSupportContext,
  SupportEntryContext,
  SupportOrderEligibility,
  SupportOrderParcelState,
} from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface OrderRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  total_gbp: string;
  buyer_protection_fee_gbp: string;
  delivered_at: string | null;
  created_at: string;
  tracking_number: string | null;
  shipping_metadata: Record<string, unknown> | null;
}

interface OrderParcelEventRow {
  event_type: string | null;
  occurred_at: string | null;
}

interface ListingRow {
  id: string;
  title: string;
  status: string;
  price_gbp: string;
  seller_id: string;
}

interface PayoutRow {
  id: string;
  user_id: string;
  status: string;
  amount_gbp: string;
  created_at: string;
}

// ── Eligibility derivation ──

/**
 * Derives a coarse support-eligibility code from the order status. This is a
 * projection-time heuristic; the authoritative eligibility is computed by the
 * policy engine (support_policy_decisions). The `policyVersionId` is left null
 * here because the projection layer does not adjudicate policy.
 */
function deriveOrderEligibility(status: string): SupportOrderEligibility {
  switch (status) {
    case 'delivered':
      return { code: 'buyer_protection_window', nextActionAt: null, policyVersionId: null };
    case 'shipped':
      return { code: 'in_transit', nextActionAt: null, policyVersionId: null };
    case 'cancelled':
      return { code: 'closed', nextActionAt: null, policyVersionId: null };
    case 'paid':
      return { code: 'awaiting_shipment', nextActionAt: null, policyVersionId: null };
    case 'created':
      return { code: 'awaiting_payment', nextActionAt: null, policyVersionId: null };
    default:
      return { code: 'unknown', nextActionAt: null, policyVersionId: null };
  }
}

function extractEstimatedDelivery(
  shippingMetadata: Record<string, unknown> | null,
): string | null {
  if (!shippingMetadata) {
    return null;
  }
  const raw = shippingMetadata.estimated_delivery ?? shippingMetadata.estimatedDelivery;
  if (typeof raw === 'string') {
    return raw;
  }
  return null;
}

// ── Public API ──

/**
 * Projects a support-safe view of an order. Address and payment details are
 * deliberately redacted. Returns null if the order does not exist or the user
 * is neither the buyer nor the seller.
 */
export async function projectOrderContext(
  db: Pool,
  orderId: string,
  userId: string,
): Promise<ProjectedOrderContext | null> {
  const orderResult = await db.query<OrderRow>(
    `
      SELECT id, buyer_id, seller_id, status, total_gbp,
             buyer_protection_fee_gbp, delivered_at, created_at,
             tracking_number, shipping_metadata
      FROM orders
      WHERE id = $1
    `,
    [orderId],
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];
  let role: 'buyer' | 'seller';
  if (order.buyer_id === userId) {
    role = 'buyer';
  } else if (order.seller_id === userId) {
    role = 'seller';
  } else {
    return null;
  }

  // Last parcel event (most recent by received_at).
  const eventResult = await db.query<OrderParcelEventRow>(
    `
      SELECT event_type, occurred_at
      FROM order_parcel_events
      WHERE order_id = $1
      ORDER BY received_at DESC
      LIMIT 1
    `,
    [orderId],
  );
  const lastEvent = eventResult.rows[0] ?? null;

  const parcel: SupportOrderParcelState = {
    lastEventType: lastEvent?.event_type ?? null,
    lastEventOccurredAt: lastEvent?.occurred_at ?? null,
    trackingNumber: order.tracking_number,
    estimatedDelivery: extractEstimatedDelivery(order.shipping_metadata ?? null),
  };

  return {
    kind: 'order',
    id: order.id,
    status: order.status,
    totalGbp: order.total_gbp,
    buyerProtectionFeeGbp: order.buyer_protection_fee_gbp,
    deliveredAt: order.delivered_at,
    createdAt: order.created_at,
    role,
    parcel,
    supportEligibility: deriveOrderEligibility(order.status),
  };
}

/**
 * Projects a support-safe view of a listing. Returns null if not found.
 */
export async function projectListingContext(
  db: Pool,
  listingId: string,
): Promise<ProjectedListingContext | null> {
  const result = await db.query<ListingRow>(
    `
      SELECT id, title, status, price_gbp, seller_id
      FROM listings
      WHERE id = $1
    `,
    [listingId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    kind: 'listing',
    id: row.id,
    title: row.title,
    status: row.status,
    priceGbp: row.price_gbp,
    sellerId: row.seller_id,
  };
}

/**
 * Projects a support-safe view of a payout request. Bank account details are
 * deliberately redacted. Returns null if the payout does not exist or does not
 * belong to the user.
 */
export async function projectPayoutContext(
  db: Pool,
  payoutId: string,
  userId: string,
): Promise<ProjectedPayoutContext | null> {
  const result = await db.query<PayoutRow>(
    `
      SELECT id, user_id, status, amount_gbp, created_at
      FROM payout_requests
      WHERE id = $1 AND user_id = $2
    `,
    [payoutId, userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    kind: 'payout',
    id: row.id,
    status: row.status,
    amountGbp: row.amount_gbp,
    createdAt: row.created_at,
  };
}

/**
 * Dispatcher that projects the appropriate support-safe context view based on
 * `contextKind`. Returns null for unsupported kinds or when the underlying
 * object is not found / not accessible to the user.
 */
export async function projectContext(
  db: Pool,
  contextKind: SupportEntryContext['kind'],
  contextId: string,
  userId: string,
): Promise<ProjectedSupportContext> {
  switch (contextKind) {
    case 'order':
      return projectOrderContext(db, contextId, userId);
    case 'listing':
      return projectListingContext(db, contextId);
    case 'payout':
      return projectPayoutContext(db, contextId, userId);
    default:
      // Projections for report, auction, coown_asset, catalog_import and
      // media_job are not yet implemented; return null rather than fabricating
      // data.
      logger.debug(
        { contextKind },
        '[contextProjection] no projection implemented for context kind',
      );
      return null;
  }
}

export { logger };
