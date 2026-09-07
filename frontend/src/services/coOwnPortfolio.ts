import { fetchCoOwnAssetById, fetchCoOwnHoldings, type MarketCoOwnAsset, type MarketCoOwnHolding } from './marketApi';
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
  /** Marked value at the asset reference price; not a cash-out quote. */
  markedValueGbp: number;
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

export async function fetchCoOwnPortfolioPositions(
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
    return { positions: [], summary: { ...EMPTY_SUMMARY } };
  }

  const holdingMap = new Map<string, MarketCoOwnHolding>();
  for (const h of holdings) {
    holdingMap.set(h.assetId, h);
  }

  // Fetch only the asset details for assets the user actually holds. The
  // API does not support batch-fetching by ID list, so we resolve each
  // asset detail in parallel. A single missing asset (e.g. delisted) is
  // skipped rather than failing the whole portfolio — the user still sees
  // their other positions.
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
    const markedValueGbp = h.unitsOwned * asset.unitPriceGbp;
    const currentValueGbp = markedValueGbp;
    const unrealizedPnlGbp = (asset.unitPriceGbp - h.avgEntryPriceGbp) * h.unitsOwned;
    const reservedUnits = Math.min(h.unitsOwned, Math.max(0, h.reservedUnits ?? 0));
    const sellableUnits = Math.max(0, h.unitsOwned - reservedUnits);

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
      estimatedSaleProceedsGbp: h.estimatedSaleProceedsGbp ?? null,
      saleDepthUnits: Math.max(0, h.saleDepthUnits ?? 0),
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
  return { positions, summary, ...(partial ? { partial, failedAssetIds } : {}) };
}
