/**
 * Smart Sell API — auto-negotiation service (mock-ready)
 *
 * Inspired by Poshmark's March 2026 "Smart Sell": listings with Smart Sell
 * enabled are 60% more likely to sell within 7 days because offers above a
 * seller-defined threshold are auto-accepted, and offers below a floor are
 * auto-declined — keeping the seller's negotiation queue small and responsive.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   The current implementation is a *mock* service. It does NOT actually
 *   negotiate with buyers, persist thresholds, or process offers. Every
 *   returned entity carries `isDemo: true` so the UI can honestly label the
 *   experience "Demo mode". The `SMART_SELL_DEMO_MODE` flag is the single
 *   source of truth for the demo state.
 *
 *   `simulateOfferReceived` fabricates a plausible offer for demonstration —
 *   it never claims a real buyer placed it. The caller must surface this as a
 *   simulated event.
 *
 * When a real negotiation backend is wired in, set `SMART_SELL_DEMO_MODE =
 * false` and replace the mock branches with real fetch calls. The contract
 * (types + function signatures) stays the same — the UI layer does not need
 * to change.
 */

// ---------------------------------------------------------------------------
// Demo-mode flag — single source of truth
// ---------------------------------------------------------------------------

/** When true, all data returned by this service is mock/illustrative. */
export const SMART_SELL_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Seller-defined auto-negotiation thresholds for a listing.
 *
 * - `minPrice` is the floor: offers below this are auto-declined.
 * - `autoAcceptThreshold` is the ceiling: offers at or above this are
 *   auto-accepted.
 * - Offers between the floor and the ceiling remain `manual` for the seller
 *   to review.
 */
export interface SmartSellConfig {
  listingId: string;
  /** Whether Smart Sell is active for this listing. */
  enabled: boolean;
  /** Floor price (GBP). Auto-decline offers strictly below this. */
  minPrice: number;
  /** Ceiling price (GBP). Auto-accept offers at or above this. */
  autoAcceptThreshold: number;
  /** Optional explicit decline threshold. Defaults to `minPrice`. */
  declineThreshold: number;
  /** ISO timestamp of last configuration update. */
  updatedAt: string;
  /** Honest flag — true while this config is mock data. */
  isDemo: boolean;
}

export type SmartSellOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired';

export type SmartSellAction =
  | 'auto_accepted'
  | 'auto_declined'
  | 'manual';

/**
 * An offer received on a Smart-Sell-enabled listing, with the action the
 * auto-negotiator *would* take. In demo mode no action is actually performed.
 */
export interface SmartSellOffer {
  offerId: string;
  listingId: string;
  /** Offer amount in GBP. */
  offerAmount: number;
  buyerId: string;
  buyerName: string;
  status: SmartSellOfferStatus;
  /** ISO timestamp the offer was received. */
  receivedAt: string;
  /** What the auto-negotiator decided (illustrative in demo mode). */
  smartSellAction: SmartSellAction;
  /** Honest flag — true while this offer is mock data. */
  isDemo: boolean;
}

/**
 * Aggregate Smart Sell performance stats for a listing. All figures are
 * illustrative in demo mode.
 */
export interface SmartSellStats {
  listingId: string;
  totalOffers: number;
  autoAccepted: number;
  autoDeclined: number;
  pending: number;
  /** Average response time in seconds (auto-actions are near-instant). */
  avgResponseTime: number;
  /** Estimated conversion uplift vs. a non-Smart-Sell listing (0–1). */
  conversionUplift: number;
  /** Honest flag — true while these stats are mock data. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// In-memory mock store (demo mode only)
// ---------------------------------------------------------------------------

const configStore = new Map<string, SmartSellConfig>();
const offerStore = new Map<string, SmartSellOffer[]>();

function defaultConfig(listingId: string): SmartSellConfig {
  return {
    listingId,
    enabled: false,
    minPrice: 0,
    autoAcceptThreshold: 0,
    declineThreshold: 0,
    updatedAt: new Date().toISOString(),
    isDemo: SMART_SELL_DEMO_MODE,
  };
}

function getOrCreateConfig(listingId: string): SmartSellConfig {
  const existing = configStore.get(listingId);
  if (existing) return existing;
  const fresh = defaultConfig(listingId);
  configStore.set(listingId, fresh);
  return fresh;
}

function clampThresholds(input: Partial<SmartSellConfig>): {
  minPrice: number;
  autoAcceptThreshold: number;
  declineThreshold: number;
} {
  const minPrice = Math.max(0, Number(input.minPrice) || 0);
  const autoAcceptThreshold = Math.max(
    minPrice,
    Number(input.autoAcceptThreshold) || 0,
  );
  const declineThreshold =
    input.declineThreshold !== undefined
      ? Math.max(0, Math.min(Number(input.declineThreshold), minPrice))
      : minPrice;
  return { minPrice, autoAcceptThreshold, declineThreshold };
}

function decideAction(
  amount: number,
  config: SmartSellConfig,
): SmartSellAction {
  if (amount >= config.autoAcceptThreshold && config.autoAcceptThreshold > 0) {
    return 'auto_accepted';
  }
  if (amount < config.declineThreshold && config.declineThreshold > 0) {
    return 'auto_declined';
  }
  return 'manual';
}

function statusForAction(action: SmartSellAction): SmartSellOfferStatus {
  if (action === 'auto_accepted') return 'accepted';
  if (action === 'auto_declined') return 'declined';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the Smart Sell configuration for a listing.
 * Returns a disabled default config when none has been set.
 */
export function fetchSmartSellConfig(listingId: string): SmartSellConfig {
  return { ...getOrCreateConfig(listingId) };
}

/**
 * Update the Smart Sell configuration for a listing.
 * In demo mode this only updates the in-memory store.
 */
export function updateSmartSellConfig(
  listingId: string,
  config: Partial<SmartSellConfig>,
): SmartSellConfig {
  const current = getOrCreateConfig(listingId);
  const thresholds = clampThresholds(config);
  const next: SmartSellConfig = {
    ...current,
    ...config,
    listingId,
    minPrice: thresholds.minPrice,
    autoAcceptThreshold: thresholds.autoAcceptThreshold,
    declineThreshold: thresholds.declineThreshold,
    updatedAt: new Date().toISOString(),
    isDemo: SMART_SELL_DEMO_MODE,
  };
  configStore.set(listingId, next);
  return { ...next };
}

/**
 * Enable Smart Sell for a listing with the given thresholds.
 */
export function enableSmartSell(
  listingId: string,
  config: Partial<SmartSellConfig>,
): SmartSellConfig {
  return updateSmartSellConfig(listingId, { ...config, enabled: true });
}

/**
 * Disable Smart Sell for a listing. Preserves thresholds for re-enabling.
 */
export function disableSmartSell(listingId: string): void {
  const current = getOrCreateConfig(listingId);
  configStore.set(listingId, {
    ...current,
    enabled: false,
    updatedAt: new Date().toISOString(),
    isDemo: SMART_SELL_DEMO_MODE,
  });
}

/**
 * Fetch the (mock) offer history for a listing.
 */
export function fetchSmartSellOffers(listingId: string): SmartSellOffer[] {
  const offers = offerStore.get(listingId) ?? [];
  return offers.map((o) => ({ ...o }));
}

/**
 * Fetch aggregate Smart Sell stats for a listing.
 * Figures are derived from the mock offer store in demo mode.
 */
export function fetchSmartSellStats(listingId: string): SmartSellStats {
  const offers = offerStore.get(listingId) ?? [];
  const autoAccepted = offers.filter((o) => o.smartSellAction === 'auto_accepted').length;
  const autoDeclined = offers.filter((o) => o.smartSellAction === 'auto_declined').length;
  const pending = offers.filter((o) => o.status === 'pending').length;
  const avgResponseTime =
    autoAccepted + autoDeclined > 0 ? 1.2 : 0; // near-instant for auto-actions
  return {
    listingId,
    totalOffers: offers.length,
    autoAccepted,
    autoDeclined,
    pending,
    avgResponseTime,
    conversionUplift: 0.6,
    isDemo: SMART_SELL_DEMO_MODE,
  };
}

/**
 * Simulate an offer being received on a Smart-Sell-enabled listing.
 *
 * IMPORTANT: This fabricates a plausible buyer + offer for demonstration. It
 * does NOT represent a real buyer action. The returned offer is flagged
 * `isDemo: true` and the caller must present it as a simulated event.
 */
export function simulateOfferReceived(
  listingId: string,
  amount: number,
): SmartSellOffer {
  const config = getOrCreateConfig(listingId);
  const action = decideAction(amount, config);
  const offer: SmartSellOffer = {
    offerId: `demo_offer_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    listingId,
    offerAmount: Math.max(0, amount),
    buyerId: `demo_buyer_${Math.floor(Math.random() * 1000)}`,
    buyerName: 'Demo buyer',
    status: statusForAction(action),
    receivedAt: new Date().toISOString(),
    smartSellAction: action,
    isDemo: SMART_SELL_DEMO_MODE,
  };
  const offers = offerStore.get(listingId) ?? [];
  offers.unshift(offer);
  offerStore.set(listingId, offers);
  return { ...offer };
}
