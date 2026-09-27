import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { syndicateById } from '@/lib/data/fixtures-syndicate';
import { SyndicateDetailView } from '@/components/syndicate/SyndicateDetailView';
import { SyndicateLiveNotice } from '../SyndicateLiveNotice';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // Fixture pool names are demo data — never leak them into live metadata.
  if (DATA_MODE === 'live') return { title: 'Syndicates' };
  const { id } = await params;
  const syndicate = syndicateById(id);
  if (!syndicate) return { title: 'Syndicate not found' };
  return {
    title: syndicate.name,
    description: `${syndicate.name} — a group-buy pool targeting ${syndicate.unitsTarget} units, ${syndicate.members.length}/${syndicate.memberCap} members.`,
  };
}

export default async function SyndicateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (DATA_MODE === 'live') return <SyndicateLiveNotice />;
  return <SyndicateDetailView id={id} />;
}
