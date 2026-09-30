'use client';

/**
 * SellHeader — top-level header bar for the listing creator/editor.
 * Features title, draft saved status, and exit actions.
 */

import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';

interface SellHeaderProps {
  editing: Listing | null;
  draftSavedVisible: boolean;
  canSaveDraftToShelf: boolean;
  onSaveAndExit: () => void;
}

export function SellHeader({
  editing,
  draftSavedVisible,
  canSaveDraftToShelf,
  onSaveAndExit,
}: SellHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex items-start justify-between gap-4 pb-2 pt-8">
      <div className="min-w-0">
        <h1 className="text-screen-title text-text-primary">
          {editing ? 'Edit listing' : 'Sell an item'}
        </h1>
        {editing ? (
          <p className="clamp-1 mt-1 text-caption text-text-muted">
            “{editing.title}” — changes go live when you save.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-1.5">
        {draftSavedVisible ? (
          <span className="flex items-center gap-1 text-caption text-text-muted">
            <Icon name="check" size={12} />
            Draft saved
          </span>
        ) : null}
        {editing ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
        ) : null}
        {canSaveDraftToShelf ? (
          <button
            type="button"
            onClick={onSaveAndExit}
            className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Save draft &amp; exit
          </button>
        ) : null}
      </div>
    </header>
  );
}
