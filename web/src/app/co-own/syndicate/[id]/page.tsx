import type { Metadata } from 'next';
import { syndicateById } from '@/lib/data/fixtures-syndicate';
import { SyndicateDetailView } from '@/components/syndicate/SyndicateDetailView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
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
  return <SyndicateDetailView id={id} />;
}
