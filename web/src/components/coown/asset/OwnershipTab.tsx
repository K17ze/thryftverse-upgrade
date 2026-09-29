'use client';

/**
 * OwnershipTab — allocation strip (your units / other holders / free float),
 * holders, the issuer card and the rights that come with a unit.
 */

import { useState } from 'react';
import { AllocationBar } from '@/components/charts';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useDistributions,
  useDripEnrollments,
  useSetDripEnrollment,
} from '@/lib/hooks/coown-queries';
import { formatDate } from '@/lib/utils/format';
import type { CoOwnAssetRights } from '@/lib/contracts/coown';
import { ALLOCATION_COLORS, gbp, verificationLabel } from '../format';

/** Published rights-sheet classes — each renders the wire value
 *  verbatim; a null field means the published version is silent on it
 *  and the row stays absent (never rendered as granted). */
const RIGHT_ROWS: {
  key: keyof Pick<
    CoOwnAssetRights,
    'economicRights' | 'votingRights' | 'exitRights' | 'feeRights'
  >;
  icon: AppIconName;
  label: string;
}[] = [
  { key: 'economicRights', icon: 'payout', label: 'Economic rights' },
  { key: 'votingRights', icon: 'people', label: 'Voting rights' },
  { key: 'exitRights', icon: 'exit', label: 'Exit rights' },
  { key: 'feeRights', icon: 'receipt', label: 'Fee rights' },
];

export function OwnershipTab({
  asset,
  position,
}: {
  asset: CoOwnAsset;
  position: { units: number; avgEntryPriceGbp: number } | null;
}) {
  const { isGuest } = useSession();
  const { show } = useToast();
  const yourUnits = position?.units ?? 0;
  const sold = asset.totalUnits - asset.availableUnits;
  const otherHolders = Math.max(0, sold - yourUnits);

  // DRIP — mirrors native AssetOwnershipSection: the toggle only exists
  // for a signed-in holder on an asset that has actually distributed
  // (recipient rows on /co-own/distributions). Live-only record; under
  // fixtures or for guests the row stays hidden rather than dead UI.
  const { data: distributions } = useDistributions(asset.id);
  const dripEnrollmentsQ = useDripEnrollments();
  const setDripEnrollment = useSetDripEnrollment();
  const [dripPending, setDripPending] = useState(false);
  const dripEnrolled =
    dripEnrollmentsQ.data?.find((e) => e.assetId === asset.id)?.enrolled ?? false;
  const showDrip =
    DATA_MODE === 'live' &&
    !isGuest &&
    yourUnits > 0 &&
    (distributions?.items.length ?? 0) > 0;
  const onToggleDrip = async (enrolled: boolean) => {
    if (dripPending) return;
    setDripPending(true);
    const ok = await setDripEnrollment(asset.id, enrolled);
    setDripPending(false);
    if (!ok) show('Could not update the reinvestment setting', 'error');
  };

  // Position lockup — the detail wire's own date; absent means no lockup.
  const lockupEndDate = asset.dossier?.lockupEndDate ?? null;
  const lockupMonths = asset.dossier?.lockupMonths ?? null;
  // The published rights sheet (detail endpoint only). No sheet → an
  // honest "not published" line, never a fabricated grant list.
  const rights = asset.rights ?? null;

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
          {position && position.units > 0
            ? `you hold ${position.units} ${position.units === 1 ? 'unit' : 'units'} at ${gbp(position.avgEntryPriceGbp)} avg`
            : 'you hold no units yet'}
        </p>
        {lockupEndDate ? (
          <p className="mt-2 flex items-center gap-1.5 text-meta text-text-secondary">
            <Icon name="lock" size={14} className="shrink-0 text-text-muted" />
            Lockup until {formatDate(lockupEndDate)}
            {lockupMonths != null ? (
              <span className="text-text-muted"> · {lockupMonths}-month term</span>
            ) : null}
          </p>
        ) : null}

        <h3 className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Holder rights
        </h3>
        {rights ? (
          <>
            <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
              {RIGHT_ROWS.filter((r) => rights[r.key] != null).map((r) => (
                <li key={r.key} className="flex items-start gap-3 py-3">
                  <Icon name={r.icon} size={18} className="mt-0.5 shrink-0 text-text-secondary" />
                  <div className="min-w-0">
                    <p className="text-body text-text-primary">{r.label}</p>
                    <p className="mt-0.5 text-meta text-text-secondary">{rights[r.key]}</p>
                  </div>
                </li>
              ))}
              <li className="flex items-start gap-3 py-3">
                <Icon name="repeat" size={18} className="mt-0.5 shrink-0 text-text-secondary" />
                <div className="min-w-0">
                  <p className="text-body text-text-primary">
                    {rights.transferable ? 'Transferable' : 'Not transferable'}
                  </p>
                  {rights.transferable && rights.minHoldingUnits > 0 ? (
                    <p className="mt-0.5 text-meta text-text-secondary tnum">
                      Min {rights.minHoldingUnits}{' '}
                      {rights.minHoldingUnits === 1 ? 'unit' : 'units'} per transfer
                    </p>
                  ) : null}
                </div>
              </li>
            </ul>
            {rights.tbcReason || rights.tbcEtaDate ? (
              <p className="mt-2 text-meta text-text-muted">
                To be confirmed
                {rights.tbcReason ? ` — ${rights.tbcReason}` : ''}
                {rights.tbcEtaDate ? ` (expected ${formatDate(rights.tbcEtaDate)})` : ''}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-body text-text-secondary">
            No holder-rights sheet is published for this market yet.
          </p>
        )}

        {showDrip ? (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border-subtle pt-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-text-primary">Auto-reinvest</p>
              <p className="mt-0.5 text-meta text-text-muted">
                Reinvest distributions into additional units automatically
              </p>
            </div>
            <Switch
              checked={dripEnrolled}
              onChange={onToggleDrip}
              disabled={dripPending || dripEnrollmentsQ.isLoading}
              aria-label={`Auto-reinvest distributions, currently ${dripEnrolled ? 'on' : 'off'}`}
            />
          </div>
        ) : null}
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
