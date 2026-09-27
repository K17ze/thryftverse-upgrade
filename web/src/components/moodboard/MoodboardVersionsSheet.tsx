'use client';

/**
 * MoodboardVersionsSheet — port of the mobile MoodboardVersionHistorySheet.
 * Seeded version rows from fixtures merge with session snapshots from the
 * moodboardCollab overlay. Rows expose pin, preview-compare, and restore;
 * "Save a version" snapshots the live board state (items + canvas
 * positions + theme) as a manual revision.
 */

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import {
  MOODBOARD_VERSIONS,
  usernameById,
  type MoodboardItemPosition,
  type MoodboardVersionRow,
} from '@/lib/data/fixtures-content';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const SOURCE_LABELS: Record<MoodboardVersionRow['source'], string> = {
  manual: 'Manual save',
  auto: 'Autosaved',
  restore: 'Restored copy',
};

interface MoodboardVersionsSheetProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  /** Live board state for snapshotting + revision numbering. */
  current: {
    itemIds: string[];
    positions?: Record<string, MoodboardItemPosition>;
    themeId?: string;
  };
  onCompare: (version: MoodboardVersionRow) => void;
  onRestore: (version: MoodboardVersionRow) => void;
}

export function MoodboardVersionsSheet({
  boardId,
  open,
  onClose,
  current,
  onCompare,
  onRestore,
}: MoodboardVersionsSheetProps) {
  const hydrated = useHydrated();
  const collab = useMoodboardCollab((s) => s.boards[boardId]);
  const addVersion = useMoodboardCollab((s) => s.addVersion);
  const setVersionPinned = useMoodboardCollab((s) => s.setVersionPinned);
  const [label, setLabel] = useState('');

  const versions = useMemo<MoodboardVersionRow[]>(() => {
    const overlay = hydrated ? collab : undefined;
    const merged = [
      ...(overlay?.addedVersions ?? []),
      ...MOODBOARD_VERSIONS.filter((v) => v.boardId === boardId),
    ].map((v) =>
      v.id in (overlay?.pinnedVersions ?? {})
        ? { ...v, isPinned: overlay!.pinnedVersions[v.id] }
        : v,
    );
    // Pinned first, then newest — mirrors mobile's pinned sort.
    merged.sort((a, b) =>
      a.isPinned === b.isPinned
        ? b.createdAt.localeCompare(a.createdAt)
        : a.isPinned
          ? -1
          : 1,
    );
    return merged;
  }, [boardId, collab, hydrated]);

  const nextRevision = versions.reduce((n, v) => Math.max(n, v.revision), 0) + 1;

  const saveSnapshot = () => {
    addVersion(boardId, {
      id: `mbv-local-${Date.now()}`,
      revision: nextRevision,
      label: label.trim() || null,
      source: 'manual',
      isPinned: false,
      createdAt: new Date().toISOString(),
      createdById: 'me',
      itemIds: current.itemIds,
      positions: current.positions,
      themeId: current.themeId,
    });
    setLabel('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Version history" maxWidth={480}>
      <div className="px-5 pb-5">
        {/* Snapshot composer — one quiet row */}
        <div className="flex items-center gap-2 pb-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label this version (optional)"
            aria-label="Version label"
            maxLength={60}
            className="h-10 min-w-0 flex-1 rounded-full bg-surface-alt px-4 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
          />
          <Button variant="secondary" size="sm" icon="plus" onClick={saveSnapshot}>
            Save
          </Button>
        </div>

        {versions.length === 0 ? (
          <p className="py-8 text-center text-body text-text-muted">
            No versions yet — save one before a big rearrange.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle" aria-label="Saved versions">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-3">
                <Avatar
                  src={undefined}
                  name={usernameById(v.createdById)}
                  size={34}
                />
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-medium text-text-primary">
                    {v.label ?? `Revision ${v.revision}`}
                    {v.isPinned ? (
                      <Icon
                        name="pin"
                        size={12}
                        className="ml-1.5 inline text-warning-text"
                      />
                    ) : null}
                  </p>
                  <p className="text-meta text-text-muted">
                    <span className="tnum">r{v.revision}</span>
                    {' · '}
                    {SOURCE_LABELS[v.source]} by @{usernameById(v.createdById)}
                    <span className="tnum"> · {timeAgo(v.createdAt)}</span>
                    <span className="tnum"> · {v.itemIds.length} items</span>
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setVersionPinned(boardId, v.id, !v.isPinned)}
                    aria-pressed={v.isPinned}
                    aria-label={v.isPinned ? 'Unpin version' : 'Pin version'}
                    className={`pressable flex h-9 w-9 items-center justify-center rounded-md ${
                      v.isPinned
                        ? 'text-warning-text'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <Icon name="pin" size={16} filled={v.isPinned} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCompare(v)}
                    aria-label={`Preview version ${v.revision} against current board`}
                    className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
                  >
                    <Icon name="images" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(v)}
                    aria-label={`Restore version ${v.revision}`}
                    className="pressable flex h-9 items-center rounded-md px-2 text-meta font-medium text-text-secondary hover:text-text-primary"
                  >
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
