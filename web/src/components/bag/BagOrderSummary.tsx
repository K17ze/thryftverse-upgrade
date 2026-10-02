'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { BUNDLE_RULE_LABEL } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';
import { BagPromoCodeInput } from './BagPromoCodeInput';
import { BagTrustBadges } from './BagTrustBadges';

export interface BagTotals {
  items: number;
  shippingFee: number;
  protectionFee: number;
  parcels: number;
  total: number;
}

interface BagOrderSummaryProps {
  itemsCount: number;
  totals: BagTotals;
  bundleDiscount: number;
  promoDiscount: number;
  payableTotal: number;
  appliedPromo: { code: string; discountPct: number } | null;
  onApplyPromo: (code: string, discountPct: number) => void;
  onRemovePromo: () => void;
  onCheckout: () => void;
}

/**
 * Totals ledger — flat lines, hairlines, tabular figures, one unambiguous CTA.
 * Live mode respects truthful server charges (no client-fabricated promo or discounts).
 */
export function BagOrderSummary({
  itemsCount,
  totals,
  bundleDiscount,
  promoDiscount,
  payableTotal,
  appliedPromo,
  onApplyPromo,
  onRemovePromo,
  onCheckout,
}: BagOrderSummaryProps) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <h2 className="text-body-emphasis font-bold text-text-primary">
        Order summary
      </h2>
      <dl className="mt-4 flex flex-col gap-2.5 border-y border-border-subtle py-4">
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Items ({itemsCount})</dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.items)}</dd>
        </div>
        <div className="flex justify-between text-body text-text-secondary">
          <dt>
            Postage{totals.parcels > 1 ? ` · ${totals.parcels} parcels` : ''}
          </dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.shippingFee)}</dd>
        </div>
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Buyer Protection fee</dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.protectionFee)}</dd>
        </div>
        {/* Live: informational only — the server charges each
            listing in full, so no −£ amount may render here. */}
        {bundleDiscount > 0 ? (
          <div className="flex justify-between text-body text-text-secondary">
            {DATA_MODE === 'live' ? (
              <dt className="flex items-center gap-1.5">
                <Icon name="box" size={15} className="text-text-muted" />
                Bundle posts together — no checkout discount
              </dt>
            ) : (
              <>
                <dt className="flex items-center gap-1.5">
                  <Icon name="pricetag" size={15} className="text-success-text" />
                  Bundle discount ({BUNDLE_RULE_LABEL})
                </dt>
                <dd className="tnum font-semibold text-success-text">
                  −{formatPrice(bundleDiscount)}
                </dd>
              </>
            )}
          </div>
        ) : null}
        {promoDiscount > 0 ? (
          <div className="flex justify-between text-body text-text-secondary">
            <dt className="flex items-center gap-1.5">
              <Icon name="pricetag" size={15} className="text-success-text" />
              Promo code ({appliedPromo?.code})
            </dt>
            <dd className="tnum font-semibold text-success-text">
              −{formatPrice(promoDiscount)}
            </dd>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between border-t border-border-subtle pt-3 text-body-emphasis text-text-primary">
          <dt className="font-bold">Total</dt>
          <dd className="tnum text-price-list font-bold">
            {formatPrice(payableTotal)}
          </dd>
        </div>
      </dl>

      {/* Promo input is fixture-demo only — the server never sees a
          promo field, so live mode renders no input and no toasts. */}
      {DATA_MODE !== 'live' ? (
        <div className="mt-3">
          <BagPromoCodeInput
            appliedPromo={appliedPromo}
            onApplyPromo={onApplyPromo}
            onRemovePromo={onRemovePromo}
          />
        </div>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-5"
        onClick={onCheckout}
      >
        Checkout · <span className="tnum">{formatPrice(payableTotal)}</span>
      </Button>

      <BagTrustBadges />
    </aside>
  );
}
