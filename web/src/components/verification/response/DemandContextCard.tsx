'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import {
  DEMAND_TYPE_GUIDANCE,
  demandTypeIcon,
  demandTypeLabel,
} from '../demandModel';
import { DeadlineBadge } from './DemandResponsePrimitives';

export function DemandContextCard({ demand }: { demand: SellerVerificationDemand }) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-20">
      <div className="mt-4 rounded-lg border border-border-subtle bg-surface p-4 lg:mt-0">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-primary">
            <Icon name={demandTypeIcon(demand.demandType)} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-text-muted">Verification request</p>
            <p className="mt-0.5 text-body-emphasis font-semibold text-text-primary">
              {demandTypeLabel(demand.demandType)}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <DeadlineBadge demand={demand} />
        </div>
        <p className="mt-3 text-body leading-relaxed text-text-secondary">
          {DEMAND_TYPE_GUIDANCE[demand.demandType] ??
            'Provide evidence to verify this asset.'}
        </p>
        <Link
          href={`/co-own/${demand.assetId}`}
          className="pressable mt-3 flex items-center gap-3 border-t border-border-subtle pt-3"
        >
          <AppImage
            src={demand.assetImageUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 overflow-hidden rounded-md"
            fallbackIcon="image"
          />
          <span className="clamp-1 flex-1 text-body text-text-secondary">{demand.assetTitle}</span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>
      </div>
    </aside>
  );
}
