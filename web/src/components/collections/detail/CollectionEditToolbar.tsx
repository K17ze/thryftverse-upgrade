'use client';

/**
 * CollectionEditToolbar — editor controls for collection items:
 * Add items button, select mode toggle, reorder hint, and floating selection bar.
 */

import { Button } from '@/components/ui/Button';
import { MoodboardSelectionBar } from '@/components/moodboard/MoodboardSelectionBar';
import { DATA_MODE } from '@/lib/api/client';

const LIVE = DATA_MODE === 'live';

interface CollectionEditToolbarProps {
  isEditing: boolean;
  selectMode: boolean;
  selectedCount: number;
  onOpenImport: () => void;
  onToggleSelectMode: () => void;
  onRemoveSelected: () => void;
  onCancelSelection: () => void;
}

export function CollectionEditToolbar({
  isEditing,
  selectMode,
  selectedCount,
  onOpenImport,
  onToggleSelectMode,
  onRemoveSelected,
  onCancelSelection,
}: CollectionEditToolbarProps) {
  if (!isEditing) return null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={onOpenImport}
          >
            Add items
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-pressed={selectMode}
            onClick={onToggleSelectMode}
          >
            {selectMode ? 'Done selecting' : 'Select'}
          </Button>
        </div>
        <span className="hidden text-meta text-text-muted sm:block">
          {LIVE
            ? 'Order follows when items were added'
            : 'Drag tiles to reorder'}
        </span>
      </div>

      {selectMode ? (
        <MoodboardSelectionBar
          count={selectedCount}
          onRemoveSelected={onRemoveSelected}
          onCancel={onCancelSelection}
        />
      ) : null}
    </>
  );
}
