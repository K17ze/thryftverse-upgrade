import type { Metadata } from 'next';
import { DATA_MODE } from '@/lib/api/client';
import { CreateSyndicateView } from '@/components/syndicate/CreateSyndicateView';
import { SyndicateLiveNotice } from '../SyndicateLiveNotice';

export const metadata: Metadata = {
  title: 'Start a syndicate',
  description:
    'Open a group-buy pool: pick a Co-Own asset, set the member cap and contribution rules, invite members to fund the buy.',
};

export default function CreateSyndicatePage() {
  // No syndicate endpoints exist on the backend — in live mode the
  // wizard can't create a real pool, so the honest notice stands in.
  if (DATA_MODE === 'live') return <SyndicateLiveNotice />;
  return <CreateSyndicateView />;
}
