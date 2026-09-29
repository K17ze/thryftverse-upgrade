import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateFlow } from '@/components/create/CreateFlow';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Create — ThryftVerse',
};

export default function CreatePage() {
  return (
    // The fallback mirrors the entry geometry (title + two destination
    // rows) so the bailout paints structure, not blank.
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-6 sm:px-6" aria-busy aria-label="Loading create">
          <Skeleton className="h-8 w-32" />
          <div className="mt-8 space-y-px">
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
        </div>
      }
    >
      <CreateFlow />
    </Suspense>
  );
}
