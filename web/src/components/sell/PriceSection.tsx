'use client';

/**
 * PriceSection — deal terms: price input with £ prefix, suggested-price
 * hint from category comparables, and the buyer-protection fee preview.
 */

import { CATEGORIES } from '@/lib/data/fixtures';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  PRICE_POSITION_COPY,
  parsePriceInput,
  priceCompsFor,
  pricePosition,
  protectionFeeGbp,
  sanitizePriceInput,
  type SellDraft,
  type SellErrors,
} from './constants';
import { INPUT_CLASS, INPUT_ERROR_CLASS, SellField } from './SellField';
import { SellSection } from './SellSection';

interface PriceSectionProps {
  draft: SellDraft;
  errors: SellErrors;
  update: (patch: Partial<SellDraft>) => void;
  clearError: (key: keyof SellErrors) => void;
}

export function PriceSection({ draft, errors, update, clearError }: PriceSectionProps) {
  const price = parsePriceInput(draft.price);
  const originalPrice = parsePriceInput(draft.originalPrice);
  const comps = priceCompsFor(draft.category);
  const categoryName = CATEGORIES.find((c) => c.slug === draft.category)?.name;
  const position = price != null ? pricePosition(price, draft.category) : null;
  const fee = price != null ? protectionFeeGbp(price) : 0;
  const buyerPays = price != null ? price + fee : null;
  // Discount read-out — mirrors mobile computeDiscount: only a genuine
  // "was" price above the ask produces a percentage at all.
  const discountPct =
    originalPrice != null && price != null && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  return (
    <SellSection id="sell-price" step={3} title="Price" subtitle="Set your ask — buyer protection is added on top.">
      <SellField
        id="sell-field-price"
        label="Your price"
        required
        done={price != null}
        error={errors.price}
      >
        <div className="relative max-w-[220px]">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
            £
          </span>
          <input
            id="sell-field-price"
            type="text"
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => {
              update({ price: sanitizePriceInput(e.target.value) });
              clearError('price');
            }}
            placeholder="0.00"
            maxLength={9}
            aria-invalid={!!errors.price}
            aria-describedby={errors.price ? 'sell-field-price-error' : undefined}
            className={`tnum ${INPUT_CLASS} pl-7 ${errors.price ? INPUT_ERROR_CLASS : ''}`}
          />
        </div>
      </SellField>

      {/* RRP — the contract's originalPrice. Optional, but when set it
          must outrank the ask: it renders as the struck-through "was"
          price, so anything else would fake a discount. */}
      <div className="mt-5">
        <SellField
          id="sell-field-original-price"
          label="Original price (RRP)"
          optional
          done={originalPrice != null}
          error={errors.originalPrice}
          hint={
            errors.originalPrice
              ? undefined
              : discountPct != null
                ? `Shows as “was ${formatPrice(originalPrice)}” — a ${discountPct}% saving buyers can see.`
                : draft.originalPrice.trim() === ''
                  ? 'What it sold for new — only add a figure you can stand over.'
                  : 'The “was” price only shows when it’s higher than your price.'
          }
        >
          <div className="relative max-w-[220px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
              £
            </span>
            <input
              id="sell-field-original-price"
              type="text"
              inputMode="decimal"
              value={draft.originalPrice}
              onChange={(e) => {
                update({ originalPrice: sanitizePriceInput(e.target.value) });
                clearError('originalPrice');
              }}
              placeholder="0.00"
              maxLength={9}
              aria-invalid={!!errors.originalPrice}
              aria-describedby={errors.originalPrice ? 'sell-field-original-price-error' : undefined}
              className={`tnum ${INPUT_CLASS} pl-7 ${errors.originalPrice ? INPUT_ERROR_CLASS : ''}`}
            />
          </div>
        </SellField>
      </div>

      {/* Comparable range — live listings in the category (honest framing:
          the pool has no sold records, so this never claims sold data). */}
      {comps ? (
        <p className="mt-3 text-caption text-text-muted">
          <span className="tnum">
            {formatPrice(comps.min)}–{formatPrice(comps.max)}
          </span>{' '}
          · <span className="tnum">{comps.count}</span> similar live listings
          {categoryName ? ` in ${categoryName.toLowerCase()}` : ''}
        </p>
      ) : null}

      {/* Suggested price — median of the comparable set, tap to set when empty. */}
      {comps ? (
        <button
          type="button"
          onClick={() => {
            if (price == null) {
              update({ price: String(comps.median) });
              clearError('price');
            }
          }}
          className="pressable mt-2.5 flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary"
        >
          <Icon name="sparkles" size={14} className="text-text-primary" />
          <span>
            Similar items list around{' '}
            <span className="tnum font-semibold text-text-primary">{formatPrice(comps.median)}</span>
          </span>
          {price == null ? (
            <span className="font-medium text-text-primary">Tap to set</span>
          ) : null}
        </button>
      ) : null}

      {/* Market position — how the ask reads against the comp range. */}
      {position ? (
        <p
          className={`mt-2.5 flex items-center gap-1.5 text-caption ${
            PRICE_POSITION_COPY[position].tone === 'warn'
              ? 'text-warning-text'
              : 'text-success-text'
          }`}
        >
          <Icon
            name={PRICE_POSITION_COPY[position].tone === 'warn' ? 'warning' : 'check'}
            size={14}
          />
          {PRICE_POSITION_COPY[position].label}
        </p>
      ) : null}

      {/* Buyer-protection preview — what the buyer sees vs what you get. */}
      {price != null && buyerPays != null ? (
        <p className="mt-4 flex items-start gap-2 text-body text-text-secondary">
          <Icon name="shieldCheck" size={16} className="mt-0.5 shrink-0 text-commerce-trust" />
          <span>
            Buyer pays <span className="tnum font-semibold text-text-primary">{formatPrice(buyerPays)}</span>{' '}
            incl. protection — you get{' '}
            <span className="tnum font-semibold text-success-text">{formatPrice(price)}</span>
          </span>
        </p>
      ) : null}
    </SellSection>
  );
}
