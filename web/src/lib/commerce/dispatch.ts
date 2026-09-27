/**
 * Dispatch SLA — the single source for "how long a seller has to post".
 * The seller-hub subtitle, the to-do meta, fixture ship-by dates, the PDP
 * delivery line and the checkout pre-fulfilment estimate all read this so
 * the number never drifts between surfaces (a checkout promise shorter
 * than the fulfilment SLA is a lie the buyer pays for).
 *
 * Mirrors the backend default `config.dispatchSlaDefaultDays`
 * (DISPATCH_SLA_DEFAULT_DAYS, default 3 — backend/api/src/config.ts), which
 * the order rights snapshot copies at purchase time and the auto-feedback
 * sweep measures as calendar days (paid_at + slaDays × 24h). A listing's
 * own `dispatchSlaDays` (when the contract carries one) wins over this.
 */
export const DISPATCH_SLA_DAYS = 3;
export const DISPATCH_SLA_LABEL = `${DISPATCH_SLA_DAYS} days`;
