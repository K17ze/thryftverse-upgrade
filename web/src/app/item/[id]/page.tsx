/**
 * /item/[id] — PDP server shell. Resolves the listing before the client
 * view mounts: a definitive miss (fixture catalogue miss the session
 * can't own, or a live 404/null) renders not-found.tsx at 404 instead of
 * the old soft-404 EmptyState. 'unresolvable' defers to the client —
 * session-published fixture listings are invisible to the server.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveListingForRoute } from '@/lib/api/server';
import { ItemClient } from './ItemClient';

interface ItemPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveListingForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Listing' };

  const listing = resolution.value;
  const title = listing.brand ? `${listing.brand} — ${listing.title}` : listing.title;
  const description =
    listing.description.length > 200
      ? `${listing.description.slice(0, 197).trimEnd()}…`
      : listing.description;
  const image = listing.images[0];
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: image ? [{ url: image, alt: listing.title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { id } = await params;
  const resolution = await resolveListingForRoute(id);
  if (resolution.status === 'missing') notFound();
  // A resolved listing rides down as the client's query seed — the PDP
  // paints the server's row instead of paying a second render-blocking
  // fetch. 'unresolvable' (session-published fixtures) keeps the
  // client-owned resolution path.
  return (
    <ItemClient
      initialListing={resolution.status === 'resolved' ? resolution.value : undefined}
    />
  );
}
