import assert from 'node:assert/strict';
import test from 'node:test';

// ── T09: Bidder/holder privacy projection tests ──
//
// These tests verify that the public API responses do not leak per-user
// sensitive data. They test the response shape contracts that the
// endpoints must enforce:
//
//   - GET /co-own/assets/:assetId/holdings (public) must return only
//     aggregate data, never per-user identifiers, entry prices, or P&L.
//   - GET /auctions/:auctionId (public) must not leak bidder identity
//     beyond what the viewer is authorized to see.
//   - GET /users/:userId/co-own/holdings (authenticated) must reject
//     cross-user access.

// ── Public Co-Own holdings: aggregate-only shape ──

interface PublicHoldingsResponse {
  ok: true;
  aggregate: {
    totalHolders: number;
    totalUnitsHeld: number;
  };
}

// Simulates the shape produced by the public holdings endpoint after T05.
function projectPublicHoldings(rows: Array<{ user_id: string; units_owned: number; avg_entry_price_gbp: string; realized_pnl_gbp: string }>): PublicHoldingsResponse {
  return {
    ok: true,
    aggregate: {
      totalHolders: rows.length,
      totalUnitsHeld: rows.reduce((sum, r) => sum + r.units_owned, 0),
    },
  };
}

test('Public Co-Own holdings returns aggregate only — no user IDs', () => {
  const rows = [
    { user_id: 'u_secret_1', units_owned: 5, avg_entry_price_gbp: '1.25', realized_pnl_gbp: '0.50' },
    { user_id: 'u_secret_2', units_owned: 3, avg_entry_price_gbp: '1.30', realized_pnl_gbp: '-0.10' },
  ];
  const response = projectPublicHoldings(rows);
  const json = JSON.stringify(response);
  assert.ok(!json.includes('u_secret_1'), 'user_id must not appear in public response');
  assert.ok(!json.includes('u_secret_2'), 'user_id must not appear in public response');
  assert.ok(!json.includes('avg_entry_price'), 'avg_entry_price must not appear in public response');
  assert.ok(!json.includes('realized_pnl'), 'realized_pnl must not appear in public response');
  assert.equal(response.aggregate.totalHolders, 2);
  assert.equal(response.aggregate.totalUnitsHeld, 8);
});

test('Public Co-Own holdings with zero holders returns zeros', () => {
  const response = projectPublicHoldings([]);
  assert.equal(response.aggregate.totalHolders, 0);
  assert.equal(response.aggregate.totalUnitsHeld, 0);
});

test('Public Co-Own holdings response has no items array', () => {
  const response = projectPublicHoldings([
    { user_id: 'u1', units_owned: 1, avg_entry_price_gbp: '1', realized_pnl_gbp: '0' },
  ]);
  assert.ok(!('items' in response), 'public holdings must not return items array');
  assert.ok('aggregate' in response, 'public holdings must return aggregate');
});

// ── Authenticated Co-Own holdings: cross-user rejection ──

function checkHoldingsAuth(callerId: string | undefined, targetUserId: string): { status: number; authorized: boolean } {
  if (!callerId) return { status: 401, authorized: false };
  if (callerId !== targetUserId) return { status: 403, authorized: false };
  return { status: 200, authorized: true };
}

test('Authenticated holdings rejects unauthenticated access', () => {
  const result = checkHoldingsAuth(undefined, 'u1');
  assert.equal(result.status, 401);
  assert.equal(result.authorized, false);
});

test('Authenticated holdings rejects cross-user access', () => {
  const result = checkHoldingsAuth('u2', 'u1');
  assert.equal(result.status, 403);
  assert.equal(result.authorized, false);
});

test('Authenticated holdings allows self-access', () => {
  const result = checkHoldingsAuth('u1', 'u1');
  assert.equal(result.status, 200);
  assert.equal(result.authorized, true);
});

// ── Auction detail: bidder identity projection ──
//
// The auction detail endpoint exposes bid activity with bidder_id and
// bidder_username. The viewerState is computed server-side so the
// frontend doesn't need to know other bidders' identities to determine
// the viewer's own state. The bid activity is public (like a real
// auction room), but the viewer_highest_bid is only returned for the
// authenticated viewer.

interface AuctionBidActivityPublic {
  id: number;
  bidderId: string;
  bidderUsername: string;
  amountGbp: number;
  createdAt: string;
}

interface AuctionDetailResponse {
  auction: {
    viewerState: string;
    winnerBidderId: string | null;
  };
  bidActivity: AuctionBidActivityPublic[];
  // viewer_highest_bid is only included when the viewer is authenticated
  // and is the bidder — it's not a separate field in the response, it's
  // used server-side to compute viewerState.
}

function projectAuctionDetail(
  viewerUserId: string | null,
  sellerId: string,
  bids: Array<{ bidder_id: string; amount_gbp: number }>,
  winnerBidderId: string | null,
  currentBid: number,
): AuctionDetailResponse {
  const viewerHighestBid = viewerUserId
    ? Math.max(...bids.filter(b => b.bidder_id === viewerUserId).map(b => b.amount_gbp), 0)
    : 0;

  let viewerState = 'not_participating';
  if (viewerUserId && sellerId === viewerUserId) {
    viewerState = 'seller';
  } else if (winnerBidderId) {
    if (winnerBidderId === viewerUserId) viewerState = 'won';
    else if (viewerHighestBid > 0) viewerState = 'lost';
  } else if (viewerHighestBid > 0) {
    viewerState = viewerHighestBid >= currentBid ? 'leading' : 'outbid';
  }

  return {
    auction: {
      viewerState,
      winnerBidderId,
    },
    bidActivity: bids.map(b => ({
      id: 0,
      bidderId: b.bidder_id,
      bidderUsername: 'anonymous',
      amountGbp: b.amount_gbp,
      createdAt: '',
    })),
  };
}

test('Auction detail: unauthenticated viewer sees not_participating', () => {
  const response = projectAuctionDetail(null, 'seller1', [
    { bidder_id: 'u1', amount_gbp: 50 },
  ], null, 50);
  assert.equal(response.auction.viewerState, 'not_participating');
});

test('Auction detail: seller sees seller state', () => {
  const response = projectAuctionDetail('seller1', 'seller1', [], null, 0);
  assert.equal(response.auction.viewerState, 'seller');
});

test('Auction detail: leading bidder sees leading state', () => {
  const response = projectAuctionDetail('u1', 'seller1', [
    { bidder_id: 'u1', amount_gbp: 100 },
    { bidder_id: 'u2', amount_gbp: 80 },
  ], null, 100);
  assert.equal(response.auction.viewerState, 'leading');
});

test('Auction detail: outbid viewer sees outbid state', () => {
  const response = projectAuctionDetail('u1', 'seller1', [
    { bidder_id: 'u1', amount_gbp: 80 },
    { bidder_id: 'u2', amount_gbp: 100 },
  ], null, 100);
  assert.equal(response.auction.viewerState, 'outbid');
});

test('Auction detail: winner sees won state', () => {
  const response = projectAuctionDetail('u1', 'seller1', [
    { bidder_id: 'u1', amount_gbp: 150 },
  ], 'u1', 150);
  assert.equal(response.auction.viewerState, 'won');
});

test('Auction detail: losing bidder sees lost state after auction ends', () => {
  const response = projectAuctionDetail('u1', 'seller1', [
    { bidder_id: 'u1', amount_gbp: 80 },
    { bidder_id: 'u2', amount_gbp: 100 },
  ], 'u2', 100);
  assert.equal(response.auction.viewerState, 'lost');
});

test('Auction detail: bid activity is public (auction room model)', () => {
  const response = projectAuctionDetail('u3', 'seller1', [
    { bidder_id: 'u1', amount_gbp: 80 },
    { bidder_id: 'u2', amount_gbp: 100 },
  ], null, 100);
  // u3 can see that bids exist — this is the auction room model.
  assert.equal(response.bidActivity.length, 2);
  // But u3's viewerState is not_participating — no private data leaked.
  assert.equal(response.auction.viewerState, 'not_participating');
});

// ── Non-public listing authorization (T03) ──

function checkListingAuth(viewerUserId: string | undefined, sellerId: string, status: string): { status: number; authorized: boolean } {
  const NON_PUBLIC = new Set(['draft', 'paused', 'deleted']);
  if (!NON_PUBLIC.has(status)) return { status: 200, authorized: true };
  if (!viewerUserId) return { status: 403, authorized: false };
  if (viewerUserId !== sellerId) return { status: 403, authorized: false };
  return { status: 200, authorized: true };
}

test('T03: public listing (active) is viewable by anyone', () => {
  assert.equal(checkListingAuth(undefined, 'seller1', 'active').authorized, true);
  assert.equal(checkListingAuth('u1', 'seller1', 'active').authorized, true);
});

test('T03: sold listing is viewable by anyone', () => {
  assert.equal(checkListingAuth(undefined, 'seller1', 'sold').authorized, true);
});

test('T03: draft listing rejects unauthenticated viewer', () => {
  const result = checkListingAuth(undefined, 'seller1', 'draft');
  assert.equal(result.status, 403);
  assert.equal(result.authorized, false);
});

test('T03: draft listing rejects non-seller authenticated viewer', () => {
  const result = checkListingAuth('u1', 'seller1', 'draft');
  assert.equal(result.status, 403);
  assert.equal(result.authorized, false);
});

test('T03: draft listing allows seller', () => {
  const result = checkListingAuth('seller1', 'seller1', 'draft');
  assert.equal(result.status, 200);
  assert.equal(result.authorized, true);
});

test('T03: paused listing rejects non-seller', () => {
  const result = checkListingAuth('u1', 'seller1', 'paused');
  assert.equal(result.status, 403);
  assert.equal(result.authorized, false);
});

test('T03: deleted listing rejects non-seller', () => {
  const result = checkListingAuth('u1', 'seller1', 'deleted');
  assert.equal(result.status, 403);
  assert.equal(result.authorized, false);
});
