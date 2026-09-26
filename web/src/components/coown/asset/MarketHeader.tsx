'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { deriveLifecycleState, type CoOwnAsset } from '@/lib/contracts/coown';
import { LIFECYCLE_LABEL, verificationLabel } from '../format';
import { Avatar } from '@/components/ui/Avatar';

/**
 * Market header — back path, identity block (media, title, issuer row),
 * the price-alert bell and the market-state tags. The lifecycle dot
 * mirrors the hub grammar.
 */
export function MarketHeader({
  asset,
  alertActive = false,
  onOpenAlert,
  watched = false,
  onToggleWatch,
  actions,
}: {
  asset: CoOwnAsset;
  alertActive?: boolean;
  onOpenAlert?: () => void;
  /** Watchlist star — persisted session state, hydrated before render. */
  watched?: boolean;
  onToggleWatch?: () => void;
  /** Trailing slot in the top nav — overflow menus and the like. */
  actions?: React.ReactNode;
}) {
  const tier = asset.issuer.verificationTier;

  return (
    <header>
      <nav aria-label="Back to markets" className="flex items-center justify-between">
        <Link
          href="/co-own"
          className="pressable -ml-2 inline-flex h-11 items-center gap-1 rounded-md px-2 text-body font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="back" size={18} />
          Markets
        </Link>
        <div className="flex items-center">
          {onToggleWatch ? (
            <IconButton
              name="star"
              filled={watched}
              size={20}
              onClick={onToggleWatch}
              aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
              aria-pressed={watched}
              className={watched ? 'text-antique-gold' : undefined}
            />
          ) : null}
          {onOpenAlert ? (
            <IconButton
              name="notifications"
              filled={alertActive}
              size={20}
              onClick={onOpenAlert}
              aria-label={alertActive ? 'Manage price alert' : 'Create price alert'}
              aria-pressed={alertActive}
            />
          ) : null}
          {actions}
        </div>
      </nav>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-4">
          <AppImage
            src={asset.imageUrl}
            alt={asset.title}
            aspectRatio={1}
            sizes="96px"
            className="h-[72px] w-[72px] shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <h1 className="text-editorial-display leading-tight text-text-primary">{asset.title}</h1>
            {asset.subtitle ? <p className="mt-1 text-body text-text-secondary">{asset.subtitle}</p> : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
              <Avatar
                src={asset.issuer.avatar}
                name={asset.issuer.displayName ?? asset.issuer.username}
                size={20}
              />
              <span className="font-semibold text-text-primary">@{asset.issuer.username}</span>
              {tier ? (
                <Icon name="verified" size={13} className="text-commerce-trust" aria-label={tier} />
              ) : null}
              {asset.issuer.location ? (
                <>
                  <span aria-hidden="true" className="text-text-muted">·</span>
                  <span className="truncate">{asset.issuer.location}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <span className="inline-flex items-center gap-1.5 text-meta text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-coown-up" aria-hidden="true" />
            {LIFECYCLE_LABEL[deriveLifecycleState(asset)]}
          </span>
          <span
            className="rounded border border-border-subtle px-1.5 py-0.5 text-micro font-semibold tracking-[0.08em] text-text-muted tnum"
            title="Single-price settlement"
          >
            1ZE
          </span>
        </div>
      </div>

      {tier ? <p className="sr-only">Issuer {verificationLabel(tier)}</p> : null}
    </header>
  );
}
