'use client';

/**
 * VisualSearchDropzone — the idle state of /search/visual.
 * One dominant object: a dashed upload target accepting click-to-browse,
 * keyboard focus and drag-drop. Validation errors land inline under it.
 */

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ERROR_COPY, MAX_FILE_BYTES } from './visualSearchTypes';
import type { VisualSearchErrorKind } from './visualSearchTypes';

interface VisualSearchDropzoneProps {
  error: VisualSearchErrorKind | null;
  onPick: (file: File) => void;
}

const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

export function VisualSearchDropzone({ error, onPick }: VisualSearchDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  };

  const copy = error ? ERROR_COPY[error] : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={handleDrop}
        aria-label="Upload a photo to search"
        className={`pressable flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center transition-colors sm:py-20 ${
          dragging
            ? 'border-text-muted bg-surface-alt'
            : 'border-border bg-surface hover:bg-surface-alt'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-text-primary">
          <Icon name="camera" size={26} />
        </span>
        <span className="mt-4 text-body-emphasis font-semibold text-text-primary">
          {dragging ? 'Drop to search' : 'Drop a photo, or browse'}
        </span>
        <span className="mt-1 text-caption text-text-muted">
          JPG, PNG, WebP or AVIF · up to {MAX_MB} MB
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          // Reset so picking the same file twice still fires onChange.
          e.target.value = '';
        }}
      />

      {copy ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3" role="alert">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-danger-text" />
          <div className="min-w-0">
            <p className="text-body font-semibold text-text-primary">{copy.title}</p>
            <p className="mt-0.5 text-caption text-text-secondary">{copy.body}</p>
          </div>
        </div>
      ) : null}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={14} />
        Analysed on this device — your photo is never uploaded.
      </p>
    </div>
  );
}
