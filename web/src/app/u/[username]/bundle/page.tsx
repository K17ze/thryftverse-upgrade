import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BundleBuilder, BundleBuilderSkeleton } from '@/components/bundle/BundleBuilder';

export const metadata: Metadata = {
  title: 'Build a bundle',
};

export default async function SellerBundlePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    // BundleBuilder reads ?item=<id> via useSearchParams — the boundary is
    // required for prerendering, same as /sell.
    <Suspense fallback={<BundleBuilderSkeleton />}>
      <BundleBuilder username={username} />
    </Suspense>
  );
}
