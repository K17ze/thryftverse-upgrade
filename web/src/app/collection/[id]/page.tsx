'use client';

/**
 * Collection detail — quiet header + masonry of items.
 * Resolves two collection kinds: saved collections (col-*) and seller
 * closets (closet-<userId>, linked from the public profile banner).
 * Closet data flows through query hooks; col-* boards are identity-dept
 * fixture data (no API surface yet).
 *
 * Owner boards get the mobile ManageCollectionItems grammar as an in-place
 * edit mode (same posture as the moodboard editor): per-tile remove with
 * Undo, drag / move-button reorder, multi-select batch remove, and an
 * "Add items" sheet over saved items + favourites. Edits persist in the
 * collectionEdits overlay store and mirror into the collections query
 * cache so the hub grid stays honest for the session.
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { MoodboardSelectionBar } from '@/components/moodboard/MoodboardSelectionBar';
import { CollectionImportSheet } from '@/components/collections/CollectionImportSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton, MasonrySkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BackBar } from '@/components/profile/BackBar';
import { collectionById, listingsForIds } from '@/components/profile/fixtures';
import { useSellerListings, useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated, useStore } from '@/lib/store/useStore';
import {
  itemMovedBefore,
  movedItem,
  useCollectionEdits,
  withItemsAdded,
  withoutItemIds,
} from '@/lib/store/collectionEdits';
import type { UserCollection } from '@/lib/data/fixtures-collections';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
  type User,
} from '@/lib/contracts/domain';
import { timeAgo } from '@/lib/utils/format';

/** Same key as lib/hooks/collections-queries.ts — edits mirror into the
 *  hub's session store so counts/thumbs stay consistent. */
const USER_COLLECTIONS_KEY = ['user-collections'] as const;

interface ResolvedCollection {
  id: string;
  title: string;
  /** Fixture-order item ids — the pre-edit source truth. */
  itemIds: string[];
  owner?: User | null;
  meta?: string;
  /** True for the member's own saved boards (col-* owned by the session user). */
  editable: boolean;
}

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const { user: me } = useSession();
  const columns = useMasonryColumns();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();

  const id = String(params.id ?? '');
  const isCloset = id.startsWith('closet-');
  const closetId = isCloset ? id.slice('closet-'.length) : '';

  const { data: closetOwner, isLoading: ownerLoading } = useUser(closetId);
  const { data: closetItems, isLoading: closetItemsLoading } = useSellerListings(closetId);

  const loading = isCloset && (ownerLoading || closetItemsLoading);

  const resolved = useMemo<ResolvedCollection | null>(() => {
    if (isCloset) {
      if (loading || !closetOwner) return null;
      return {
        id,
        title: `${closetOwner.username}'s closet`,
        itemIds: (closetItems ?? []).map((l) => l.id),
        owner: closetOwner,
        editable: false,
      };
    }
    const c = collectionById(id);
    if (!c) return null;
    // COLLECTIONS entries are the member's saved boards (implicit owner);
    // ProfileBoard carries an explicit ownerId.
    const ownerId = 'ownerId' in c ? c.ownerId : 'me';
    return {
      id,
      title: c.title,
      itemIds: [...c.itemIds],
      meta: c.createdAt ? `Updated ${timeAgo(c.createdAt)}` : undefined,
      editable: !!me && ownerId === me.id,
    };
  }, [id, isCloset, loading, closetOwner, closetItems, me]);

  // Persisted owner edits — gated behind hydration so first render matches
  // the fixture truth (same posture as the moodboard overlay).
  const overlay = useCollectionEdits((s) => s.boards[id]);
  const setCollectionItems = useCollectionEdits((s) => s.setCollectionItems);
  const edits = hydrated ? overlay : undefined;

  const itemIds = useMemo(
    () => edits?.itemIds ?? resolved?.itemIds ?? [],
    [edits?.itemIds, resolved],
  );

  const items = useMemo(() => {
    if (isCloset) return closetItems ?? [];
    return listingsForIds(itemIds);
  }, [isCloset, closetItems, itemIds]);

  const summaries = useMemo<DiscoveryListingSummary[]>(
    () => items.map(mapListingToDiscoverySummary),
    [items],
  );

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      summaries.map((l) => ({
        type: 'listing',
        id: `col-${id}-${l.id}`,
        listing: l,
      })),
    [summaries, id],
  );

  const [editing, setEditing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  // Import candidates — saved + favourites minus what the board holds.
  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const candidates = useMemo<DiscoveryListingSummary[]>(() => {
    const onBoard = new Set(itemIds);
    const pool = [...new Set([...saved, ...wishlist])].filter((x) => !onBoard.has(x));
    return listingsForIds(pool).map(mapListingToDiscoverySummary);
  }, [saved, wishlist, itemIds]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <div className="space-y-2 px-4 pb-4 pt-2 sm:px-6" aria-busy>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <MasonrySkeleton columns={columns} />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="folder"
          title="Collection not found"
          subtitle="This collection doesn't exist or may have been removed."
          actionLabel="Back to saved"
          onAction={() => router.push('/saved')}
        />
      </div>
    );
  }

  const isEditing = resolved.editable && editing;

  const shareCollection = async () => {
    const url = `${window.location.origin}/collection/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      show('Collection link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  // ── Edit-mode ops — each write lands in the overlay store and mirrors
  //    into the collections query cache for the hub grid. ──────────────
  const persistItems = (next: string[]) => {
    setCollectionItems(id, next);
    queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
      old?.map((c) => (c.id === id ? { ...c, itemIds: [...next] } : c)),
    );
  };

  const stopEditing = () => {
    setEditing(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /** Removal is undoable via the toast action — mirrors the mobile
      optimistic remove + rollback semantics. */
  const removeWithUndo = (ids: string[]) => {
    if (ids.length === 0) return;
    const orderBefore = itemIds;
    persistItems(withoutItemIds(itemIds, new Set(ids)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const x of ids) next.delete(x);
      return next;
    });
    show(
      ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
      'info',
      { label: 'Undo', onPress: () => persistItems(orderBefore) },
    );
  };

  const removeSelected = () => {
    removeWithUndo([...selectedIds]);
    setSelectMode(false);
  };

  const addItems = (ids: string[]) => {
    const next = withItemsAdded(itemIds, ids);
    persistItems(next);
    setImportOpen(false);
    show(
      next.length === itemIds.length
        ? 'Already in this collection'
        : ids.length === 1
          ? 'Added 1 item'
          : `Added ${ids.length} items`,
      'success',
    );
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar
        actions={
          <>
            <IconButton name="share" aria-label="Share collection" onClick={shareCollection} />
            {resolved.editable ? (
              isEditing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={stopEditing}
                  className="ml-1"
                >
                  Done
                </Button>
              ) : (
                <IconButton
                  name="edit"
                  aria-label="Manage items"
                  onClick={() => setEditing(true)}
                />
              )
            ) : null}
          </>
        }
      />

      <div className="px-4 pb-4 pt-2 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">{resolved.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
          {resolved.owner ? (
            <>
              <Avatar src={resolved.owner.avatar} name={resolved.owner.username} size={20} />
              <span className="font-semibold text-text-secondary">
                @{resolved.owner.username}
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="tnum">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          {resolved.meta ? (
            <>
              <span aria-hidden>·</span>
              <span>{resolved.meta}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Edit toolbar — quiet actions; batch chrome lives in the select pill */}
      {isEditing ? (
        <div className="mb-4 flex items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              onClick={() => setImportOpen(true)}
            >
              Add items
            </Button>
            <Button
              variant="quiet"
              size="sm"
              aria-pressed={selectMode}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds(new Set());
              }}
            >
              {selectMode ? 'Done selecting' : 'Select'}
            </Button>
          </div>
          <span className="hidden text-meta text-text-muted sm:block">
            Drag tiles to reorder
          </span>
        </div>
      ) : null}

      {isEditing && selectMode ? (
        <MoodboardSelectionBar
          count={selectedIds.size}
          onRemoveSelected={removeSelected}
          onCancel={() => {
            setSelectMode(false);
            setSelectedIds(new Set());
          }}
        />
      ) : null}

      <div>
        {isEditing ? (
          items.length === 0 ? (
            <EmptyState
              icon="folder"
              title="This collection is empty"
              subtitle="Add saved items or favourites to start building it."
              actionLabel="Add items"
              onAction={() => setImportOpen(true)}
              compact
            />
          ) : (
            <EditableMoodboardGrid
              items={summaries}
              columns={columns}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onRemove={(itemId) => removeWithUndo([itemId])}
              onMove={(itemId, dir) => persistItems(movedItem(itemIds, itemId, dir))}
              onReorder={(draggedId, targetId) =>
                persistItems(itemMovedBefore(itemIds, draggedId, targetId))
              }
            />
          )
        ) : (
          <MasonryGrid
            units={units}
            columns={columns}
            emptyTitle="This collection is empty"
            emptySubtitle="Saved items will appear here."
          />
        )}
      </div>

      <CollectionImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        candidates={candidates}
        onAdd={addItems}
      />
    </div>
  );
}
