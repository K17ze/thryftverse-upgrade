import { fetchCoOwnAssetById, fetchCoOwnHoldings, type MarketCoOwnAsset, type MarketCoOwnHolding } from './marketApi';
import { fetchJson } from '../lib/apiClient';
import type { Listing } from '../domain';

// ── Portfolio DTO ──
// A joined position view model that the PortfolioScreen consumes.
// The screen must not contain raw market join logic.

export interface CoOwnPositionVM {
  assetId: string;
  listingId: string;
  issuerId: string;
  title: string;
  imageUrl: string | null;
  unitsOwned: number;
  totalUnits: number;
  ownershipPct: number;
  unitPriceGbp: number;
  unitPriceStable: number;
  settlementMode: 'ONEZE';
  currentValueGbp: number;
  /** Marked value at the shared position-mark basis (last settled trade
   * when one exists, otherwise the reference price) — the SAME basis the
   * asset detail hero uses, so the two surfaces can never disagree (F06). */
  markedValueGbp: number;
  /** Mark provenance — source, price, age, staleness. Feeds the
   * position card's inspectable mark row (F26).
   * U38: A reference price is NOT a bid/ask midpoint — use 'reference'
   * so the UI never implies a calculated mid. Freshness is null (unknown)
   * when the reference price carries no timestamp. */
  mark?: {
    source: 'last' | 'reference';
    price: number;
    ageSeconds: number | null;
    isStale: boolean;
  };
  /** Executable proceeds from current bid depth, or null when there are no bids. */
  estimatedSaleProceedsGbp: number | null;
  saleDepthUnits: number;
  saleProceedsAsOf?: string;
  avgEntryPriceGbp: number;
  realizedPnlGbp: number;
  unrealizedPnlGbp: number;
  availableUnits: number;
  sellableUnits: number;
  isOpen: boolean;
  status: 'open' | 'closed' | 'paused';
  createdAt: string;
  /** Asset category/class from linked listing — used for "By class" allocation. */
  category?: string;
  /** Position state split per spec 10 §3.3. Optional — fail closed (all settled) when backend doesn't expose. */
  positionState?: {
    settled: number;
    reservedForSale: number;
    pendingIn: number;
    pendingOut: number;
    outstandingUnits: number;
  };
  /** Settlement state for pending units per spec 10 §3.3. */
  settlementState?: 'settling' | 'settled';
  /** Wave 10/11: ISO date when the position lockup / holding period
   * ends. Null when no lockup applies. */
  lockupEndDate?: string | null;
}

export interface CoOwnPortfolioSummary {
  totalValueGbp: number;
  totalUnits: number;
  totalUnrealizedGbp: number;
  totalRealizedGbp: number;
  positionCount: number;
  // Phase 3: distributions + today's change + data quality
  totalDistributionsGbp?: number;
  todayChangeGbp?: number;
  todayChangePct?: number;
  todayChangeTimestamp?: string;
  staleMarkCount?: number;
}

export interface CoOwnPortfolioResult {
  positions: CoOwnPositionVM[];
  summary: CoOwnPortfolioSummary;
  /** True when one or more asset detail fetches failed. The positions
   * array still contains successfully-fetched positions; totals may be
   * incomplete. The screen should surface a warning banner. */
  partial?: boolean;
  /** Asset IDs that failed to fetch when `partial` is true. */
  failedAssetIds?: string[];
  /** Number of holdings fetched from the backend (may differ from positions.length if asset details failed). */
  holdingsCount?: number;
}

// ── Service adapter ──
// Fetches the user's holdings first, then resolves only the asset details
// for assets the user actually holds. The screen consumes this typed
// contract, not raw market data.

const EMPTY_SUMMARY: CoOwnPortfolioSummary = {
  totalValueGbp: 0,
  totalUnits: 0,
  totalUnrealizedGbp: 0,
  totalRealizedGbp: 0,
  positionCount: 0,
};

// ── Backend portfolio projection (bounded single query) ──
// The backend now exposes `GET /co-own/portfolio` which returns every
// holding with its mark, provenance, sellable units and capabilities in
// one response — eliminating the N+1 fan-out the legacy adapter performs.
// The shape below mirrors the backend contract exactly; the mapper below
// projects it onto the existing `CoOwnPositionVM` so callers are unaffected.

type CoOwnPortfolioMarkBasis = 'last_trade' | 'reference' | 'offering' | 'none';

interface CoOwnPortfolioProjectionHolding {
  assetId: string;
  title: string;
  imageUrl: string | null;
  /** User's total holding units for this asset. */
  totalUnits: number;
  /** Units not reserved by open sell orders. */
  sellableUnits: number;
  unitPriceGbp: number | null;
  markBasis: CoOwnPortfolioMarkBasis;
  markTimestamp: string | null;
  markAgeSeconds: number | null;
  marketValueGbp: number | null;
  costBasisGbp: number;
  unrealisedPnlGbp: number | null;
  marketStatus: string;
  offeringStatus: string;
  bestBidGbp: number | null;
  bestAskGbp: number | null;
  bidDepthUnits: number;
  askDepthUnits: number;
  partialLiquidity: boolean;
  /** Wave 10/11: ISO date when the position lockup ends. Null when
   * no lockup applies. */
  lockupEndDate?: string | null;
}

interface CoOwnPortfolioProjectionResponse {
  ok: true;
  holdings: CoOwnPortfolioProjectionHolding[];
  partial: boolean;
  error?: string;
}

/** Maps the backend projection mark-basis onto the VM's mark source.
 * 'last_trade' → 'last'; everything else collapses to 'reference' so the
 * UI never implies a calculated mid (U38). 'none' has no price and is
 * rendered as a reference mark with a null price by the caller. */
function mapMarkSource(basis: CoOwnPortfolioMarkBasis): 'last' | 'reference' {
  return basis === 'last_trade' ? 'last' : 'reference';
}

/**
 * Fetches the user's portfolio via the backend's bounded `GET /co-own/portfolio`
 * projection and maps it onto the existing `CoOwnPositionVM` shape.
 *
 * Unlike the legacy N+1 adapter, this performs a single network round-trip.
 * Fields the projection does not expose (asset total supply, listing link,
 * issuer id, realised P&L, stable unit price) are populated with honest
 * defaults so the VM contract is preserved without fabricating data:
 *   - `ownershipPct` is 0 because the projection does not expose asset total
 *     supply — never imply a percentage we cannot compute.
 *   - `realizedPnlGbp` is 0 (the projection reports unrealised only).
 *   - `listingId` / `issuerId` are empty strings (unknown, not fabricated).
 *
 * Throws when the endpoint is unreachable or returns a non-OK payload so the
 * caller can fall back to the legacy adapter.
 */
export async function fetchCoOwnPortfolioProjection(userId: string): Promise<CoOwnPortfolioResult> {
  // The projection is authenticated; the user id is implicit in the session.
  // The path parameter is retained for the legacy caller signature only and
  // is not sent in the URL — the backend resolves the caller from the token.
  void userId;

  const payload = await fetchJson<CoOwnPortfolioProjectionResponse>('/co-own/portfolio');

  if (!payload || !payload.ok || !Array.isArray(payload.holdings)) {
    throw new Error('Portfolio projection returned an unexpected payload');
  }

  const positions: CoOwnPositionVM[] = [];
  for (const h of payload.holdings) {
    // The projection's `totalUnits` is the user's holding units (not the
    // asset's total supply). Map it onto `unitsOwned`; the VM's `totalUnits`
    // (asset supply) is unknown from this endpoint, so ownershipPct is 0.
    const unitsOwned = Math.max(0, h.totalUnits);
    const sellableUnits = Math.max(0, Math.min(h.sellableUnits, unitsOwned));
    const reservedUnits = Math.max(0, unitsOwned - sellableUnits);

    const markPrice = h.unitPriceGbp ?? 0;
    const markSource = mapMarkSource(h.markBasis);
    const markAgeSeconds = h.markAgeSeconds ?? null;
    const markIsStale = markAgeSeconds != null && markAgeSeconds > 24 * 60 * 60;

    const markedValueGbp = h.marketValueGbp ?? unitsOwned * markPrice;
    const currentValueGbp = markedValueGbp;
    const avgEntryPriceGbp = unitsOwned > 0 ? h.costBasisGbp / unitsOwned : 0;
    const unrealizedPnlGbp = h.unrealisedPnlGbp ?? (markPrice - avgEntryPriceGbp) * unitsOwned;

    // U39: sale proceeds must only count sellable units, never reserved.
    const effectiveSaleDepth = Math.max(0, Math.min(h.bidDepthUnits, sellableUnits));
    const effectiveSaleProceeds =
      h.bestBidGbp != null && effectiveSaleDepth > 0
        ? h.bestBidGbp * effectiveSaleDepth
        : null;

    const isOpen = h.marketStatus !== 'closed' && h.offeringStatus !== 'failed' && h.offeringStatus !== 'closed';

    positions.push({
      assetId: h.assetId,
      listingId: '',
      issuerId: '',
      title: h.title,
      imageUrl: h.imageUrl,
      unitsOwned,
      // P1-2/P1-3: The projection endpoint does not expose the asset's total
      // supply, so we cannot populate totalUnits/outstandingUnits truthfully.
      // Setting them to unitsOwned would render "5 of 5 units · 0%" instead
      // of "5 of 1000 units · 0.5%" — a contract violation. Use 0 (unknown)
      // so CoOwnPositionCard fails closed (shows "—" or omits the ratio)
      // rather than fabricating a wrong denominator.
      totalUnits: 0,
      ownershipPct: 0,
      unitPriceGbp: markPrice,
      unitPriceStable: markPrice,
      settlementMode: 'ONEZE',
      currentValueGbp,
      markedValueGbp,
      mark: {
        source: markSource,
        price: markPrice,
        ageSeconds: markAgeSeconds,
        isStale: markIsStale,
      },
      estimatedSaleProceedsGbp: effectiveSaleProceeds,
      saleDepthUnits: effectiveSaleDepth,
      avgEntryPriceGbp,
      realizedPnlGbp: 0,
      unrealizedPnlGbp,
      availableUnits: sellableUnits,
      sellableUnits: isOpen ? sellableUnits : 0,
      isOpen,
      status: isOpen ? 'open' : 'closed',
      createdAt: '',
      positionState: {
        settled: unitsOwned,
        reservedForSale: reservedUnits,
        pendingIn: 0,
        pendingOut: 0,
        outstandingUnits: 0,
      },
      settlementState: 'settled',
      lockupEndDate: h.lockupEndDate ?? null,
    });
  }

  const summary: CoOwnPortfolioSummary = {
    totalValueGbp: positions.reduce((sum, p) => sum + p.currentValueGbp, 0),
    totalUnits: positions.reduce((sum, p) => sum + p.unitsOwned, 0),
    totalUnrealizedGbp: positions.reduce((sum, p) => sum + p.unrealizedPnlGbp, 0),
    totalRealizedGbp: positions.reduce((sum, p) => sum + p.realizedPnlGbp, 0),
    positionCount: positions.length,
  };

  const partial = payload.partial === true;
  return {
    positions,
    summary,
    holdingsCount: payload.holdings.length,
    ...(partial ? { partial } : {}),
  };
}

/**
 * Fetches the user's Co-Own portfolio positions.
 *
 * Tries the bounded backend projection (`GET /co-own/portfolio`) first so
 * the common path is a single network round-trip. If that endpoint is
 * unavailable or errors, it gracefully degrades to the legacy N+1 adapter
 * (holdings → per-asset detail fan-out) so the user is never left without a
 * portfolio because of a projection outage.
 */
export async function fetchCoOwnPortfolioPositions(
  userId: string,
  listings?: Listing[],
): Promise<CoOwnPortfolioResult> {
  try {
    return await fetchCoOwnPortfolioProjection(userId);
  } catch (projectionError) {
    // Graceful degradation: the projection endpoint is unavailable (new
    // backend not rolled out, transient 5xx, or shape mismatch). Fall back
    // to the legacy N+1 adapter so the portfolio still renders. The error
    // is swallowed intentionally — the legacy path surfaces its own errors.
    if (__DEV__) {
      console.warn(
        '[coOwnPortfolio] projection endpoint failed — falling back to N+1 adapter:',
        projectionError instanceof Error ? projectionError.message : projectionError,
      );
    }
    return fetchCoOwnPortfolioPositionsLegacy(userId, listings);
  }
}

// ── Legacy N+1 adapter (fallback) ──
// Retained as the graceful-degradation path for when the bounded portfolio
// projection endpoint is unavailable. See `fetchCoOwnPortfolioPositions`
// above for the preferred single-query path.
async function fetchCoOwnPortfolioPositionsLegacy(
  userId: string,
  listings?: Listing[],
): Promise<CoOwnPortfolioResult> {
  // Fetch the user's holdings first. A holdings failure is materially
  // different from an empty portfolio — let the caller render a recoverable
  // error instead of implying that the user owns nothing.
  const holdings = await fetchCoOwnHoldings(userId);

  // No holdings → the user owns nothing. Don't fetch all assets at all.
  // This is the "zero holdings" case, distinct from a failed (unavailable)
  // holdings fetch which throws above.
  if (holdings.length === 0) {
    return { positions: [], summary: { ...EMPTY_SUMMARY }, holdingsCount: 0 };
  }

  const holdingMap = new Map<string, MarketCoOwnHolding>();
  for (const h of holdings) {
    holdingMap.set(h.assetId, h);
  }

  // U41 — Known limitation: one asset-detail request per holding (fan-out).
  // The API does not support a batch portfolio projection endpoint, so we
  // resolve each asset detail in parallel. This produces N requests for N
  // holdings. A single missing asset (e.g. delisted) is skipped rather
  // than failing the whole portfolio — the user still sees their other
  // positions and the screen surfaces a partial-totals warning.
  // Migration path: a backend portfolio projection returning mark, state
  // and available units in a single response would eliminate this fan-out.
  // Until then, partial totals are retained and surfaced via the `partial`
  // flag so the user is never misled by incomplete data.
  const assetResults = await Promise.allSettled(
    holdings.map((h) => fetchCoOwnAssetById(h.assetId)),
  );

  const positions: CoOwnPositionVM[] = [];
  const failedAssetIds: string[] = [];
  for (let i = 0; i < assetResults.length; i++) {
    const result = assetResults[i];
    if (result.status !== 'fulfilled') {
      // Track the asset ID that failed so the screen can warn the user
      // that totals may be incomplete.
      failedAssetIds.push(holdings[i].assetId);
      continue;
    }
    const asset = result.value;
    const h = holdingMap.get(asset.id);
    if (!h || h.unitsOwned <= 0) continue;

    const ownershipPct = asset.totalUnits > 0 ? Math.round((h.unitsOwned / asset.totalUnits) * 100 * 10) / 10 : 0;
    // Shared position-mark basis (F06): last settled trade when one
    // exists, otherwise the reference price — identical to the detail
    // screen's dominant price. Age and staleness ride with the mark.
    // U38: A reference price is NOT a bid/ask midpoint. Label it
    // 'reference' so the UI never implies a calculated mid. When the
    // reference price carries no timestamp, freshness is unknown
    // (ageSeconds = null) — never implied fresh.
    const snapshot = asset.marketSnapshot ?? null;
    const lastExecution = snapshot?.lastExecutionPriceGbp ?? null;
    const markPrice = lastExecution ?? asset.unitPriceGbp;
    const markSource: 'last' | 'reference' = lastExecution != null ? 'last' : 'reference';
    const markAgeSeconds = snapshot?.lastExecutionAt
      ? Math.max(0, Math.floor((Date.now() - new Date(snapshot.lastExecutionAt).getTime()) / 1000))
      : null;
    const markIsStale = markAgeSeconds != null && markAgeSeconds > 24 * 60 * 60;
    const markedValueGbp = h.unitsOwned * markPrice;
    const currentValueGbp = markedValueGbp;
    const unrealizedPnlGbp = (markPrice - h.avgEntryPriceGbp) * h.unitsOwned;
    const reservedUnits = Math.min(h.unitsOwned, Math.max(0, h.reservedUnits ?? 0));
    const sellableUnits = Math.max(0, h.unitsOwned - reservedUnits);

    // U39: Sale estimate must only count currently sellable units, not
    // reserved units or expired bids. The backend projection may include
    // reserved units in the bid-depth estimate — cap it client-side so
    // the user never sees proceeds for units they cannot sell.
    const rawSaleDepth = Math.max(0, h.saleDepthUnits ?? 0);
    const effectiveSaleDepth = Math.min(rawSaleDepth, sellableUnits);
    const rawSaleProceeds = h.estimatedSaleProceedsGbp ?? null;
    // If the backend's depth exceeds sellable units, scale proceeds
    // proportionally so the estimate reflects only sellable quantity.
    const effectiveSaleProceeds = rawSaleProceeds != null && rawSaleDepth > 0 && effectiveSaleDepth < rawSaleDepth
      ? rawSaleProceeds * (effectiveSaleDepth / rawSaleDepth)
      : rawSaleProceeds;

    // Image fallback hierarchy:
    // 1. asset.imageUrl (direct)
    // 2. linked listing cover image (listing.images[0])
    // 3. null → CoOwnPositionCard shows fallback graphic
    let resolvedImage = asset.imageUrl;
    let resolvedCategory: string | undefined;
    if (asset.listingId && listings) {
      const linkedListing = listings.find((l) => l.id === asset.listingId);
      if (linkedListing?.images?.length) {
        if (!resolvedImage) resolvedImage = linkedListing.images[0];
      }
      if (linkedListing?.category) {
        resolvedCategory = linkedListing.category;
      }
    }

    positions.push({
      assetId: asset.id,
      listingId: asset.listingId,
      issuerId: asset.issuerId,
      title: asset.title,
      imageUrl: resolvedImage,
      category: resolvedCategory,
      unitsOwned: h.unitsOwned,
      totalUnits: asset.totalUnits,
      ownershipPct,
      unitPriceGbp: asset.unitPriceGbp,
      unitPriceStable: asset.unitPriceStable,
      settlementMode: asset.settlementMode,
      currentValueGbp,
      markedValueGbp,
      mark: {
        source: markSource,
        price: markPrice,
        ageSeconds: markAgeSeconds,
        isStale: markIsStale,
      },
      estimatedSaleProceedsGbp: effectiveSaleProceeds,
      saleDepthUnits: effectiveSaleDepth,
      saleProceedsAsOf: h.saleProceedsAsOf,
      avgEntryPriceGbp: h.avgEntryPriceGbp,
      realizedPnlGbp: h.realizedPnlGbp,
      unrealizedPnlGbp,
      availableUnits: asset.availableUnits,
      sellableUnits: asset.isOpen ? sellableUnits : 0,
      isOpen: asset.isOpen,
      status: asset.isOpen ? 'open' : 'closed',
      createdAt: asset.createdAt,
      positionState: {
        settled: h.unitsOwned,
        reservedForSale: reservedUnits,
        pendingIn: 0,
        pendingOut: 0,
        outstandingUnits: asset.totalUnits,
      },
      settlementState: 'settled',
      lockupEndDate: asset.lockupEndDate ?? null,
    });
  }

  const summary: CoOwnPortfolioSummary = {
    totalValueGbp: positions.reduce((sum, p) => sum + p.currentValueGbp, 0),
    totalUnits: positions.reduce((sum, p) => sum + p.unitsOwned, 0),
    totalUnrealizedGbp: positions.reduce((sum, p) => sum + p.unrealizedPnlGbp, 0),
    totalRealizedGbp: positions.reduce((sum, p) => sum + p.realizedPnlGbp, 0),
    positionCount: positions.length,
  };

  const partial = failedAssetIds.length > 0;
  return { positions, summary, holdingsCount: holdings.length, ...(partial ? { partial, failedAssetIds } : {}) };
}
