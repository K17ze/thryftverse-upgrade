import type { Metadata } from 'next';
import { SyndicateHubView } from '@/components/syndicate/SyndicateHubView';

export const metadata: Metadata = {
  title: 'Syndicates',
  description:
    'Group-buy pools for shared ownership targets. Pool funds with other members to buy units of one Co-Own asset.',
};

export default function SyndicateHubPage() {
  return <SyndicateHubView />;
}
