import type { Metadata } from 'next';
import { MarketTapeView } from '@/components/coown/MarketTapeView';

export const metadata: Metadata = {
  title: 'Co-Own Market Tape',
  description:
    'The market-wide Co-Own ledger — every execution across every market, newest first.',
};

export default function CoOwnLedgerPage() {
  return <MarketTapeView />;
}
