import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellFlow } from '@/components/sell/SellFlow';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = {
  title: 'Sell an item — ThryftVerse',
};

export default function SellPage() {
  return (
    // SellFlow reads ?edit=<id> via useSearchParams — boundary required for
    // prerendering; the flow composes itself once params resolve. The
    // fallback mirrors the flow's geometry (media stage + fields) so the
    // bailout paints structure, not blank.
    <Suspense
      fallback={
        <div className="mx-auto max-w-[860px] px-4 pb-16 pt-6 sm:px-6" aria-busy aria-label="Loading sell flow">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-5 aspect-[4/3] w-full rounded-xl" />
          <div className="mt-6 space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        </div>
      }
    >
      <SellFlow />
    </Suspense>
  );
}
