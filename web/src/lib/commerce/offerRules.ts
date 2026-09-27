/**
 * Offer rules — the make-an-offer floor, shared by the PDP composer, the
 * mobile-dock offer path and any future surface that writes a listing offer.
 *
 * Marketplace norm (Vinted grammar): a first offer cannot undercut the ask
 * by more than 40%. The backend accepts any positive amount and enforces
 * its own bounds server-side — this is a client-side floor so the composer
 * can state the limit up front instead of failing silently server-side.
 * Counters (`counterTo` replies) are exempt: negotiating below the floor
 * is between buyer and seller once a thread exists.
 */
export const MAX_OFFER_DISCOUNT_PCT = 40;
const MIN_OFFER_RATIO = 1 - MAX_OFFER_DISCOUNT_PCT / 100;

/** The lowest first offer allowed against an asking price, in GBP. */
export function minOfferAmount(askingPrice: number): number {
  return Math.ceil(askingPrice * MIN_OFFER_RATIO * 100) / 100;
}

/** True when an initial offer is below the marketplace floor. */
export function isBelowOfferFloor(amount: number, askingPrice: number): boolean {
  return amount < minOfferAmount(askingPrice);
}
