'use client';

/**
 * DeliveryPicker — per-parcel carrier/service selection, the web port of
 * the mobile CheckoutDeliverySelector (components/checkout/
 * CheckoutDeliverySelector.tsx).
 *
 * Semantics mirrored 1:1:
 *  - every option is a real quote (label, price, ETA range, tracking) —
 *    the sheet opens only when the parcel has more than one quote, and
 *    catalogue quotes are labelled "Estimated" (live: false).
 *  - seller-covered parcels have no choice to make — they render the
 *    "seller covers postage" line with no affordance.
 *  - picking a quote re-prices the parcel's postage; the ledger updates
 *    because totals derive from the selection, not a copy of it.
 *
 * Grammar: flat hairline rows (the checkout's selection grammar), a Sheet
 * for the option list, role="radiogroup" with roving tabindex.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import {
  etaLabelFor,
  type CheckoutDeliveryQuote,
} from '@/lib/data/fixtures-checkout';
import { formatPrice } from '@/lib/utils/format';

/** Per-parcel view-model — the page resolves quotes (fixture catalogue or
 *  live /shipping/quote rows) into this shape so the component never
 *  cares where a price came from. */
export interface ParcelDeliveryVm {
  sellerId: string;
  sellerName: string | null;
  /** 1-based position and total — "Parcel 1 of 2" on multi-seller orders. */
  index: number;
  count: number;
  /** Every item in the parcel is seller-posted — postage is free and no
   *  selection exists. */
  sellerCovered: boolean;
  /** Quotes this parcel may switch between ([] or 1 → no affordance). */
  quotes: CheckoutDeliveryQuote[];
  /** The quote the parcel is priced on (null only when sellerCovered). */
  selected: CheckoutDeliveryQuote | null;
}

function quoteMeta(quote: CheckoutDeliveryQuote): string {
  return [
    etaLabelFor(quote.etaMinDays, quote.etaMaxDays),
    quote.tracking ? 'Tracked' : null,
    quote.live ? 'Live quote' : 'Estimated',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function quoteTitle(quote: CheckoutDeliveryQuote): string {
  return `${quote.carrierId} ${quote.serviceName}`;
}

/**
 * Radio-group keyboard grammar — roving tabindex with arrows/Home/End that
 * move focus AND selection (same ARIA radio-group pattern the selection
 * lists use).
 */
function onRadioGroupKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % radios.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (current - 1 + radios.length) % radios.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = radios.length - 1;
  }
  if (next < 0 || next === current) return;
  event.preventDefault();
  const target = radios[next];
  target?.focus();
  target?.click();
}

export function DeliveryPicker({
  parcels,
  onSelect,
}: {
  parcels: ParcelDeliveryVm[];
  onSelect: (sellerId: string, quote: CheckoutDeliveryQuote) => void;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const active = parcels.find((p) => p.sellerId === openFor) ?? null;

  if (parcels.length === 0) return null;

  return (
    <section>
      <h2 className="text-section-title font-semibold text-text-primary">Delivery</h2>
      <ul className="mt-1 divide-y divide-border-subtle">
        {parcels.map((parcel) => {
          const switchable = !parcel.sellerCovered && parcel.quotes.length > 1;
          const quote = parcel.selected;
          const parcelName = parcel.sellerName ? `@${parcel.sellerName}` : 'Seller';
          const label = parcel.sellerCovered
            ? `${parcel.count > 1 ? `Parcel ${parcel.index} — ` : ''}${parcelName}: seller covers postage`
            : quote
              ? `${parcel.count > 1 ? `Parcel ${parcel.index} — ` : ''}${parcelName}: ${quoteTitle(quote)}, ${quoteMeta(quote)}, ${formatPrice(quote.priceFromGbp)}`
              : `${parcelName}: no delivery option`;
          const row = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-secondary">
                <Icon name="box" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="clamp-1 text-body font-medium text-text-primary">
                  {parcel.count > 1 ? `Parcel ${parcel.index} · ` : ''}
                  {parcel.sellerCovered
                    ? 'Free delivery'
                    : quote
                      ? quoteTitle(quote)
                      : 'Delivery'}
                </span>
                <span className="clamp-1 text-caption text-text-secondary">
                  {parcel.sellerCovered
                    ? `${parcelName} covers postage`
                    : quote
                      ? `${parcelName} · ${quoteMeta(quote)}`
                      : parcelName}
                </span>
              </span>
              {parcel.sellerCovered ? (
                <span className="shrink-0 text-body font-semibold text-text-primary">Free</span>
              ) : quote ? (
                <span className="tnum shrink-0 text-body font-semibold text-text-primary">
                  {formatPrice(quote.priceFromGbp)}
                </span>
              ) : null}
              {switchable ? (
                <Icon name="chevronDown" size={18} className="shrink-0 text-text-muted" />
              ) : null}
            </>
          );
          return (
            <li key={parcel.sellerId}>
              {switchable ? (
                <button
                  type="button"
                  onClick={() => setOpenFor(parcel.sellerId)}
                  aria-label={`${label}. Change delivery speed`}
                  className="pressable flex w-full items-center gap-3 py-3 text-left"
                >
                  {row}
                </button>
              ) : (
                <div aria-label={label} className="flex w-full items-center gap-3 py-3">
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Quote selector — one sheet per parcel, radio grammar, price deltas
          are the row price itself (never "+£1.00" arithmetic the user has
          to verify). */}
      <Sheet
        open={!!active}
        onClose={() => setOpenFor(null)}
        title={
          active
            ? `Delivery speed${active.sellerName ? ` — @${active.sellerName}` : ''}`
            : 'Delivery speed'
        }
      >
        {active ? (
          <div>
            <div
              role="radiogroup"
              aria-label="Delivery options"
              onKeyDown={onRadioGroupKeyDown}
              className="divide-y divide-border-subtle px-5"
            >
              {active.quotes.map((quote) => {
                const selected = quote.quoteId === active.selected?.quoteId;
                const meta = quoteMeta(quote);
                return (
                  <button
                    key={quote.quoteId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${quoteTitle(quote)}, ${formatPrice(quote.priceFromGbp)}, ${meta}${selected ? ', selected' : ''}`}
                    tabIndex={selected || active.quotes[0]?.quoteId === quote.quoteId ? 0 : -1}
                    onClick={() => {
                      onSelect(active.sellerId, quote);
                      setOpenFor(null);
                    }}
                    className={`pressable flex w-full items-center gap-3 py-3 text-left ${
                      selected ? 'bg-brand-subtle' : ''
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? 'border-brand bg-brand' : 'border-border'
                      }`}
                    >
                      {selected ? <Icon name="check" size={12} className="text-text-inverse" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-text-primary">
                        {quoteTitle(quote)}
                      </span>
                      <span className="block text-meta text-text-secondary">{meta}</span>
                    </span>
                    <span className="tnum shrink-0 text-body-emphasis font-semibold text-text-primary">
                      {formatPrice(quote.priceFromGbp)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="flex items-center justify-center gap-1.5 border-t border-border-subtle py-2.5 text-meta text-text-muted">
              <Icon name="info" size={13} />
              Delivery price updates the order total
            </p>
          </div>
        ) : null}
      </Sheet>
    </section>
  );
}
