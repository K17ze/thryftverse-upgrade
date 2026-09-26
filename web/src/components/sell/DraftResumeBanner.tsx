'use client';

/**
 * DraftResumeBanner — surfaces a persisted sell draft when returning to
 * /sell. Flat single-row banner: what it is, when it was saved, Resume or
 * Discard. Web counterpart to the mobile draft auto-restore.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { PersistedSellDraft } from '@/lib/hooks/sell/useSellDraftPersistence';
import { timeAgo } from '@/lib/utils/format';

interface DraftResumeBannerProps {
  record: PersistedSellDraft;
  onResume: () => void;
  onDiscard: () => void;
}

export function DraftResumeBanner({ record, onResume, onDiscard }: DraftResumeBannerProps) {
  const when = timeAgo(record.savedAt);
  const editing = Boolean(record.editId);

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-alt px-4 py-3"
    >
      <Icon name="clock" size={16} className="shrink-0 text-text-muted" />
      <p className="min-w-0 flex-1 text-caption text-text-secondary">
        {editing ? 'Unsaved edits to one of your listings' : 'You have a saved draft'}
        {when ? <span className="text-text-muted"> — {when}</span> : null}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onResume}>
          Resume draft
        </Button>
        <button
          type="button"
          onClick={onDiscard}
          className="pressable rounded-md px-2 py-1.5 text-caption font-medium text-text-muted hover:text-danger-text"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
