'use client';

/**
 * BundleUpsellRow — PDP bundle builder, rendered under the buy panel.
 * Mirrors the mobile product/BundleUpsellRow: a flat hairline-separated
 * section with a rail of the seller's other active listings, selectable
 * thumbs and a bulk "Add all to bag" action. Where mobile leans on
 * combined shipping, the web fixture build applies the honest BUNDLE_RULE
 * tier (see lib/data/fixtures.ts).
 *
 * Unlike Vinted's bundle flow the rail is filterable — size and category
 * chips derive from the seller's own rail items, so a facet with nothing
 * to offer never renders. Same-seller items already in the bag count
 * toward the tier whether or not they're staged here; progress reads
 * through bundleProgressFor so the numbers match the bag exactly.
 *
 * Self-omits when a bundle can't be formed — fewer than (minItems − 1)
 * other active listings from the seller, a sold listing, or your own
 * listing. Sold-out seller stock is excluded from the rail with a quiet
 * note. Persisted bag reads are gated behind useHydrated.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSellerListings } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { BUNDLE_RULE, BUNDLE_RULE_LABEL, listingById } from '@/lib/data/fixtures';
import { bundleProgressFor } from '@/lib/data/fixtures-commerce';
import {
  extractClosetFacets,
  facetHasChoice,
} from '@/components/closet/closetFilters';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

const RAIL_COUNT = 12;
const pctLabel = `${Math.round(BUNDLE_RULE.discountPct * 100)}%`;

export function BundleUpsellRow({ listing }: { listing: Listing }) {
  const { show } = useToast();
  const { user } = useSession();
  const hydrated = useHydrated();
  const bag = useStore((s) => s.bag);
  const addManyToBag = useStore((s) => s.addManyToBag);
  const removeFromBag = useStore((s) => s.removeFromBag);

  const { data: sellerListings } = useSellerListings(listing.sellerId);

  const others = useMemo(
    () => (sellerListings ?? []).filter((l) => l.id !== listing.id),
    [sellerListings, listing.id],
  );
  const railItems = useMemo(
    () => others.filter((l) => !l.isSold).slice(0, RAIL_COUNT),
    [others],
  );
  const soldOutCount = useMemo(() => others.filter((l) => l.isSold).length, [others]);

  // Filter facets derive from the whole rail pool, not the filtered
  // result — a zero-item option can't render, and picking one filter
  // can't make the other options vanish.
  const facets = useMemo(() => extractClosetFacets(railItems), [railItems]);
  const [sizeFilter, setSizeFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const showFilterChips =
    facetHasChoice(facets.sizes) || facetHasChoice(facets.categories);
  const filtersActive = sizeFilter !== null || categoryFilter !== null;
  const visibleItems = useMemo(
    () =>
      railItems.filter(
        (l) =>
          (sizeFilter === null || l.size === sizeFilter) &&
          (categoryFilter === null || l.category === categoryFilter),
      ),
    [railItems, sizeFilter, categoryFilter],
  );

  // Staged picks; items already in the bag count as selected — they are
  // part of the bundle either way and the chip removes them.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const baggedIds = useMemo(
    () => new Set(hydrated ? bag.map((b) => b.listingId) : []),
    [hydrated, bag],
  );
  const selectedIds = useMemo(() => {
    const ids = new Set(picked);
    for (const item of railItems) if (baggedIds.has(item.id)) ids.add(item.id);
    return ids;
  }, [picked, railItems, baggedIds]);

  // Same-seller items already in the bag count toward the tier whether or
  // not they're staged in this rail — the progress line reads from these.
  const sellerBagListings = useMemo(
    () =>
      hydrated
        ? bag
            .map((b) => listingById(b.listingId))
            .filter(
              (l): l is Listing =>
                !!l && l.sellerId === listing.sellerId && !l.isSold,
            )
        : [],
    [hydrated, bag, listing.sellerId],
  );
  const sellerBagCount = sellerBagListings.length;
  const sellerMissing = Math.max(0, BUNDLE_RULE.minItems - sellerBagCount);

  const isSold = listing.isSold === true || listing.status === 'sold';
  const isOwner = !!user?.id && user.id === listing.sellerId;

  // The bundle as it stands — this listing + the seller's bagged items +
  // staged picks, deduped so count and discount stay honest.
  const bundleListings = useMemo(() => {
    const byId = new Map<string, Listing>();
    byId.set(listing.id, listing);
    for (const l of sellerBagListings) byId.set(l.id, l);
    for (const l of railItems) if (picked.has(l.id)) byId.set(l.id, l);
    return [...byId.values()];
  }, [listing, sellerBagListings, railItems, picked]);
  const {
    count: bundleCount,
    qualifies,
    missing,
    discount,
  } = useMemo(() => bundleProgressFor(bundleListings), [bundleListings]);

  // Bundle unreachable → hide the row entirely (PDP stays honest).
  if (isSold || isOwner) return null;
  if (!sellerListings || railItems.length < BUNDLE_RULE.minItems - 1) return null;

  const sellerUsername = listing.seller?.username;

  const clearFilters = () => {
    setSizeFilter(null);
    setCategoryFilter(null);
  };

  const toggleItem = (item: Listing) => {
    if (baggedIds.has(item.id)) {
      removeFromBag(item.id);
      show('Removed from bag', 'info');
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleAddAll = () => {
    const ids = [listing.id, ...selectedIds];
    addManyToBag(ids);
    const freshCount = ids.filter((id) => !baggedIds.has(id)).length;
    show(
      qualifies
        ? `Bundle of ${bundleCount} added — you save ${formatPrice(discount)}`
        : `Added ${freshCount} ${freshCount === 1 ? 'item' : 'items'} — ${missing} more from this seller for ${pctLabel} off`,
      'success',
    );
  };

  return (
    <section
      id="bundle"
      className="scroll-mt-24 border-t border-border-subtle pt-4"
      aria-labelledby="bundle-upsell-title"
    >
      <div className="flex items-center gap-2">
        <Icon name="layers" size={16} className="shrink-0 text-text-secondary" />
        <h2 id="bundle-upsell-title" className="text-body-emphasis font-semibold text-text-primary">
          Bundle and save
        </h2>
        <span className="ml-auto rounded-full bg-brand-subtle px-2.5 py-0.5 text-meta font-medium text-text-primary">
          {BUNDLE_RULE_LABEL}
        </span>
      </div>
      <p className="mt-1 text-caption text-text-secondary">
        {sellerUsername
          ? `Buy together from @${sellerUsername} — one parcel, ${BUNDLE_RULE_LABEL}.`
          : `Buy together from this seller — one parcel, ${BUNDLE_RULE_LABEL}.`}
      </p>

      {/* In-bag progress — only when the bag already holds this seller's
          stock; count and shortfall come straight from the store. */}
      {hydrated && sellerBagCount > 0 ? (
        <p className="mt-1 text-caption text-text-secondary">
          <span className="tnum text-text-primary">{sellerBagCount}</span>
          {sellerMissing > 0
            ? ` already in your bag — add ${sellerMissing} more from this seller for ${pctLabel} off.`
            : ` already in your bag — ${pctLabel} off applies.`}
        </p>
      ) : null}

      {/* Rail filters — size + category chips derived from the rail pool.
          A facet only renders when it offers a real choice (≥2 options),
          and every chip has at least one item behind it. */}
      {showFilterChips ? (
        <nav
          className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto"
          aria-label="Filter this seller's items"
        >
          {facetHasChoice(facets.sizes)
            ? facets.sizes.map((f) => (
                <Chip
                  key={f.value}
                  selected={sizeFilter === f.value}
                  aria-label={`Filter by size ${f.label}, ${f.count} items`}
                  onClick={() =>
                    setSizeFilter((v) => (v === f.value ? null : f.value))
                  }
                >
                  Size {f.label}
                  <span className="tnum text-meta opacity-60">{f.count}</span>
                </Chip>
              ))
            : null}
          {facetHasChoice(facets.categories)
            ? facets.categories.map((f) => (
                <Chip
                  key={f.value}
                  selected={categoryFilter === f.value}
                  aria-label={`Filter by ${f.label}, ${f.count} items`}
                  onClick={() =>
                    setCategoryFilter((v) => (v === f.value ? null : f.value))
                  }
                >
                  {f.label}
                  <span className="tnum text-meta opacity-60">{f.count}</span>
                </Chip>
              ))
            : null}
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="pressable shrink-0 px-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
            >
              Clear
            </button>
          ) : null}
        </nav>
      ) : null}

      {/* Rail — other active listings; tap toggles the bundle pick. The
          -m-1/p-1 bleed keeps the selected ring from clipping at the
          scroll edges. */}
      {visibleItems.length > 0 ? (
        <div
          className="no-scrollbar -m-1 mt-3 flex gap-2 overflow-x-auto p-1"
          role="list"
        >
          {visibleItems.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <div key={item.id} role="listitem" className="w-[76px] shrink-0">
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Remove' : 'Add'} ${item.title} ${selected ? 'from' : 'to'} bundle`}
                  className="pressable relative block w-full overflow-hidden rounded-md"
                >
                  <span
                    className={[
                      'block overflow-hidden rounded-md',
                      selected ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : '',
                    ].join(' ')}
                  >
                    <AppImage
                      src={getListingCoverUri(item.images)}
                      alt={item.title}
                      aspectRatio={0.8}
                      focalPoint={getCategoryFocalPoint(item.category)}
                      sizes="76px"
                      className="w-full"
                    />
                  </span>
                  <span
                    className={[
                      'absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full',
                      selected
                        ? 'bg-brand text-text-inverse'
                        : 'bg-overlay text-scrim-text-primary',
                    ].join(' ')}
                  >
                    <Icon name={selected ? 'check' : 'plus'} filled={selected} size={14} />
                  </span>
                </button>
                <Link
                  href={`/item/${item.id}`}
                  className="clamp-1 mt-1.5 block text-meta text-text-secondary hover:text-text-primary"
                >
                  {formatPrice(item.price)}
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-caption text-text-muted">
          Nothing in the rail matches those filters —{' '}
          <button
            type="button"
            onClick={clearFilters}
            className="pressable font-medium text-text-secondary hover:text-text-primary"
          >
            clear them
          </button>
          .
        </p>
      )}

      {soldOutCount > 0 ? (
        <p className="mt-2 text-meta text-text-muted">
          {soldOutCount} {soldOutCount === 1 ? 'item' : 'items'} already sold — excluded.
        </p>
      ) : null}

      {/* Bundle ledger + bulk action — appears once a pick is staged */}
      {selectedIds.size > 0 ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="flex items-baseline justify-between text-caption">
            <span className="text-text-secondary">
              Bundle {bundleCount} {bundleCount === 1 ? 'item' : 'items'}
            </span>
            {qualifies ? (
              <span className="tnum font-semibold text-success-text">
                Save {pctLabel} · −{formatPrice(discount)}
              </span>
            ) : (
              <span className="text-text-muted">
                Add {missing} more to save {pctLabel}
              </span>
            )}
          </p>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            icon="bag"
            className="mt-2.5"
            onClick={handleAddAll}
          >
            Add all to bag
          </Button>
        </div>
      ) : null}
    </section>
  );
}
