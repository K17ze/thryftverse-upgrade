'use client';

/**
 * Live session query — fixture-mode list in design mode; live mode reads
 * /streaming/sessions on the shared backend, same rows the mobile app maps.
 */

import { useQuery } from '@tanstack/react-query';
import { LIVE_SESSIONS, type LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
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
    // Server truth on a poll — the room's viewer_count and live→ended
    // transitions reach the hub and the open overlay on this cadence;
    // the SSE channel is the fast path for presence while watching.
    refetchInterval: DATA_MODE === 'live' ? 15_000 : false,
  });
}

/** Normalized seller identity for a session. Live rows carry the host
 *  projection (sellerName/avatar/verified) mapped straight off the
 *  backend room — no fixture lookup can resolve a real user id, so live
 *  sessions with no host name render no seller row at all. Fixture rows
 *  resolve through USERS. */
export function liveSellerOf(session: LiveSession) {
  if (session.sellerName) {
    return {
      username: session.sellerName,
      avatar: session.sellerAvatar ?? null,
      isVerified: session.sellerVerified === true,
      followers: null as number | null,
    };
  }
  if (DATA_MODE === 'live') return null;
  const u = userById(session.sellerId);
  return u
    ? {
        username: u.username,
        avatar: u.avatar,
        isVerified: u.isVerified,
        followers: u.followers,
      }
    : null;
}
