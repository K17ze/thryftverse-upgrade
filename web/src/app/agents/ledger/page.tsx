'use client';

import { Suspense } from 'react';
import { AgentLedgerView } from '@/components/agents';

export default function AgentLedgerPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <Suspense fallback={null}>
        <AgentLedgerView />
      </Suspense>
    </div>
  );
}
