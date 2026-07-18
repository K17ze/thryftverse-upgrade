import { listCoOwnAssets, fetchCoOwnHoldings, type MarketCoOwnAsset, type MarketCoOwnHolding } from './marketApi';
import type { Listing } from '../data/mockData';

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
  settlementMode: 'GBP' | 'TVUSD' | 'HYBRID';
  currentValueGbp: number;
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
}

// ── Service adapter ──
// Internally fetches assets + holdings and joins them into position DTOs.
// The screen consumes this typed contract, not raw market data.

export async function fetchCoOwnPortfolioPositions(
  userId: string,
  listings?: Listing[],
): Promise<CoOwnPortfolioResult> {
  const [assets, holdings] = await Promise.all([
    listCoOwnAssets({ limit: 200 }),
    fetchCoOwnHoldings(userId).catch(() => [] as MarketCoOwnHolding[]),
  ]);

  const holdingMap = new Map<string, MarketCoOwnHolding>();
  for (const h of holdings) {
    holdingMap.set(h.assetId, h);
  }

  const positions: CoOwnPositionVM[] = assets
    .filter((asset: MarketCoOwnAsset) => {
      const h = holdingMap.get(asset.id);
      return h != null && h.unitsOwned > 0;
    })
    .map((asset: MarketCoOwnAsset) => {
      const h = holdingMap.get(asset.id)!;
      const ownershipPct = asset.totalUnits > 0 ? Math.round((h.unitsOwned / asset.totalUnits) * 100 * 10) / 10 : 0;
      const currentValueGbp = h.unitsOwned * asset.unitPriceGbp;
      const unrealizedPnlGbp = (asset.unitPriceGbp - h.avgEntryPriceGbp) * h.unitsOwned;
      const sellableUnits = h.unitsOwned; // All owned units are sellable if the market is open

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

      return {
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
        avgEntryPriceGbp: h.avgEntryPriceGbp,
        realizedPnlGbp: h.realizedPnlGbp,
        unrealizedPnlGbp,
        availableUnits: asset.availableUnits,
        sellableUnits: asset.isOpen ? sellableUnits : 0,
        isOpen: asset.isOpen,
        status: asset.isOpen ? 'open' : 'closed',
        createdAt: asset.createdAt,
      };
    });

  const summary: CoOwnPortfolioSummary = {
    totalValueGbp: positions.reduce((sum, p) => sum + p.currentValueGbp, 0),
    totalUnits: positions.reduce((sum, p) => sum + p.unitsOwned, 0),
    totalUnrealizedGbp: positions.reduce((sum, p) => sum + p.unrealizedPnlGbp, 0),
    totalRealizedGbp: positions.reduce((sum, p) => sum + p.realizedPnlGbp, 0),
    positionCount: positions.length,
  };

  return { positions, summary };
}
