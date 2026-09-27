/**
 * Checkout fixtures — owned by the checkout department.
 *
 * Delivery quotes: the fixture-mode stand-in for the mobile
 * ShippingQuoteItem contract (POST /shipping/quote → quotes[]). Mobile
 * renders a per-option selector only when multiple persisted server
 * quotes exist; the web mirrors that by shipping a small authored
 * catalogue per buyer-paid parcel.
 *
 * Truth rules:
 *  - Carrier/service names are restricted to the carriers the commerce
 *    fixtures already ship with (Royal Mail Tracked 48/24, Evri
 *    Standard/Next Day) — no invented carriers.
 *  - Prices are authored fixture values the same way SHIPPING_FEE is;
 *    the default option is priced at SHIPPING_FEE so every surface that
 *    assumes the flat rate (bag, order detail fallback) stays consistent.
 *  - live: false marks them catalogue estimates — the UI says
 *    "Estimated", never "Live quote".
 */

import { SHIPPING_FEE } from '@/lib/data/fixtures-commerce';

/** Mirrors mobile ShippingQuoteItem (services/commerceApi.ts) minus the
 *  quote-hash/expiry fields only a server can issue. */
export interface CheckoutDeliveryQuote {
  /** Server-persisted quote id in live mode; a stable fixture id here —
   *  createOrder only sends it when the quote was server-issued. */
  quoteId: string;
  carrierId: string;
  /** Human service name — lands on the order detail's service line. */
  serviceName: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
  /** True only for quotes the live quote endpoint returned. */
  live: boolean;
}

/** The quote a parcel defaults to — priced at the flat SHIPPING_FEE the
 *  rest of the commerce surfaces already assume. */
export const DEFAULT_PARCEL_QUOTE_ID = 'fq-rm-tracked48';

export const PARCEL_DELIVERY_QUOTES: CheckoutDeliveryQuote[] = [
  {
    quoteId: DEFAULT_PARCEL_QUOTE_ID,
    carrierId: 'Royal Mail',
    serviceName: 'Tracked 48',
    priceFromGbp: SHIPPING_FEE,
    etaMinDays: 2,
    etaMaxDays: 3,
    tracking: true,
    live: false,
  },
  {
    quoteId: 'fq-rm-tracked24',
    carrierId: 'Royal Mail',
    serviceName: 'Tracked 24',
    priceFromGbp: 4.49,
    etaMinDays: 1,
    etaMaxDays: 2,
    tracking: true,
    live: false,
  },
  {
    quoteId: 'fq-evri-standard',
    carrierId: 'Evri',
    serviceName: 'Standard',
    priceFromGbp: 2.89,
    etaMinDays: 3,
    etaMaxDays: 5,
    tracking: true,
    live: false,
  },
  {
    quoteId: 'fq-evri-nextday',
    carrierId: 'Evri',
    serviceName: 'Next Day',
    priceFromGbp: 5.99,
    etaMinDays: 1,
    etaMaxDays: 1,
    tracking: true,
    live: false,
  },
];

export function deliveryQuoteById(id: string): CheckoutDeliveryQuote | null {
  return PARCEL_DELIVERY_QUOTES.find((q) => q.quoteId === id) ?? null;
}

/** The default parcel quote — what the flat-fee model always implied. */
export function defaultParcelQuote(): CheckoutDeliveryQuote {
  return PARCEL_DELIVERY_QUOTES[0]!;
}

/** ETA copy — mirrors mobile toEtaLabelFromRange (utils/checkoutFlow). */
export function etaLabelFor(minDays: number, maxDays: number): string {
  if (minDays === maxDays) {
    return `${minDays} working day${minDays === 1 ? '' : 's'}`;
  }
  return `${minDays}–${maxDays} working days`;
}
