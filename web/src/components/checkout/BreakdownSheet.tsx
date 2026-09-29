'use client';

/**
 * BreakdownSheet — the itemised ledger, a Sheet port of mobile's
 * CheckoutBreakdownSheet ("Full breakdown"), extended for the web's
 * multi-parcel bag: every line the total is made of — items, postage per
 * parcel, buyer protection, verification, bundle discount — reconciling
 * exactly to the payable total.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';
import type { CheckoutTotals } from '@/lib/commerce/postage';
import {
  BUNDLE_RULE_LABEL,
  sellerGroups,
} from '@/lib/data/fixtures';
import {
  parcelQuote,
  type DeliverySelection,
} from '@/components/checkout/checkoutViewModel';
import { formatPrice } from '@/lib/utils/format';

function Line({
  label,
  value,
  strong = false,
  tone,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
  tone?: 'success' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className={`text-body ${
          strong ? 'font-semibold text-text-primary' : 'text-text-secondary'
        }`}
      >
        {label}
      </dt>
      <dd
        className={`tnum shrink-0 ${
          strong
            ? 'font-semibold text-text-primary'
            : tone === 'success'
              ? 'font-semibold text-success-text'
              : 'text-text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function BreakdownSheet({
  open,
  onClose,
  items,
  delivery,
  totals,
  bundleDiscount,
  verificationRequested,
  /** "Free" (requested add-on) or "Included" (threshold-qualified) — the
   *  caller owns the honest wording. */
  verificationLabel,
}: {
  open: boolean;
  onClose: () => void;
  items: Listing[];
  delivery: DeliverySelection;
  totals: CheckoutTotals;
  bundleDiscount: number;
  verificationRequested: boolean;
  verificationLabel?: string;
}) {
  const groups = sellerGroups(items);
  const payableTotal = Math.round((totals.total - bundleDiscount) * 100) / 100;

  return (
    <Sheet open={open} onClose={onClose} title="Full breakdown" maxWidth={440}>
      <div className="flex flex-col gap-4 px-5 pb-6">
        {/* Items — one line each so the subtotal is auditable. */}
        <dl className="flex flex-col gap-2">
          {items.map((item) => (
            <Line
              key={item.id}
              label={<span className="clamp-1">{item.title}</span>}
              value={formatPrice(item.price)}
            />
          ))}
        </dl>

        <dl className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          {groups.map((group, i) => {
            const quote = parcelQuote(group, delivery);
            const seller = group.seller?.username ? `@${group.seller.username}` : 'Seller';
            return (
              <Line
                key={group.sellerId}
                label={
                  <>
                    Postage{groups.length > 1 ? ` · parcel ${i + 1}` : ''} · {seller}
                    {quote ? ` · ${quote.serviceName}` : ''}
                    {quote && !quote.live ? ' (Estimated)' : ''}
                  </>
                }
                value={quote ? formatPrice(quote.priceFromGbp) : 'Free — seller pays'}
              />
            );
          })}
          <Line label="Buyer protection fee" value={formatPrice(totals.protectionFee)} />
          {verificationRequested ? (
            <Line label="Item verification" value={verificationLabel ?? 'Free'} />
          ) : null}
          {bundleDiscount > 0 ? (
            <Line
              label={
                <span className="inline-flex items-center gap-1">
                  <Icon name="pricetag" size={14} className="text-success-text" />
                  Bundle discount ({BUNDLE_RULE_LABEL})
                </span>
              }
              value={`−${formatPrice(bundleDiscount)}`}
              tone="success"
            />
          ) : null}
        </dl>

        <p className="flex items-start gap-1.5 text-meta text-success-text">
          <Icon name="check" size={13} className="mt-0.5 shrink-0" filled />
          Includes buyer protection — funds are held until you receive your order
        </p>

        <div className="flex items-baseline justify-between border-t border-border-subtle pt-3">
          <span className="text-price-list font-semibold text-text-primary">Total</span>
          <span className="tnum text-screen-title text-text-primary">
            {formatPrice(payableTotal)}
          </span>
        </div>

        <p className="flex items-start gap-2 border-t border-border-subtle pt-3 text-body text-text-secondary">
          <Icon name="refresh" size={16} className="mt-0.5 shrink-0 text-text-muted" />
          Returns accepted within 14 days. Refunds are issued to your original
          payment method.
        </p>
      </div>
    </Sheet>
  );
}
