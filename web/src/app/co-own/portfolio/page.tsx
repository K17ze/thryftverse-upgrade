import type { Metadata } from 'next';
import { PortfolioView } from '@/components/coown/PortfolioView';

export const metadata: Metadata = {
  title: 'Co-Own Portfolio',
  description: 'Your Co-Own positions, open orders and distribution history.',
};

export default function CoOwnPortfolioPage() {
  return <PortfolioView />;
}
