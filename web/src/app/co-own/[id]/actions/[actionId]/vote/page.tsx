import type { Metadata } from 'next';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { CorporateActionVoteView } from '@/components/coown/actions/CorporateActionVoteView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Live mode must not label a real vote URL with a demo market title.
  const asset = DATA_MODE === 'live' ? undefined : coOwnAssetById(id);
  return {
    title: asset ? `Vote — ${asset.title}` : 'Vote',
    description: 'Cast your ballot on this Co-Own governance resolution.',
  };
}

export default async function CorporateActionVotePage({
  params,
}: {
  params: Promise<{ id: string; actionId: string }>;
}) {
  const { id, actionId } = await params;
  return <CorporateActionVoteView assetId={id} actionId={actionId} />;
}
