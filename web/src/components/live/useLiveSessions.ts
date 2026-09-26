'use client';

/**
 * Live session query — fixture-mode list in design mode; live mode reads
 * /streaming/sessions on the shared backend, same rows the mobile app maps.
 */

import { useQuery } from '@tanstack/react-query';
import { LIVE_SESSIONS, type LiveSession } from '@/lib/data/fixtures-media';
import { DATA_MODE } from '@/lib/api/client';
import * as liveService from '@/lib/api/services/live';

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

export function useLiveSessions() {
  return useQuery<LiveSession[]>({
    queryKey: ['live-sessions'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        return liveService.fetchLiveSessions();
      }
      await tick();
      return LIVE_SESSIONS;
    },
  });
}
