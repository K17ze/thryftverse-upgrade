import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { SyndicateHubView } from '@/components/syndicate/SyndicateHubView';
import { SyndicateLiveNotice } from './SyndicateLiveNotice';

export const metadata: Metadata = {
  title: 'Syndicates',
  description:
    'Group-buy pools for shared ownership targets. Pool funds with other members to buy units of one Co-Own asset.',
};

export default function SyndicateHubPage() {
  // No syndicate endpoints exist on the backend — in live mode the hub
  // shows the honest notice, never fixture pools presented as real.
  if (DATA_MODE === 'live') return <SyndicateLiveNotice />;
  return <SyndicateHubView />;
}
