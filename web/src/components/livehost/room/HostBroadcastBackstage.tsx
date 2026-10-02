'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatScheduled } from '@/components/live/UpcomingRail';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { HostLotBoard } from '../HostLotBoard';

interface HostBroadcastBackstageProps {
  session: LiveSession;
  attachPreview: (el: HTMLVideoElement | null) => void;
  cameraCheck: 'idle' | 'requesting' | 'on' | 'denied';
  startCameraCheck: () => Promise<void>;
  stopCameraCheck: () => void;
  goLive: () => Promise<void>;
  goingLive: boolean;
  goLiveError: string | null;
}

export function HostBroadcastBackstage({
  session,
  attachPreview,
  cameraCheck,
  startCameraCheck,
  stopCameraCheck,
  goLive,
  goingLive,
  goLiveError,
}: HostBroadcastBackstageProps) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-4 sm:px-6 lg:max-w-[1200px]">
      <div className="flex items-center gap-2">
        <Link
          href="/live"
          aria-label="Back to live hub"
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="clamp-1 min-w-0 flex-1 text-section-title font-semibold text-text-primary">
          {session.title}
        </h1>
        <span className="shrink-0 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold uppercase tracking-wide text-text-secondary">
          {session.scheduledAt ? 'Scheduled' : 'Not live'}
        </span>
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-10">
        <div className="min-w-0">
          {/* Camera check — a local getUserMedia preview. The caption
              carries the honesty: nothing leaves the device. */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-surface-alt">
            <video
              ref={attachPreview}
              muted
              playsInline
              autoPlay
              aria-label="Local camera preview"
              className={`h-full w-full object-cover ${
                cameraCheck === 'on' ? '' : 'hidden'
              }`}
            />
            {cameraCheck !== 'on' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <Icon name="videocam" size={28} className="text-text-muted" />
                <p className="max-w-xs text-caption text-text-secondary">
                  {cameraCheck === 'denied'
                    ? 'Camera access was denied — allow it in the browser, or skip ahead and go live anyway.'
                    : 'Check your framing before you go live. The preview is local — nothing is broadcast yet.'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="camera"
                  onClick={() => void startCameraCheck()}
                >
                  {cameraCheck === 'denied' ? 'Try again' : 'Check camera & mic'}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={stopCameraCheck}
                aria-label="Stop camera preview"
                className="pressable absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          <div className="mt-6">
            <HostLotBoard sessionId={session.id} live={false} />
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-20">
          {session.scheduledAt ? (
            <p className="mt-5 text-body text-text-secondary lg:mt-0">
              Airing {formatScheduled(session.scheduledAt)} — it sits under
              Coming up on web and mobile until you start.
            </p>
          ) : (
            <p className="mt-5 text-body text-text-secondary lg:mt-0">
              The room is ready — go live when you are. Followers and
              reminder-holders get notified on start.
            </p>
          )}
          <Button
            variant="danger"
            size="lg"
            fullWidth
            onClick={() => void goLive()}
            disabled={goingLive}
            className="mt-4"
          >
            {goingLive ? 'Going live…' : 'Go live now'}
          </Button>
          {goLiveError ? (
            <p role="alert" className="mt-2 text-caption text-danger-text">
              {goLiveError}
            </p>
          ) : null}
          <p className="mt-3 text-meta text-text-muted">
            Going live opens the broadcast room and asks for camera and mic
            access — the session still runs chat and lots if you decline.
          </p>
        </div>
      </div>
    </div>
  );
}
