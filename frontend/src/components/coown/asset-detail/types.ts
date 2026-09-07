import type { MarketCoOwnAsset } from '../../../services/marketApi';

/**
 * Asset lifecycle states derived from backend `marketStatus` /
 * `offeringStatus` fields, with an `isOpen` / `availableUnits`
 * fallback for backward compatibility.
 */
export type AssetLifecycleState =
  | 'initialOffering'
  | 'secondaryTrading'
  | 'tradingPaused'
  | 'exitUnderway';

/**
 * Derive the lifecycle state from the asset's current fields.
 *
 * Priority:
 * 1. `marketStatus` — the canonical secondary-market stage.
 * 2. `offeringStatus` — the offering-stage field, used when
 *    `marketStatus` is absent (e.g. pre-market assets).
 * 3. `isOpen` + `availableUnits` — legacy inference for assets
 *    whose backend projections don't yet include the status fields.
 */
export function deriveLifecycleState(asset: MarketCoOwnAsset): AssetLifecycleState {
  // 1. Prefer marketStatus when the backend provides it.
  if (asset.marketStatus) {
    switch (asset.marketStatus) {
      case 'closed':
        return 'exitUnderway';
      case 'paused':
        return 'tradingPaused';
      case 'trading':
        return 'secondaryTrading';
      case 'pre_market':
        return 'initialOffering';
    }
  }

  // 2. Fall back to offeringStatus when available.
  if (asset.offeringStatus) {
    switch (asset.offeringStatus) {
      case 'offering':
        return 'initialOffering';
      case 'allocated':
      case 'closed':
        return 'secondaryTrading';
      case 'failed':
        // Still shown in the offering surface, but with a failed status.
        return 'initialOffering';
    }
  }

  // 3. Legacy inference from isOpen + availableUnits.
  if (!asset.isOpen) return 'tradingPaused';
  if (asset.availableUnits > 0) return 'initialOffering';
  return 'secondaryTrading';
}

/** Candle data point shape expected by CoOwnCandleChart. */
export interface CandleDataPoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Document reference shown in the dossier. */
export interface DossierDocument {
  label: string;
  url: string;
  accessibilityLabel: string;
}
