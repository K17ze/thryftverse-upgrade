'use client';

/**
 * /pulse — vertical short-form commerce feed. Full-bleed media cards in
 * a snap-scroll column: creator posts, live auctions, fresh drops and
 * price drops derived from real fixtures (mobile PulseFeedScreen model).
 * Media is images — honest fixture mode, no fabricated video chrome.
 */

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { buildPulseFeed } from '@/components/pulse/pulseModel';
import { PulseFeed } from '@/components/pulse/PulseFeed';
import { PulseFeedSkeleton } from '@/components/pulse/PulseFeedSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

function usePulseFeed() {
  return useQuery({
    queryKey: ['pulse-feed'],
    queryFn: async () => {
      await tick();
      return buildPulseFeed();
    },
    staleTime: 60_000,
  });
}

export default function PulsePage() {
  const router = useRouter();
  const { data: cards, isLoading, isError, refetch } = usePulseFeed();

  if (isLoading) return <PulseFeedSkeleton />;

  // Last-good wins over the error panel: a failed refetch keeps the
  // populated feed on screen (FRESH-02) — the error state is only for a
  // no-content failure.
  if (isError && (!cards || cards.length === 0)) {
    return (
      <EmptyState
        icon="warning"
        title="Couldn't load Pulse"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <EmptyState
        icon="feed"
        title="The marketplace is quiet"
        subtitle="Check back soon for live auctions, fresh drops and new creator posts."
        actionLabel="Browse all"
        onAction={() => router.push('/explore')}
      />
    );
  }

  return <PulseFeed cards={cards} />;
}
