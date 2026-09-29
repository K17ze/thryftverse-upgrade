/**
 * /galleria/collection/[id] — server shell. The edit resolves before the
 * client view mounts: a definitive miss (fixture catalogue miss, or a
 * live 404/null) renders not-found.tsx at 404 instead of the old
 * soft-404 EmptyState. generateMetadata reads the same resolver —
 * React cache() dedupes the pair per request, so live mode makes one
 * backend call, not two.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveGalleriaCollectionForRoute } from '@/lib/api/server';
import { GalleriaCollectionClient } from './GalleriaCollectionClient';

interface GalleriaCollectionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: GalleriaCollectionPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveGalleriaCollectionForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Collection' };

  // Fixture mode resolves the collection row; live mode resolves the
  // detail payload — same title/dek/cover either way.
  const value = resolution.value;
  const collection = 'collection' in value ? value.collection : value;
  const title = collection.title;
  return {
    title,
    description: collection.dek,
    openGraph: {
      title,
      description: collection.dek,
      type: 'website',
      images: collection.coverUri
        ? [{ url: collection.coverUri, alt: title }]
        : undefined,
    },
    twitter: { card: 'summary_large_image', title, description: collection.dek },
  };
}

export default async function GalleriaCollectionPage({
  params,
}: GalleriaCollectionPageProps) {
  const { id } = await params;
  const resolution = await resolveGalleriaCollectionForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <GalleriaCollectionClient />;
}
