'use client';

/**
 * LiveProductRail — the pinned product strip at the bottom of the viewer.
 * Each card resolves a real listing (thumb → /item/[id]) and carries the
 * "Bag" quick-add writing to the persisted bag store. The first card is
 * the lot currently on the table (pin mark on the thumb); sold pieces say
 * so instead of faking a CTA. One contained panel per card — the only
 * surface chrome on the stage.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LIVE_SESSION_PRODUCTS, type LiveSession } from '@/lib/data/fixtures-media';
import { listingById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface LiveProductRailProps {
  session: LiveSession;
}

export function LiveProductRail({ session }: LiveProductRailProps) {
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const hydrated = useHydrated();
  const bag = useStore((s) => s.bag);
  const addToBag = useStore((s) => s.addToBag);

  const items = (LIVE_SESSION_PRODUCTS[session.id] ?? [])
    .map((id) => listingById(id))
    .filter((l): l is NonNullable<typeof l> => l != null);

  if (items.length === 0) return null;

  const onBag = (id: string, inBag: boolean) => {
    if (inBag) {
      router.push('/bag');
      return;
    }
    if (!requireAuth('purchase')) return;
    addToBag(id);
    show('Added to bag', 'success');
  };

  return (
    <div
      role="list"
      aria-label="Featured in this show"
      className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5"
    >
      {items.map((l, i) => {
        const sold = l.isSold === true || l.status === 'sold';
        const inBag = hydrated && bag.some((b) => b.listingId === l.id);
        return (
          <div
            key={l.id}
            role="listitem"
            className="flex w-[240px] shrink-0 items-center gap-2.5 rounded-lg border border-white/10 bg-overlay p-2 backdrop-blur-md sm:w-[252px]"
          >
            <Link
              href={`/item/${l.id}`}
              aria-label={`${l.title} — ${formatPrice(l.price)}`}
              className="pressable flex min-w-0 flex-1 items-center gap-2.5"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white/10">
                <AppImage
                  src={getListingCoverUri(l.images)}
                  alt={l.title}
                  fill
                  sizes="48px"
                  className="h-full w-full"
                />
                {i === 0 ? (
                  <span
                    className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/60 text-scrim-text-primary"
                    title="Pinned now"
                  >
                    <Icon name="pin" filled size={10} />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-caption font-medium text-scrim-text-primary">
                  {l.title}
                </span>
                <span className="tnum mt-0.5 block text-caption font-semibold text-scrim-text-primary">
                  {formatPrice(l.price)}
                </span>
              </span>
            </Link>
            {sold ? (
              <span className="shrink-0 rounded-md bg-white/10 px-2 py-1.5 text-meta font-semibold text-scrim-text-tertiary">
                Sold
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onBag(l.id, inBag)}
                aria-label={
                  inBag ? `${l.title} is in your bag — view bag` : `Add ${l.title} to bag`
                }
                className={`pressable h-8 shrink-0 rounded-md px-2.5 text-caption font-semibold ${
                  inBag
                    ? 'bg-white/15 text-scrim-text-primary'
                    : 'bg-scrim-text-primary text-black'
                }`}
              >
                {inBag ? 'In bag' : 'Bag'}
              </button>
            )}
          </div>
        );
      })}
      {wall}
    </div>
  );
}
