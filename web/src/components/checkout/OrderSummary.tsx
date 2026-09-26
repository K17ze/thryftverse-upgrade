'use client';

/**
 * OrderSummary — checkout's right rail, read as a box manifest: one numbered
 * parcel per seller (items from one seller post together), each parcel with
 * its own postage and bundle lines, then the checkout-wide fee ledger and
 * total. Flat hairline grammar; the Pay CTA lives on the page, not here.
 *
 * Postage honesty: the contract carries one flat postage charge per
 * checkout (orderTotals.shippingFee), not a per-parcel price — a group
 * shows the real figure only when it is the checkout's only parcel. For
 * multi-seller orders the per-parcel split doesn't exist in the contract,
 * so the line reads "Confirmed at checkout" rather than fabricating £0
 * (same fallback grammar as the sell preview). Listing carries a
 * shippingMethod label but no ETA days, so the carrier name renders when
 * the whole parcel agrees on one and no delivery estimate is ever shown.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { BUNDLE_RULE_LABEL, sellerGroups, type SellerGroup } from '@/lib/data/fixtures';
import type { OrderTotals } from '@/lib/data/fixtures-commerce';
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
  index,
  count,
}: {
  group: SellerGroup;
  /** The parcel's postage, or the honest "Confirmed at checkout" fallback
   *  when the checkout's flat charge can't be attributed per parcel. */
  postageLabel: string;
  /** 1-based parcel position — the manifest reads "Parcel 1 of 2". */
  index: number;
  count: number;
}) {
  const username = group.seller?.username ?? null;
  const carrier = sharedCarrier(group);
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
        {group.qualifies ? (
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
}: {
  items: Listing[];
  totals: OrderTotals;
  /** Total per-seller bundle deduction (BUNDLE_RULE) — itemized before the total. */
  bundleDiscount?: number;
}) {
  const payableTotal = Math.round((totals.total - bundleDiscount) * 100) / 100;
  const groups = sellerGroups(items);
  // The checkout's flat postage is attributable to a parcel only when the
  // order is exactly one parcel; beyond that the contract has no per-parcel
  // split and the honest fallback stands in.
  const singleParcel = groups.length === 1;
  const postageLabel = singleParcel ? formatPrice(totals.shippingFee) : 'Confirmed at checkout';

  return (
    <div>
      <h2 className="text-section-title font-semibold text-text-primary">Order summary</h2>

      <div className="mt-3 flex flex-col gap-5 border-b border-border-subtle pb-4">
        {groups.map((group, i) => (
          <SellerParcel
            key={group.sellerId}
            group={group}
            postageLabel={postageLabel}
            index={i + 1}
            count={groups.length}
          />
        ))}
      </div>

      <dl className="mt-4 flex flex-col gap-2.5">
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Items ({items.length})</dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.items)}</dd>
        </div>
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Postage</dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.shippingFee)}</dd>
        </div>
        <div className="flex justify-between text-body text-text-secondary">
          <dt>Buyer Protection fee</dt>
          <dd className="tnum text-text-primary">{formatPrice(totals.protectionFee)}</dd>
        </div>
        {bundleDiscount > 0 ? (
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
