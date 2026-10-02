'use client';

/**
 * PhotosSection — listing media authoring.
 * Empty state is a full-width dropzone; once photos exist the staged set
 * renders through SortablePhotoStrip (drag + arrow-key reorder, cover badge,
 * per-tile remove/edit/upload state). The quiet action row mirrors the
 * mobile media studio: library add, and camera capture where the browser
 * honestly supports it.
 */

import { useRef, useState } from 'react';
import {
  SortablePhotoStrip,
  type StripPhoto,
} from '@/components/media/SortablePhotoStrip';
import { isLocalMediaUri, isVideoUri } from '@/lib/utils/media';
import { MAX_PHOTOS } from './constants';
import { SellSection } from './SellSection';
import {
  PhotoAutoFillReview,
  type AutoFillControl,
  type AutoFillSuggestion,
} from './photos/PhotoAutoFillReview';
import { EmptyPhotoDropzone } from './photos/EmptyPhotoDropzone';
import { PhotoActionRow } from './photos/PhotoActionRow';

export type { AutoFillControl, AutoFillSuggestion };

/** Per-photo live-upload state, keyed by the staged preview URL. */
export interface PhotoMediaState {
  status?: 'uploading' | 'uploaded' | 'failed';
  /** Byte progress 0..1; null while the presigned total is unknown. */
  progress?: number | null;
  /** Staged media kind — 'image' when the slot was picked before kind
   *  tracking existed (or comes from a surface that only stages stills). */
  kind?: 'image' | 'video';
  /** Poster still preview for video slots (blob: uri or remote url). */
  poster?: string | null;
}

interface PhotosSectionProps {
  photos: string[];
  /** Live upload state per staged URL — absent in fixture mode. */
  media?: Record<string, PhotoMediaState>;
  error?: string;
  /** Camera entry is only rendered when the browser supports capture. */
  cameraSupported?: boolean;
  /** Assisted autofill — present only where the endpoint exists. */
  autoFill?: AutoFillControl;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onEdit?: (index: number) => void;
  onRetryUpload?: (index: number) => void;
  onTakePhoto?: () => void;
}

export function PhotosSection({
  photos,
  media,
  error,
  cameraSupported,
  autoFill,
  onAdd,
  onRemove,
  onReorder,
  onEdit,
  onRetryUpload,
  onTakePhoto,
}: PhotosSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(e.target.files ? Array.from(e.target.files) : []);
    e.target.value = '';
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingFiles(false);
    if (e.dataTransfer.files.length) {
      onAdd(Array.from(e.dataTransfer.files));
    }
  };

  const hasPhotos = photos.length > 0;
  const canAdd = photos.length < MAX_PHOTOS;

  const items: StripPhoto[] = photos.map((src) => {
    const m = media?.[src];
    return {
      src,
      kind: m?.kind ?? (isVideoUri(src) ? 'video' : 'image'),
      poster: m?.poster ?? null,
      status: m?.status,
      progress: m?.progress,
      // Canvas edits need readable pixels — blob:/data: images only, the
      // same gate mobile applies to non-manipulable remote media. A video
      // slot is never a canvas-edit target.
      editable: isLocalMediaUri(src) && m?.kind !== 'video',
    };
  });

  return (
    <SellSection
      id="sell-photos"
      step={1}
      title="Photos"
      subtitle={
        hasPhotos
          ? `${photos.length} of ${MAX_PHOTOS} — the first photo is your cover. Drag to reorder.`
          : `Add up to ${MAX_PHOTOS} photos or a video — the first photo is your cover.`
      }
    >
      {/* Shot list — mirrors the mobile photo-tips guidance */}
      <p className="mb-3 text-caption text-text-muted">
        Cover the essentials: <span className="font-medium text-text-secondary">front</span>,{' '}
        <span className="font-medium text-text-secondary">back</span>,{' '}
        <span className="font-medium text-text-secondary">label</span>, and{' '}
        <span className="font-medium text-text-secondary">any flaws</span> — honest photos sell
        faster and prevent disputes.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFiles}
        aria-label="Add listing photos or video"
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
          <EmptyPhotoDropzone
            draggingFiles={draggingFiles}
            cameraSupported={cameraSupported}
            onPick={pick}
            onTakePhoto={onTakePhoto}
          />
        ) : (
          <>
            <SortablePhotoStrip
              photos={items}
              onReorder={onReorder}
              onRemove={onRemove}
              onEdit={onEdit}
              onRetryUpload={onRetryUpload}
              canAdd={canAdd}
              onAdd={pick}
              fileDragActive={draggingFiles}
            />

            {/* Quiet action row — the mobile media-studio grammar. */}
            <PhotoActionRow
              canAdd={canAdd}
              cameraSupported={cameraSupported}
              onPick={pick}
              onTakePhoto={onTakePhoto}
            />

            {/* Assisted autofill */}
            {autoFill ? <PhotoAutoFillReview autoFill={autoFill} /> : null}
          </>
        )}
      </div>

      {error ? (
        <p id="sell-photos-error" role="alert" className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </SellSection>
  );
}
