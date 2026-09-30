'use client';

/**
 * Moodboard detail — port of MoodboardEditor's read surface:
 * cover-media header with scrim title, owner row, quiet edit affordances
 * for the owner, masonry of board items.
 * Supports inline rename, per-tile remove with Undo, drag reorder,
 * multi-select batch remove, canvas layout, versions history, and import sheet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { MoodboardCanvas } from '@/components/moodboard/MoodboardCanvas';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useMoodboardActions } from '@/lib/hooks/moodboard-queries';
import { BackBar } from '@/components/profile/BackBar';
import { useShare } from '@/components/profile/useShare';
import {
  listingsForIds,
  MOODBOARD_ITEM_IDS,
} from '@/components/profile/fixtures';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
} from '@/lib/contracts/domain';
import { MOODBOARDS } from '@/lib/data/fixtures';
import {
  DEFAULT_MOODBOARD_THEME_ID,
  MOODBOARD_CANVAS,
  moodboardThemeById,
  publicMoodboardById,
  type MoodboardItemPosition,
  type MoodboardVersionRow,
} from '@/lib/data/fixtures-content';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as socialService from '@/lib/api/services/social';
import * as listingsService from '@/lib/api/services/listings';
import { useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import {
  itemMovedBefore,
  itemToLayer,
  movedItem,
  useMoodboardEdits,
  useMoodboardOverlay,
  withItemsAdded,
  withoutItemIds,
  type MoodboardOverlay,
} from '@/lib/store/moodboards';
import { useHydrated, useStore } from '@/lib/store/useStore';

// Domain-isolated sub-components (<400 LOC modularity standard)
import {
  MoodboardSkeleton,
  MoodboardErrorState,
  MoodboardNotFoundState,
  MoodboardPrivateWallState,
} from '@/components/moodboard/detail/MoodboardStatusStates';
import { MoodboardCoverHeader } from '@/components/moodboard/detail/MoodboardCoverHeader';
import { MoodboardOptionsSheet } from '@/components/moodboard/detail/MoodboardOptionsSheet';
import { MoodboardEditToolbar } from '@/components/moodboard/detail/MoodboardEditToolbar';
import { MoodboardSheetsGroup } from '@/components/moodboard/detail/MoodboardSheetsGroup';

const LIVE = DATA_MODE === 'live';

export function MoodboardClient() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { user: me, sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const columns = useMasonryColumns();
  const hydrated = useHydrated();

  const id = String(params.id ?? '');

  // Fixture moodboards resolve statically; boards the member created on web
  // live in the persisted boardPrefs list (POST /moodboards handles live);
  // public discovery boards resolve from the content fixtures.
  // Live mode resolves the server board (GET /moodboards/:id) — items
  // hydrate their real listings; import-only media pins (no listingId)
  // don't resolve to a Listing contract and are skipped honestly.
  // Fixture moodboards resolve statically; boards the member created on web
  // live in the persisted boardPrefs list (POST /moodboards handles live);
  // public discovery boards resolve from the content fixtures.
  // Live mode resolves the server board (GET /moodboards/:id) — items
  // hydrate their real listings; import-only media pins (no listingId)
  // don't resolve to a Listing contract and are skipped honestly.
  const liveBoardQuery = useQuery({
    queryKey: ['moodboard', id, 'live'],
    queryFn: async (): Promise<{
      board: {
        id: string;
        ownerId: string;
        title: string;
        itemIds: string[];
        isPrivate: boolean;
        coverUri?: string | null;
        createdAt?: string;
        /** Canvas theme id — the wire's `theme` field. */
        themeId: string | null;
        /** The caller's membership role (owner/editor/commenter/viewer),
         *  null for non-members on public boards. */
        viewerRole: string | null;
      };
      items: import('@/lib/contracts/domain').Listing[];
      /** listing id → board-item row id — live membership writes address
       *  the row; the overlay keys by listing id. */
      rowIdByListing: Record<string, string>;
      /** Saved canvas placement keyed by listing id — items without a
       *  wire position fall back to the deterministic scatter. */
      positions: Record<string, MoodboardItemPosition>;
    } | null> => {
      const wire = await socialService.fetchMoodboard(id);
      if (!wire) return null;
      const shoppableIds = [...new Set(wire.items.map((i) => i.listingId).filter(Boolean))];
      const hydrated = await Promise.all(
        shoppableIds.map((listingId) =>
          listingsService.fetchListingById(listingId).catch(() => null),
        ),
      );
      const items = hydrated.filter((l): l is import('@/lib/contracts/domain').Listing => l != null);
      const rowIdByListing: Record<string, string> = {};
      const positions: Record<string, MoodboardItemPosition> = {};
      for (const item of wire.items) {
        if (!item.listingId) continue;
        if (item.id) rowIdByListing[item.listingId] = item.id;
        if (item.position) positions[item.listingId] = item.position;
      }
      return {
        board: {
          id: wire.id,
          ownerId: wire.creatorId,
          title: wire.title,
          itemIds: items.map((l) => l.id),
          isPrivate: !wire.isPublic,
          coverUri: wire.coverImage,
          createdAt: wire.createdAt,
          themeId: wire.theme,
          viewerRole: wire.viewerRole,
        },
        items,
        rowIdByListing,
        positions,
      };
    },
    enabled: DATA_MODE === 'live' && !!id,
  });

  const liveBoard = DATA_MODE === 'live' ? liveBoardQuery.data : undefined;
  const createdBoards = useBoardPrefs((s) => s.createdMoodboards);
  const setBoardPrivate = useBoardPrefs((s) => s.setPrivate);
  const privacyPref = useBoardPrefs((s) => s.boards[id]?.isPrivate);

  // Fixture boards must never become live-mode truth — when the server
  // read misses (404 → null data) or fails, `board` stays undefined and
  // the honest gravestone/error states below own the surface.
  const board =
    DATA_MODE === 'live'
      ? liveBoard?.board
      : (MOODBOARDS.find((b) => b.id === id) ??
        (hydrated ? createdBoards.find((b) => b.id === id) : undefined) ??
        publicMoodboardById(id));

  const { data: owner } = useUser(board?.ownerId ?? '');

  // Persisted owner edits — gated behind hydration so the first client
  // render matches SSR (same posture as ProductTile's wishlist reads).
  // Fixture-scoped read: in live mode the server row is the truth, and the
  // optimistic overlay is surfaced only while a write is in flight (the
  // merge below), then the refetch — or the revert — owns the view again.
  const overlay = useMoodboardOverlay(id);
  const [liveOverlay, setLiveOverlay] = useState<MoodboardOverlay | undefined>();
  const setBoardItems = useMoodboardEdits((s) => s.setBoardItems);
  const setBoardTheme = useMoodboardEdits((s) => s.setBoardTheme);
  const setItemPosition = useMoodboardEdits((s) => s.setItemPosition);
  const restoreBoardSnapshot = useMoodboardEdits((s) => s.restoreBoardSnapshot);
  // Live-write failure channel — the board's last failed sync kind, so the
  // surface can disclose it instead of toasting a fake success.
  const syncIssue = useMoodboardEdits((s) => (id ? s.syncIssues[id] : undefined));
  // Live membership writes go through the write-through actions (real
  // /moodboards/* endpoints + optimistic overlay + revert-on-failure);
  // fixture mode writes the overlay store directly.
  const boardActions = useMoodboardActions();
  // Stable empty map — a fresh `{}` each render would churn the
  // listingIdByRowId memo below on every pass.
  const rowIdByListing = useMemo(
    () => liveBoard?.rowIdByListing ?? {},
    [liveBoard?.rowIdByListing],
  );

  // Reverse map — wire comment anchors carry the moodboard_items row id,
  // so resolving a comment's item title needs row id → listing id.
  const listingIdByRowId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [listingId, rowId] of Object.entries(rowIdByListing)) {
      m[rowId] = listingId;
    }
    return m;
  }, [rowIdByListing]);

  const edits = hydrated ? (DATA_MODE === 'live' ? liveOverlay : overlay) : undefined;

  /** Track a write-through action: the action mirrors optimistically into
   *  the overlay store synchronously, so snapshot that mirror for the
   *  duration of the write and hand the view back to server truth when it
   *  settles (refetch on success, revert on failure). Fixture writes are
   *  the persistence itself — nothing to track. */
  const trackLive = (promise: Promise<void>): Promise<void> => {
    if (DATA_MODE !== 'live') return promise;
    setLiveOverlay(useMoodboardEdits.getState().boards[id]);
    return promise.finally(() => setLiveOverlay(undefined));
  };

  const title = edits?.title ?? board?.title ?? '';
  const isPrivate =
    (hydrated ? privacyPref : undefined) ??
    (board && 'isPrivate' in board ? board.isPrivate : undefined) ??
    false;

  const itemIds = useMemo(
    () =>
      edits?.itemIds ??
      (board
        ? (DATA_MODE === 'live'
            ? undefined
            : MOODBOARD_ITEM_IDS[board.id]) ?? ('itemIds' in board ? board.itemIds : [])
        : []),
    [edits?.itemIds, board],
  );

  // Live mode's items arrive hydrated from the board query — a missing
  // live read is an empty board, never fixture listings. Fixture mode
  // resolves ids against the bundled catalogue.
  const liveItems = liveBoard?.items;
  const items = useMemo(
    () => (DATA_MODE === 'live' ? (liveItems ?? []) : listingsForIds(itemIds)),
    [liveItems, itemIds],
  );

  // Canvas state — theme and freeform positions resolve wire truth first
  // (live theme + saved placements), then the authored fixture layout, then
  // the optimistic overlay; gaps scatter deterministically inside the
  // canvas component.
  const themeId =
    edits?.themeId ??
    (board && 'themeId' in board ? board.themeId : undefined) ??
    (DATA_MODE === 'live' ? undefined : DEFAULT_MOODBOARD_THEME_ID[id]) ??
    'theme-linen';
  const theme = moodboardThemeById(themeId);

  const canvasPositions = useMemo(
    () =>
      DATA_MODE === 'live'
        ? { ...liveBoard?.positions, ...edits?.positions }
        : { ...MOODBOARD_CANVAS[id], ...liveBoard?.positions, ...edits?.positions },
    [id, liveBoard?.positions, edits?.positions],
  );

  const [editing, setEditing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [focusTitle, setFocusTitle] = useState(false);
  const [view, setView] = useState<'canvas' | 'items'>('canvas');
  const [canvasSelectedId, setCanvasSelectedId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentAnchor, setCommentAnchor] = useState<string | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [compareVersion, setCompareVersion] = useState<MoodboardVersionRow | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const summaries = useMemo<DiscoveryListingSummary[]>(
    () => items.map(mapListingToDiscoverySummary),
    [items],
  );
  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      summaries.map((l) => ({
        type: 'listing',
        id: `mb-${id}-${l.id}`,
        listing: l,
      })),
    [summaries, id],
  );

  // Import candidates — saved + favourites minus what the board holds.
  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const candidates = useMemo<DiscoveryListingSummary[]>(() => {
    const onBoard = new Set(itemIds);
    const pool = [...new Set([...saved, ...wishlist])].filter((x) => !onBoard.has(x));
    return listingsForIds(pool).map(mapListingToDiscoverySummary);
  }, [saved, wishlist, itemIds]);

  // Rename intent from the options sheet — the title input mounts with
  // edit mode; focus + select once it's on screen.
  useEffect(() => {
    if (!editing || !focusTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
    setFocusTitle(false);
  }, [editing, focusTitle]);

  // Invite links minted by the collaborators sheet land here as
  // /moodboard/:id?invite=<token>. Live mode POSTs the token to the real
  // accept endpoint (the token resolves the board server-side), reports
  // the outcome, then strips the param so reloads don't re-accept.
  // Reading window.location keeps this off the useSearchParams Suspense
  // contract; the ref guards against StrictMode's double-effect.
  const inviteHandled = useRef(false);
  // In-flight accept — a private board 404s until membership lands, so the
  // gravestone holds while the accept + refetch resolve.
  const [invitePending, setInvitePending] = useState(false);
  useEffect(() => {
    if (inviteHandled.current) return;
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;
    if (DATA_MODE !== 'live') {
      inviteHandled.current = true;
      router.replace(`/moodboard/${id}`);
      return;
    }
    // Wait for the session before firing — a guest's accept 401s, and the
    // token must survive until auth resolves.
    if (sessionLoading) return;
    inviteHandled.current = true;
    if (!me) {
      show('Sign in to accept this invite', 'info');
      router.replace(`/moodboard/${id}`);
      return;
    }
    setInvitePending(true);
    void socialService
      .acceptMoodboardInvite(token)
      .then(({ boardId }) => {
        void queryClient.invalidateQueries({ queryKey: ['moodboard'] });
        void queryClient.invalidateQueries({ queryKey: ['moodboards'] });
        void queryClient.invalidateQueries({ queryKey: ['moodboard-members'] });
        show('Joined the board', 'success');
        router.replace(`/moodboard/${boardId || id}`);
      })
      .catch((err) => {
        const status = parseApiError(err).status;
        show(
          status === 410
            ? 'That invite has expired'
            : status === 404
              ? 'That invite link is no longer valid'
              : parseApiError(err).message,
          'error',
        );
        router.replace(`/moodboard/${id}`);
      })
      .finally(() => setInvitePending(false));
  }, [id, me, sessionLoading, queryClient, router, show]);

  // Live reads still resolving — a loading board is a pending truth, not a
  // miss. Session load gates too: the privacy wall and role affordances
  // need the resolved viewer before they can be honest.
  if (
    DATA_MODE === 'live' &&
    (sessionLoading || ((liveBoardQuery.isLoading || invitePending) && !board))
  ) {
    return <MoodboardSkeleton />;
  }

  // A failed live read is not absence — retry, don't gravestone.
  if (DATA_MODE === 'live' && liveBoardQuery.isError && !board) {
    return <MoodboardErrorState onRetry={() => void liveBoardQuery.refetch()} />;
  }

  // Created boards resolve post-hydration — don't flash a gravestone.
  if (!board) {
    if (!hydrated) {
      return (
        <div className="mx-auto max-w-[1200px]" aria-busy>
          <BackBar />
        </div>
      );
    }
    return <MoodboardNotFoundState />;
  }

  // The wire's viewerRole is the membership truth in live mode — the
  // creator is an 'owner' member server-side. Board-admin (privacy,
  // collaborators, versions, meta) stays owner-only; item ops allow
  // owner+editor; comments allow owner+editor+commenter (the backend
  // enforces the same tiers).
  const viewerRole = liveBoard?.board.viewerRole ?? null;
  const isOwner = me?.id === board.ownerId || viewerRole === 'owner';
  const canEditItems = isOwner || viewerRole === 'editor';
  const canComment = isOwner || viewerRole === 'editor' || viewerRole === 'commenter';

  // Private boards are members-only — same wall grammar as collections.
  // An active membership (any role) reads through.
  if (isPrivate && !isOwner && !viewerRole) {
    return <MoodboardPrivateWallState />;
  }

  const isEditing = canEditItems && editing;

  const shareBoard = () =>
    share({
      url: `${window.location.origin}/moodboard/${board.id}`,
      title,
      copiedLabel: 'Board link copied',
    });

  // ── Edit-mode ops — each writes a fresh effective order into the overlay
  // store; undo on remove replays the pre-delete list. ──────────────────

  const startEditing = () => {
    setTitleDraft(title);
    setEditing(true);
  };

  /** "Rename board" from the options sheet — same edit mode, but the title
   *  field takes focus and selects so the rename is one keystroke away. */
  const startRename = () => {
    setFocusTitle(true);
    startEditing();
  };

  const stopEditing = () => {
    setEditing(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== title) {
      // Rename routes through the write-through action — PATCH
      // /moodboards/:id live with optimistic mirror + revert-on-failure;
      // the failure toasts, never a fake success.
      void trackLive(boardActions.renameBoard(board.id, next)).catch(() =>
        show("Couldn't rename the board — try again", 'error'),
      );
    } else {
      setTitleDraft(title);
    }
  };

  /** Visibility toggle — PATCH /moodboards/:id live; the boardPrefs overlay
   *  is the fixture mirror. The overlay + toast move only when the write
   *  actually lands. */
  const togglePrivacy = () => {
    const next = !isPrivate;
    setOptionsOpen(false);
    if (DATA_MODE === 'live') {
      void socialService
        .updateMoodboard(board.id, { visibility: next ? 'private' : 'public' })
        .then(() => {
          setBoardPrivate(board.id, next);
          show(next ? 'Board is now private' : 'Board is now public', 'info');
        })
        .catch(() => show('Could not update visibility', 'error'));
      return;
    }
    setBoardPrivate(board.id, next);
    show(next ? 'Board is now private' : 'Board is now public', 'info');
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
      removeItems history entry restoring the pre-delete order. Live mode
      deletes through the real endpoint (row ids); undo re-adds the same
      listings through the real add endpoint. */
  const removeWithUndo = (ids: string[]) => {
    if (ids.length === 0) return;
    const orderBefore = itemIds;
    const rowIds = ids
      .map((listingId) => rowIdByListing[listingId])
      .filter((v): v is string => Boolean(v));
    if (DATA_MODE === 'live') {
      void trackLive(boardActions.removeItems(board.id, ids, rowIds))
        .then(() =>
          show(
            ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
            'info',
            {
              label: 'Undo',
              onPress: () => {
                void trackLive(boardActions.addItems(board.id, ids)).catch(() =>
                  show("Couldn't restore them — try again", 'error'),
                );
              },
            },
          ),
        )
        .catch(() => show("Couldn't remove those — try again", 'error'));
    } else {
      setBoardItems(board.id, withoutItemIds(itemIds, new Set(ids)));
      show(
        ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
        'info',
        { label: 'Undo', onPress: () => setBoardItems(board.id, orderBefore) },
      );
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const x of ids) next.delete(x);
      return next;
    });
  };

  const removeSelected = () => {
    removeWithUndo([...selectedIds]);
    setSelectMode(false);
  };

  const addItems = (ids: string[]) => {
    setImportOpen(false);
    if (DATA_MODE === 'live') {
      void trackLive(boardActions.addItems(board.id, ids))
        .then(() =>
          show(
            ids.length === 1 ? 'Added 1 item' : `Added ${ids.length} items`,
            'success',
          ),
        )
        .catch(() => show("Couldn't add those — try again", 'error'));
      return;
    }
    const next = withItemsAdded(itemIds, ids);
    setBoardItems(board.id, next);
    show(
      next.length === itemIds.length
        ? 'Already on this board'
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
            <IconButton
              name="comment"
              aria-label="Board comments"
              onClick={() => {
                setCommentAnchor(null);
                setCommentsOpen(true);
              }}
            />
            {/* Public share only — a private board's link 404s for
                recipients; invites (collaborators sheet) are the private
                mechanism, same gate as the options-sheet share. */}
            {!isPrivate ? (
              <IconButton name="share" aria-label="Share board" onClick={shareBoard} />
            ) : null}
            {canEditItems ? (
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
                  {isOwner ? (
                    <>
                      <IconButton
                        name="people"
                        aria-label="Collaborators"
                        onClick={() => setCollabOpen(true)}
                      />
                      <IconButton
                        name="clock"
                        aria-label="Version history"
                        onClick={() => setVersionsOpen(true)}
                      />
                    </>
                  ) : null}
                  <IconButton
                    name="edit"
                    aria-label="Edit board"
                    onClick={startEditing}
                  />
                  {isOwner ? (
                    <IconButton
                      name="more"
                      aria-label="More options"
                      onClick={() => setOptionsOpen(true)}
                    />
                  ) : null}
                </>
              )
            ) : null}
          </>
        }
      />

      {/* Failed-sync disclosure — the write-through actions revert the
          optimistic overlay and flag the kind here; the surface says so
          instead of leaving a silently diverged board. */}
      {syncIssue ? (
        <p className="px-4 pt-2 text-meta text-warning-text sm:px-6">
          Some edits couldn’t sync — check your connection and try again.
        </p>
      ) : null}

      <MoodboardCoverHeader
        ref={titleInputRef}
        coverUri={board.coverUri}
        title={title}
        isPrivate={isPrivate}
        isEditing={isEditing}
        isOwner={isOwner}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        onCommitTitle={commitTitle}
        onResetTitle={() => setTitleDraft(title)}
        owner={owner}
        itemCount={items.length}
        createdAt={board.createdAt}
      />

      {/* View switch — the canvas is the authored collage; items is the
          shoppable list view. Same items, two reads. */}
      <div className="mt-4 px-4 sm:px-6">
        <SegmentedControl
          options={[
            { value: 'canvas', label: 'Canvas' },
            { value: 'items', label: 'Items', count: items.length },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setCanvasSelectedId(null);
          }}
        />
      </div>

      <MoodboardEditToolbar
        isEditing={isEditing}
        view={view}
        isOwner={isOwner}
        themeId={themeId}
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        onOpenImport={() => setImportOpen(true)}
        onToggleSelectMode={() => {
          setSelectMode((v) => !v);
          setSelectedIds(new Set());
        }}
        onSelectTheme={(tId) => {
          if (DATA_MODE === 'live') {
            void trackLive(boardActions.setBoardTheme(board.id, tId)).catch(() =>
              show("Couldn't save the theme — try again", 'error'),
            );
            return;
          }
          setBoardTheme(board.id, tId);
        }}
        onRemoveSelected={removeSelected}
        onCancelSelection={() => {
          setSelectMode(false);
          setSelectedIds(new Set());
        }}
      />

      <div className="mt-4">
        {view === 'canvas' ? (
          <div className="px-4 sm:px-6">
            {items.length === 0 && !isEditing ? (
              <EmptyState
                icon="layers"
                title="This board is empty"
                subtitle="Save items to this board and they'll appear here."
                compact
              />
            ) : (
              <MoodboardCanvas
                boardId={board.id}
                itemIds={itemIds}
                items={items}
                theme={theme}
                positions={canvasPositions}
                editing={isEditing}
                selectedId={canvasSelectedId}
                onSelect={setCanvasSelectedId}
                onPosition={(itemId, pos) => {
                  if (DATA_MODE === 'live') {
                    const rowId = rowIdByListing[itemId];
                    if (!rowId) return;
                    void trackLive(
                      boardActions.setItemPosition(board.id, itemId, rowId, pos),
                    ).catch(() => show("Couldn't save the position — try again", 'error'));
                    return;
                  }
                  setItemPosition(board.id, itemId, pos);
                }}
                onLayer={(itemId, layer) => {
                  if (DATA_MODE === 'live') {
                    const rowId = rowIdByListing[itemId];
                    if (!rowId) return;
                    void trackLive(
                      boardActions.reorderItem(board.id, itemId, rowId, layer),
                    ).catch(() => show("Couldn't move it — try again", 'error'));
                    return;
                  }
                  setBoardItems(board.id, itemToLayer(itemIds, itemId, layer));
                }}
                onRemove={(itemId) => removeWithUndo([itemId])}
                onComment={(itemId) => {
                  setCommentAnchor(itemId);
                  setCommentsOpen(true);
                }}
              />
            )}
          </div>
        ) : isEditing ? (
          items.length === 0 ? (
            <EmptyState
              icon="layers"
              title="This board is empty"
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
              /* Arbitrary item-order writes have no live endpoint (the
                 reorder route is a canvas layer move — front/back, already
                 on the canvas). Fixture boards keep the overlay reorder. */
              onMove={
                LIVE
                  ? undefined
                  : (itemId, dir) => setBoardItems(board.id, movedItem(itemIds, itemId, dir))
              }
              onReorder={
                LIVE
                  ? undefined
                  : (draggedId, targetId) =>
                      setBoardItems(board.id, itemMovedBefore(itemIds, draggedId, targetId))
              }
            />
          )
        ) : (
          <MasonryGrid
            units={units}
            columns={columns}
            emptyTitle="This board is empty"
            emptySubtitle="Save items to this board and they'll appear here."
          />
        )}
      </div>

      <MoodboardSheetsGroup
        boardId={board.id}
        importOpen={importOpen}
        onCloseImport={() => setImportOpen(false)}
        importCandidates={candidates}
        onAddItems={addItems}
        commentsOpen={commentsOpen}
        onCloseComments={() => {
          setCommentsOpen(false);
          setCommentAnchor(null);
        }}
        commentAnchor={commentAnchor}
        anchorRowId={commentAnchor ? rowIdByListing[commentAnchor] ?? null : null}
        listingIdByRowId={listingIdByRowId}
        boardItems={items}
        canModerateComments={isOwner || viewerRole === 'editor'}
        canComment={!LIVE ? undefined : canComment}
        collabOpen={collabOpen}
        onCloseCollab={() => setCollabOpen(false)}
        isOwner={isOwner}
        versionsOpen={versionsOpen}
        onCloseVersions={() => setVersionsOpen(false)}
        compareVersion={compareVersion}
        onCloseCompare={() => setCompareVersion(null)}
        currentSnapshot={{ itemIds, positions: canvasPositions, themeId }}
        onCompareVersion={(v) => {
          setVersionsOpen(false);
          setCompareVersion(v);
        }}
        onRestoreVersion={(v) => {
          restoreBoardSnapshot(board.id, {
            itemIds: v.itemIds,
            themeId: v.themeId,
            positions: v.positions,
          });
          setVersionsOpen(false);
          setCompareVersion(null);
          show(`Restored r${v.revision}`, 'success');
        }}
      />

      <MoodboardOptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isPrivate={isPrivate}
        onStartRename={startRename}
        onStartEditing={startEditing}
        onTogglePrivacy={togglePrivacy}
        onShare={() => void shareBoard()}
      />
    </div>
  );
}
