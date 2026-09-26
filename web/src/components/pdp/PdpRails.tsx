'use client';

/**
 * PdpRails — the discovery foot of the PDP. "More from this seller" reads
 * as a Depop closet preview: the seller row (avatar, @username, rating,
 * item count, quiet "Visit shop" link) is the rail header. The similar
 * band is a horizontal ProductTile rail whose heading states its actual
 * match basis — "More Nike" / "Similar Hoodies" / "Similar style" —
 * derived from the returned set, never a generic "You may also like",
 * with the honest count beside it. Both stay below every item-critical
 * section.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCount } from '@/lib/utils/format';

interface PdpRailsProps {
  listing: Listing;
  sellerItems: Listing[];
  similarItems: Listing[];
  isLoading?: boolean;
}

export function PdpRails({ listing, sellerItems, similarItems, isLoading }: PdpRailsProps) {
  const seller = listing.seller;
  const sellerUsername = seller?.username ?? null;

  /**
   * Match basis for the similar rail — similarListings scores brand,
   * subcategory then category overlap. The heading names whichever signal
   * actually dominates the returned set; when the match is only
   * category-level it reads "Similar style" — still true, still stated.
   */
  const similarTitle = useMemo(() => {
    if (!similarItems.length) return 'Similar items';
    const majority = Math.ceil(similarItems.length / 2);
    if (listing.brand) {
      const brandHits = similarItems.filter((i) => i.brand === listing.brand).length;
      if (brandHits >= majority) return `More ${listing.brand}`;
    }
    if (listing.subcategory) {
      const subHits = similarItems.filter((i) => i.subcategory === listing.subcategory).length;
      if (subHits >= majority) return `Similar ${listing.subcategory}`;
    }
    return 'Similar style';
  }, [listing.brand, listing.subcategory, similarItems]);

  if (isLoading) {
    return (
      <div className="border-t border-border-subtle px-4 py-6 sm:px-6">
        <Skeleton className="mb-4 h-5 w-48" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[0.8] w-40 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {sellerItems.length > 0 ? (
        <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-seller-rail">
          {sellerUsername ? (
            /* Closet preview — the seller row is the heading. */
            <div className="mb-4 flex items-center gap-3 px-4 sm:px-6">
              <Avatar src={seller?.avatar} name={sellerUsername} size={36} />
              <h2 id="pdp-seller-rail" className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-body-emphasis font-semibold text-text-primary">
                  <span className="clamp-1">@{sellerUsername}</span>
                  {seller?.verified ? (
                    <Icon name="verified" size={13} className="shrink-0 text-success-text" />
                  ) : null}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-meta font-normal text-text-secondary">
                  {typeof seller?.rating === 'number' ? (
                    <>
                      <Icon name="star" filled size={11} className="shrink-0 text-rating-star" />
                      <span className="tnum">{seller.rating.toFixed(1)}</span>
                      {seller.reviewCount ? (
                        <span>· {formatCount(seller.reviewCount)} reviews</span>
                      ) : null}
                      <span aria-hidden>·</span>
                    </>
                  ) : null}
                  <span className="tnum">
                    {sellerItems.length} {sellerItems.length === 1 ? 'item' : 'items'}
                  </span>
                </span>
              </h2>
              <Link
                href={`/u/${sellerUsername}`}
                className="pressable shrink-0 rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
              >
                Visit shop
              </Link>
            </div>
          ) : (
            <h2
              id="pdp-seller-rail"
              className="mb-4 px-4 text-section-title font-semibold text-text-primary sm:px-6"
            >
              More from this seller
            </h2>
          )}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6" role="list">
            {sellerItems.map((item) => (
              <div key={item.id} role="listitem" className="w-[150px] shrink-0 sm:w-[180px]">
                <ProductTile item={mapListingToDiscoverySummary(item)} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {similarItems.length > 0 ? (
        <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-similar-rail">
          <div className="mb-4 flex items-baseline justify-between gap-3 px-4 sm:px-6">
            <h2 id="pdp-similar-rail" className="text-section-title font-semibold text-text-primary">
              {similarTitle}
            </h2>
            <span className="tnum shrink-0 text-meta text-text-muted">
              {similarItems.length} {similarItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6" role="list">
            {similarItems.map((item) => (
              <div key={item.id} role="listitem" className="w-[150px] shrink-0 sm:w-[180px]">
                <ProductTile item={mapListingToDiscoverySummary(item)} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
