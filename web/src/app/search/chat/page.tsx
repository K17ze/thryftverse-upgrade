import { Suspense } from 'react';
import { ConvSearchClient } from '@/components/convsearch/ConvSearchClient';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata = {
  title: 'Conversational search',
};

export default function ConversationalSearchPage() {
  return (
    // ConvSearchClient reads the thread param via useSearchParams — the
    // fallback mirrors the chat geometry (prompt block + message bubbles)
    // so the bailout paints structure, not blank.
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-16 pt-8 sm:px-6" aria-busy aria-label="Loading search">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="mt-4 h-16 w-3/4 rounded-xl" />
          <Skeleton className="h-12 w-2/3 rounded-xl" />
        </div>
      }
    >
      <ConvSearchClient />
    </Suspense>
  );
}
