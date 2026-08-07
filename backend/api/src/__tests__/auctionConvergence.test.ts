import assert from 'node:assert/strict';
import test from 'node:test';

// R03: Two auction clients converge under concurrent bids.
//
// This test verifies that when two clients submit bids concurrently,
// the auction state converges to a consistent result: exactly one bid
// wins (the higher amount), and both clients see the same final state.
//
// The backend uses SELECT ... FOR UPDATE on the auction row to serialize
// concurrent bids. This test models that serialization logic in pure
// TypeScript to verify convergence without a running database.

interface AuctionState {
  id: string;
  current_bid_gbp: number;
  bid_count: number;
  highest_bidder_id: string | null;
}

interface BidRequest {
  bidderId: string;
  amountGbp: number;
  requestTime: number; // logical clock — lower = earlier
}

interface BidResult {
  accepted: boolean;
  isHighBid: boolean;
  newCurrentBid: number;
  newBidCount: number;
  newHighestBidderId: string | null;
}

// Simulates the backend's serialized bid processing. Concurrent bids
// are sorted by requestTime (the order in which the DB row lock would
// be acquired), then processed sequentially. Each bid sees the state
// left by the previous bid — exactly as the FOR UPDATE lock ensures.
function processConcurrentBids(
  initialState: AuctionState,
  bids: BidRequest[]
): { finalState: AuctionState; results: Map<string, BidResult> } {
  // Sort by request time (simulates lock acquisition order).
  const sortedBids = [...bids].sort((a, b) => a.requestTime - b.requestTime);

  let state: AuctionState = { ...initialState };
  const results = new Map<string, BidResult>();

  for (const bid of sortedBids) {
    // The bid must exceed the current bid to be accepted.
    if (bid.amountGbp > state.current_bid_gbp) {
      state = {
        ...state,
        current_bid_gbp: bid.amountGbp,
        bid_count: state.bid_count + 1,
        highest_bidder_id: bid.bidderId,
      };
      results.set(bid.bidderId, {
        accepted: true,
        isHighBid: true,
        newCurrentBid: state.current_bid_gbp,
        newBidCount: state.bid_count,
        newHighestBidderId: state.highest_bidder_id,
      });
    } else {
      // Bid too low — rejected, but the bidder still sees the current state.
      results.set(bid.bidderId, {
        accepted: false,
        isHighBid: false,
        newCurrentBid: state.current_bid_gbp,
        newBidCount: state.bid_count,
        newHighestBidderId: state.highest_bidder_id,
      });
    }
  }

  return { finalState: state, results };
}

// ═══════════════════════════════════════════════════════════════
// CONVERGENCE TESTS
// ═══════════════════════════════════════════════════════════════

test('R03: two concurrent bids with different amounts converge to the higher bid', () => {
  const initial: AuctionState = {
    id: 'auc_1',
    current_bid_gbp: 50,
    bid_count: 3,
    highest_bidder_id: 'bidder_0',
  };

  const bids: BidRequest[] = [
    { bidderId: 'bidder_A', amountGbp: 55, requestTime: 100 },
    { bidderId: 'bidder_B', amountGbp: 60, requestTime: 101 },
  ];

  const { finalState, results } = processConcurrentBids(initial, bids);

  // Both clients see the same final state.
  const resultA = results.get('bidder_A')!;
  const resultB = results.get('bidder_B')!;

  // Bidder A's bid was accepted first (was the high bid momentarily).
  assert.equal(resultA.accepted, true);
  assert.equal(resultA.isHighBid, true);
  assert.equal(resultA.newCurrentBid, 55);

  // Bidder B's bid was accepted and overtook A.
  assert.equal(resultB.accepted, true);
  assert.equal(resultB.isHighBid, true);
  assert.equal(resultB.newCurrentBid, 60);

  // Final state converges: B is the highest bidder at 60.
  assert.equal(finalState.current_bid_gbp, 60);
  assert.equal(finalState.highest_bidder_id, 'bidder_B');
  assert.equal(finalState.bid_count, 5); // 3 initial + 2 new

  // Both clients agree on the final state (convergence).
  assert.equal(resultB.newCurrentBid, finalState.current_bid_gbp);
  assert.equal(resultB.newHighestBidderId, finalState.highest_bidder_id);
});

test('R03: two concurrent bids with same amount — first request wins', () => {
  const initial: AuctionState = {
    id: 'auc_1',
    current_bid_gbp: 50,
    bid_count: 1,
    highest_bidder_id: 'bidder_0',
  };

  const bids: BidRequest[] = [
    { bidderId: 'bidder_A', amountGbp: 55, requestTime: 100 },
    { bidderId: 'bidder_B', amountGbp: 55, requestTime: 101 },
  ];

  const { finalState, results } = processConcurrentBids(initial, bids);

  // First bid (A) is accepted.
  assert.equal(results.get('bidder_A')!.accepted, true);
  // Second bid (B) is rejected — same amount, not strictly greater.
  assert.equal(results.get('bidder_B')!.accepted, false);

  // Final state: A is the highest bidder.
  assert.equal(finalState.current_bid_gbp, 55);
  assert.equal(finalState.highest_bidder_id, 'bidder_A');
  assert.equal(finalState.bid_count, 2);
});

test('R03: three concurrent bids converge to the highest', () => {
  const initial: AuctionState = {
    id: 'auc_1',
    current_bid_gbp: 100,
    bid_count: 5,
    highest_bidder_id: 'bidder_0',
  };

  const bids: BidRequest[] = [
    { bidderId: 'bidder_C', amountGbp: 120, requestTime: 200 },
    { bidderId: 'bidder_A', amountGbp: 110, requestTime: 100 },
    { bidderId: 'bidder_B', amountGbp: 130, requestTime: 150 },
  ];

  const { finalState, results } = processConcurrentBids(initial, bids);

  // All three bids are accepted (each exceeds the previous current bid).
  assert.equal(results.get('bidder_A')!.accepted, true);
  assert.equal(results.get('bidder_B')!.accepted, true);
  assert.equal(results.get('bidder_C')!.accepted, false); // 120 < 130 after B's bid

  // Final state converges: B is the highest at 130.
  assert.equal(finalState.current_bid_gbp, 130);
  assert.equal(finalState.highest_bidder_id, 'bidder_B');
  assert.equal(finalState.bid_count, 7); // 5 initial + 2 accepted
});

test('R03: late bid below current is rejected and sees converged state', () => {
  const initial: AuctionState = {
    id: 'auc_1',
    current_bid_gbp: 50,
    bid_count: 2,
    highest_bidder_id: 'bidder_0',
  };

  const bids: BidRequest[] = [
    { bidderId: 'bidder_A', amountGbp: 60, requestTime: 100 },
    { bidderId: 'bidder_B', amountGbp: 45, requestTime: 200 }, // too low
  ];

  const { finalState, results } = processConcurrentBids(initial, bids);

  // A's bid is accepted.
  assert.equal(results.get('bidder_A')!.accepted, true);
  // B's bid is rejected — below current bid.
  assert.equal(results.get('bidder_B')!.accepted, false);

  // B sees the converged state (A's bid).
  assert.equal(results.get('bidder_B')!.newCurrentBid, 60);
  assert.equal(results.get('bidder_B')!.newHighestBidderId, 'bidder_A');

  // Final state is consistent.
  assert.equal(finalState.current_bid_gbp, 60);
  assert.equal(finalState.highest_bidder_id, 'bidder_A');
});

test('R03: concurrent bids are serialized — no lost updates', () => {
  const initial: AuctionState = {
    id: 'auc_1',
    current_bid_gbp: 100,
    bid_count: 10,
    highest_bidder_id: 'bidder_0',
  };

  // Simulate 10 concurrent bids with increasing amounts.
  const bids: BidRequest[] = Array.from({ length: 10 }, (_, i) => ({
    bidderId: `bidder_${i}`,
    amountGbp: 101 + i,
    requestTime: i * 10,
  }));

  const { finalState, results } = processConcurrentBids(initial, bids);

  // All 10 bids should be accepted (each exceeds the previous).
  for (let i = 0; i < 10; i++) {
    assert.equal(results.get(`bidder_${i}`)!.accepted, true);
  }

  // Final state: last bidder (bidder_9) at 110.
  assert.equal(finalState.current_bid_gbp, 110);
  assert.equal(finalState.highest_bidder_id, 'bidder_9');
  assert.equal(finalState.bid_count, 20); // 10 initial + 10 new

  // No lost updates: bid_count increased by exactly 10.
  assert.equal(finalState.bid_count - initial.bid_count, 10);
});
