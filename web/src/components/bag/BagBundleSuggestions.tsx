'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { BUNDLE_RULE_LABEL } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';
import type { Listing } from '@/lib/contracts/domain';

export interface BundleSuggestionGroup {
  sellerId: string;
  username: string | null;
  suggestions: Listing[];
}

interface BagBundleSuggestionsProps {
  bundleGroups: BundleSuggestionGroup[];
  onAddToBag: (listingId: string) => void;
}

/**
 * Bundle recommendations for sellers already present in the bag:
 * Shows same-seller catalogue items that share combined shipping or bundle tier discounts.
 */
export function BagBundleSuggestions({
  bundleGroups,
  onAddToBag,
}: BagBundleSuggestionsProps) {
  if (bundleGroups.length === 0) return null;

  return (
    <>
      {bundleGroups.map((group) => (
        <section
          key={group.sellerId}
          className="mt-8 border-t border-border-subtle pt-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-body-emphasis font-bold text-text-primary">
              {group.username ? (
                <Link
                  href={`/u/${group.username}/bundle`}
                  className="pressable flex items-center gap-1.5 hover:underline"
                >
                  <Icon name="pricetag" size={16} className="text-brand" />
                  {DATA_MODE === 'live'
                    ? `More pieces from @${group.username} — they post together`
                    : `More pieces from @${group.username} — save ${BUNDLE_RULE_LABEL}`}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Icon name="pricetag" size={16} className="text-brand" />
                  {DATA_MODE === 'live'
                    ? 'Add another item — same-seller pieces post together'
                    : `Add another item — ${BUNDLE_RULE_LABEL}`}
                </span>
              )}
            </h2>
            <span className="text-caption text-text-muted">Combined shipping</span>
          </div>
          <div
            className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1"
            role="list"
          >
            {group.suggestions.map((s) => (
              <div
                key={s.id}
                role="listitem"
                className="group relative w-[140px] shrink-0"
              >
                <Link
                  href={`/item/${s.id}`}
                  className="block overflow-hidden rounded-lg"
                >
                  <AppImage
                    src={getListingCoverUri(s.images)}
                    alt={s.title}
                    aspectRatio={0.8}
                    focalPoint={getCategoryFocalPoint(s.category)}
                    sizes="140px"
                    className="w-full media-zoom"
                  />
                </Link>
                <div className="mt-2 min-w-0">
                  <p className="clamp-1 text-caption font-medium text-text-primary">
                    {s.title}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <p className="tnum text-caption font-bold text-text-primary">
                      {formatPrice(s.price)}
                    </p>
                    {s.size ? (
                      <span className="text-meta text-text-muted">
                        Sz {s.size}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddToBag(s.id)}
                    className="pressable mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-brand py-1.5 text-meta font-semibold text-text-inverse hover:bg-brand-pressed"
                  >
                    <Icon name="plus" size={13} />
                    Add to bag
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
