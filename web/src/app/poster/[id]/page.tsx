/**
 * /poster/[id] — server shell. The story resolves before the client view
 * mounts: a definitive miss (fixture miss across feed posters, archive
 * stories and rail entries, or a live 404/null) renders not-found.tsx at
 * 404 instead of the old soft-404 EmptyState. generateMetadata reads the
 * same resolver — React cache() dedupes the pair per request.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePosterForRoute } from '@/lib/api/server';
import { PosterClient } from './PosterClient';

interface PosterPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PosterPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolvePosterForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Poster' };

  // The resolver's value unions four poster shapes (feed poster, archive
  // story, rail entry, live story) — extract the share image + caption
  // without importing the union into the shell.
  const value = resolution.value;
  const caption =
    ('caption' in value ? value.caption : undefined) ??
    ('frames' in value ? value.frames[0]?.caption : undefined) ??
    undefined;
  const image =
    'coverUri' in value
      ? value.coverUri
      : 'frames' in value && value.frames[0]
        ? 'posterUrl' in value.frames[0] && value.frames[0].posterUrl
          ? value.frames[0].posterUrl
          : value.frames[0].mediaUrl
        : undefined;
  const title = caption ?? 'Poster on ThryftVerse';
  return {
    title,
    openGraph: {
      title,
      type: 'website',
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title },
  };
}

export default async function PosterPage({ params }: PosterPageProps) {
  const { id } = await params;
  const resolution = await resolvePosterForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <PosterClient />;
}
