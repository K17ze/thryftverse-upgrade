/**
 * Co-Own fixtures — the fractional-ownership trading dataset.
 * Deterministic (seeded PRNG) so SSR and client renders match.
 * Mirrors the mobile platform's MarketCoOwnAsset + v2 order-book shapes.
 */

import type {
  ActivityEvent,
  CandlePoint,
  CoOwnAsset,
  CoOwnBuyoutOffer,
  CoOwnOrder,
  CoOwnPosition,
  CorporateAction,
  Distribution,
  DistributionReceipt,
  DueDiligenceProfile,
  OrderBookLevel,
  OrderBookSnapshot,
  PriceWindow,
  StoredPriceAlert,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';

const img = (id: string, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// Deterministic PRNG — same series on server and client.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CO_OWN_ASSETS: CoOwnAsset[] = [
  {
    id: 'co1',
    listingId: null,
    issuer: {
      id: 'u1',
      username: 'mariefullery',
      displayName: 'Marie Fullery',
      avatar: img('photo-1494790108377-be9c29b29330', 200),
      location: 'South Elmsall, United Kingdom',
      verificationTier: 'seller',
    },
    title: 'Hermès Birkin 30, Togo',
    subtitle: 'Gold Epsom, gold hardware · 2019',
    imageUrl: img('photo-1584917865442-de89df76afd3'),
    category: 'Bags',
    totalUnits: 400,
    availableUnits: 96,
    unitPriceGbp: 142.5,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 2.4,
    holders: 312,
    volume24hGbp: 18420,
    bestBidGbp: 141.0,
    bestAskGbp: 142.5,
    bidDepthUnits: 64,
    askDepthUnits: 48,
    offeringStatus: 'allocated',
    marketStatus: 'trading',
    custodyNote: 'Freeport custody, London Vault 4. Insured at £14,800.',
    createdAt: '2026-03-14T10:00:00Z',
  },
  {
    id: 'co2',
    listingId: null,
    issuer: {
      id: 'u3',
      username: 'dankdunksuk',
      displayName: 'Dan K',
      avatar: img('photo-1507003211169-0a1dd7228f2d', 200),
      location: 'Manchester, United Kingdom',
      verificationTier: 'id',
    },
    title: 'Rolex Submariner 116610LN',
    subtitle: 'Full set, 2019, serviced',
    imageUrl: img('photo-1523170335258-f5ed11844a49'),
    category: 'Watches',
    totalUnits: 240,
    availableUnits: 0,
    unitPriceGbp: 96.4,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: -1.2,
    holders: 188,
    volume24hGbp: 9210,
    bestBidGbp: 95.5,
    bestAskGbp: 97.0,
    bidDepthUnits: 38,
    askDepthUnits: 22,
    offeringStatus: 'closed',
    marketStatus: 'trading',
    custodyNote: 'Bank vault custody, Manchester. Independent authentication renewed quarterly.',
    createdAt: '2026-01-20T10:00:00Z',
  },
  {
    id: 'co3',
    listingId: null,
    issuer: {
      id: 'u6',
      username: 'archive.thread',
      displayName: 'Archive Thread',
      avatar: img('photo-1531123897727-8f129e1688ce', 200),
      location: 'London, United Kingdom',
      verificationTier: 'seller',
    },
    title: 'Margiela Artisanal Archive Coat',
    subtitle: 'AW2011, documented provenance',
    imageUrl: img('photo-1539533018447-63fcce2678e3'),
    category: 'Archive',
    totalUnits: 120,
    availableUnits: 41,
    unitPriceGbp: 58.0,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 5.8,
    holders: 148,
    volume24hGbp: 6120,
    bestBidGbp: 57.5,
    bestAskGbp: 59.5,
    bidDepthUnits: 26,
    askDepthUnits: 41,
    offeringStatus: 'offering',
    marketStatus: 'pre_market',
    custodyNote: 'Climate-controlled archive, Spitalfields. Condition report refreshed quarterly.',
    createdAt: '2026-08-30T10:00:00Z',
  },
  {
    id: 'co4',
    listingId: null,
    issuer: {
      id: 'u6',
      username: 'ellawears',
      displayName: 'Ella Wears',
      avatar: img('photo-1438761681033-6461ffad8d80', 200),
      location: 'Manchester, United Kingdom',
      verificationTier: 'id',
    },
    title: 'Nike Mag 2016 Autographed',
    subtitle: 'Pair 042/500, original case',
    imageUrl: img('photo-1552346154-21d32810aba3'),
    category: 'Sneakers',
    totalUnits: 500,
    availableUnits: 118,
    unitPriceGbp: 54.0,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 6.8,
    holders: 486,
    volume24hGbp: 31250,
    bestBidGbp: 101.0,
    bestAskGbp: 102.5,
    bidDepthUnits: 92,
    askDepthUnits: 57,
    offeringStatus: 'allocated',
    marketStatus: 'trading',
    custodyNote: 'Graded storage case, Birmingham. Authentication: Nike tagged, verified 2026-06.',
    createdAt: '2026-05-02T10:00:00Z',
  },
  {
    id: 'co5',
    listingId: null,
    issuer: {
      id: 'u6',
      username: 'lucygibson94',
      displayName: null,
      avatar: img('photo-1544005313-94ddf0286df2', 200),
      location: 'Leeds, United Kingdom',
      verificationTier: 'seller',
    },
    title: 'Chanel Classic Flap, Medium',
    subtitle: 'Black caviar, 25-series',
    imageUrl: img('photo-1584917865442-de89df76afd3'),
    category: 'Bags',
    totalUnits: 180,
    availableUnits: 0,
    unitPriceGbp: 118.0,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 0.8,
    holders: 224,
    volume24hGbp: 12750,
    bestBidGbp: 116.0,
    bestAskGbp: null,
    bidDepthUnits: 30,
    askDepthUnits: 0,
    offeringStatus: 'closed',
    marketStatus: 'paused',
    custodyNote: 'Vault custody, Manchester. Serviced 2026-04.',
    createdAt: '2026-02-11T10:00:00Z',
  },
  {
    id: 'co8',
    listingId: null,
    issuer: {
      id: 'u6',
      username: 'ellawears',
      displayName: 'Ella Wears',
      avatar: img('photo-1494790108377-be9c29b29330', 200),
      location: 'Bristol, United Kingdom',
      verificationTier: 'seller',
    },
    title: 'Hermès Kelly 25 Sellier',
    subtitle: 'Etoupe Togo, palladium',
    imageUrl: img('photo-1590874103328-eac38a683ce7'),
    category: 'Bags',
    totalUnits: 160,
    availableUnits: 12,
    unitPriceGbp: 210.0,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 4.1,
    holders: 204,
    volume24hGbp: 24800,
    bestBidGbp: 208.0,
    bestAskGbp: 212.0,
    bidDepthUnits: 26,
    askDepthUnits: 18,
    offeringStatus: 'allocated',
    marketStatus: 'trading',
    custodyNote: 'Freeport custody, Heathrow Vault 2. Full set: box, dust bag, receipt.',
    createdAt: '2026-06-18T10:00:00Z',
  },
  {
    id: 'co7',
    listingId: null,
    issuer: {
      id: 'u2',
      username: 'scott_art',
      displayName: 'Scott Art',
      avatar: img('photo-1500648767791-00dcc994a43e', 200),
      location: 'Leeds, United Kingdom',
      verificationTier: 'id',
    },
    title: 'Raf Simons SS2002 Riot Jacket',
    subtitle: 'Archive grail, numbered',
    imageUrl: img('photo-1520975954732-35dd22299614'),
    category: 'Archive',
    totalUnits: 100,
    availableUnits: 0,
    unitPriceGbp: 78.5,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: null,
    holders: 0,
    volume24hGbp: null,
    bestBidGbp: null,
    bestAskGbp: null,
    bidDepthUnits: 0,
    askDepthUnits: 0,
    offeringStatus: 'offering',
    marketStatus: 'pre_market',
    custodyNote: 'Authentication in progress — The RealReal partner lab.',
    createdAt: '2026-09-18T10:00:00Z',
  },
  {
    id: 'co6',
    listingId: null,
    issuer: {
      id: 'u1',
      username: 'mariefullery',
      displayName: 'Marie Fullery',
      avatar: img('photo-1494790108377-be9c29b29330', 200),
      location: 'South Elmsall, United Kingdom',
      verificationTier: 'seller',
    },
    title: 'Cartier Love Bracelet',
    subtitle: 'Yellow gold, size 17',
    imageUrl: img('photo-1611591437281-460bfbe1220a'),
    category: 'Jewellery',
    totalUnits: 200,
    availableUnits: 0,
    unitPriceGbp: 88.0,
    settlementMode: 'ONEZE',
    issuerJurisdiction: 'United Kingdom',
    marketMovePct24h: 0.6,
    holders: 204,
    volume24hGbp: 8900,
    bestBidGbp: 87.5,
    bestAskGbp: 89.0,
    bidDepthUnits: 44,
    askDepthUnits: 36,
    offeringStatus: 'closed',
    marketStatus: 'paused',
    custodyNote: 'Vault custody, Leeds. Insurance valuation renewed 2026-07.',
    createdAt: '2026-02-18T10:00:00Z',
  },
];

// ── Price history — seeded random walk, deterministic ─────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function buildCandles(seed: number, startPrice: number, points: number, stepMs: number, driftBias: number): CandlePoint[] {
  const rand = mulberry32(seed);
  const out: CandlePoint[] = [];
  const t0 = Date.parse('2026-08-26T09:00:00Z');
  let price = startPrice;
  for (let i = 0; i < points; i++) {
    const o = price;
    const step = (rand() - 0.48 + driftBias) * startPrice * 0.012;
    const c = Math.max(startPrice * 0.6, o + step);
    const h = Math.max(o, c) * (1 + rand() * 0.006);
    const l = Math.min(o, c) * (1 - rand() * 0.006);
    const v = Math.round(40 + rand() * 160);
    out.push({ t: t0 + i * stepMs, o: round2(o), h: round2(h), l: round2(l), c: round2(c), v });
    price = c;
  }
  return out;
}

const HOUR = 3_600_000;

export const PRICE_HISTORY: Record<string, CandlePoint[]> = {
  co1: buildCandles(11, 128, 24 * 30, HOUR, 0.05),
  co2: buildCandles(22, 104, 24 * 30, HOUR, -0.02),
  co3: buildCandles(33, 52, 24 * 21, HOUR, 0.02),
  co4: buildCandles(44, 88, 24 * 30, HOUR, 0.16),
  co5: buildCandles(55, 118, 24 * 30, HOUR, 0.01),
  co6: buildCandles(66, 84, 24 * 30, HOUR, 0.03),
  co7: buildCandles(77, 78.5, 24 * 10, HOUR, 0.0),
  co8: buildCandles(88, 196, 24 * 30, HOUR, -0.06),
};

export function priceWindow(assetId: string, window: PriceWindow): CandlePoint[] {
  const all = PRICE_HISTORY[assetId] ?? [];
  if (all.length === 0) return [];
  const windowMs =
    window === '1D'
      ? HOUR * 24
      : window === '1W'
        ? HOUR * 24 * 7
        : window === '1M'
          ? HOUR * 24 * 30
          : Number.MAX_SAFE_INTEGER;
  const slice = all.filter((c) => c.t >= all[all.length - 1]!.t - windowMs);
  return slice.length > 1 ? slice : all.slice(-24);
}

// ── Order books ───────────────────────────────────────────────────────

function book(mid: number, seed: number): OrderBookSnapshot {
  const rand = mulberry32(seed);
  const tick = Math.max(0.5, round2(mid * 0.004));
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  for (let i = 0; i < 8; i++) {
    const bp = round2(mid - tick * (i + 1) * (0.6 + rand() * 0.8));
    const ap = round2(mid + tick * (i + 1) * (0.6 + rand() * 0.8));
    bids.push({ side: 'buy', unitPriceGbp: bp, units: Math.round(4 + rand() * 26), orderCount: 1 + Math.floor(rand() * 5) });
    asks.push({ side: 'sell', unitPriceGbp: Math.max(bp + 0.5, ap), units: Math.round(3 + rand() * 22), orderCount: 1 + Math.floor(rand() * 4) });
  }
  return {
    assetId: '',
    bids: bids.sort((a, b) => b.unitPriceGbp - a.unitPriceGbp),
    asks: asks.sort((a, b) => a.unitPriceGbp - b.unitPriceGbp),
    serverTime: '2026-09-25T09:00:00Z',
    source: 'fallback',
    reconciliationState: 'reconciled',
  };
}

export const ORDER_BOOKS: Record<string, OrderBookSnapshot> = {
  co1: book(142.0, 101),
  co2: book(96.5, 102),
  co4: book(101.5, 104),
  co5: book(116.0, 105),
  co6: book(88.0, 106),
  co8: book(210.0, 107),
};

// ── Positions (viewer 'me') ───────────────────────────────────────────

export const CO_OWN_POSITIONS: CoOwnPosition[] = [
  { assetId: 'co1', units: 14, avgEntryPriceGbp: 131.2, realizedProfitGbp: 0 },
  { assetId: 'co4', units: 8, avgEntryPriceGbp: 88.4, realizedProfitGbp: 42.5 },
  { assetId: 'co6', units: 12, avgEntryPriceGbp: 84.0, realizedProfitGbp: 0 },
];

// ── Activity ──────────────────────────────────────────────────────────

export const CO_OWN_ACTIVITY: ActivityEvent[] = [
  { id: 'ca1', assetId: 'co1', kind: 'buy', actorUsername: 'scott_art', units: 3, unitPriceGbp: 142.5, note: null, at: '2026-09-25T08:41:00Z' },
  { id: 'ca2', assetId: 'co1', kind: 'sell', actorUsername: 'lucygibson94', units: 2, unitPriceGbp: 141.0, note: null, at: '2026-09-25T08:12:00Z' },
  { id: 'ca3', assetId: 'co4', kind: 'buy', actorUsername: 'archive.thread', units: 6, unitPriceGbp: 102.0, note: null, at: '2026-09-25T07:55:00Z' },
  { id: 'ca4', assetId: 'co5', kind: 'distribution', actorUsername: null, units: null, unitPriceGbp: 1.85, note: 'Q3 rental income distributed', at: '2026-09-24T16:00:00Z' },
  { id: 'ca5', assetId: 'co1', kind: 'corporate_action', actorUsername: null, units: null, unitPriceGbp: null, note: 'Sale vote opened — 72% for so far', at: '2026-09-24T10:00:00Z' },
  { id: 'ca6', assetId: 'co4', kind: 'buy', actorUsername: 'mariefullery', units: 4, unitPriceGbp: 101.5, note: null, at: '2026-09-24T09:30:00Z' },
  { id: 'ca7', assetId: 'co6', kind: 'buy', actorUsername: 'ellawears', units: 4, unitPriceGbp: 88.0, note: null, at: '2026-09-23T18:20:00Z' },
  { id: 'ca8', assetId: 'co1', kind: 'listing', actorUsername: null, units: 40, unitPriceGbp: 139.0, note: 'Secondary tranche listed by issuer', at: '2026-09-23T09:00:00Z' },
];

// ── Distributions & corporate actions ─────────────────────────────────

export const DISTRIBUTIONS: Distribution[] = [
  { id: 'd1', assetId: 'co5', kind: 'rental_income', amountPerUnitGbp: 1.85, totalPotGbp: 296, status: 'paid', paidAt: '2026-09-24T16:00:00Z', scheduledFor: '2026-09-24' },
  { id: 'd2', assetId: 'co1', kind: 'resale_gain', amountPerUnitGbp: 0.9, totalPotGbp: 360, status: 'scheduled', paidAt: null, scheduledFor: '2026-10-01' },
  { id: 'd3', assetId: 'co4', kind: 'licensing', amountPerUnitGbp: 0.45, totalPotGbp: 892.8, status: 'paid', paidAt: '2026-09-12T12:00:00Z', scheduledFor: '2026-09-12' },
];

export const CORPORATE_ACTIONS: CorporateAction[] = [
  {
    id: 'ca-v1',
    assetId: 'co1',
    kind: 'sale_vote',
    title: 'Private sale offer — £15,400',
    description: 'A verified collector has offered £15,000 for the bag outright. If the vote passes, units redeem at £62.50 per unit plus accrued income.',
    closesAt: '2026-10-02T18:00:00Z',
    status: 'open',
    yourVote: null,
    votesFor: 224,
    votesAgainst: 38,
  },
  {
    id: 'ca-v2',
    assetId: 'co4',
    kind: 'authentication',
    title: 'Re-authentication with Nike TAG',
    description: 'Proposal to spend £180 from the asset reserve on a fresh Nike TAG authentication ahead of a consignment offer.',
    closesAt: '2026-09-30T18:00:00Z',
    status: 'open',
    yourVote: 'for',
    votesFor: 401,
    votesAgainst: 22,
  },
  {
    id: 'ca-v3',
    assetId: 'co6',
    kind: 'exit',
    title: 'Structured exit — auction consignment',
    description: 'Exit via premium auction house (est. hammer £19,200). Fees 12%. Tally pending.',
    closesAt: '2026-09-20T18:00:00Z',
    status: 'pending_tally',
    yourVote: 'for',
    votesFor: 141,
    votesAgainst: 60,
  },
];

export function coOwnAssetById(id: string): CoOwnAsset | undefined {
  return CO_OWN_ASSETS.find((a) => a.id === id);
}

/** Viewer's resting orders on the secondary market. */
export const CO_OWN_OPEN_ORDERS: CoOwnOrder[] = [
  {
    id: 'o1',
    assetId: 'co1',
    side: 'buy',
    orderType: 'limit',
    unitPriceGbp: 139.0,
    units: 2,
    filledUnits: 0,
    status: 'open',
    feeGbp: 2.85,
    totalGbp: 427.0,
    placedAt: '2026-09-25T07:30:00Z',
  },
  {
    id: 'o2',
    assetId: 'co4',
    side: 'sell',
    orderType: 'limit',
    unitPriceGbp: 104.0,
    units: 4,
    filledUnits: 0,
    status: 'open',
    feeGbp: 8.12,
    totalGbp: 803.88,
    placedAt: '2026-09-24T15:20:00Z',
  },
];

export function orderBookFor(assetId: string): OrderBookSnapshot | undefined {
  return ORDER_BOOKS[assetId];
}

// ── Due diligence ─────────────────────────────────────────────────────
// The trust layer: authentication, condition, custody and appraisal docs
// per asset. Verification fails closed — docs absent until the lab files
// them, not rendered as "pending" chrome.

export const DUE_DILIGENCE: Record<string, DueDiligenceProfile> = {
  co1: {
    assetId: 'co1',
    authenticatedBy: 'Entrupy + LegitGrails lab',
    authenticatedAt: '2026-08-12',
    conditionGrade: 'Excellent — 9.2/10',
    conditionSummary:
      'Corners clean, hardware lightly hairlined, interior fresh. Full set: box, dust bag, rain coat, receipt.',
    documents: [
      {
        id: 'doc-co1-auth',
        assetId: 'co1',
        title: 'Entrupy authentication certificate',
        kind: 'authentication',
        issuer: 'Entrupy',
        issuedAt: '2026-08-12',
        verified: true,
      },
      {
        id: 'doc-co1-cond',
        assetId: 'co1',
        title: 'Condition report — Q3 2026',
        kind: 'condition',
        issuer: 'LegitGrails lab',
        issuedAt: '2026-09-01',
        verified: true,
      },
      {
        id: 'doc-co1-ins',
        assetId: 'co1',
        title: 'Insurance schedule — London Vault 4',
        kind: 'insurance',
        issuer: 'Hiscox',
        issuedAt: '2026-07-20',
        verified: true,
      },
      {
        id: 'doc-co1-appr',
        assetId: 'co1',
        title: 'Independent appraisal — £14,800',
        kind: 'appraisal',
        issuer: 'Vestiaire appraisal desk',
        issuedAt: '2026-08-30',
        verified: true,
      },
    ],
  },
  co2: {
    assetId: 'co2',
    authenticatedBy: 'WristCheck authentication desk',
    authenticatedAt: '2026-06-04',
    conditionGrade: 'Very good — 8.4/10',
    conditionSummary:
      'Serviced 2026-03, bracelet stretch minimal, bezel insert crisp. Box and papers 2019.',
    documents: [
      {
        id: 'doc-co2-auth',
        assetId: 'co2',
        title: 'Movement + serial authentication',
        kind: 'authentication',
        issuer: 'WristCheck',
        issuedAt: '2026-06-04',
        verified: true,
      },
      {
        id: 'doc-co2-svc',
        assetId: 'co2',
        title: 'Service record — full overhaul',
        kind: 'condition',
        issuer: 'Watches of Lancashire',
        issuedAt: '2026-03-18',
        verified: true,
      },
      {
        id: 'doc-co2-ins',
        assetId: 'co2',
        title: 'Vault custody + insurance note',
        kind: 'custody',
        issuer: 'Manchester vault facility',
        issuedAt: '2026-06-10',
        verified: true,
      },
    ],
  },
  co4: {
    assetId: 'co4',
    authenticatedBy: 'Nike TAG + Legit Check App',
    authenticatedAt: '2026-06-21',
    conditionGrade: 'Deadstock — 9.8/10',
    conditionSummary:
      'Unworn, auto-lacing function tested, original case and charger. Autograph witnessed and documented.',
    documents: [
      {
        id: 'doc-co4-auth',
        assetId: 'co4',
        title: 'Nike TAG authentication record',
        kind: 'authentication',
        issuer: 'Nike',
        issuedAt: '2026-06-21',
        verified: true,
      },
      {
        id: 'doc-co4-auto',
        assetId: 'co4',
        title: 'Autograph witness statement',
        kind: 'authentication',
        issuer: 'James Spence Authentication',
        issuedAt: '2026-05-30',
        verified: true,
      },
      {
        id: 'doc-co4-cond',
        assetId: 'co4',
        title: 'Graded storage inspection',
        kind: 'condition',
        issuer: 'Birmingham grading facility',
        issuedAt: '2026-08-15',
        verified: true,
      },
      {
        id: 'doc-co4-appr',
        assetId: 'co4',
        title: 'Independent appraisal — £51,000',
        kind: 'appraisal',
        issuer: 'Christie\'s sneakers desk',
        issuedAt: '2026-07-02',
        verified: true,
      },
    ],
  },
  co8: {
    assetId: 'co8',
    authenticatedBy: 'Entrupy + LegitGrails lab',
    authenticatedAt: '2026-09-02',
    conditionGrade: 'Pristine — 9.6/10',
    conditionSummary:
      'Store-fresh corners, palladium hardware unworn. Full set including boutique receipt.',
    documents: [
      {
        id: 'doc-co8-auth',
        assetId: 'co8',
        title: 'Entrupy authentication certificate',
        kind: 'authentication',
        issuer: 'Entrupy',
        issuedAt: '2026-09-02',
        verified: true,
      },
      {
        id: 'doc-co8-cond',
        assetId: 'co8',
        title: 'Condition report — September 2026',
        kind: 'condition',
        issuer: 'LegitGrails lab',
        issuedAt: '2026-09-05',
        verified: true,
      },
      {
        id: 'doc-co8-cust',
        assetId: 'co8',
        title: 'Freeport custody agreement — Heathrow Vault 2',
        kind: 'custody',
        issuer: 'Heathrow freeport',
        issuedAt: '2026-09-06',
        verified: true,
      },
    ],
  },
  co6: {
    assetId: 'co6',
    authenticatedBy: 'WristCheck authentication desk',
    authenticatedAt: '2026-05-11',
    conditionGrade: 'Very good — 8.1/10',
    conditionSummary:
      'Light surface scratches on case flank, polished 2026-07. Screw and screwdriver present.',
    documents: [
      {
        id: 'doc-co6-auth',
        assetId: 'co6',
        title: 'Serial + hallmark authentication',
        kind: 'authentication',
        issuer: 'WristCheck',
        issuedAt: '2026-05-11',
        verified: true,
      },
      {
        id: 'doc-co6-ins',
        assetId: 'co6',
        title: 'Insurance valuation — renewed 2026-07',
        kind: 'insurance',
        issuer: 'Hiscox',
        issuedAt: '2026-07-14',
        verified: true,
      },
    ],
  },
  co5: {
    assetId: 'co5',
    authenticatedBy: 'Entrupy',
    authenticatedAt: '2026-04-28',
    conditionGrade: 'Good — 7.6/10',
    conditionSummary:
      'Corner wear retouched, chain hardware shows light tarnish. Serviced 2026-04 with workshop note.',
    documents: [
      {
        id: 'doc-co5-auth',
        assetId: 'co5',
        title: 'Entrupy authentication certificate',
        kind: 'authentication',
        issuer: 'Entrupy',
        issuedAt: '2026-04-28',
        verified: true,
      },
      {
        id: 'doc-co5-cond',
        assetId: 'co5',
        title: 'Post-service condition report',
        kind: 'condition',
        issuer: 'Manchester atelier',
        issuedAt: '2026-04-30',
        verified: true,
      },
    ],
  },
  co3: {
    assetId: 'co3',
    authenticatedBy: 'Archive Thread provenance desk',
    authenticatedAt: '2026-08-19',
    conditionGrade: 'Archive good — 7.9/10',
    conditionSummary:
      'AW2011 documented provenance; lining repairs noted and priced in. Stored climate-controlled.',
    documents: [
      {
        id: 'doc-co3-prov',
        assetId: 'co3',
        title: 'Provenance file — AW2011 runway archive',
        kind: 'authentication',
        issuer: 'Archive Thread',
        issuedAt: '2026-08-19',
        verified: true,
      },
      {
        id: 'doc-co3-cond',
        assetId: 'co3',
        title: 'Condition report — refreshed quarterly',
        kind: 'condition',
        issuer: 'Spitalfields archive',
        issuedAt: '2026-09-10',
        verified: true,
      },
    ],
  },
  co7: {
    assetId: 'co7',
    authenticatedBy: null,
    authenticatedAt: null,
    conditionGrade: null,
    conditionSummary:
      'Authentication in progress — The RealReal partner lab. Due-diligence file publishes before allocation.',
    documents: [],
  },
};

export function dueDiligenceFor(assetId: string): DueDiligenceProfile | undefined {
  return DUE_DILIGENCE[assetId];
}

// ── Market ledger — the public tape ───────────────────────────────────
// Deterministic seeded prints: anchored to the order-book server time so
// SSR and client renders agree. Side colours the aggressor's side.

function buildLedger(assetId: string, refPrice: number, seed: number, count: number): TradeLedgerEntry[] {
  const rand = mulberry32(seed);
  const out: TradeLedgerEntry[] = [];
  const t0 = Date.parse('2026-09-25T08:58:00Z');
  let price = refPrice * (1 + (rand() - 0.5) * 0.02);
  let t = t0;
  for (let i = 0; i < count; i++) {
    const side = rand() > 0.47 ? 'buy' : 'sell';
    const units = 1 + Math.floor(rand() * 9);
    price = Math.max(refPrice * 0.7, price + (rand() - 0.5) * refPrice * 0.008);
    out.push({
      id: `${assetId}-t${i}`,
      assetId,
      side,
      units,
      unitPriceGbp: round2(price),
      executedAt: new Date(t).toISOString(),
    });
    t -= Math.round(90_000 + rand() * 3_600_000); // 1.5–60 min between prints
  }
  return out;
}

export const MARKET_LEDGER: Record<string, TradeLedgerEntry[]> = {
  co1: buildLedger('co1', 142.0, 501, 16),
  co2: buildLedger('co2', 96.5, 502, 11),
  co4: buildLedger('co4', 101.5, 504, 18),
  co5: buildLedger('co5', 116.0, 505, 7),
  co6: buildLedger('co6', 88.0, 506, 9),
  co8: buildLedger('co8', 210.0, 508, 13),
};

export function marketLedgerFor(assetId: string): TradeLedgerEntry[] {
  return MARKET_LEDGER[assetId] ?? [];
}

// ── Distribution receipts — the viewer's income history ───────────────
// Per-holder lines: what the viewer was paid (or is owed), tied to the
// units they held on each ex-date snapshot.

export const DISTRIBUTION_RECEIPTS: DistributionReceipt[] = [
  {
    id: 'dr9',
    assetId: 'co1',
    kind: 'resale_gain',
    amountPerUnitGbp: 0.9,
    unitsHeld: 14,
    totalGbp: 12.6,
    exDate: '2026-09-30',
    paidAt: null,
    status: 'scheduled',
  },
  {
    id: 'dr8',
    assetId: 'co4',
    kind: 'licensing',
    amountPerUnitGbp: 0.45,
    unitsHeld: 8,
    totalGbp: 3.6,
    exDate: '2026-09-10',
    paidAt: '2026-09-12T12:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr7',
    assetId: 'co1',
    kind: 'rental_income',
    amountPerUnitGbp: 1.1,
    unitsHeld: 14,
    totalGbp: 15.4,
    exDate: '2026-08-28',
    paidAt: '2026-09-01T10:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr6',
    assetId: 'co6',
    kind: 'rental_income',
    amountPerUnitGbp: 0.62,
    unitsHeld: 12,
    totalGbp: 7.44,
    exDate: '2026-07-30',
    paidAt: '2026-08-03T10:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr5',
    assetId: 'co1',
    kind: 'rental_income',
    amountPerUnitGbp: 1.05,
    unitsHeld: 11,
    totalGbp: 11.55,
    exDate: '2026-06-30',
    paidAt: '2026-07-03T10:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr4',
    assetId: 'co4',
    kind: 'licensing',
    amountPerUnitGbp: 0.4,
    unitsHeld: 8,
    totalGbp: 3.2,
    exDate: '2026-05-15',
    paidAt: '2026-05-18T12:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr3',
    assetId: 'co6',
    kind: 'rental_income',
    amountPerUnitGbp: 0.58,
    unitsHeld: 12,
    totalGbp: 6.96,
    exDate: '2026-04-28',
    paidAt: '2026-05-02T10:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr2',
    assetId: 'co1',
    kind: 'rental_income',
    amountPerUnitGbp: 1.0,
    unitsHeld: 11,
    totalGbp: 11.0,
    exDate: '2026-03-31',
    paidAt: '2026-04-04T10:00:00Z',
    status: 'paid',
  },
  {
    id: 'dr1',
    assetId: 'co6',
    kind: 'rental_income',
    amountPerUnitGbp: 0.55,
    unitsHeld: 12,
    totalGbp: 6.6,
    exDate: '2026-01-30',
    paidAt: '2026-02-03T10:00:00Z',
    status: 'paid',
  },
];

// ── Price alerts — seed for the persisted store ───────────────────────
// Honest start state: two alerts so the surface isn't blank on first run;
// delivery isn't wired so the copy says saved-locally, not "will notify".

export const PRICE_ALERT_SEED: StoredPriceAlert[] = [
  {
    id: 'pa1',
    assetId: 'co1',
    direction: 'below',
    targetPriceGbp: 138.0,
    active: true,
    createdAt: '2026-09-22T14:10:00Z',
  },
  {
    id: 'pa2',
    assetId: 'co4',
    direction: 'above',
    targetPriceGbp: 110.0,
    active: false,
    createdAt: '2026-09-18T09:32:00Z',
  },
];

// ── Buyout offers — seeds for the buyout surface ──────────────────────
// Covers every render state: a live third-party offer on an asset the
// viewer holds (accept path), the viewer's own resting offer ("This is
// your offer"), and an open offer on an asset the viewer holds none of.
// Timestamps are relative to load — an offer's expiry is derived at
// render from expiresAt, so fixed dates would silently stale the demo.

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const CO_OWN_BUYOUT_OFFERS: CoOwnBuyoutOffer[] = [
  {
    // Viewer holds 14/400 of co1 — can accept up to 14 units against the
    // 74-unit remainder. +5.3% over the £142.50 reference.
    id: 'bo1',
    assetId: 'co1',
    bidderUsername: 'archive.thread',
    mine: false,
    offerPriceGbp: 150.0,
    targetUnits: 120,
    acceptedUnits: 46,
    status: 'open',
    expiresAt: hoursFromNow(30),
    createdAt: hoursFromNow(-18),
  },
  {
    // The viewer's own offer on co4 — held 8/500. Reads "This is your
    // offer." and can't be self-accepted.
    id: 'bo2',
    assetId: 'co4',
    bidderUsername: 'you',
    mine: true,
    offerPriceGbp: 56.5,
    targetUnits: 60,
    acceptedUnits: 12,
    status: 'open',
    expiresAt: hoursFromNow(41),
    createdAt: hoursFromNow(-7),
  },
  {
    // co5 — viewer holds nothing, so the accept path reads "You hold no
    // units to accept this offer."
    id: 'bo3',
    assetId: 'co5',
    bidderUsername: 'dankdunksuk',
    mine: false,
    offerPriceGbp: 124.0,
    targetUnits: 90,
    acceptedUnits: 0,
    status: 'open',
    expiresAt: hoursFromNow(52),
    createdAt: hoursFromNow(-4),
  },
];

export function buyoutOffersFor(assetId: string): CoOwnBuyoutOffer[] {
  return CO_OWN_BUYOUT_OFFERS.filter((o) => o.assetId === assetId);
}
