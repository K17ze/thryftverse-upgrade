'use client';

/**
 * VisualSearchCamera — device-camera capture for /search/visual.
 *
 * The mobile visual-search entry can shoot a photo instead of picking
 * one; this is the web equivalent: a getUserMedia preview in a Sheet,
 * a shutter that frames the live stream into a JPEG File, and honest
 * failure states — unsupported browsers never see the entry point (the
 * dropzone feature-detects before rendering it), a denied permission
 * explains itself and offers retry, and a missing camera says so.
 * The captured file feeds the same pickFile pipeline as an upload —
 * nothing is simulated.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

type CameraStatus = 'starting' | 'ready' | 'denied' | 'unavailable' | 'error';

/** Map getUserMedia failures onto the honest states. */
function statusForError(err: unknown): CameraStatus {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    return 'unavailable';
  }
  return 'error';
}

export function VisualSearchCamera({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  /** Hands the captured frame upstream as a File — the same object the
   *  file input produces, so the analysis pipeline sees no difference. */
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    setStatus('starting');
    try {
      let stream: MediaStream;
      try {
        // Rear camera first — the photo-search subject is an item, not
        // the user. Laptops/desktops ignore the facingMode hint.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'environment' },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        } else {
          throw err;
        }
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('ready');
    } catch (err) {
      setStatus(statusForError(err));
    }
  }, []);

  // Open lifecycle — request on open, release every track on close.
  useEffect(() => {
    if (!open) return;
    setCapturing(false);
    void start();
    return stopStream;
  }, [open, start, stopStream]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || status !== 'ready' || capturing) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    setCapturing(true);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        onCapture(
          new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }),
        );
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Take a photo" maxWidth={560}>
      <div className="px-5 pb-6 pt-4">
        {/* Preview — a real stream or an honest status panel. The frame
            keeps the 4:3 camera grammar so it never reads as a broken
            image while the stream negotiates. */}
        <div className="relative overflow-hidden rounded-xl bg-surface-alt" style={{ aspectRatio: '4 / 3' }}>
          {/* The video element stays mounted across states — the stream
              attaches to it the moment permission resolves. */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            aria-label="Camera preview"
            className={`h-full w-full object-cover ${status === 'ready' ? '' : 'invisible'}`}
          />
          {status === 'starting' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
              <Icon name="camera" size={26} className="text-text-muted" />
              <p className="text-caption text-text-muted">Requesting camera…</p>
            </div>
          ) : null}
          {status === 'denied' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Icon name="eyeOff" size={24} className="text-text-muted" />
              <p className="text-body-emphasis font-semibold text-text-primary">
                Camera access is off
              </p>
              <p className="text-caption text-text-secondary">
                Allow camera access for this site in your browser settings, then
                try again — or upload a photo instead.
              </p>
            </div>
          ) : null}
          {status === 'unavailable' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Icon name="camera" size={24} className="text-text-muted" />
              <p className="text-body-emphasis font-semibold text-text-primary">
                No camera found
              </p>
              <p className="text-caption text-text-secondary">
                This device doesn&apos;t report a camera — upload or paste a
                photo instead.
              </p>
            </div>
          ) : null}
          {status === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Icon name="warning" size={24} className="text-text-muted" />
              <p className="text-body-emphasis font-semibold text-text-primary">
                Couldn&apos;t start the camera
              </p>
              <p className="text-caption text-text-secondary">
                Something interrupted the stream — try again or upload a photo
                instead.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          {status === 'ready' ? (
            /* Shutter — the camera control grammar: one round button, an
               outer ring and a filled core, 44px+ hit area. */
            <button
              type="button"
              onClick={capture}
              disabled={capturing}
              aria-label="Capture photo"
              className="pressable flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-text-primary disabled:opacity-50"
            >
              <span className="h-12 w-12 rounded-full bg-text-primary" />
            </button>
          ) : status === 'starting' ? null : (
            <Button variant="secondary" size="md" icon="refresh" onClick={() => void start()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
