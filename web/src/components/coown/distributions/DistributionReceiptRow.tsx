'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { DistributionReceipt } from '@/lib/contracts/coown';
import {
  distributionKindLabel,
  distributionStatusLabel,
  distributionStatusVariant,
  gbp,
} from '../format';

export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ReceiptRow({
  receipt: r,
  title,
}: {
  receipt: DistributionReceipt;
  title: string;
}) {
  return (
    <li>
      {/* Mobile — stacked */}
      <div className="flex items-start justify-between gap-3 py-4 md:hidden">
        <div className="min-w-0">
          <Link
            href={`/co-own/${r.assetId}`}
            className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-meta text-text-secondary">{distributionKindLabel(r)}</p>
          <p className="mt-1.5 text-meta text-text-muted tnum">
            {r.unitsHeld} units @ {gbp(r.amountPerUnitGbp)} · ex {shortDate(r.exDate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-body-emphasis font-semibold text-text-primary tnum">{gbp(r.totalGbp)}</p>
          <Badge variant={distributionStatusVariant(r.status)} className="mt-1">
            {r.status === 'settled' || r.status === 'paid'
              ? `Paid ${shortDate(r.paidAt)}`
              : distributionStatusLabel(r.status)}
          </Badge>
        </div>
      </div>

      {/* Desktop — grid row */}
      <div className="hidden items-center gap-4 px-1 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6rem_7rem_7rem_6.5rem]">
        <div className="min-w-0">
          <Link
            href={`/co-own/${r.assetId}`}
            className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-meta text-text-muted">{distributionKindLabel(r)}</p>
        </div>
        <p className="text-right text-body text-text-primary tnum">{gbp(r.amountPerUnitGbp)}</p>
        <p className="text-right text-body text-text-secondary tnum">{r.unitsHeld}</p>
        <p className="text-right text-body font-semibold text-text-primary tnum">{gbp(r.totalGbp)}</p>
        <p className="text-right text-body text-text-secondary tnum">{shortDate(r.exDate)}</p>
        <p className="text-right text-body text-text-secondary tnum">{shortDate(r.paidAt)}</p>
        <p className="text-right">
          <Badge variant={distributionStatusVariant(r.status)}>
            {distributionStatusLabel(r.status)}
          </Badge>
        </p>
      </div>
    </li>
  );
}
