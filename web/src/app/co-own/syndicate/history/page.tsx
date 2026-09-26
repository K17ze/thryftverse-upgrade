import type { Metadata } from 'next';
import { SyndicateHistoryView } from '@/components/syndicate/SyndicateHistoryView';

export const metadata: Metadata = {
  title: 'Syndicate activity',
  description:
    'Order and execution history across the syndicates you belong to — contributions, pooled buys and updates.',
};

export default function SyndicateHistoryPage() {
  return <SyndicateHistoryView />;
}
