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
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { MoodboardSelectionBar } from '@/components/moodboard/MoodboardSelectionBar';
import { CollectionImportSheet } from '@/components/collections/CollectionImportSheet';
import { EditCollectionSheet } from '@/components/collections/EditCollectionSheet';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton, MasonrySkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import {
  COLLECTIONS,
  PROFILE_COLLECTIONS,
  collectionById,
  listingsForIds,
} from '@/components/profile/fixtures';
import { listingCoverThumbs } from '@/components/profile/boardMedia';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
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
import {
  USER_COLLECTION_SEED,
  type UserCollection,
} from '@/lib/data/fixtures-collections';
import { userById } from '@/lib/data/fixtures';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
  type User,
} from '@/lib/contracts/domain';
import { timeAgo } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

/** Same key as lib/hooks/collections-queries.ts — edits mirror into the
 *  hub's session store so counts/thumbs stay consistent. */
const USER_COLLECTIONS_KEY = ['user-collections'] as const;

interface ResolvedCollection {
  id: string;
  title: string;
  /** Fixture-order item ids — the pre-edit source truth. */
  itemIds: string[];
  owner?: User | null;
  /** Collection owner id — 'me' for the session member's saved boards. */
  ownerId?: string;
  /** Private boards render only for their owner — enforced below. */
  isPrivate?: boolean;
  /** Optional member-authored description (UserCollection contract). */
  description?: string | null;
  meta?: string;
  /** True for the member's own saved boards (col-* owned by the session user). */
  editable: boolean;
}

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { user: me } = useSession();
  const columns = useMasonryColumns();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();

  const id = String(params.id ?? '');
  const isCloset = id.startsWith('closet-');
  const closetId = isCloset ? id.slice('closet-'.length) : '';

  const boardPref = useBoardPrefs((s) => s.boards[id]);
  const setBoardCover = useBoardPrefs((s) => s.setCover);
  const setBoardArchived = useBoardPrefs((s) => s.setArchived);
  const setBoardPrivate = useBoardPrefs((s) => s.setPrivate);
  const { updateCollection } = useCollectionActions();

  const {
    data: closetOwner,
    isLoading: ownerLoading,
    isError: ownerError,
    refetch: refetchOwner,
  } = useUser(closetId);
  const {
    data: closetItems,
    isLoading: closetItemsLoading,
    isError: itemsError,
    refetch: refetchItems,
  } = useSellerListings(closetId);

  const loading = isCloset && (ownerLoading || closetItemsLoading);

  // Persisted owner edits — gated behind hydration so first render matches
  // the fixture truth (same posture as the moodboard overlay).
  const overlay = useCollectionEdits((s) => s.boards[id]);
  const setCollectionItems = useCollectionEdits((s) => s.setCollectionItems);
  const setCollectionMeta = useCollectionEdits((s) => s.setCollectionMeta);
  const edits = hydrated ? overlay : undefined;

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
    // Privacy: ProfileBoard flags it directly; saved boards resolve through
    // the collections store (query cache when warm — session-created boards
    // included — else the seed).
    const uc = (
      queryClient.getQueryData<UserCollection[]>(USER_COLLECTIONS_KEY) ??
      USER_COLLECTION_SEED
    ).find((x) => x.id === c.id);
    const isPrivate =
      (hydrated ? boardPref?.isPrivate : undefined) ??
      ('isPrivate' in c ? c.isPrivate : undefined) ??
      uc?.isPrivate ??
      false;
    return {
      id,
      // Renames + descriptions from the edit sheet land in the overlay —
      // they win over fixture truth, same LWW grammar as item edits.
      title: edits?.title ?? c.title,
      description:
        edits && 'description' in edits ? edits.description : uc?.description ?? null,
      itemIds: [...c.itemIds],
      // Another member's public board carries its owner row, like the
      // moodboard surface does.
      owner: ownerId && ownerId !== 'me' ? userById(ownerId) : undefined,
      ownerId,
      isPrivate,
      meta: c.createdAt ? `Updated ${timeAgo(c.createdAt)}` : undefined,
      editable: !!me && ownerId === me.id,
    };
  }, [id, isCloset, loading, closetOwner, closetItems, me, queryClient, hydrated, boardPref?.isPrivate, edits]);

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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // Error is not absence — a failed fetch gets a retry, not a gravestone.
  if (isCloset && (ownerError || itemsError)) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="warning"
          title="Couldn't load this closet"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => {
            void refetchOwner();
            void refetchItems();
          }}
        />
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

  // Private boards are owner-only — anyone else gets the honest wall,
  // never the contents (deep links included). 'me' boards belong to the
  // fixture demo account: guests and real live accounts aren't that owner,
  // so they get the same wall rather than a stranger's saved items.
  const viewerOwns = !!me && resolved.ownerId === me.id;
  if (!viewerOwns && (resolved.isPrivate || resolved.ownerId === 'me')) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="lock"
          title="This collection is private"
          subtitle="Only the owner can see what's saved inside."
          actionLabel="Back to saved"
          onAction={() => router.push('/saved')}
        />
      </div>
    );
  }

  const isEditing = resolved.editable && editing;

  const shareCollection = () =>
    share({
      url: `${window.location.origin}/collection/${id}`,
      title: resolved.title,
      copiedLabel: 'Collection link copied',
    });

  /** Delete — session tombstones: the board leaves the collections cache
   *  and the fixture source arrays (the same arrays ensureCollectionResolvable
   *  pushes into), so every derivation — hub grid, profile boards, this
   *  route — stops resolving it for the session. */
  const deleteCollection = () => {
    for (const arr of [COLLECTIONS, PROFILE_COLLECTIONS]) {
      const i = arr.findIndex((c) => c.id === id);
      if (i >= 0) arr.splice(i, 1);
    }
    queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
      old?.filter((c) => c.id !== id),
    );
    show('Collection deleted', 'info');
    router.push('/collections');
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

  // Board covers: first item images as the hero mosaic (mobile
  // CollectionDetailScreen grammar). Closets keep the quiet text header —
  // a closet is a storefront, not a curated board.
  const coverItemId = hydrated ? boardPref?.coverItemId : undefined;
  const archived = hydrated && boardPref?.archived === true;
  const heroThumbs = !isCloset ? listingCoverThumbs(itemIds, 4, undefined, coverItemId) : [];
  const showHero = heroThumbs.length > 0;

  /** Privacy writes the real update path where the board is a collections
   *  row (PATCH /collections live; session store + fixture patch in demo
   *  mode); the boardPrefs overlay keeps the toggle reactive everywhere
   *  else — a member-only profile board the store doesn't know. */
  const togglePrivacy = () => {
    const next = !resolved.isPrivate;
    setOptionsOpen(false);
    void Promise.resolve(updateCollection(id, { isPrivate: next }));
    setBoardPrivate(id, next);
    show(next ? 'Board is now private' : 'Board is now public', 'info');
  };

  /** EditCollectionScreen save — name + description + privacy write the
   *  real update path (PATCH /collections live, session store + fixture
   *  patch in demo); the overlays keep every surface reactive. */
  const saveDetails = async (next: {
    title: string;
    description: string | null;
    isPrivate: boolean;
  }) => {
    await Promise.resolve(
      updateCollection(id, {
        name: next.title,
        description: next.description,
        isPrivate: next.isPrivate,
      }),
    );
    setCollectionMeta(id, { title: next.title, description: next.description });
    setBoardPrivate(id, next.isPrivate);
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar
        actions={
          <>
            {/* Private boards have no public read route — sharing would emit
                a link that dead-ends for the recipient (mobile parity). */}
            {!resolved.isPrivate ? (
              <IconButton name="share" aria-label="Share collection" onClick={shareCollection} />
            ) : null}
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
                <>
                  <IconButton
                    name="edit"
                    aria-label="Manage items"
                    onClick={() => setEditing(true)}
                  />
                  <IconButton
                    name="more"
                    aria-label="Collection options"
                    onClick={() => setOptionsOpen(true)}
                  />
                </>
              )
            ) : null}
          </>
        }
      />

      {showHero ? (
        /* Cover hero — item-cover mosaic strip with the title/meta over a
           legibility scrim. Media is the colour; no separate header below. */
        <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6">
          <div className="grid h-44 grid-cols-4 gap-0.5 sm:h-56">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative overflow-hidden">
                {heroThumbs[i] ? (
                  <AppImage
                    src={heroThumbs[i]}
                    alt=""
                    fill
                    sizes="25vw"
                    className="h-full w-full"
                    priority={i === 0}
                  />
                ) : (
                  <div className="h-full w-full bg-surface-alt" />
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <h1 className="clamp-1 text-screen-title font-bold text-scrim-text-primary">
                {resolved.title}
              </h1>
              {resolved.isPrivate ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                  <Icon name="lock" size={11} />
                  Private
                </span>
              ) : null}
              {archived ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                  Archived
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-scrim-text-secondary">
              {resolved.owner ? (
                <>
                  <Link
                    href={`/u/${resolved.owner.username}`}
                    className="flex items-center gap-1.5 hover:opacity-80"
                  >
                    <Avatar src={resolved.owner.avatar} name={resolved.owner.username} size={22} />
                    <span className="font-semibold">@{resolved.owner.username}</span>
                  </Link>
                  {resolved.owner.isVerified ? (
                    <Icon name="verified" filled size={12} className="text-scrim-text-primary" />
                  ) : null}
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
            {resolved.description ? (
              <p className="clamp-2 mt-1.5 max-w-xl text-meta text-scrim-text-secondary">
                {resolved.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-2 sm:px-6">
          <div className="flex items-center gap-2">
            <h1 className="text-screen-title font-bold text-text-primary">{resolved.title}</h1>
            {resolved.isPrivate ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold text-text-secondary">
                <Icon name="lock" size={11} />
                Private
              </span>
            ) : null}
            {archived ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold text-text-secondary">
                Archived
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
            {resolved.owner ? (
              <>
                <Link
                  href={`/u/${resolved.owner.username}`}
                  className="flex items-center gap-1.5 hover:opacity-80"
                >
                  <Avatar src={resolved.owner.avatar} name={resolved.owner.username} size={20} />
                  <span className="font-semibold text-text-secondary">
                    @{resolved.owner.username}
                  </span>
                </Link>
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
          {resolved.description ? (
            <p className="clamp-3 mt-2 max-w-xl text-body text-text-secondary">
              {resolved.description}
            </p>
          ) : null}
        </div>
      )}

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

      {/* Owner options — every row runs a real action; destructive delete
          gets its own confirm sheet (mobile ConfirmationSheet grammar). */}
      <Sheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Collection options"
        maxWidth={400}
      >
        <div className="px-5 pb-5">
          <ul className="flex flex-col">
            <li>
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  setDetailsOpen(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="edit" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">Edit details</span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  setEditing(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="layers" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">Manage items</span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
            {!isCloset ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    setCoverOpen(true);
                  }}
                  className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
                >
                  <Icon name="image" size={20} />
                  <span className="flex-1 text-body-emphasis font-medium">Change cover</span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={togglePrivacy}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name={resolved.isPrivate ? 'lockOpen' : 'lock'} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {resolved.isPrivate ? 'Make public' : 'Make private'}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  setBoardArchived(id, !archived);
                  show(
                    archived
                      ? 'Board restored'
                      : 'Board archived — it stays reachable from this link',
                    'info',
                  );
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="inventory" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {archived ? 'Unarchive board' : 'Archive board'}
                </span>
              </button>
            </li>
            {!resolved.isPrivate ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    void shareCollection();
                  }}
                  className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
                >
                  <Icon name="share" size={20} />
                  <span className="flex-1 text-body-emphasis font-medium">Share collection</span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  setConfirmDelete(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-danger-text"
              >
                <Icon name="trash" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">Delete collection</span>
              </button>
            </li>
          </ul>
        </div>
      </Sheet>

      {/* Cover picker — only real item images front the board; "Automatic"
          restores the derived collage. No cover contract exists on the
          collections API, so the pick persists in boardPrefs. */}
      <Sheet
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        title="Board cover"
        maxWidth={440}
      >
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => {
              setBoardCover(id, null);
              setCoverOpen(false);
              show('Cover reset to automatic', 'info');
            }}
            className="pressable flex min-h-11 w-full items-center gap-3 text-left text-body-emphasis font-medium text-text-primary"
          >
            <Icon name="refresh" size={18} className="text-text-muted" />
            Automatic collage
            {!coverItemId ? (
              <Icon name="check" size={18} className="ml-auto text-brand" />
            ) : null}
          </button>
          {items.length === 0 ? (
            <p className="py-4 text-body text-text-muted">
              No items on this board to use as a cover yet.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {items.map((l) => {
                const active = coverItemId === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setBoardCover(id, l.id);
                      setCoverOpen(false);
                      show('Cover updated', 'success');
                    }}
                    aria-pressed={active}
                    aria-label={`Use “${l.title}” as the cover`}
                    className="pressable relative aspect-square overflow-hidden rounded-md bg-surface-alt"
                  >
                    <AppImage
                      src={getListingCoverUri(l.images)}
                      alt=""
                      fill
                      sizes="96px"
                      className="h-full w-full"
                    />
                    {active ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Icon name="check" size={20} className="text-white" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      {/* EditCollectionScreen parity — name, description, privacy. */}
      <EditCollectionSheet
        collectionId={id}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        initial={{
          title: resolved.title,
          description: resolved.description ?? null,
          isPrivate: !!resolved.isPrivate,
        }}
        onSave={saveDetails}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete collection"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            Delete “{resolved.title}”? The items stay in your saved and favourites.
          </p>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={deleteCollection}>
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
