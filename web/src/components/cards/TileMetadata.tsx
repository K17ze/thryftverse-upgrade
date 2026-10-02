'use client';

import Link from 'next/link';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

interface TileMetadataProps {
  item: DiscoveryListingSummary;
}

/**
 * TileMetadata — strict metadata budget:
 * disclosure → brand → title → size · condition → price + shipping → authenticity → seller.
 * Seller avatar link is z-elevated over the card's stretched link.
 */
export function TileMetadata({ item }: TileMetadataProps) {
  const sellerUsername = item.seller?.username ?? null;
  const isFreePostage =
    item.shippingPayer === 'seller' ||
    (typeof item.shippingPrice === 'number' && item.shippingPrice === 0);
  const isVerifiedAuthentic = item.authenticity?.status === 'verified';

  return (
    <div className="flex flex-col gap-1 px-1 pt-2">
      {item.disclosure ? (
        <span className="text-meta font-medium text-text-muted">
          {item.disclosure}
        </span>
      ) : null}
      {item.brand ? (
        <span className="clamp-1 text-label text-text-secondary">
          {item.brand}
        </span>
      ) : null}
      <h3 className="clamp-2 text-body text-text-primary">{item.title}</h3>
      {item.size || item.condition ? (
        <span className="clamp-1 text-meta text-text-muted">
          {[item.size, item.condition].filter(Boolean).join(' · ')}
        </span>
      ) : null}
      {item.price != null ? (
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="tnum text-body-large font-bold text-text-primary">
            {formatPrice(item.price)}
          </span>
          {isFreePostage ? (
            <span className="text-meta font-medium text-commerce-trust">
              Free delivery
            </span>
          ) : null}
        </div>
      ) : null}
      {isVerifiedAuthentic ? (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-commerce-trust">
          <Icon name="verified" size={11} />
          <span>Authenticity Guaranteed</span>
        </div>
      ) : null}
      {sellerUsername ? (
        /* Real link — middle-click/context-menu/Enter all work;
           z-elevated lifts it over the tile's stretched link. */
        <Link
          href={`/u/${sellerUsername}`}
          className="relative z-elevated mt-0.5 flex items-center gap-1.5 self-start rounded-sm text-text-secondary hover:text-text-primary"
        >
          <Avatar src={item.seller?.avatar} name={sellerUsername} size={20} />
          <span className="clamp-1 text-meta font-medium">@{sellerUsername}</span>
          {item.seller?.verified ? (
            <Icon name="verified" size={11} className="text-commerce-trust" />
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}
