'use client';

/**
 * HostConsole — /live/host/[id] dispatcher. Fixture mode keeps the
 * in-memory demo console (HostStream runtime store → scheduled/live/ended
 * simulation, labelled "Demo"); live mode hands the route param to
 * HostBroadcastConsole, which resolves the real session row and runs the
 * real broadcast room (host LiveKit token → camera/mic publish → chat,
 * lots, moderation, lifecycle). The two never share a path — a fixture id
 * never reaches the backend and a backend row never simulates.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useMyListings } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { Icon } from '@/components/ui/Icon';
import {
  endHostStream,
  getHostStream,
  goLiveHostStream,
  setHostStreamPins,
  type HostStream,
  type HostSummaryStats,
} from './hostStreams';
import { HostGate } from './HostGate';
import { HostBroadcastConsole } from './HostBroadcastConsole';
import { HostLiveRoom } from './HostLiveRoom';
import { HostScheduledRoom } from './HostScheduledRoom';
import { HostSummary } from './HostSummary';

interface HostConsoleProps {
  streamId: string;
}

function ConsoleSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6" aria-busy aria-label="Loading host console">
      <div className="skeleton h-7 w-64 rounded-md" />
      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="skeleton aspect-[16/9] w-full rounded-xl" />
          <div className="skeleton mt-6 h-20 w-full rounded-lg" />
        </div>
        <div className="skeleton h-64 w-full rounded-lg lg:w-[340px]" />
      </div>
    </div>
  );
}

export function HostConsole({ streamId }: HostConsoleProps) {
  // Live mode resolves the real session row and runs the real broadcast
  // console — fixture runtime stores never see a backend id, and the live
  // console never simulates. DATA_MODE is a build-time constant, so the
  // branch is stable for a given deploy.
  if (DATA_MODE === 'live') {
    return <HostBroadcastConsole streamId={streamId} />;
  }
  return <FixtureHostConsole streamId={streamId} />;
}

/** Fixture demo console — unchanged: in-memory shows, simulated stage,
 *  deterministic chat. Only reachable when DATA_MODE === 'fixture'. */
function FixtureHostConsole({ streamId }: HostConsoleProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const { isGuest } = useSession();
  const { data: listings } = useMyListings();

  const [stream, setStream] = useState<HostStream | null>(null);
  const [resolved, setResolved] = useState(false);
  const [goingLive, setGoingLive] = useState(false);

  // Resolve post-mount — the runtime store only exists client-side.
  useEffect(() => {
    setStream(getHostStream(streamId));
    setResolved(true);
  }, [streamId]);

  /** Re-render after a store mutation — same record, fresh references. */
  const refresh = () =>
    setStream((s) =>
      s ? { ...s, session: { ...s.session }, pinIds: [...s.pinIds] } : s,
    );

  const handleGoLive = () => {
    setGoingLive(true);
    window.setTimeout(() => {
      goLiveHostStream(qc, streamId);
      setGoingLive(false);
      refresh();
    }, 500);
  };

  const handlePinsChange = (pinIds: string[]) => {
    setHostStreamPins(streamId, pinIds);
    refresh();
  };

  const handleEnd = (stats: HostSummaryStats) => {
    endHostStream(qc, streamId, stats);
    refresh();
  };

  if (isGuest) return <HostGate />;
  if (!resolved) return <ConsoleSkeleton />;

  if (!stream) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-text-muted">
          <Icon name="videocam" size={26} />
        </span>
        <h1 className="mt-5 text-screen-title text-text-primary">
          This console isn&apos;t available
        </h1>
        <p className="mt-2 max-w-sm text-body text-text-secondary">
          Demo streams live for the session — a reload or another device won&apos;t carry them.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <Link
            href="/live/create"
            className="pressable text-body font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            Start a show
          </Link>
          <Link
            href="/live"
            className="pressable text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Back to live hub
          </Link>
        </div>
      </div>
    );
  }

  if (stream.session.status === 'ended') {
    return <HostSummary stream={stream} onDone={() => router.push('/live')} />;
  }

  if (stream.session.status === 'upcoming') {
    return (
      <HostScheduledRoom stream={stream} onGoLive={handleGoLive} goingLive={goingLive} />
    );
  }

  const candidates = (listings ?? []).filter((l) => !l.isSold && l.status !== 'sold');

  return (
    <HostLiveRoom
      stream={stream}
      candidates={candidates}
      onPinsChange={handlePinsChange}
      onEnd={handleEnd}
    />
  );
}
