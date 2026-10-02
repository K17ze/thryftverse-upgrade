'use client';

import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import type { LiveRoomEndSummary } from '@/components/live/useLiveRoom';
import type { HostBroadcastPhase } from './broadcastTypes';

export interface UseHostLifecycleParams {
  sessionId: string | null;
  initialPhase: HostBroadcastPhase;
  initialStartedAt?: string | null;
  connectAndPublish: () => Promise<void>;
  appendSystemLine: (id: string, text: string) => void;
  qc: QueryClient;
}

export function useHostLifecycle({
  sessionId,
  initialPhase,
  initialStartedAt,
  connectAndPublish,
  appendSystemLine,
  qc,
}: UseHostLifecycleParams) {
  const [phase, setPhase] = useState<HostBroadcastPhase>(initialPhase);
  const [goingLive, setGoingLive] = useState(false);
  const [goLiveError, setGoLiveError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [endSummary, setEndSummary] = useState<LiveRoomEndSummary | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() =>
    initialStartedAt ? Date.parse(initialStartedAt) : null,
  );

  const goLive = useCallback(async () => {
    if (!sessionId || goingLive || phase !== 'backstage') return;
    setGoingLive(true);
    setGoLiveError(null);
    try {
      const started = await liveService.startStreamSession(sessionId);
      setStartedAtMs(
        started.startedAt ? Date.parse(started.startedAt) : Date.now(),
      );
      setPhase('live');
      void qc.invalidateQueries({ queryKey: ['live-sessions'] });
      appendSystemLine(
        `${sessionId}-went-live`,
        'You went live — viewers can chat now',
      );
      await connectAndPublish();
    } catch (error) {
      setGoLiveError(
        parseApiError(error, 'Could not go live — try again.').message,
      );
    } finally {
      setGoingLive(false);
    }
  }, [
    sessionId,
    goingLive,
    phase,
    qc,
    appendSystemLine,
    connectAndPublish,
  ]);

  const endBroadcast = useCallback(async () => {
    if (!sessionId || ending || phase !== 'live') return;
    setEnding(true);
    setEndError(null);
    try {
      await liveService.endStreamSession(sessionId);
    } catch (error) {
      setEndError(
        parseApiError(
          error,
          'End of stream could not be confirmed — check before going live again.',
        ).message,
      );
      setEnding(false);
      return;
    }
    setPhase('ended');
    void qc.invalidateQueries({ queryKey: ['live-sessions'] });
    setEnding(false);
  }, [sessionId, ending, phase, qc]);

  return {
    phase,
    setPhase,
    goingLive,
    goLiveError,
    ending,
    endError,
    endSummary,
    setEndSummary,
    startedAtMs,
    goLive,
    endBroadcast,
  };
}
