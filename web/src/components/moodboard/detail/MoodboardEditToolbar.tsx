'use client';

/**
 * MoodboardEditToolbar — editor controls for canvas and item list views.
 * Provides add-items triggers, selection mode toggles, theme swatches,
 * and the floating multi-select deletion bar.
 */

import { Button } from '@/components/ui/Button';
import { MoodboardSelectionBar } from '@/components/moodboard/MoodboardSelectionBar';
import { MOODBOARD_THEMES } from '@/lib/data/fixtures-content';
import { DATA_MODE } from '@/lib/api/client';

const LIVE = DATA_MODE === 'live';

interface MoodboardEditToolbarProps {
  isEditing: boolean;
  view: 'canvas' | 'items';
  isOwner: boolean;
  themeId: string;
  selectMode: boolean;
  selectedCount: number;
  onOpenImport: () => void;
  onToggleSelectMode: () => void;
  onSelectTheme: (themeId: string) => void;
  onRemoveSelected: () => void;
  onCancelSelection: () => void;
}

export function MoodboardEditToolbar({
  isEditing,
  view,
  isOwner,
  themeId,
  selectMode,
  selectedCount,
  onOpenImport,
  onToggleSelectMode,
  onSelectTheme,
  onRemoveSelected,
  onCancelSelection,
}: MoodboardEditToolbarProps) {
  if (!isEditing) return null;

  return (
    <>
      {/* Edit toolbar — quiet actions; batch chrome lives in the select pill */}
      {view === 'items' ? (
        <div className="mt-4 flex items-center justify-between gap-2 px-4 sm:px-6">
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
              ? 'Layer order lives on the canvas'
              : 'Drag tiles to reorder'}
          </span>
        </div>
      ) : (
        /* Canvas edit chrome — add items + theme swatches, mirroring the
           mobile editor's bottom panel. */
        <div className="mt-3 flex flex-wrap items-center gap-2 px-4 sm:px-6">
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={onOpenImport}
          >
            Add items
          </Button>

          {/* Theme writes PATCH board meta — an owner-only capability
              server-side, so editors don't get the dead affordance. */}
          {isOwner ? (
            <div
              role="radiogroup"
              aria-label="Canvas theme"
              className="flex items-center gap-1.5"
            >
              {MOODBOARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={themeId === t.id}
                  aria-label={`${t.label} theme`}
                  title={t.label}
                  onClick={() => onSelectTheme(t.id)}
                  className={`pressable h-7 w-7 rounded-full transition-shadow ${
                    themeId === t.id
                      ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface'
                      : 'ring-1 ring-border'
                  }`}
                  style={{ backgroundColor: t.backgroundColor }}
                />
              ))}
            </div>
          ) : null}

          <span className="hidden text-meta text-text-muted sm:block">
            Drag to arrange · tap an item for layer, rotate, scale
          </span>
        </div>
      )}

      {selectMode && view === 'items' ? (
        <MoodboardSelectionBar
          count={selectedCount}
          onRemoveSelected={onRemoveSelected}
          onCancel={onCancelSelection}
        />
      ) : null}
    </>
  );
}
