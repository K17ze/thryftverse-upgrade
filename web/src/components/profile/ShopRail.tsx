'use client';

/**
 * ShopRail — the "Featured" listing window under a profile's identity
 * stack (mobile shopRailItems grammar). Quiet shelf rows, no pills. Owner
 * mode carries an Edit affordance that opens the pin sheet. Renders
 * nothing when the member has no featured items.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { SoldOverlay } from '@/components/ui/SoldOverlay';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  featuredIdsFor,
  MAX_FEATURED,
  useSetShopRailPins,
  useShopRail,
  useShopRailPins,
  type ShopRailItem,
} from './shopRailData';

interface ShopRailProps {
  ownerId: string;
  /** Owner mode shows the Edit affordance and applies the pin overlay. */
  isOwner?: boolean;
  /** Seller's listings — required for the owner pin sheet. */
  listings?: Listing[];
}

export function ShopRail({ ownerId, isOwner = false, listings = [] }: ShopRailProps) {
  const { items } = useShopRail(ownerId, isOwner);
  const [pinOpen, setPinOpen] = useState(false);
  const override = useShopRailPins((s) => s.pinnedIds);
  const setPins = useSetShopRailPins();
  const { show } = useToast();

  const pinnedIds = useMemo(
    () => featuredIdsFor(ownerId, isOwner ? override : null),
    [ownerId, isOwner, override],
  );
  const [draft, setDraft] = useState<string[]>([]);

  const pinnable = useMemo(() => listings.filter((l) => !l.isSold && l.status !== 'sold'), [listings]);

  if (items.length === 0 && !isOwner) return null;

  return (
    <section aria-label="Featured items" className="mt-6">
      <div className="flex items-center justify-between px-4 sm:px-6">
        <h2 className="text-section-title text-text-primary">Featured</h2>
        {isOwner ? (
          <button
            type="button"
            onClick={() => {
              setDraft(pinnedIds);
              setPinOpen(true);
            }}
            className="pressable -mx-1.5 -my-2.5 rounded-sm px-1.5 py-2.5 text-body font-medium text-brand"
          >
            Edit
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-body text-text-muted sm:px-6">
          Pin up to {MAX_FEATURED} listings to lead your shop.
        </p>
      ) : (
        <div className="no-scrollbar -mx-1 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:px-6">
          {items.map((item) => (
            <ShopRailCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <Sheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Pin items"
        maxWidth={440}
      >
        <p className="px-5 pb-2 text-meta text-text-muted">
          Choose up to {MAX_FEATURED} listings to feature on your profile.
        </p>
        <div className="space-y-1 px-4">
          {pinnable.map((l) => {
            const pinned = draft.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() =>
                  setDraft((d) =>
                    pinned ? d.filter((id) => id !== l.id) : d.length < MAX_FEATURED ? [...d, l.id] : d,
                  )
                }
                aria-pressed={pinned}
                className="pressable flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-row"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                  <AppImage
                    src={getListingCoverUri(l.images)}
                    alt=""
                    fill
                    sizes="48px"
                    className="h-full w-full"
                    fallbackIcon="heart"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body text-text-primary">{l.title}</span>
                  <span className="tnum text-meta text-text-muted">{formatPrice(l.price)}</span>
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    pinned ? 'border-brand bg-brand text-text-inverse' : 'border-border text-transparent'
                  }`}
                  aria-hidden
                >
                  <Icon name="check" size={12} />
                </span>
              </button>
            );
          })}
          {pinnable.length === 0 ? (
            <p className="py-4 text-center text-body text-text-muted">
              No active listings to pin yet.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2 px-4 pb-5">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setPinOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={async () => {
              const ok = await setPins(ownerId, draft);
              setPinOpen(false);
              show(ok ? 'Featured items updated' : "Couldn't save featured items", 'success');
            }}
          >
            Save ({draft.length})
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

function ShopRailCard({ item }: { item: ShopRailItem }) {
  return (
    <Link
      href={`/item/${item.id}`}
      className="pressable group block w-[132px] shrink-0 lg:w-[168px]"
      aria-label={`${item.title}, ${formatPrice(item.price)}${item.isSold ? ', sold' : ''}`}
    >
      <div className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={item.imageUri}
          alt=""
          fill
          sizes="(max-width: 1024px) 132px, 168px"
          className="h-full w-full media-zoom"
          fallbackIcon="heart"
        />
        {/* Sold — the shared overlay grammar, identical to closet tiles. */}
        {item.isSold ? <SoldOverlay size="sm" /> : null}
      </div>
      <span className="clamp-1 mt-1.5 block text-body font-medium text-text-primary">
        {item.brand ?? item.title}
      </span>
      <span className="clamp-1 block text-meta text-text-muted">
        {item.brand ? item.title : ''}
      </span>
      <span className="tnum block text-body font-semibold text-text-primary">
        {formatPrice(item.price)}
      </span>
    </Link>
  );
}
