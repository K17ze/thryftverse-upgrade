'use client';

/**
 * MoodboardCompareSheet — the honest web adaptation of the mobile
 * MoodboardConflictCompareSheet. Mobile compares a local draft against a
 * conflicting server revision; web has no live op-log, so the same
 * surface compares the live board against a saved version snapshot —
 * real current state vs real snapshot, side by side, with a diff summary
 * and a restore action.
 */

import { useMemo } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import {
  moodboardThemeById,
  type MoodboardItemPosition,
  type MoodboardVersionRow,
} from '@/lib/data/fixtures-content';
import { listingById } from '@/lib/data/fixtures';
import { timeAgo } from '@/lib/utils/format';

interface BoardSnapshot {
  itemIds: string[];
  positions?: Record<string, MoodboardItemPosition>;
  themeId?: string;
}

interface MoodboardCompareSheetProps {
  open: boolean;
  onClose: () => void;
  /** null while nothing is being compared. */
  version: MoodboardVersionRow | null;
  current: BoardSnapshot;
  onRestore: (version: MoodboardVersionRow) => void;
}

/** Static mini render of a snapshot — positions over the theme tint. */
function MiniCanvas({
  snapshot,
  label,
}: {
  snapshot: BoardSnapshot;
  label: string;
}) {
  const theme = moodboardThemeById(snapshot.themeId);
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="mb-1.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </figcaption>
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg"
        style={{ backgroundColor: theme.backgroundColor }}
      >
        {snapshot.itemIds.map((id, i) => {
          const listing = listingById(id);
          if (!listing) return null;
          const pos = snapshot.positions?.[id] ?? {
            x: 0.2 + (i % 3) * 0.3,
            y: 0.22 + Math.floor(i / 3) * 0.32,
            scale: 0.6,
            rotation: 0,
          };
          return (
            <span
              key={id}
              className="absolute block overflow-hidden rounded"
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                width: `${Math.min(0.42, pos.scale * 0.24) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
              }}
            >
              <AppImage
                src={listing.images[0]}
                alt={listing.title}
                aspectRatio={listing.mediaAspectRatio ?? 0.8}
                sizes="120px"
                fallbackIcon="image"
              />
            </span>
          );
        })}
        {snapshot.itemIds.length === 0 ? (
          <span
            className="absolute inset-0 flex items-center justify-center text-meta"
            style={{ color: theme.fontColor }}
          >
            Empty board
          </span>
        ) : null}
      </div>
    </figure>
  );
}

export function MoodboardCompareSheet({
  open,
  onClose,
  version,
  current,
  onRestore,
}: MoodboardCompareSheetProps) {
  const diff = useMemo(() => {
    if (!version) return null;
    const before = new Set(version.itemIds);
    const after = new Set(current.itemIds);
    const added = current.itemIds.filter((id) => !before.has(id));
    const removed = version.itemIds.filter((id) => !after.has(id));
    const moved = current.itemIds.filter(
      (id) =>
        before.has(id) &&
        after.has(id) &&
        version.itemIds.indexOf(id) !== current.itemIds.indexOf(id),
    );
    const themeChanged =
      Boolean(version.themeId) && version.themeId !== current.themeId;
    return { added, removed, moved, themeChanged };
  }, [version, current]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={version ? `Compare — r${version.revision}` : 'Compare'}
      maxWidth={760}
    >
      {version ? (
        <div className="px-5 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <MiniCanvas snapshot={current} label="Current board" />
            <MiniCanvas
              snapshot={version}
              label={
                version.label
                  ? `r${version.revision} — ${version.label}`
                  : `Revision ${version.revision}`
              }
            />
          </div>

          {/* Diff summary — flat meta lines, no badges */}
          {diff ? (
            <div className="mt-4 space-y-1 text-meta text-text-secondary">
              <p className="font-medium text-text-primary">
                {version.label ?? `Revision ${version.revision}`}
                {' · '}
                {timeAgo(version.createdAt)}
                {version.themeId ? (
                  <>
                    {' · '}
                    {moodboardThemeById(version.themeId).label} canvas
                  </>
                ) : null}
              </p>
              {diff.added.length === 0 &&
              diff.removed.length === 0 &&
              diff.moved.length === 0 &&
              !diff.themeChanged ? (
                <p>No layout or item differences — the board matches this version.</p>
              ) : (
                <>
                  {diff.added.length > 0 ? (
                    <p>
                      <Icon name="plus" size={12} className="mr-1 inline text-success-text" />
                      {diff.added.length} added since this version
                    </p>
                  ) : null}
                  {diff.removed.length > 0 ? (
                    <p>
                      <Icon name="remove" size={12} className="mr-1 inline text-danger-text" />
                      {diff.removed.length} removed since this version
                    </p>
                  ) : null}
                  {diff.moved.length > 0 ? (
                    <p>
                      <Icon name="sort" size={12} className="mr-1 inline text-text-muted" />
                      {diff.moved.length} reordered
                    </p>
                  ) : null}
                  {diff.themeChanged ? (
                    <p>
                      <Icon name="palette" size={12} className="mr-1 inline text-text-muted" />
                      Theme changed to {moodboardThemeById(current.themeId).label}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={onClose}>
              Keep current
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={() => onRestore(version)}
            >
              Restore this version
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

// Re-exported so the page can describe the "current" side of the compare
// without duplicating the snapshot shape.
export type { BoardSnapshot };
