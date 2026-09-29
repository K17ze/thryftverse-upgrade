/**
 * /auctions/[id] — auction room server shell. Resolves the auction so a
 * closed/removed/bogus id lands on not-found.tsx at 404. Session-created
 * fixture auctions (runtime store) stay 'unresolvable' server-side and
 * resolve in the client view.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveAuctionForRoute } from '@/lib/api/server';
import { AuctionClient } from './AuctionClient';

interface AuctionPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AuctionPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveAuctionForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Auction' };

  const auction = resolution.value;
  const description = `Live auction on ThryftVerse — ${auction.title}.`;
  return {
    title: auction.title,
    description,
    openGraph: {
      title: auction.title,
      description,
      type: 'website',
      images: auction.image ? [{ url: auction.image, alt: auction.title }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: auction.title, description },
  };
}

export default async function AuctionDetailPage({ params }: AuctionPageProps) {
  const { id } = await params;
  const resolution = await resolveAuctionForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <AuctionClient />;
}
