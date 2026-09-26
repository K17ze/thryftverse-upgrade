'use client';

/**
 * Collections — the hub. "Your collections" (your closet + saved boards) on
 * a square cover-collage grid; member-curated edits on a snap rail below,
 * matching the mobile collections/closet surface. Create is a name+privacy
 * sheet writing to the session collection store.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { UserCollectionCard } from '@/components/collections/UserCollectionCard';
import { CuratedRail } from '@/components/collections/CuratedRail';
import { CreateCollectionSheet } from '@/components/collections/CreateCollectionSheet';
import { CollectionsPageSkeleton } from '@/components/collections/CollectionsSkeleton';
import { useUserCollections } from '@/lib/hooks/collections-queries';
import { useMyListings } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useCollectionEdits } from '@/lib/store/collectionEdits';
import { listingCoverThumbs } from '@/components/profile/boardMedia';
import { getListingCoverUri } from '@/lib/utils/media';
import type { UserCollection } from '@/lib/data/fixtures-collections';

export default function CollectionsPage() {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: collections,
    isLoading,
    isError,
    refetch,
  } = useUserCollections();
  const { data: myListings } = useMyListings();
  const hydrated = useHydrated();
  const overlays = useCollectionEdits((s) => s.boards);

  const closetThumbs = useMemo(
    () =>
      (myListings ?? [])
        .map((l) => getListingCoverUri(l.images))
        .filter(Boolean)
        .slice(0, 4),
    [myListings],
  );

  // Owner edits made on /collection/[id] persist in the overlay store —
  // apply them post-hydration so the hub's counts and collages agree.
  const boards = useMemo(
    () =>
      (collections ?? []).map((c) => {
        const override = hydrated ? overlays[c.id]?.itemIds : undefined;
        return override ? { ...c, itemIds: override } : c;
      }),
    [collections, hydrated, overlays],
  );

  const handleCreated = (collection: UserCollection) => {
    show('Collection created', 'success');
    router.push(`/collection/${collection.id}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] pb-16">
        <CollectionsPageSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <EmptyState
          icon="warning"
          title="Couldn't load collections"
          subtitle="Your collections couldn't be synced. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  const closetCount = myListings?.length ?? 0;
  const nothingToShow = boards.length === 0 && closetCount === 0;

  return (
    <div className="mx-auto max-w-[1200px] pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">Collections</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/poster/archive"
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-caption font-medium text-text-primary transition-colors hover:bg-brand-subtle"
          >
            <Icon name="images" size={16} />
            Poster archive
          </Link>
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() => setCreateOpen(true)}
          >
            New collection
          </Button>
        </div>
      </div>

      <section aria-label="Your collections" className="mt-6">
        <div className="flex items-baseline justify-between border-b border-border-subtle px-4 pb-3 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">
            Your collections
          </h2>
          <span className="tnum text-meta text-text-muted">
            {boards.length + 1} {boards.length + 1 === 1 ? 'board' : 'boards'}
          </span>
        </div>

        {nothingToShow ? (
          <EmptyState
            icon="folder"
            title="No collections yet"
            subtitle="Group saved items by style, season, or vibe."
            actionLabel="Create collection"
            onAction={() => setCreateOpen(true)}
            compact
          />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
            {/* Your closet — the shopfront board, always first (closet-<id>). */}
            <UserCollectionCard
              href={`/collection/closet-${user?.id ?? 'me'}`}
              name="Your closet"
              thumbs={closetThumbs}
              count={closetCount}
            />
            {boards.map((c) => (
              <UserCollectionCard
                key={c.id}
                href={`/collection/${c.id}`}
                name={c.name}
                thumbs={listingCoverThumbs(c.itemIds, 4)}
                count={c.itemIds.length}
                isPrivate={c.isPrivate}
                updatedAt={c.updatedAt}
              />
            ))}
          </div>
        )}
      </section>

      <CuratedRail />

      <CreateCollectionSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
