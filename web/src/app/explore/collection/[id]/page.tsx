/**
 * /explore/collection/[id] — curated edit server shell. Fixture mode
 * resolves the member-authored record, so a definitive miss renders
 * not-found.tsx at 404; live curated edits are member-gated and the
 * server carries no session, so resolution defers to the client view
 * (members wall for guests, its own not-found for resolved misses).
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveExploreCollectionForRoute } from '@/lib/api/server';
import { CuratedCollectionClient } from './CuratedCollectionClient';

interface CuratedCollectionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: CuratedCollectionPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveExploreCollectionForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Curated collection' };

  const collection = resolution.value;
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

export default async function CuratedCollectionPage({
  params,
}: CuratedCollectionPageProps) {
  const { id } = await params;
  const resolution = await resolveExploreCollectionForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <CuratedCollectionClient />;
}
