import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CoOwnOrdersView } from '@/components/coown/CoOwnOrdersView';

export const metadata: Metadata = {
  title: 'Co-Own Orders',
  description:
    'Your Co-Own order ledger — resting buys and sells plus the settled history, across every market.',
};

export default function CoOwnOrdersPage() {
  return (
    <Suspense>
      <CoOwnOrdersView />
    </Suspense>
  );
}
