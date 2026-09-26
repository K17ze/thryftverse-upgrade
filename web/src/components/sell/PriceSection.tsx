'use client';

/**
 * PriceSection — deal terms: price input with £ prefix, suggested-price
 * hint from category comparables, and the buyer-protection fee preview.
 */

import { CATEGORIES } from '@/lib/data/fixtures';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  parsePriceInput,
  protectionFeeGbp,
  sanitizePriceInput,
  suggestedPriceFor,
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
  const suggestion = suggestedPriceFor(draft.category);
  const categoryName = CATEGORIES.find((c) => c.slug === draft.category)?.name;
  const fee = price != null ? protectionFeeGbp(price) : 0;
  const buyerPays = price != null ? price + fee : null;

  return (
    <SellSection id="sell-price" step={3} title="Price" subtitle="Set your ask — buyer protection is added on top.">
      <SellField id="sell-field-price" label="Your price" required error={errors.price}>
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

      {/* Suggested price — comparable-informed, tap to set when empty. */}
      {suggestion != null ? (
        <button
          type="button"
          onClick={() => {
            if (price == null) {
              update({ price: String(suggestion) });
              clearError('price');
            }
          }}
          className="pressable mt-3 flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary"
        >
          <Icon name="sparkles" size={14} className="text-text-primary" />
          <span>
            Similar{categoryName ? ` ${categoryName.toLowerCase()}` : ''} items list around{' '}
            <span className="tnum font-semibold text-text-primary">{formatPrice(suggestion)}</span>
          </span>
          {price == null ? (
            <span className="font-medium text-text-primary">Tap to set</span>
          ) : null}
        </button>
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
