import { describe, expect, it } from 'vitest';
import {
  resolveAuctionPresentationState,
  type AuctionDetailInput,
  type AuctionPresentationLabel,
} from '../utils/auctionDetailLogic';
import type { AuctionEffectiveState } from '../hooks/useServerClock';
import { resolveTimeLabel, type AuctionViewerState } from '../utils/auctionHomeLogic';
import { shouldCloseSheetDueToLifecycle } from '../utils/transactionSheetLogic';
import type { AuctionLifecycle } from '../services/marketApi';

// ── Mock factory ──
// A canonical AuctionDetailInput used as the base for all test cases.
// Individual tests override only the fields relevant to the scenario.

function makeAuctionInput(
  overrides: Partial<AuctionDetailInput> = {},
): AuctionDetailInput {
  return {
    id: 'auc_1',
    listingId: 'list_1',
    sellerId: 'seller_1',
    title: 'Vintage Camera',
    imageUrl: null,
    brand: 'Leica',
    category: 'Cameras',
    conditionLabel: 'Used',
    description: 'A fine vintage camera.',
    startsAt: '2025-01-01T00:00:00Z',
    endsAt: '2025-01-01T06:00:00Z',
    startingBidGbp: 50,
    currentBidGbp: 120,
    minimumNextBidGbp: 125,
    buyNowPriceGbp: 300,
    reservePriceGbp: 100,
    bidCount: 4,
    viewerState: 'not_participating',
    isWatched: false,
    cancelledAt: null,
    settledAt: null,
    paidAt: null,
    paymentDeadlineAt: null,
    secondChanceOfferedTo: null,
    cancelledBy: null,
    cancelledReason: null,
    antiSniping: null,
    winnerBidderId: 'bidder_99',
    lifecycle: 'ended',
    terminalReason: 'scheduled_end',
    fulfilment: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. resolveAuctionPresentationState — new lifecycle states
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveAuctionPresentationState — new lifecycle states', () => {
  describe('reserve_not_met', () => {
    it('labels state as "Reserve not met" and hides bid controls for a non-seller viewer', () => {
      const auction = makeAuctionInput({
        lifecycle: 'reserve_not_met',
        terminalReason: 'reserve_not_met',
        viewerState: 'not_participating',
        winnerBidderId: null,
        bidCount: 2,
        currentBidGbp: 80,
        reservePriceGbp: 150,
      });
      const state = resolveAuctionPresentationState(
        'reserve_not_met',
        'not_participating',
        auction,
      );
      expect(state.stateLabel).toBe('Reserve not met');
      expect(state.showBidControls).toBe(false);
      expect(state.showLiveIndicator).toBe(false);
      expect(state.urgency).toBe('none');
    });

    it('gives the seller a relist primary action and seller treatment', () => {
      const auction = makeAuctionInput({
        lifecycle: 'reserve_not_met',
        terminalReason: 'reserve_not_met',
        viewerState: 'seller',
        sellerId: 'seller_1',
        winnerBidderId: null,
        bidCount: 2,
        currentBidGbp: 80,
        reservePriceGbp: 150,
      });
      const state = resolveAuctionPresentationState(
        'reserve_not_met',
        'seller',
        auction,
      );
      expect(state.stateLabel).toBe('Reserve not met');
      expect(state.viewerTreatment).toBe('seller');
      expect(state.primaryAction.type).toBe('relist');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('none');
    });
  });

  describe('awaiting_payment', () => {
    it('labels state "Awaiting payment" and offers payNow primary action to the winner', () => {
      const auction = makeAuctionInput({
        lifecycle: 'awaiting_payment',
        terminalReason: 'scheduled_end',
        viewerState: 'won',
        winnerBidderId: 'viewer_1',
        paymentDeadlineAt: '2025-01-03T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'awaiting_payment',
        'won',
        auction,
      );
      expect(state.stateLabel).toBe('Awaiting payment');
      expect(state.primaryAction.type).toBe('payNow');
      expect(state.viewerTreatment).toBe('result');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('elevated');
    });

    it('gives the seller an "Awaiting payment" label with seller treatment and viewOutcome action', () => {
      const auction = makeAuctionInput({
        lifecycle: 'awaiting_payment',
        terminalReason: 'scheduled_end',
        viewerState: 'seller',
        sellerId: 'seller_1',
        winnerBidderId: 'bidder_99',
        paymentDeadlineAt: '2025-01-03T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'awaiting_payment',
        'seller',
        auction,
      );
      expect(state.stateLabel).toBe('Awaiting payment');
      expect(state.viewerTreatment).toBe('seller');
      expect(state.primaryAction.type).toBe('viewOutcome');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('none');
    });

    it('shows a subdued treatment for a non-participating viewer', () => {
      const auction = makeAuctionInput({
        lifecycle: 'awaiting_payment',
        terminalReason: 'scheduled_end',
        viewerState: 'not_participating',
        winnerBidderId: 'bidder_99',
        paymentDeadlineAt: '2025-01-03T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'awaiting_payment',
        'not_participating',
        auction,
      );
      expect(state.stateLabel).toBe('Awaiting payment');
      expect(state.viewerTreatment).toBe('subdued');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('none');
    });
  });

  describe('payment_expired', () => {
    it('labels state "Payment expired" and hides bid controls', () => {
      const auction = makeAuctionInput({
        lifecycle: 'payment_expired',
        terminalReason: 'payment_expired',
        viewerState: 'not_participating',
        winnerBidderId: 'bidder_99',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'payment_expired',
        'not_participating',
        auction,
      );
      expect(state.stateLabel).toBe('Payment expired');
      expect(state.showBidControls).toBe(false);
      expect(state.showLiveIndicator).toBe(false);
      expect(state.urgency).toBe('none');
    });

    it('offers a second chance to an outbid viewer when payment expires', () => {
      const auction = makeAuctionInput({
        lifecycle: 'payment_expired',
        terminalReason: 'payment_expired',
        viewerState: 'outbid',
        winnerBidderId: 'bidder_99',
        secondChanceOfferedTo: 'viewer_1',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'payment_expired',
        'outbid',
        auction,
      );
      expect(state.stateLabel).toBe('Payment expired');
      expect(state.primaryAction.type).toBe('acceptSecondChance');
      expect(state.viewerTreatment).toBe('warning');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('none');
    });

    it('gives the seller a subdued seller treatment on payment expiry', () => {
      const auction = makeAuctionInput({
        lifecycle: 'payment_expired',
        terminalReason: 'payment_expired',
        viewerState: 'seller',
        sellerId: 'seller_1',
        winnerBidderId: 'bidder_99',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'payment_expired',
        'seller',
        auction,
      );
      expect(state.stateLabel).toBe('Payment expired');
      expect(state.viewerTreatment).toBe('seller');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('none');
    });
  });

  describe('second_chance_offered', () => {
    it('labels state "Second chance" for the recipient viewer', () => {
      const auction = makeAuctionInput({
        lifecycle: 'second_chance_offered',
        terminalReason: 'second_chance',
        viewerState: 'outbid',
        winnerBidderId: 'bidder_99',
        secondChanceOfferedTo: 'viewer_1',
        paymentDeadlineAt: '2025-01-04T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'second_chance_offered',
        'outbid',
        auction,
      );
      expect(state.stateLabel).toBe('Second chance');
      expect(state.primaryAction.type).toBe('acceptSecondChance');
      expect(state.secondaryAction.type).toBe('declineSecondChance');
      expect(state.viewerTreatment).toBe('warning');
      expect(state.showBidControls).toBe(false);
      expect(state.urgency).toBe('elevated');
    });

    it('labels state "Second chance" for a lost viewer who is the recipient', () => {
      const auction = makeAuctionInput({
        lifecycle: 'second_chance_offered',
        terminalReason: 'second_chance',
        viewerState: 'lost',
        winnerBidderId: 'bidder_99',
        secondChanceOfferedTo: 'viewer_1',
        paymentDeadlineAt: '2025-01-04T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'second_chance_offered',
        'lost',
        auction,
      );
      expect(state.stateLabel).toBe('Second chance');
      expect(state.primaryAction.type).toBe('acceptSecondChance');
      expect(state.showBidControls).toBe(false);
    });
  });

  describe('urgency is none for post-end states', () => {
    // second_chance_offered and awaiting_payment+won are action-required
    // post-end states that use 'elevated' urgency. All other post-end states
    // use 'none' regardless of viewer. These are asserted separately below.
    const postEndNoneStates: AuctionEffectiveState[] = [
      'ended',
      'reserve_not_met',
      'payment_expired',
      'settled',
      'cancelled',
    ];

    for (const effectiveState of postEndNoneStates) {
      it(`${effectiveState} has urgency "none" for a non-winner viewer`, () => {
        const auction = makeAuctionInput({
          lifecycle: effectiveState,
          terminalReason: null,
          viewerState: 'not_participating',
          winnerBidderId: 'bidder_99',
          bidCount: 3,
          currentBidGbp: 110,
          paymentDeadlineAt: '2025-01-03T00:00:00Z',
        });
        const state = resolveAuctionPresentationState(
          effectiveState,
          'not_participating',
          auction,
        );
        expect(state.urgency).toBe('none');
      });
    }

    it('awaiting_payment has urgency "none" for a non-winner viewer', () => {
      const auction = makeAuctionInput({
        lifecycle: 'awaiting_payment',
        terminalReason: 'scheduled_end',
        viewerState: 'not_participating',
        winnerBidderId: 'bidder_99',
        paymentDeadlineAt: '2025-01-03T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'awaiting_payment',
        'not_participating',
        auction,
      );
      expect(state.urgency).toBe('none');
    });

    it('awaiting_payment + won uses elevated urgency (action-required post-end state)', () => {
      const auction = makeAuctionInput({
        lifecycle: 'awaiting_payment',
        terminalReason: 'scheduled_end',
        viewerState: 'won',
        winnerBidderId: 'viewer_1',
        paymentDeadlineAt: '2025-01-03T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'awaiting_payment',
        'won',
        auction,
      );
      expect(state.urgency).toBe('elevated');
    });

    it('second_chance_offered always uses elevated urgency (time-bounded acceptance, viewer-agnostic)', () => {
      const auction = makeAuctionInput({
        lifecycle: 'second_chance_offered',
        terminalReason: 'second_chance',
        viewerState: 'outbid',
        winnerBidderId: 'bidder_99',
        secondChanceOfferedTo: 'viewer_1',
        paymentDeadlineAt: '2025-01-04T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'second_chance_offered',
        'outbid',
        auction,
      );
      expect(state.urgency).toBe('elevated');
    });

    it('second_chance_offered uses elevated urgency even for a non-recipient viewer', () => {
      const auction = makeAuctionInput({
        lifecycle: 'second_chance_offered',
        terminalReason: 'second_chance',
        viewerState: 'not_participating',
        winnerBidderId: 'bidder_99',
        secondChanceOfferedTo: 'other_viewer',
        paymentDeadlineAt: '2025-01-04T00:00:00Z',
        bidCount: 5,
        currentBidGbp: 140,
      });
      const state = resolveAuctionPresentationState(
        'second_chance_offered',
        'not_participating',
        auction,
      );
      expect(state.urgency).toBe('elevated');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolveTimeLabel — new lifecycle states
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveTimeLabel — new lifecycle states', () => {
  it('reserve_not_met → "Reserve not met"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'reserve_not_met',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Reserve not met');
  });

  it('awaiting_payment → "Awaiting payment"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'awaiting_payment',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Awaiting payment');
  });

  it('payment_expired → "Payment expired"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'payment_expired',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Payment expired');
  });

  it('second_chance_offered → "Second chance"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'second_chance_offered',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Second chance');
  });

  // ── Regression: pre-existing states still resolve correctly ──
  it('cancelled → "Cancelled"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'cancelled',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Cancelled');
  });

  it('settled → "Settled"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'settled',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Settled');
  });

  it('ended → "Ended"', () => {
    const label = resolveTimeLabel({
      effectiveState: 'ended',
      msToStart: 0,
      msToEnd: 0,
    });
    expect(label).toBe('Ended');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. shouldCloseSheetDueToLifecycle — new lifecycle states
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldCloseSheetDueToLifecycle — new lifecycle states', () => {
  it('reserve_not_met → true (sheet should close)', () => {
    expect(shouldCloseSheetDueToLifecycle('reserve_not_met')).toBe(true);
  });

  it('awaiting_payment → true', () => {
    expect(shouldCloseSheetDueToLifecycle('awaiting_payment')).toBe(true);
  });

  it('payment_expired → true', () => {
    expect(shouldCloseSheetDueToLifecycle('payment_expired')).toBe(true);
  });

  it('second_chance_offered → true', () => {
    expect(shouldCloseSheetDueToLifecycle('second_chance_offered')).toBe(true);
  });

  // ── Regression: bidding-eligible states must NOT close the sheet ──
  it('live → false', () => {
    expect(shouldCloseSheetDueToLifecycle('live')).toBe(false);
  });

  it('upcoming → false', () => {
    expect(shouldCloseSheetDueToLifecycle('upcoming')).toBe(false);
  });

  // ── Regression: original terminal states still close the sheet ──
  it('ended → true', () => {
    expect(shouldCloseSheetDueToLifecycle('ended')).toBe(true);
  });

  it('cancelled → true', () => {
    expect(shouldCloseSheetDueToLifecycle('cancelled')).toBe(true);
  });

  it('settled → true', () => {
    expect(shouldCloseSheetDueToLifecycle('settled')).toBe(true);
  });

  it('every non-bidding state closes the sheet, every bidding state does not', () => {
    const closes: AuctionEffectiveState[] = [
      'ended',
      'cancelled',
      'settled',
      'reserve_not_met',
      'awaiting_payment',
      'payment_expired',
      'second_chance_offered',
    ];
    const staysOpen: AuctionEffectiveState[] = ['live', 'upcoming'];
    for (const s of closes) {
      expect(shouldCloseSheetDueToLifecycle(s)).toBe(true);
    }
    for (const s of staysOpen) {
      expect(shouldCloseSheetDueToLifecycle(s)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Type-level verification — all 9 lifecycle states present
// ─────────────────────────────────────────────────────────────────────────────

describe('type-level verification — lifecycle state coverage', () => {
  it('AuctionLifecycle includes all 9 canonical states', () => {
    const states: AuctionLifecycle[] = [
      'upcoming',
      'live',
      'ended',
      'reserve_not_met',
      'awaiting_payment',
      'payment_expired',
      'second_chance_offered',
      'settled',
      'cancelled',
    ];
    // De-duplicate to ensure no state is repeated and the count is exactly 9.
    const unique = new Set(states);
    expect(unique.size).toBe(9);
    expect(states).toHaveLength(9);
    expect(states).toContain('reserve_not_met');
    expect(states).toContain('awaiting_payment');
    expect(states).toContain('payment_expired');
    expect(states).toContain('second_chance_offered');
  });

  it('AuctionEffectiveState includes all 9 canonical states', () => {
    const states: AuctionEffectiveState[] = [
      'upcoming',
      'live',
      'ended',
      'reserve_not_met',
      'awaiting_payment',
      'payment_expired',
      'second_chance_offered',
      'settled',
      'cancelled',
    ];
    const unique = new Set(states);
    expect(unique.size).toBe(9);
    expect(states).toHaveLength(9);
    expect(states).toContain('reserve_not_met');
    expect(states).toContain('awaiting_payment');
    expect(states).toContain('payment_expired');
    expect(states).toContain('second_chance_offered');
  });

  it('AuctionPresentationLabel includes the new post-end labels', () => {
    const labels: AuctionPresentationLabel[] = [
      'Scheduled',
      'Live',
      'Ending',
      'Won',
      'Lost',
      'No sale',
      'Cancelled',
      'Settled',
      'Awaiting payment',
      'Payment expired',
      'Second chance',
      'Reserve not met',
      'Settlement pending',
      'Watching',
      'Leading',
      'Outbid',
      'Your auction',
    ];
    expect(labels).toContain('Reserve not met');
    expect(labels).toContain('Awaiting payment');
    expect(labels).toContain('Payment expired');
    expect(labels).toContain('Second chance');
    expect(labels).toContain('Settlement pending');
  });

  it('AuctionViewerState covers all canonical viewer roles', () => {
    const states: AuctionViewerState[] = [
      'not_participating',
      'watching',
      'leading',
      'outbid',
      'won',
      'lost',
      'seller',
    ];
    const unique = new Set(states);
    expect(unique.size).toBe(7);
    expect(states).toContain('won');
    expect(states).toContain('seller');
    expect(states).toContain('outbid');
  });
});
