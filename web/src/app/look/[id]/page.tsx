/**
 * /look/[id] — server shell. The look resolves before the client view
 * mounts: a definitive miss (fixture miss, or a live 404/null) renders
 * not-found.tsx at 404 instead of the old soft-404 EmptyState.
 * generateMetadata reads the same resolver — React cache() dedupes the
 * pair per request.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveLookForRoute } from '@/lib/api/server';
import { LookClient } from './LookClient';

interface LookPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: LookPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveLookForRoute(id);
  if (resolution.status !== 'resolved') return { title: 'Look' };

  const look = resolution.value;
  const title = look.title ?? 'Look on ThryftVerse';
  return {
    title,
    openGraph: {
      title,
      type: 'website',
      images: look.coverImageUri
        ? [{ url: look.coverImageUri, alt: title }]
        : undefined,
    },
    twitter: { card: 'summary_large_image', title },
  };
}

export default async function LookPage({ params }: LookPageProps) {
  const { id } = await params;
  const resolution = await resolveLookForRoute(id);
  if (resolution.status === 'missing') notFound();
  // A resolved look seeds the client's detail query — the view paints
  // the server's row instead of paying a second render-blocking fetch.
  return (
    <LookClient
      initialLook={resolution.status === 'resolved' ? resolution.value : undefined}
    />
  );
}
