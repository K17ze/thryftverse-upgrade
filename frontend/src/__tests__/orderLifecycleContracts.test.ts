/**
 * Order lifecycle contract regressions — the money-adjacent capability
 * and support-topic rules audited in the commerce wave:
 *
 *  1. confirm_delivery is NEVER offered while the parcel is in transit —
 *     it releases escrowed funds and must wait for authoritative delivery.
 *  2. The in-transit primary is track_order (or nothing when untracked),
 *     never a delivery confirmation.
 *  3. Dispatch-extension responses only exist while the order is 'paid' —
 *     matching the backend's status gate.
 *  4. Support topics are role-gated (buyer claims invisible to sellers)
 *     and status-gated (no 'not received' before shipment).
 */

import { describe, expect, it } from 'vitest';
import {
  resolveCapabilities,
  type OrderCapabilityContext,
} from '../components/orders/orderCapabilities';
import {
  filterSupportTopics,
  SUPPORT_TOPIC_RULES,
} from '../utils/supportTopics';

const base: OrderCapabilityContext = {
  status: 'created',
  role: 'buyer',
  hasOpenResolution: false,
  hasReview: false,
  hasTracking: false,
};

// ── Transit → no confirm_delivery ────────────────────────────────────────────

describe('in-transit orders never offer confirm_delivery', () => {
  for (const status of ['shipped', 'in transit', 'out for delivery', 'in_transit', 'OUT FOR DELIVERY']) {
    it(`status '${status}' — tracked`, () => {
      const cap = resolveCapabilities({ ...base, status, hasTracking: true });
      expect(cap.canConfirmDelivery).toBe(false);
      expect(cap.primaryAction).toBe('track_order');
      expect(cap.secondaryActions).not.toContain('confirm_delivery');
    });

    it(`status '${status}' — untracked`, () => {
      const cap = resolveCapabilities({ ...base, status, hasTracking: false });
      expect(cap.canConfirmDelivery).toBe(false);
      // No tracking → no primary at all. A dead primary is better than a
      // fund-releasing action on a parcel that is still moving.
      expect(cap.primaryAction).toBeNull();
      expect(cap.secondaryActions).not.toContain('confirm_delivery');
    });
  }
});

describe('delivered orders grant confirm_delivery', () => {
  it('delivered — confirm appears as a secondary action', () => {
    const cap = resolveCapabilities({ ...base, status: 'delivered' });
    expect(cap.canConfirmDelivery).toBe(true);
    expect(cap.secondaryActions).toContain('confirm_delivery');
    expect(cap.primaryAction).toBe('inspect');
  });

  it('delivered — sellers never see confirm_delivery', () => {
    const cap = resolveCapabilities({ ...base, status: 'delivered', role: 'seller' });
    expect(cap.canConfirmDelivery).toBe(false);
    expect(cap.secondaryActions).not.toContain('confirm_delivery');
  });
});

// ── Dispatch-extension gating ────────────────────────────────────────────────

describe('dispatch-extension capability follows the paid-only backend gate', () => {
  const pendingExtension = {
    id: 'ext_1',
    days: 3,
    proposedShipBy: '2026-10-01T00:00:00Z',
    proposedBy: 'seller_1',
    status: 'pending' as const,
    createdAt: '2026-09-01T00:00:00Z',
  };

  it('buyer can respond while paid with a pending extension', () => {
    const cap = resolveCapabilities({ ...base, status: 'paid', dispatchExtension: pendingExtension });
    expect(cap.canRespondExtension).toBe(true);
  });

  it('buyer cannot respond once the order has shipped', () => {
    const cap = resolveCapabilities({
      ...base,
      status: 'shipped',
      hasTracking: true,
      dispatchExtension: pendingExtension,
    });
    expect(cap.canRespondExtension).toBe(false);
  });

  it('seller cannot respond to their own proposal', () => {
    const cap = resolveCapabilities({
      ...base,
      status: 'paid',
      role: 'seller',
      dispatchExtension: pendingExtension,
    });
    expect(cap.canRespondExtension).toBe(false);
  });

  it('seller cannot propose while one is already pending', () => {
    const cap = resolveCapabilities({
      ...base,
      status: 'paid',
      role: 'seller',
      dispatchExtension: pendingExtension,
    });
    expect(cap.canProposeExtension).toBe(false);
    expect(cap.primaryAction).toBe('dispatch');
  });
});

// ── Support-topic eligibility ────────────────────────────────────────────────

const topicIds = (args: Parameters<typeof filterSupportTopics>[1]) =>
  filterSupportTopics(SUPPORT_TOPIC_RULES, args).map((t) => t.id);

describe('support topics are role- and status-aware', () => {
  it('buyer on a shipped order sees not_received but not delivered-only topics', () => {
    expect(topicIds({ orderStatus: 'shipped', viewerIsBuyer: true, orderLoaded: true, deliveredAt: null }))
      .toEqual(['not_received', 'other']);
  });

  it('seller never sees buyer-claim topics — even on a delivered order', () => {
    const ids = topicIds({ orderStatus: 'delivered', viewerIsBuyer: false, orderLoaded: true, deliveredAt: null });
    expect(ids).not.toContain('not_received');
    expect(ids).not.toContain('not_as_described');
    expect(ids).not.toContain('damaged');
    expect(ids).not.toContain('wrong_item');
    expect(ids).not.toContain('return');
    expect(ids).toContain('other');
  });

  it('unloaded order withholds buyer-only topics (role not yet proven)', () => {
    const ids = topicIds({ orderStatus: 'delivered', viewerIsBuyer: true, orderLoaded: false, deliveredAt: null });
    expect(ids).not.toContain('not_as_described');
    expect(ids).toContain('other');
  });

  it('a created order offers payment_issue, not delivery claims', () => {
    const ids = topicIds({ orderStatus: 'created', viewerIsBuyer: true, orderLoaded: true, deliveredAt: null });
    expect(ids).toContain('payment_issue');
    expect(ids).not.toContain('not_received');
    expect(ids).not.toContain('not_as_described');
  });

  it('delivery failed / returned orders still offer not_received', () => {
    for (const status of ['delivery failed', 'returned']) {
      expect(topicIds({ orderStatus: status, viewerIsBuyer: true, orderLoaded: true, deliveredAt: null }))
        .toContain('not_received');
    }
  });

  it('return topic requires a delivered order inside the return window', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(topicIds({ orderStatus: 'delivered', viewerIsBuyer: true, orderLoaded: true, deliveredAt: recent }))
      .toContain('return');
    expect(topicIds({ orderStatus: 'paid', viewerIsBuyer: true, orderLoaded: true, deliveredAt: recent }))
      .not.toContain('return');
  });
});
