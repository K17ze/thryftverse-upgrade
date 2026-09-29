/**
 * /galleria/editorial/[id] — server shell. The story resolves before the
 * client view mounts: a definitive miss (fixture miss, or a live 404 —
 * unpublished/moved) renders not-found.tsx at 404 instead of the old
 * soft-404 EmptyState. generateMetadata reads the same resolver —
 * React cache() dedupes the pair per request.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveGalleriaEditorialForRoute } from '@/lib/api/server';
import { GalleriaEditorialClient } from './GalleriaEditorialClient';

interface GalleriaEditorialPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: GalleriaEditorialPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveGalleriaEditorialForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Story' };

  const editorial = resolution.value;
  // Titles are authored with a line break — the share surface wants one line.
  const title = editorial.title.replace('\n', ' ');
  return {
    title,
    description: editorial.dek,
    openGraph: {
      title,
      description: editorial.dek,
      type: 'article',
      images: editorial.heroUri ? [{ url: editorial.heroUri, alt: title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description: editorial.dek },
  };
}

export default async function GalleriaEditorialPage({
  params,
}: GalleriaEditorialPageProps) {
  const { id } = await params;
  const resolution = await resolveGalleriaEditorialForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <GalleriaEditorialClient />;
}
