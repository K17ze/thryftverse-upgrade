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
import { Button } from '@/components/ui/Button';
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
                name="overflow"
                aria-label="Collection options"
                onClick={() => w.setOptionsOpen(true)}
              />
            ) : null}
          </>
        }
      />

      <CollectionHeader
        title={w.resolved.title}
        owner={w.resolved.owner}
        editable={w.resolved.editable}
        meta={w.resolved.meta}
        description={w.resolved.description}
        isPrivate={w.resolved.isPrivate}
        archived={w.archived}
        editing={w.editing}
        itemCount={w.itemIds.length}
        heroThumbs={w.heroThumbs}
        showHero={w.showHero}
        onStartEditing={() => w.setEditing(true)}
        onOpenImport={() => w.setImportOpen(true)}
      />

      {w.isEditing ? (
        <CollectionEditToolbar
          itemCount={w.itemIds.length}
          selectMode={w.selectMode}
          selectedCount={w.selectedIds.size}
          onToggleSelectMode={() => {
            w.setSelectMode((v) => !v);
          }}
          onOpenImport={() => w.setImportOpen(true)}
          onRemoveSelected={w.removeSelected}
          onDone={w.stopEditing}
        />
      ) : null}

      <div className="mt-8 px-4 pb-16 sm:px-6">
        {w.isEditing ? (
          <EditableMoodboardGrid
            items={w.summaries}
            editable
            selectMode={w.selectMode}
            selectedIds={w.selectedIds}
            onToggleSelect={w.toggleSelect}
            onRemoveItem={(item) => w.removeWithUndo([item.id])}
            onMove={(draggedId, targetId) => {
              const from = w.itemIds.indexOf(draggedId);
              const to = w.itemIds.indexOf(targetId);
              if (from < 0 || to < 0 || from === to) return;
              void w.commitItems(movedItem(w.itemIds, from, to));
            }}
            onMoveBefore={(draggedId, targetId) => {
              void w.commitItems(itemMovedBefore(w.itemIds, draggedId, targetId));
            }}
          />
        ) : w.items.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon="bookmark"
              title="This collection is empty"
              subtitle={
                w.resolved.editable
                  ? 'Add items you love from search, the feed, or product pages.'
                  : 'The owner hasn’t added any items to this collection yet.'
              }
              actionLabel={w.resolved.editable ? 'Explore items' : undefined}
              onAction={w.resolved.editable ? () => window.location.assign('/search') : undefined}
            />
            {w.resolved.editable && w.candidates.length > 0 ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => w.setImportOpen(true)}
                >
                  Import from saved
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <MasonryGrid items={w.units} />
        )}
      </div>

      <CollectionSheetsGroup
        id={w.id}
        title={w.resolved.title}
        description={w.resolved.description ?? ''}
        isPrivate={Boolean(w.resolved.isPrivate)}
        archived={w.archived}
        items={w.summaries}
        candidates={w.candidates}
        candidatesLoading={w.candidatesLoading}
        optionsOpen={w.optionsOpen}
        detailsOpen={w.detailsOpen}
        coverOpen={w.coverOpen}
        importOpen={w.importOpen}
        confirmDelete={w.confirmDelete}
        onCloseOptions={() => w.setOptionsOpen(false)}
        onCloseDetails={() => w.setDetailsOpen(false)}
        onCloseCover={() => w.setCoverOpen(false)}
        onCloseImport={() => w.setImportOpen(false)}
        onCloseConfirmDelete={() => w.setConfirmDelete(false)}
        onOpenDetails={() => w.setDetailsOpen(true)}
        onOpenCover={() => w.setCoverOpen(true)}
        onTogglePrivacy={w.togglePrivacy}
        onToggleArchive={() => {
          w.setBoardArchived(w.id, !w.archived);
          w.setOptionsOpen(false);
        }}
        onConfirmDeleteOpen={() => w.setConfirmDelete(true)}
        onSaveDetails={w.saveDetails}
        onSelectCover={(itemId) => w.setBoardCover(w.id, itemId)}
        onAddItems={w.addItems}
        onDeleteCollection={w.deleteCollection}
      />
    </div>
  );
}
