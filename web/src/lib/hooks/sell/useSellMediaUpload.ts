'use client';

/**
 * useSellMediaUpload — manages media staging, local previews, camera
 * captures, photo transformations, and the verified presign→PUT→finalize
 * pipeline for listing creation and editing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as uploadsService from '@/lib/api/services/uploads';
import {
  captureVideoPoster,
  isLocalMediaUri,
  probeImageDimensions,
} from '@/lib/utils/media';
import { MAX_PHOTOS } from '@/components/sell/constants';
import type { PhotoMediaState } from '@/components/sell/PhotosSection';

export interface ResolvedMedia {
  sourceUrl: string;
  /** The verified object URL — the same publicUrl finalize returned. */
  publicUrl: string;
  /** Finalization receipt id — required by create cover + attach. */
  finalizationId?: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  /** Uploaded poster still for video media. */
  posterUrl?: string | null;
  /** True when the URI is a media row already attached to the listing
   *  being edited — publish must not re-upload or re-attach it. */
  alreadyAttached?: boolean;
}

export interface PhotoMediaEntry extends PhotoMediaState {
  publicUrl?: string;
  finalizationId?: string;
  /** Media already attached to the listing under edit — never re-uploaded. */
  existingRemote?: boolean;
  /** The picked file's real name — the primary evidence input for the
   *  listing-intelligence run (the heuristic reads filenames, not pixels). */
  fileName?: string;
  /** The fully resolved publish record once the upload lands. */
  resolved?: ResolvedMedia;
  /** In-flight upload — publish dedupes onto it rather than re-PUTting. */
  promise?: Promise<ResolvedMedia>;
  /** The backend's real failure text — the tile retry affordance and
   *  publish error surface read it, never a paraphrase. */
  failure?: string;
}

interface UseSellMediaUploadOptions {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  onClearPhotoError?: () => void;
  onResetAutoFill?: () => void;
}

export function useSellMediaUpload({
  photos,
  onPhotosChange,
  onClearPhotoError,
  onResetAutoFill,
}: UseSellMediaUploadOptions) {
  const [mediaByUrl, setMediaByUrl] = useState<Record<string, PhotoMediaEntry>>({});
  const mediaRef = useRef<Record<string, PhotoMediaEntry>>({});
  const photosRef = useRef<string[]>([]);
  const committedRef = useRef(new Set<string>());

  photosRef.current = photos;

  // Revoke preview object URLs on unmount unless committed to published listing
  useEffect(
    () => () => {
      photosRef.current.forEach((url) => {
        if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
      });
    },
    [],
  );

  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const updateMedia = useCallback((url: string, patch: Partial<PhotoMediaEntry> | null) => {
    const next = { ...mediaRef.current };
    if (patch == null) delete next[url];
    else next[url] = { ...(next[url] as PhotoMediaEntry | undefined), ...patch } as PhotoMediaEntry;
    mediaRef.current = next;
    setMediaByUrl(next);
  }, []);

  const mediaOf = useCallback(
    (src: string): PhotoMediaEntry | undefined => mediaRef.current[src],
    [],
  );

  /**
   * Resolve one staged URI for publish:
   *  - media already attached to the listing under edit passes through untouched,
   *  - fixture mode resolves the local URI as-is,
   *  - fresh local blobs run the verified presign→PUT→finalize pipeline.
   */
  const ensureMediaUpload = useCallback(
    (url: string): Promise<ResolvedMedia> => {
      const existing = mediaRef.current[url];
      if (existing?.resolved) return Promise.resolve(existing.resolved);
      if (existing?.promise) return existing.promise;

      if (!isLocalMediaUri(url) && existing?.existingRemote) {
        const resolved: ResolvedMedia = {
          sourceUrl: url,
          publicUrl: url,
          kind: existing.kind ?? 'image',
          posterUrl: existing.poster ?? null,
          alreadyAttached: true,
        };
        updateMedia(url, { resolved });
        return Promise.resolve(resolved);
      }

      if (DATA_MODE !== 'live') {
        const resolved: ResolvedMedia = {
          sourceUrl: url,
          publicUrl: url,
          kind: existing?.kind ?? 'image',
          posterUrl: existing?.poster ?? null,
        };
        return Promise.resolve(resolved);
      }

      const promise = (async (): Promise<ResolvedMedia> => {
        const blob = await (await fetch(url)).blob();
        const contentType = blob.type || 'image/jpeg';
        const kind: 'image' | 'video' = contentType.startsWith('video/') ? 'video' : 'image';
        const ext =
          contentType === 'image/png'
            ? 'png'
            : contentType === 'image/webp'
              ? 'webp'
              : kind === 'video'
                ? (contentType.split('/')[1] ?? 'mp4')
                : 'jpg';
        const file = new File([blob], `listing-media.${ext}`, { type: contentType });
        const uploaded = await uploadsService.uploadMediaFile(file, 'listing', (ratio) => {
          updateMedia(url, { status: 'uploading', progress: ratio });
        });

        let width = uploaded.width ?? null;
        let height = uploaded.height ?? null;
        let posterUrl: string | null = null;

        if (kind === 'video') {
          const poster = await captureVideoPoster(blob);
          if (poster) {
            width = width ?? poster.width;
            height = height ?? poster.height;
            updateMedia(url, { poster: URL.createObjectURL(poster.blob) });
            try {
              const posterUpload = await uploadsService.uploadMediaFile(
                new File([poster.blob], 'listing-poster.jpg', { type: 'image/jpeg' }),
                'poster',
              );
              posterUrl = posterUpload.publicUrl;
            } catch {
              posterUrl = null;
            }
          }
        } else if (width == null || height == null) {
          const dims = await probeImageDimensions(blob);
          width = width ?? dims?.width ?? null;
          height = height ?? dims?.height ?? null;
        }

        return {
          sourceUrl: url,
          publicUrl: uploaded.publicUrl,
          finalizationId: uploaded.finalizationId,
          kind,
          width,
          height,
          blurhash: uploaded.blurhash ?? null,
          posterUrl,
        };
      })();

      updateMedia(url, { status: 'uploading', progress: 0, promise });

      promise
        .then((resolved) =>
          updateMedia(url, {
            status: 'uploaded',
            progress: 1,
            publicUrl: resolved.publicUrl,
            finalizationId: resolved.finalizationId,
            kind: resolved.kind,
            resolved,
          }),
        )
        .catch((err) =>
          updateMedia(url, {
            status: 'failed',
            progress: null,
            promise: undefined,
            failure: parseApiError(err, 'Upload failed').message,
          }),
        );

      return promise;
    },
    [updateMedia],
  );

  const addPhotos = (files: File[] | null) => {
    if (!files?.length) return;
    const mediaFiles = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    );
    if (!mediaFiles.length) return;
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    const staged = mediaFiles.slice(0, room);
    const kept = staged.map((f) => URL.createObjectURL(f));
    if (!kept.length) return;

    kept.forEach((url, i) => {
      updateMedia(url, {
        kind: staged[i].type.startsWith('video/') ? 'video' : 'image',
        fileName: staged[i].name,
      });
    });

    onPhotosChange([...photos, ...kept]);
    kept.forEach((url) => void ensureMediaUpload(url));
    onClearPhotoError?.();
  };

  const removePhoto = (index: number) => {
    const url = photos[index];
    if (url) {
      URL.revokeObjectURL(url);
      updateMedia(url, null);
    }
    const remaining = photos.filter((_, i) => i !== index);
    onPhotosChange(remaining);
    if (remaining.length <= 0) {
      onResetAutoFill?.();
    }
  };

  const retryPhotoUpload = (index: number) => {
    const url = photos[index];
    if (!url) return;
    updateMedia(url, null);
    void ensureMediaUpload(url);
  };

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length)
      return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    onPhotosChange(next);
  };

  const applyEditedPhoto = (blob: Blob) => {
    if (editIndex == null) return;
    const index = editIndex;
    const old = photos[index];
    const file = new File([blob], `photo-${index + 1}.jpg`, { type: blob.type });
    const nextUrl = URL.createObjectURL(file);
    if (old && !committedRef.current.has(old)) URL.revokeObjectURL(old);
    if (old) updateMedia(old, null);
    updateMedia(nextUrl, { kind: 'image', fileName: file.name });
    onPhotosChange(photos.map((p, i) => (i === index ? nextUrl : p)));
    void ensureMediaUpload(nextUrl);
    setEditIndex(null);
  };

  const revokeAllUncommitted = useCallback(() => {
    photosRef.current.forEach((url) => {
      if (!committedRef.current.has(url)) URL.revokeObjectURL(url);
    });
  }, []);

  return {
    mediaByUrl,
    mediaRef,
    committedRef,
    mediaOf,
    updateMedia,
    ensureMediaUpload,
    addPhotos,
    removePhoto,
    retryPhotoUpload,
    reorderPhotos,
    applyEditedPhoto,
    editIndex,
    setEditIndex,
    cameraOpen,
    setCameraOpen,
    revokeAllUncommitted,
  };
}
