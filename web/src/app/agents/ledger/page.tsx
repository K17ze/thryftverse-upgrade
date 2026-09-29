'use client';

import { Suspense } from 'react';
import { AgentLedgerView } from '@/components/agents';
import { Skeleton } from '@/components/ui/Skeleton';

export default function AgentLedgerPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16 lg:max-w-[1440px]">
      {/* AgentLedgerView reads its deep-link params via useSearchParams —
          the fallback mirrors the ledger-row geometry so the bailout
          paints structure, not blank. */}
      <Suspense
        fallback={
          <div className="divide-y divide-border-subtle" aria-busy aria-label="Loading ledger">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        }
      >
        <AgentLedgerView />
      </Suspense>
    </div>
  );
}
