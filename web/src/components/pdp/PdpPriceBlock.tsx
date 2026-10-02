'use client';

/**
 * PdpPriceBlock — brand eyebrow, title, price hero with discount badge,
 * price-with-protection callout, structured facts grid (Condition, Size, Category),
 * and size guide modal trigger.
 */

import type { Listing } from '@/lib/contracts/domain';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

interface PdpPriceBlockProps {
  listing: Listing;
  isSold: boolean;
  hasSizeGuide: boolean;
  onOpenSizeGuide: () => void;
}

export function PdpPriceBlock({
  listing,
  isSold,
  hasSizeGuide,
  onOpenSizeGuide,
}: PdpPriceBlockProps) {
  const hasPriceDrop =
    typeof listing.originalPrice === 'number' && listing.originalPrice > listing.price;
  const discountPercent = hasPriceDrop
    ? Math.round(((listing.originalPrice! - listing.price) / listing.originalPrice!) * 100)
    : 0;

  const facts = [
    { label: 'Condition', value: listing.condition },
    { label: 'Size', value: listing.size ?? 'One size' },
    { label: 'Category', value: listing.subcategory ?? listing.category },
  ];

  return (
    <div>
      {/* Identity seam */}
      {listing.promoted ? (
        <span className="text-meta font-medium text-text-muted">{listing.disclosure ?? 'Sponsored'}</span>
      ) : null}
      {listing.brand ? (
        <span className="text-label text-text-secondary">
          {listing.brand}
        </span>
      ) : null}
      <h1 className="mt-0.5 text-item-title font-semibold text-text-primary sm:text-screen-title">
        {listing.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-price-hero font-bold text-text-primary">
          {formatPrice(listing.price)}
        </span>
        {hasPriceDrop ? (
          <>
            <span className="tnum text-body-large text-text-muted line-through">
              {formatPrice(listing.originalPrice)}
            </span>
            <Badge variant="success">-{discountPercent}%</Badge>
          </>
        ) : null}
      </div>

      {typeof listing.priceWithProtection === 'number' && !isSold ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-body text-text-secondary">
          <Icon name="shieldCheck" size={16} className="shrink-0 text-commerce-trust" />
          <span>
            <span className="tnum font-semibold text-text-primary">
              {formatPrice(listing.priceWithProtection)}
            </span>{' '}
            incl. Buyer Protection
          </span>
        </p>
      ) : null}

      {listing.authenticity?.status === 'verified' ? (
        <p className="mt-1 flex items-center gap-1.5 text-body font-medium text-commerce-trust">
          <Icon name="verified" size={16} className="shrink-0 text-commerce-trust" />
          <span>{listing.authenticity.label ?? 'Authenticity Guaranteed'}</span>
        </p>
      ) : null}

      {/* Facts grid */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-border-subtle py-4">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-meta text-text-muted">{f.label}</dt>
            <dd className="clamp-1 mt-0.5 text-body font-medium capitalize text-text-primary">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Size guide link */}
      {hasSizeGuide ? (
        <button
          type="button"
          onClick={onOpenSizeGuide}
          className="pressable -ml-2 mt-1 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <Icon name="scan" size={14} className="shrink-0" />
          Size guide
        </button>
      ) : null}
    </div>
  );
}
