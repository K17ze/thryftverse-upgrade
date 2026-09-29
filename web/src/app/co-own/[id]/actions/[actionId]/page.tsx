import type { Metadata } from 'next';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { CorporateActionDetailView } from '@/components/coown/actions/CorporateActionDetailView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Live mode must not leak a fixture asset title into a real action's metadata.
  const asset = DATA_MODE === 'live' ? undefined : coOwnAssetById(id);
  return {
    title: asset ? `Corporate action — ${asset.title}` : 'Corporate action',
    description: 'Corporate action record — resolution, tally and voting deadline.',
  };
}

export default async function CorporateActionPage({
  params,
}: {
  params: Promise<{ id: string; actionId: string }>;
}) {
  const { id, actionId } = await params;
  return <CorporateActionDetailView assetId={id} actionId={actionId} />;
}
