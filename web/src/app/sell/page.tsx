import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellFlow } from '@/components/sell/SellFlow';

export const metadata: Metadata = {
  title: 'Sell an item — ThryftVerse',
};

export default function SellPage() {
  return (
    // SellFlow reads ?edit=<id> via useSearchParams — boundary required for
    // prerendering; the flow composes itself once params resolve.
    <Suspense fallback={null}>
      <SellFlow />
    </Suspense>
  );
}
