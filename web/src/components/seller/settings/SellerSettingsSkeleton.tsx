'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function SellerSettingsSkeleton() {
  return (
    <div aria-busy aria-label="Loading shop settings" className="mt-8 space-y-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
