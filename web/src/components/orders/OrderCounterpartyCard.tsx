'use client';

/**
 * OrderCounterpartyCard — renders the buyer or seller identity row:
 * avatar, username, verification badge, rating, message button, and profile link.
 */

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';

export interface CounterpartyView {
  id: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  rating: number | null;
}

interface OrderCounterpartyCardProps {
  counterparty: CounterpartyView | null;
  isLoading: boolean;
  isBuyer: boolean;
  onMessage: () => void;
}

export function OrderCounterpartyCard({
  counterparty,
  isLoading,
  isBuyer,
  onMessage,
}: OrderCounterpartyCardProps) {
  if (!counterparty && DATA_MODE === 'live' && isLoading) {
    return (
      <section className="flex items-center gap-3 border-b border-border-subtle py-4" aria-busy>
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      </section>
    );
  }

  if (!counterparty) return null;

  return (
    <section className="flex items-center gap-3 border-b border-border-subtle py-4">
      <Link
        href={`/u/${counterparty.username}`}
        aria-label={`Open @${counterparty.username}'s profile`}
        className="pressable flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar src={counterparty.avatar} name={counterparty.username} size={40} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-body font-medium text-text-primary">
            <span className="clamp-1">@{counterparty.username}</span>
            {counterparty.isVerified ? (
              <Icon name="verified" size={12} className="shrink-0 text-commerce-trust" />
            ) : null}
          </span>
          <span className="mt-0.5 block text-caption text-text-secondary">
            {isBuyer ? 'Seller' : 'Buyer'}
            {counterparty.rating != null ? (
              <>
                {' · '}
                <span className="tnum">{counterparty.rating.toFixed(1)}</span> rating
              </>
            ) : null}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onMessage}
        className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
      >
        Message
      </button>
      <Link
        href={`/u/${counterparty.username}`}
        className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
      >
        View profile
      </Link>
    </section>
  );
}
