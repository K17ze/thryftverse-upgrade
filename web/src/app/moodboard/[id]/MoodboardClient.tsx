'use client';

/**
 * Moodboard detail — port of MoodboardEditor's read surface:
 * cover-media header with scrim title, owner row, quiet edit affordances
 * for the owner, masonry of board items.
 * Supports inline rename, per-tile remove with Undo, drag reorder,
 * multi-select batch remove, canvas layout, versions history, and import sheet.
 */

import { BackBar } from '@/components/profile/BackBar';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { DATA_MODE } from '@/lib/api/client';
import { itemToLayer } from '@/lib/store/moodboards';
import {
  MoodboardSkeleton,
  MoodboardErrorState,
  MoodboardNotFoundState,
  MoodboardPrivateWallState,
} from '@/components/moodboard/detail/MoodboardStatusStates';
import { MoodboardCoverHeader } from '@/components/moodboard/detail/MoodboardCoverHeader';
import { MoodboardOptionsSheet } from '@/components/moodboard/detail/MoodboardOptionsSheet';
import { MoodboardSheetsGroup } from '@/components/moodboard/detail/MoodboardSheetsGroup';
import { MoodboardViewArea } from '@/components/moodboard/detail/MoodboardViewArea';
import { useMoodboardDetailWorkflow } from '@/components/moodboard/detail/useMoodboardDetailWorkflow';

const LIVE = DATA_MODE === 'live';

export function MoodboardClient() {
  const {
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
  } = useMoodboardDetailWorkflow();

  if (
    DATA_MODE === 'live' &&
    (sessionLoading || ((liveBoardQuery.isLoading || invitePending) && !board))
  ) {
    return <MoodboardSkeleton />;
  }

  if (DATA_MODE === 'live' && liveBoardQuery.isError && !board) {
    return <MoodboardErrorState onRetry={() => void liveBoardQuery.refetch()} />;
  }

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

  if (isPrivate && !isOwner && !viewerRole) {
    return <MoodboardPrivateWallState />;
  }

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

      <MoodboardViewArea
        boardId={board.id}
        items={items}
        itemIds={itemIds}
        theme={theme}
        themeId={themeId}
        canvasPositions={canvasPositions}
        isEditing={isEditing}
        isOwner={isOwner}
        view={view}
        onSelectView={setView}
        canvasSelectedId={canvasSelectedId}
        onSelectCanvasItem={setCanvasSelectedId}
        onPositionCanvasItem={(itemId, pos) => {
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
        onLayerCanvasItem={(itemId, layer) => {
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
        onRemoveItem={(itemId) => removeWithUndo([itemId])}
        onCommentItem={(itemId) => {
          setCommentAnchor(itemId);
          setCommentsOpen(true);
        }}
        selectMode={selectMode}
        selectedIds={selectedIds}
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
        onToggleSelect={toggleSelect}
        summaries={summaries}
        units={units}
        columns={columns}
        setBoardItems={setBoardItems}
        rowIdByListing={rowIdByListing}
        boardActions={boardActions}
        trackLive={trackLive}
        show={show}
      />

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
