'use client';

import Link from 'next/link';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import type { CoOwnAsset } from '@/lib/contracts/coown';

interface DripSectionProps {
  dripAssets: CoOwnAsset[];
  dripByAsset: Map<string, boolean>;
  onSetDrip: (assetId: string, enrolled: boolean) => Promise<boolean>;
}

export function DripSection({
  dripAssets,
  dripByAsset,
  onSetDrip,
}: DripSectionProps) {
  const { show } = useToast();

  if (dripAssets.length === 0) return null;

  return (
    <section aria-labelledby="drip-heading" className="mt-8">
      <h2
        id="drip-heading"
        className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
      >
        Reinvest income (DRIP)
      </h2>
      <p className="mt-1 text-meta text-text-secondary">
        Distributions on enrolled markets buy more units automatically.
      </p>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {dripAssets.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/co-own/${a.id}`}
                className="pressable clamp-1 block text-body font-semibold text-text-primary"
              >
                {a.title}
              </Link>
              <p className="mt-0.5 text-meta text-text-muted">
                {dripByAsset.get(a.id) ? 'Enrolled — payouts buy units' : 'Payouts settle to 1ZE'}
              </p>
            </div>
            <Switch
              checked={dripByAsset.get(a.id) ?? false}
              onChange={(enrolled) => {
                void onSetDrip(a.id, enrolled).then((ok) =>
                  show(
                    ok
                      ? enrolled
                        ? `${a.title} enrolled — next payout reinvests`
                        : `${a.title} unenrolled — payouts settle to 1ZE`
                      : "Couldn't update reinvestment — try again",
                    ok ? 'success' : 'error',
                  ),
                );
              }}
              aria-label={`Reinvest income for ${a.title}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
