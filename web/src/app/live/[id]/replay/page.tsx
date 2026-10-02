/**
 * /live/[id]/replay — deep-linkable replay surface, the web counterpart
 * of mobile's LiveStreamReplayScreen. The session resolves before the
 * client view mounts: a live 404 (or a null session row) is a verdict and
 * hits not-found.tsx at 404. A fixture-catalogue miss stays 'unresolvable'
 * — shows authored this session live in the client host store the server
 * can't see, so the client decides. generateMetadata reads the same
 * resolver — React cache() dedupes the pair per request.
 */

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import {
  LIVE_SESSIONS,
  type LiveSession,
} from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { ReplayClient } from './ReplayClient';

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

type ReplayResolution =
  | { status: 'resolved'; session: LiveSession }
  | { status: 'missing' }
  | { status: 'unresolvable' };

/** Tri-state resolver in the lib/api/server.ts grammar, scoped to this
 *  route. A 404 is a verdict; auth walls and transient failures defer the
 *  verdict to the client's session-aware fetch — never a fabricated
 *  gravestone. */
const resolveReplaySession = cache(async (id: string): Promise<ReplayResolution> => {
  if (DATA_MODE === 'live') {
    try {
      const session = await liveService.fetchStreamSession(id);
      return session ? { status: 'resolved', session } : { status: 'missing' };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return { status: 'missing' };
      }
      return { status: 'unresolvable' };
    }
  }
  const session = LIVE_SESSIONS.find((s) => s.id === id);
  if (session) return { status: 'resolved', session };
  // Host-authored demo shows (host-* ids) live in a client module store
  // the server can't see — a fixture miss is only a verdict for ids the
  // catalogue could never have minted.
  return id.startsWith('host-') ? { status: 'unresolvable' } : { status: 'missing' };
});

export async function generateMetadata({
  params,
}: ReplayPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveReplaySession(id);
  if (resolution.status !== 'resolved') return { title: 'Replay' };

  const session = resolution.session;
  const seller = session.sellerName || userById(session.sellerId)?.username;
  const description = seller
    ? `Replay of @${seller}’s live show on ThryftVerse.`
    : 'Replay of a live show on ThryftVerse.';
  return {
    title: `${session.title} · Replay`,
    description,
    openGraph: {
      title: session.title,
      description,
      type: 'video.other',
      images: session.coverUri
        ? [{ url: session.coverUri, alt: session.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: session.title,
      description,
    },
  };
}

export default async function LiveReplayPage({ params }: ReplayPageProps) {
  const { id } = await params;
  const resolution = await resolveReplaySession(id);
  if (resolution.status === 'missing') notFound();
  // A resolved session rides down as the client's query seed — the page
  // paints the server's row instead of paying a second render-blocking
  // fetch. 'unresolvable' keeps the client-owned resolution path.
  return (
    <ReplayClient
      sessionId={id}
      initialSession={
        resolution.status === 'resolved' ? resolution.session : undefined
      }
    />
  );
}
