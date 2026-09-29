import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { PoolHubView } from '@/components/pools/PoolHubView';
import { PoolLiveNotice } from './PoolLiveNotice';

export const metadata: Metadata = {
  title: 'Pools',
  description:
    'Group-buy pools for shared ownership targets. Pool funds with other members to buy units of one Co-Own asset.',
};

export default function PoolHubPage() {
  // No pool endpoints exist on the backend — in live mode the hub
  // shows the honest notice, never fixture pools presented as real.
  if (DATA_MODE === 'live') return <PoolLiveNotice />;
  return <PoolHubView />;
}
