import type { Metadata } from 'next';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';
import { AssetDetailView } from '@/components/coown/asset/AssetDetailView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const asset = coOwnAssetById(id);
  if (!asset) return { title: 'Asset not found' };
  return {
    title: asset.title,
    description:
      asset.subtitle ??
      `Co-Own ${asset.title} — fractional units traded like a market, settled 1ZE.`,
  };
}

export default async function CoOwnAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetDetailView id={id} />;
}
