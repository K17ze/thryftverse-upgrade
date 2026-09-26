'use client';

/**
 * PhotosSection — listing media authoring.
 * Empty state is a full-width dropzone; once photos exist it becomes a
 * compact grid tile. First photo is the cover; tiles support HTML5 drag
 * reorder and file drag-and-drop.
 */

import { useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { MAX_PHOTOS } from './constants';
import { SellSection } from './SellSection';

interface PhotosSectionProps {
  photos: string[];
  error?: string;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

export function PhotosSection({ photos, error, onAdd, onRemove, onReorder }: PhotosSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(e.target.files);
    e.target.value = '';
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingFiles(false);
    if (e.dataTransfer.files.length) {
      onAdd(e.dataTransfer.files);
      return;
    }
    const from = dragFrom.current;
    if (from != null) dragFrom.current = null;
  };

  const hasPhotos = photos.length > 0;
  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <SellSection
      id="sell-photos"
      step={1}
      title="Photos"
      subtitle={
        hasPhotos
          ? `${photos.length} of ${MAX_PHOTOS} — first photo is your cover. Drag to reorder.`
          : `Add up to ${MAX_PHOTOS} photos — the first is your cover.`
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
        aria-label="Add listing photos"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) setDraggingFiles(true);
        }}
        onDragLeave={() => setDraggingFiles(false)}
        onDrop={handleContainerDrop}
      >
        {!hasPhotos ? (
          <button
            type="button"
            onClick={pick}
            className={`pressable flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors ${
              draggingFiles
                ? 'border-text-muted bg-surface-alt'
                : 'border-border hover:border-text-muted'
            }`}
          >
            <Icon name="camera" size={28} className="text-text-muted" />
            <span className="text-body-emphasis font-medium text-text-primary">Add photos</span>
            <span className="text-caption text-text-muted">
              Drag and drop or browse — good light sells faster
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            {photos.map((src, i) => (
              <div
                key={src}
                draggable
                onDragStart={(e) => {
                  dragFrom.current = i;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData('text/plain');
                  const from = dragFrom.current ?? (raw ? Number(raw) : null);
                  if (from != null && from !== i && Number.isFinite(from)) {
                    onReorder(from, i);
                  }
                  dragFrom.current = null;
                }}
                className="group relative cursor-grab overflow-hidden rounded-lg bg-surface-alt active:cursor-grabbing"
              >
                <AppImage
                  src={src}
                  alt={`Listing photo ${i + 1}`}
                  aspectRatio={0.8}
                  sizes="(max-width: 640px) 33vw, 168px"
                />
                {i === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-overlay px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-scrim-text-primary">
                    Cover
                  </span>
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
            ))}

            {canAdd ? (
              <button
                type="button"
                onClick={pick}
                aria-label="Add more photos"
                className={`pressable flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors ${
                  draggingFiles
                    ? 'border-text-muted bg-surface-alt'
                    : 'border-border text-text-muted hover:border-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon name="camera" size={22} />
                <span className="text-caption font-medium">Add</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </SellSection>
  );
}
