'use client';

/**
 * In-show lot queue — live mode only. The web viewer has no realtime
 * channel, so the lot on the table and the run-of-show queue poll on a
 * short interval while a session is open. Fixture/demo sessions have no
 * lot engine behind them; the dock renders nothing there rather than
 * mock a queue (the honest-absence rule).
 */

import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as liveService from '@/lib/api/services/live';

export interface LiveLotBoard {
  /** The lot on the table — null when the host hasn't pinned one. */
  currentLot: liveService.LiveLot | null;
  /** Scheduled lots in position order — the "Next up" source. */
  queue: liveService.LiveLot[];
  /** Lots already settled (sold / passed / cancelled), position order. */
  settled: liveService.LiveLot[];
  isLoading: boolean;
}

export function useLiveLots(sessionId: string | null, sessionIsLive: boolean): LiveLotBoard {
  const enabled = DATA_MODE === 'live' && sessionIsLive && sessionId != null;

  const lotsQuery = useQuery({
    queryKey: ['live-lots', sessionId],
    enabled,
    refetchInterval: 5000,
    queryFn: ({ signal }) => liveService.fetchSessionLots(sessionId as string, signal),
  });
  const currentQuery = useQuery({
    queryKey: ['live-current-lot', sessionId],
    enabled,
    refetchInterval: 2500,
    queryFn: ({ signal }) => liveService.fetchCurrentLot(sessionId as string, signal),
  });

  const lots = lotsQuery.data ?? [];
  return {
    currentLot: currentQuery.data ?? null,
    queue: lots.filter((lot) => lot.status === 'scheduled'),
    settled: lots.filter(
      (lot) => lot.status === 'sold' || lot.status === 'passed' || lot.status === 'cancelled',
    ),
    isLoading: lotsQuery.isLoading && currentQuery.isLoading,
  };
}
