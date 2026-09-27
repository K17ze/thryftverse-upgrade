import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { SyndicateHistoryView } from '@/components/syndicate/SyndicateHistoryView';
import { SyndicateLiveNotice } from '../SyndicateLiveNotice';

export const metadata: Metadata = {
  title: 'Syndicate activity',
  description:
    'Order and execution history across the syndicates you belong to — contributions, pooled buys and updates.',
};

export default function SyndicateHistoryPage() {
  if (DATA_MODE === 'live') return <SyndicateLiveNotice />;
  return <SyndicateHistoryView />;
}
