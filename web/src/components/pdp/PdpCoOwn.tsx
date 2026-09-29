'use client';

/**
 * PdpCoOwn — the listing → co-own asset bridge. When a listing's item has
 * been fractionalised, this section surfaces the asset's market: issuer,
 * issuance unit price and live availability, deep-linking to the full
 * /co-own dossier and order flow. Live mode reads
 * GET /co-own/assets/by-listing/:listingId (a 404 is the honest "not
 * fractionalised" answer, not an error); fixture mode resolves the same
 * binding from the bundled dataset. The section self-omits whenever no
 * asset binds the listing — a plain single-item PDP shows nothing.
 */

import Link from 'next/link';
import { useCoOwnAssetForListing } from '@/lib/hooks/coown-queries';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';

interface PdpCoOwnProps {
  listingId: string;
}

export function PdpCoOwn({ listingId }: PdpCoOwnProps) {
  const { data } = useCoOwnAssetForListing(listingId);
  // null (no binding), 404 and error all resolve to "no asset" — the
  // section never blocks the PDP and never fabricates a market link.
  if (!data) return null;

  const soldOut = data.availableUnits === 0;
  const unitLabel = data.isOpen ? 'issuance price' : 'last issuance price';

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-coown">
      <h2 id="pdp-coown" className="mb-3 text-section-title font-semibold text-text-primary">
        Fractional ownership
      </h2>

      <Link
        href={`/co-own/${encodeURIComponent(data.id)}`}
        className="group -m-2 flex items-center gap-3.5 rounded-lg p-2 transition-colors hover:bg-surface-raised"
      >
        {data.imageUrl ? (
          <AppImage
            src={data.imageUrl}
            alt={data.title}
            aspectRatio={1}
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-lg"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-body font-medium text-text-primary">{data.title}</p>
          <p className="clamp-1 mt-0.5 text-caption text-text-secondary">
            {data.issuer
              ? `Issued by ${data.issuer.displayName ?? `@${data.issuer.username}`}`
              : 'Co-Own asset'}
            {' · '}
            <span className="tnum">
              {formatPrice(data.unitPriceGbp)}/unit · {unitLabel}
            </span>
          </p>
          <p className="mt-0.5 text-caption text-text-secondary">
            {soldOut ? (
              'Fully allocated — secondary market only'
            ) : (
              <span className="tnum">
                {data.availableUnits.toLocaleString('en-GB')} of{' '}
                {data.totalUnits.toLocaleString('en-GB')} units available
              </span>
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-label font-medium text-text-secondary transition-colors group-hover:text-text-primary">
          View market
          <Icon name="forward" size={14} className="shrink-0" />
        </span>
      </Link>
    </section>
  );
}
