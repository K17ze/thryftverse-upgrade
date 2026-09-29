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
import { DATA_MODE } from '@/lib/api/client';
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
    <li className="flex items-start gap-3.5 py-3.5">
      <Link
        href={`/item/${listing.id}`}
        className="pressable relative w-20 shrink-0 overflow-hidden rounded-md bg-surface-alt"
        aria-label={listing.title}
      >
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt={listing.title}
          aspectRatio={0.8}
          focalPoint={getCategoryFocalPoint(listing.category)}
          sizes="80px"
          className="w-full transition-transform duration-200 hover:scale-105"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/item/${listing.id}`} className="clamp-2 text-body font-medium text-text-primary hover:underline">
            {listing.title}
          </Link>
          <span className="tnum shrink-0 pt-0.5 text-body-emphasis font-bold text-text-primary">
            {formatPrice(listing.price)}
          </span>
        </div>
        <p className="clamp-1 mt-1 text-caption text-text-secondary">
          {[listing.brand, listing.size ? `Size ${listing.size}` : null, listing.condition]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {listing.likes && listing.likes > 15 ? (
            <span className="inline-flex items-center gap-1 rounded bg-brand-subtle px-1.5 py-0.5 text-[11px] font-medium text-brand">
              <Icon name="heart" size={11} />
              {listing.likes} saves
            </span>
          ) : null}
          {listing.price >= 150 ? (
            <span className="inline-flex items-center gap-1 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
              <Icon name="verified" size={11} className="text-commerce-trust" />
              Auth included
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex min-h-7 items-center gap-4">
          {confirming === null ? (
            <>
              <TextAction onClick={() => setConfirming('save')}>Save for later</TextAction>
              <span className="text-text-muted/40">·</span>
              <TextAction onClick={() => setConfirming('remove')}>Remove</TextAction>
            </>
          ) : confirming === 'save' ? (
            <>
              <span className="text-caption text-text-secondary">Move to Saved items?</span>
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
  const progressPct = Math.min(100, Math.round((group.items.length / BUNDLE_RULE.minItems) * 100));

  const hasMoreStock =
    missing > 0 &&
    bundleSuggestions(
      group.sellerId,
      new Set(group.items.map((i) => i.id)),
      missing,
    ).length >= missing;
  const hintHref = username
    ? `/u/${username}/bundle`
    : `/item/${group.items[0]?.id ?? ''}#bundle`;

  return (
    <section aria-label={username ? `Items from @${username}` : 'Seller items'} className="rounded-xl border border-border-subtle bg-surface p-4 sm:p-5">
      {/* Seller Identity & Location */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          {username ? (
            <Link href={`/u/${username}`} className="pressable shrink-0" aria-label={`@${username}`}>
              <Avatar src={group.seller?.avatar} name={username} size={32} />
            </Link>
          ) : null}
          <div>
            <h2 className="text-body-emphasis font-bold text-text-primary">
              {username ? `@${username}` : 'Seller'}{' '}
              <span className="tnum text-caption font-normal text-text-muted">
                · {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                {group.items.length > 1 ? ' · post together' : ''}
              </span>
            </h2>
            <p className="text-meta text-text-muted">
              {group.seller?.location ?? 'United Kingdom'} · Dispatches in 24–48h
            </p>
          </div>
        </div>

        {/* Bundle-discount chrome is fixture-only — the backend charges
            listing price in full per item, so live never claims a % off. */}
        {DATA_MODE !== 'live' && group.qualifies ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-caption font-semibold text-success-text">
            <Icon name="check" size={14} />
            {pctLabel} bundle discount applied
          </span>
        ) : DATA_MODE !== 'live' && hasMoreStock ? (
          <Link
            href={hintHref}
            className="pressable inline-flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1 text-caption font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary"
          >
            Add {missing} more for {pctLabel} off
            <Icon name="forward" size={12} />
          </Link>
        ) : null}
      </header>

      {/* Interactive Bundle Progress Meter — exists only to sell the
          fixture BUNDLE_RULE; live mode never offers the discount. */}
      {DATA_MODE !== 'live' ? (
      <div className="my-2 rounded-lg bg-surface-alt/60 p-2.5">
        <div className="flex items-center justify-between text-caption font-medium">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Icon name="pricetag" size={14} className={group.qualifies ? 'text-success-text' : 'text-brand'} />
            {group.qualifies
              ? `Bundle discount unlocked (${BUNDLE_RULE_LABEL})`
              : `Add ${missing} more ${missing === 1 ? 'item' : 'items'} from this seller to get ${pctLabel} off`}
          </span>
          <span className="tnum text-text-muted">
            {group.items.length} / {BUNDLE_RULE.minItems} items
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
          <div
            className={`h-full transition-all duration-300 ${
              group.qualifies ? 'bg-success-text' : 'bg-brand'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      ) : null}

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

      {DATA_MODE !== 'live' && group.qualifies ? (
        <div className="flex justify-between pt-3 text-caption">
          <span className="flex items-center gap-1.5 font-medium text-text-secondary">
            <Icon name="pricetag" size={14} className="text-success-text" />
            Bundle savings ({BUNDLE_RULE_LABEL})
          </span>
          <span className="tnum font-bold text-success-text">−{formatPrice(group.discount)}</span>
        </div>
      ) : null}
    </section>
  );
}
