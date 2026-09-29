'use client';

/**
 * OrderSummary — checkout's right rail, read as a box manifest: one numbered
 * parcel per seller (items from one seller post together), each parcel with
 * its own postage and bundle lines, then the checkout-wide fee ledger and
 * total. Flat hairline grammar; the Pay CTA lives on the page, not here.
 *
 * Postage honesty: the fixture postage model is one flat charge per
 * seller parcel (lib/commerce/postage) — each parcel in the manifest
 * shows its own real postage, free only when every item in it is
 * seller-covered. The carrier name renders when the whole parcel agrees
 * on one shippingMethod; per-item ETA/dispatch truth lives on the PDP
 * delivery block and the dispatch line beside the Pay button, not here.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { BUNDLE_RULE_LABEL, sellerGroups, type SellerGroup } from '@/lib/data/fixtures';
import { type CheckoutTotals } from '@/lib/commerce/postage';
import {
  parcelQuote,
  type DeliverySelection,
} from '@/components/checkout/checkoutViewModel';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

/** The parcel's carrier only when every item in it names the same
 *  shippingMethod — a mixed or silent group has no honest carrier line. */
function sharedCarrier(group: SellerGroup): string | null {
  const first = group.items[0]?.shippingMethod;
  return first && group.items.every((i) => i.shippingMethod === first) ? first : null;
}

function SummaryLineItem({ item }: { item: Listing }) {
  return (
    <li className="flex items-center gap-3">
      <Link
        href={`/item/${item.id}`}
        className="pressable w-12 shrink-0 overflow-hidden rounded-md"
        aria-label={item.title}
      >
        <AppImage
          src={getListingCoverUri(item.images)}
          alt={item.title}
          aspectRatio={0.8}
          focalPoint={getCategoryFocalPoint(item.category)}
          sizes="48px"
          className="w-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body text-text-primary">{item.title}</p>
        <p className="clamp-1 text-caption text-text-secondary">
          {[item.brand, item.size ? `Size ${item.size}` : null, item.condition]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <span className="tnum shrink-0 text-body font-semibold text-text-primary">
        {formatPrice(item.price)}
      </span>
    </li>
  );
}

/** One seller's parcel — the box manifest: items plus that parcel's own
 *  postage and bundle lines, so combined shipping reads where it happens. */
function SellerParcel({
  group,
  postageLabel,
  serviceLabel,
  index,
  count,
  bundleCharged = true,
}: {
  group: SellerGroup;
  /** The parcel's own postage — the per-seller charge, or "Free" when the
   *  seller covers it. */
  postageLabel: string;
  /** The chosen delivery service (carrier + service name) — wins over the
   *  listings' static shippingMethod when the buyer picked a quote. */
  serviceLabel?: string | null;
  /** 1-based parcel position — the manifest reads "Parcel 1 of 2". */
  index: number;
  count: number;
  /** Fixture-only: when false (live mode) the −£ bundle line is omitted —
   *  the backend charges listing price in full; the "post together"
   *  header copy above remains the truthful bundle benefit. */
  bundleCharged?: boolean;
}) {
  const username = group.seller?.username ?? null;
  const carrier = serviceLabel ?? sharedCarrier(group);
  const combined = group.items.length > 1;

  return (
    <section aria-label={username ? `Parcel from @${username}` : 'Parcel'}>
      <h3 className="flex items-center gap-1.5 text-caption font-semibold text-text-primary">
        <Icon name="box" size={14} className="shrink-0 text-text-muted" />
        {count > 1 ? (
          <span className="tnum">Parcel {index} of {count}</span>
        ) : (
          <span>Parcel</span>
        )}
        <span className="tnum font-normal text-text-muted">
          · {username ? `@${username}` : 'Seller'} · {group.items.length}{' '}
          {group.items.length === 1 ? 'item' : 'items'}
          {combined ? ' · post together' : ''}
        </span>
      </h3>
      <ul className="mt-2.5 flex flex-col gap-3">
        {group.items.map((item) => (
          <SummaryLineItem key={item.id} item={item} />
        ))}
      </ul>
      <dl className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-caption">
          <dt className="text-text-secondary">
            Postage{combined ? ' — combined' : ''}
            {carrier ? ` · ${carrier}` : ''}
          </dt>
          <dd className="tnum text-text-primary">{postageLabel}</dd>
        </div>
        {bundleCharged && group.qualifies ? (
          <div className="flex items-baseline justify-between gap-3 text-caption">
            <dt className="flex items-center gap-1 text-text-secondary">
              <Icon name="pricetag" size={13} className="text-success-text" />
              Bundle discount ({BUNDLE_RULE_LABEL})
            </dt>
            <dd className="tnum shrink-0 font-semibold text-success-text">
              −{formatPrice(group.discount)}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function OrderSummary({
  items,
  totals,
  bundleDiscount = 0,
  delivery = {},
  verificationLabel,
  bundleCharged = true,
}: {
  items: Listing[];
  totals: CheckoutTotals;
  /** Total per-seller bundle deduction (BUNDLE_RULE) — itemized before the total. */
  bundleDiscount?: number;
  /** Chosen delivery quote per parcel (sellerId → quote) — prices the
   *  postage lines with the buyer's pick, not the flat default. */
  delivery?: DeliverySelection;
  /** When set, an "Item verification" ledger line renders with this value
   *  ("Free" — the backend exposes no verification price). */
  verificationLabel?: string;
  /** Fixture-only switch — false in live mode so no −£ bundle line
   *  renders anywhere (parcel or ledger); the discount isn't real on
   *  the wire. */
  bundleCharged?: boolean;
}) {
  const payableTotal =
    Math.round((totals.total - (bundleCharged ? bundleDiscount : 0)) * 100) / 100;
  const groups = sellerGroups(items);

  return (
    <div>
      <h2 className="text-section-title font-semibold text-text-primary">Order summary</h2>

      <div className="mt-3 flex flex-col gap-5 border-b border-border-subtle pb-4">
        {groups.map((group, i) => {
          const quote = parcelQuote(group, delivery);
          return (
            <SellerParcel
              key={group.sellerId}
              group={group}
              postageLabel={quote ? formatPrice(quote.priceFromGbp) : 'Free — seller pays'}
              serviceLabel={quote ? `${quote.carrierId} ${quote.serviceName}` : null}
              index={i + 1}
              count={groups.length}
              bundleCharged={bundleCharged}
            />
          );
        })}
      </div>

      <dl className="mt-4 flex flex-col gap-2.5">
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Items ({items.length})</dt>
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
        {verificationLabel ? (
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Item verification</dt>
            <dd className="text-text-primary">{verificationLabel}</dd>
          </div>
        ) : null}
        {bundleCharged && bundleDiscount > 0 ? (
          <div className="flex justify-between text-body text-text-secondary">
            <dt className="flex items-center gap-1.5">
              <Icon name="pricetag" size={15} className="text-success-text" />
              Bundle discount ({BUNDLE_RULE_LABEL})
            </dt>
            <dd className="tnum font-semibold text-success-text">−{formatPrice(bundleDiscount)}</dd>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between border-t border-border-subtle pt-3">
          <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
          <dd className="tnum text-price-list font-bold text-text-primary">
            {formatPrice(payableTotal)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
