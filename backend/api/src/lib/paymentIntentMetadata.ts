/**
 * Payment-intent metadata provenance.
 *
 * `payment_intents.metadata` carries fields that gate settlement and money
 * materialization — the auction binding (`auctionId`, `winnerBidderId`), the
 * 1ZE mint quote (`mintQuote`, `mintQuoteMac`, `mintOperationId`) and the
 * canonical money snapshot (`canonicalMoney`). Those keys are written by
 * server code paths only. A client that could plant them via the generic
 * `metadata` payload would be able to:
 *
 *  - bind a payment intent to a victim's auction and hijack settlement
 *    (winner-pay replay hands the client_secret to the wrong caller, or an
 *    unrelated capture settles against a forged auction), and
 *  - forge a mint quote — pay £1 through a real gateway and mint arbitrary
 *    1ZE on the genuine `payment.succeeded` webhook.
 *
 * Two mechanisms close that hole:
 *
 *  1. {@link sanitizePaymentIntentClientMetadata} — strips every server-owned
 *     key from caller-supplied metadata at ingest, so reserved keys can only
 *     ever be written by server code (the auction route writes its binding
 *     with a post-creation UPDATE; the mint/quote route writes the quote
 *     itself).
 *  2. {@link computeMintQuoteMac} / {@link verifyMintQuoteMac} — an HMAC over
 *     the mint quote + the intent it is bound to, checked at materialization
 *     time so even a residual metadata write path cannot forge a quote.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Metadata keys owned by server code on `payment_intents`. Client payloads
 * must never set them — they either drive settlement/materialization
 * decisions or are re-written by the server (keeping them would let client
 * values shadow the authoritative ones).
 */
export const SERVER_OWNED_PAYMENT_INTENT_METADATA_KEYS: ReadonlySet<string> = new Set([
  // Auction binding (written by the auction winner-pay route).
  'auctionId',
  'winnerBidderId',
  'initiatedBy',
  'initiatedByRole',
  'expectedAmountGbp',
  'paymentMethodId',
  'listingId',
  'sellerId',
  'source',
  // Mint quote (written by the mint/quote route).
  'mintOperationId',
  'mintQuote',
  'mintQuoteMac',
  'quoteHash',
  'canonicalMoney',
  'targetAssetAmount',
  'quoteRateSource',
  // Server-derived identity/linkage the canonical route writes itself.
  'userId',
  'orderId',
  'coOwnOrderId',
  'platformFeeAmountGbp',
]);

/**
 * Return a copy of client-supplied metadata with every server-owned key
 * removed. Non-object input yields an empty record.
 */
export function sanitizePaymentIntentClientMetadata(
  metadata: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SERVER_OWNED_PAYMENT_INTENT_METADATA_KEYS.has(key)) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Mint quote MAC
// ---------------------------------------------------------------------------

export interface MintQuoteMacFields {
  /** The payment intent the quote is bound to. */
  paymentIntentId: string;
  /** The wallet owner the mint credits. */
  userId: string;
  mintOperationId: string;
  fiatAmountMinor: number;
  netFiatAmountMinor: number;
  platformFeeMinor: number;
  izeAmountUnits: number;
  ratePerGram: number;
  rateSource: string;
  rateLockedAt: string;
  rateExpiresAt: string;
}

/**
 * HMAC-SHA256 over the canonical mint-quote fields. The MAC binds the quote
 * to a specific intent + user so a forged or transplanted `mintQuote`
 * metadata blob fails verification at materialization time.
 */
export function computeMintQuoteMac(fields: MintQuoteMacFields): string {
  const canonical = JSON.stringify({
    v: 1,
    paymentIntentId: fields.paymentIntentId,
    userId: fields.userId,
    mintOperationId: fields.mintOperationId,
    fiatAmountMinor: String(fields.fiatAmountMinor),
    netFiatAmountMinor: String(fields.netFiatAmountMinor),
    platformFeeMinor: String(fields.platformFeeMinor),
    izeAmountUnits: String(fields.izeAmountUnits),
    ratePerGram: String(fields.ratePerGram),
    rateSource: fields.rateSource,
    rateLockedAt: fields.rateLockedAt,
    rateExpiresAt: fields.rateExpiresAt,
  });
  return crypto
    .createHmac('sha256', config.paymentMetadataHmacSecret)
    .update(canonical)
    .digest('hex');
}

/**
 * Constant-time verification of a stored `mintQuoteMac`. Returns false when
 * the MAC is missing, malformed, or does not match the recomputed value —
 * callers must treat a mismatch as "not a mint quote" and fail closed.
 */
export function verifyMintQuoteMac(
  fields: MintQuoteMacFields,
  storedMac: unknown,
): boolean {
  if (typeof storedMac !== 'string' || !/^[0-9a-f]{64}$/i.test(storedMac)) {
    return false;
  }
  const expected = Buffer.from(computeMintQuoteMac(fields), 'hex');
  const actual = Buffer.from(storedMac, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
