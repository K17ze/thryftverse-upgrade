import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/coown/LeaderboardView';

export const metadata: Metadata = {
  title: 'Co-Own Leaderboard',
  description:
    'Every Co-Own market ranked — price, period move, 24h volume, holders and allocation, with per-market sparklines.',
};

export default function CoOwnLeaderboardPage() {
  return <LeaderboardView />;
}
