'use client';

/**
 * Collection detail — quiet header + masonry of items.
 * Resolves saved collections (col-*) and seller closets (closet-<userId>).
 * Supports in-place item management, per-tile remove with Undo,
 * drag / move reordering, multi-select batch remove, and cover selection.
 */

import { notFound } from 'next/navigation';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { BackBar } from '@/components/profile/BackBar';
import { DATA_MODE } from '@/lib/api/client';
import { itemMovedBefore, movedItem } from '@/lib/store/collectionEdits';

// Domain-isolated sub-components (<400 LOC modularity standard)
import {
  CollectionSkeleton,
  CollectionClosetErrorState,
  CollectionLiveErrorState,
  CollectionPrivateWallState,
} from '@/components/collections/detail/CollectionStatusStates';
import { CollectionHeader } from '@/components/collections/detail/CollectionHeader';
import { CollectionEditToolbar } from '@/components/collections/detail/CollectionEditToolbar';
import { CollectionSheetsGroup } from '@/components/collections/detail/CollectionSheetsGroup';
import { useCollectionWorkflow } from '@/components/collections/detail/useCollectionWorkflow';

const LIVE = DATA_MODE === 'live';

export function CollectionClient() {
  const columns = useMasonryColumns();
  const w = useCollectionWorkflow();

  if (w.loading) {
    return <CollectionSkeleton columns={columns} />;
  }

  // Error is not absence — a failed fetch gets a retry, not a gravestone.
  if (w.isCloset && (w.ownerError || w.itemsError)) {
    return (
      <CollectionClosetErrorState
        onRetry={() => {
          void w.refetchOwner();
          void w.refetchItems();
        }}
      />
    );
  }

  if (LIVE && !w.isCloset && w.boardQuery.isError) {
    return (
      <CollectionLiveErrorState
        onRetry={() => void w.boardQuery.refetch()}
      />
    );
  }

  // Resolved-empty is a definitive miss — the not-found boundary owns it.
  if (!w.resolved) {
    notFound();
  }

  // Private boards are owner-only — anyone else gets the honest wall.
  if (!w.viewerOwns && (w.resolved.isPrivate || w.resolved.ownerId === 'me')) {
    return <CollectionPrivateWallState />;
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar
        actions={
          <>
            {!w.resolved.isPrivate ? (
              <IconButton
                name="share"
                aria-label="Share collection"
                onClick={w.shareCollection}
              />
            ) : null}
            {w.resolved.editable ? (
              <IconButton
                name="more"
                aria-label="Collection options"
                onClick={() => w.setOptionsOpen(true)}
              />
            ) : null}
          </>
        }
      />

      <CollectionHeader
        showHero={w.showHero}
        heroThumbs={w.heroThumbs}
        title={w.resolved.title}
        isPrivate={w.resolved.isPrivate}
        archived={w.archived}
        owner={w.resolved.owner}
        itemCount={w.items.length}
        meta={w.resolved.meta}
        description={w.resolved.description}
      />

      <CollectionEditToolbar
        isEditing={w.isEditing}
        selectMode={w.selectMode}
        selectedCount={w.selectedIds.size}
        onOpenImport={() => w.setImportOpen(true)}
        onToggleSelectMode={() => {
          w.setSelectMode((v) => !v);
          w.setSelectedIds(new Set());
        }}
        onRemoveSelected={w.removeSelected}
        onCancelSelection={() => {
          w.setSelectMode(false);
          w.setSelectedIds(new Set());
        }}
      />

      <div className="mt-8 px-4 pb-16 sm:px-6">
        {w.isEditing ? (
          w.items.length === 0 ? (
            <EmptyState
              icon="bookmark"
              title="This collection is empty"
              subtitle="Add saved items or favourites to start building it."
              actionLabel="Add items"
              onAction={() => w.setImportOpen(true)}
              compact
            />
          ) : (
            <EditableMoodboardGrid
              items={w.summaries}
              columns={columns}
              selectMode={w.selectMode}
              selectedIds={w.selectedIds}
              onToggleSelect={w.toggleSelect}
              onRemove={(itemId) => w.removeWithUndo([itemId])}
              onMove={
                LIVE
                  ? undefined
                  : (itemId, dir) => void w.commitItems(movedItem(w.itemIds, itemId, dir))
              }
              onReorder={
                LIVE
                  ? undefined
                  : (draggedId, targetId) =>
                      void w.commitItems(itemMovedBefore(w.itemIds, draggedId, targetId))
              }
            />
          )
        ) : (
          <MasonryGrid
            units={w.units}
            columns={columns}
            emptyTitle="This collection is empty"
            emptySubtitle="Saved items will appear here."
          />
        )}
      </div>

      <CollectionSheetsGroup
        id={w.id}
        title={w.resolved.title}
        isPrivate={w.resolved.isPrivate}
        archived={w.archived}
        isCloset={w.isCloset}
        importOpen={w.importOpen}
        onCloseImport={() => w.setImportOpen(false)}
        candidates={w.candidates}
        onAddItems={w.addItems}
        optionsOpen={w.optionsOpen}
        onCloseOptions={() => w.setOptionsOpen(false)}
        onOpenDetails={() => w.setDetailsOpen(true)}
        onStartEditing={() => w.setEditing(true)}
        onOpenCover={() => w.setCoverOpen(true)}
        onTogglePrivacy={w.togglePrivacy}
        onToggleArchive={() => {
          w.setOptionsOpen(false);
          w.setBoardArchived(w.id, !w.archived);
          w.show(
            w.archived
              ? 'Board restored'
              : 'Board archived — it stays reachable from this link',
            'info',
          );
        }}
        onShare={() => {
          w.setOptionsOpen(false);
          void w.shareCollection();
        }}
        onOpenConfirmDelete={() => {
          w.setOptionsOpen(false);
          w.setConfirmDelete(true);
        }}
        coverOpen={w.coverOpen}
        onCloseCover={() => w.setCoverOpen(false)}
        items={w.summaries}
        coverItemId={w.coverItemId ?? undefined}
        onSelectCover={(cId) => {
          w.setBoardCover(w.id, cId);
          w.setCoverOpen(false);
          w.show(cId ? 'Cover updated' : 'Cover reset to automatic', 'info');
        }}
        detailsOpen={w.detailsOpen}
        onCloseDetails={() => w.setDetailsOpen(false)}
        initialDetails={{
          title: w.resolved.title,
          description: w.resolved.description ?? null,
          isPrivate: !!w.resolved.isPrivate,
        }}
        onSaveDetails={w.saveDetails}
        confirmDelete={w.confirmDelete}
        onCloseConfirmDelete={() => w.setConfirmDelete(false)}
        onDeleteCollection={() => void w.deleteCollection()}
      />
    </div>
  );
}
