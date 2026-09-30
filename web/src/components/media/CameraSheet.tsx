'use client';

/**
 * CameraSheet — device-camera capture for the listing media studio.
 *
 * getUserMedia live preview → canvas frame capture → staged photo, the web
 * counterpart of the mobile ListingCameraSheet. Every shutter tap stages
 * into a tray (mobile multi-capture pattern); "Add" commits the batch.
 * State coverage is honest: requesting / live / permission-denied / no
 * usable camera, and the whole entry is feature-detected — hosts should
 * only offer it when `isCameraCaptureSupported()` is true.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { captureVideoFrame } from '@/lib/media/imageEdit';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';

// Re-exported for existing importers — the canonical home is the tiny
// cameraSupport module so capability-only consumers skip this graph.
export { isCameraCaptureSupported };

type CameraPhase =
  | 'starting' // permission request / stream spin-up
  | 'live'
  | 'denied' // NotAllowedError — permission refused (honest, not retryable by us)
  | 'error'; // no device, over-constrained, hardware busy

interface CameraSheetProps {
  open: boolean;
  onClose: () => void;
  /** Committed batch — the caller stages them like file-picked photos. */
  onCapture: (files: File[]) => void;
  /** Slots left in the media set — the shutter refuses past the cap. */
  remainingSlots: number;
}

export function CameraSheet({ open, onClose, onCapture, remainingSlots }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<CameraPhase>('starting');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  /** Flip is only offered when the device reports a second video input. */
  const [canFlip, setCanFlip] = useState(false);
  const [tray, setTray] = useState<{ url: string; file: File }[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState('');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(
    async (wantFacing: 'environment' | 'user') => {
      stopStream();
      setPhase('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: wantFacing } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setFacing(wantFacing);
        setPhase('live');
        // Flip affordance is real capability-gating: enumerate only after
        // permission, show the control when a second input exists.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setCanFlip(false);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setPhase('denied');
        } else if (wantFacing === 'environment') {
          // No rear camera (laptop) — fall back to the default input once.
          void startStream('user');
        } else {
          setPhase('error');
        }
      }
    },
    [stopStream],
  );

  // Open → start; close/unmount → release the hardware and the tray refs.
  useEffect(() => {
    if (!open) return;
    setTray((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.url));
      return [];
    });
    setNotice('');
    void startStream('environment');
    return () => {
      stopStream();
      setTray((prev) => {
        prev.forEach((c) => URL.revokeObjectURL(c.url));
        return [];
      });
    };
  }, [open, startStream, stopStream]);

  const flipCamera = () => {
    void startStream(facing === 'environment' ? 'user' : 'environment');
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || capturing) return;
    if (tray.length >= remainingSlots) {
      setNotice(`That's the last slot — add these photos or remove one first.`);
      return;
    }
    setCapturing(true);
    try {
      const blob = await captureVideoFrame(video);
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setTray((t) => [...t, { url: URL.createObjectURL(blob), file }]);
      setNotice(`Photo ${tray.length + 1} captured.`);
    } catch {
      setNotice('The photo could not be captured — try again.');
    } finally {
      setCapturing(false);
    }
  };

  const removeTrayItem = (index: number) => {
    setTray((t) => {
      const item = t[index];
      if (item) URL.revokeObjectURL(item.url);
      return t.filter((_, i) => i !== index);
    });
  };

  const commit = () => {
    if (!tray.length) return;
    const files = tray.map((c) => c.file);
    // Ownership passes to the caller's staged photos — revoke our preview
    // refs, the host creates its own.
    setTray((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.url));
      return [];
    });
    onCapture(files);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Take a photo" maxWidth={640}>
      <div className="px-5 pb-6 pt-1">
        <p className="sr-only" role="status" aria-live="polite">
          {notice}
        </p>

        {/* Viewfinder — live video preview, never a static placeholder. */}
        <div className="relative overflow-hidden rounded-lg bg-surface-alt">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
            className={`aspect-[4/5] w-full object-cover sm:aspect-[4/3] ${
              facing === 'user' ? '-scale-x-100' : ''
            } ${phase === 'live' ? '' : 'invisible absolute'}`}
          />

          {phase !== 'live' ? (
            <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 px-6 text-center sm:aspect-[4/3]">
              {phase === 'starting' ? (
                <>
                  <Spinner size={24} tone="neutral" />
                  <p className="text-caption text-text-muted">Starting the camera…</p>
                </>
              ) : phase === 'denied' ? (
                <>
                  <Icon name="camera" size={28} className="text-text-muted" />
                  <p className="text-body-emphasis font-medium text-text-primary">
                    Camera access is off
                  </p>
                  <p className="max-w-xs text-caption text-text-secondary">
                    Allow camera access in your browser settings to take a photo — or add
                    photos from your files instead.
                  </p>
                </>
              ) : (
                <>
                  <Icon name="warning" size={26} className="text-text-muted" />
                  <p className="text-body-emphasis font-medium text-text-primary">
                    No camera available
                  </p>
                  <p className="max-w-xs text-caption text-text-secondary">
                    This device didn&apos;t give us a camera. You can still add photos from
                    your files.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void startStream(facing)}
                  >
                    Try again
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {phase === 'live' && canFlip ? (
            <IconButton
              name="refresh"
              onMedia
              onClick={flipCamera}
              aria-label="Switch camera"
              className="absolute right-1 top-1"
              size={20}
            />
          ) : null}
        </div>

        {/* Capture row — shutter centred, quiet count on the side. */}
        {phase === 'live' ? (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void capture()}
              disabled={capturing || tray.length >= remainingSlots}
              aria-label="Capture photo"
              className="pressable flex h-16 w-16 items-center justify-center rounded-full border-4 border-text-primary disabled:opacity-40"
            >
              <span className="h-12 w-12 rounded-full bg-text-primary" aria-hidden />
            </button>
          </div>
        ) : null}

        {/* Capture tray — the multi-capture staging pattern from mobile. */}
        {tray.length > 0 ? (
          <div className="mt-4" role="list" aria-label="Captured photos">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {tray.map((c, i) => (
                <div key={c.url} role="listitem" className="relative h-20 w-16 shrink-0">
                  <AppImage
                    src={c.url}
                    alt={`Captured photo ${i + 1}`}
                    className="h-full w-full rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => removeTrayItem(i)}
                    aria-label={`Discard captured photo ${i + 1}`}
                    className="pressable absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-overlay"
                  >
                    <Icon name="close" size={12} className="text-scrim-text-primary" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={commit}
            disabled={!tray.length}
          >
            {tray.length > 1 ? `Add ${tray.length} photos` : 'Add photo'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
