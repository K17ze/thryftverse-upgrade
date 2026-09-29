import type { Metadata } from 'next';
import { coOwnAssetById } from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { BuyoutView } from '@/components/coown/buyout/BuyoutView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // Live mode resolves the asset client-side — fixture titles must not
  // stamp a real buyout link's metadata.
  const asset = DATA_MODE === 'live' ? undefined : coOwnAssetById(id);
  if (!asset) return { title: 'Buyout' };
  return {
    title: `Buyout — ${asset.title}`,
    description: `Offer to acquire the remaining units of ${asset.title} from current holders.`,
  };
}

export default async function BuyoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BuyoutView id={id} />;
}
