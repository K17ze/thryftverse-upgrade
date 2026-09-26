'use client';

/**
 * OwnershipTab — allocation strip (your units / other holders / free float),
 * holders, the issuer card and the rights that come with a unit.
 */

import { AllocationBar } from '@/components/charts';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { ALLOCATION_COLORS, gbp, verificationLabel } from '../format';

const RIGHTS: { icon: 'payout' | 'wallet' | 'auction' | 'scan'; text: string }[] = [
  { icon: 'payout', text: 'Pro-rata resale proceeds' },
  { icon: 'wallet', text: 'Income distributions' },
  { icon: 'auction', text: 'Exit vote' },
  { icon: 'scan', text: 'Authentication oversight' },
];

export function OwnershipTab({
  asset,
  position,
}: {
  asset: CoOwnAsset;
  position: { units: number; avgEntryPriceGbp: number } | null;
}) {
  const yourUnits = position?.units ?? 0;
  const sold = asset.totalUnits - asset.availableUnits;
  const otherHolders = Math.max(0, sold - yourUnits);

  const segments = [
    yourUnits > 0
      ? { label: 'Your units', pct: (yourUnits / asset.totalUnits) * 100, color: ALLOCATION_COLORS[0]! }
      : null,
    otherHolders > 0
      ? { label: 'Other holders', pct: (otherHolders / asset.totalUnits) * 100, color: ALLOCATION_COLORS[1]! }
      : null,
    {
      label: 'Available',
      pct: (asset.availableUnits / asset.totalUnits) * 100,
      color: ALLOCATION_COLORS[2]!,
    },
  ].filter((s): s is { label: string; pct: number; color: string } => s != null && s.pct > 0);

  const tierLabel = verificationLabel(asset.issuer.verificationTier);

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Allocation
        </h3>
        <div className="mt-3">
          <AllocationBar segments={segments} />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-text-secondary">
          {segments.map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="tnum">{Math.round(s.pct)}%</span> {s.label}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-meta text-text-secondary tnum">
          {asset.holders} {asset.holders === 1 ? 'holder' : 'holders'} ·{' '}
          {position
            ? `you hold ${position.units} ${position.units === 1 ? 'unit' : 'units'} at ${gbp(position.avgEntryPriceGbp)} avg`
            : 'you hold no units yet'}
        </p>

        <h3 className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Holder rights
        </h3>
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {RIGHTS.map((right) => (
            <li key={right.text} className="flex items-center gap-3 py-3">
              <Icon name={right.icon} size={18} className="shrink-0 text-text-secondary" />
              <span className="text-body text-text-primary">{right.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Issuer
        </h3>
        <div className="mt-3 flex items-start gap-3.5">
          <Avatar
            src={asset.issuer.avatar}
            name={asset.issuer.displayName ?? asset.issuer.username}
            size={48}
          />
          <div className="min-w-0">
            <p className="text-body-emphasis font-semibold text-text-primary">
              {asset.issuer.displayName ?? `@${asset.issuer.username}`}
            </p>
            <p className="mt-0.5 text-meta text-text-secondary">@{asset.issuer.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tierLabel ? (
                <Badge variant="trust" icon="verified">
                  {tierLabel}
                </Badge>
              ) : null}
              {asset.issuer.location ? (
                <span className="inline-flex items-center gap-1 text-meta text-text-secondary">
                  <Icon name="location" size={13} />
                  {asset.issuer.location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {asset.issuerJurisdiction ? (
          <p className="mt-4 text-meta text-text-muted">
            Issued from {asset.issuerJurisdiction}. Units settle 1ZE — one price, one clearing.
          </p>
        ) : null}
      </div>
    </div>
  );
}
