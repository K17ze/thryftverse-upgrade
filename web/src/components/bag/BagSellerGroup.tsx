'use client';

/**
 * BagSellerGroup — one seller's slice of the bag: an identity header,
 * hairline-separated line items, and a "Bundle discount" ledger line when
 * the group meets BUNDLE_RULE. Groups that fall short get a quiet "add N
 * more" nudge instead — the rule is visible, never fabricated.
 *
 * Destructive-ish moves (remove, move-to-saved) confirm inline inside the
 * row — a one-line question with labelled Keep/confirm actions, never a
 * window.confirm.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { BUNDLE_RULE, BUNDLE_RULE_LABEL, type SellerGroup } from '@/lib/data/fixtures';
import { bundleSuggestions } from '@/lib/data/fixtures-commerce';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

const pctLabel = `${Math.round(BUNDLE_RULE.discountPct * 100)}%`;

/** The quiet text-action grammar shared by the idle and confirming states. */
function TextAction({
  onClick,
  tone = 'default',
  children,
}: {
  onClick: () => void;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable -my-1.5 rounded-sm py-2 text-caption font-medium ${
        tone === 'danger' ? 'text-danger-text hover:text-danger-text' : 'text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One line item — thumb, 2-line title, brand · size · condition meta, and
 * quiet text actions. Remove / move-to-saved swap the action row for an
 * inline confirm strip; nothing here opens a browser dialog.
 */
function BagLineItem({
  listing,
  onRemove,
  onSaveForLater,
}: {
  listing: Listing;
  onRemove: () => void;
  onSaveForLater: () => void;
}) {
  const [confirming, setConfirming] = useState<'remove' | 'save' | null>(null);

  return (
    <li className="flex items-start gap-3 py-3">
      <Link
        href={`/item/${listing.id}`}
        className="pressable w-16 shrink-0 overflow-hidden rounded-md"
        aria-label={listing.title}
      >
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt={listing.title}
          aspectRatio={0.8}
          focalPoint={getCategoryFocalPoint(listing.category)}
          sizes="64px"
          className="w-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/item/${listing.id}`} className="clamp-2 text-body font-medium text-text-primary hover:underline">
          {listing.title}
        </Link>
        <p className="clamp-1 mt-0.5 text-caption text-text-secondary">
          {[listing.brand, listing.size ? `Size ${listing.size}` : null, listing.condition]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-2 flex min-h-8 items-center gap-4">
          {confirming === null ? (
            <>
              <TextAction onClick={() => setConfirming('save')}>Save for later</TextAction>
              <TextAction onClick={() => setConfirming('remove')}>Remove</TextAction>
            </>
          ) : confirming === 'save' ? (
            <>
              <span className="text-caption text-text-secondary">Move to Saved?</span>
              <TextAction onClick={onSaveForLater}>Move</TextAction>
              <TextAction onClick={() => setConfirming(null)}>Keep in bag</TextAction>
            </>
          ) : (
            <>
              <span className="text-caption text-text-secondary">Remove from bag?</span>
              <TextAction tone="danger" onClick={onRemove}>
                Remove
              </TextAction>
              <TextAction onClick={() => setConfirming(null)}>Keep</TextAction>
            </>
          )}
        </div>
      </div>
      <span className="tnum shrink-0 pt-px text-body-emphasis text-text-primary">
        {formatPrice(listing.price)}
      </span>
    </li>
  );
}

export function BagSellerGroup({
  group,
  onRemove,
  onSaveForLater,
}: {
  group: SellerGroup;
  onRemove: (listingId: string) => void;
  onSaveForLater: (listingId: string) => void;
}) {
  const username = group.seller?.username ?? null;
  const missing = Math.max(0, BUNDLE_RULE.minItems - group.items.length);
  // Only dangle the "add one more" link when the seller actually has
  // other active stock — a hint to an empty shelf isn't one.
  const hasMoreStock =
    missing === 1 &&
    bundleSuggestions(group.sellerId, new Set(group.items.map((i) => i.id)), 1)
      .length > 0;
  const hintHref = username
    ? `/u/${username}`
    : `/item/${group.items[0]?.id ?? ''}#bundle`;

  return (
    <section aria-label={username ? `Items from @${username}` : 'Seller items'}>
      <header className="flex items-center gap-2.5 pb-1">
        {username ? (
          <Link href={`/u/${username}`} className="pressable shrink-0" aria-label={`@${username}`}>
            <Avatar src={group.seller?.avatar} name={username} size={28} />
          </Link>
        ) : null}
        <h2 className="min-w-0 flex-1 text-body-emphasis text-text-primary">
          {username ? `@${username}` : 'Seller'}{' '}
          <span className="tnum text-caption font-normal text-text-muted">
            · {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
            {/* Combined postage — only claimed where the parcel truly
                combines (2+ items); a single item has nothing to combine. */}
            {group.items.length > 1 ? ' · post together' : ''}
          </span>
        </h2>
        {group.qualifies ? (
          <span className="flex shrink-0 items-center gap-1 text-caption font-medium text-success-text">
            <Icon name="check" size={14} />
            {pctLabel} bundle discount
          </span>
        ) : missing > 1 ? (
          <span className="shrink-0 text-caption text-text-muted">
            Add {missing} more · save {pctLabel}
          </span>
        ) : null}
      </header>

      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {group.items.map((item) => (
          <BagLineItem
            key={item.id}
            listing={item}
            onRemove={() => onRemove(item.id)}
            onSaveForLater={() => onSaveForLater(item.id)}
          />
        ))}
      </ul>

      {group.qualifies ? (
        <div className="flex justify-between py-2.5 text-caption">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Icon name="pricetag" size={14} className="text-success-text" />
            Bundle discount ({BUNDLE_RULE_LABEL})
          </span>
          <span className="tnum font-semibold text-success-text">−{formatPrice(group.discount)}</span>
        </div>
      ) : hasMoreStock ? (
        <p className="py-2.5 text-caption">
          <Link
            href={hintHref}
            className="pressable inline-flex items-center gap-1 font-medium text-text-secondary hover:text-text-primary"
          >
            Add 1 more for {pctLabel} off
            <Icon name="forward" size={13} />
          </Link>
        </p>
      ) : null}
    </section>
  );
}
