import type { Metadata } from 'next';
import { PriceAlertsView } from '@/components/coown/PriceAlertsView';

export const metadata: Metadata = {
  title: 'Co-Own Price Alerts',
  description: 'Price alerts you set across Co-Own markets — enable, pause or delete.',
};

export default function CoOwnAlertsPage() {
  return <PriceAlertsView />;
}
