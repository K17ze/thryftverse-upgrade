'use client';

import { AlgorithmView } from '@/components/agents';

export default function YourAlgorithmPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <h1 className="sr-only">Your algorithm</h1>
      <AlgorithmView />
    </div>
  );
}
