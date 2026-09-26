'use client';

/**
 * VisualSearchQueryPanel — the photo's persistent column once uploaded.
 * Preview (or the region picker when framing), file meta, and the three
 * actions: Frame area / Replace / Remove. Mirrors mobile's
 * VisualSearchQueryHeader — no scanlines or corner brackets, the backend
 * equivalent here is a colour heuristic, not AI.
 */

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { VisualSearchRegionPicker } from './VisualSearchRegionPicker';
import type { VisualSearchRegion } from './visualSearchTypes';

interface VisualSearchQueryPanelProps {
  previewUrl: string;
  fileName: string;
  fileSize: number;
  framing: boolean;
  onToggleFraming: () => void;
  region: VisualSearchRegion | null;
  onCommitRegion: (region: VisualSearchRegion | null) => void;
  onReplace: (file: File) => void;
  onRemove: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function VisualSearchQueryPanel({
  previewUrl,
  fileName,
  fileSize,
  framing,
  onToggleFraming,
  region,
  onCommitRegion,
  onReplace,
  onRemove,
}: VisualSearchQueryPanelProps) {
  const replaceRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {framing ? (
        <VisualSearchRegionPicker
          imageUrl={previewUrl}
          region={region}
          onCommit={onCommitRegion}
        />
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-surface-alt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Your photo"
            className="block aspect-[4/5] w-full object-cover"
          />
        </div>
      )}

      <p className="clamp-1 mt-2 text-caption text-text-muted">
        {fileName} · <span className="tnum">{formatBytes(fileSize)}</span>
      </p>

      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleFraming}
          aria-pressed={framing}
          className={`pressable flex items-center gap-1.5 rounded-md px-2.5 py-2 text-caption font-medium ${
            framing || region ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
          } hover:bg-surface-alt`}
        >
          <Icon name="scan" size={16} />
          {framing ? 'Done' : region ? 'Edit frame' : 'Frame area'}
        </button>
        <button
          type="button"
          onClick={() => replaceRef.current?.click()}
          className="pressable flex items-center gap-1.5 rounded-md px-2.5 py-2 text-caption font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
        >
          <Icon name="repeat" size={16} />
          Replace
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="pressable flex items-center gap-1.5 rounded-md px-2.5 py-2 text-caption font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
        >
          <Icon name="trash" size={16} />
          Remove
        </button>
      </div>

      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onReplace(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
