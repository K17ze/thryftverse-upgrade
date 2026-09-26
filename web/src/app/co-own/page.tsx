import type { Metadata } from 'next';
import { CoOwnHubView } from '@/components/coown/CoOwnHubView';

export const metadata: Metadata = {
  title: 'Co-Own',
  description:
    'Fractional ownership of collectible fashion. Buy units, earn distributions, exit by vote or sale — traded like a market.',
};

export default function CoOwnPage() {
  return <CoOwnHubView />;
}
