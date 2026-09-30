import React from 'react';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { MoodboardEditToolbar } from '@/components/moodboard/detail/MoodboardEditToolbar';
import { MoodboardCanvas } from '@/components/moodboard/MoodboardCanvas';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { EmptyState } from '@/components/ui/EmptyState';
import { DATA_MODE } from '@/lib/api/client';
import { itemMovedBefore, itemToLayer, movedItem } from '@/lib/store/moodboards';
import type { DiscoveryFeedUnit, DiscoveryListingSummary, Listing } from '@/lib/contracts/domain';
import type { MoodboardItemPosition } from '@/lib/data/fixtures-content';
import type { useMoodboardActions } from '@/lib/hooks/moodboard-queries';

const LIVE = DATA_MODE === 'live';

export function MoodboardViewArea({
  boardId,
  items,
  itemIds,
  theme,
  themeId,
  canvasPositions,
  isEditing,
  isOwner,
  view,
  onSelectView,
  canvasSelectedId,
  onSelectCanvasItem,
  onPositionCanvasItem,
  onLayerCanvasItem,
  onRemoveItem,
  onCommentItem,
  selectMode,
  selectedIds,
  onOpenImport,
  onToggleSelectMode,
  onSelectTheme,
  onRemoveSelected,
  onCancelSelection,
  onToggleSelect,
  summaries,
  units,
  columns,
  setBoardItems,
  rowIdByListing,
  boardActions,
  trackLive,
  show,
}: {
  boardId: string;
  items: Listing[];
  itemIds: string[];
  theme: ReturnType<typeof import('@/lib/data/fixtures-content').moodboardThemeById>;
  themeId: string;
  canvasPositions: Record<string, MoodboardItemPosition>;
  isEditing: boolean;
  isOwner: boolean;
  view: 'canvas' | 'items';
  onSelectView: (v: 'canvas' | 'items') => void;
  canvasSelectedId: string | null;
  onSelectCanvasItem: (id: string | null) => void;
  onPositionCanvasItem: (itemId: string, pos: MoodboardItemPosition) => void;
  onLayerCanvasItem: (itemId: string, layer: 'front' | 'back') => void;
  onRemoveItem: (itemId: string) => void;
  onCommentItem: (itemId: string) => void;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onOpenImport: () => void;
  onToggleSelectMode: () => void;
  onSelectTheme: (tId: string) => void;
  onRemoveSelected: () => void;
  onCancelSelection: () => void;
  onToggleSelect: (itemId: string) => void;
  summaries: DiscoveryListingSummary[];
  units: DiscoveryFeedUnit[];
  columns: number;
  setBoardItems: (boardId: string, itemIds: string[]) => void;
  rowIdByListing: Record<string, string>;
  boardActions: ReturnType<typeof useMoodboardActions>;
  trackLive: (promise: Promise<void>) => Promise<void>;
  show: (message: string, tone?: 'info' | 'success' | 'error') => void;
}) {
  return (
    <>
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
            onSelectView(v);
            onSelectCanvasItem(null);
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
        onOpenImport={onOpenImport}
        onToggleSelectMode={onToggleSelectMode}
        onSelectTheme={onSelectTheme}
        onRemoveSelected={onRemoveSelected}
        onCancelSelection={onCancelSelection}
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
                boardId={boardId}
                itemIds={itemIds}
                items={items}
                theme={theme}
                positions={canvasPositions}
                editing={isEditing}
                selectedId={canvasSelectedId}
                onSelect={onSelectCanvasItem}
                onPosition={onPositionCanvasItem}
                onLayer={onLayerCanvasItem}
                onRemove={onRemoveItem}
                onComment={onCommentItem}
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
              onAction={onOpenImport}
              compact
            />
          ) : (
            <EditableMoodboardGrid
              items={summaries}
              columns={columns}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onRemove={onRemoveItem}
              onMove={
                LIVE
                  ? undefined
                  : (itemId, dir) => setBoardItems(boardId, movedItem(itemIds, itemId, dir))
              }
              onReorder={
                LIVE
                  ? undefined
                  : (draggedId, targetId) =>
                      setBoardItems(boardId, itemMovedBefore(itemIds, draggedId, targetId))
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
    </>
  );
}
