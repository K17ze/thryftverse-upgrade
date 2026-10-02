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

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { LiveBadge } from '@/components/live/LiveBadge';
import { formatCount } from '@/lib/utils/format';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type * as liveService from '@/lib/api/services/live';
import { useHostBroadcast } from './useHostBroadcast';
import { HostLotBoard } from './HostLotBoard';
import { HostLiveChat } from './HostLiveChat';
import { HostViewerPanel } from './HostViewerPanel';
import { ElapsedClock } from './room/ElapsedClock';
import { HostBroadcastEnded } from './room/HostBroadcastEnded';
import { HostBroadcastBackstage } from './room/HostBroadcastBackstage';

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

export function HostBroadcastRoom({ session, hostToken }: HostBroadcastRoomProps) {
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

  // ── Ended ────────────────────────────────────────────────────────
  if (phase === 'ended') {
    return (
      <HostBroadcastEnded
        session={session}
        endSummary={endSummary}
        startedAtMs={startedAtMs}
      />
    );
  }

  // ── Backstage ────────────────────────────────────────────────────
  if (phase === 'backstage') {
    return (
      <HostBroadcastBackstage
        session={session}
        attachPreview={attachPreview}
        cameraCheck={cameraCheck}
        startCameraCheck={startCameraCheck}
        stopCameraCheck={stopCameraCheck}
        goLive={goLive}
        goingLive={goingLive}
        goLiveError={goLiveError}
      />
    );
  }

  // ── Live ─────────────────────────────────────────────────────────
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
                    <Icon name="camera" size={28} className="text-text-muted" />
                    <p className="max-w-xs text-caption text-text-secondary">
                      Waiting for camera &amp; mic access — your browser is
                      asking for permission.
                    </p>
                  </>
                ) : (
                  <>
                    <Icon name="videocam" size={28} className="text-text-muted" />
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
