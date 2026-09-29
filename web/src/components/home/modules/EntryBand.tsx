'use client';

/**
 * EntryBand — authored entry points into the catalogue, the band that
 * gives the home feed a reading order (Vinted's "curated selections"
 * answer to the unfiltered stream; Depop's taste-led "shop by style").
 *
 * Every tile is derived from listing truth, not marketing copy: the
 * label is a facet that exists in the data, the media is a cover lifted
 * from the matching result set, and the count is exactly what the
 * destination resolves. A facet with no matches drops out entirely —
 * no entry ever links to a dead end. Destinations are real /search and
 * /category routes whose resolved set mirrors each `match` predicate
 * (verified: /category/{vintage,designer,streetwear} hold no listings,
 * so those routes are never used).
 */

import Link from 'next/link';
import { useMemo } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { LISTINGS } from '@/lib/data/fixtures';
import { useTrendingListings } from '@/lib/hooks/search-queries';
import { getListingCoverUri } from '@/lib/utils/media';
import { AppImage } from '@/components/ui/AppImage';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

const LIVE = DATA_MODE === 'live';

interface EntrySpec {
  key: string;
  label: string;
  /** Route whose resolved set must mirror `match`. */
  href: string;
  match: (l: Listing) => boolean;
}

/** The identity fields the search matcher reads — keeps facets honest. */
const identity = (l: Listing) =>
  [l.title, l.brand ?? '', l.category, l.subcategory ?? ''].join(' ');

const ENTRY_SPECS: EntrySpec[] = [
  {
    key: 'new-with-tags',
    label: 'New with tags',
    // Label, destination and predicate must agree — "New with tags"
    // never lands a browser on "New without tags" stock.
    href: `/search?${new URLSearchParams({
      condition: 'New with tags',
    }).toString()}`,
    match: (l) => l.condition === 'New with tags',
  },
  {
    key: 'under-150',
    label: 'Under £150',
    href: '/search?max=150',
    match: (l) => l.price <= 150,
  },
  {
    key: 'vintage',
    label: 'Vintage',
    href: '/search?q=vintage',
    match: (l) => /\bvintage\b/i.test(identity(l)),
  },
  {
    key: 'denim',
    label: 'Denim',
    href: '/search?q=denim',
    match: (l) => /\bdenim\b/i.test(identity(l)),
  },
  {
    key: 'knitwear',
    label: 'Knitwear',
    href: '/search?q=knitwear',
    match: (l) => /\bknitwear\b/i.test(identity(l)),
  },
  {
    key: 'jackets',
    label: 'Jackets',
    href: '/search?q=jacket',
    match: (l) => /\bjackets?\b/i.test(identity(l)),
  },
  {
    key: 'sneakers',
    label: 'Sneakers',
    href: '/category/sneakers',
    match: (l) => l.category === 'sneakers',
  },
  {
    key: 'bags',
    label: 'Bags',
    href: '/category/bags',
    match: (l) => l.category === 'bags',
  },
  {
    key: 'the-row',
    label: 'The Row',
    href: `/search?${new URLSearchParams({ brand: 'The Row' }).toString()}`,
    match: (l) => (l.brand ?? '').toLowerCase().includes('the row'),
  },
];

// Resolve each spec against the catalogue: in fixture mode the count is
// the fixture destination's result count; the cover is the most-liked
// match — deterministic, and the imagery is always a real item the entry
// leads to. A facet with no matches drops out entirely.
function resolveEntries(listings: Listing[]) {
  return ENTRY_SPECS.map((spec) => {
    const matches = listings.filter(spec.match);
    const lead = matches.reduce<Listing | null>(
      (best, l) => (best === null || l.likes > best.likes ? l : best),
      null,
    );
    return {
      ...spec,
      // In live mode the page-length count would misstate the catalogue —
      // there is no totals endpoint, so the count is fixture-only.
      count: LIVE ? null : matches.length,
      imageUri: lead ? getListingCoverUri(lead.images) : null,
    };
  }).filter((e) => e.imageUri !== null);
}

const FIXTURE_ENTRIES = resolveEntries(LISTINGS);

export function EntryBand() {
  const live = useTrendingListings(60);
  const entries = useMemo(
    () => (LIVE ? resolveEntries(live.listings) : FIXTURE_ENTRIES),
    [live.listings],
  );
  if (entries.length === 0) return null;
  return (
    <ModuleSection title="Start here" bordered={false} moduleId="entry-band">
      <Rail label="Ways into the catalogue">
        {entries.map((entry) => (
          /* listitem wraps the link — putting the role on the anchor
             itself would strip its implicit link role (keyboard +
             SR lose "this navigates"). */
          <div key={entry.key} role="listitem" className="shrink-0 snap-start">
          <Link
            href={entry.href}
            aria-label={
              entry.count !== null
                ? `${entry.label} — ${entry.count} item${entry.count === 1 ? '' : 's'}`
                : entry.label
            }
            className="pressable group relative block h-24 w-40 overflow-hidden rounded-lg sm:h-28 sm:w-48"
          >
            <AppImage
              src={entry.imageUri}
              alt={entry.label}
              fill
              sizes="(max-width: 640px) 160px, 192px"
              className="h-full w-full media-zoom"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim via-media-overlay-scrim/40 to-transparent px-2.5 pb-1.5 pt-7">
              <span className="clamp-1 block text-body-emphasis font-semibold leading-tight text-scrim-text-primary">
                {entry.label}
              </span>
              {entry.count !== null ? (
                <span className="tnum text-meta text-scrim-text-secondary">
                  {entry.count} item{entry.count === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </Link>
          </div>
        ))}
      </Rail>
    </ModuleSection>
  );
}
