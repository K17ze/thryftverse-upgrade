'use client';

/**
 * MoodboardVersionsSheet — port of the mobile MoodboardVersionHistorySheet.
 * Live mode reads the real /moodboards/:id/versions history and writes
 * through the same endpoints the mobile app uses: save snapshots
 * server-side (POST), pin/unpin (PATCH), restore (POST restore — history
 * is never overwritten; the restore becomes a new revision and the board
 * refetches). The list wire carries metadata only, so the compare preview
 * is fixture-mode: live rows hide it rather than compare against nothing.
 * Fixture mode merges seeded rows with session snapshots from the
 * moodboardCollab overlay.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  MOODBOARD_VERSIONS,
  usernameById,
  type MoodboardItemPosition,
  type MoodboardVersionRow,
} from '@/lib/data/fixtures-content';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  createBoardVersion,
  fetchBoardVersions,
  restoreBoardVersion,
  setBoardVersionPinned,
  type BoardVersion,
} from '@/lib/api/services/social';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual save',
  auto: 'Autosaved',
  restore: 'Restored copy',
};

/** Normalized render row — fixture rows carry snapshot content (itemIds,
 *  positions, themeId) for compare/restore; live rows carry metadata only. */
interface RenderVersion {
  id: string;
  revision: number;
  label: string | null;
  source: string;
  isPinned: boolean;
  createdAt: string;
  authorName: string | null;
  /** null when the wire doesn't expose snapshot content (live). */
  itemCount: number | null;
  /** Fixture rows only — the compare/restore handlers need the snapshot. */
  raw?: MoodboardVersionRow;
}

interface MoodboardVersionsSheetProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  /** Live board state for snapshotting + revision numbering (fixture). */
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
  const { show } = useToast();
  const hydrated = useHydrated();
  const collab = useMoodboardCollab((s) => s.boards[boardId]);
  const addVersion = useMoodboardCollab((s) => s.addVersion);
  const setVersionPinned = useMoodboardCollab((s) => s.setVersionPinned);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ['moodboard-versions', boardId],
    queryFn: ({ signal }) => fetchBoardVersions(boardId, signal),
    enabled: LIVE && open,
    staleTime: 30_000,
  });

  const versions = useMemo<RenderVersion[]>(() => {
    if (LIVE) {
      return (versionsQuery.data ?? []).map((v: BoardVersion) => ({
        id: v.id,
        revision: v.revision,
        label: v.label,
        source: v.source,
        isPinned: v.isPinned,
        createdAt: v.createdAt,
        authorName: v.createdByName,
        itemCount: null,
      }));
    }
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
    return merged.map((v) => ({
      id: v.id,
      revision: v.revision,
      label: v.label,
      source: v.source,
      isPinned: v.isPinned,
      createdAt: v.createdAt,
      authorName: usernameById(v.createdById),
      itemCount: v.itemIds.length,
      raw: v,
    }));
  }, [versionsQuery.data, boardId, collab, hydrated]);

  const nextRevision = versions.reduce((n, v) => Math.max(n, v.revision), 0) + 1;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['moodboard-versions', boardId] });
    // A restore rewrites the board — the live board query refetches.
    void qc.invalidateQueries({ queryKey: ['moodboard', boardId, 'live'] });
  };

  const saveSnapshot = async () => {
    if (busy) return;
    if (LIVE) {
      setBusy(true);
      try {
        await createBoardVersion(boardId, label.trim() || undefined);
        setLabel('');
        invalidate();
        show('Version saved', 'success');
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't save — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
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

  const togglePinned = async (v: RenderVersion) => {
    if (LIVE) {
      setBusy(true);
      try {
        await setBoardVersionPinned(boardId, v.id, !v.isPinned);
        invalidate();
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't update — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    setVersionPinned(boardId, v.id, !v.isPinned);
  };

  const restore = async (v: RenderVersion) => {
    if (LIVE) {
      setBusy(true);
      try {
        await restoreBoardVersion(boardId, v.id);
        invalidate();
        onClose();
        show(`Restored r${v.revision}`, 'success');
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't restore — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (v.raw) onRestore(v.raw);
  };

  const loading = LIVE && versionsQuery.isLoading;

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
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            disabled={busy}
            onClick={() => void saveSnapshot()}
          >
            Save
          </Button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-body text-text-muted" aria-busy>
            Loading versions…
          </p>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-body text-text-muted">
            No versions yet — save one before a big rearrange.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle" aria-label="Saved versions">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-3">
                <Avatar
                  src={undefined}
                  name={v.authorName ?? 'member'}
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
                    {SOURCE_LABELS[v.source] ?? v.source} by @{v.authorName ?? 'member'}
                    <span className="tnum"> · {timeAgo(v.createdAt)}</span>
                    {v.itemCount != null ? (
                      <span className="tnum"> · {v.itemCount} items</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void togglePinned(v)}
                    aria-pressed={v.isPinned}
                    aria-label={v.isPinned ? 'Unpin version' : 'Pin version'}
                    className={`pressable flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-50 ${
                      v.isPinned
                        ? 'text-warning-text'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <Icon name="pin" size={16} filled={v.isPinned} />
                  </button>
                  {/* Compare previews the snapshot against the current
                      board — the live wire doesn't expose snapshot
                      content, so live rows hide the affordance. */}
                  {v.raw ? (
                    <button
                      type="button"
                      onClick={() => onCompare(v.raw!)}
                      aria-label={`Preview version ${v.revision} against current board`}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
                    >
                      <Icon name="images" size={16} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void restore(v)}
                    aria-label={`Restore version ${v.revision}`}
                    className="pressable flex h-9 items-center rounded-md px-2 text-meta font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
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
