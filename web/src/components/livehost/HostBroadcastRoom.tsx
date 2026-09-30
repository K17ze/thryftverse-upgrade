'use client';

/**
 * HostBroadcastRoom — the live-mode host room once the session is
 * resolved and host authority proven. Three phases, mirroring the mobile
 * seller screen:
 *
 *  - backstage: scheduled/created session — the real lot queue, an
 *    optional local camera check (getUserMedia only, nothing is
 *    published), and the Go live control wired to POST /:id/start.
 *  - live: the device's own published LiveKit track on stage (muted,
 *    playsInline), LIVE + viewer + elapsed chrome, mic/camera toggles,
 *    the lot board, real chat and viewer moderation.
 *  - ended: the server's totals when live.session.ended delivered them.
 *
 * Every number and state is server truth — media failures degrade the
 * stage only, never the session.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { LiveBadge } from '@/components/live/LiveBadge';
import { formatScheduled } from '@/components/live/UpcomingRail';
import { formatCount, formatPrice } from '@/lib/utils/format';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type * as liveService from '@/lib/api/services/live';
import { formatClock } from './hostStreams';
import { useHostBroadcast } from './useHostBroadcast';
import { HostLotBoard } from './HostLotBoard';
import { HostLiveChat } from './HostLiveChat';
import { HostViewerPanel } from './HostViewerPanel';

interface HostBroadcastRoomProps {
  session: LiveSession;
  /** A host token already minted by the console's access probe — the room
   *  reuses it for the first connect instead of minting again. */
  hostToken?: liveService.StreamJoinToken | null;
}

const mediaPill =
  'tnum inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary';

const captureToggle =
  'pressable inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-caption font-semibold transition-colors';

function ElapsedClock({ startedAtMs }: { startedAtMs: number }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
  );
  useEffect(() => {
    const iv = window.setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))),
      1_000,
    );
    return () => window.clearInterval(iv);
  }, [startedAtMs]);
  return <>{formatClock(elapsed)}</>;
}

export function HostBroadcastRoom({ session, hostToken }: HostBroadcastRoomProps) {
  const router = useRouter();
  const broadcast = useHostBroadcast(session, hostToken);
  const {
    phase,
    media,
    mediaError,
    attachPreview,
    goLive,
    goingLive,
    goLiveError,
    endBroadcast,
    ending,
    endError,
    endSummary,
    startedAtMs,
    viewerCount,
    messages,
    chatters,
    send,
    mutedViewers,
    muteViewer,
    unmuteViewer,
    kickViewer,
    micMuted,
    camMuted,
    toggleMic,
    toggleCamera,
    cameraCheck,
    startCameraCheck,
    stopCameraCheck,
    retryMedia,
  } = broadcast;

  const mutedIds = new Set(mutedViewers.map((v) => v.userId));

  // ── Ended — real totals from live.session.ended when the topic
  //    delivered them; otherwise the honest minimum (no fake stats). ──
  if (phase === 'ended') {
    const seconds =
      startedAtMs != null ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : null;
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-success-text">
          <Icon name="check" filled size={28} />
        </span>
        <h1 className="mt-5 text-screen-title text-text-primary">Stream ended</h1>
        <p className="mt-1.5 text-meta text-text-muted">
          {endSummary
            ? 'Final totals from the session record.'
            : 'The show is over — totals appear on the session record.'}
        </p>

        <div className="mt-7 w-full text-left">
          {endSummary ? (
            <>
              <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
                <span className="text-body text-text-secondary">Viewers at close</span>
                <span className="tnum text-body-emphasis font-semibold text-text-primary">
                  {formatCount(endSummary.totalViewers)}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
                <span className="text-body text-text-secondary">Lots sold</span>
                <span className="tnum text-body-emphasis font-semibold text-text-primary">
                  {endSummary.lotsSold}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-b border-border-subtle py-3">
                <span className="text-body text-text-secondary">Total sales</span>
                <span className="tnum text-body-emphasis font-semibold text-text-primary">
                  {formatPrice(endSummary.totalSales)}
                </span>
              </div>
            </>
          ) : null}
          <div className="flex items-baseline justify-between py-3">
            <span className="text-body text-text-secondary">Duration</span>
            <span className="tnum text-body-emphasis font-semibold text-text-primary">
              {seconds != null ? formatClock(seconds) : '—'}
            </span>
          </div>
        </div>

        {session.recordingUrl ? (
          <Link
            href={session.recordingUrl}
            className="pressable mt-2 text-caption font-medium text-text-primary underline-offset-4 hover:underline"
          >
            Watch the recording
          </Link>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => router.push('/live')}
          className="mt-4"
        >
          Done
        </Button>
      </div>
    );
  }

  // ── Backstage — real session, real queue, optional local camera
  //    check. No LiveKit join pre-start: connecting would materialize a
  //    scheduled session's deferred provider room early. ───────────────
  if (phase === 'backstage') {
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
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text-muted">
                    <Icon name="videocam" size={24} />
                  </span>
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

  // ── Live — own published track on stage; the console chrome mirrors
  //    the fixture room's grammar minus every simulated element. ───────
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-12 pt-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/live"
          aria-label="Back to live hub — the show keeps running"
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="clamp-1 min-w-0 flex-1 text-section-title font-semibold text-text-primary">
          {session.title}
        </h1>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void endBroadcast()}
          disabled={ending}
        >
          {ending ? 'Ending…' : 'End stream'}
        </Button>
      </div>
      {endError ? (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          {endError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={attachPreview}
              muted
              playsInline
              autoPlay
              aria-label="Your broadcast preview"
              className={`h-full w-full object-cover ${
                media === 'published' ? '' : 'hidden'
              }`}
            />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
              <LiveBadge />
              <div className="flex items-center gap-1.5">
                {viewerCount != null ? (
                  <span className={mediaPill} aria-label="Viewers">
                    <Icon name="eye" size={12} />
                    {formatCount(viewerCount)}
                  </span>
                ) : null}
                {startedAtMs != null ? (
                  <span className={mediaPill} aria-label="Elapsed time">
                    <Icon name="clock" size={12} />
                    <ElapsedClock startedAtMs={startedAtMs} />
                  </span>
                ) : null}
              </div>
            </div>

            {/* Media states — the session is live regardless; only the
                media plane is degraded when publish fails. */}
            {media !== 'published' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-alt/95 px-6 text-center">
                {media === 'connecting' ? (
                  <>
                    <Spinner size={24} tone="neutral" />
                    <p className="text-caption text-text-secondary">
                      Connecting to the broadcast room…
                    </p>
                  </>
                ) : media === 'requesting' ? (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-text-muted">
                      <Icon name="camera" size={22} />
                    </span>
                    <p className="max-w-xs text-caption text-text-secondary">
                      Waiting for camera &amp; mic access — your browser is
                      asking for permission.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-text-muted">
                      <Icon name="videocam" size={22} />
                    </span>
                    <p className="max-w-xs text-caption text-text-secondary">
                      {mediaError ??
                        'No video is being broadcast — the show is still live for chat and bids.'}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={retryMedia}
                    >
                      Retry camera &amp; mic
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Capture toggles — real track mute/unmute, shown only while a
              publication exists. */}
          {media === 'published' ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-pressed={micMuted}
                onClick={toggleMic}
                className={`${captureToggle} ${
                  micMuted
                    ? 'border-border bg-surface-alt text-text-muted'
                    : 'border-border text-text-primary hover:bg-brand-subtle'
                }`}
              >
                <Icon name="mic" size={14} />
                {micMuted ? 'Mic muted' : 'Mic on'}
              </button>
              <button
                type="button"
                aria-pressed={camMuted}
                onClick={toggleCamera}
                className={`${captureToggle} ${
                  camMuted
                    ? 'border-border bg-surface-alt text-text-muted'
                    : 'border-border text-text-primary hover:bg-brand-subtle'
                }`}
              >
                <Icon name="videocam" size={14} />
                {camMuted ? 'Camera off' : 'Camera on'}
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-meta text-text-muted">
            {media === 'published'
              ? 'Broadcasting — this preview is what viewers see.'
              : 'Live without video — chat, lots and moderation still run.'}
          </p>

          <div className="mt-6">
            <HostLotBoard sessionId={session.id} live />
          </div>
        </div>

        <aside className="flex w-full flex-col gap-6 border-t border-border-subtle pt-5 lg:w-[340px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <HostViewerPanel
            viewerCount={viewerCount}
            chatters={chatters}
            muted={mutedViewers}
            onMute={muteViewer}
            onUnmute={unmuteViewer}
            onKick={kickViewer}
          />
          <HostLiveChat
            messages={messages}
            send={send}
            mutedIds={mutedIds}
            onMute={muteViewer}
            onUnmute={unmuteViewer}
            onKick={kickViewer}
          />
        </aside>
      </div>
    </div>
  );
}
