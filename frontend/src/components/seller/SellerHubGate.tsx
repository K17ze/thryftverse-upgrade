/**
 * SellerHubGate — the full-surface fallback rendered before the hub has a
 * usable overview:
 *   loading → SellerHubSkeleton while the initial load is in flight
 *   error   → retryable FlagshipState when the overview fetch failed
 *             with no data to show
 *   empty   → "no store data yet" with a list-an-item escape hatch
 *
 * Once an overview exists, none of these can reappear — a failed refresh
 * degrades rails inline, never tears down the surface.
 */

import React from 'react';
import { FlagshipScreen, FlagshipHeader, FlagshipState, SellerHubSkeleton } from '../flagship';

export type SellerHubGatePhase = 'loading' | 'error' | 'empty';

export interface SellerHubGateProps {
  phase: SellerHubGatePhase;
  onBack: () => void;
  onRetry: () => void;
  onListItem: () => void;
}

export const SellerHubGate: React.FC<SellerHubGateProps> = ({ phase, onBack, onRetry, onListItem }) => (
  <FlagshipScreen
    header={<FlagshipHeader title="Seller Hub" onBack={onBack} />}
    scrollEnabled={false}
  >
    {phase === 'loading' ? (
      <SellerHubSkeleton />
    ) : phase === 'error' ? (
      <FlagshipState
        variant="error"
        title="Couldn't load your store"
        subtitle="Check your network connection and retry."
        actionLabel="Retry"
        onAction={onRetry}
      />
    ) : (
      <FlagshipState
        variant="empty"
        title="No store data yet"
        subtitle="Start selling to see your store"
        actionLabel="List an item"
        onAction={onListItem}
      />
    )}
  </FlagshipScreen>
);
