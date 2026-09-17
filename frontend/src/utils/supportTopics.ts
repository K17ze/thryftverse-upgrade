/**
 * Order support-topic eligibility — the single owner layer for "which
 * topics can this viewer file against this order".
 *
 * Two gates, both duplicated server-side (the client gate exists to keep
 * ineligible topics out of the picker, not to authorise anything):
 *
 *  - Role: buyer-semantics topics (claims against the purchase — not
 *    received, not as described, damaged, wrong item, return) must not be
 *    fileable by the seller viewing the same order.
 *  - Status: a topic only appears while the order is in a status where the
 *    claim is meaningful (e.g. 'not_received' only once the parcel has
 *    shipped or failed/returned; 'not_as_described' only after delivery).
 *    The 'return' topic additionally requires the 14-day return window.
 */

import { isWithinReturnWindow } from './returnCase';

export interface SupportTopicRule {
  id: string;
  label: string;
  description: string;
  requiresStatus: string[] | null;
  /** Buyer-claim semantics — never fileable by the seller. */
  buyerOnly?: boolean;
}

export const SUPPORT_TOPIC_RULES: SupportTopicRule[] = [
  // 'delivery_failed'/'returned' belong in "not received" — a failed or
  // returned parcel is precisely the not-received case for the buyer.
  { id: 'not_received', label: 'Item not received', description: 'My order has not arrived within the expected timeframe.', requiresStatus: ['shipped', 'in transit', 'out for delivery', 'delivered', 'delivery failed', 'returned'], buyerOnly: true },
  { id: 'not_as_described', label: 'Not as described', description: 'The item condition, size, or authenticity does not match the listing.', requiresStatus: ['delivered'], buyerOnly: true },
  { id: 'damaged', label: 'Item arrived damaged', description: 'The item was damaged during shipping or arrived broken.', requiresStatus: ['delivered'], buyerOnly: true },
  { id: 'wrong_item', label: 'Wrong item sent', description: 'I received a different item than what I ordered.', requiresStatus: ['delivered'], buyerOnly: true },
  { id: 'return', label: 'Request a return', description: 'I want to return the item for a refund.', requiresStatus: ['delivered', 'completed'], buyerOnly: true },
  { id: 'payment_issue', label: 'Payment issue', description: 'There was a problem with payment or billing.', requiresStatus: ['created', 'paid'] },
  { id: 'other', label: 'Other issue', description: 'Something else is wrong with my order.', requiresStatus: null },
];

export function filterSupportTopics(
  topics: SupportTopicRule[],
  input: {
    /** Normalised order status (already lowercased/space-normalised). */
    orderStatus: string;
    /** True when the viewer is the order's buyer. False until the order loads. */
    viewerIsBuyer: boolean;
    /** True once the order payload has loaded — before that we cannot prove role. */
    orderLoaded: boolean;
    deliveredAt: string | null;
  },
): SupportTopicRule[] {
  return topics.filter((topic) => {
    // Until the order loads we cannot prove the viewer is the buyer —
    // withhold buyer-only topics rather than flash them to a seller.
    if (topic.buyerOnly && (!input.orderLoaded || !input.viewerIsBuyer)) {
      return false;
    }
    if (topic.requiresStatus !== null && !topic.requiresStatus.includes(input.orderStatus)) {
      return false;
    }
    // The return window (14 days from delivery) is enforced server-side too;
    // gating here just keeps an ineligible topic out of the picker.
    if (topic.id === 'return' && !isWithinReturnWindow(input.deliveredAt)) {
      return false;
    }
    return true;
  });
}
