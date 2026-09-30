import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import { useToast } from '@/components/ui/Toast';
import { useMoodboardActions } from '@/lib/hooks/moodboard-queries';
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
  useMoodboardEdits,
  useMoodboardOverlay,
  withItemsAdded,
  withoutItemIds,
  type MoodboardOverlay,
} from '@/lib/store/moodboards';
import { useHydrated, useStore } from '@/lib/store/useStore';

export function useMoodboardDetailWorkflow() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { user: me, sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const columns = useMasonryColumns();
  const hydrated = useHydrated();

  const id = String(params.id ?? '');

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
        themeId: string | null;
        viewerRole: string | null;
      };
      items: import('@/lib/contracts/domain').Listing[];
      rowIdByListing: Record<string, string>;
      positions: Record<string, MoodboardItemPosition>;
    } | null> => {
      const wire = await socialService.fetchMoodboard(id);
      if (!wire) return null;
      const shoppableIds = [...new Set(wire.items.map((i) => i.listingId).filter(Boolean))];
      const hydratedItems = await Promise.all(
        shoppableIds.map((listingId) =>
          listingsService.fetchListingById(listingId).catch(() => null),
        ),
      );
      const items = hydratedItems.filter(
        (l): l is import('@/lib/contracts/domain').Listing => l != null,
      );
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

  const board =
    DATA_MODE === 'live'
      ? liveBoard?.board
      : (MOODBOARDS.find((b) => b.id === id) ??
        (hydrated ? createdBoards.find((b) => b.id === id) : undefined) ??
        publicMoodboardById(id));

  const { data: owner } = useUser(board?.ownerId ?? '');

  const overlay = useMoodboardOverlay(id);
  const [liveOverlay, setLiveOverlay] = useState<MoodboardOverlay | undefined>();
  const setBoardItems = useMoodboardEdits((s) => s.setBoardItems);
  const setBoardTheme = useMoodboardEdits((s) => s.setBoardTheme);
  const setItemPosition = useMoodboardEdits((s) => s.setItemPosition);
  const restoreBoardSnapshot = useMoodboardEdits((s) => s.restoreBoardSnapshot);
  const syncIssue = useMoodboardEdits((s) => (id ? s.syncIssues[id] : undefined));
  const boardActions = useMoodboardActions();

  const rowIdByListing = useMemo(
    () => liveBoard?.rowIdByListing ?? {},
    [liveBoard?.rowIdByListing],
  );

  const listingIdByRowId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [listingId, rowId] of Object.entries(rowIdByListing)) {
      m[rowId] = listingId;
    }
    return m;
  }, [rowIdByListing]);

  const edits = hydrated ? (DATA_MODE === 'live' ? liveOverlay : overlay) : undefined;

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

  const liveItems = liveBoard?.items;
  const items = useMemo(
    () => (DATA_MODE === 'live' ? (liveItems ?? []) : listingsForIds(itemIds)),
    [liveItems, itemIds],
  );

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

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const candidates = useMemo<DiscoveryListingSummary[]>(() => {
    const onBoard = new Set(itemIds);
    const pool = [...new Set([...saved, ...wishlist])].filter((x) => !onBoard.has(x));
    return listingsForIds(pool).map(mapListingToDiscoverySummary);
  }, [saved, wishlist, itemIds]);

  useEffect(() => {
    if (!editing || !focusTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
    setFocusTitle(false);
  }, [editing, focusTitle]);

  const inviteHandled = useRef(false);
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

  const viewerRole = liveBoard?.board.viewerRole ?? null;
  const isOwner = me?.id === board?.ownerId || viewerRole === 'owner';
  const canEditItems = isOwner || viewerRole === 'editor';
  const canComment = isOwner || viewerRole === 'editor' || viewerRole === 'commenter';
  const isEditing = canEditItems && editing;

  const shareBoard = () => {
    if (!board) return;
    return share({
      url: `${window.location.origin}/moodboard/${board.id}`,
      title,
      copiedLabel: 'Board link copied',
    });
  };

  const startEditing = () => {
    setTitleDraft(title);
    setEditing(true);
  };

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
    if (!board) return;
    const next = titleDraft.trim();
    if (next && next !== title) {
      void trackLive(boardActions.renameBoard(board.id, next)).catch(() =>
        show("Couldn't rename the board — try again", 'error'),
      );
    } else {
      setTitleDraft(title);
    }
  };

  const togglePrivacy = () => {
    if (!board) return;
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

  const removeWithUndo = (ids: string[]) => {
    if (!board || ids.length === 0) return;
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
    if (!board) return;
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

  return {
    id,
    sessionLoading,
    liveBoardQuery,
    invitePending,
    hydrated,
    board,
    owner,
    title,
    isPrivate,
    itemIds,
    items,
    summaries,
    units,
    themeId,
    theme,
    canvasPositions,
    editing,
    isEditing,
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    importOpen,
    setImportOpen,
    candidates,
    titleDraft,
    setTitleDraft,
    titleInputRef,
    optionsOpen,
    setOptionsOpen,
    view,
    setView,
    canvasSelectedId,
    setCanvasSelectedId,
    commentsOpen,
    setCommentsOpen,
    commentAnchor,
    setCommentAnchor,
    collabOpen,
    setCollabOpen,
    versionsOpen,
    setVersionsOpen,
    compareVersion,
    setCompareVersion,
    viewerRole,
    isOwner,
    canEditItems,
    canComment,
    syncIssue,
    shareBoard,
    startEditing,
    startRename,
    stopEditing,
    commitTitle,
    togglePrivacy,
    toggleSelect,
    removeWithUndo,
    removeSelected,
    addItems,
    setBoardTheme,
    setItemPosition,
    setBoardItems,
    restoreBoardSnapshot,
    boardActions,
    trackLive,
    rowIdByListing,
    listingIdByRowId,
    columns,
    show,
  };
}
