import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { CreatePoolView } from '@/components/pools/CreatePoolView';
import { PoolLiveNotice } from '../PoolLiveNotice';

export const metadata: Metadata = {
  title: 'Start a pool',
  description:
    'Open a group-buy pool: pick a Co-Own asset, set the member cap and contribution rules, invite members to fund the buy.',
};

export default function CreatePoolPage() {
  // No pool endpoints exist on the backend — in live mode the
  // wizard can't create a real pool, so the honest notice stands in.
  if (DATA_MODE === 'live') return <PoolLiveNotice />;
  return <CreatePoolView />;
}
