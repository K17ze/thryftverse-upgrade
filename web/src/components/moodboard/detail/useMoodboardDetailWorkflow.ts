import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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
  type MoodboardVersionRow,
} from '@/lib/data/fixtures-content';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useMoodboardEdits,
  useMoodboardOverlay,
  type MoodboardOverlay,
} from '@/lib/store/moodboards';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useMoodboardLiveQuery } from './useMoodboardLiveQuery';
import { useMoodboardInvite } from './useMoodboardInvite';
import { useMoodboardItemActions } from './useMoodboardItemActions';

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

  const liveBoardQuery = useMoodboardLiveQuery(id);
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

  const { invitePending } = useMoodboardInvite({
    id,
    me,
    sessionLoading,
    router,
    queryClient,
    show,
  });

  const viewerRole = liveBoard?.board.viewerRole ?? null;
  const isOwner = me?.id === board?.ownerId || viewerRole === 'owner';
  const canEditItems = isOwner || viewerRole === 'editor';
  const canComment = isOwner || viewerRole === 'editor' || viewerRole === 'commenter';
  const isEditing = canEditItems && editing;

  const {
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    importOpen,
    setImportOpen,
    toggleSelect,
    removeWithUndo,
    removeSelected,
    addItems,
  } = useMoodboardItemActions({
    board,
    itemIds,
    rowIdByListing,
    trackLive,
    boardActions,
    setBoardItems,
    show,
  });

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
