import React from 'react';
import type { User } from '@/lib/contracts/domain';
import { EmptyState } from '@/components/ui/EmptyState';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import {
  OfferRow,
  type OfferRowAction,
} from '@/components/orders/OfferRow';
import type { CommerceOffer } from '@/lib/data/fixtures-commerce';
import type { OfferTab } from './useOffersWorkflow';

export function OffersListContent({
  sessionLoading,
  user,
  offers,
  loadError,
  retryLoad,
  visible,
  tab,
  scopedListingId,
  viewerId,
  nowMs,
  onAction,
  onNavigateAuth,
  onNavigateExplore,
}: {
  sessionLoading: boolean;
  user: User | null;
  offers: CommerceOffer[] | null;
  loadError: boolean;
  retryLoad: () => void;
  visible: CommerceOffer[];
  tab: OfferTab;
  scopedListingId: string | null;
  viewerId: string;
  nowMs: number;
  onAction: (offer: CommerceOffer, action: OfferRowAction) => void;
  onNavigateAuth: () => void;
  onNavigateExplore: () => void;
}) {
  if (sessionLoading) {
    return <RowSkeleton />;
  }

  if (!user) {
    return (
      <EmptyState
        icon="profile"
        title="Sign in to view your offers"
        subtitle="Offers you send and receive are tied to your account."
        actionLabel="Sign in"
        onAction={onNavigateAuth}
      />
    );
  }

  if (offers === null) {
    if (loadError) {
      return (
        <EmptyState
          icon="alert"
          title="Couldn't load offers"
          subtitle="Check your connection and try again — your offers are safe."
          actionLabel="Try again"
          onAction={retryLoad}
        />
      );
    }
    return <RowSkeleton />;
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="offer"
        title={tab === 'received' ? 'No offers received' : 'No offers sent'}
        subtitle={
          scopedListingId
            ? 'No offers on this item yet — clear the filter to see every offer.'
            : tab === 'received'
              ? 'When a buyer offers on your listings, you can accept, decline or counter here.'
              : 'Offers you make on listings show up here so you can track the response.'
        }
        actionLabel="Browse items"
        onAction={onNavigateExplore}
      />
    );
  }

  return (
    <ul className="divide-y divide-border-subtle border-y border-border-subtle">
      {visible.map((offer) => (
        <OfferRow
          key={offer.id}
          offer={offer}
          direction={tab}
          viewerId={viewerId}
          nowMs={nowMs}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}
