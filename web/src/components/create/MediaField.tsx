'use client';

/**
 * MediaField — the create flow's media stage. Pick → presign → PUT →
 * finalize runs through uploadMediaFile (the verified upload flow), so the
 * composer always holds a durable receipt the publish routes can verify.
 * Preview renders the local blob immediately and upgrades to the receipt's
 * public URL once finalized.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadMediaFile } from '@/lib/api/services/uploads';
import type { StagedMediaReceipt } from '@/lib/api/services/creator';
import { parseApiError } from '@/lib/api/http';
import { Icon } from '@/components/ui/Icon';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';
import { CreateCameraSheet } from './CreateCameraSheet';

export interface StagedMedia {
  /** Blob URL while local, receipt publicUrl once finalized, or a remote
   *  URL seeded from a draft. */
  previewUrl: string;
  mediaType: 'image' | 'video';
  /** Durable upload receipt — null when the media came from a draft row
   *  (URL only, no receipt) or the upload hasn't finished. */
  receipt: StagedMediaReceipt | null;
  uploading: boolean;
  /** 0..1 during the byte PUT; null = indeterminate. */
  progress: number | null;
  error: string | null;
}

interface StagedMediaState {
  media: StagedMedia | null;
  /** Seed from a resumed draft — remote media; pass the cached upload
   *  receipt when one survives locally (poster drafts), else null. */
  seed: (previewUrl: string, mediaType: 'image' | 'video', receipt?: StagedMediaReceipt | null) => void;
  pick: (file: File) => void;
  clear: () => void;
}

export function useStagedMedia(purpose: 'look' | 'poster'): StagedMediaState {
  const [media, setMedia] = useState<StagedMedia | null>(null);
  const blobRef = useRef<string | null>(null);
  const runRef = useRef(0);

  const revokeBlob = useCallback(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  }, []);

  useEffect(() => revokeBlob, [revokeBlob]);

  const seed = useCallback(
    (previewUrl: string, mediaType: 'image' | 'video', receipt: StagedMediaReceipt | null = null) => {
      runRef.current += 1;
      revokeBlob();
      setMedia({
        previewUrl,
        mediaType,
        receipt,
        uploading: false,
        progress: null,
        error: null,
      });
    },
    [revokeBlob],
  );

  const clear = useCallback(() => {
    runRef.current += 1;
    revokeBlob();
    setMedia(null);
  }, [revokeBlob]);

  const pick = useCallback(
    (file: File) => {
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      revokeBlob();
      const previewUrl = URL.createObjectURL(file);
      blobRef.current = previewUrl;
      const run = ++runRef.current;
      setMedia({ previewUrl, mediaType, receipt: null, uploading: true, progress: 0, error: null });

      uploadMediaFile(file, purpose, (ratio) => {
        if (runRef.current !== run) return;
        setMedia((m) => (m ? { ...m, progress: ratio } : m));
      })
        .then((result) => {
          if (runRef.current !== run) return;
          setMedia({
            previewUrl: result.publicUrl,
            mediaType: result.contentType.startsWith('video/') ? 'video' : 'image',
            receipt: {
              publicUrl: result.publicUrl,
              finalizationId: result.finalizationId,
              mediaAssetId: result.mediaAssetId,
              mediaType: result.contentType.startsWith('video/') ? 'video' : 'image',
            },
            uploading: false,
            progress: null,
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (runRef.current !== run) return;
          setMedia((m) =>
            m
              ? {
                  ...m,
                  uploading: false,
                  progress: null,
                  error: parseApiError(error, 'The upload failed').message,
                }
              : m,
          );
        });
    },
    [purpose, revokeBlob],
  );

  return { media, seed, pick, clear };
}

// ── Presentation ──────────────────────────────────────────────────────────

interface MediaFieldProps {
  id: string;
  media: StagedMedia | null;
  /** e.g. 'look' | 'poster' — controls the upload folder/scope. */
  disabled?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  /** Rendered over the staged media (e.g. the look's tag pins). */
  overlay?: React.ReactNode;
}

export function MediaField({ id, media, disabled, onPick, onClear, overlay }: MediaFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  /** getUserMedia is a secure-context, post-mount capability — the capture
   *  affordance renders only once support is actually detected, so SSR and
   *  unsupported browsers see the upload path and never a dead button. */
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    setCameraSupported(isCameraCaptureSupported());
  }, []);

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />

      {media ? (
        <figure className="relative w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-alt">
          {media.mediaType === 'video' ? (
            <video
              src={media.previewUrl}
              className="aspect-[4/5] w-full object-cover"
              muted
              playsInline
              controls={!media.uploading}
            />
          ) : (
            // Local blob/remote preview — plain img so blob: URLs render.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.previewUrl}
              alt="Selected media preview"
              className="aspect-[4/5] w-full object-cover"
            />
          )}

          {overlay}

          {media.uploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-media-overlay-scrim">
              <span className="text-caption font-medium text-scrim-text-primary">Uploading…</span>
              <span className="h-1 w-40 overflow-hidden rounded-full bg-scrim-text-tertiary">
                <span
                  className={`block h-full bg-scrim-text-primary transition-[width] ${
                    media.progress == null ? 'animate-pulse w-1/3' : ''
                  }`}
                  style={media.progress != null ? { width: `${Math.round(media.progress * 100)}%` } : undefined}
                />
              </span>
            </div>
          ) : null}

          {!media.uploading ? (
            <div className="absolute right-2 top-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                aria-label="Replace media"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary"
              >
                <Icon name="camera" size={17} />
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                aria-label="Remove media"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
          ) : null}
        </figure>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="pressable flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-alt/60 text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
          >
            <Icon name="camera" size={26} />
            <span className="text-body-emphasis font-medium">Add photo or video</span>
            <span className="text-caption text-text-muted">Uploaded securely before publishing</span>
          </button>
          {/* Camera capture — the mobile camera-first entry's web
              counterpart; captured frames stage through the same pick()
              path as a file. Only offered where a camera is real. */}
          {cameraSupported && !disabled ? (
            <div className="mt-1 flex justify-center">
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="pressable flex h-11 items-center gap-2 rounded-md px-3 text-body font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                <Icon name="camera" size={18} />
                Take a photo
              </button>
            </div>
          ) : null}
        </div>
      )}

      {cameraSupported ? (
        <CreateCameraSheet
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(files) => {
            setCameraOpen(false);
            if (files[0]) onPick(files[0]);
          }}
          remainingSlots={1}
        />
      ) : null}

      {media?.error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-caption text-danger-text">
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          <span>
            {media.error}{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => inputRef.current?.click()}
            >
              Try again
            </button>
          </span>
        </p>
      ) : null}
    </div>
  );
}
