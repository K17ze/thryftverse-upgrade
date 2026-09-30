'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';
import type { ManagedListingRow } from '@/components/seller/listingManagementModel';

export type ListingPendingAction =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'mark-sold' }
  | { kind: 'relist' }
  | { kind: 'delete' };

interface ListingManageActionMenuProps {
  listing: Listing;
  status: ManagedListingRow['status'] | null;
  likerCount: number;
  lastOfferCreatedAt?: string | null;
  onShare: () => void;
  onOpenStats: () => void;
  onOpenOffer: () => void;
  onOpenPromote: () => void;
  onOpenPrice: () => void;
  onSelectAction: (action: ListingPendingAction) => void;
}

export function ListingManageActionMenu({
  listing,
  status,
  likerCount,
  lastOfferCreatedAt,
  onShare,
  onOpenStats,
  onOpenOffer,
  onOpenPromote,
  onOpenPrice,
  onSelectAction,
}: ListingManageActionMenuProps) {
  return (
    <div>
      {/* Primary cluster — share / preview / edit as quiet icon row. */}
      <div className="mt-4 flex items-center gap-1 lg:mt-0 lg:border-b lg:border-border-subtle lg:pb-4">
        <Button variant="secondary" size="sm" icon="share" onClick={onShare}>
          Share
        </Button>
        <Link
          href={`/item/${listing.id}`}
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-caption font-medium text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="eye" size={16} />
          Preview
        </Link>
        <Link
          href={`/sell?edit=${listing.id}`}
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-caption font-medium text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="edit" size={16} />
          Edit
        </Link>
      </div>

      {/* Action rows — hairline list, verbs are the affordance. */}
      <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
        <li>
          <button
            type="button"
            onClick={onOpenStats}
            className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
          >
            <span className="flex items-center gap-3">
              <Icon name="analytics" size={18} className="text-text-secondary" />
              <span className="text-body text-text-primary">Listing analytics</span>
            </span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </button>
        </li>
        {status === 'active' ? (
          <li>
            <button
              type="button"
              onClick={onOpenOffer}
              disabled={likerCount === 0}
              className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left disabled:opacity-50"
            >
              <span className="flex items-center gap-3">
                <Icon name="offer" size={18} className="text-text-secondary" />
                <span className="text-body text-text-primary">
                  Send an offer to likers
                  <span className="tnum block text-meta text-text-muted">
                    {likerCount > 0
                      ? `${likerCount} ${likerCount === 1 ? 'person has' : 'people have'} liked this`
                      : 'No likers yet'}
                    {lastOfferCreatedAt
                      ? ` · last sent ${timeAgo(lastOfferCreatedAt)}`
                      : ''}
                  </span>
                </span>
              </span>
              <Icon name="forward" size={16} className="text-text-muted" />
            </button>
          </li>
        ) : null}
        {status === 'active' ? (
          <li>
            <button
              type="button"
              onClick={onOpenPromote}
              className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
            >
              <span className="flex items-center gap-3">
                <Icon name="zap" size={18} className="text-text-secondary" />
                <span className="text-body text-text-primary">Promote this listing</span>
              </span>
              <Icon name="forward" size={16} className="text-text-muted" />
            </button>
          </li>
        ) : null}
        {status === 'active' || status === 'paused' ? (
          <li>
            <button
              type="button"
              onClick={onOpenPrice}
              className="pressable flex w-full items-center justify-between gap-3 py-3.5 text-left"
            >
              <span className="flex items-center gap-3">
                <Icon name="payout" size={18} className="text-text-secondary" />
                <span className="text-body text-text-primary">Change price</span>
              </span>
              <Icon name="forward" size={16} className="text-text-muted" />
            </button>
          </li>
        ) : null}
      </ul>

      {/* Lifecycle — destructive verbs separated, each confirmed. */}
      <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
        {status === 'active' ? (
          <>
            <li>
              <button
                type="button"
                onClick={() => onSelectAction({ kind: 'pause' })}
                className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
              >
                <Icon name="pause" size={18} className="text-text-secondary" />
                Pause listing
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onSelectAction({ kind: 'mark-sold' })}
                className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
              >
                <Icon name="check" size={18} className="text-text-secondary" />
                Mark as sold
              </button>
            </li>
          </>
        ) : null}
        {status === 'paused' ? (
          <li>
            <button
              type="button"
              onClick={() => onSelectAction({ kind: 'resume' })}
              className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
            >
              <Icon name="play" size={18} className="text-text-secondary" />
              Resume — back on sale
            </button>
          </li>
        ) : null}
        {status === 'sold' ? (
          <li>
            <button
              type="button"
              onClick={() => onSelectAction({ kind: 'relist' })}
              className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-text-primary"
            >
              <Icon name="refresh" size={18} className="text-text-secondary" />
              Relist
            </button>
          </li>
        ) : null}
        {status !== 'sold' && status !== 'draft' ? (
          <li>
            <button
              type="button"
              onClick={() => onSelectAction({ kind: 'delete' })}
              className="pressable flex w-full items-center gap-3 py-3.5 text-left text-body text-danger-text"
            >
              <Icon name="trash" size={18} />
              Delete listing
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
