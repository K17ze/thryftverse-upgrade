'use client';

/**
 * VisualSearchDropzone — the idle state of /search/visual.
 * One dominant object: a dashed upload target accepting click-to-browse,
 * keyboard focus, clipboard paste and drag-drop — plus a pasted-URL input
 * for images that live at a link (Google Lens grammar). Devices with a
 * camera get a capture affordance too — the same getUserMedia flow the
 * mobile "take a photo" entry uses. Validation errors land inline.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { ERROR_COPY, MAX_FILE_BYTES } from './visualSearchTypes';
import type { VisualSearchErrorKind } from './visualSearchTypes';

// Camera capture — mounts only behind the "Take a photo" action (and only
// where getUserMedia is real), so the getUserMedia graph stays out of the
// visual-search entry bundle.
const VisualSearchCamera = dynamic(
  () => import('./VisualSearchCamera').then((m) => m.VisualSearchCamera),
  { ssr: false },
);

interface VisualSearchDropzoneProps {
  error: VisualSearchErrorKind | null;
  onPick: (file: File) => void;
  /** Pasted image URL — the hook fetches and runs the same pipeline. */
  onPickUrl: (url: string) => void;
  /** A remote image is being fetched — the URL row is briefly disabled. */
  urlLoading?: boolean;
}

const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

const URL_FIELD =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

export function VisualSearchDropzone({
  error,
  onPick,
  onPickUrl,
  urlLoading,
}: VisualSearchDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  /** getUserMedia is a secure-context, post-mount capability — the camera
   *  button only renders once support is actually detected, so SSR and
   *  unsupported browsers never see a dead affordance. */
  const [cameraSupported, setCameraSupported] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    setCameraSupported(
      window.isSecureContext === true &&
        typeof navigator.mediaDevices?.getUserMedia === 'function',
    );
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  };

  /** Clipboard images paste straight in — the same pick as a file. */
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData?.files?.[0];
    if (file) {
      e.preventDefault();
      onPick(file);
    }
  };

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onPickUrl(url);
  };

  const copy = error ? ERROR_COPY[error] : null;

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-2xl" onPaste={handlePaste}>
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
        aria-label="Upload or paste a photo to search"
        className={`pressable flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center transition-colors sm:py-20 ${
          dragging
            ? 'border-text-muted bg-surface-alt'
            : 'border-border bg-surface hover:bg-surface-alt'
        }`}
      >
        <Icon name="camera" size={30} className="text-text-primary" />
        <span className="mt-3.5 text-body-emphasis font-semibold text-text-primary">
          {dragging ? 'Drop to search' : 'Drop, paste or browse a photo'}
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

      {/* Camera capture — rendered only where a camera is real. */}
      {cameraSupported ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="pressable flex min-h-11 items-center gap-2 rounded-md px-3 text-body font-medium text-text-secondary hover:text-text-primary"
          >
            <Icon name="camera" size={17} />
            Take a photo
          </button>
        </div>
      ) : null}

      {/* Image-link entry — Google Lens grammar: a photo can be an URL. */}
      <form onSubmit={submitUrl} className="mt-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="link"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste an image link"
            aria-label="Image URL"
            disabled={urlLoading}
            className={`${URL_FIELD} pl-9 disabled:opacity-50`}
          />
        </div>
        <button
          type="submit"
          disabled={!url.trim() || urlLoading}
          className="pressable h-11 shrink-0 rounded-lg bg-surface-alt px-4 text-body font-semibold text-text-primary hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-40"
        >
          {urlLoading ? 'Loading…' : 'Search'}
        </button>
      </form>

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
        {DATA_MODE === 'live'
          ? 'Uploaded for matching — colour analysis runs on ThryftVerse servers.'
          : 'Analysed on this device — your photo is never uploaded.'}
      </p>

      <VisualSearchCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onPick}
      />
    </div>
  );
}
