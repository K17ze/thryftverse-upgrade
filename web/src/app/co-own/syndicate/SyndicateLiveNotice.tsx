'use client';

/**
 * Live-mode stand-in for the whole syndicate surface. No syndicate
 * endpoints exist on the backend, so the routes under /co-own/syndicate
 * render this notice instead of fixture pools — absent beats fabricated.
 * Same posture as ConvertView's capability gate.
 */

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';

export function SyndicateLiveNotice() {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <EmptyState
        icon="people"
        title="Syndicates aren't available in this build"
        subtitle="Group-buy pools ship with the syndicate backend connection."
        actionLabel="Back to markets"
        onAction={() => router.push('/co-own')}
      />
    </div>
  );
}
