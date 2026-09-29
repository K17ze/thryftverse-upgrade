/**
 * /moodboard/[id] — server shell. Fixture boards resolve statically so a
 * deleted fixture board lands on not-found.tsx at 404. In live mode the
 * server carries no auth (the session lives in localStorage) and the
 * backend folds private boards to 404 for anonymous reads, so a live
 * miss is never a verdict — the client's authenticated query owns it
 * (404 → the view's own not-found state; member/invite → renders).
 * generateMetadata reads the same resolver — React cache() dedupes the
 * pair per request.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DATA_MODE } from '@/lib/api/client';
import { resolveMoodboardForRoute } from '@/lib/api/server';
import { MoodboardClient } from './MoodboardClient';

interface MoodboardPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: MoodboardPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveMoodboardForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Moodboard' };

  // Live boards carry coverImage; fixture boards carry coverUri.
  const board = resolution.value;
  const cover = 'coverImage' in board ? board.coverImage : board.coverUri;
  const description = 'description' in board ? board.description : undefined;
  const title = board.title;
  return {
    title,
    description: description ?? undefined,
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type: 'website',
      images: cover ? [{ url: cover, alt: title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title },
  };
}

export default async function MoodboardPage({ params }: MoodboardPageProps) {
  const { id } = await params;
  const resolution = await resolveMoodboardForRoute(id);
  // Fixture misses are enumerable — a real verdict. Live misses aren't:
  // the session lives in localStorage, so the server reads anonymously and
  // the backend folds private boards to 404 — indistinguishable from a
  // true miss. Private boards (the owner's included) and invite links
  // therefore resolve client-side, where the authed query owns the
  // verdict (404 → the client's own not-found state; member → renders).
  if (resolution.status === 'missing' && DATA_MODE !== 'live') notFound();
  return <MoodboardClient />;
}
