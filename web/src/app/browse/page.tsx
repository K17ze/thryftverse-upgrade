import { Suspense } from 'react';
import { BrowseClient } from '@/components/search/BrowseClient';
import { MasonrySkeleton } from '@/components/ui/Skeleton';

export const metadata = {
  title: 'Browse',
};

export default function BrowsePage() {
  return (
    <Suspense fallback={<MasonrySkeleton columns={4} />}>
      <BrowseClient />
    </Suspense>
  );
}
