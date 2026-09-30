'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { INPUT_CLASS } from '@/components/sell/SellField';

export const TEXTAREA_CLASS = `${INPUT_CLASS} h-auto resize-y py-2.5`;

export const STATUS_COPY: Record<
  'draft' | 'published' | 'paused',
  { label: string; variant: 'neutral' | 'success' | 'warning'; line: string }
> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
    line: 'Only you can see this — publish to put it on your shop.',
  },
  published: {
    label: 'Live',
    variant: 'success',
    line: 'Buyers see this on your shop.',
  },
  paused: {
    label: 'Paused',
    variant: 'warning',
    line: 'Hidden from buyers — publish again to bring it back.',
  },
};

export function StorefrontSkeleton() {
  return (
    <div aria-busy aria-label="Loading storefront" className="mt-8 space-y-5">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
