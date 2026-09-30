import React from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { HighlightsRail } from '@/components/profile/HighlightsRail';
import { ShopRail } from '@/components/profile/ShopRail';
import { formatDate } from '@/lib/utils/format';
import type { User } from '@/lib/contracts/domain';
import type { PublicProfile } from '@/lib/api/services/users';

const CLOSET_BANNER_MIN = 10;

export function ProfileInfoBanners({
  user,
  aggregate,
  closetVisible,
  closetListingsLength,
  closetThumbs,
  showMosaic,
}: {
  user: User;
  aggregate?: PublicProfile | null;
  closetVisible: boolean;
  closetListingsLength: number;
  closetThumbs: string[];
  showMosaic: boolean;
}) {
  const away = aggregate?.away ?? null;
  const trader = aggregate?.trader ?? null;
  const storefront = aggregate?.storefront ?? null;

  return (
    <>
      {/* Away banner — the aggregate is the authoritative, privacy-aware
          away source (mobile UserProfileHeader grammar). Informational;
          buy/offer CTAs are gated at the listing level. */}
      {away?.holidayMode === true ? (
        <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-alt px-4 py-3 sm:mx-6">
          <Icon name="pause" size={18} className="mt-0.5 shrink-0 text-text-muted" />
          <div className="min-w-0">
            <p className="text-body-emphasis font-semibold text-text-primary">
              This shop is on holiday
            </p>
            <p className="mt-0.5 text-meta text-text-muted">
              {away.awayMessage?.trim() ||
                'The seller is away right now. Listings are paused and will return when they are back.'}
            </p>
            {away.holidayModeUntil ? (
              <p className="mt-0.5 text-meta text-text-muted">
                Back {formatDate(away.holidayModeUntil)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Storefront announcement — the seller's shop greeting. Plain text
          with spacing, no decorative container (native grammar). */}
      {storefront?.announcement?.trim() ? (
        <p className="mx-4 mt-4 text-body text-text-primary sm:mx-6">
          {storefront.announcement.trim()}
        </p>
      ) : null}

      {/* DSA Art. 30 trader disclosure — legally required in EU/UK.
          Factual meta rows under a hairline; legal details only render
          for classified traders (mobile UserProfileHeader). */}
      {trader ? (
        <div className="mx-4 mt-3 border-t border-border-subtle pt-2.5 sm:mx-6">
          <p className="text-meta font-semibold text-text-primary">
            {trader.classification === 'trader' ? 'Business seller' : 'Private seller'}
          </p>
          {trader.classification === 'trader' ? (
            <>
              {trader.legalName ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.legalName}</p>
              ) : null}
              {trader.address ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.address}</p>
              ) : null}
              {trader.registrationNumber ? (
                <p className="mt-0.5 text-meta text-text-muted">
                  Reg: {trader.registrationNumber}
                </p>
              ) : null}
              {trader.vatNumber ? (
                <p className="mt-0.5 text-meta text-text-muted">VAT: {trader.vatNumber}</p>
              ) : null}
              {trader.contactEmail ? (
                <p className="mt-0.5 text-meta text-text-muted">{trader.contactEmail}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* Story highlights — public per-member list, independent of the
          closet's visibility/depth. */}
      <HighlightsRail ownerId={user.id} />

      {closetVisible ? <ShopRail ownerId={user.id} /> : null}

      {/* Closet banner — only when the closet is deep enough to browse and
          the mosaic hero isn't already serving the same destination. */}
      {closetVisible && closetListingsLength >= CLOSET_BANNER_MIN && !showMosaic ? (
        <Link
          href={`/collection/closet-${user.id}`}
          className="pressable mx-4 mt-4 flex items-center justify-between gap-3 border-y border-border-subtle py-3 sm:mx-6"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex shrink-0 -space-x-2">
              {closetThumbs.map((src, i) => (
                <span
                  key={i}
                  className="relative h-7 w-7 overflow-hidden rounded-md ring-2 ring-background"
                >
                  <AppImage src={src} alt="" fill sizes="28px" className="h-full w-full" />
                </span>
              ))}
            </span>
            <span className="clamp-1 text-body text-text-secondary">
              Browse the full closet —{' '}
              <span className="tnum font-semibold text-text-primary">
                {closetListingsLength} items
              </span>
            </span>
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      ) : null}
    </>
  );
}
