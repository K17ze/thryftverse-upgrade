'use client';

/**
 * SortablePhotoStrip — the staged-media strip for authoring flows.
 *
 * Web port of the mobile SortablePhotoStrip contract: drag to reorder
 * (native HTML5 drag), arrow-key reorder on a focused tile as the keyboard
 * equivalent, a cover badge on position 0, and per-tile remove / edit /
 * upload-status affordances. Reorders are announced through a polite live
 * region so the change is perceivable off-pointer too.
 */

import { useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { UploadProgressRing, type MediaUploadStatus } from './UploadProgressRing';

export interface StripPhoto {
  /** Stable identity — the staged preview URL. */
  src: string;
  /** Live upload state — absent for local-only media (fixture mode). */
  status?: MediaUploadStatus;
  /** Byte progress 0..1; null = in flight, total unknown. */
  progress?: number | null;
  /** Canvas-editable (locally staged pixels). Remote URIs stay locked. */
  editable?: boolean;
}

interface SortablePhotoStripProps {
  photos: StripPhoto[];
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onEdit?: (index: number) => void;
  /** Retry affordance for tiles whose upload failed. */
  onRetryUpload?: (index: number) => void;
  /** Trailing "add" tile — hidden when false. */
  canAdd?: boolean;
  onAdd?: () => void;
  /** Highlights the add tile while files are dragged over the section. */
  fileDragActive?: boolean;
}

export function SortablePhotoStrip({
  photos,
  onReorder,
  onRemove,
  onEdit,
  onRetryUpload,
  canAdd,
  onAdd,
  fileDragActive,
}: SortablePhotoStripProps) {
  /** Index being reordered — drives the dragging opacity. */
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  /** Index hovered as a drop target — drives the ring. */
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  /** Reorder announcements for the polite live region. */
  const [announcement, setAnnouncement] = useState('');
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = (message: string) => {
    // Clearing first re-triggers the live region when consecutive moves
    // produce the same sentence (e.g. "Photo 2 moved to position 1" twice).
    setAnnouncement('');
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(message), 40);
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) {
      return;
    }
    onReorder(from, to);
    announce(
      `Photo ${from + 1} moved to position ${to + 1}${to === 0 ? ' — it is now the cover' : ''}.`,
    );
  };

  const clearDrag = () => {
    setDraggingIndex(null);
    setDropTarget(null);
  };

  const handleTileKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? -1
        : e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? 1
          : 0;
    if (!step) return;
    const to = i + step;
    if (to < 0 || to >= photos.length) return;
    e.preventDefault();
    move(i, to);
  };

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3"
        role="list"
        aria-label="Listing photos — first is the cover"
      >
        {photos.map((photo, i) => {
          const status = photo.status;
          const busy = status === 'uploading' || status === 'failed';
          return (
            <div
              key={photo.src}
              draggable
              tabIndex={0}
              role="listitem"
              aria-label={`Photo ${i + 1} of ${photos.length}${i === 0 ? ' — cover' : ''}${
                status === 'uploading' ? ', uploading' : ''
              }${status === 'failed' ? ', upload failed' : ''}. Use arrow keys to reorder.`}
              onKeyDown={(e) => handleTileKeyDown(e, i)}
              onDragStart={(e) => {
                setDraggingIndex(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingIndex != null) setDropTarget(i);
              }}
              onDragLeave={() => {
                if (dropTarget === i) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('text/plain');
                const from = draggingIndex ?? (raw ? Number(raw) : null);
                if (from != null && from !== i && Number.isFinite(from)) {
                  move(from, i);
                }
                clearDrag();
              }}
              className={`group relative cursor-grab overflow-hidden rounded-lg bg-surface-alt outline-none transition-opacity active:cursor-grabbing ${
                draggingIndex === i ? 'opacity-40' : ''
              } ${
                dropTarget === i && draggingIndex !== i
                  ? 'ring-2 ring-text-primary'
                  : 'focus-visible:ring-2 focus-visible:ring-text-primary'
              }`}
            >
              <AppImage
                src={photo.src}
                alt={`Listing photo ${i + 1}`}
                aspectRatio={0.8}
                sizes="(max-width: 640px) 33vw, 168px"
                imgClassName={busy ? 'opacity-60' : undefined}
              />
              {i === 0 ? (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-overlay px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-scrim-text-primary">
                  Cover
                </span>
              ) : null}

              {status ? (
                <UploadProgressRing
                  status={status}
                  progress={photo.progress}
                  onRetry={onRetryUpload ? () => onRetryUpload(i) : undefined}
                  label={
                    status === 'failed'
                      ? `Retry upload for photo ${i + 1}`
                      : `Uploading photo ${i + 1}`
                  }
                />
              ) : null}

              {photo.editable && onEdit && !busy ? (
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  aria-label={`Edit photo ${i + 1}`}
                  className="pressable absolute bottom-0 left-0 flex h-11 w-11 items-center justify-center"
                >
                  <Icon name="edit" size={16} className="text-scrim-text-primary drop-scrim" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="pressable absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
              >
                <Icon name="close" size={16} className="text-scrim-text-primary drop-scrim" />
              </button>
            </div>
          );
        })}

        {canAdd && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add more photos"
            className={`pressable flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors ${
              fileDragActive
                ? 'border-text-muted bg-surface-alt'
                : 'border-border text-text-muted hover:border-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon name="camera" size={22} />
            <span className="text-caption font-medium">Add</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
