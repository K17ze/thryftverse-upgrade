'use client';

/**
 * GalleriaFeaturedAssets — spotlight on individual collectable pieces.
 * Mobile GalleriaFeaturedAssetCard grammar: provenance line → title →
 * valuation, with an editor's note. Each card routes to /item/[id].
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri, getPrimaryMedia } from '@/lib/utils/media';
import type { Listing } from '@/lib/contracts/domain';
import type { GalleriaFeaturedAsset } from '@/lib/data/fixtures-media';

export interface ResolvedGalleriaAsset extends GalleriaFeaturedAsset {
  listing: Listing;
}

interface GalleriaFeaturedAssetsProps {
  assets: ResolvedGalleriaAsset[];
}

function AssetCard({ asset }: { asset: ResolvedGalleriaAsset }) {
  const { listing } = asset;
  const primaryMedia = getPrimaryMedia(listing);

  return (
    <article className="group relative">
      <div className="relative w-full overflow-hidden rounded-lg">
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt={listing.title}
          fill
          aspectRatio={4 / 5}
          focalPoint={primaryMedia?.focalPoint}
          className="h-full w-full"
          sizes="(max-width: 768px) 50vw, 33vw"
        />
        {listing.isSold ? (
          <>
            <div className="absolute inset-0 bg-overlay" />
            <span className="absolute inset-0 flex items-center justify-center text-body font-medium uppercase tracking-[1.2px] text-scrim-text-primary">
              Sold
            </span>
          </>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1 px-0.5">
        <p className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
          {asset.fromCollection}
        </p>
        <h3 className="clamp-1 text-body text-text-primary">
          {listing.brand ? `${listing.brand} — ` : ''}
          {listing.title}
        </h3>
        <p className="clamp-2 text-meta text-text-secondary">{asset.note}</p>
        <p className="tnum mt-0.5 text-body-large font-bold text-text-primary">
          {listing.isSold ? 'Sold' : formatPrice(listing.price)}
        </p>
      </div>

      {/* Stretched link — whole card routes to the PDP */}
      <Link
        href={`/item/${listing.id}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`${listing.brand ? `${listing.brand} — ` : ''}${listing.title}${
          listing.price != null ? `, ${formatPrice(listing.price)}` : ''
        }${listing.isSold ? ', Sold' : ''}`}
      />
    </article>
  );
}

export function GalleriaFeaturedAssets({ assets }: GalleriaFeaturedAssetsProps) {
  if (assets.length === 0) return null;
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3">
      {assets.map((asset) => (
        <AssetCard key={asset.listingId} asset={asset} />
      ))}
    </div>
  );
}
