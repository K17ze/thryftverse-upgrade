import type { Metadata } from 'next';
import { CreateSyndicateView } from '@/components/syndicate/CreateSyndicateView';

export const metadata: Metadata = {
  title: 'Start a syndicate',
  description:
    'Open a group-buy pool: pick a Co-Own asset, set the member cap and contribution rules, invite members to fund the buy.',
};

export default function CreateSyndicatePage() {
  return <CreateSyndicateView />;
}
