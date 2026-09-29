'use client';

/**
 * Galleria query hooks — live-mode reads for the editorial surfaces.
 * Fixture surfaces stay on the bundled issue; these hooks only run when
 * DATA_MODE === 'live'. /galleria/* is auth-gated server-side, so guests
 * resolve to null — callers hide the module rather than fabricating a
 * promo for content they can't reach.
 */

import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchGalleriaEditorials } from '@/lib/api/services/galleria';
import { useSession } from '@/lib/session/SessionProvider';
import type { GalleriaEditorial } from '@/lib/data/fixtures-media';

const isLive = DATA_MODE === 'live';

/** The current cover story — null in fixture mode (callers use the
 *  bundled hero), and in live mode null for guests, errors and empty
 *  issues. */
export function useGalleriaCover(): { cover: GalleriaEditorial | null } {
  const { isGuest } = useSession();
  const query = useQuery({
    queryKey: ['galleria', 'cover'],
    queryFn: ({ signal }) => fetchGalleriaEditorials(signal).then((list) => list[0] ?? null),
    enabled: isLive && !isGuest,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return { cover: isLive ? (query.data ?? null) : null };
}
