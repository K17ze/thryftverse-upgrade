import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveCoOwnAssetForRoute } from '@/lib/api/server';
import { AssetDetailView } from '@/components/coown/asset/AssetDetailView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const resolution = await resolveCoOwnAssetForRoute(id);
  if (resolution.status !== 'resolved') {
    // Live miss/unresolvable — generic title, never a fixture leak.
    return {
      title: 'Co-Own asset — ThryftVerse',
      description:
        'Fractional ownership units traded like a market, settled 1ZE.',
    };
  }
  const asset = resolution.value;
  return {
    title: asset.title,
    description:
      asset.subtitle ??
      `Co-Own ${asset.title} — fractional units traded like a market, settled 1ZE.`,
    openGraph: {
      title: asset.title,
      images: asset.imageUrl ? [{ url: asset.imageUrl, alt: asset.title }] : undefined,
    },
  };
}

export default async function CoOwnAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resolution = await resolveCoOwnAssetForRoute(id);
  if (resolution.status === 'missing') notFound();
  return <AssetDetailView id={id} />;
}
