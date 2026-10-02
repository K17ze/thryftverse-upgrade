'use client';

/**
 * StorefrontPreviewAside — the lg live-preview rail for the storefront
 * editor (the SellFeedPreviewAside grammar): shop head, announcement,
 * pinned items and policy lines as buyers will see them, updating with
 * every edit. Flat hairline sections, no fake-device chrome.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import { STATUS_COPY } from './StorefrontPrimitives';

interface StorefrontPreviewAsideProps {
  username: string | null;
  avatar: string | null;
  status: 'draft' | 'published' | 'paused';
  announcement: string;
  shipping: string;
  returnsPolicy: string;
  additional: string;
  /** Picked listings in pin order — the rail's own display order. */
  featured: Listing[];
}

export function StorefrontPreviewAside({
  username,
  avatar,
  status,
  announcement,
  shipping,
  returnsPolicy,
  additional,
  featured,
}: StorefrontPreviewAsideProps) {
  const statusCopy = STATUS_COPY[status];
  const policies = [
    { label: 'Shipping', text: shipping.trim() },
    { label: 'Returns', text: returnsPolicy.trim() },
    { label: 'Policies', text: additional.trim() },
  ].filter((p) => p.text);

  return (
    <aside className="sticky top-24 hidden lg:block" aria-label="Shop preview">
      <p className="text-label text-text-muted">Shop preview</p>
      <div className="mt-3 border-y border-border-subtle">
        {/* Shop head — the identity buyers land on. */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle py-3">
          <AppImage
            src={avatar}
            alt={username ? `${username}'s avatar` : 'Your avatar'}
            sizes="28px"
            className="h-7 w-7 shrink-0 rounded-full"
            fallbackIcon="profile"
          />
          <p className="clamp-1 min-w-0 flex-1 text-body-emphasis font-semibold text-text-primary">
            {username ? `@${username}` : 'Your shop'}
          </p>
          <Badge variant={statusCopy.variant}>{statusCopy.label}</Badge>
        </div>

        {/* Announcement — the pinned note, exactly the saved copy. */}
        <div className="border-b border-border-subtle py-3">
          {announcement.trim() ? (
            <p className="clamp-2 whitespace-pre-line text-body text-text-secondary">
              {announcement.trim()}
            </p>
          ) : (
            <p className="text-meta text-text-muted">No announcement pinned.</p>
          )}
        </div>

        {/* Featured — picked order is the shop's display order. */}
        <div className={`py-3 ${policies.length ? 'border-b border-border-subtle' : ''}`}>
          <p className="text-label text-text-muted">Featured</p>
          {featured.length > 0 ? (
            <ul className="mt-2.5 grid grid-cols-4 gap-2">
              {featured.map((listing) => (
                <li key={listing.id}>
                  <AppImage
                    src={getListingCoverUri(listing.images)}
                    alt={listing.title}
                    aspectRatio={1}
                    sizes="80px"
                    className="rounded-md"
                  />
                  <p className="clamp-1 mt-1 text-caption text-text-secondary">
                    {listing.title}
                  </p>
                  <p className="tnum text-meta text-text-muted">
                    {formatPrice(listing.price)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-meta text-text-muted">
              Nothing pinned — featured items lead the shop.
            </p>
          )}
        </div>

        {/* Policy lines — first line of each is what the shop shows. */}
        {policies.length > 0 ? (
          <dl className="py-2">
            {policies.map((p) => (
              <div
                key={p.label}
                className="flex items-baseline justify-between gap-3 py-1"
              >
                <dt className="shrink-0 text-meta text-text-muted">{p.label}</dt>
                <dd className="clamp-1 min-w-0 text-right text-meta text-text-secondary">
                  {p.text}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <p className="mt-3 text-caption leading-relaxed text-text-muted">
        Updates as you edit — this is what buyers see on your shop.
      </p>
      {username ? (
        <Link
          href={`/u/${username}`}
          className="pressable mt-3 inline-flex items-center gap-1.5 text-caption font-semibold text-text-primary hover:text-text-secondary"
        >
          View live shop
          <Icon name="forward" size={12} className="text-text-muted" />
        </Link>
      ) : null}
    </aside>
  );
}
