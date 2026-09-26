import { Suspense } from 'react';
import { SearchClient } from '@/components/search/SearchClient';
import { MasonrySkeleton } from '@/components/ui/Skeleton';

export const metadata = {
  title: 'Search',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<MasonrySkeleton columns={4} />}>
      <SearchClient />
    </Suspense>
  );
}
