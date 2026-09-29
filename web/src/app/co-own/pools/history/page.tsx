import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { PoolHistoryView } from '@/components/pools/PoolHistoryView';
import { PoolLiveNotice } from '../PoolLiveNotice';

export const metadata: Metadata = {
  title: 'Pool activity',
  description:
    'Order and execution history across the pools you belong to — contributions, pooled buys and updates.',
};

export default function PoolHistoryPage() {
  if (DATA_MODE === 'live') return <PoolLiveNotice />;
  return <PoolHistoryView />;
}
