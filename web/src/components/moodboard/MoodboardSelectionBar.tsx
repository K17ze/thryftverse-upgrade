'use client';

/**
 * MoodboardSelectionBar — select-mode chrome for the editable board.
 * Mirrors the mobile MultiSelectBadge + batch SelectionControls grammar:
 * one centered pill carrying the live count, a batch Remove and a Cancel
 * that exits select mode.
 */

import { Icon } from '@/components/ui/Icon';

interface MoodboardSelectionBarProps {
  count: number;
  onRemoveSelected: () => void;
  onCancel: () => void;
}

export function MoodboardSelectionBar({
  count,
  onRemoveSelected,
  onCancel,
}: MoodboardSelectionBarProps) {
  return (
    <div className="flex justify-center px-4 pt-3" role="toolbar" aria-label="Selection actions">
      <div className="flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-4 py-1.5 shadow-modal">
        <span className="text-body font-semibold text-text-primary" aria-live="polite">
          {count} selected
        </span>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onRemoveSelected}
          disabled={count === 0}
          className="pressable inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-body font-semibold text-danger-text disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="trash" size={15} />
          Remove
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pressable rounded-full px-2 py-1 text-body font-semibold text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
